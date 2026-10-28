import { DrainQueueService } from './drain-queue.service';

describe('DrainQueueService', () => {
  let service: DrainQueueService;

  beforeEach(() => {
    service = new DrainQueueService();
  });

  afterEach(() => {
    service.onApplicationShutdown();
  });

  it('debe registrar y liberar peticiones activas con acquireLease', () => {
    expect(service.getActiveCount('qwen3:4b')).toBe(0);

    const lease = service.acquireLease('qwen3:4b');
    expect(service.getActiveCount('qwen3:4b')).toBe(1);
    expect(service.getActiveCount()).toBe(1);

    lease.release();
    expect(service.getActiveCount('qwen3:4b')).toBe(0);
    expect(service.getActiveCount()).toBe(0);
  });

  it('no debe decrementar dos veces si se llama a release() repetidamente', () => {
    const lease = service.acquireLease('qwen3:4b');
    expect(service.getActiveCount('qwen3:4b')).toBe(1);

    lease.release();
    lease.release();
    expect(service.getActiveCount('qwen3:4b')).toBe(0);
  });

  it('debe envolver una ejecución asíncrona con trackRequest', async () => {
    let capturedInside = 0;
    const result = await service.trackRequest('gemma3:4b', async () => {
      capturedInside = service.getActiveCount('gemma3:4b');
      return 'done';
    });

    expect(result).toBe('done');
    expect(capturedInside).toBe(1);
    expect(service.getActiveCount('gemma3:4b')).toBe(0);
  });

  it('debe rechazar nuevos leases si el modelo está en estado DRAINING', () => {
    service.startDraining('qwen3:4b');
    expect(service.isDraining('qwen3:4b')).toBe(true);

    expect(() => service.acquireLease('qwen3:4b')).toThrow(
      /está en estado DRAINING/,
    );
  });

  it('debe esperar a que terminen las peticiones en vuelo durante el drain()', async () => {
    const lease1 = service.acquireLease('qwen3:8b');
    const lease2 = service.acquireLease('qwen3:8b');

    let drained = false;
    const drainPromise = service.drain('qwen3:8b', 5000).then((res) => {
      drained = res.drained;
      return res;
    });

    expect(service.isDraining('qwen3:8b')).toBe(true);
    expect(drained).toBe(false);

    // Liberamos primera petición
    lease1.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(drained).toBe(false);

    // Liberamos segunda petición
    lease2.release();
    const result = await drainPromise;

    expect(result.drained).toBe(true);
    expect(result.remainingRequests).toBe(0);
    expect(service.getActiveCount('qwen3:8b')).toBe(0);
  });

  it('debe aplicar la salvaguarda de timeout si las peticiones no terminan a tiempo', async () => {
    const lease = service.acquireLease('deepseek-r1:8b');

    // Usamos un timeout corto de 50ms para la prueba
    const result = await service.drain('deepseek-r1:8b', 50);

    expect(result.drained).toBe(false);
    expect(result.remainingRequests).toBe(1);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(40);

    lease.release();
    expect(service.getActiveCount('deepseek-r1:8b')).toBe(0);
  });

  it('debe soportar drenaje global para todos los modelos', async () => {
    service.acquireLease('qwen3:4b');
    service.acquireLease('gemma3:4b');
    expect(service.getActiveCount()).toBe(2);

    service.startDraining();
    expect(service.isDraining()).toBe(true);
    expect(service.isDraining('cualquier-modelo')).toBe(true);

    service.reset();
    expect(service.getActiveCount()).toBe(0);
    expect(service.isDraining()).toBe(false);
  });
});
