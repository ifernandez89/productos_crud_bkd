import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import * as os from 'os';

@Injectable()
export class MobileGatewayService {
  private readonly logger = new Logger(MobileGatewayService.name);

  getCapabilities() {
    return {
      success: true,
      version: '1.0.0',
      environment: `JarBees Core Desktop (${os.type()} ${os.release()})`,
      capabilities: [
        { intent: 'GET_TIME', description: 'Obtiene la hora oficial de la PC' },
        { intent: 'GET_SYSTEM_STATUS', description: 'Uso de CPU, RAM y servicios de la PC' },
        { intent: 'CALCULATE', description: 'Evaluador matemático determinista' },
        { intent: 'VOLUME_UP', description: 'Sube el volumen del sistema en la PC' },
        { intent: 'VOLUME_DOWN', description: 'Baja el volumen del sistema en la PC' },
        { intent: 'MEDIA_PLAY', description: 'Reanuda multimedia en la PC' },
        { intent: 'MEDIA_PAUSE', description: 'Pausa multimedia en la PC' },
        { intent: 'OPEN_APP', description: 'Abre aplicaciones autorizadas (Calculadora, Notepad, VS Code)' },
        { intent: 'OPEN_BROWSER', description: 'Abre el navegador en la PC' },
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
        const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
        const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024));
        const usedMem = totalMem - freeMem;
        const cpus = os.cpus();
        const uptimeHours = Math.round((os.uptime() / 3600) * 10) / 10;

        return {
          requestId: dto.requestId,
          success: true,
          intent,
          result: {
            hostname: os.hostname(),
            platform: os.platform(),
            cpuModel: cpus[0]?.model || 'Desconocido',
            cpuCores: cpus.length,
            ramTotalGb: totalMem,
            ramUsedGb: usedMem,
            ramUsagePct: `${Math.round((usedMem / totalMem) * 100)}%`,
            uptimeHours,
          },
          message: `PC activa (${os.hostname()}): RAM al ${Math.round((usedMem / totalMem) * 100)}%, Uptime ${uptimeHours}h.`,
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
        // Whitelist estricta de aplicaciones para evitar ejecución arbitraria
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
