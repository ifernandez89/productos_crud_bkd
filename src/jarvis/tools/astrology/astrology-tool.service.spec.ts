import { AstrologyTool } from './astrology-tool.service';

describe('AstrologyTool — Realtime Astronomy & Aspects', () => {
  let tool: AstrologyTool;

  beforeAll(() => {
    tool = new AstrologyTool();
  });

  it('debe calcular el clima astronómico del día con Sol, Luna, planetas y aspectos destacados', () => {
    const skyData = tool.getTodaySkyData(new Date('2026-10-31T15:00:00Z'));
    expect(skyData).toBeDefined();
    expect(skyData).toContain('Clima Astrológico');
    expect(skyData).toContain('Luna');
    expect(skyData).toContain('Sol ☀️');
    expect(skyData).toContain('Aspectos Planetarios Destacados:');
  });

  it('debe detectar la oposición Sol-Luna y la conjunción Luna-Venus el 31 de octubre de 2026', () => {
    const testDate = new Date('2026-10-31T18:00:00Z');
    const aspects = tool.calculateMajorAspects(testDate);
    expect(Array.isArray(aspects)).toBe(true);
    expect(aspects.length).toBeGreaterThan(0);

    const oppositionSunMoon = aspects.find(
      (a) =>
        a.type === 'Oposición' &&
        ((a.body1.includes('Sol') && a.body2.includes('Luna')) ||
          (a.body1.includes('Luna') && a.body2.includes('Sol'))),
    );
    expect(oppositionSunMoon).toBeDefined();
    expect(oppositionSunMoon?.orb).toBeLessThanOrEqual(2);

    const conjunctionMoonVenus = aspects.find(
      (a) =>
        a.type === 'Conjunción' &&
        ((a.body1.includes('Luna') && a.body2.includes('Venus')) ||
          (a.body1.includes('Venus') && a.body2.includes('Luna'))),
    );
    expect(conjunctionMoonVenus).toBeDefined();
    expect(conjunctionMoonVenus?.orb).toBeLessThanOrEqual(8);
  });

  it('debe calcular las posiciones planetarias completas con balance de elementos', () => {
    const positions = tool.getPlanetaryPositions(new Date('2026-10-31T15:00:00Z'));
    expect(positions).toContain('Posiciones Planetarias');
    expect(positions).toContain('Balance de Elementos:');
    expect(positions).toContain('Sol');
    expect(positions).toContain('Plutón');
    expect(positions).toContain('Aspectos Planetarios Destacados:');
  });
});

