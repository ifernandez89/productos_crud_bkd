import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from './audit.service';

export interface ExecutionStep {
  type: string;
  input?: any;
}

@Injectable()
export class ActionExecutionGateService {
  private readonly logger = new Logger(ActionExecutionGateService.name);

  // Lista de tipos de pasos permitidos por el planificador (lista blanca)
  private readonly ALLOWED_STEP_TYPES = new Set([
    'search',
    'scrape',
    'read_memory',
    'read_docs',
    'summarize',
    'deduplicate',
    'save',
    'respond',
  ]);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Valida un paso de ejecución antes de procesarlo en el ExecutionEngine.
   */
  async checkStep(step: ExecutionStep, contextSessionId?: string, isHumanConfirmed?: boolean): Promise<void> {
    const actionName = `step:${step.type}`;
    const details = {
      type: step.type,
      input: step.input,
      sessionId: contextSessionId ?? 'system',
      isHumanConfirmed: !!isHumanConfirmed,
    };

    // 1. Validar lista blanca de herramientas/tipos de pasos
    if (!this.ALLOWED_STEP_TYPES.has(step.type)) {
      await this.auditService.log(`${actionName}.denied`, { ...details, reason: 'Step type not whitelisted' });
      throw new ForbiddenException(`Paso '${step.type}' rechazado: Herramienta no autorizada en esta política de seguridad.`);
    }

    // 2. Validar parámetros (Sanitización e integridad de inputs)
    if (step.input) {
      this.validateInputParameters(step.type, step.input);
    }

    // 3. Enforce Human-In-The-Loop (HITL) para acciones destructivas o de alto riesgo
    const isDestructive = this.isDestructiveAction(step);
    if (isDestructive && !isHumanConfirmed) {
      await this.auditService.log(`${actionName}.blocked_hitl`, { ...details, reason: 'Destructive action requires HITL confirmation' });
      throw new BadRequestException(
        `Operación destructiva/alto riesgo (${step.type}) requiere confirmación humana explícita.`
      );
    }

    // Log exitoso
    await this.auditService.log(`${actionName}.approved`, details);
    this.logger.log(`ActionExecutionGate approved action: ${actionName}`);
  }

  /**
   * Determina si la acción es destructiva o de alto riesgo
   */
  private isDestructiveAction(step: ExecutionStep): boolean {
    const type = step.type.toLowerCase();
    
    // Si la acción es guardar o responder, validar si tiene comandos o instrucciones peligrosas
    if (type === 'save' || type === 'respond') {
      const content = JSON.stringify(step.input || {}).toLowerCase();
      if (
        content.includes('delete') ||
        content.includes('drop') ||
        content.includes('truncate') ||
        content.includes('destroy') ||
        content.includes('remove')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Valida la estructura y tipo de los parámetros
   */
  private validateInputParameters(type: string, input: any): void {
    if (type === 'scrape') {
      const url = input.url;
      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        throw new BadRequestException('Parámetro inválido para scrape: se requiere una URL válida.');
      }
    }

    if (type === 'search') {
      const query = input.query;
      if (query && typeof query !== 'string') {
        throw new BadRequestException('Parámetro inválido para search: query debe ser un string.');
      }
    }
  }
}
