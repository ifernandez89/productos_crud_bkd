import { ActionGatekeeperService } from './action-gatekeeper.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ActionGatekeeperService', () => {
  let service: ActionGatekeeperService;

  beforeEach(() => {
    delete process.env.SKIP_HITL;
    service = new ActionGatekeeperService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('should generate an action challenge token with 60s validity', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);

    expect(challenge.token).toBeDefined();
    expect(challenge.actionType).toBe('LIBRARY_DELETE_DOCUMENT');
    expect(challenge.targetId).toBe('42');
    expect(challenge.expiresInSeconds).toBe(60);
  });

  it('should verify and consume a valid challenge token successfully', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);
    const isValid = service.verifyAndConsumeChallenge(
      challenge.token,
      'LIBRARY_DELETE_DOCUMENT',
      42,
    );

    expect(isValid).toBe(true);
  });

  it('should prevent replay attacks by rejecting a consumed token on second attempt', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);
    // First consume succeeds
    service.verifyAndConsumeChallenge(challenge.token, 'LIBRARY_DELETE_DOCUMENT', 42);

    // Second consume MUST fail
    expect(() =>
      service.verifyAndConsumeChallenge(challenge.token, 'LIBRARY_DELETE_DOCUMENT', 42),
    ).toThrow(ForbiddenException);
  });

  it('should reject a token if targetId or actionType does not match', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);

    // Mismatched target ID
    expect(() =>
      service.verifyAndConsumeChallenge(challenge.token, 'LIBRARY_DELETE_DOCUMENT', 99),
    ).toThrow(ForbiddenException);

    // Mismatched action type
    expect(() =>
      service.verifyAndConsumeChallenge(challenge.token, 'RESET_DATABASE', 42),
    ).toThrow(ForbiddenException);
  });

  it('should reject an expired token', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);

    // Decode and modify expiresAt to past
    const decoded = JSON.parse(
      Buffer.from(challenge.token, 'base64url').toString('utf8'),
    );
    decoded.expiresAt = Date.now() - 5000;
    const expiredToken = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    expect(() =>
      service.verifyAndConsumeChallenge(expiredToken, 'LIBRARY_DELETE_DOCUMENT', 42),
    ).toThrow(ForbiddenException);
  });

  it('should reject a tampered signature', () => {
    const challenge = service.createChallenge('LIBRARY_DELETE_DOCUMENT', 42);
    const decoded = JSON.parse(
      Buffer.from(challenge.token, 'base64url').toString('utf8'),
    );
    decoded.signature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    expect(() =>
      service.verifyAndConsumeChallenge(tamperedToken, 'LIBRARY_DELETE_DOCUMENT', 42),
    ).toThrow(ForbiddenException);
  });
});
