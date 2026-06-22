import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition } from './tool.interface';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private tools: ToolDefinition[] = [];

  constructor() {
    this.registerDefaults();
  }

  register(tool: ToolDefinition): void {
    const existing = this.tools.find((item) => item.name === tool.name);
    if (existing) {
      Object.assign(existing, tool);
      return;
    }
    this.tools.push(tool);
  }

  getAllTools(): ToolDefinition[] {
    return [...this.tools];
  }

  getEnabledTools(): ToolDefinition[] {
    return this.tools.filter((tool) => tool.enabled);
  }

  findByName(name: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.name.toLowerCase() === name.toLowerCase());
  }

  private registerDefaults(): void {
    this.register({
      name: 'weather',
      description: 'Consulta del clima',
      category: 'external_api',
      enabled: true,
    });
    this.register({
      name: 'holiday',
      description: 'Consulta de feriados y días festivos',
      category: 'external_api',
      enabled: true,
    });
    this.register({
      name: 'time',
      description: 'Información de fecha y hora por zona horaria',
      category: 'external_api',
      enabled: true,
    });
    this.register({
      name: 'country',
      description: 'Información sobre países y geografías',
      category: 'external_api',
      enabled: true,
    });
    this.register({
      name: 'astronomy',
      description: 'Cálculos astronómicos y datos del cielo',
      category: 'domain',
      enabled: true,
    });
    this.register({
      name: 'mayan',
      description: 'Cálculos del calendario Maya',
      category: 'domain',
      enabled: true,
    });
    this.register({
      name: 'hebrew',
      description: 'Conversión de fechas del calendario hebreo',
      category: 'domain',
      enabled: true,
    });
    this.register({
      name: 'math',
      description: 'Cálculos matemáticos rápidos',
      category: 'domain',
      enabled: true,
    });
    this.register({
      name: 'browser',
      description: 'Navega y extrae contenido de URLs detectadas en el mensaje del usuario',
      category: 'external_api',
      enabled: true,
    });
    this.register({
      name: 'browser_search',
      description: 'Busca en Google y devuelve resultados cuando el usuario pide buscar en internet',
      category: 'external_api',
      enabled: true,
    });
    this.logger.log(`Tool registry inicializado con ${this.tools.length} herramientas.`);
  }
}
