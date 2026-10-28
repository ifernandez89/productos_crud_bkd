import { Test, TestingModule } from '@nestjs/testing';
import { RedactedObservabilityService } from './redacted-observability.service';
import { CryptoVaultService } from '../../shared/crypto-vault.service';

describe('RedactedObservabilityService (Data Sanitization & Token Masking)', () => {
  let service: RedactedObservabilityService;
  let vault: CryptoVaultService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedactedObservabilityService, CryptoVaultService],
    }).compile();

    service = module.get<RedactedObservabilityService>(RedactedObservabilityService);
    vault = module.get<CryptoVaultService>(CryptoVaultService);
  });

  it('debe ofuscar tokens de acceso de Google OAuth', () => {
    const text = 'Bearer ya29.a0AfH6SMCx1234567890abcdefghijklmnopqrstuvwxyz';
    const redacted = service.redactText(text);

    expect(redacted).not.toContain('ya29.');
    expect(redacted).toContain('[REDACTED_GOOGLE_TOKEN]');
  });

  it('debe ofuscar tokens JWT', () => {
    const text = 'Token de sesión: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const redacted = service.redactText(text);

    expect(redacted).not.toContain('eyJhbGci');
    expect(redacted).toContain('[REDACTED_JWT]');
  });

  it('debe ofuscar API Keys (sk-...) y Bearer headers', () => {
    const bearerText = 'Authorization: Bearer my-secret-session-auth-token';
    const redactedBearer = service.redactText(bearerText);
    expect(redactedBearer).toContain('Bearer [REDACTED_AUTH]');

    const keyText = 'OpenAI Key: sk-abcdef1234567890abcdef1234567890';
    const redactedKey = service.redactText(keyText);
    expect(redactedKey).not.toContain('sk-abcdef');
    expect(redactedKey).toContain('[REDACTED_API_KEY]');
  });


  it('debe ofuscar rutas absolutas de usuarios en Windows', () => {
    const text = 'Archivo guardado en C:\\Users\\xiphos-pc1\\Documents\\secret.txt';
    const redacted = service.redactText(text);

    expect(redacted).not.toContain('xiphos-pc1');
    expect(redacted).toContain('C:\\Users\\[USER_HOME]\\Documents\\secret.txt');
  });

  it('debe sanitizar recursivamente un objeto con credenciales anidadas', () => {
    const payload = {
      username: 'ignacio',
      apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
      credentials: {
        refreshToken: '1//0abcdefghijklmnopqrstuvwxyz1234567890',
        nestedPath: 'C:\\Users\\admin\\file.json',
      },
      tags: ['dev', 'local'],
    };

    const sanitized = service.redactObject(payload);

    expect(sanitized.username).toBe('ignacio');
    expect(sanitized.apiKey).toContain('...');
    expect(sanitized.apiKey).toContain('chars');
    expect(sanitized.credentials.refreshToken).toContain('...');
    expect(sanitized.credentials.nestedPath).toContain('[USER_HOME]');
  });
});

