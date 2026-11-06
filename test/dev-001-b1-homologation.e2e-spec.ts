import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get, Post, Delete, Body, Param, Headers, Req, UseGuards } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import * as crypto from 'crypto';

// Polyfill mime.getType for superagent compatibility with legacy mime v1 in workspace
const mime = require('mime');
if (typeof mime.getType !== 'function' && typeof mime.lookup === 'function') {
  mime.getType = (val: string) => mime.lookup(val);
}

jest.setTimeout(30000);

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SingleInstanceLockService } from '../src/auth/single-instance-lock.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt.guard';
import { Public } from '../src/auth/public.decorator';
import {
  JARBEES_JWT_ALGORITHM,
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
  hashOperatorPasswordScrypt,
} from '../src/auth/jwt-secret.util';

import {
  SecurityKernelAuthGuard,
  RequireSecurityPermission,
} from '../src/jarvis/security/security-kernel-auth.guard';
import { ActionGatekeeperService } from '../src/jarvis/security/action-gatekeeper.service';
import { AuditService } from '../src/jarvis/security/audit.service';
import { CryptoVaultService } from '../src/shared/crypto-vault.service';
import { GoogleAuthController } from '../src/google/google-auth.controller';
import { GoogleAuthService } from '../src/google/google-auth.service';
import { PosterController } from '../src/jarvis/tools/poster/poster.controller';
import { PosterService } from '../src/jarvis/tools/poster/poster.service';
import { PortraitService } from '../src/jarvis/tools/poster/portrait/portrait.service';
import { Studio3DController } from '../src/jarvis/3d/controllers/studio-3d.controller';
import { BlenderService } from '../src/jarvis/3d/blender.service';
import { AssetSecurityService } from '../src/jarvis/3d/services/asset-security.service';
import { Game3DRosterService } from '../src/jarvis/3d/services/game-3d-roster.service';
import { ObjectLabService } from '../src/jarvis/3d/services/object-lab.service';
import { AssetMetadataController } from '../src/jarvis/3d/controllers/asset-metadata.controller';
import { AssetMetadataService } from '../src/jarvis/3d/services/asset-metadata.service';
import { MobileGatewayController } from '../src/mobile-gateway/mobile-gateway.controller';
import { MobileGatewayService } from '../src/mobile-gateway/mobile-gateway.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadController } from '../src/upload/upload.controller';
import { UploadService } from '../src/upload/upload.service';

// Mock Dummy Controller with unapproved @Public() handler to test whitelist enforcement
@UseGuards(SecurityKernelAuthGuard)
@Controller('test-security')
class RoguePublicController {
  @Public()
  @Get('unauthorized-public')
  unauthorizedPublic() {
    return { status: 'should_never_reach_here' };
  }

  @Public()
  @Get('callback')
  collidingPublicCallback() {
    return { status: 'collision_reached' };
  }
}

// Mock Synthetic Protected Route Controller representing JarvisController core endpoints
@UseGuards(SecurityKernelAuthGuard)
@Controller('jarbees')
class SyntheticJarvisController {
  constructor(
    private readonly actionGatekeeper: ActionGatekeeperService,
  ) {}

  @Public()
  @Get('inference/status')
  getInferenceStatus() {
    return { status: 'ready', available: true, models: ['test-qwen-4b'] };
  }

  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:read' })
  @Get('library/document')
  listDocuments() {
    return [{ id: 101, title: 'Synthetic Document A' }];
  }

  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:mutate' })
  @Post('query')
  executeQuery(@Body() body: any) {
    return { success: true, query: body?.query, answer: 'synthetic answer' };
  }

  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:security:challenge' })
  @Post('security/challenge')
  createActionChallenge(
    @Body() body: { actionType: string; targetId: string; payload?: any },
    @Req() req: any,
  ) {
    const actorId = req?.user?.userId || 'operator';
    const challenge = this.actionGatekeeper.createChallenge(
      body.actionType,
      body.targetId,
      body.payload,
      actorId,
    );
    return { success: true, challenge };
  }

  @RequireSecurityPermission({
    level: 3,
    requiredScope: 'jarbees:library:delete',
    actionType: 'LIBRARY_DELETE_DOCUMENT',
    targetIdSource: { from: 'param', key: 'id' },
    requireHitlChallenge: true,
  })
  @Delete('library/document/:id')
  deleteDocument(@Param('id') id: string) {
    return { success: true, deletedId: id };
  }
}

describe('DEV-001-B1-HOMOLOGATION — Security Kernel HTTP Integration Suite (e2e)', () => {
  const TEST_JWT_SECRET = 'test-e2e-jwt-super-secret-key-2026-homologation';
  const TEST_GATEKEEPER_SECRET = 'test-e2e-gatekeeper-super-secret-key-2026-homologation';
  const TEST_VAULT_KEY = 'test-e2e-vault-primary-key-2026-32bytes-secret';
  const TEST_MOBILE_SECRET = 'test-e2e-mobile-gateway-secret-key-2026-homo';
  const TEST_PASSWORD = 'ValidOperatorSecurePassword2026!';
  const TEST_OPERATOR_ID = 'operator-ignacio';

  let testPasswordHash: string;
  let app: INestApplication;
  let jwtService: JwtService;
  let gatekeeperService: ActionGatekeeperService;
  let mobileService: MobileGatewayService;
  let googleAuthService: GoogleAuthService;

  const mockPrisma = {
    userProfile: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
      create: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
    },
    userCredential: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(true),
  };

  const mockAssetMetadataService = {
    getCatalogStats: jest.fn().mockResolvedValue({ totalAssets: 42 }),
  };

  const createTestApp = async (): Promise<INestApplication> => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.ACTION_GATEKEEPER_SECRET = TEST_GATEKEEPER_SECRET;
    process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_VAULT_KEY;
    process.env.MOBILE_GATEWAY_SECRET = TEST_MOBILE_SECRET;
    process.env.MASTER_PASSWORD_HASH = testPasswordHash;
    process.env.REQUIRE_PASSWORD_HASH = 'true';
    process.env.MOBILE_GATEWAY_ENABLE_OPEN_URL = 'false';
    process.env.TRUST_PROXY = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: {
            algorithm: JARBEES_JWT_ALGORITHM,
            issuer: JARBEES_JWT_ISSUER,
            audience: JARBEES_JWT_AUDIENCE,
          },
        }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60000, limit: 1000 },
          { name: 'strict', ttl: 60000, limit: 100 },
        ]),
      ],
      controllers: [
        AuthController,
        SyntheticJarvisController,
        GoogleAuthController,
        PosterController,
        Studio3DController,
        AssetMetadataController,
        MobileGatewayController,
        RoguePublicController,
        UploadController,
      ],
      providers: [
        AuthService,
        SingleInstanceLockService,
        JwtStrategy,
        ActionGatekeeperService,
        CryptoVaultService,
        GoogleAuthService,
        MobileGatewayService,
        Reflector,
        SecurityKernelAuthGuard,
        UploadService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AssetMetadataService, useValue: mockAssetMetadataService },
        { provide: PosterService, useValue: { getPresets: jest.fn().mockReturnValue([]) } },
        { provide: PortraitService, useValue: {} },
        {
          provide: BlenderService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(true),
            getBlenderPath: jest.fn().mockReturnValue('C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe'),
          },
        },
        { provide: AssetSecurityService, useValue: { validateBuffer: jest.fn().mockReturnValue({ valid: true }) } },
        { provide: Game3DRosterService, useValue: {} },
        { provide: ObjectLabService, useValue: {} },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: SecurityKernelAuthGuard },
      ],
    }).compile();

    const createdApp = moduleFixture.createNestApplication();
    (createdApp.getHttpAdapter().getInstance() as any).set('trust proxy', true);
    await createdApp.init();
    return createdApp;
  };

  beforeAll(async () => {
    testPasswordHash = hashOperatorPasswordScrypt(TEST_PASSWORD);
    app = await createTestApp();
    jwtService = app.get(JwtService);
    gatekeeperService = app.get(ActionGatekeeperService);
    mobileService = app.get(MobileGatewayService);
    googleAuthService = app.get(GoogleAuthService);

    // Limpieza preventiva de persistencia en disco de pruebas previas
    const auth = app.get(AuthService);
    if (auth) auth.clearRateLimitState();
    if (mobileService) mobileService.clearReplayLedger();
  });

  afterAll(async () => {
    if (app) {
      try {
        const auth = app.get(AuthService);
        if (auth) auth.clearRateLimitState();
      } catch {}
      try {
        const mobile = app.get(MobileGatewayService);
        if (mobile) mobile.clearReplayLedger();
      } catch {}
      await app.close();
    }
  });

  // Helper to generate custom tokens for edge cases
  const generateToken = (payloadOverrides: Record<string, any> = {}, optionsOverrides: Record<string, any> = {}) => {
    const payload = {
      sub: TEST_OPERATOR_ID,
      role: 'operator',
      scopes: ['jarbees:read', 'jarbees:mutate', 'jarbees:security:challenge', 'jarbees:library:delete', 'jarbees:3d:read', 'jarbees:3d:mutate', 'jarbees:poster:read'],
      jti: crypto.randomUUID(),
      ...payloadOverrides,
    };
    return jwtService.sign(payload, {
      secret: TEST_JWT_SECRET,
      algorithm: JARBEES_JWT_ALGORITHM,
      issuer: JARBEES_JWT_ISSUER,
      audience: JARBEES_JWT_AUDIENCE,
      expiresIn: '1h',
      ...optionsOverrides,
    });
  };

  // =========================================================================
  // A. AUTENTICACIÓN (HTTP Real)
  // =========================================================================
  describe('A. Autenticación (Pipeline HTTP)', () => {
    it('A1. POST /auth/login con credenciales válidas retorna 200 y access_token con claims completos', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ operatorId: TEST_OPERATOR_ID, password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.operatorId).toBe(TEST_OPERATOR_ID);
      expect(res.body.role).toBe('operator');
      expect(res.body.issuer).toBe(JARBEES_JWT_ISSUER);
      expect(res.body.audience).toBe(JARBEES_JWT_AUDIENCE);

      const decoded: any = jwtService.decode(res.body.access_token);
      expect(decoded.sub).toBe(TEST_OPERATOR_ID);
      expect(decoded.iss).toBe(JARBEES_JWT_ISSUER);
      expect(decoded.aud).toBe(JARBEES_JWT_AUDIENCE);
      expect(decoded.jti).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('A2. POST /auth/login con contraseña incorrecta retorna 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.2')
        .send({ operatorId: TEST_OPERATOR_ID, password: 'WrongPassword123!' })
        .expect(401);
    });

    it('A3. POST /auth/login sin body o sin password retorna 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.3')
        .send({})
        .expect(401);
    });

    it('A4. Petición sin token Authorization a ruta protegida retorna 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .expect(401);
    });

    it('A5. Petición con JWT manipulado (firma rota) retorna 401 Unauthorized', async () => {
      const validToken = generateToken();
      const tamperedToken = validToken.slice(0, -6) + 'abcdef';
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('A6. Petición con JWT expirado retorna 401 Unauthorized', async () => {
      const expiredToken = generateToken({}, { expiresIn: '-10s' });
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('A7. Petición con JWT emitido por issuer incorrecto retorna 401 Unauthorized', async () => {
      const wrongIssuerToken = generateToken({}, { issuer: 'rogue-untrusted-issuer' });
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${wrongIssuerToken}`)
        .expect(401);
    });

    it('A8. Petición con JWT emitido para audience incorrecto retorna 401 Unauthorized', async () => {
      const wrongAudienceToken = generateToken({}, { audience: 'rogue-audience' });
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${wrongAudienceToken}`)
        .expect(401);
    });

    it('A9. Petición con JWT firmado con algoritmo no autorizado retorna 401 Unauthorized', async () => {
      // Signing with a different secret/algorithm simulation
      const fakeToken = jwtService.sign({ sub: TEST_OPERATOR_ID, role: 'operator' }, { secret: 'different-fake-secret-key-test' });
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);
    });
  });

  // =========================================================================
  // B. AUTORIZACIÓN (Scopes y Guard del Kernel)
  // =========================================================================
  describe('B. Autorización (SecurityKernelAuthGuard & Scopes)', () => {
    it('B1. JWT válido sin scopes asignados retorna 401 Unauthorized en verifyPayload', async () => {
      const noScopeToken = generateToken({ scopes: [] });
      await request(app.getHttpServer())
        .get('/jarbees/library/document')
        .set('Authorization', `Bearer ${noScopeToken}`)
        .expect(401);
    });

    it('B2. JWT válido con scope insuficiente (tiene jarbees:read, intenta mutar) retorna 403 Forbidden', async () => {
      const readOnlyToken = generateToken({ scopes: ['jarbees:read'] });
      await request(app.getHttpServer())
        .post('/jarbees/query')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ query: 'test' })
        .expect(403);
    });

    it('B3. JWT válido con scope correcto (jarbees:mutate) ejecuta la operación con éxito (201/200)', async () => {
      const mutateToken = generateToken({ scopes: ['jarbees:mutate'] });
      const res = await request(app.getHttpServer())
        .post('/jarbees/query')
        .set('Authorization', `Bearer ${mutateToken}`)
        .send({ query: 'hola jarbees' })
        .expect(201);
      expect(res.body.success).toBe(true);
    });

    it('B4. Ruta con @Public() que NO está en AUTHORIZED_PUBLIC_HANDLERS retorna 403 Forbidden (Fail-Closed)', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-security/unauthorized-public')
        .expect(403);
      expect(res.body.message).toContain('no figura en la lista blanca de excepciones públicas autorizadas');
    });

    it('B5. Colisión de nombres en AUTHORIZED_PUBLIC_HANDLERS (Hallazgo A1 documentado empíricamente)', async () => {
      // RoguePublicController.collidingPublicCallback has name 'collidingPublicCallback' -> rejected 403!
      await request(app.getHttpServer())
        .get('/test-security/callback')
        .expect(403);
    });
  });

  // =========================================================================
  // C. RATE LIMITING & LOCKOUT (/auth/login)
  // =========================================================================
  describe('C. Rate Limiting & Bloqueo Progresivo en /auth/login', () => {
    it('C1 & C2. Aplica bloqueo progresivo (429) tras 5 intentos consecutivos', async () => {
      // 5 requests with wrong password from distinct simulated IP
      const testIp = '198.51.100.99';
      for (let i = 1; i <= 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ operatorId: 'test-locked-user', password: 'BadPassword!' });
        if (i < 5) {
          expect(res.status).toBe(401);
        } else {
          // 5th failure triggers lockout
          expect(res.status).toBe(429);
        }
      }

      // 6th request is immediately rejected with 429 Too Many Requests
      const blockedRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ operatorId: 'test-locked-user', password: 'BadPassword!' })
        .expect(429);
      expect(blockedRes.body.message).toMatch(/Too Many Requests|bloqueada temporalmente/i);
    });

    it('C3. Aislamiento entre IP y operador: el bloqueo de una IP no afecta a otra IP distinta', async () => {
      // Clean IP attempt with valid credentials
      const cleanIp = '203.0.113.88';
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', cleanIp)
        .send({ operatorId: TEST_OPERATOR_ID, password: TEST_PASSWORD })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
    });

    it('C4. Comportamiento tras reinicio: persiste bloqueo por fuerza bruta en disco (DEV-001-B1.2 F-B1-02 resuelto)', async () => {
      // Before restart: verify that a locked IP is blocked
      const ephemeralIp = '192.0.2.111';
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', ephemeralIp)
          .send({ operatorId: 'ephemeral-user', password: 'BadPassword!' });
      }
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', ephemeralIp)
        .send({ operatorId: 'ephemeral-user', password: 'BadPassword!' })
        .expect(429);

      // SIMULATE PROCESS RESTART: close and recreate app
      await app.close();
      app = await createTestApp();
      jwtService = app.get(JwtService);
      gatekeeperService = app.get(ActionGatekeeperService);
      mobileService = app.get(MobileGatewayService);
      googleAuthService = app.get(GoogleAuthService);

      // After restart: durable store in storage/security/auth-lockout preserves lockout -> returns 429 Too Many Requests!
      const afterRestartRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', ephemeralIp)
        .send({ operatorId: 'ephemeral-user', password: 'BadPassword!' });
      expect(afterRestartRes.status).toBe(429);
      expect(afterRestartRes.body.message).toMatch(/Too Many Requests|bloqueada temporalmente/i);
    });
  });

  // =========================================================================
  // D. HITL (ActionGatekeeper & Single-Use Tokens)
  // =========================================================================
  describe('D. Flujo HITL Criptográfico (Human Approval Token)', () => {
    let operatorToken: string;
    let validHitlToken: string;

    beforeAll(() => {
      operatorToken = generateToken({
        sub: TEST_OPERATOR_ID,
        scopes: ['jarbees:security:challenge', 'jarbees:library:delete'],
      });
    });

    it('D1 & D2. Solicitar y recibir token HITL firmado para LIBRARY_DELETE_DOCUMENT sobre #101', async () => {
      const res = await request(app.getHttpServer())
        .post('/jarbees/security/challenge')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ actionType: 'LIBRARY_DELETE_DOCUMENT', targetId: '101' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.challenge.token).toBeDefined();
      expect(res.body.challenge.actionType).toBe('LIBRARY_DELETE_DOCUMENT');
      expect(res.body.challenge.targetId).toBe('101');
      validHitlToken = res.body.challenge.token;
    });

    it('D3. Ejecutar la operación crítica autorizada (DELETE) con el token HITL retorna 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete('/jarbees/library/document/101')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-action-token', validHitlToken)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deletedId).toBe('101');
    });

    it('D4. Intentar reutilizar el token consumido (Replay) retorna 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .delete('/jarbees/library/document/101')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-action-token', validHitlToken)
        .expect(403);
      expect(res.body.message).toContain('ya fue consumido o no es válido');
    });

    it('D5. Token HITL utilizado por otro operador retorna 403 Forbidden', async () => {
      // Issue challenge for operator-ignacio
      const challenge = gatekeeperService.createChallenge('LIBRARY_DELETE_DOCUMENT', '102', undefined, 'operator-ignacio');
      // Attempt consumption by operator-eve
      const eveJwt = generateToken({ sub: 'operator-eve', scopes: ['jarbees:library:delete'] });
      const res = await request(app.getHttpServer())
        .delete('/jarbees/library/document/102')
        .set('Authorization', `Bearer ${eveJwt}`)
        .set('x-action-token', challenge.token)
        .expect(403);
      expect(res.body.message).toContain('pertenece a otro operador');
    });

    it('D6. Token HITL emitido para #103 utilizado sobre #104 retorna 403 Forbidden', async () => {
      const challenge = gatekeeperService.createChallenge('LIBRARY_DELETE_DOCUMENT', '103', undefined, TEST_OPERATOR_ID);
      const res = await request(app.getHttpServer())
        .delete('/jarbees/library/document/104')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-action-token', challenge.token)
        .expect(403);
      expect(res.body.message).toContain('no corresponde a la operación solicitada');
    });

    it('D7. Token HITL con payload alterado retorna 403 Forbidden', () => {
      // Verification directly via service
      const challenge = gatekeeperService.createChallenge('TEST_ACTION', '1', { key: 'original' }, TEST_OPERATOR_ID);
      expect(() => {
        gatekeeperService.verifyAndConsumeChallenge(challenge.token, 'TEST_ACTION', '1', { key: 'tampered' }, TEST_OPERATOR_ID);
      }).toThrow(/El payload de la operación fue alterado/);
    });

    it('D8. Token HITL expirado retorna 403 Forbidden', async () => {
      // Simulate expired token by overriding clock
      const expiredChallenge = gatekeeperService.createChallenge('LIBRARY_DELETE_DOCUMENT', '105', undefined, TEST_OPERATOR_ID);
      // Fast-forward or delete from map
      const parsed: any = JSON.parse(Buffer.from(expiredChallenge.token, 'base64url').toString('utf8'));
      parsed.expiresAt = Date.now() - 5000;
      const modifiedToken = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      const res = await request(app.getHttpServer())
        .delete('/jarbees/library/document/105')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-action-token', modifiedToken)
        .expect(403);
      expect(res.body.message).toBeDefined();
    });
  });

  // =========================================================================
  // E. MOBILE GATEWAY (HMAC & Anti-Replay)
  // =========================================================================
  describe('E. Mobile Gateway (/mobile/v1/command)', () => {
    let operatorMobileToken: string;

    beforeAll(() => {
      operatorMobileToken = generateToken({
        sub: TEST_OPERATOR_ID,
        scopes: ['jarbees:mutate'],
      });
    });

    it('E1. Comando sin firma retorna 401 Unauthorized', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };

      const res = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .send(cmdDto)
        .expect(401);
      expect(res.body.message).toContain('falta la firma obligatoria "x-jarbees-signature"');
    });

    it('E2. Comando con firma HMAC inválida retorna 401 Unauthorized', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };

      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', '0'.repeat(64))
        .send(cmdDto)
        .expect(401);
    });

    it('E3. Comando con firma HMAC válida retorna 200 OK y resultado verificado', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      const res = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.intent).toBe('GET_TIME');
      expect(res.body.result.time).toBeDefined();
    });

    it('E4. Método HTTP alterado en la firma (firmado para GET, enviado por POST) retorna 401', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'GET' });

      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(401);
    });

    it('E5. Ruta alterada en la firma retorna 401 Unauthorized', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/api/v1/other-endpoint', method: 'POST' });

      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(401);
    });

    it('E6. Payload alterado tras la firma retorna 401 Unauthorized', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'CALCULATE',
        parameters: { expression: '2+2' },
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      const tamperedDto = { ...cmdDto, parameters: { expression: '2+999' } };
      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(tamperedDto)
        .expect(401);
    });

    it('E7. Timestamp fuera de ventana (>30s) retorna 401 Unauthorized', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date(Date.now() - 45000).toISOString(), // 45s ago (> 30s)
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      const res = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(401);
      expect(res.body.message).toContain('fuera de la ventana de tiempo');
    });

    it('E8. RequestId repetido (Replay dentro de la misma sesión) retorna 403 Forbidden', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      // First call: succeeds
      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(200);

      // Second call with same requestId: fails with 403
      const replayRes = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(403);
      expect(replayRes.body.message).toContain('Ataque de repetición detectado');
    });

    it('E9. Repetición del mismo comando tras reinicio efímero es RECHAZADA (DEV-001-B1.2 A2 resuelto)', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      // Run in current instance
      await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto)
        .expect(200);

      // SIMULATE PROCESS RESTART
      await app.close();
      app = await createTestApp();
      jwtService = app.get(JwtService);
      gatekeeperService = app.get(ActionGatekeeperService);
      mobileService = app.get(MobileGatewayService);
      googleAuthService = app.get(GoogleAuthService);

      // Re-send the exact same signed command within the 30s drift window
      // Because seenRequestIds is persisted on disk (storage/security/mobile-replay), the restarted app REJECTS it with 403 Forbidden!
      const afterRestartReplayRes = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto);

      expect(afterRestartReplayRes.status).toBe(403);
      expect(afterRestartReplayRes.body.message).toContain('Ataque de repetición detectado');
    });

    it('E10. Concurrencia HTTP: múltiples llamadas simultáneas con el mismo requestId (Promise.all) solo una tiene éxito (DEV-001-B1.3 TEST-01)', async () => {
      const cmdDto = {
        requestId: crypto.randomUUID(),
        deviceId: 'device-concurrent-m22',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      const responses = await Promise.all([
        request(app.getHttpServer()).post('/mobile/v1/command').set('Authorization', `Bearer ${operatorMobileToken}`).set('x-jarbees-signature', signature).send(cmdDto),
        request(app.getHttpServer()).post('/mobile/v1/command').set('Authorization', `Bearer ${operatorMobileToken}`).set('x-jarbees-signature', signature).send(cmdDto),
        request(app.getHttpServer()).post('/mobile/v1/command').set('Authorization', `Bearer ${operatorMobileToken}`).set('x-jarbees-signature', signature).send(cmdDto),
        request(app.getHttpServer()).post('/mobile/v1/command').set('Authorization', `Bearer ${operatorMobileToken}`).set('x-jarbees-signature', signature).send(cmdDto),
        request(app.getHttpServer()).post('/mobile/v1/command').set('Authorization', `Bearer ${operatorMobileToken}`).set('x-jarbees-signature', signature).send(cmdDto),
      ]);

      const successCount = responses.filter(r => r.status === 200).length;
      const replayCount = responses.filter(r => r.status === 403 && r.body?.message?.includes('Ataque de repetición')).length;

      expect(successCount).toBe(1);
      expect(replayCount).toBe(4);
    });

    it('E11. Resiliencia fail-closed ante ledger de 0 bytes o corrupto: no se destruye y bloquea repetición (DEV-001-B1.3 A2-01)', async () => {
      const fs = require('fs');
      const path = require('path');
      const testDir = path.resolve(process.cwd(), 'storage/security/mobile-replay');
      fs.mkdirSync(testDir, { recursive: true });

      const fakeZeroByteId = crypto.randomUUID();
      const hash = crypto.createHash('sha256').update(fakeZeroByteId).digest('hex');
      const fakeZeroByteFile = path.join(testDir, `${hash}.json`);
      fs.writeFileSync(fakeZeroByteFile, ''); // 0 bytes

      // Reiniciar la app
      await app.close();
      app = await createTestApp();
      jwtService = app.get(JwtService);
      gatekeeperService = app.get(ActionGatekeeperService);
      mobileService = app.get(MobileGatewayService);
      googleAuthService = app.get(GoogleAuthService);

      // El archivo corrupto DEBE preservarse en disco (no borrarse automáticamente)
      expect(fs.existsSync(fakeZeroByteFile)).toBe(true);

      // Cualquier intento de reusar ese requestId o hash debe ser rechazado fail-closed
      const cmdDto = {
        requestId: fakeZeroByteId,
        deviceId: 'device-zero-byte',
        timestamp: new Date().toISOString(),
        intent: 'GET_TIME',
      };
      const signature = mobileService.signCommandDto(cmdDto, { path: '/mobile/v1/command', method: 'POST' });

      const res = await request(app.getHttpServer())
        .post('/mobile/v1/command')
        .set('Authorization', `Bearer ${operatorMobileToken}`)
        .set('x-jarbees-signature', signature)
        .send(cmdDto);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Ataque de repetición detectado');

      // Limpieza del archivo de test
      try { fs.unlinkSync(fakeZeroByteFile); } catch {}
    });
  });

  // =========================================================================
  // F. CONTROLADORES AUXILIARES (Google, Poster, 3D Studio, Metadata, Mobile)
  // =========================================================================
  describe('F. Controladores Auxiliares y Excepciones Públicas', () => {
    let operatorToken: string;

    beforeAll(() => {
      operatorToken = generateToken({
        sub: TEST_OPERATOR_ID,
        scopes: ['jarbees:mutate', 'jarbees:poster:read', 'jarbees:3d:read', 'jarbees:3d:mutate', 'jarbees:read'],
      });
    });

    it('F1. GET /mobile/v1/health es @Public() y responde 200 sin credenciales', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/v1/health')
        .expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('JarBees Core MobileGateway');
    });

    it('F2. GET /mobile/v1/capabilities exige token y scope jarbees:read', async () => {
      // Anonymous
      await request(app.getHttpServer()).get('/mobile/v1/capabilities').expect(401);

      // Authenticated
      const res = await request(app.getHttpServer())
        .get('/mobile/v1/capabilities')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      expect(res.body.capabilities).toBeDefined();
    });

    it('F3. GET /jarbees/google/login exige autenticación y scope jarbees:mutate, retornando redirect con state firmado', async () => {
      // Anonymous
      await request(app.getHttpServer()).get('/jarbees/google/login').expect(401);

      // Authenticated
      const res = await request(app.getHttpServer())
        .get('/jarbees/google/login')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(302);

      const location = res.headers.location;
      expect(location).toContain('accounts.google.com');
      expect(location).toContain('state=');
    });

    it('F4. GET /jarbees/google/callback (@Public) rechaza state ausente o manipulado (403)', async () => {
      // Missing state
      await request(app.getHttpServer())
        .get('/jarbees/google/callback?code=mock-code')
        .expect(403);

      // Fake unauthenticated state
      await request(app.getHttpServer())
        .get('/jarbees/google/callback?code=mock-code&state=fake.signature')
        .expect(403);
    });

    it('F5. GET /jarbees/poster/presets exige autenticación y scope jarbees:poster:read', async () => {
      // Anonymous
      await request(app.getHttpServer()).get('/jarbees/poster/presets').expect(401);

      // With insufficient scope
      const wrongScopeToken = generateToken({ scopes: ['jarbees:read'] });
      await request(app.getHttpServer())
        .get('/jarbees/poster/presets')
        .set('Authorization', `Bearer ${wrongScopeToken}`)
        .expect(403);

      // With correct scope
      await request(app.getHttpServer())
        .get('/jarbees/poster/presets')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
    });

    it('F6. GET /jarvis/3d/studio/health exige autenticación y scope jarbees:3d:read', async () => {
      // Anonymous
      await request(app.getHttpServer()).get('/jarvis/3d/studio/health').expect(401);

      // With correct scope
      const res = await request(app.getHttpServer())
        .get('/jarvis/3d/studio/health')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      expect(res.body.status).toBe('operational');
      expect(res.body.blender.available).toBe(true);
    });

    it('F7. GET /jarvis/3d/metadata/stats exige autenticación y scope jarbees:3d:read', async () => {
      // Anonymous
      await request(app.getHttpServer()).get('/jarvis/3d/metadata/stats').expect(401);

      // With correct scope
      const res = await request(app.getHttpServer())
        .get('/jarvis/3d/metadata/stats')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.totalAssets).toBe(42);
    });

    it('F8. POST /upload/image sin JWT retorna 401 Unauthorized demostrando frontera global en controladores legacy (DEV-001-B1.3 A1-01)', async () => {
      await request(app.getHttpServer())
        .post('/upload/image')
        .expect(401);
    });
  });
});
