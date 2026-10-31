import { PowerBalanceTool } from './power-balance.tool';

describe('PowerBalanceTool — Deterministic Physical Energy Calculations', () => {
  let tool: PowerBalanceTool;

  beforeAll(() => {
    tool = new PowerBalanceTool();
  });

  it('debe calcular la autonomía exacta de batería con inversor al 90% (Q48)', () => {
    const query =
      'Una batería tiene 600 Wh de capacidad nominal y alimenta una carga de 120 W mediante un inversor con eficiencia del 90%. ¿Cuál sería la autonomía ideal aproximada, ignorando otras pérdidas?';
    const res = tool.resolve(query);

    expect(res.handled).toBe(true);
    expect(res.operation).toBe('battery_autonomy');
    expect(res.details?.capacityWh).toBe(600);
    expect(res.details?.loadPowerW).toBe(120);
    expect(res.details?.efficiency).toBe(0.9);
    expect(res.details?.batteryDrawPowerW).toBeCloseTo(133.33, 1);
    expect(res.details?.autonomyHours).toBeCloseTo(4.5, 2);
    expect(res.result).toContain('4.5 horas');
    expect(res.result).toContain('133.33');
    expect(res.result).toContain('Profundidad de Descarga');
  });

  it('debe dimensionar el consumo de una instalación solar de 200W x 8h (Q34)', () => {
    const query =
      '¿Cómo calcularías el tamaño aproximado de una instalación solar para alimentar un dispositivo que consume 200 W durante 8 horas diarias?';
    const res = tool.resolve(query);

    expect(res.handled).toBe(true);
    expect(res.operation).toBe('solar_sizing');
    expect(res.details?.dailyEnergyWh).toBe(1600);
    expect(res.details?.dailyEnergyKwh).toBe(1.6);
    expect(res.result).toContain('1600');
    expect(res.result).toContain('Wh/día');
    expect(res.result).toContain('Horas de Sol Pico (HSP)');
    expect(res.result).toContain('Performance Ratio');
  });
});
