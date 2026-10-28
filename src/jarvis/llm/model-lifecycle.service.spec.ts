import { ModelLifecycleService } from './model-lifecycle.service';
import { DrainQueueService } from './drain-queue.service';
import { InferenceSupervisorService } from './inference-supervisor.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ModelLifecycleService', () => {
  let service: ModelLifecycleService;
  let drainQueue: DrainQueueService;
  let supervisor: jest.Mocked<InferenceSupervisorService>;

  beforeEach(() => {
    jest.clearAllMocks();
    drainQueue = new DrainQueueService();

    supervisor = {
      freeOllamaVram: jest.fn().mockResolvedValue(undefined),
      recover: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn().mockReturnValue({ status: 'RUNNING' }),
    } as any;

    service = new ModelLifecycleService(drainQueue, supervisor);
  });

  afterEach(() => {
    drainQueue.onApplicationShutdown();
    service.onApplicationShutdown();
  });

  it('debe inicializarse con el modelo por defecto y calcular presupuesto VRAM', async () => {
    expect(service.getCurrentModel()).toBe('qwen3:4b');

    const vram = await service.getVramStatus();
    expect(vram.gpuName).toContain('RTX 5070');
    expect(vram.totalVramMb).toBe(12288);
    expect(vram.maxCeilingMb).toBe(10800);
    expect(vram.headroomMb).toBeGreaterThan(0);
    expect(vram.headroomMb).toBe(10800 - 2800);
  });

  it('no debe conmutar si el modelo solicitado ya es el activo', async () => {
    const result = await service.switchModel('qwen3:4b');

    expect(result.success).toBe(true);
    expect(result.swapDurationMs).toBe(0);
    expect(supervisor.freeOllamaVram).not.toHaveBeenCalled();
  });

  it('debe drenar peticiones y conmutar a nuevo modelo exitosamente', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'ok' },
    });

    const result = await service.switchModel('gemma3:4b');

    expect(result.success).toBe(true);
    expect(result.fromModel).toBe('qwen3:4b');
    expect(result.toModel).toBe('gemma3:4b');
    expect(service.getCurrentModel()).toBe('gemma3:4b');
    expect(service.getSwapCount()).toBe(1);
    expect(supervisor.freeOllamaVram).toHaveBeenCalled();
  });

  it('debe abortar conmutación si el drenaje falla y no se fuerza', async () => {
    // Simulamos fallo en drain
    jest.spyOn(drainQueue, 'drain').mockResolvedValueOnce({
      drained: false,
      remainingRequests: 3,
      elapsedMs: 15000,
    });

    const result = await service.switchModel('deepseek-r1:8b', {
      force: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Drenaje incompleto');
    expect(service.getCurrentModel()).toBe('qwen3:4b'); // No cambió
  });

  it('debe forzar la conmutación si force=true aunque queden peticiones', async () => {
    jest.spyOn(drainQueue, 'drain').mockResolvedValueOnce({
      drained: false,
      remainingRequests: 1,
      elapsedMs: 15000,
    });

    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'ok' },
    });

    const result = await service.switchModel('deepseek-r1:8b', { force: true });

    expect(result.success).toBe(true);
    expect(service.getCurrentModel()).toBe('deepseek-r1:8b');
  });

  it('debe generar argumentos optimizados con KV Cache cuantizada para RTX 5070', () => {
    const args = service.buildOptimizedArgs(
      'C:\\AI\\models\\qwen3-8b.gguf',
      8080,
    );

    expect(args).toContain('-c');
    expect(args).toContain('16384');
    expect(args).toContain('--ctk');
    expect(args).toContain('q8_0');
    expect(args).toContain('--ctv');
    expect(args).toContain('q8_0');
    expect(args).toContain('-ngl');
    expect(args).toContain('99');
  });
});
