import { Injectable, Optional } from '@nestjs/common';

export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextWindowOptions {
  maxSessions?: number;
  maxTurnsPerSession?: number;
  defaultMaxContextTokens?: number;
  defaultReservedOutputTokens?: number;
}

export interface AssembleHistoryOptions {
  sessionId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  catalogBlock?: string;
  maxTurns?: number;
  maxContextTokens?: number;
  reservedOutputTokens?: number;
}

export interface AssembledHistoryResult {
  turns: SessionTurn[];
  estimatedInputTokens: number;
  availableHistoryTokens: number;
  droppedTurns: number;
}

/**
 * Servicio de gestión de contexto conversacional para JarBees (src/aichat).
 *
 * Responsabilidades:
 * 1. Contabilización rápida y determinista de tokens (~4 caracteres/token).
 * 2. Deduplicación de turnos consecutivos idénticos (mismo rol y contenido normalizado).
 * 3. Límite acotado de sesiones en memoria mediante evicción LRU (previene fugas de RAM por sessionId).
 * 4. Selección de historial bajo presupuesto de tokens (por defecto 6144 para RTX 5070 12GB)
 *    garantizando que nunca quede un turno 'assistant' huérfano al inicio del hilo recortado.
 */
@Injectable()
export class ContextManagerService {
  private readonly maxSessions: number;
  private readonly maxTurnsPerSession: number;
  private readonly defaultMaxContextTokens: number;
  private readonly defaultReservedOutputTokens: number;

  /**
   * En Map de JavaScript (ES2015+), el orden de iteración es estrictamente por orden de inserción.
   * Re-insertar una clave (delete + set) mueve la sesión al final (más recientemente usada) en O(1).
   */
  private readonly sessions = new Map<string, SessionTurn[]>();

  constructor(@Optional() options?: ContextWindowOptions) {
    const opts = options || {};
    this.maxSessions = opts.maxSessions ?? (Number(process.env.CONTEXT_MAX_SESSIONS) || 200);
    this.maxTurnsPerSession =
      opts.maxTurnsPerSession ?? (Number(process.env.CONTEXT_MAX_TURNS) || 12);
    this.defaultMaxContextTokens =
      opts.defaultMaxContextTokens ?? (Number(process.env.CONTEXT_MAX_TOKENS) || 6144);
    this.defaultReservedOutputTokens =
      opts.defaultReservedOutputTokens ?? (Number(process.env.CONTEXT_RESERVED_OUTPUT_TOKENS) || 1024);
  }

  /**
   * Indica si el gestor avanzado de contexto está habilitado (reversible vía USE_CONTEXT_MANAGER=false).
   */
  isEnabled(): boolean {
    return process.env.USE_CONTEXT_MANAGER !== 'false';
  }

  /**
   * Estimación rápida de tokens sin dependencias nativas C++.
   */
  estimateTokens(text?: string | null): number {
    if (!text || typeof text !== 'string') return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.ceil(trimmed.length / 4);
  }

  /**
   * Registra un turno en la sesión aplicando deduplicación consecutiva, límite de turnos y evicción LRU.
   */
  rememberTurn(sessionId: string | undefined, role: 'user' | 'assistant', content: string): void {
    if (!sessionId || typeof content !== 'string') return;
    const cleanContent = content.trim();
    if (!cleanContent) return;

    const existing = this.sessions.get(sessionId) ?? [];

    // Deduplicación consecutiva: si el último turno tiene el mismo rol y texto normalizado, solo refresca LRU
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (last.role === role && last.content.trim() === cleanContent) {
        this.touchSession(sessionId, existing);
        return;
      }
    }

    const updated = [...existing, { role, content }];
    const bounded =
      updated.length > this.maxTurnsPerSession
        ? updated.slice(-this.maxTurnsPerSession)
        : updated;

    this.touchSession(sessionId, bounded);
  }

  /**
   * Registra un par pregunta/respuesta del usuario y del asistente.
   */
  rememberPair(sessionId: string | undefined, userText: string, assistantText: string): void {
    this.rememberTurn(sessionId, 'user', userText);
    this.rememberTurn(sessionId, 'assistant', assistantText);
  }

  /**
   * Obtiene una copia defensiva de los últimos `limit` turnos de una sesión y actualiza su recencia LRU.
   */
  getTurns(sessionId?: string, limit = this.maxTurnsPerSession): SessionTurn[] {
    if (!sessionId || !this.sessions.has(sessionId)) return [];
    const turns = this.sessions.get(sessionId)!;
    this.touchSession(sessionId, turns);
    return turns.slice(-limit).map((t) => ({ ...t }));
  }

  /**
   * Selecciona los turnos recientes que caben dentro del presupuesto de tokens disponible,
   * garantizando que el hilo recortado nunca comience con un turno 'assistant' huérfano.
   */
  selectContextForPrompt(options: AssembleHistoryOptions): AssembledHistoryResult {
    const {
      sessionId,
      systemPrompt = '',
      userPrompt = '',
      catalogBlock = '',
      maxTurns = 8,
      maxContextTokens = this.defaultMaxContextTokens,
      reservedOutputTokens = this.defaultReservedOutputTokens,
    } = options;

    const fixedInputTokens =
      this.estimateTokens(systemPrompt) +
      this.estimateTokens(userPrompt) +
      this.estimateTokens(catalogBlock);

    const availableHistoryTokens = Math.max(
      0,
      maxContextTokens - reservedOutputTokens - fixedInputTokens,
    );

    const candidateTurns = this.getTurns(sessionId, maxTurns);
    if (candidateTurns.length === 0 || availableHistoryTokens === 0) {
      return {
        turns: [],
        estimatedInputTokens: fixedInputTokens,
        availableHistoryTokens,
        droppedTurns: candidateTurns.length,
      };
    }

    const selected: SessionTurn[] = [];
    let usedHistoryTokens = 0;

    for (let i = candidateTurns.length - 1; i >= 0; i--) {
      const turn = candidateTurns[i];
      const turnTokens = this.estimateTokens(turn.content);
      if (usedHistoryTokens + turnTokens > availableHistoryTokens) {
        break;
      }
      selected.unshift(turn);
      usedHistoryTokens += turnTokens;
    }

    // Regla de integridad conversacional: nunca dejar un turno 'assistant' huérfano al inicio del historial
    while (selected.length > 0 && selected[0].role === 'assistant') {
      const removed = selected.shift()!;
      usedHistoryTokens -= this.estimateTokens(removed.content);
    }

    return {
      turns: selected,
      estimatedInputTokens: fixedInputTokens + usedHistoryTokens,
      availableHistoryTokens,
      droppedTurns: candidateTurns.length - selected.length,
    };
  }

  /**
   * Sincroniza turnos inyectados directamente en el Map legado `sessionContextStore` (compatibilidad con tests existentes).
   */
  syncFromLegacyMap(
    legacyMap: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>,
    sessionId?: string,
  ): void {
    if (!sessionId) return;
    if (legacyMap.has(sessionId) && !this.sessions.has(sessionId)) {
      const legacyTurns = legacyMap.get(sessionId) ?? [];
      for (const t of legacyTurns) {
        this.rememberTurn(sessionId, t.role, t.content);
      }
    }
  }

  /**
   * Cantidad actual de sesiones activas en memoria.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Limpia todas las sesiones en memoria (útil para teardown en tests).
   */
  clearAll(): void {
    this.sessions.clear();
  }

  private touchSession(sessionId: string, turns: SessionTurn[]): void {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }
    this.sessions.set(sessionId, turns);

    // Evicción LRU cuando se supera el límite de sesiones activas
    while (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey !== undefined) {
        this.sessions.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}

