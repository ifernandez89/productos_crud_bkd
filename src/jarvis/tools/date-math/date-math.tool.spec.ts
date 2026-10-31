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

  it('ADD_DURATION: debe sumar duración en minutos cruzando la medianoche', () => {
    const result = tool.resolve(
      'Si un evento comienza a las 23:30 y dura 150 minutos, ¿a qué hora termina?',
      mockRefDate,
    );
    expect(result.handled).toBe(true);
    expect(result.details?.startTime).toBe('23:30');
    expect(result.details?.endTime).toBe('02:00');
    expect(result.details?.daysOffset).toBe(1);
    expect(result.result).toContain('02:00 hs (del día siguiente)');
  });

  it('GENERATE_DATE_SERIES: debe proyectar ocurrencias con cambio de mes', () => {
    const result = tool.resolve(
      'Si una actividad se repite cada 17 días desde el 1 de noviembre, ¿cuáles serán sus tres próximas fechas?',
      mockRefDate,
    );
    expect(result.handled).toBe(true);
    expect(result.details?.occurrences).toHaveLength(3);
    expect(result.details?.occurrences[0].formatted).toContain('18 de noviembre');
    expect(result.details?.occurrences[1].formatted).toContain('5 de diciembre');
    expect(result.details?.occurrences[2].formatted).toContain('22 de diciembre');
  });
});
