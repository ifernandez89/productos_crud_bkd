import { MobileGatewayService, MobileCommandDto } from './mobile-gateway.service';
import {
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

describe('MobileGatewayService Hardening & Security (DEV-001-B1.1)', () => {
  const GATEWAY_SECRET = 'test-dedicated-mobile-gateway-hmac-secret-2026-secure';
  let service: MobileGatewayService;
  let execSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.MOBILE_GATEWAY_SECRET = GATEWAY_SECRET;
    delete process.env.MOBILE_GATEWAY_DISABLE_AUTH;
    delete process.env.MOBILE_GATEWAY_ENABLE_OPEN_URL;
    service = new MobileGatewayService();
    execSpy = jest
      .spyOn(service as any, 'executeOsCommand')
      .mockImplementation(() => {});
    jest.spyOn(service as any, 'getCpuUsage').mockResolvedValue(15);
  });

  afterEach(() => {
    service.destroy();
  });

  const createMockDto = (overrides?: Partial<MobileCommandDto>): MobileCommandDto => ({
    requestId: 'req-' + Math.random().toString(36).slice(2),
    deviceId: 'android-pixel-7',
    timestamp: new Date().toISOString(),
    intent: 'GET_TIME',
    parameters: {},
    ...overrides,
  });

  it('should fail-closed at startup if MOBILE_GATEWAY_SECRET is missing or weak default', () => {
    delete process.env.MOBILE_GATEWAY_SECRET;
    expect(() => new MobileGatewayService()).toThrow(/MOBILE_GATEWAY_SECRET/);

    process.env.MOBILE_GATEWAY_SECRET =
      'jarbees-mobile-gateway-default-hmac-key-2026';
    expect(() => new MobileGatewayService()).toThrow(/SECURITY_BOOT_ERROR|inseguro/i);
  });

  it('should reject unsigned commands even if MOBILE_GATEWAY_DISABLE_AUTH=true is set', async () => {
    process.env.MOBILE_GATEWAY_DISABLE_AUTH = 'true';
    const dto = createMockDto({ intent: 'GET_TIME' });
    await expect(service.dispatchMobileCommand(dto)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should accept valid signed command within allowable timestamp drift', async () => {
    const dto = createMockDto({ intent: 'GET_TIME' });
    const sig = service.signCommandDto(dto);
    const res = await service.dispatchMobileCommand(dto, sig);

    expect(res.success).toBe(true);
    expect(res.intent).toBe('GET_TIME');
  });

  it('should reject requests with timestamp drift exceeding 30 seconds', async () => {
    const staleTime = new Date(Date.now() - 45000).toISOString();
    const dto = createMockDto({ timestamp: staleTime });
    const sig = service.signCommandDto(dto);

    await expect(service.dispatchMobileCommand(dto, sig)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should prevent replay attacks by rejecting duplicate requestId', async () => {
    const fixedId = 'fixed-unique-request-id-123';
    const dto1 = createMockDto({ requestId: fixedId });
    const sig1 = service.signCommandDto(dto1);

    await service.dispatchMobileCommand(dto1, sig1);

    await expect(service.dispatchMobileCommand(dto1, sig1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should bind HMAC signature to method, path, requestId, timestamp, intent and canonical payloadHash', async () => {
    const dto = createMockDto({
      requestId: 'signed-req-001',
      intent: 'OPEN_APP',
      parameters: { app: 'calc' },
    });
    const validSig = service.signCommandDto(dto);

    // Tamper parameters while keeping the same requestId/timestamp/intent signature
    const tamperedPayloadDto: MobileCommandDto = {
      ...dto,
      parameters: { app: 'notepad' },
    };
    await expect(
      service.dispatchMobileCommand(tamperedPayloadDto, validSig),
    ).rejects.toThrow(UnauthorizedException);

    // Tamper HTTP method/path context
    await expect(
      service.dispatchMobileCommand(dto, validSig, undefined, {
        method: 'GET',
        path: '/mobile/v1/command',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Original signed request succeeds
    const res = await service.dispatchMobileCommand(dto, validSig);
    expect(res.success).toBe(true);
  });

  it('should strictly enforce application whitelist in OPEN_APP and execute via execFile without shell', async () => {
    const allowedDto = createMockDto({
      intent: 'OPEN_APP',
      parameters: { app: 'notepad' },
    });
    const resAllowed = await service.dispatchMobileCommand(
      allowedDto,
      service.signCommandDto(allowedDto),
    );
    expect(resAllowed.success).toBe(true);
    expect(execSpy).toHaveBeenCalledWith('notepad.exe', []);

    const maliciousDto = createMockDto({
      intent: 'OPEN_APP',
      parameters: { app: 'cmd.exe /c format c:' },
    });
    await expect(
      service.dispatchMobileCommand(
        maliciousDto,
        service.signCommandDto(maliciousDto),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should detect and block SSRF, shell metacharacters, and default OPEN_URL execution', async () => {
    const loopbackDto = createMockDto({
      intent: 'OPEN_URL',
      parameters: { url: 'http://localhost:5432' },
    });
    await expect(
      service.dispatchMobileCommand(
        loopbackDto,
        service.signCommandDto(loopbackDto),
      ),
    ).rejects.toThrow(ForbiddenException);

    const metacharDto = createMockDto({
      intent: 'OPEN_URL',
      parameters: { url: 'https://example.com"&calc.exe' },
    });
    await expect(
      service.dispatchMobileCommand(
        metacharDto,
        service.signCommandDto(metacharDto),
      ),
    ).rejects.toThrow(ForbiddenException);

    // Even a valid public URL is disabled by default unless MOBILE_GATEWAY_ENABLE_OPEN_URL=true
    const publicUrlDto = createMockDto({
      intent: 'OPEN_URL',
      parameters: { url: 'https://example.com/docs' },
    });
    await expect(
      service.dispatchMobileCommand(
        publicUrlDto,
        service.signCommandDto(publicUrlDto),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should safely calculate deterministic arithmetic and bound length', async () => {
    const calcDto = createMockDto({
      intent: 'CALCULATE',
      parameters: { expression: '(15 * 4) + 10' },
    });
    const res = await service.dispatchMobileCommand(
      calcDto,
      service.signCommandDto(calcDto),
    );
    expect(res.success).toBe(true);
    expect(res.result.result).toBe(70);

    const oversizedDto = createMockDto({
      intent: 'CALCULATE',
      parameters: { expression: '1+'.repeat(150) + '1' },
    });
    await expect(
      service.dispatchMobileCommand(
        oversizedDto,
        service.signCommandDto(oversizedDto),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
