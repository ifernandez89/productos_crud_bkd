import { VramInferenceSuite } from '../../../scripts/benchmark/vram_inference_suite';

describe('VramInferenceSuite (Checklist de 6 Puntos RTX 5070)', () => {
  let suite: VramInferenceSuite;

  beforeEach(() => {
    suite = new VramInferenceSuite();
  });

  it('debe ejecutar exitosamente la batería completa de 6 puntos de validación empírica', async () => {
    const report = await suite.runSuite();

    expect(report.testsRun).toBe(6);
    expect(report.testsPassed).toBe(6);
    expect(report.gpuTarget).toContain('RTX 5070');
    expect(report.totalVramLimitMb).toBe(10800);

    const testNames = report.metrics.map((m) => m.name);
    expect(testNames).toEqual(
      expect.arrayContaining([
        expect.stringContaining('1. Inferencia Base'),
        expect.stringContaining('2. Latencia de Swapping en NVMe'),
        expect.stringContaining('3. Auditoría Epistemológica'),
        expect.stringContaining('4. Estrés de VRAM'),
        expect.stringContaining('5. Aislamiento de Red'),
        expect.stringContaining('6. Calidad Comparativa'),
      ]),
    );
  });

  it('debe medir adecuadamente TTFT y tokens/s en contextos 2K, 8K, 16K y 32K', async () => {
    const result = await suite.benchmarkBaseInference(['qwen3:4b']);
    expect(result.passed).toBe(true);
    const details = result.details['qwen3:4b'];

    expect(details[2048].tokensPerSec).toBeGreaterThan(100);
    expect(details[32768].ttftMs).toBeGreaterThan(details[2048].ttftMs);
  });

  it('debe verificar que el swapping en NVMe PCIe 4.0 ocurra dentro del presupuesto de latencia (<2.5s)', async () => {
    const result = await suite.benchmarkNvmeSwapping();
    expect(result.passed).toBe(true);
    expect(result.details.totalSwapLatencyMs).toBeLessThan(2500);
  });

  it('debe verificar que el pico de VRAM no sobrepase los 10.8 GB en RTX 5070', async () => {
    const result = await suite.benchmarkVramStress();
    expect(result.passed).toBe(true);
    expect(result.details.maxRecordedPeakMb).toBeLessThanOrEqual(10800);
    expect(result.details.antiOomGuardStatus).toBe('PROTEGIDO');
  });
});
