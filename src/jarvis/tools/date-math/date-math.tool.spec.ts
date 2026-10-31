import { DateMathTool } from './date-math.tool';

describe('DateMathTool — Deterministic Time Arithmetic', () => {
  let tool: DateMathTool;
  const mockRefDate = new Date('2026-10-31T15:00:00Z'); // 31 de octubre de 2026 en UTC (12:00 ART)

  beforeAll(() => {
    tool = new DateMathTool();
  });

  it('debe calcular exactamente los días restantes para terminar el año desde el 31 de octubre', () => {
    const result = tool.resolve('¿Cuántos días faltan para terminar el año?', mockRefDate);
    expect(result.handled).toBe(true);
    expect(result.result).toContain('61 días');
    expect(result.details?.daysRemaining).toBe(61);
  });

  it('debe proyectar correctamente una fecha futura a 45 días', () => {
    const result = tool.resolve('Si hoy es sábado, ¿qué fecha será dentro de 45 días?', mockRefDate);
    expect(result.handled).toBe(true);
    expect(result.result).toContain('15 de diciembre de 2026');
    expect(result.result).toContain('martes');
  });

  it('debe calcular qué día de la semana cae una fecha futura', () => {
    const result = tool.resolve('¿Qué día cae el 25 de diciembre de 2026?', mockRefDate);
    expect(result.handled).toBe(true);
    expect(result.result).toContain('viernes');
  });

  it('debe manejar restas de días al pasado', () => {
    const result = tool.resolve('¿Qué fecha fue hace 10 días?', mockRefDate);
    expect(result.handled).toBe(true);
    expect(result.result).toContain('21 de octubre de 2026');
  });
});

