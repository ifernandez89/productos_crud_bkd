import { GoogleAuthService } from './google-auth.service';
import { CryptoVaultService } from '../shared/crypto-vault.service';

describe('GoogleAuthService & CryptoVault Integration', () => {
  let service: GoogleAuthService;
  let mockPrisma: any;
  let cryptoVault: CryptoVaultService;

  beforeEach(() => {
    cryptoVault = new CryptoVaultService();

    mockPrisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
        create: jest.fn().mockResolvedValue({ id: 1, name: 'Ignacio' }),
      },
      userCredential: {
        upsert: jest.fn().mockImplementation((args) => Promise.resolve(args.create)),
        findUnique: jest.fn(),
        update: jest.fn(),
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

    // Assert that saved values in DB are encrypted with enc:v1: prefix
    expect(callArgs.create.accessToken.startsWith('enc:v1:')).toBe(true);
    expect(callArgs.create.refreshToken.startsWith('enc:v1:')).toBe(true);

    // Verify they can be decrypted back to original
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
      expiryDate: BigInt(Date.now() + 3600 * 1000), // unexpired
      scope: 'https://www.googleapis.com/auth/calendar',
    });

    const client = await service.getAuthenticatedClient();

    expect(client).toBeDefined();
    // oauth2Client internal credentials should be decrypted
    const credentials = (client as any).credentials;
    expect(credentials.access_token).toBe(rawAccessToken);
    expect(credentials.refresh_token).toBe(rawRefreshToken);
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
