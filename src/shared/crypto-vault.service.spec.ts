import { CryptoVaultService } from './crypto-vault.service';

describe('CryptoVaultService (DEV-001-B1.1 Dedicated Key & Safe Rotation)', () => {
  const PRIMARY_KEY = 'test-dedicated-vault-primary-key-2026-secure-v2';
  const PREVIOUS_KEY = 'test-legacy-vault-previous-key-2026-secure-v1';
  let service: CryptoVaultService;

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = PRIMARY_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    service = new CryptoVaultService();
  });

  it('should fail-closed at startup if CREDENTIALS_ENCRYPTION_KEY is missing or weak default', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => new CryptoVaultService()).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);

    process.env.CREDENTIALS_ENCRYPTION_KEY =
      'jarbees-default-fallback-crypto-key-2026';
    expect(() => new CryptoVaultService()).toThrow(/SECURITY_BOOT_ERROR|inseguro/i);
  });

  it('should encrypt plaintext into an enc:v1: formatted string using primary key', () => {
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

  it('should support legacy unencrypted plaintext gracefully and flag for re-encryption', () => {
    const legacyPlain = 'legacy-unencrypted-token-12345';
    expect(service.isEncrypted(legacyPlain)).toBe(false);
    expect(service.decrypt(legacyPlain)).toEqual(legacyPlain);

    const rot = service.decryptWithRotation(legacyPlain);
    expect(rot.plainText).toBe(legacyPlain);
    expect(rot.needsReencryption).toBe(true);
    expect(rot.usedKey).toBe('legacy_plaintext');
    expect(rot.reencryptedValue?.startsWith('enc:v1:')).toBe(true);
    expect(service.decrypt(rot.reencryptedValue!)).toBe(legacyPlain);
  });

  it('should decrypt records encrypted with CREDENTIALS_ENCRYPTION_KEY_PREVIOUS and produce rotated ciphertext', () => {
    const legacyVault = new CryptoVaultService({ primarySecret: PREVIOUS_KEY });
    const rawSecret = '1//04syntheticRefreshTokenForRotationTest';
    const legacyCiphertext = legacyVault.encrypt(rawSecret);

    // Without CREDENTIALS_ENCRYPTION_KEY_PREVIOUS, primary vault rejects it
    expect(() => service.decrypt(legacyCiphertext)).toThrow();

    // With CREDENTIALS_ENCRYPTION_KEY_PREVIOUS configured, it decrypts and rotates to primary key
    const rotatingVault = new CryptoVaultService({
      primarySecret: PRIMARY_KEY,
      previousSecret: PREVIOUS_KEY,
    });
    const rot = rotatingVault.decryptWithRotation(legacyCiphertext);
    expect(rot.plainText).toBe(rawSecret);
    expect(rot.needsReencryption).toBe(true);
    expect(rot.usedKey).toBe('previous');
    expect(rot.reencryptedValue).toBeDefined();
    expect(rot.reencryptedValue).not.toEqual(legacyCiphertext);

    // Primary-only vault can now decrypt the rotated value without previousSecret!
    expect(service.decrypt(rot.reencryptedValue!)).toBe(rawSecret);
  });

  it('should fail if ciphertext or authTag is tampered', () => {
    const encrypted = service.encrypt('sensitive-data');
    const tampered = encrypted.slice(0, -4) + 'ffff';

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should mask secrets for safe logging', () => {
    const masked = service.maskSecret('ya29.a0AfH6SMAsecret12345');
    expect(masked).toContain('ya29...2345');
    expect(masked).not.toContain('H6SMAsecret');
  });
});
