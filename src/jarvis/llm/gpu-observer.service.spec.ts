import { DrainQueueService } from './drain-queue.service';
import { GpuObserverService } from './gpu-observer.service';
import { InferenceSupervisorService } from './inference-supervisor.service';
import { ModelLifecycleService } from './model-lifecycle.service';
import { TelemetryInspectionService } from './telemetry-inspection.service';

describe('GpuObserverService & Calibrated VRAM Profiles (DEV-001-B2.6)', () => {
  let drainQueue: DrainQueueService;
  let modelLifecycle: ModelLifecycleService;
  let mockSupervisor: Partial<InferenceSupervisorService>;
  let gpuObserver: GpuObserverService;

  beforeEach(() => {
    drainQueue = new DrainQueueService();
    mockSupervisor = {
      freeOllamaVram: jest.fn().mockResolvedValue(undefined),
      recover: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn().mockReturnValue({ status: 'RUNNING' }),
      getGpuTelemetry: jest.fn().mockReturnValue({
        vramUsedMiB: 10114,
        vramFreeMiB: 2113,
        vramTotalMiB: 12227,
        gpuTempC: 47,
        gpuUtilPercent: 2,
      }),
    };
    modelLifecycle = new ModelLifecycleService(
      drainQueue,
      mockSupervisor as InferenceSupervisorService,
    );
    gpuObserver = new GpuObserverService(
      mockSupervisor as InferenceSupervisorService,
      modelLifecycle,
    );
  });

  afterEach(() => {
    gpuObserver.clearExternalSnapshot();
    modelLifecycle.onApplicationShutdown();
    drainQueue.onApplicationShutdown();
  });

  it('calcula VRAM dinámica exacta por contexto (7B, Qwen3 8B y 14B) y protege 14B en buildOptimizedArgs', () => {
    const est7b = modelLifecycle.estimateVramForModel('qwen2.5-coder:7b', 8192);
    expect(est7b.kvBytesPerToken).toBe(30464);
    expect(est7b.totalProcessMiB).toBe(4729);
    expect(est7b.fitsWddmCeiling).toBe(true);

    const est8b = modelLifecycle.estimateVramForModel('qwen3:8b', 16384);
    expect(est8b.kvBytesPerToken).toBe(78336);
    expect(est8b.totalProcessMiB).toBe(6160);
    expect(est8b.fitsWddmCeiling).toBe(true);

    const est14b6k = modelLifecycle.estimateVramForModel('qwen2.5-coder:14b', 6144);
    expect(est14b6k.totalProcessMiB).toBe(9064);
    expect(est14b6k.fitsWddmCeiling).toBe(true);

    const est14b32k = modelLifecycle.estimateVramForModel('qwen2.5-coder:14b', 32768);
    expect(est14b32k.totalProcessMiB).toBeGreaterThan(11000);
    expect(est14b32k.fitsWddmCeiling).toBe(false);

    const args14b = modelLifecycle.buildOptimizedArgs(
      'C:\\AI\\models\\qwen2.5-coder-14b-q4_k_m.gguf',
      8080,
    );
    const cIdx = args14b.indexOf('-c');
    expect(args14b[cIdx + 1]).toBe('6144');
  });

  it('limpia BOM UTF-8 al ingestar GPUTaskman JSON y distingue Ollama staging vs spill destructivo 14B@32k', () => {
    const mib = 1048576;

    // Escenario Ollama bge-m3: shared=636 MiB pero con >10 GiB libres -> NORMAL (sin falso positivo)
    const ollamaPayloadWithBom =
      '\uFEFF' +
      JSON.stringify({
        taken: 1794348000,
        gpu: 'NVIDIA GeForce RTX 5070',
        driver: '617.42',
        cuda: '13.4',
        backend: 'wddm',
        shared_is_spill: true,
        vram_total: 12227 * mib,
        vram_used: 1319 * mib,
        shared_used: 692 * mib,
        adapter: { dedicated_vram: 11942 * mib },
        device: { temp: 45, util_gpu: 0, compute_cap: '12.0' },
        processes: [
          {
            pid: 15760,
            name: 'llama-server.exe',
            kind: 'embedding',
            vram_bytes: 834 * mib,
            shared_bytes: 636 * mib,
            paged_out_bytes: 0,
            gpu_pct: 0,
            llm: {
              models: [{ name: 'bge-m3', sources: ['cmdline', 'api'] }],
              server: { url: 'http://127.0.0.1:11434', model_path: 'C:\\Users\\x\\.ollama\\blob' },
              segments: [{ label: 'weights', kind: 'weights', bytes: 834 * mib, exact: false }],
            },
          },
        ],
      });

    const snapOllama = gpuObserver.ingestGputaskmanSnapshot(ollamaPayloadWithBom);
    expect(snapOllama.source).toBe('gputaskman_json');
    expect(snapOllama.pressureLevel).toBe('LOW');
    expect(snapOllama.llmAllocations[0].isOllamaRunner).toBe(true);
    expect(snapOllama.llmAllocations[0].spillStatus).toBe('NORMAL');

    // Escenario Exp A 14B @ 32k: shared=462 MiB en llama-server standalone y 33 MiB libres -> DESTRUCTIVE_SPILL_RISK
    const spillPayload = {
      taken: 1794348200,
      gpu: 'NVIDIA GeForce RTX 5070',
      backend: 'wddm',
      vram_total: 12227 * mib,
      vram_used: 11909 * mib,
      shared_used: 491 * mib,
      adapter: { dedicated_vram: 11942 * mib },
      processes: [
        {
          pid: 9901,
          name: 'llama-server.exe',
          kind: 'LLM',
          vram_bytes: 11479 * mib,
          shared_bytes: 462 * mib,
          paged_out_bytes: 0,
          gpu_pct: 0,
          llm: {
            n_ctx: 32768,
            kv_bytes_per_token: 104448,
            flags: { ctx: 32768, ctk: 'q8_0', ctv: 'q8_0' },
            models: [{ name: 'Qwen2.5 Coder 14B Instruct', sources: ['mapped', 'cmdline', 'api'] }],
            server: { url: 'http://127.0.0.1:8089', model_path: 'C:\\AI\\models\\qwen2.5-coder-14b-q4_k_m.gguf' },
            segments: [
              { kind: 'weights', bytes: 8148 * mib, exact: false },
              { kind: 'kv', bytes: 3264 * mib, exact: false },
              { kind: 'runtime', bytes: 67 * mib, exact: false },
            ],
          },
        },
      ],
    };

    const snapSpill = gpuObserver.ingestGputaskmanSnapshot(spillPayload);
    expect(snapSpill.pressureLevel).toBe('CRITICAL');
    expect(snapSpill.llmAllocations[0].isOllamaRunner).toBe(false);
    expect(snapSpill.llmAllocations[0].spillStatus).toBe('DESTRUCTIVE_SPILL_RISK');
    expect(snapSpill.llmAllocations[0].evidence).toBe('confirmed_api_mapped_cmdline');
  });

  it('detecta procesos competidores pesados y recomienda preflight en TelemetryInspectionService', () => {
    const mib = 1048576;
    gpuObserver.ingestGputaskmanSnapshot({
      vram_total: 12227 * mib,
      vram_used: 3800 * mib,
      adapter: { dedicated_vram: 11942 * mib },
      processes: [
        {
          pid: 4120,
          name: 'blender.exe',
          kind: 'app',
          vram_bytes: 2800 * mib,
          shared_bytes: 50 * mib,
          paged_out_bytes: 0,
          gpu_pct: 42,
          engines: { '3d': 42, compute: 15 },
        },
      ],
    });

    const preflight = gpuObserver.evaluateMissionPreflight({
      requestedModel: 'qwen2.5-coder:14b',
      requestedCtxTokens: 6144,
    });
    expect(preflight.mode).toBe('OBSERVE_ONLY');
    expect(preflight.canProceedNormally).toBe(false);
    expect(preflight.recommendedAction).toBe('DEFER_HEAVY_TASK_COMPETING_3D');
    expect(preflight.competingGpuProcesses[0].name).toBe('blender.exe');

    const telemetry = new TelemetryInspectionService(
      undefined,
      undefined,
      gpuObserver,
      modelLifecycle,
    );
    const budgetReport = telemetry.getBudgetTelemetryReport();
    expect(budgetReport.resourceBudget).toBeDefined();
    expect(budgetReport.resourceBudget?.recommendedAction).toBe(
      'DEFER_HEAVY_TASK_COMPETING_3D',
    );
  });

  it('usa nvidia_smi_fallback cuando no hay captura GPUTaskman externa', () => {
    const snap = gpuObserver.getSnapshot();
    expect(snap.source).toBe('nvidia_smi_fallback');
    expect(snap.boardMemory.freeMiB).toBe(11942 - 10114);
    expect(snap.pressureLevel).toBe('MODERATE');
  });
});

