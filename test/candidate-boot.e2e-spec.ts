import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

// Polyfill mime.getType para supertest en workspace
const mime = require('mime');
if (typeof mime.getType !== 'function' && typeof mime.lookup === 'function') {
  mime.getType = (val: string) => mime.lookup(val);
}

import { AppModule } from '../src/app.module';
import { AuthController } from '../src/auth/auth.controller';
import {
  JARBEES_JWT_ALGORITHM,
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
} from '../src/auth/jwt-secret.util';
import { ActionGatekeeperService } from '../src/jarvis/security/action-gatekeeper.service';
import { SecurityKernelAuthGuard } from '../src/jarvis/security/security-kernel-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Candidate B1 + B2.6 Real AppModule Boot & Boundary Verification', () => {
  const originalEnv = { ...process.env };
  let app: INestApplication;
  let jwtService: JwtService;

  const mockPrisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    task: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    googleToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    jarvisSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    jarvisConversation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    jarvisDocument: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  const signToken = (scopes: string[], role: 'operator' | 'admin' = 'operator') =>
    jwtService.sign(
      {
        sub: 'ignacio.candidate.test',
        username: 'ignacio.candidate.test',
        role,
        scopes,
        jti: `jti-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      {
        algorithm: JARBEES_JWT_ALGORITHM,
        issuer: JARBEES_JWT_ISSUER,
        audience: JARBEES_JWT_AUDIENCE,
      },
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      'candidate-boot-disposable-jwt-secret-key-998877665544332211';
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      'candidate-boot-disposable-cred-key-32bytes-000111222';
    process.env.ACTION_GATEKEEPER_SECRET =
      'candidate-boot-disposable-gatekeeper-secret-000333444';
    process.env.MOBILE_GATEWAY_SECRET =
      'candidate-boot-disposable-mobile-secret-000555666';
    process.env.JARBEES_DISABLE_INSTANCE_LOCK = 'true';
    process.env.LLAMACPP_AUTO_START = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
  });

  it('inicializa el AppModule completo y resuelve SecurityKernelModule como singleton global sin Gmail/Radar/Broker', () => {
    expect(app).toBeDefined();
    expect(app.get(AuthController)).toBeDefined();
    expect(app.get(ActionGatekeeperService)).toBeDefined();
    expect(app.get(SecurityKernelAuthGuard)).toBeDefined();
  });

  it('expone GET /jarbees/inference/status como @Public(), valida AuthController /auth/login fail-closed y bloquea /jarbees/telemetry/gpu sin JWT', async () => {
    const publicRes = await request(app.getHttpServer()).get(
      '/jarbees/inference/status',
    );
    expect(publicRes.status).toBe(200);
    expect(publicRes.body).toHaveProperty('status');

    const badLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ operatorId: 'unknown', password: 'wrong' });
    expect([401, 403]).toContain(badLogin.status);

    const unauthGpu = await request(app.getHttpServer()).get(
      '/jarbees/telemetry/gpu',
    );
    expect(unauthGpu.status).toBe(401);
  });

  it('exige scopes exactos en /jarbees/telemetry/gpu y /jarbees/telemetry/gpu/snapshot y rechaza >256 procesos', async () => {
    const mutateOnlyToken = signToken(['jarbees:mutate']);
    const readOnlyToken = signToken(['jarbees:read']);
    const fullOperatorToken = signToken(['jarbees:read', 'jarbees:mutate']);

    const deniedRead = await request(app.getHttpServer())
      .get('/jarbees/telemetry/gpu')
      .set('Authorization', `Bearer ${mutateOnlyToken}`);
    expect(deniedRead.status).toBe(403);

    const okRead = await request(app.getHttpServer())
      .get('/jarbees/telemetry/gpu?requestedModel=qwen2.5-coder:14b')
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(okRead.status).toBe(200);
    expect(okRead.body.success).toBe(true);
    expect(okRead.body.snapshot).toBeDefined();
    expect(okRead.body.resourceBudget).toBeDefined();
    expect(okRead.body.missionPreflight?.mode).toBe('OBSERVE_ONLY');

    const deniedMutate = await request(app.getHttpServer())
      .post('/jarbees/telemetry/gpu/snapshot')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ processes: [] });
    expect(deniedMutate.status).toBe(403);

    const okMutate = await request(app.getHttpServer())
      .post('/jarbees/telemetry/gpu/snapshot')
      .set('Authorization', `Bearer ${fullOperatorToken}`)
      .send({
        vram_total: 12227 * 1048576,
        vram_used: 1500 * 1048576,
        adapter: { dedicated_vram: 11942 * 1048576 },
        processes: [],
      });
    expect(okMutate.status).toBe(201);
    expect(okMutate.body.snapshot?.source).toBe('gputaskman_json');

    const tooManyProcesses = Array.from({ length: 257 }, (_, i) => ({
      pid: i + 1,
      name: `p${i}.exe`,
      vram_bytes: 1024,
    }));
    const rejectedLargePayload = await request(app.getHttpServer())
      .post('/jarbees/telemetry/gpu/snapshot')
      .set('Authorization', `Bearer ${fullOperatorToken}`)
      .send({ processes: tooManyProcesses });
    expect(rejectedLargePayload.status).toBe(400);
  });

  it('confirma ausencia total de rutas Gmail (/gmail/draft y /gmail/send devuelven 404)', async () => {
    const adminToken = signToken(
      ['jarbees:read', 'jarbees:mutate', 'jarbees:admin'],
      'admin',
    );

    const draftRes = await request(app.getHttpServer())
      .post('/jarbees/gmail/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'test@example.com', subject: 'x', body: 'y' });
    expect(draftRes.status).toBe(404);

    const sendRes = await request(app.getHttpServer())
      .post('/jarbees/gmail/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'test@example.com', subject: 'x', body: 'y' });
    expect(sendRes.status).toBe(404);
  });
});

