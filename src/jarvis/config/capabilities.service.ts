import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

export interface AssistantCapabilities {
  voice: boolean;
  memory: boolean;
  astronomy: boolean;
  math: boolean;
  calendar: boolean;
  [key: string]: boolean | undefined;
}

@Injectable()
export class CapabilitiesService {
  private readonly logger = new Logger(CapabilitiesService.name);
  private readonly configPath = path.join(process.cwd(), 'config', 'capabilities.json');
  private readonly defaultCapabilities: AssistantCapabilities = {
    voice: true,
    memory: true,
    astronomy: true,
    math: true,
    calendar: true,
  };

  getCapabilities(): AssistantCapabilities {
    try {
      if (!existsSync(this.configPath)) {
        this.logger.warn(`No se encontró ${this.configPath}, usando capacidades por defecto.`);
        return this.defaultCapabilities;
      }
      const raw = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AssistantCapabilities>;
      return { ...this.defaultCapabilities, ...parsed };
    } catch (error) {
      this.logger.error(`Error leyendo capacidades: ${error.message}`);
      return this.defaultCapabilities;
    }
  }
}
