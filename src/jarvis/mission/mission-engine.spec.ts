import { MissionEngineService } from './mission-engine.service';
import { TaskEnvelope } from '../tools/task-envelope/task-envelope.types';

describe('MissionEngineService — Validación JCA Fase 3 (Agéntica Asíncrona)', () => {
  let missionEngine: MissionEngineService;

  const mockEnvelope: TaskEnvelope = {
    conversationId: 'conv-test-99',
    taskId: 'task-001',
    intent: 'SYSTEM_ADMIN',
    mode: 'MISSION',
    allowedTools: ['ffmpeg_runner', 'denoise_filter'],
    contextScope: ['jung_1959.mp4'],
    outputContract: 'TEXT_EVIDENCE',
    requiresApproval: false,
  };

  beforeEach(() => {
    missionEngine = new MissionEngineService();
  });

  it('M1: Registra una misión en estado PENDING y emite notificación inicial sin bloquear', () => {
    const mission = missionEngine.createMission(
      'mission-001',
      'Restauración Cinematográfica',
      'Procesar video con perfil de estudio y sin subtítulos',
      mockEnvelope,
      [
        { id: 'sub-1', description: 'Extracción de audio limpio', tool: 'ffmpeg_runner' },
        { id: 'sub-2', description: 'Colorización neuronal CIELAB', tool: 'denoise_filter' },
      ],
    );

    expect(mission.id).toBe('mission-001');
    expect(mission.state).toBe('PENDING');
    expect(mission.subtasks).toHaveLength(2);
    expect(mission.subtasks[0].status).toBe('pending');
    expect(mission.checkpoints).toHaveLength(0);

    const notifs = missionEngine.drainNotificationsForConversation('conv-test-99');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('STARTED');
    expect(notifs[0].message).toContain('Restauración Cinematográfica');
  });

  it('M2: Ejecuta paso exitoso con evidencia verificada, crea checkpoint SHA-256 y emite notificación', async () => {
    missionEngine.createMission(
      'mission-002',
      'Misión con evidencia',
      'Validar salida',
      mockEnvelope,
      [{ id: 'sub-1', description: 'Paso 1', tool: 'tool1' }],
    );

    // Drenar notif de inicio
    missionEngine.drainNotificationsForConversation('conv-test-99');

    const result = await missionEngine.executeStep('mission-002', 'sub-1', async () => {
      return {
        verified: true,
        exitCode: 0,
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        summary: 'Procesamiento exitoso sin errores',
      };
    });

    expect(result.status).toBe('completed');
    expect(result.evidence?.verified).toBe(true);
    expect(result.evidence?.exitCode).toBe(0);

    const mission = missionEngine.getMission('mission-002');
    expect(mission?.state).toBe('COMPLETED');
    expect(mission?.checkpoints).toHaveLength(1);
    expect(mission?.checkpoints[0].evidenceHash).toBeDefined();

    const notifs = missionEngine.drainNotificationsForConversation('conv-test-99');
    expect(notifs).toHaveLength(2); // CHECKPOINT + FINISHED
    expect(notifs[0].type).toBe('CHECKPOINT');
    expect(notifs[1].type).toBe('FINISHED');
  });

  it('M3: RECHAZO DE CONCLUSIÓN SIN EVIDENCIA — subtask falla si verified=false y la misión pasa a FAILED', async () => {
    missionEngine.createMission(
      'mission-003',
      'Misión sin verificación',
      'Debe fallar si no hay evidencia verídica',
      mockEnvelope,
      [{ id: 'sub-fail', description: 'Paso no verificado', tool: 'tool1' }],
    );

    missionEngine.drainNotificationsForConversation('conv-test-99');

    const result = await missionEngine.executeStep('mission-003', 'sub-fail', async () => {
      return {
        verified: false,
        exitCode: 1,
        summary: 'Fallo al verificar integridad de hash',
      };
    });

    expect(result.status).toBe('failed');
    expect(result.evidence?.verified).toBe(false);

    const mission = missionEngine.getMission('mission-003');
    expect(mission?.state).toBe('FAILED');
    expect(mission?.error).toContain('Fallo en verificación de subtarea #sub-fail');

    const notifs = missionEngine.drainNotificationsForConversation('conv-test-99');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('STEP_FAILED');
  });

  it('M4: Maneja excepciones no capturadas marcando la subtarea y la misión como FAILED', async () => {
    missionEngine.createMission(
      'mission-004',
      'Misión con excepción',
      'Probar resiliencia ante excepciones',
      mockEnvelope,
      [{ id: 'sub-crash', description: 'Paso con crash', tool: 'tool1' }],
    );

    const result = await missionEngine.executeStep('mission-004', 'sub-crash', async () => {
      throw new Error('CUDA Out of Memory');
    });

    expect(result.status).toBe('failed');
    const mission = missionEngine.getMission('mission-004');
    expect(mission?.state).toBe('FAILED');
    expect(mission?.error).toBe('CUDA Out of Memory');
  });

  it('M5: Reanuda una misión fallida desde su último checkpoint atómico exitoso', async () => {
    missionEngine.createMission(
      'mission-005',
      'Misión multi-paso recuperable',
      'Recuperación tras caída en paso 2',
      mockEnvelope,
      [
        { id: 'sub-1', description: 'Paso 1 exitoso', tool: 'tool1' },
        { id: 'sub-2', description: 'Paso 2 con fallo temporal', tool: 'tool2' },
      ],
    );

    // Paso 1 ok
    await missionEngine.executeStep('mission-005', 'sub-1', async () => ({
      verified: true,
      exitCode: 0,
      summary: 'Paso 1 listo',
    }));

    // Paso 2 falla
    await missionEngine.executeStep('mission-005', 'sub-2', async () => ({
      verified: false,
      summary: 'Error transitorio',
    }));

    let mission = missionEngine.getMission('mission-005');
    expect(mission?.state).toBe('FAILED');
    expect(mission?.subtasks[0].status).toBe('completed');
    expect(mission?.subtasks[1].status).toBe('failed');

    // Reanudar desde checkpoint
    const resumed = missionEngine.resumeFromCheckpoint('mission-005');
    expect(resumed).toBe(true);

    mission = missionEngine.getMission('mission-005');
    expect(mission?.state).toBe('CHECKPOINTED');
    expect(mission?.error).toBeUndefined();
    // Paso 1 se mantiene completed
    expect(mission?.subtasks[0].status).toBe('completed');
    // Paso 2 vuelve a pending
    expect(mission?.subtasks[1].status).toBe('pending');

    // Reejecutar paso 2 ahora con éxito
    await missionEngine.executeStep('mission-005', 'sub-2', async () => ({
      verified: true,
      exitCode: 0,
      summary: 'Paso 2 corregido',
    }));

    expect(mission?.state).toBe('COMPLETED');
    expect(mission?.subtasks.every((s) => s.status === 'completed')).toBe(true);
  });

  it('M6: Lanza error descriptivo si la misión o subtarea solicitada no existe', async () => {
    await expect(
      missionEngine.executeStep('non-existent', 'sub-1', async () => ({ verified: true })),
    ).rejects.toThrow('Misión #non-existent no encontrada');

    missionEngine.createMission(
      'mission-006',
      'Misión básica',
      'test',
      mockEnvelope,
      [{ id: 'sub-real', description: 'real', tool: 'tool1' }],
    );

    await expect(
      missionEngine.executeStep('mission-006', 'sub-fake', async () => ({ verified: true })),
    ).rejects.toThrow('Subtarea #sub-fake no encontrada en la misión #mission-006');
  });
});
