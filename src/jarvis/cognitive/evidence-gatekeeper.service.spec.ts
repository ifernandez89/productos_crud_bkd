import { EvidenceGatekeeperService } from './evidence-gatekeeper.service';
import { ExtractedClaim } from './claim-extractor.service';

describe('EvidenceGatekeeperService (Cognitive Integrity & Dialectic Contrast)', () => {
  let service: EvidenceGatekeeperService;

  beforeEach(() => {
    service = new EvidenceGatekeeperService();
  });

  it('debe reclasificar afirmaciones sin fragmentos de respaldo como inferencias', () => {
    const claims: ExtractedClaim[] = [
      {
        claim: 'Jung descubrió la sincronicidad en 1952',
        status: 'supported',
        supportingChunkIds: [999], // ID que no existe en chunks recuperados
        contradictingChunkIds: [],
        limitations: [],
      },
    ];

    const retrievedChunks = [
      { id: 101, content: 'Fragmento de prueba sobre psicología', author: 'Jung' },
    ];

    const result = service.validateAnswerIntegrity(
      'Jung descubrió la sincronicidad en 1952 con Pauli.',
      claims,
      retrievedChunks,
    );

    expect(result.inferenceCount).toBe(1);
    expect(result.supportedCount).toBe(0);
    expect(result.reclassifiedClaims).toHaveLength(1);
    expect(result.reclassifiedClaims[0].newStatus).toBe('inference');
    expect(result.annotatedAnswer).toContain('[Inferencia / Sin respaldo directo]');
  });

  it('debe mantener como supported afirmaciones que sí tienen chunk válido en retrievedChunks', () => {
    const claims: ExtractedClaim[] = [
      {
        claim: 'Nietzsche escribió Así habló Zaratustra',
        status: 'supported',
        supportingChunkIds: [202],
        contradictingChunkIds: [],
        limitations: [],
      },
    ];

    const retrievedChunks = [
      { id: 202, content: 'Nietzsche escribió Así habló Zaratustra en 1883.', author: 'Nietzsche' },
    ];

    const result = service.validateAnswerIntegrity(
      'Nietzsche escribió Así habló Zaratustra durante su estancia.',
      claims,
      retrievedChunks,
    );

    expect(result.supportedCount).toBe(1);
    expect(result.inferenceCount).toBe(0);
    expect(result.integrityScore).toBe(1.0);
  });

  it('debe advertir cuando hay contradicciones documentales y reflejarlo en warnings', () => {
    const claims: ExtractedClaim[] = [
      {
        claim: 'El método es 100% infalible',
        status: 'contradicted',
        supportingChunkIds: [],
        contradictingChunkIds: [303],
        limitations: [],
      },
    ];

    const retrievedChunks = [
      { id: 303, content: 'Los estudios demuestran que el método falla frecuentemente.', author: 'Popper' },
    ];

    const result = service.validateAnswerIntegrity(
      'El método es 100% infalible según afirman.',
      claims,
      retrievedChunks,
    );

    expect(result.contradictedCount).toBe(1);
    expect(result.warnings.some((w) => w.includes('contradichas'))).toBe(true);
  });

  it('debe verificar la preservación de contrastes dialécticos entre múltiples autores', () => {
    const retrievedChunks = [
      { id: 1, content: 'Tesis de Jung sobre arquetipos', author: 'Jung' },
      { id: 2, content: 'Crítica de Freud a la mística', author: 'Freud' },
    ];

    // Caso 1: Sí menciona a ambos y contrasta
    const answerConContraste =
      'Jung propone el inconsciente colectivo, mientras que Freud lo reduce a la libido reprimida.';
    const res1 = service.validateAnswerIntegrity(answerConContraste, [], retrievedChunks);
    expect(res1.dialecticContrastsPreserved).toBe(true);

    // Caso 2: Colapso (solo menciona a uno ignorando al otro autor relevante)
    const answerColapsada =
      'Todo se explica por los arquetipos del inconsciente sin ninguna otra teoría.';
    const res2 = service.validateAnswerIntegrity(answerColapsada, [], retrievedChunks);
    expect(res2.dialecticContrastsPreserved).toBe(false);
  });
});
