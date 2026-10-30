import { ContextManagerService } from './context-manager.service';

describe('ContextManagerService', () => {
  let service: ContextManagerService;
  const originalEnv = process.env.USE_CONTEXT_MANAGER;

  beforeEach(() => {
    delete process.env.USE_CONTEXT_MANAGER;
    service = new ContextManagerService({
      maxSessions: 3,
      maxTurnsPerSession: 6,
      defaultMaxContextTokens: 6144,
      defaultReservedOutputTokens: 1024,
    });
  });

  afterEach(() => {
    service.clearAll();
    if (originalEnv === undefined) {
      delete process.env.USE_CONTEXT_MANAGER;
    } else {
      process.env.USE_CONTEXT_MANAGER = originalEnv;
    }
  });

  describe('estimateTokens', () => {
    it('returns 0 for empty, null, or whitespace-only strings', () => {
      expect(service.estimateTokens('')).toBe(0);
      expect(service.estimateTokens('   ')).toBe(0);
      expect(service.estimateTokens(null)).toBe(0);
      expect(service.estimateTokens(undefined)).toBe(0);
    });

    it('estimates tokens deterministically (~4 chars per token)', () => {
      expect(service.estimateTokens('Hola')).toBe(1);
      expect(service.estimateTokens('Mundo')).toBe(2);
      expect(service.estimateTokens('A'.repeat(40))).toBe(10);
    });
  });

  describe('deduplicación consecutiva y límite de turnos', () => {
    it('deduplicates consecutive identical messages with same role and trimmed content', () => {
      service.rememberTurn('s1', 'user', 'Hola JarBees');
      service.rememberTurn('s1', 'user', '  Hola JarBees  ');
      service.rememberTurn('s1', 'assistant', 'Hola, ¿en qué ayudo?');

      const turns = service.getTurns('s1');
      expect(turns).toHaveLength(2);
      expect(turns[0]).toEqual({ role: 'user', content: 'Hola JarBees' });
      expect(turns[1]).toEqual({ role: 'assistant', content: 'Hola, ¿en qué ayudo?' });
    });

    it('bounds turns per session to maxTurnsPerSession', () => {
      for (let i = 1; i <= 10; i++) {
        service.rememberTurn('s1', i % 2 === 1 ? 'user' : 'assistant', `Turno ${i}`);
      }
      const turns = service.getTurns('s1');
      expect(turns).toHaveLength(6);
      expect(turns[0].content).toBe('Turno 5');
      expect(turns[5].content).toBe('Turno 10');
    });
  });

  describe('evicción LRU e inmutabilidad defensiva', () => {
    it('evicts the least recently used session when exceeding maxSessions and refreshes on getTurns', () => {
      service.rememberTurn('s1', 'user', 'Uno');
      service.rememberTurn('s2', 'user', 'Dos');
      service.rememberTurn('s3', 'user', 'Tres');

      // Acceder a 's1' la convierte en la más reciente; 's2' pasa a ser la más antigua
      expect(service.getTurns('s1')).toHaveLength(1);

      // Insertar 's4' debe evictar 's2' (maxSessions = 3)
      service.rememberTurn('s4', 'user', 'Cuatro');

      expect(service.getActiveSessionCount()).toBe(3);
      expect(service.getTurns('s1')).toHaveLength(1);
      expect(service.getTurns('s2')).toHaveLength(0);
      expect(service.getTurns('s3')).toHaveLength(1);
      expect(service.getTurns('s4')).toHaveLength(1);
    });

    it('returns defensive copies so external mutation does not corrupt stored state', () => {
      service.rememberTurn('s1', 'user', 'Original');
      const copy = service.getTurns('s1');
      copy[0].content = 'Mutado';
      copy.push({ role: 'assistant', content: 'Inyectado' });

      const fresh = service.getTurns('s1');
      expect(fresh).toHaveLength(1);
      expect(fresh[0].content).toBe('Original');
    });
  });

  describe('selectContextForPrompt (presupuesto de tokens y protección de pares user/assistant)', () => {
    it('drops older turns when exceeding budget and never leaves an orphan assistant turn at start', () => {
      // Turno 1: user (40 chars = 10 tok), Turno 2: assistant (40 chars = 10 tok)
      // Turno 3: user (20 chars = 5 tok),  Turno 4: assistant (20 chars = 5 tok)
      service.rememberTurn('s1', 'user', 'U'.repeat(40));
      service.rememberTurn('s1', 'assistant', 'A'.repeat(40));
      service.rememberTurn('s1', 'user', 'u'.repeat(20));
      service.rememberTurn('s1', 'assistant', 'a'.repeat(20));

      // Presupuesto: maxContextTokens=32, reservedOutput=10, system=1 tok, user=1 tok -> quedan 20 tok para historial.
      // Desde atrás cabrían Turno 4 (5) + Turno 3 (5) + Turno 2 (10) = 20 tok, pero Turno 2 es 'assistant' huérfano!
      // Debe descartar Turno 2 para que el historial inicie en Turno 3 ('user').
      const res = service.selectContextForPrompt({
        sessionId: 's1',
        systemPrompt: 'Sys!',
        userPrompt: 'Usr!',
        maxContextTokens: 32,
        reservedOutputTokens: 10,
      });

      expect(res.turns).toHaveLength(2);
      expect(res.turns[0].role).toBe('user');
      expect(res.turns[1].role).toBe('assistant');
      expect(res.droppedTurns).toBe(2);
      expect(res.estimatedInputTokens).toBe(12); // 1 (sys) + 1 (usr) + 5 + 5
    });
  });

  describe('configuración reversible (USE_CONTEXT_MANAGER)', () => {
    it('reports enabled by default and disabled when USE_CONTEXT_MANAGER=false', () => {
      expect(service.isEnabled()).toBe(true);
      process.env.USE_CONTEXT_MANAGER = 'false';
      expect(service.isEnabled()).toBe(false);
    });
  });
});

