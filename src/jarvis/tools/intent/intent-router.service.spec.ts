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
});
