import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async log(action: string, details: Record<string, any>) {
    try {
      const dir = path.join(process.cwd(), 'logs');
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'security_audit.log');
      const entry = { ts: new Date().toISOString(), action, details };
      await fs.promises.appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
      this.logger.log(`Audit logged: ${action}`);
    } catch (err) {
      this.logger.error('Failed to write audit log', err as any);
    }
  }
}
