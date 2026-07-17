import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

export interface JarvisIdentity {
  name: string;
  language: string;
  country: string;
  timezone: string;
  personality: {
    tone: string;
    verbosity: string;
    [key: string]: string;
  };
  specialties?: string[];
}

@Injectable()
export class JarvisIdentityService {
  private readonly logger = new Logger(JarvisIdentityService.name);
  private readonly configPath = path.join(
    process.cwd(),
    'config',
    'jarvis.identity.json',
  );
  private readonly defaultIdentity: JarvisIdentity = {
    name: 'Jarvis',
    language: 'es-AR',
    country: 'Argentina',
    timezone: 'America/Argentina/Buenos_Aires',
    personality: {
      tone: 'amigable',
      verbosity: 'media',
    },
    specialties: ['astronomia', 'calendarios', 'programacion'],
  };

  getIdentity(): JarvisIdentity {
    try {
      if (!existsSync(this.configPath)) {
        this.logger.warn(
          `No se encontró ${this.configPath}, usando identidad por defecto.`,
        );
        return this.defaultIdentity;
      }
      const raw = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<JarvisIdentity>;
      return {
        ...this.defaultIdentity,
        ...parsed,
        personality: {
          ...this.defaultIdentity.personality,
          ...(parsed.personality ?? {}),
        },
      };
    } catch (error) {
      this.logger.error(`Error leyendo identidad: ${error.message}`);
      return this.defaultIdentity;
    }
  }
}
