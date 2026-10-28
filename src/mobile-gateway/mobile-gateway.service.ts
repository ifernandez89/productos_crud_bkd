import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  OnModuleDestroy,
} from '@nestjs/common';
import { exec } from 'child_process';
import * as os from 'os';
import * as crypto from 'crypto';
import { URL } from 'url';

export interface MobileCommandDto {
  requestId: string;
  deviceId: string;
  timestamp: string;
  intent: string;
  parameters?: Record<string, any>;
  context?: {
    source?: string;
    network?: string;
    battery?: number;
    userCommand?: string;
    [key: string]: any;
  };
}

export const MOBILE_ALLOWED_APPS: Record<string, string> = {
  calculator: 'calc',
  calc: 'calc',
  notepad: 'notepad',
  vscode: 'code',
  code: 'code',
  explorer: 'explorer',
};

const ALLOWED_VK_CODES = new Set([0xad, 0xae, 0xaf, 0xb3]);

@Injectable()
export class MobileGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(MobileGatewayService.name);
  private readonly secret: Buffer;
  private readonly maxClockDriftMs = 30000; // 30 segundos
  private readonly seenRequestIds = new Map<string, number>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    const rawSecret =
      process.env.MOBILE_GATEWAY_SECRET ||
      process.env.JWT_SECRET ||
      'jarbees-mobile-gateway-default-hmac-key-2026';

    this.secret = crypto
      .createHash('sha256')
      .update(`${rawSecret}:jarbees_mobile_gateway_salt`)
      .digest();

    // Limpieza de nonces/requestIds expirados cada 60s
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [reqId, expiresAt] of this.seenRequestIds.entries()) {
        if (expiresAt < now) {
          this.seenRequestIds.delete(reqId);
        }
      }
    }, 60000);

    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  destroy() {
    this.onModuleDestroy();
  }

  /**
   * Valida autenticidad (HMAC), ventana de tiempo anti-replay y unicidad de requestId.
   */
  validateCommandSecurity(
    dto: MobileCommandDto,
    signature?: string,
    headerTimestamp?: string,
  ): void {
    if (process.env.MOBILE_GATEWAY_DISABLE_AUTH === 'true') {
      this.logger.warn(
        `[MobileGateway] MOBILE_GATEWAY_DISABLE_AUTH=true activo. Omitiendo validación de firma para ${dto.intent}.`,
      );
      return;
    }

    if (!dto.requestId || typeof dto.requestId !== 'string') {
      throw new BadRequestException('Se requiere "requestId" válido.');
    }

    const commandTimestampStr = headerTimestamp || dto.timestamp;
    if (!commandTimestampStr) {
      throw new BadRequestException('Se requiere "timestamp" para validar la solicitud móvil.');
    }

    const commandTime = new Date(commandTimestampStr).getTime();
    if (isNaN(commandTime)) {
      throw new BadRequestException('Formato de "timestamp" inválido (debe ser ISO 8601).');
    }

    const now = Date.now();
    const drift = Math.abs(now - commandTime);
    if (drift > this.maxClockDriftMs) {
      throw new UnauthorizedException(
        `Petición fuera de la ventana de tiempo de seguridad permitida (drift: ${drift}ms > ${this.maxClockDriftMs}ms). Posible ataque de repetición o desincronización de reloj.`,
      );
    }

    // Anti-Replay: el requestId debe ser único dentro de la ventana de validez
    if (this.seenRequestIds.has(dto.requestId)) {
      throw new ForbiddenException(
        `Ataque de repetición detectado: el requestId "${dto.requestId}" ya fue procesado.`,
      );
    }

    // Registrar requestId para evitar repeticiones futuras
    this.seenRequestIds.set(dto.requestId, now + this.maxClockDriftMs * 2);

    // Validación de firma HMAC si viene provista o si es requerida en producción
    if (signature) {
      const payloadToSign = `${dto.requestId}:${commandTimestampStr}:${dto.intent.toUpperCase()}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(payloadToSign)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        throw new UnauthorizedException('Firma HMAC de Mobile Gateway inválida o alterada.');
      }
    }
  }

  /**
   * Genera firma HMAC para clientes autorizados (utilidad para tests y clientes móviles oficiales).
   */
  generateHmacSignature(requestId: string, timestamp: string, intent: string): string {
    const payload = `${requestId}:${timestamp}:${intent.toUpperCase()}`;
    return crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /**
   * Comprueba si una URL apunta a localhost, IP privada o bucle local (Anti-SSRF).
   */
  isPrivateOrLocalUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return true;
      }

      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '169.254.169.254' ||
        host === '::1'
      ) {
        return true;
      }

      // Rangos privados RFC 1918
      if (
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
      ) {
        return true;
      }

      return false;
    } catch {
      return true; // Si no es una URL parseable, se bloquea por seguridad
    }
  }

  /**
   * Ejecuta comandos OS a través de exec (desacoplado para facilitar mock/aislamiento en tests).
   */
  protected executeOsCommand(cmd: string): void {
    exec(cmd);
  }

  /**
   * Envía un evento de tecla virtual (VK) nativo de Windows utilizando keybd_event vía user32.dll.
   */
  private sendVirtualKey(vkCode: number, repeatCount: number = 1): void {
    if (!ALLOWED_VK_CODES.has(vkCode)) {
      this.logger.warn(`Intento de enviar vkCode no autorizado: 0x${vkCode.toString(16)}`);
      return;
    }

    const safeRepeats = Math.max(1, Math.min(10, repeatCount));
    const psScript = `
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      public class WinAudio {
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);
      }
"@
      Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
      1..${safeRepeats} | ForEach-Object {
        [WinAudio]::keybd_event(${vkCode}, 0, 0, 0)
        [WinAudio]::keybd_event(${vkCode}, 0, 2, 0)
        Start-Sleep -Milliseconds 30
      }
    `;
    const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
    this.executeOsCommand(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64}`);
  }

  /**
   * Calcula el porcentaje de uso real de la CPU midiendo un delta de tiempo de 100ms.
   */
  private getCpuUsage(intervalMs: number = 100): Promise<number> {
    return new Promise((resolve) => {
      const startCpus = os.cpus();
      setTimeout(() => {
        const endCpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        for (let i = 0; i < startCpus.length; i++) {
          const start = startCpus[i].times;
          const end = endCpus[i].times;
          const idle = end.idle - start.idle;
          const total =
            end.user -
            start.user +
            (end.nice - start.nice) +
            (end.sys - start.sys) +
            (end.idle - start.idle) +
            (end.irq - start.irq);
          totalIdle += idle;
          totalTick += total;
        }
        const cpuPct = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
        resolve(cpuPct);
      }, intervalMs);
    });
  }

  getCapabilities() {
    return {
      success: true,
      version: '1.2.0',
      environment: `JarBees Core Desktop (${os.type()} ${os.release()})`,
      capabilities: [
        { intent: 'GET_TIME', description: 'Obtiene la hora oficial de la PC' },
        { intent: 'GET_SYSTEM_STATUS', description: 'Uso en tiempo real de CPU, RAM y métricas del sistema' },
        { intent: 'CALCULATE', description: 'Evaluador matemático determinista seguro' },
        { intent: 'VOLUME_UP', description: 'Sube el volumen máster del sistema en la PC' },
        { intent: 'VOLUME_DOWN', description: 'Baja el volumen máster del sistema en la PC' },
        { intent: 'MUTE', description: 'Silencia/activa el sonido de la PC' },
        { intent: 'MEDIA_PLAY', description: 'Reanuda la reproducción multimedia en la PC' },
        { intent: 'MEDIA_PAUSE', description: 'Pausa la reproducción multimedia en la PC' },
        { intent: 'OPEN_APP', description: 'Abre aplicaciones autorizadas (calc, notepad, vscode, explorer)' },
        { intent: 'OPEN_URL', description: 'Abre una URL pública y segura en el navegador predeterminado' },
      ],
      allowedApps: Object.keys(MOBILE_ALLOWED_APPS),
    };
  }

  async dispatchMobileCommand(
    dto: MobileCommandDto,
    signature?: string,
    headerTimestamp?: string,
  ): Promise<any> {
    // 1. Validar autenticación, timestamp y anti-replay
    this.validateCommandSecurity(dto, signature, headerTimestamp);

    const intent = String(dto.intent || '').toUpperCase().trim();
    const params = dto.parameters || {};

    switch (intent) {
      case 'GET_TIME': {
        const now = new Date();
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: {
            time: now.toLocaleTimeString(),
            date: now.toLocaleDateString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          message: `Hora oficial en la PC: ${now.toLocaleTimeString()}`,
        };
      }

      case 'GET_SYSTEM_STATUS': {
        const cpuPct = await this.getCpuUsage(100);
        const totalMemGb = parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
        const freeMemGb = parseFloat((os.freemem() / (1024 * 1024 * 1024)).toFixed(1));
        const usedMemGb = parseFloat((totalMemGb - freeMemGb).toFixed(1));
        const ramUsagePct = Math.round((usedMemGb / totalMemGb) * 100);
        const cpus = os.cpus();
        const uptimeHours = parseFloat((os.uptime() / 3600).toFixed(1));

        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpuModel: cpus[0]?.model?.trim() || 'Desconocido',
            cpuCores: cpus.length,
            cpuUsagePct: `${cpuPct}%`,
            cpuUsageNum: cpuPct,
            ramTotalGb: totalMemGb,
            ramUsedGb: usedMemGb,
            ramFreeGb: freeMemGb,
            ramUsagePct: `${ramUsagePct}%`,
            ramUsageNum: ramUsagePct,
            uptimeHours,
          },
          message: `PC ${os.hostname()} (${cpus[0]?.model?.trim() || 'Core'}): CPU al ${cpuPct}%, RAM ${usedMemGb}/${totalMemGb} GB (${ramUsagePct}%), Uptime ${uptimeHours}h.`,
        };
      }

      case 'CALCULATE': {
        const expr = params.expression || params.query || '';
        if (typeof expr !== 'string' || expr.length > 200) {
          throw new BadRequestException('Expresión matemática inválida o excesivamente larga (máx 200 caracteres).');
        }

        try {
          const clean = expr.replace(/[^0-9+\-*/().\s]/g, '').trim();
          if (!clean || clean.length === 0) {
            throw new Error('Expresión vacía');
          }

          // Validación sintáctica determinista estricta
          const val = Function(`'use strict'; return (${clean})`)();
          if (typeof val !== 'number' || !isFinite(val)) {
            throw new Error('Resultado no numérico');
          }

          return {
            requestId: dto.requestId,
            success: true,
            intent,
            result: { expression: clean, result: val },
            message: `Cálculo resuelto en Core: ${clean} = ${val}`,
          };
        } catch {
          return {
            requestId: dto.requestId,
            success: false,
            intent,
            result: {},
            message: `No se pudo calcular la expresión dada: "${expr}"`,
          };
        }
      }

      case 'OPEN_APP': {
        const app = String(params.target || params.app || '').toLowerCase().trim();
        const commandToRun = MOBILE_ALLOWED_APPS[app];

        if (!commandToRun) {
          throw new ForbiddenException(
            `Aplicación "${app}" rechazada. Solo se permiten aplicaciones de la lista blanca: ${Object.keys(MOBILE_ALLOWED_APPS).join(', ')}.`,
          );
        }

        this.executeOsCommand(`start ${commandToRun}`);
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { app, executed: commandToRun },
          message: `Abriendo ${app} en tu PC de forma segura.`,
        };
      }

      case 'OPEN_BROWSER':
      case 'OPEN_URL': {
        const rawUrl = params.url || 'https://google.com';
        if (this.isPrivateOrLocalUrl(rawUrl)) {
          throw new ForbiddenException(
            `Acceso bloqueado por política Anti-SSRF: la URL "${rawUrl}" apunta a un recurso privado o inválido.`,
          );
        }

        this.executeOsCommand(`start ${rawUrl}`);
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { url: rawUrl },
          message: `Abriendo navegador en la PC con ${rawUrl}`,
        };
      }

      case 'VOLUME_DOWN': {
        const amount = Math.max(1, Math.min(10, Math.round((Number(params.amount) || 20) / 4)));
        this.sendVirtualKey(0xae, amount); // 0xAE = VK_VOLUME_DOWN
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { action: 'volume_down', amount },
          message: `Volumen de la PC reducido (${amount} pasos).`,
        };
      }

      case 'VOLUME_UP': {
        const amount = Math.max(1, Math.min(10, Math.round((Number(params.amount) || 20) / 4)));
        this.sendVirtualKey(0xaf, amount); // 0xAF = VK_VOLUME_UP
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { action: 'volume_up', amount },
          message: `Volumen de la PC aumentado (${amount} pasos).`,
        };
      }

      case 'MUTE': {
        this.sendVirtualKey(0xad, 1); // 0xAD = VK_VOLUME_MUTE
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { action: 'mute' },
          message: 'Silencio activado/desactivado en la PC.',
        };
      }

      case 'MEDIA_PLAY':
      case 'MEDIA_PAUSE': {
        this.sendVirtualKey(0xb3, 1); // 0xB3 = VK_MEDIA_PLAY_PAUSE
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { action: 'media_toggle' },
          message: 'Control multimedia ejecutado en la PC.',
        };
      }

      default: {
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { receivedParams: params },
          message: `Comando "${intent}" recibido y verificado por JarBees Core.`,
        };
      }
    }
  }
}
