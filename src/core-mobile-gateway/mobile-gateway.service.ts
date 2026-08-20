import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import * as os from 'os';

@Injectable()
export class MobileGatewayService {
  private readonly logger = new Logger(MobileGatewayService.name);

  /**
   * Envía un evento de tecla virtual (VK) nativo de Windows utilizando keybd_event vía user32.dll.
   * VK_VOLUME_MUTE = 0xAD (173)
   * VK_VOLUME_DOWN = 0xAE (174)
   * VK_VOLUME_UP   = 0xAF (175)
   * VK_MEDIA_PLAY_PAUSE = 0xB3 (179)
   */
  private sendVirtualKey(vkCode: number, repeatCount: number = 1): void {
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
      1..${repeatCount} | ForEach-Object {
        [WinAudio]::keybd_event(${vkCode}, 0, 0, 0)
        [WinAudio]::keybd_event(${vkCode}, 0, 2, 0)
        Start-Sleep -Milliseconds 30
      }
    `;
    const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64}`);
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
      version: '1.0.0',
      environment: `JarBees Core Desktop (${os.type()} ${os.release()})`,
      capabilities: [
        { intent: 'GET_TIME', description: 'Obtiene la hora oficial de la PC' },
        { intent: 'GET_SYSTEM_STATUS', description: 'Uso en tiempo real de CPU, RAM y métricas del sistema' },
        { intent: 'CALCULATE', description: 'Evaluador matemático determinista' },
        { intent: 'VOLUME_UP', description: 'Sube el volumen máster del sistema en la PC' },
        { intent: 'VOLUME_DOWN', description: 'Baja el volumen máster del sistema en la PC' },
        { intent: 'MUTE', description: 'Silencia/activa el sonido de la PC' },
        { intent: 'MEDIA_PLAY', description: 'Reanuda la reproducción multimedia en la PC' },
        { intent: 'MEDIA_PAUSE', description: 'Pausa la reproducción multimedia en la PC' },
        { intent: 'OPEN_APP', description: 'Abre aplicaciones autorizadas (Calculadora, Notepad, VS Code, Explorer)' },
        { intent: 'OPEN_BROWSER', description: 'Abre el navegador predeterminado en la PC' },
        { intent: 'OPEN_URL', description: 'Abre una URL en la PC' },
      ],
    };
  }

  async dispatchMobileCommand(dto: any): Promise<any> {
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
        try {
          const clean = String(expr).replace(/[^0-9+\-*/().\s]/g, '');
          const val = Function(`'use strict'; return (${clean})`)();
          return {
            requestId: dto.requestId,
            success: true,
            intent,
            result: { expression: expr, result: val },
            message: `Cálculo resuelto en Core: ${expr} = ${val}`,
          };
        } catch {
          return {
            requestId: dto.requestId,
            success: false,
            intent,
            result: {},
            message: `No se pudo calcular: "${expr}"`,
          };
        }
      }

      case 'OPEN_APP': {
        const app = String(params.target || params.app || '').toLowerCase();
        const ALLOWED_APPS: Record<string, string> = {
          calculator: 'calc',
          calc: 'calc',
          notepad: 'notepad',
          vscode: 'code',
          explorer: 'explorer',
        };

        const commandToRun = ALLOWED_APPS[app];
        if (!commandToRun) {
          return {
            requestId: dto.requestId,
            success: false,
            intent,
            result: { allowed: Object.keys(ALLOWED_APPS) },
            message: `Aplicación "${app}" no autorizada en Core.`,
          };
        }

        exec(`start ${commandToRun}`);
        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: { app, executed: commandToRun },
          message: `Abriendo ${app} en tu PC.`,
        };
      }

      case 'OPEN_BROWSER':
      case 'OPEN_URL': {
        const url = params.url || 'https://google.com';
        if (/^https?:\/\//i.test(url)) {
          exec(`start ${url}`);
          return {
            requestId: dto.requestId,
            success: true,
            intent,
            result: { url },
            message: `Abriendo navegador en la PC con ${url}`,
          };
        }
        return {
          requestId: dto.requestId,
          success: false,
          intent,
          result: {},
          message: 'URL inválida.',
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
          message: `Comando "${intent}" recibido y procesado por JarBees Core.`,
        };
      }
    }
  }
}
