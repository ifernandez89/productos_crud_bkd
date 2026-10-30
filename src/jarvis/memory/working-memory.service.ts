import { Injectable, Logger, Optional } from '@nestjs/common';

export interface WorkingMemoryItem<T = any> {
  key: string;
  sessionId: string;
  content: string;
  payload?: T;
  salience: number; // 0.0 - 1.0
  tags: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  accessCount: number;
}

export interface UpsertWorkingMemoryInput<T = any> {
  sessionId: string;
  key: string;
  content: string;
  payload?: T;
  salience?: number;
  tags?: string[];
  ttlMs?: number;
}

export interface WorkingMemoryStats {
  activeSessions: number;
  totalActiveItems: number;
  maxItemsPerSession: number;
  defaultTtlMs: number;
}

export interface WorkingMemoryOptions {
  maxItemsPerSession?: number;
  defaultTtlMs?: number;
}

/**
 * WorkingMemoryService — Nivel 1 de la Memoria Tripartita de JarBees.
 *
 * Responde a la pregunta: "¿Qué estamos haciendo ahora?"
 * - Mantiene el contexto inmediato de la tarea/sesión con expiración estricta (TTL).
 * - Capacidad por sesión configurable (configurable vía options o WORKING_MEMORY_MAX_ITEMS;
 *   no restringido dogmáticamente a 7 ítems) con desalojo determinístico por menor salience.
 * - Sin timers en background (evicción perezosa en lectura/escritura) para garantizar
 *   cero fugas de memoria y cumplimiento Anti-OOM.
 */
@Injectable()
export class WorkingMemoryService {
  private readonly logger = new Logger(WorkingMemoryService.name);
  private readonly store = new Map<string, Map<string, WorkingMemoryItem>>();
  private maxItemsPerSession: number;
  private defaultTtlMs: number;

  constructor(@Optional() options?: WorkingMemoryOptions) {
    const envMax = parseInt(process.env.WORKING_MEMORY_MAX_ITEMS || '', 10);
    this.maxItemsPerSession =
      options?.maxItemsPerSession ??
      (Number.isFinite(envMax) && envMax > 0 ? envMax : 7);
    this.defaultTtlMs = options?.defaultTtlMs ?? 30 * 60 * 1000; // 30 minutos
  }

  /**
   * Permite ajustar dinámicamente el límite de ítems de memoria de trabajo por sesión.
   */
  setMaxItemsPerSession(newLimit: number): void {
    if (newLimit > 0) {
      this.maxItemsPerSession = Math.floor(newLimit);
    }
  }

  getMaxItemsPerSession(): number {
    return this.maxItemsPerSession;
  }

  /**
   * Inserta o actualiza un ítem en la memoria de trabajo de la sesión.
   */
  set<T = any>(
    input: UpsertWorkingMemoryInput<T>,
    nowMs: number = Date.now(),
  ): WorkingMemoryItem<T> {
    const sessionId = input.sessionId || 'global';
    this.pruneSessionExpired(sessionId, nowMs);

    let sessionMap = this.store.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map<string, WorkingMemoryItem>();
      this.store.set(sessionId, sessionMap);
    }

    const ttl =
      input.ttlMs !== undefined && input.ttlMs > 0
        ? input.ttlMs
        : this.defaultTtlMs;
    const existing = sessionMap.get(input.key);

    if (existing) {
      const updated: WorkingMemoryItem<T> = {
        ...existing,
        content: input.content,
        payload: input.payload !== undefined ? input.payload : existing.payload,
        salience: Math.min(
          1.0,
          Math.max(
            0.0,
            input.salience ?? Math.min(1.0, existing.salience + 0.1),
          ),
        ),
        tags: input.tags ?? existing.tags,
        updatedAt: nowMs,
        expiresAt: nowMs + ttl,
        accessCount: existing.accessCount + 1,
      };
      sessionMap.set(input.key, updated);
      return updated;
    }

    // Si se alcanzó la capacidad máxima de la sesión, desalojar el de menor salience / más antiguo
    if (sessionMap.size >= this.maxItemsPerSession) {
      this.evictLowestPriorityItem(sessionMap);
    }

    const created: WorkingMemoryItem<T> = {
      key: input.key,
      sessionId,
      content: input.content,
      payload: input.payload,
      salience: Math.min(1.0, Math.max(0.0, input.salience ?? 0.6)),
      tags: input.tags ?? [],
      createdAt: nowMs,
      updatedAt: nowMs,
      expiresAt: nowMs + ttl,
      accessCount: 1,
    };

    sessionMap.set(input.key, created);
    return created;
  }

  /**
   * Obtiene un ítem activo por clave (o null si expiró o no existe).
   */
  get<T = any>(
    sessionId: string,
    key: string,
    nowMs: number = Date.now(),
  ): WorkingMemoryItem<T> | null {
    const sid = sessionId || 'global';
    this.pruneSessionExpired(sid, nowMs);
    const sessionMap = this.store.get(sid);
    if (!sessionMap) return null;

    const item = sessionMap.get(key);
    if (!item) return null;

    item.accessCount += 1;
    item.updatedAt = nowMs;
    item.salience = Math.min(1.0, Number((item.salience + 0.05).toFixed(4)));
    return item as WorkingMemoryItem<T>;
  }

  /**
   * Lista todos los ítems activos de una sesión ordenados por relevancia (salience DESC, updatedAt DESC).
   */
  listActive(
    sessionId: string,
    nowMs: number = Date.now(),
  ): WorkingMemoryItem[] {
    const sid = sessionId || 'global';
    this.pruneSessionExpired(sid, nowMs);
    const sessionMap = this.store.get(sid);
    if (!sessionMap) return [];

    return Array.from(sessionMap.values()).sort((a, b) => {
      if (b.salience !== a.salience) return b.salience - a.salience;
      return b.updatedAt - a.updatedAt;
    });
  }

  /**
   * Devuelve todos los ítems activos de todas las sesiones (útil para consolidación sleep).
   */
  listAllActive(nowMs: number = Date.now()): WorkingMemoryItem[] {
    this.pruneExpired(nowMs);
    const all: WorkingMemoryItem[] = [];
    for (const sessionMap of this.store.values()) {
      for (const item of sessionMap.values()) {
        all.push(item);
      }
    }
    return all.sort((a, b) => b.salience - a.salience);
  }

  /**
   * Elimina un ítem específico de la memoria de trabajo.
   */
  delete(sessionId: string, key: string): boolean {
    const sid = sessionId || 'global';
    const sessionMap = this.store.get(sid);
    if (!sessionMap) return false;
    const deleted = sessionMap.delete(key);
    if (sessionMap.size === 0) {
      this.store.delete(sid);
    }
    return deleted;
  }

  /**
   * Limpia la memoria de trabajo de una sesión específica.
   */
  clearSession(sessionId: string): number {
    const sid = sessionId || 'global';
    const sessionMap = this.store.get(sid);
    if (!sessionMap) return 0;
    const count = sessionMap.size;
    this.store.delete(sid);
    return count;
  }

  /**
   * Purga todos los ítems expirados de todas las sesiones y retorna cuántos fueron eliminados.
   */
  pruneExpired(nowMs: number = Date.now()): number {
    let removed = 0;
    for (const [sid] of this.store.entries()) {
      removed += this.pruneSessionExpired(sid, nowMs);
    }
    return removed;
  }

  getStats(nowMs: number = Date.now()): WorkingMemoryStats {
    this.pruneExpired(nowMs);
    let totalActiveItems = 0;
    for (const sessionMap of this.store.values()) {
      totalActiveItems += sessionMap.size;
    }
    return {
      activeSessions: this.store.size,
      totalActiveItems,
      maxItemsPerSession: this.maxItemsPerSession,
      defaultTtlMs: this.defaultTtlMs,
    };
  }

  private pruneSessionExpired(sessionId: string, nowMs: number): number {
    const sessionMap = this.store.get(sessionId);
    if (!sessionMap) return 0;

    let removed = 0;
    for (const [key, item] of sessionMap.entries()) {
      if (item.expiresAt <= nowMs) {
        sessionMap.delete(key);
        removed += 1;
      }
    }

    if (sessionMap.size === 0) {
      this.store.delete(sessionId);
    }
    return removed;
  }

  private evictLowestPriorityItem(
    sessionMap: Map<string, WorkingMemoryItem>,
  ): void {
    let victimKey: string | null = null;
    let lowestSalience = Infinity;
    let oldestUpdated = Infinity;

    for (const [key, item] of sessionMap.entries()) {
      if (
        item.salience < lowestSalience ||
        (item.salience === lowestSalience && item.updatedAt < oldestUpdated)
      ) {
        lowestSalience = item.salience;
        oldestUpdated = item.updatedAt;
        victimKey = key;
      }
    }

    if (victimKey !== null) {
      sessionMap.delete(victimKey);
    }
  }
}

