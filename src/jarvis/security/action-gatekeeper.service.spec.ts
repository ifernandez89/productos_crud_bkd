import { ActionGatekeeperService } from './action-gatekeeper.service';
import {
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

describe('ActionGatekeeperService (DEV-001-B1 Hardened)', () => {
  let service: ActionGatekeeperService;
  const originalEnv = { ...process.env };
  const validTestSecret = 'test-only-cryptographic-gatekeeper-secret-2026-valid';
  const validActor = 'operator-ignacio';

  beforeEach(() => {
    delete process.env.SKIP_HITL;
    process.env.ACTION_GATEKEEPER_SECRET = validTestSecret;
    service = new ActionGatekeeperService();
  });

  afterEach(() => {
    service?.destroy();
    process.env = { ...originalEnv };
  });

  it('should fail to initialize if ACTION_GATEKEEPER_SECRET and JWT_SECRET are missing or default', () => {
    delete process.env.ACTION_GATEKEEPER_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => new ActionGatekeeperService()).toThrow(/SECURITY_BOOT_ERROR/);

    process.env.ACTION_GATEKEEPER_SECRET =
      'jarbees-hitl-gatekeeper-secret-key-2026';
    expect(() => new ActionGatekeeperService()).toThrow(/SECURITY_BOOT_ERROR/);
  });

  it('should reject challenge issuance without a valid authenticated actorId', () => {
    expect(() =>
      service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42, undefined, ''),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.createChallenge(
        'LIBRARY_DELETE_DOCUMENT',
        42,
        undefined,
        'jarbees-owner',
      ),
    ).toThrow(UnauthorizedException);
  });

  it('should generate an action challenge token bound to actorId, actionType, targetId, and payloadHash with 60s validity', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      { reason: 'cleanup' },
      validActor,
    );

    expect(challenge.token).toBeDefined();
    expect(challenge.actorId).toBe(validActor);
    expect(challenge.actionType).toBe('LIBRARY_DELETE_DOCUMENT');
    expect(challenge.targetId).toBe('42');
    expect(challenge.payloadHash).toHaveLength(64);
    expect(challenge.expiresInSeconds).toBe(60);
  });

  it('should verify and consume a valid challenge token successfully', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      { confirm: true },
      validActor,
    );
    const isValid = service.verifyAndConsumeChallenge(
      challenge.token,
      'LIBRARY_DELETE_DOCUMENT',
      42,
      { confirm: true },
      validActor,
    );

    expect(isValid).toBe(true);
  });

  it('should prevent replay attacks by rejecting a consumed token on second attempt', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      undefined,
      validActor,
    );
    service.verifyAndConsumeChallenge(
      challenge.token,
      'LIBRARY_DELETE_DOCUMENT',
      42,
      undefined,
      validActor,
    );

    expect(() =>
      service.verifyAndConsumeChallenge(
        challenge.token,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        undefined,
        validActor,
      ),
    ).toThrow(ForbiddenException);
  });

  it('should reject a token if targetId, actionType, actorId, or payload does not match', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      { attemptIndex: 1 },
      validActor,
    );

    // Mismatched target ID
    expect(() =>
      service.verifyAndConsumeChallenge(
        challenge.token,
        'LIBRARY_DELETE_DOCUMENT',
        99,
        { attemptIndex: 1 },
        validActor,
      ),
    ).toThrow(ForbiddenException);

    // Mismatched action type
    expect(() =>
      service.verifyAndConsumeChallenge(
        challenge.token,
        'RESET_DATABASE',
        42,
        { attemptIndex: 1 },
        validActor,
      ),
    ).toThrow(ForbiddenException);

    // Mismatched actorId
    expect(() =>
      service.verifyAndConsumeChallenge(
        challenge.token,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        { attemptIndex: 1 },
        'other-operator',
      ),
    ).toThrow(ForbiddenException);

    // Altered payload
    expect(() =>
      service.verifyAndConsumeChallenge(
        challenge.token,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        { attemptIndex: 2 },
        validActor,
      ),
    ).toThrow(ForbiddenException);
  });

  it('should NOT allow SKIP_HITL=true to bypass token verification', () => {
    process.env.SKIP_HITL = 'true';
    expect(() =>
      service.verifyAndConsumeChallenge(
        undefined,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        undefined,
        validActor,
      ),
    ).toThrow(ForbiddenException);
  });

  it('should reject an expired token', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      undefined,
      validActor,
    );

    const decoded = JSON.parse(
      Buffer.from(challenge.token, 'base64url').toString('utf8'),
    );
    decoded.expiresAt = Date.now() - 5000;
    const expiredToken = Buffer.from(JSON.stringify(decoded)).toString(
      'base64url',
    );

    expect(() =>
      service.verifyAndConsumeChallenge(
        expiredToken,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        undefined,
        validActor,
      ),
    ).toThrow(ForbiddenException);
  });

  it('should reject a tampered signature', () => {
    const challenge = service.createChallenge(
      'LIBRARY_DELETE_DOCUMENT',
      42,
      undefined,
      validActor,
    );
    const decoded = JSON.parse(
      Buffer.from(challenge.token, 'base64url').toString('utf8'),
    );
    decoded.signature =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString(
      'base64url',
    );

    expect(() =>
      service.verifyAndConsumeChallenge(
        tamperedToken,
        'LIBRARY_DELETE_DOCUMENT',
        42,
        undefined,
        validActor,
      ),
    ).toThrow(ForbiddenException);
  });
});
