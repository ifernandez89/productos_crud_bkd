import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

@Injectable()
export class SafeExecService {
  private readonly logger = new Logger(SafeExecService.name);

  private allowedExecutables = new Set(['python', 'python3']);

  async runPythonScript(scriptPath: string, args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string; code: number }> {
    // Normalize and validate path
    const abs = path.isAbsolute(scriptPath) ? scriptPath : path.join(process.cwd(), scriptPath);
    if (!existsSync(abs)) throw new Error(`Script no encontrado: ${abs}`);

    // Choose python executable by platform
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    if (!this.allowedExecutables.has(pythonExecutable)) {
      throw new Error('Ejecutable Python no permitido en este entorno');
    }

    this.logger.log(`Executing python script safely: ${abs}`);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const proc = spawn(pythonExecutable, [abs, ...args], {
      shell: false,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      signal: controller.signal as any,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    const code = await new Promise<number>((resolve, reject) => {
      proc.on('close', (c) => {
        clearTimeout(timeoutHandle);
        resolve(c ?? 0);
      });
      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
    });

    return { stdout, stderr, code };
  }
}
