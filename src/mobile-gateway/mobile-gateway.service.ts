import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { execFile } from 'child_process';
import * as os from 'os';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { validateCryptoSecret } from '../auth/jwt-secret.util';

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
  calculator: 'calc.exe',
  calc: 'calc.exe',
  notepad: 'notepad.exe',
  vscode: 'code.cmd',
  code: 'code.cmd',
  explorer: 'explorer.exe',
};

const ALLOWED_VK_CODES = new Set([0xad, 0xae, 0xaf, 0xb3]);
const SHELL_METACHAR_REGEX = /[\s"&|<>^%;$`\\\r\n\0]/;

function canonicalizeObject(value: unknown): string {
  if (value === undefined || value === null) return '{}';
  const sortRecursive = (input: any): any => {
    if (Array.isArray(input)) {
      return input.map(sortRecursive);
    }
    if (input !== null && typeof input === 'object') {
      const sorted: Record<string, any> = {};
      for (const key of Object.keys(input).sort()) {
        if (input[key] !== undefined) {
          sorted[key] = sortRecursive(input[key]);
        }
      }
      return sorted;
    }
    return input;
  };
  return JSON.stringify(sortRecursive(value));
}

@Injectable()
export class MobileGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(MobileGatewayService.name);
  private readonly secret: Buffer;
  private readonly maxClockDriftMs = 30000; // 30 segundos
  private readonly seenRequestIds = new Map<string, number>();
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly replayDir: string;

  constructor(
    @Optional()
    options?: {
      gatewaySecret?: string;
      replayDir?: string;
    },
  ) {
    const rawSecret = validateCryptoSecret(
      options?.gatewaySecret ?? process.env.MOBILE_GATEWAY_SECRET,
      'MOBILE_GATEWAY_SECRET',
    );

    this.secret = crypto
      .createHash('sha256')
      .update(`${rawSecret}:jarbees_mobile_gateway_salt`)
      .digest();

    this.replayDir = path.resolve(
      options?.replayDir ??
        process.env.MOBILE_GATEWAY_REPLAY_DIR ??
        path.join(process.env.JARBEES_STORAGE_DIR || 'storage', 'security', 'mobile-replay'),
    );

    this.initReplayStore();

    // Limpieza de nonces/requestIds expirados en memoria y disco cada 60s
    this.cleanupInterval = setInterval(() => {
      this.pruneExpiredReplays();
    }, 60000);

    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  private initReplayStore(): void {
    try {
      if (!fs.existsSync(this.replayDir)) {
        fs.mkdirSync(this.replayDir, { recursive: true });
      }
      this.pruneExpiredReplays();
    } catch (err: any) {
      this.logger.error(`Error inicializando directorio anti-replay (${this.replayDir}): ${err.message}`);
    }
  }

  private pruneExpiredReplays(): void {
    const now = Date.now();
    for (const [reqId, expiresAt] of this.seenRequestIds.entries()) {
      if (expiresAt < now) {
        this.seenRequestIds.delete(reqId);
      }
    }

    try {
      if (fs.existsSync(this.replayDir)) {
        const files = fs.readdirSync(this.replayDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const fullPath = path.join(this.replayDir, file);
          try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed?.expiresAt || parsed.expiresAt < now) {
              fs.unlinkSync(fullPath);
            } else if (parsed.requestId && !this.seenRequestIds.has(parsed.requestId)) {
              // Pre-cargar en memoria registros no expirados tras reinicio
              this.seenRequestIds.set(parsed.requestId, parsed.expiresAt);
            }
          } catch {
            try {
              fs.unlinkSync(fullPath);
            } catch {}
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error limpiando archivos de replay expirados: ${err.message}`);
    }
  }

  private persistAtomicRequestId(requestId: string, consumedAt: number, expiresAt: number): void {
    const safeHash = crypto.createHash('sha256').update(requestId).digest('hex');
    const filePath = path.join(this.replayDir, `${safeHash}.json`);

    try {
      if (!fs.existsSync(this.replayDir)) {
        fs.mkdirSync(this.replayDir, { recursive: true });
      }
      // Creación atómica exclusiva a nivel de SO (O_CREAT | O_EXCL)
      const fd = fs.openSync(
        filePath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
      );
      try {
        const payload = JSON.stringify({ requestId, consumedAt, expiresAt });
        fs.writeFileSync(fd, payload, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        throw new ForbiddenException(
          `Ataque de repetición detectado: el requestId "${requestId}" ya fue procesado y persistido.`,
        );
      }
      this.logger.error(`Error persistiendo requestId ${requestId}: ${err.message}`);
      throw new ForbiddenException('MobileGateway: fallo de almacenamiento anti-replay (Fail-Closed).');
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
   * Limpia en memoria y en disco los registros de replay (utilizado para pruebas y teardown)
   */
  clearReplayLedger() {
    this.seenRequestIds.clear();
    try {
      if (fs.existsSync(this.replayDir)) {
        const files = fs.readdirSync(this.replayDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(this.replayDir, file));
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Calcula el hash SHA-256 canónico del payload del comando móvil.
   */
  computeCanonicalPayloadHash(
    parameters?: Record<string, any>,
    context?: Record<string, any>,
    deviceId?: string,
  ): string {
    const canonical = canonicalizeObject({
      deviceId: deviceId || '',
      parameters: parameters || {},
      context: context || null,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Valida autenticidad obligatoria (HMAC-SHA256 vinculado a método, ruta, requestId, timestamp, intent y payloadHash),
   * ventana de tiempo anti-replay y unicidad atómica de requestId.
   * Endurecido en DEV-001-B1.1 (F-B1-09): elimina MOBILE_GATEWAY_DISABLE_AUTH y hace obligatoria la firma.
   */
  validateCommandSecurity(
    dto: MobileCommandDto,
    signature?: string,
    headerTimestamp?: string,
    requestContext?: { method?: string; path?: string },
  ): void {
    if (!dto || !dto.requestId || typeof dto.requestId !== 'string') {
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

    // Firma HMAC obligatoria en todos los comandos (sin bypass por ausencia de header ni por variable de entorno)
    if (!signature || typeof signature !== 'string' || signature.trim().length === 0) {
      throw new UnauthorizedException(
        'MobileGateway: falta la firma obligatoria "x-jarbees-signature" (HMAC-SHA256).',
      );
    }

    const method = (requestContext?.method || 'POST').toUpperCase();
    const normalizedPath = this.normalizeGatewayPath(
      requestContext?.path || '/mobile/v1/command',
    );
    const expectedSignature = this.generateHmacSignature(
      dto.requestId,
      commandTimestampStr,
      dto.intent,
      {
        method,
        path: normalizedPath,
        parameters: dto.parameters,
        context: dto.context,
        deviceId: dto.deviceId,
      },
    );

    const trimmedSig = signature.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(trimmedSig)) {
      throw new UnauthorizedException('Firma HMAC de Mobile Gateway inválida o con formato incorrecto.');
    }

    const sigBuffer = Buffer.from(trimmedSig, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Firma HMAC de Mobile Gateway inválida o alterada.');
    }

    // Anti-Replay atómico y duradero (DEV-001-B1.2: A2)
    // Garantía: ejecución como máximo una vez (at-most-once execution).
    // Se verifica e inserta primero en disco de forma atómica (O_CREAT | O_EXCL) y se replica en memoria.
    if (this.seenRequestIds.has(dto.requestId)) {
      throw new ForbiddenException(
        `Ataque de repetición detectado: el requestId "${dto.requestId}" ya fue procesado.`,
      );
    }

    const expiresAt = now + this.maxClockDriftMs * 2;
    this.persistAtomicRequestId(dto.requestId, now, expiresAt);
    this.seenRequestIds.set(dto.requestId, expiresAt);
  }

  private normalizeGatewayPath(rawPath: string): string {
    const withoutQuery = (rawPath || '/mobile/v1/command').split('?')[0].trim();
    const withoutApiPrefix = withoutQuery.replace(/^\/api(?=\/)/i, '');
    return withoutApiPrefix || '/mobile/v1/command';
  }

  /**
   * Genera firma HMAC-SHA256 vinculada a método, ruta, requestId, timestamp, intent y hash canónico del payload.
   */
  generateHmacSignature(
    requestId: string,
    timestamp: string,
    intent: string,
    binding?: {
      method?: string;
      path?: string;
      parameters?: Record<string, any>;
      context?: Record<string, any>;
      deviceId?: string;
    },
  ): string {
    const method = (binding?.method || 'POST').toUpperCase();
    const path = this.normalizeGatewayPath(binding?.path || '/mobile/v1/command');
    const payloadHash = this.computeCanonicalPayloadHash(
      binding?.parameters,
      binding?.context,
      binding?.deviceId,
    );
    const payload = `${method}:${path}:${requestId}:${timestamp}:${String(intent || '').toUpperCase().trim()}:${payloadHash}`;
    return crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /**
   * Generar firma directamente desde un MobileCommandDto completo.
   */
  signCommandDto(
    dto: MobileCommandDto,
    options?: { method?: string; path?: string; headerTimestamp?: string },
  ): string {
    return this.generateHmacSignature(
      dto.requestId,
      options?.headerTimestamp || dto.timestamp,
      dto.intent,
      {
        method: options?.method || 'POST',
        path: options?.path || '/mobile/v1/command',
        parameters: dto.parameters,
        context: dto.context,
        deviceId: dto.deviceId,
      },
    );
  }

  /**
   * Comprueba si una URL apunta a localhost, IP privada, esquema inseguro o contiene metacaracteres de shell/control.
   */
  isPrivateOrLocalUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2048) {
      return true;
    }

    if (SHELL_METACHAR_REGEX.test(rawUrl)) {
      return true;
    }

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return true;
      }

      if (parsed.username || parsed.password) {
        return true;
      }

      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host === '127.0.0.1' ||
        host.startsWith('127.') ||
        host === '0.0.0.0' ||
        host === '169.254.169.254' ||
        host.startsWith('169.254.') ||
        host === '::1' ||
        host === '0:0:0:0:0:0:0:1' ||
        host.startsWith('fc') ||
        host.startsWith('fd') ||
        host.startsWith('fe80')
      ) {
        return true;
      }

      // Bloquear representaciones IP numéricas alternativas (decimal entero, hexadecimal u octal)
      if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
        return true;
      }

      // Rangos privados RFC 1918 y CGNAT
      if (
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
      ) {
        return true;
      }

      return false;
    } catch {
      return true; // Si no es una URL parseable, se bloquea por seguridad
    }
  }

  /**
   * Ejecuta un binario del sistema de forma directa mediante execFile (shell: false) sin invocar cmd.exe ni intérprete de comandos.
   */
  protected executeOsCommand(executable: string, args: string[] = []): void {
    execFile(executable, args, {
      shell: false,
      windowsHide: false,
    });
  }

  /**
   * Envía un evento de tecla virtual (VK) nativo de Windows utilizando keybd_event vía user32.dll sin shell.
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
    this.executeOsCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      base64,
    ]);
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
    requestContext?: { method?: string; path?: string },
  ): Promise<any> {
    // 1. Validar autenticación HMAC obligatoria, timestamp, vinculación de payload y anti-replay
    this.validateCommandSecurity(dto, signature, headerTimestamp, requestContext);

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

        this.executeOsCommand(commandToRun, []);
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
        const rawUrl = String(params.url || 'https://google.com').trim();
        if (this.isPrivateOrLocalUrl(rawUrl)) {
          throw new ForbiddenException(
            `Acceso bloqueado por política Anti-SSRF o metacaracteres inseguros: la URL "${rawUrl}" apunta a un recurso privado o inválido.`,
          );
        }

        if (process.env.MOBILE_GATEWAY_ENABLE_OPEN_URL !== 'true') {
          throw new ForbiddenException(
            'La acción OPEN_URL se encuentra deshabilitada por política de seguridad del host (DEV-001-B1.1).',
          );
        }

        const canonicalUrl = new URL(rawUrl).toString();
        this.executeOsCommand('rundll32.exe', [
          'url.dll,FileProtocolHandler',
          canonicalUrl,
        ]);
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { url: canonicalUrl },
          message: `Abriendo navegador en la PC con ${canonicalUrl}`,
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
