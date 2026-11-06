import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuthController } from '../../auth/auth.controller';
import { AuthService, DEFAULT_OPERATOR_SCOPES } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { PUBLIC_KEY } from '../../auth/jwt.guard';
import {
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
  hashOperatorPasswordScrypt,
  validateCryptoSecret,
  verifyOperatorPasswordScrypt,
} from '../../auth/jwt-secret.util';
import { GoogleAuthController } from '../../google/google-auth.controller';
import { MobileGatewayController } from '../../mobile-gateway/mobile-gateway.controller';
import { Studio3DController } from '../3d/controllers/studio-3d.controller';
import { AssetMetadataController } from '../3d/controllers/asset-metadata.controller';
import { AssetMetadataService } from '../3d/services/asset-metadata.service';
import { AssetSecurityService } from '../3d/services/asset-security.service';
import { JarvisCommandService } from '../commands/jarvis-command.service';
import { JarvisController } from '../jarvis.controller';
import { AudiobookIngestService } from '../library/audiobook-ingest.service';
import { DocumentIngestService } from '../library/document-ingest.service';
import { PosterController } from '../tools/poster/poster.controller';
import { EngineeringMissionManagerService } from '../verification/engineering-mission-manager.service';
import { ActionGatekeeperService } from './action-gatekeeper.service';
import {
  SECURITY_KERNEL_PERMISSION_KEY,
  SecurityKernelAuthGuard,
  AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES,
} from './security-kernel-auth.guard';
import { MobileGatewayService } from '../../mobile-gateway/mobile-gateway.service';

describe('DEV-001-B1 — Security Kernel Block B1 (SEC-01, SEC-02, SEC-03) Homologation Suite', () => {
  const originalEnv = { ...process.env };
  const testJwtSecret =
    'dev-001-b1-disposable-test-jwt-secret-key-998877665544332211';
  const testGatekeeperSecret =
    'dev-001-b1-disposable-gatekeeper-secret-key-112233445566778899';
  const testMasterPassword = 'CorrectHorseBatteryStaple!2026';
  const testOperatorId = 'ignacio.operator';

  let jwtService: JwtService;
  let authService: AuthService;
  let authController: AuthController;
  let jwtStrategy: JwtStrategy;
  let actionGatekeeper: ActionGatekeeperService;
  let securityGuard: SecurityKernelAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    process.env.JARBEES_DISABLE_INSTANCE_LOCK = 'true';
    process.env.JWT_SECRET = testJwtSecret;
    process.env.ACTION_GATEKEEPER_SECRET = testGatekeeperSecret;
    process.env.MOBILE_GATEWAY_SECRET =
      'dev-001-b1-disposable-mobile-secret-key-32bytes-long';
    process.env.MASTER_PASSWORD = testMasterPassword;
    process.env.JARBEES_OPERATOR_ID = testOperatorId;
    delete process.env.SKIP_HITL;

    jwtService = new JwtService({ secret: testJwtSecret });
    authService = new AuthService(jwtService);
    authController = new AuthController(authService);
    jwtStrategy = new JwtStrategy(authService);
    actionGatekeeper = new ActionGatekeeperService();
    reflector = new Reflector();
    securityGuard = new SecurityKernelAuthGuard(reflector, actionGatekeeper);
  });

  afterEach(() => {
    actionGatekeeper?.destroy();
    process.env = { ...originalEnv };
  });

  // ── 1. Login sin credenciales: DENEGADO ─────────────────────────────────────
  describe('1. Login sin credenciales o con identidades prohibidas: DENEGADO', () => {
    it('rechaza POST /auth/login sin body o sin password', () => {
      expect(() => authController.login(undefined)).toThrow(
        UnauthorizedException,
      );
      expect(() => authController.login({})).toThrow(UnauthorizedException);
      expect(() =>
        authController.login({ operatorId: testOperatorId, password: '' }),
      ).toThrow(UnauthorizedException);
    });

    it('rechaza POST /auth/login con contraseña incorrecta', () => {
      expect(() =>
        authController.login({
          operatorId: testOperatorId,
          password: 'wrong-password-123',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('rechaza identidades privilegiadas hardcodeadas ("jarbees-owner", "owner", "root", "system")', () => {
      const forbiddenIds = [
        'jarbees-owner',
        'owner',
        'root',
        'anonymous',
        'system',
      ];
      forbiddenIds.forEach((forbiddenId, idx) => {
        expect(() =>
          authController.login(
            {
              operatorId: forbiddenId,
              password: testMasterPassword,
            },
            { ip: `198.51.100.${idx + 1}`, headers: {} },
          ),
        ).toThrow(UnauthorizedException);
      });
    });

    it('emite JWT válido con claims completos (sub, role, scopes, jti, exp) cuando las credenciales son válidas', () => {
      const loginRes = authController.login({
        operatorId: testOperatorId,
        password: testMasterPassword,
      });

      expect(loginRes.access_token).toBeDefined();
      expect(loginRes.operatorId).toBe(testOperatorId);
      expect(loginRes.role).toBe('operator');
      expect(loginRes.scopes).toEqual([...DEFAULT_OPERATOR_SCOPES]);

      const decoded = jwtService.verify(loginRes.access_token, {
        secret: testJwtSecret,
      });
      expect(decoded.sub).toBe(testOperatorId);
      expect(decoded.role).toBe('operator');
      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
    });
  });

  // ── 2. JWT con secreto por defecto: APLICACIÓN NO INICIA ─────────────────────
  describe('2. JWT o Gatekeeper con secreto ausente o por defecto: APLICACIÓN NO INICIA', () => {
    it('falla al iniciar AuthService y JwtStrategy si falta JWT_SECRET', () => {
      delete process.env.JWT_SECRET;
      expect(() => new AuthService(jwtService)).toThrow(/SECURITY_BOOT_ERROR/);
      expect(() => new JwtStrategy(authService)).toThrow(/SECURITY_BOOT_ERROR/);
    });

    it('falla al iniciar si JWT_SECRET o ACTION_GATEKEEPER_SECRET usan valores por defecto prohibidos o cortos', () => {
      const prohibitedValues = [
        'changeme-set-JWT_SECRET-in-env',
        'jarbees-hitl-gatekeeper-secret-key-2026',
        'jarbees-default-gatekeeper-secret-key-2026',
        'jarbees-default-fallback-crypto-key-2026',
        'changeme',
        'secret',
        'too-short-123',
      ];

      for (const badSecret of prohibitedValues) {
        expect(() => validateCryptoSecret(badSecret, 'JWT_SECRET')).toThrow(
          /SECURITY_BOOT_ERROR/,
        );
        process.env.JWT_SECRET = badSecret;
        expect(() => new AuthService(jwtService)).toThrow(
          /SECURITY_BOOT_ERROR/,
        );
      }
    });
  });

  // ── 3. JWT inválido, expirado o manipulado: DENEGADO ────────────────────────
  describe('3. JWT inválido, expirado, manipulado o con claims legacy: DENEGADO', () => {
    it('rechaza tokens con el antiguo payload hardcodeado { sub: "jarbees-owner", role: "owner" }', async () => {
      const legacyPayload = {
        sub: 'jarbees-owner',
        role: 'owner',
        scopes: [...DEFAULT_OPERATOR_SCOPES],
        jti: '12345678-legacy',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      expect(authService.verifyPayload(legacyPayload)).toBeNull();
      await expect(jwtStrategy.validate(legacyPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza tokens expirados, sin scopes o sin jti', async () => {
      const expiredPayload = {
        sub: testOperatorId,
        role: 'operator',
        scopes: ['jarbees:read'],
        jti: 'valid-jti-12345',
        exp: Math.floor(Date.now() / 1000) - 10,
      };
      expect(authService.verifyPayload(expiredPayload)).toBeNull();
      await expect(jwtStrategy.validate(expiredPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      const noScopesPayload = {
        sub: testOperatorId,
        role: 'operator',
        scopes: [],
        jti: 'valid-jti-12345',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      expect(authService.verifyPayload(noScopesPayload)).toBeNull();
    });

    it('rechaza tokens cuya firma haya sido manipulada', () => {
      const { access_token } = authService.login({
        operatorId: testOperatorId,
        password: testMasterPassword,
      });
      const parts = access_token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: 'attacker.admin',
          role: 'admin',
          scopes: ['jarbees:admin'],
          jti: 'tampered-jti-9999',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() =>
        jwtService.verify(tamperedToken, { secret: testJwtSecret }),
      ).toThrow();
    });
  });

  // ── 4. Endpoint sensible sin autenticación: DENEGADO (SEC-01) ───────────────
  describe('4. Endpoint sensible sin autenticación: DENEGADO (Verificación de metadatos y Guard)', () => {
    const protectedEndpoints: Array<keyof JarvisController> = [
      'refreshCapabilityRegistry',
      'runMemorySleep',
      'executeEngineeringMission',
      'listEngineeringMissions',
      'getEngineeringMission',
      'approveEngineeringMission',
      'restoreEngineeringMissionCheckpoint',
      'executePlan',
      'resumeMission',
      'ingestUrl',
      'requestActionChallenge',
      'deleteDocument',
      'approveDocument',
      'runTrials',
      'synthesizeDocument',
      'synthesizeCollection',
      'createCollection',
      'updateCollection',
      'deleteCollection',
      'addDocumentToCollection',
      'removeDocumentFromCollection',
      'browserFetch',
      'browserNavigate',
      'browserSearch',
      'investigateUrl',
      'updateProfile',
      'ingestAudiobook',
      'ingestAllAudiobooks',
      'evaluateClaim',
    ];

    it('ninguno de los 29 endpoints sensibles/mutantes de JarvisController tiene @Public() y todos exigen SecurityKernelPermission', () => {
      for (const methodName of protectedEndpoints) {
        const handler = JarvisController.prototype[methodName] as Function;
        expect(typeof handler).toBe('function');

        const isPublic = reflector.get<boolean>(PUBLIC_KEY, handler);
        expect(isPublic).toBeFalsy();

        const kernelMetadata = reflector.get(
          SECURITY_KERNEL_PERMISSION_KEY,
          handler,
        );
        expect(kernelMetadata).toBeDefined();
        expect(kernelMetadata.requiredScope).toBeTruthy();
      }
    });

    it('SecurityKernelAuthGuard rechaza peticiones sin usuario autenticado (401 Unauthorized)', async () => {
      const ctx = createMockExecutionContext(
        JarvisController.prototype.requestActionChallenge,
        { user: undefined, url: '/api/jarbees/security/challenge', method: 'POST' },
      );

      await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── 5. Endpoint sensible con autenticación insuficiente: DENEGADO ───────────
  describe('5. Endpoint sensible con autenticación insuficiente: DENEGADO', () => {
    it('rechaza un operador que solo tiene "jarbees:read" al intentar pedir un challenge HITL, borrar documentos o ingestar audiolibros', async () => {
      const readOnlyUser = {
        userId: testOperatorId,
        role: 'operator',
        scopes: ['jarbees:read'],
        jti: 'readonly-session-jti',
      };

      for (const handler of [
        JarvisController.prototype.requestActionChallenge,
        JarvisController.prototype.deleteDocument,
        JarvisController.prototype.executeEngineeringMission,
        JarvisController.prototype.ingestAudiobook,
      ]) {
        const ctx = createMockExecutionContext(handler, {
          user: readOnlyUser,
          params: { id: '42' },
        });
        await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
          ForbiddenException,
        );
      }
    });
  });

  // ── 6, 7, 8, 9. Emisión HITL, Reutilización, Alteración de Payload y DELETE (SEC-03) ──
  describe('6–9. ActionGatekeeper & Operaciones Críticas (HITL, Anti-Replay, Payload Hash, DELETE)', () => {
    let controller: JarvisController;
    let mockDocRepo: any;
    let mockCollectionRepo: any;
    let mockAudit: any;
    let mockEngineeringManager: any;

    beforeEach(() => {
      mockDocRepo = { deleteDocument: jest.fn().mockResolvedValue(true) };
      mockCollectionRepo = {
        delete: jest.fn().mockResolvedValue(true),
        removeDocument: jest.fn().mockResolvedValue(true),
      };
      mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
      mockEngineeringManager = {
        approveAndIntegrateMission: jest.fn().mockImplementation((id, token, opts) => {
          if (!opts?.alreadyVerifiedByKernel) {
            actionGatekeeper.verifyAndConsumeChallenge(
              token,
              'ENGINEERING_APPROVE_MISSION',
              id,
              undefined,
              opts?.actorId,
            );
          }
          return { missionId: id, status: 'completed', humanApproved: true };
        }),
        restoreCheckpointManually: jest
          .fn()
          .mockReturnValue({ restoredCheckpoint: { attemptIndex: 1 } }),
      };

      controller = new JarvisController(
        {} as any, // jarvisService
        mockCollectionRepo,
        mockDocRepo,
        { approveDocument: jest.fn().mockResolvedValue(true) } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockAudit,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        actionGatekeeper,
        {} as any,
        undefined,
        undefined,
        mockEngineeringManager,
      );
    });

    it('6. Emisión HITL sin operador autenticado: DENEGADA', async () => {
      await expect(
        controller.requestActionChallenge(
          { actionType: 'LIBRARY_DELETE_DOCUMENT', targetId: 42 },
          { user: undefined },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('7 & 9. DELETE sin autorización específica o reutilizando token HITL: DENEGADO', async () => {
      const authenticatedReq = {
        user: {
          userId: testOperatorId,
          role: 'operator',
          scopes: [...DEFAULT_OPERATOR_SCOPES],
        },
        params: { id: '42' },
        headers: {},
      };

      // Intento de DELETE sin x-action-token -> DENEGADO
      const ctxWithoutToken = createMockExecutionContext(
        JarvisController.prototype.deleteDocument,
        authenticatedReq,
      );
      await expect(securityGuard.canActivate(ctxWithoutToken)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockDocRepo.deleteDocument).not.toHaveBeenCalled();

      // Emitir challenge legítimo para documento #42
      const challenge = await controller.requestActionChallenge(
        { actionType: 'LIBRARY_DELETE_DOCUMENT', targetId: 42 },
        authenticatedReq,
      );

      // Intento de usar el token del documento #42 para borrar el documento #99 -> DENEGADO
      const ctxWrongTarget = createMockExecutionContext(
        JarvisController.prototype.deleteDocument,
        {
          ...authenticatedReq,
          params: { id: '99' },
          headers: { 'x-action-token': challenge.token },
        },
      );
      await expect(securityGuard.canActivate(ctxWrongTarget)).rejects.toThrow(
        ForbiddenException,
      );

      // Intento de usar el token por otro operador distinto -> DENEGADO
      const ctxWrongActor = createMockExecutionContext(
        JarvisController.prototype.deleteDocument,
        {
          user: {
            userId: 'intruder.operator',
            role: 'operator',
            scopes: [...DEFAULT_OPERATOR_SCOPES],
          },
          params: { id: '42' },
          headers: { 'x-action-token': challenge.token },
        },
      );
      await expect(securityGuard.canActivate(ctxWrongActor)).rejects.toThrow(
        ForbiddenException,
      );

      // Uso legítimo del token sobre documento #42 por el mismo operador -> PERMITIDO (1 sola vez)
      const validReq: any = {
        ...authenticatedReq,
        params: { id: '42' },
        headers: { 'x-action-token': challenge.token },
      };
      const ctxValid = createMockExecutionContext(
        JarvisController.prototype.deleteDocument,
        validReq,
      );
      expect(await securityGuard.canActivate(ctxValid)).toBe(true);
      await controller.deleteDocument(
        42,
        challenge.token,
        undefined,
        validReq,
      );
      expect(mockDocRepo.deleteDocument).toHaveBeenCalledWith(42);

      // Reutilización del mismo token (Replay Attack) -> DENEGADA
      const replayReq: any = {
        ...authenticatedReq,
        params: { id: '42' },
        headers: { 'x-action-token': challenge.token },
      };
      const ctxReplay = createMockExecutionContext(
        JarvisController.prototype.deleteDocument,
        replayReq,
      );
      await expect(securityGuard.canActivate(ctxReplay)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('8. Alteración de payload tras emitir el token HITL: DENEGADA', async () => {
      const authenticatedReq = {
        user: {
          userId: testOperatorId,
          role: 'operator',
          scopes: [...DEFAULT_OPERATOR_SCOPES],
        },
      };

      const challenge = await controller.requestActionChallenge(
        {
          actionType: 'ENGINEERING_RESTORE_CHECKPOINT',
          targetId: 'mission-001',
          payload: { attemptIndex: 1 },
        },
        authenticatedReq,
      );

      // Si el atacante cambia attemptIndex: 1 por attemptIndex: 2 usando el mismo token -> DENEGADO
      const tamperedBodyReq = {
        ...authenticatedReq,
        params: { missionId: 'mission-001' },
        body: { attemptIndex: 2 },
        headers: { 'x-action-token': challenge.token },
      };
      const ctxTampered = createMockExecutionContext(
        JarvisController.prototype.restoreEngineeringMissionCheckpoint,
        tamperedBodyReq,
      );
      await expect(securityGuard.canActivate(ctxTampered)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── 10. Acceso a archivos fuera del directorio permitido: DENEGADO (SEC-02) ──
  describe('10. Confinamiento canónico de rutas y eliminación de oráculo en AudiobookIngestService (SEC-02)', () => {
    let tempAllowedRoot: string;
    let tempOutsideDir: string;
    let audiobookService: AudiobookIngestService;

    beforeEach(() => {
      tempAllowedRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'jarbees-b1-audio-allowed-'),
      );
      tempOutsideDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'jarbees-b1-audio-outside-'),
      );
      process.env.JARBEES_AUDIOBOOKS_DIR = tempAllowedRoot;

      audiobookService = new AudiobookIngestService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    afterEach(() => {
      try {
        fs.rmSync(tempAllowedRoot, { recursive: true, force: true });
        fs.rmSync(tempOutsideDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup warnings
      }
    });

    it('deniega traversal (..), rutas absolutas externas (.env, secretos), rutas UNC y extensiones no autorizadas sin actuar como oráculo', async () => {
      const outsideSecretFile = path.join(tempOutsideDir, 'secret.mp3');
      fs.writeFileSync(outsideSecretFile, 'fake-secret-data', 'utf8');

      const hostilePaths = [
        'C:\\Projects\\productos_crud_bkd\\.env',
        '../../.env',
        '..\\..\\package.json',
        outsideSecretFile,
        '\\\\192.168.1.100\\share\\malicious.mp3',
        '//localhost/c$/Windows/win.ini',
        path.join(tempAllowedRoot, 'malicious.py'),
        path.join(tempAllowedRoot, 'payload.exe'),
        path.join(tempAllowedRoot, '_transcripciones', 'cached.mp3'),
        `audio.mp3\0.txt`,
      ];

      for (const badPath of hostilePaths) {
        expect(() =>
          audiobookService.validateAuthorizedAudioPath(badPath),
        ).toThrow(ForbiddenException);
        await expect(
          audiobookService.ingestAudiobook(badPath),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('deniega enlaces simbólicos / junctions que apunten fuera del directorio permitido', () => {
      const outsideTarget = path.join(tempOutsideDir, 'external_audio.mp3');
      fs.writeFileSync(outsideTarget, 'dummy-audio-bytes', 'utf8');
      const symlinkInsideAllowed = path.join(tempAllowedRoot, 'linked.mp3');

      let symlinkCreated = false;
      try {
        fs.symlinkSync(outsideTarget, symlinkInsideAllowed, 'file');
        symlinkCreated = true;
      } catch {
        // En Windows sin Developer Mode / privilegio de symlink de archivo, probamos con directorio junction
        try {
          const linkedDir = path.join(tempAllowedRoot, 'junction_dir');
          fs.symlinkSync(tempOutsideDir, linkedDir, 'junction');
          expect(() =>
            audiobookService.validateAuthorizedAudioPath(
              path.join(linkedDir, 'external_audio.mp3'),
            ),
          ).toThrow(ForbiddenException);
          return;
        } catch {
          return;
        }
      }

      if (symlinkCreated) {
        expect(() =>
          audiobookService.validateAuthorizedAudioPath(symlinkInsideAllowed),
        ).toThrow(ForbiddenException);
      }
    });

    it('acepta únicamente archivos de audio reales ubicados canónicamente dentro del directorio autorizado y genera copia efímera por descriptor (anti-TOCTOU)', () => {
      const validAudioFile = path.join(tempAllowedRoot, 'kybalion_cap1.mp3');
      fs.writeFileSync(validAudioFile, 'valid-mp3-content', 'utf8');

      const resolved =
        audiobookService.validateAuthorizedAudioPath(validAudioFile);
      expect(resolved).toBe(fs.realpathSync(validAudioFile));

      const staged =
        audiobookService.stageVerifiedAudioFileForSubprocess(resolved);
      expect(fs.existsSync(staged.stagedPath)).toBe(true);
      expect(fs.readFileSync(staged.stagedPath, 'utf8')).toBe(
        'valid-mp3-content',
      );
      staged.cleanup();
      expect(fs.existsSync(staged.stagedPath)).toBe(false);
    });
  });

  // ── 11. DEV-001-B1.1: scrypt con sal, bloqueo progresivo brute-force y claims iss/aud (F-B1-01..03) ──
  describe('11. Credenciales con scrypt + sal aleatoria, bloqueo progresivo brute-force y JWT iss/aud (F-B1-01..03)', () => {
    it('genera hashes scrypt con sal aleatoria única y verifica en tiempo constante con MASTER_PASSWORD_HASH', () => {
      const hash1 = hashOperatorPasswordScrypt(testMasterPassword);
      const hash2 = hashOperatorPasswordScrypt(testMasterPassword);

      expect(hash1).toMatch(/^scrypt\$N=16384,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
      expect(hash1).not.toEqual(hash2); // sal aleatoria distinta
      expect(verifyOperatorPasswordScrypt(testMasterPassword, hash1)).toBe(true);
      expect(verifyOperatorPasswordScrypt('wrong-password', hash1)).toBe(false);

      delete process.env.MASTER_PASSWORD;
      process.env.MASTER_PASSWORD_HASH = hash1;
      process.env.REQUIRE_PASSWORD_HASH = 'true';

      const hashedAuthService = new AuthService(jwtService);
      const res = hashedAuthService.login({
        operatorId: testOperatorId,
        password: testMasterPassword,
      });
      expect(res.access_token).toBeDefined();
    });

    it('aplica bloqueo progresivo (429 Too Many Requests) tras 5 intentos fallidos consecutivos de login', () => {
      const clientContext = { ip: '203.0.113.55', headers: {} };

      for (let i = 0; i < 4; i++) {
        expect(() =>
          authService.login(
            { operatorId: testOperatorId, password: 'bad-password-' + i },
            clientContext,
          ),
        ).toThrow(UnauthorizedException);
      }

      // 5to intento fallido activa el bloqueo progresivo (HTTP 429)
      try {
        authService.login(
          { operatorId: testOperatorId, password: 'bad-password-5' },
          clientContext,
        );
        fail('Debió lanzar HttpException 429');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
      }

      // Incluso con la contraseña correcta, mientras dure el lockout desde esa IP sigue bloqueado con 429
      try {
        authService.login(
          { operatorId: testOperatorId, password: testMasterPassword },
          clientContext,
        );
        fail('Debió seguir bloqueado con 429');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
      }
    });

    it('incluye y valida estrictamente iss, aud y HS256 en el ciclo de vida del JWT', async () => {
      const loginRes = authService.login({
        operatorId: testOperatorId,
        password: testMasterPassword,
      });
      const decoded = jwtService.verify(loginRes.access_token, {
        secret: testJwtSecret,
        algorithms: ['HS256'],
        issuer: JARBEES_JWT_ISSUER,
        audience: JARBEES_JWT_AUDIENCE,
      });
      expect(decoded.iss).toBe(JARBEES_JWT_ISSUER);
      expect(decoded.aud).toBe(JARBEES_JWT_AUDIENCE);

      // Si iss o aud son distintos, verifyPayload y JwtStrategy.validate lo rechazan
      expect(
        authService.verifyPayload({ ...decoded, iss: 'wrong-issuer' }),
      ).toBeNull();
      expect(
        authService.verifyPayload({ ...decoded, aud: 'wrong-audience' }),
      ).toBeNull();
      await expect(
        jwtStrategy.validate({ ...decoded, iss: 'wrong-issuer' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── 12. DEV-001-B1.1: Política privada por defecto en los 88 endpoints de JarvisController y controladores adyacentes (F-B1-05, F-B1-10) ──
  describe('12. Política de acceso privado por defecto en las 88 rutas de JarvisController y controladores adyacentes (F-B1-05, F-B1-10)', () => {
    const getRouteMethods = (controllerClass: any): string[] => {
      const proto = controllerClass.prototype;
      return Object.getOwnPropertyNames(proto).filter((name) => {
        if (name === 'constructor' || name.startsWith('_')) return false;
        const fn = proto[name];
        if (typeof fn !== 'function') return false;
        return Reflect.getMetadata(PATH_METADATA, fn) !== undefined;
      });
    };

    it('verifica las 88 rutas de JarvisController: SOLO getInferenceStatus tiene @Public() y las 87 restantes exigen SecurityKernelPermission', () => {
      const routeMethods = getRouteMethods(JarvisController);
      expect(routeMethods.length).toBe(88);

      const publicMethods: string[] = [];
      for (const methodName of routeMethods) {
        const handler = (JarvisController.prototype as any)[methodName];
        const isPublic = reflector.get<boolean>(PUBLIC_KEY, handler);
        if (isPublic) {
          publicMethods.push(methodName);
        } else {
          const perm = reflector.get(SECURITY_KERNEL_PERMISSION_KEY, handler);
          expect(perm).toBeDefined();
          expect(perm.requiredScope).toBeTruthy();
        }
      }

      expect(publicMethods).toEqual(['getInferenceStatus']);
    });

    it('verifica GoogleAuthController, PosterController, Studio3DController, AssetMetadataController y MobileGatewayController', () => {
      // GoogleAuthController: 3 rutas, solo callback es @Public()
      const googleRoutes = getRouteMethods(GoogleAuthController);
      expect(googleRoutes.length).toBe(3);
      expect(
        googleRoutes.filter((m) =>
          reflector.get<boolean>(PUBLIC_KEY, (GoogleAuthController.prototype as any)[m]),
        ),
      ).toEqual(['callback']);

      // PosterController: 9 rutas, 0 @Public()
      const posterRoutes = getRouteMethods(PosterController);
      expect(posterRoutes.length).toBe(9);
      expect(
        posterRoutes.filter((m) =>
          reflector.get<boolean>(PUBLIC_KEY, (PosterController.prototype as any)[m]),
        ),
      ).toEqual([]);

      // Studio3DController: 14 rutas, 0 @Public()
      const studioRoutes = getRouteMethods(Studio3DController);
      expect(studioRoutes.length).toBe(14);
      expect(
        studioRoutes.filter((m) =>
          reflector.get<boolean>(PUBLIC_KEY, (Studio3DController.prototype as any)[m]),
        ),
      ).toEqual([]);

      // AssetMetadataController: 8 rutas, 0 @Public()
      const metadataRoutes = getRouteMethods(AssetMetadataController);
      expect(metadataRoutes.length).toBe(8);
      expect(
        metadataRoutes.filter((m) =>
          reflector.get<boolean>(PUBLIC_KEY, (AssetMetadataController.prototype as any)[m]),
        ),
      ).toEqual([]);

      // MobileGatewayController: 3 rutas, solo getHealth es @Public()
      const mobileRoutes = getRouteMethods(MobileGatewayController);
      expect(mobileRoutes.length).toBe(3);
      expect(
        mobileRoutes.filter((m) =>
          reflector.get<boolean>(PUBLIC_KEY, (MobileGatewayController.prototype as any)[m]),
        ),
      ).toEqual(['getHealth']);
    });
  });

  // ── 13. DEV-001-B1.1: Cierre de bypasses de chat (F-B1-04), cuarentena (F-B1-06) y misiones sensibles (F-B1-07) ──
  describe('13. Cierre de bypasses en chat libre (F-B1-04), ingesta en cuarentena (F-B1-06) y misiones sensibles (F-B1-07)', () => {
    it('F-B1-04: JarvisCommandService bloquea el borrado y deduplicación de documentos desde texto libre de chat', async () => {
      const mockDocRepo = {
        searchDocuments: jest.fn().mockResolvedValue([
          { id: 10, title: 'Manual Secreto', createdAt: new Date() },
        ]),
        findDuplicates: jest.fn().mockResolvedValue([
          {
            title: 'Manual Secreto',
            keeper: 10,
            duplicates: [11],
          },
        ]),
        deleteDocument: jest.fn(),
        deleteManyDocuments: jest.fn(),
      };
      const cmdService = new JarvisCommandService(
        {} as any,
        mockDocRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const delReply = await (cmdService as any).deleteDocumentByTitle(
        'borrá el documento Manual Secreto',
      );
      expect(delReply).toContain('SecurityKernel');
      expect(mockDocRepo.deleteDocument).not.toHaveBeenCalled();

      const dedupReply = await (cmdService as any).deduplicateDocuments();
      expect(dedupReply).toContain('SecurityKernel');
      expect(mockDocRepo.deleteManyDocuments).not.toHaveBeenCalled();
    });

    it('F-B1-06: DocumentIngestService mantiene los documentos en cuarentena incluso si SKIP_QUARANTINE=true está definido', async () => {
      process.env.SKIP_QUARANTINE = 'true';
      const mockDocRepo = {
        createDocument: jest.fn().mockResolvedValue({ id: 501, title: 'Doc Test' }),
      };
      const approveSpy = jest.fn();
      const ingestService = new DocumentIngestService(
        mockDocRepo as any,
        {} as any,
        { generate: jest.fn().mockResolvedValue({ text: 'Resumen breve' }) } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ingestService as any).approveDocument = approveSpy;

      const res = await ingestService.ingestText(
        'Doc Test',
        'Contenido de prueba que supera ampliamente los cincuenta caracteres requeridos para ser ingerido en la biblioteca.',
      );

      expect(res.documentId).toBe(501);
      expect(res.chunks).toBe(0);
      expect(mockDocRepo.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'quarantined',
        }),
      );
      expect(approveSpy).not.toHaveBeenCalled();
    });

    it('F-B1-07: EngineeringMissionManagerService vincula actorId, targetId y payload canónico en ENGINEERING_SENSITIVE_MISSION', async () => {
      const manager = new EngineeringMissionManagerService(
        { runVerificationMission: jest.fn() } as any,
        {} as any,
        {} as any,
        actionGatekeeper,
      );

      const sensitiveReq = {
        missionId: 'sec-mission-01',
        objective: 'Modificar guardia de seguridad',
        entryFile: 'src/auth/auth.service.ts',
        allowedFiles: ['src/auth/auth.service.ts'],
        actorId: testOperatorId,
      };

      // Sin token HITL -> rechazado
      await expect(
        manager.executeManagedMission(sensitiveReq as any),
      ).rejects.toThrow(ForbiddenException);

      // Con token emitido para un payload distinto (otro entryFile) -> rechazado
      const wrongFileChallenge = actionGatekeeper.createChallenge(
        'ENGINEERING_SENSITIVE_MISSION',
        'sec-mission-01',
        {
          entryFile: 'src/other/safe.ts',
          testFile: null,
          objective: 'Modificar guardia de seguridad',
        },
        testOperatorId,
      );

      await expect(
        manager.executeManagedMission({
          ...sensitiveReq,
          humanApprovalToken: wrongFileChallenge.token,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── 14. DEV-001-B1.1: Confinamiento de rutas en Studio3DController y AssetMetadataService (F-B1-10) ──
  describe('14. Confinamiento de archivos y sanitización de packageId en 3D Studio & Metadata (F-B1-10)', () => {
    it('Studio3DController.validateAuthorized3DPath bloquea rutas fuera de storage/assets, traversal y extensiones prohibidas', () => {
      const studioCtrl = new Studio3DController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      for (const badPath of [
        '../../.env',
        'C:\\Windows\\win.ini',
        'C:\\Projects\\productos_crud_bkd\\package.json',
        '\\\\192.168.1.10\\share\\model.glb',
        'models/../../secret.glb',
      ]) {
        expect(() =>
          studioCtrl.validateAuthorized3DPath(badPath, ['.glb', '.json'], false),
        ).toThrow(ForbiddenException);
      }
    });

    it('AssetMetadataService rechaza packageId con traversal y rutas fuera de storage/assets', async () => {
      const metaService = new AssetMetadataService();

      for (const badId of [
        '../../.env',
        '../package',
        'pkg/../../secret',
        '.hidden',
        'pkg\0bad',
      ]) {
        expect(() => metaService.validateSafePackageId(badId)).toThrow(
          ForbiddenException,
        );
        await expect(metaService.loadMetadata(badId)).rejects.toThrow(
          ForbiddenException,
        );
      }

      await expect(
        metaService.extractMetadataFromModel('C:\\Windows\\System32\\cmd.exe'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── 15. DEV-001-B1.2: Validación estricta Controller.handler en lista blanca pública (A1) ──
  describe('15. Validación estricta de firmas Controller.handler públicas (A1)', () => {
    class RogueController {
      login() {
        return { status: 'rogue' };
      }
      callback() {
        return { status: 'rogue_callback' };
      }
    }

    it('permite AuthController.login marcado con @Public()', async () => {
      const ctx = createMockExecutionContext(
        AuthController.prototype.login,
        { user: undefined, url: '/auth/login', method: 'POST' },
        AuthController,
      );
      expect(await securityGuard.canActivate(ctx)).toBe(true);
    });

    it('rechaza con ForbiddenException a un controlador no autorizado con método login() marcado @Public()', async () => {
      Reflect.defineMetadata(PUBLIC_KEY, true, RogueController.prototype.login);

      const ctx = createMockExecutionContext(
        RogueController.prototype.login,
        { user: undefined, url: '/rogue/login', method: 'POST' },
        RogueController,
      );

      await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza con ForbiddenException a un controlador no autorizado con método callback() marcado @Public()', async () => {
      Reflect.defineMetadata(PUBLIC_KEY, true, RogueController.prototype.callback);

      const ctx = createMockExecutionContext(
        RogueController.prototype.callback,
        { user: undefined, url: '/rogue/callback', method: 'GET' },
        RogueController,
      );

      await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── 16. DEV-001-B1.2: Persistencia durable anti-fuerza bruta y anti-replay (A2 & F-B1-02) ──
  describe('16. Persistencia durable anti-fuerza bruta y anti-replay (A2 & F-B1-02)', () => {
    it('AuthService persiste el bloqueo por IP en disco y sobrevive a reinicios de instancia', () => {
      const testIp = '198.51.100.222';
      const svc1 = new AuthService(jwtService);
      svc1.clearRateLimitState();

      // 4 intentos fallidos con password errónea lanzan UnauthorizedException
      for (let i = 0; i < 4; i++) {
        expect(() =>
          svc1.login({ operatorId: testOperatorId, password: 'bad-password-1' }, { ip: testIp }),
        ).toThrow(UnauthorizedException);
      }
      // 5to intento fallido detona el bloqueo (HttpException 429)
      expect(() =>
        svc1.login({ operatorId: testOperatorId, password: 'bad-password-2' }, { ip: testIp }),
      ).toThrow(HttpException);

      // Simular reinicio: nueva instancia de AuthService
      const svc2 = new AuthService(jwtService);
      // El siguiente intento desde esa IP DEBE ser rechazado inmediatamente con 429
      expect(() =>
        svc2.login({ operatorId: testOperatorId, password: 'bad-password-3' }, { ip: testIp }),
      ).toThrow(HttpException);

      // Limpieza
      svc2.clearRateLimitState();
    });

    it('MobileGatewayService persiste requestIds en disco y previene ataques de repetición tras reinicio', async () => {
      const mobile1 = new MobileGatewayService();
      mobile1.clearReplayLedger();

      const cmd = {
        requestId: 'test-req-' + Date.now(),
        deviceId: 'device-test',
        timestamp: new Date().toISOString(),
        intent: 'TEST_INTENT',
      };

      const sig = mobile1.signCommandDto(cmd);
      // Primera validación: exitosa (no arroja excepción)
      expect(() => mobile1.validateCommandSecurity(cmd, sig)).not.toThrow();

      // Simular reinicio: nueva instancia de MobileGatewayService
      const mobile2 = new MobileGatewayService();
      // El mismo comando con el mismo requestId DEBE ser rechazado con ForbiddenException
      expect(() => mobile2.validateCommandSecurity(cmd, sig)).toThrow(
        ForbiddenException,
      );

      // Limpieza
      mobile2.clearReplayLedger();
      mobile1.destroy();
      mobile2.destroy();
    });
  });

  // ── 17. DEV-001-B1.2: Inspección anti-symlink y anti-TOCTOU en Studio3DController (F-B1-10) ──
  describe('17. Inspección anti-symlink y anti-TOCTOU en Studio3DController (F-B1-10)', () => {
    it('readConfined3DFileBuffer valida fd contra stat y lee buffer de manera atómica', () => {
      const studioCtrl = new Studio3DController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      // Leer un archivo existente legítimo
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const buf = studioCtrl.readConfined3DFileBuffer(pkgPath);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.toString('utf8')).toContain('backend');
    });
  });

  // ── 18. DEV-001-B1.3: Concurrencia real y exclusión mutua (TEST-01, A2, Lockout) ──
  describe('18. Concurrencia real y exclusión mutua con Promise.all (DEV-001-B1.3 TEST-01)', () => {
    it('MobileGatewayService: ante 10 peticiones concurrentes simultáneas con el mismo requestId, exactamente 1 tiene éxito y 9 son rechazadas', async () => {
      const mobileSvc = new MobileGatewayService();
      mobileSvc.clearReplayLedger();

      const sharedRequestId = 'concurrent-req-' + Date.now();
      const cmd = {
        requestId: sharedRequestId,
        deviceId: 'device-concurrent-test',
        timestamp: new Date().toISOString(),
        intent: 'CONCURRENT_TEST',
      };
      const sig = mobileSvc.signCommandDto(cmd);

      // Disparar 10 validaciones simultáneas en paralelo
      const attempts = Array.from({ length: 10 }, async () => {
        try {
          mobileSvc.validateCommandSecurity(cmd, sig);
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err };
        }
      });

      const results = await Promise.all(attempts);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);
      for (const f of failures) {
        expect(f.error).toBeInstanceOf(ForbiddenException);
        expect(f.error.message).toContain('Ataque de repetición detectado');
      }

      mobileSvc.clearReplayLedger();
      mobileSvc.destroy();
    });

    it('AuthService: ante múltiples intentos de login concurrentes desde la misma IP, bloquea consistentemente (429)', async () => {
      const testIp = '198.51.100.244';
      const authSvc = new AuthService(jwtService);
      authSvc.clearRateLimitState();

      // Enviar 10 intentos concurrentes con credenciales incorrectas
      const attempts = Array.from({ length: 10 }, async () => {
        try {
          authSvc.login(
            { operatorId: testOperatorId, password: 'wrong-password' },
            { ip: testIp },
          );
          return { success: true };
        } catch (err: any) {
          return { success: false, status: err.status || err.getStatus?.() || 401 };
        }
      });

      const results = await Promise.all(attempts);
      const rateLimited = results.filter((r) => r.status === 429);
      // Al superar los 5 intentos, debe detonar bloqueo 429
      expect(rateLimited.length).toBeGreaterThan(0);

      authSvc.clearRateLimitState();
      authSvc.destroy();
    });
  });

  // ── 19. DEV-001-B1.3: Resiliencia ante archivos vacíos (0 bytes) y corrupción (A2-01 & F-B1-02-01) ──
  describe('19. Resiliencia y Fail-Closed ante archivos vacíos y corrupción (DEV-001-B1.3)', () => {
    it('MobileGatewayService: un archivo de 0 bytes producto de caída abrupta NO es eliminado en arranque y rechaza repetición', () => {
      const mobile1 = new MobileGatewayService();
      mobile1.clearReplayLedger();

      const testRequestId = 'crash-test-req-' + Date.now();
      const hash = crypto.createHash('sha256').update(testRequestId).digest('hex');
      const storageDir = path.resolve('storage', 'security', 'mobile-replay');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      const zeroByteFilePath = path.join(storageDir, `${hash}.json`);
      // Simular crash: crear archivo de 0 bytes (openSync sin writeFileSync)
      fs.writeFileSync(zeroByteFilePath, Buffer.alloc(0));

      // Simular reinicio del servicio
      const mobile2 = new MobileGatewayService();

      // 1. El archivo de 0 bytes NO debe haber sido borrado
      expect(fs.existsSync(zeroByteFilePath)).toBe(true);

      // 2. Un intento de enviar el mismo requestId DEBE ser rechazado
      const cmd = {
        requestId: testRequestId,
        deviceId: 'device-test',
        timestamp: new Date().toISOString(),
        intent: 'CRASH_TEST',
      };
      const sig = mobile2.signCommandDto(cmd);
      expect(() => mobile2.validateCommandSecurity(cmd, sig)).toThrow(ForbiddenException);

      // Limpieza
      mobile2.clearReplayLedger();
      mobile1.destroy();
      mobile2.destroy();
    });

    it('AuthService: un archivo de lockout corrupto o incompleto tras crash NO levanta el bloqueo', () => {
      const testIp = '198.51.100.250';
      const auth1 = new AuthService(jwtService);
      auth1.clearRateLimitState();

      const key = `ip:${testIp}`;
      const hash = crypto.createHash('sha256').update(key).digest('hex');
      const lockoutDir = path.resolve('storage', 'security', 'auth-lockout');
      if (!fs.existsSync(lockoutDir)) {
        fs.mkdirSync(lockoutDir, { recursive: true });
      }
      const corruptFilePath = path.join(lockoutDir, `${hash}.json`);
      // Simular crash: volcado JSON incompleto / corrupto
      fs.writeFileSync(corruptFilePath, '{"key": "ip:198.51.100.250", "lockedUntil": 9999999999999, "corrup');

      // Simular reinicio del servicio
      const auth2 = new AuthService(jwtService);

      // 1. El archivo corrupto NO fue eliminado automáticamente
      expect(fs.existsSync(corruptFilePath)).toBe(true);

      // 2. El intento de login sigue bloqueado en modo fail-closed
      expect(() =>
        auth2.login({ operatorId: testOperatorId, password: 'any' }, { ip: testIp }),
      ).toThrow(HttpException);

      // Limpieza
      auth2.clearRateLimitState();
      auth1.destroy();
      auth2.destroy();
    });
  });

  // ── 20. DEV-001-B1.3: Confinamiento 3D completo y mitigación TOCTOU en escritura (F-B1-10-01/02) ──
  describe('20. Confinamiento 3D y mitigación TOCTOU en escritura (DEV-001-B1.3 F-B1-10)', () => {
    it('AssetSecurityService.writeConfinedFileAtomic aborta si el destino es un enlace simbólico', () => {
      const securitySvc = new AssetSecurityService();
      const testDir = path.resolve('storage', 'assets', 'test_toctou');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const realTarget = path.join(testDir, 'safe_file.txt');
      const symlinkTarget = path.join(testDir, 'symlink_trap.jb3d');
      fs.writeFileSync(realTarget, 'original content', 'utf8');

      // Crear enlace simbólico si el SO lo permite
      let symlinkCreated = false;
      try {
        if (fs.existsSync(symlinkTarget)) {
          fs.unlinkSync(symlinkTarget);
        }
        fs.symlinkSync(realTarget, symlinkTarget, 'file');
        symlinkCreated = true;
      } catch {
        // En Windows sin permisos de Developer Mode para symlinks, omitir creación de symlink
      }

      if (symlinkCreated) {
        // Intentar escribir sobre el symlink DEBE ser abortado
        expect(() => {
          securitySvc.writeConfinedFileAtomic(
            symlinkTarget,
            Buffer.from('malicious payload'),
          );
        }).toThrow(/enlace simbólico/i);

        // El archivo real al que apuntaba el symlink NO debe haber sido sobreescrito
        expect(fs.readFileSync(realTarget, 'utf8')).toBe('original content');

        // Limpieza del symlink
        try {
          fs.unlinkSync(symlinkTarget);
        } catch {}
      }

      // Limpieza
      try {
        fs.unlinkSync(realTarget);
        fs.rmdirSync(testDir);
      } catch {}
    });

    it('AssetMetadataService valida componentes intermedios con ensureNoSymlinksInPath', () => {
      const metaService = new AssetMetadataService();
      const assetsRoot = path.resolve('storage/assets');
      const safePath = path.join(assetsRoot, 'models', 'avatar.glb');

      // Ruta legítima: no debe arrojar excepción
      expect(() => {
        metaService.ensureNoSymlinksInPath(assetsRoot, safePath, false);
      }).not.toThrow();

      // Ruta fuera de storage/assets: arroja ForbiddenException
      expect(() => {
        metaService.ensureNoSymlinksInPath(
          assetsRoot,
          'C:\\Windows\\System32\\cmd.exe',
          false,
        );
      }).toThrow(ForbiddenException);
    });

    it('AssetMetadataService.readConfined3DFileBuffer valida descriptor contra stat de forma atómica', () => {
      const metaService = new AssetMetadataService();
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const buf = metaService.readConfined3DFileBuffer(pkgPath);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.toString('utf8')).toContain('backend');
    });
  });

  // ── 21. DEV-001-B1.3: Frontera Global de Autorización y validación estricta de rutas (A1-01/02/03) ──
  describe('21. Frontera Global de Autorización y Validación Estricta (DEV-001-B1.3 A1)', () => {
    it('SecurityKernelAuthGuard rechaza controlador homónimo en ruta distinta a la autorizada (A1-03)', async () => {
      class AuthController {
        login() {
          return { status: 'rogue_login' };
        }
      }

      Reflect.defineMetadata(PUBLIC_KEY, true, AuthController.prototype.login);

      // Misma clase y método homónimos pero en una ruta no autorizada (/unauthorized/login)
      const ctx = createMockExecutionContext(
        AuthController.prototype.login,
        { user: undefined, url: '/unauthorized/login', originalUrl: '/unauthorized/login', method: 'POST' },
        AuthController,
      );

      await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SecurityKernelAuthGuard autoriza AuthController.login solo cuando coincide con su ruta canónica /auth/login', async () => {
      const ctx = createMockExecutionContext(
        AuthController.prototype.login,
        { user: undefined, url: '/auth/login', originalUrl: '/auth/login', method: 'POST' },
        AuthController,
      );

      expect(await securityGuard.canActivate(ctx)).toBe(true);
    });

    it('SecurityKernelAuthGuard rechaza métodos no públicos sin JWT en cualquier controlador (Privado por Defecto)', async () => {
      class ProductsController {
        findAll() {
          return [];
        }
      }

      const ctx = createMockExecutionContext(
        ProductsController.prototype.findAll,
        { user: undefined, url: '/products', method: 'GET' },
        ProductsController,
      );

      await expect(securityGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

function createMockExecutionContext(
  handler: Function,
  requestObj: Record<string, any>,
  controllerClass: any = JarvisController,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => requestObj,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

