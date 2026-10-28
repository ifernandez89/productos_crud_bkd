import { CryptoVaultService } from './crypto-vault.service';

describe('CryptoVaultService', () => {
  let service: CryptoVaultService;

  beforeEach(() => {
    service = new CryptoVaultService();
  });

  it('should encrypt plaintext into an enc:v1: formatted string', () => {
    const secret = 'ya29.a0AfH6SMAexampleAccessToken12345';
    const encrypted = service.encrypt(secret);

    expect(encrypted).not.toEqual(secret);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(service.isEncrypted(encrypted)).toBe(true);
  });

  it('should decrypt encrypted text back to original plaintext', () => {
    const original = '1//04exampleRefreshTokenXYZ_secret_refresh_token';
    const encrypted = service.encrypt(original);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toEqual(original);
  });

  it('should not re-encrypt already encrypted string', () => {
    const original = 'my-token';
    const encryptedOnce = service.encrypt(original);
    const encryptedTwice = service.encrypt(encryptedOnce);

    expect(encryptedTwice).toEqual(encryptedOnce);
  });

  it('should support legacy unencrypted plaintext gracefully', () => {
    const legacyPlain = 'legacy-unencrypted-token-12345';
    expect(service.isEncrypted(legacyPlain)).toBe(false);
    expect(service.decrypt(legacyPlain)).toEqual(legacyPlain);
  });

  it('should fail if ciphertext or authTag is tampered', () => {
    const encrypted = service.encrypt('sensitive-data');
    // Alter last characters of ciphertext
    const tampered = encrypted.slice(0, -4) + 'ffff';

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should mask secrets for safe logging', () => {
    const masked = service.maskSecret('ya29.a0AfH6SMAsecret12345');
    expect(masked).toContain('ya29...2345');
    expect(masked).not.toContain('H6SMAsecret');
  });
});
