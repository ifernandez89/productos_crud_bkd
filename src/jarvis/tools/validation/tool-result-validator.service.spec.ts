import { ToolResultValidatorService } from './tool-result-validator.service';

describe('ToolResultValidatorService — Closed-Loop Tool Output Validation', () => {
  let validator: ToolResultValidatorService;

  beforeAll(() => {
    validator = new ToolResultValidatorService();
  });

  it('debe detectar que una hora estática no resuelve una pregunta de duración y recuperarla con DateMathTool', () => {
    const query =
      'Si un evento comienza a las 23:30 y dura 150 minutos, ¿a qué hora termina?';
    const fakeToolOutput = 'Hora actual: 18:16 (ART), sábado 31 de octubre de 2026.';

    const validation = validator.validateToolResult(query, 'direct_tool', fakeToolOutput);

    expect(validation.valid).toBe(true); // Recuperado
    expect(validation.effectiveAnswer).toContain('02:00 hs (del día siguiente)');
  });

  it('debe invalidar una búsqueda web fallida si la consulta es conceptual y derivar a LLM', () => {
    const query =
      '¿Cómo investigarías experimentalmente si un material conduce mejor el calor que otro?';
    const fakeFailure =
      'No encontré resultados en internet para: "¿Cómo investigarías experimentalmente..."';

    const validation = validator.validateToolResult(query, 'direct_tool', fakeFailure);

    expect(validation.valid).toBe(false);
    expect(validation.fallbackToLLM).toBe(true);
    expect(validation.reason).toContain('Búsqueda web sin resultados en consulta conceptual');
  });

  it('debe invalidar una carta astrológica devuelta ante una consulta física de la Luna', () => {
    const query = '¿Por qué vemos siempre prácticamente la misma cara de la Luna desde la Tierra?';
    const fakeAstrology = '🌌 **Clima Astrológico para sábado, 31 de octubre de 2026**\n\n**Luna 🌖 (61% iluminada)**';

    const validation = validator.validateToolResult(query, 'astrology_calculated', fakeAstrology);

    expect(validation.valid).toBe(false);
    expect(validation.fallbackToLLM).toBe(true);
  });
});

