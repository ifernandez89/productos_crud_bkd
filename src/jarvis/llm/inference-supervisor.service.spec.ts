import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import {
  InferenceSupervisorService,
  InferenceServerStatus,
} from './inference-supervisor.service';

jest.mock('axios');
jest.mock('child_process');
jest.mock('fs');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedChildProcess = childProcess as jest.Mocked<typeof childProcess>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('InferenceSupervisorService', () => {
  let supervisor: InferenceSupervisorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [InferenceSupervisorService],
    }).compile();

    supervisor = module.get<InferenceSupervisorService>(
      InferenceSupervisorService,
    );
  });

  it('debe inicializarse con estado inicial correcto', () => {
    const state = supervisor.getState();
    expect(state.port).toBe(8080);
    expect(state.circuitBreakerTripped).toBe(false);
    expect(state.managedByJarBees).toBe(false);
  });

  describe('isServerAlive', () => {
    it('debe devolver true cuando /health responde 200 ok', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok' },
      });

      const alive = await supervisor.isServerAlive();
      expect(alive).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://127.0.0.1:8080/health',
        expect.any(Object),
      );
    });

    it('debe devolver false ante ECONNREFUSED', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const alive = await supervisor.isServerAlive();
      expect(alive).toBe(false);
    });
  });

  describe('freeOllamaVram', () => {
    it('debe descargar modelos en memoria de Ollama llamando keep_alive: 0', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          models: [{ name: 'qwen3:8b' }, { name: 'qwen2.5-coder:7b' }],
        },
      });
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await supervisor.freeOllamaVram();

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        { model: 'qwen3:8b', keep_alive: 0 },
        expect.any(Object),
      );
    });
  });

  describe('startServer', () => {
    it('debe liberar VRAM de Ollama y spawnear llama-server.exe', async () => {
      // 1. isServerAlive inicial (false)
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // 2. freeOllamaVram /api/ps (vacío)
      mockedAxios.get.mockResolvedValueOnce({ data: { models: [] } });

      const mockChild: any = {
        pid: 12345,
        on: jest.fn(),
        kill: jest.fn(),
      };
      mockedChildProcess.spawn.mockReturnValueOnce(mockChild);

      // 3. waitUntilReady -> isServerAlive -> true
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok' },
      });

      await supervisor.startServer();

      expect(mockedChildProcess.spawn).toHaveBeenCalledWith(
        expect.stringContaining('llama-server.exe'),
        expect.arrayContaining(['--models-dir', expect.any(String), '-ngl', '99']),
        expect.any(Object),
      );

      const state = supervisor.getState();
      expect(state.status).toBe(InferenceServerStatus.RUNNING);
      expect(state.pid).toBe(12345);
      expect(state.managedByJarBees).toBe(true);
    });

    it('no debe duplicar spawn si el servidor ya está respondiendo', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok' },
      });

      await supervisor.startServer();

      expect(mockedChildProcess.spawn).not.toHaveBeenCalled();
      expect(supervisor.getState().status).toBe(InferenceServerStatus.RUNNING);
    });
  });

  describe('stopServer', () => {
    it('debe detener el proceso y actualizar el estado a STOPPED', async () => {
      // Simular que el proceso estaba corriendo
      (supervisor as any).serverProcess = { pid: 12345, kill: jest.fn() };
      (supervisor as any).managedByJarBees = true;
      (supervisor as any).status = InferenceServerStatus.RUNNING;

      mockedChildProcess.execSync.mockReturnValueOnce(Buffer.from('ok'));

      await supervisor.stopServer();

      const state = supervisor.getState();
      expect(state.status).toBe(InferenceServerStatus.STOPPED);
      expect(state.pid).toBeUndefined();
      expect(state.managedByJarBees).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    it('debe impedir auto-start si el circuit breaker está abierto por fallos repetidos', async () => {
      // Forzar 3 fallos
      (supervisor as any).recordFailure();
      (supervisor as any).recordFailure();
      (supervisor as any).recordFailure();

      expect(supervisor.getState().circuitBreakerTripped).toBe(true);
      expect(supervisor.getState().status).toBe(InferenceServerStatus.FAILED);

      // Intento de startServer mientras está FAILED debe arrojar error
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(supervisor.startServer()).rejects.toThrow(
        /Circuit breaker abierto/,
      );
    });
  });

  describe('onApplicationShutdown', () => {
    it('debe detener el servidor si fue levantado por JarBees', async () => {
      const stopSpy = jest.spyOn(supervisor, 'stopServer').mockResolvedValue();
      (supervisor as any).managedByJarBees = true;

      await supervisor.onApplicationShutdown('SIGTERM');

      expect(stopSpy).toHaveBeenCalled();
    });

    it('no debe matar el servidor si fue iniciado externamente', async () => {
      const stopSpy = jest.spyOn(supervisor, 'stopServer').mockResolvedValue();
      (supervisor as any).managedByJarBees = false;

      await supervisor.onApplicationShutdown('SIGTERM');

      expect(stopSpy).not.toHaveBeenCalled();
    });
  });
});
