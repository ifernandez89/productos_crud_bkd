import { ForbiddenException } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { CryptoVaultService } from '../shared/crypto-vault.service';

describe('GoogleAuthService & CryptoVault Integration (DEV-001-B1.1)', () => {
  const PRIMARY_KEY = 'test-dedicated-vault-primary-key-2026-secure-v2';
  const PREVIOUS_KEY = 'test-legacy-vault-previous-key-2026-secure-v1';
  let service: GoogleAuthService;
  let mockPrisma: any;
  let cryptoVault: CryptoVaultService;

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = PRIMARY_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    cryptoVault = new CryptoVaultService();

    mockPrisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
        create: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
      },
      userCredential: {
        upsert: jest.fn().mockImplementation((args) => Promise.resolve(args.create)),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 10 }),
      },
    };

    service = new GoogleAuthService(mockPrisma, cryptoVault);
  });

  it('should encrypt accessToken and refreshToken when configuring credentials directly', async () => {
    const rawRefreshToken = '1//04testRefreshTokenSecretXYZ';
    const rawAccessToken = 'ya29.testAccessToken123';

    await service.configureBackendCredentials({
      refreshToken: rawRefreshToken,
      accessToken: rawAccessToken,
    });

    expect(mockPrisma.userCredential.upsert).toHaveBeenCalledTimes(1);
    const callArgs = mockPrisma.userCredential.upsert.mock.calls[0][0];

    expect(callArgs.create.accessToken.startsWith('enc:v1:')).toBe(true);
    expect(callArgs.create.refreshToken.startsWith('enc:v1:')).toBe(true);

    expect(cryptoVault.decrypt(callArgs.create.accessToken)).toBe(rawAccessToken);
    expect(cryptoVault.decrypt(callArgs.create.refreshToken)).toBe(rawRefreshToken);
  });

  it('should decrypt stored credentials when retrieving authenticated client', async () => {
    const rawRefreshToken = '1//04sampleRefreshToken';
    const rawAccessToken = 'ya29.sampleAccessToken';

    const encryptedAccessToken = cryptoVault.encrypt(rawAccessToken);
    const encryptedRefreshToken = cryptoVault.encrypt(rawRefreshToken);

    mockPrisma.userCredential.findUnique.mockResolvedValue({
      id: 10,
      userProfileId: 1,
      provider: 'google',
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiryDate: BigInt(Date.now() + 3600 * 1000),
      scope: 'https://www.googleapis.com/auth/calendar',
    });

    const client = await service.getAuthenticatedClient();

    expect(client).toBeDefined();
    const credentials = (client as any).credentials;
    expect(credentials.access_token).toBe(rawAccessToken);
    expect(credentials.refresh_token).toBe(rawRefreshToken);
    expect(mockPrisma.userCredential.update).not.toHaveBeenCalled();
  });

  it('should atomically re-encrypt synthetic credentials decrypted with CREDENTIALS_ENCRYPTION_KEY_PREVIOUS and preserve valid credentials on DB error', async () => {
    const legacyVault = new CryptoVaultService({ primarySecret: PREVIOUS_KEY });
    const rawRefreshToken = '1//04syntheticLegacyRefreshToken';
    const rawAccessToken = 'ya29.syntheticLegacyAccessToken';

    const legacyAccessCipher = legacyVault.encrypt(rawAccessToken);
    const legacyRefreshCipher = legacyVault.encrypt(rawRefreshToken);

    const rotatingVault = new CryptoVaultService({
      primarySecret: PRIMARY_KEY,
      previousSecret: PREVIOUS_KEY,
    });
    const rotatingService = new GoogleAuthService(mockPrisma, rotatingVault);

    mockPrisma.userCredential.findUnique.mockResolvedValue({
      id: 77,
      userProfileId: 1,
      provider: 'google',
      accessToken: legacyAccessCipher,
      refreshToken: legacyRefreshCipher,
      expiryDate: BigInt(Date.now() + 3600 * 1000),
      scope: 'https://www.googleapis.com/auth/calendar',
    });

    const client = await rotatingService.getAuthenticatedClient();
    expect(client).toBeDefined();
    expect(mockPrisma.userCredential.update).toHaveBeenCalledTimes(1);

    const updateArgs = mockPrisma.userCredential.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe(77);
    // Primary-only vault can decrypt the rotated values
    expect(cryptoVault.decrypt(updateArgs.data.accessToken)).toBe(rawAccessToken);
    expect(cryptoVault.decrypt(updateArgs.data.refreshToken)).toBe(rawRefreshToken);

    // Simulate a DB update failure during rotation: valid credentials must NOT be lost
    mockPrisma.userCredential.update.mockRejectedValueOnce(new Error('DB transient lock'));
    const clientAfterDbFailure = await rotatingService.getAuthenticatedClient();
    expect(clientAfterDbFailure).toBeDefined();
    expect((clientAfterDbFailure as any).credentials.access_token).toBe(rawAccessToken);
  });

  it('should generate signed single-use OAuth state and reject missing, tampered, or replayed state on callback', () => {
    const state = service.createOAuthState('operator-ignacio');
    expect(typeof state).toBe('string');

    // Missing state rejected
    expect(() => service.verifyAndConsumeOAuthState(undefined)).toThrow(
      ForbiddenException,
    );

    // Tampered state rejected
    expect(() =>
      service.verifyAndConsumeOAuthState(state.slice(0, -4) + 'ffff'),
    ).toThrow(ForbiddenException);

    // Valid first consumption succeeds
    const verified = service.verifyAndConsumeOAuthState(state);
    expect(verified.actorId).toBe('operator-ignacio');

    // Replay of the exact same state MUST be rejected (single-use)
    expect(() => service.verifyAndConsumeOAuthState(state)).toThrow(
      ForbiddenException,
    );
  });

  it('should auto-initialize credentials from process.env on module init', async () => {
    process.env.GOOGLE_REFRESH_TOKEN = '1//04envDiscoveredRefreshToken';
    const spy = jest.spyOn(service, 'configureBackendCredentials').mockResolvedValue();

    await service.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: '1//04envDiscoveredRefreshToken',
      }),
    );

    delete process.env.GOOGLE_REFRESH_TOKEN;
  });
});
