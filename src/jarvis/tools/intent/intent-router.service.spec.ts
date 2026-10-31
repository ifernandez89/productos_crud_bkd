import { IntentRouterService } from './intent-router.service';

describe('IntentRouterService — Astrology & Location Intent Tests', () => {
  let router: IntentRouterService;

  beforeAll(() => {
    router = new IntentRouterService();
  });

  it('debe clasificar "Que puedes decirme sobre el \\"clima\\" astral?" como ASTROLOGY incluso con comillas', async () => {
    const result = await router.classify('Que puedes decirme sobre el "clima" astral?');
    expect(result.intent).toBe('ASTROLOGY');
    expect(result.confidence).toBe('high');
  });

  it('debe clasificar "clima astral" y variantes como ASTROLOGY', async () => {
    const r1 = await router.classify('cuál es el clima astral de hoy?');
    expect(r1.intent).toBe('ASTROLOGY');

    const r2 = await router.classify('panorama astral para esta noche');
    expect(r2.intent).toBe('ASTROLOGY');

    const r3 = await router.classify('clima astrologico');
    expect(r3.intent).toBe('ASTROLOGY');
  });

  it('debe clasificar consultas de identidad personal como LOCAL', async () => {
    const res = await router.classify('Que sabes sobre mi? Sabes quien soy?');
    expect(res.intent).toBe('LOCAL');
  });

  it('debe clasificar preguntas explicativas/conceptuales como LOCAL (sin secuestro por TOOL o ASTROLOGY)', async () => {
    const r1 = await router.classify('¿Cómo se forma un frente frío y qué cambios produce en el clima?');
    expect(r1.intent).toBe('LOCAL');
    expect(r1.confidence).toBe('high');

    const r2 = await router.classify('¿Qué es la energía y cuáles son sus principales formas?');
    expect(r2.intent).toBe('LOCAL');
    expect(r2.confidence).toBe('high');

    const r3 = await router.classify('¿Cuál es la diferencia entre masa, peso y gravedad?');
    expect(r3.intent).toBe('LOCAL');
    expect(r3.confidence).toBe('high');
  });

  it('debe clasificar operaciones deterministas de fecha como TOOL (date_math)', async () => {
    const r1 = await router.classify('¿Cuántos días faltan para terminar el año?');
    expect(r1.intent).toBe('TOOL');
    expect(r1.reason).toBe('date_math tool');

    const r2 = await router.classify('Si hoy es sábado, ¿qué fecha será dentro de 45 días?');
    expect(r2.intent).toBe('TOOL');
    expect(r2.reason).toBe('date_math tool');
  });

  it('debe clasificar consultas de conjunciones u oposiciones astronómicas como ASTROLOGY (sin desvío a SPORTS ni WEB)', async () => {
    const res = await router.classify('¿Hay conjunciones, oposiciones o eventos astronómicos destacados próximamente?');
    expect(res.intent).toBe('ASTROLOGY');
    expect(res.confidence).toBe('high');
  });
});
