/**
 * JCA-001: Capa 3 - Capability Registry Service
 * 
 * Gestiona el ciclo de vida, registro y consulta de capacidades operativas.
 * Garantiza unicidad de identificadores, valida configuraciones obligatorias
 * y asegura que el registro de una capacidad sea puramente declarativo (sin ejecuciones).
 */

import type { ICapability } from './capability.interface.ts';

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, ICapability<any>>();

  /**
   * Registra una capacidad en el sistema.
   * Rechaza identificadores duplicados o configuraciones inválidas.
   */
  register(capability: ICapability<any>): void {
    if (!capability) {
      throw new Error('No se puede registrar una capacidad nula o indefinida.');
    }

    if (!capability.id || typeof capability.id !== 'string' || capability.id.trim() === '') {
      throw new Error('La capacidad debe tener un identificador (id) no vacío.');
    }

    const normalizedId = capability.id.trim().toLowerCase();

    if (this.capabilities.has(normalizedId)) {
      throw new Error(
        `Conflicto de registro: La capacidad con ID '${normalizedId}' ya se encuentra registrada.`,
      );
    }

    if (!capability.name || typeof capability.name !== 'string' || capability.name.trim() === '') {
      throw new Error(`La capacidad '${normalizedId}' debe poseer un nombre descriptivo.`);
    }

    if (
      typeof capability.defaultTimeoutMs !== 'number' ||
      capability.defaultTimeoutMs <= 0 ||
      !Number.isFinite(capability.defaultTimeoutMs)
    ) {
      throw new Error(
        `La capacidad '${normalizedId}' debe declarar un defaultTimeoutMs numérico positivo finito.`,
      );
    }

    if (!capability.safetyLevel || !['READ_ONLY', 'MUTATING', 'SENSITIVE'].includes(capability.safetyLevel)) {
      throw new Error(
        `La capacidad '${normalizedId}' posee un nivel de seguridad (safetyLevel) inválido.`,
      );
    }

    if (typeof capability.canHandle !== 'function' || typeof capability.execute !== 'function') {
      throw new Error(
        `La capacidad '${normalizedId}' no implementa los métodos requeridos canHandle y execute.`,
      );
    }

    this.capabilities.set(normalizedId, capability);
  }

  /**
   * Obtiene una capacidad por su identificador unívoco.
   */
  get<T = unknown>(id: string): ICapability<T> | undefined {
    if (!id) return undefined;
    return this.capabilities.get(id.trim().toLowerCase()) as ICapability<T> | undefined;
  }

  /**
   * Comprueba si una capacidad se encuentra registrada.
   */
  has(id: string): boolean {
    if (!id) return false;
    return this.capabilities.has(id.trim().toLowerCase());
  }

  /**
   * Retorna una copia de todas las capacidades registradas.
   */
  getAll(): Array<ICapability<any>> {
    return Array.from(this.capabilities.values());
  }

  /**
   * Retorna el número de capacidades registradas.
   */
  get size(): number {
    return this.capabilities.size;
  }

  /**
   * Limpia el registro (útil para suites de pruebas).
   */
  clear(): void {
    this.capabilities.clear();
  }
}
