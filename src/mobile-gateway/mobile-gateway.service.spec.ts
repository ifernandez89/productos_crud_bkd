import { MobileGatewayService, MobileCommandDto } from './mobile-gateway.service';
import {
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

describe('MobileGatewayService Hardening & Security', () => {
  let service: MobileGatewayService;

  beforeEach(() => {
    delete process.env.MOBILE_GATEWAY_DISABLE_AUTH;
    service = new MobileGatewayService();
    jest.spyOn(service as any, 'executeOsCommand').mockImplementation(() => {});
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

  it('should accept valid command within allowable timestamp drift', async () => {
    const dto = createMockDto({ intent: 'GET_TIME' });
    const res = await service.dispatchMobileCommand(dto);

    expect(res.success).toBe(true);
    expect(res.intent).toBe('GET_TIME');
  });

  it('should reject requests with timestamp drift exceeding 30 seconds', async () => {
    const staleTime = new Date(Date.now() - 45000).toISOString();
    const dto = createMockDto({ timestamp: staleTime });

    await expect(service.dispatchMobileCommand(dto)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should prevent replay attacks by rejecting duplicate requestId', async () => {
    const fixedId = 'fixed-unique-request-id-123';
    const dto1 = createMockDto({ requestId: fixedId });
    const dto2 = createMockDto({ requestId: fixedId });

    // First request passes
    await service.dispatchMobileCommand(dto1);

    // Second request with same ID MUST be rejected as replay attack
    await expect(service.dispatchMobileCommand(dto2)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should verify valid HMAC signature and reject invalid signature', async () => {
    const nowIso = new Date().toISOString();
    const requestId = 'signed-req-001';
    const intent = 'GET_SYSTEM_STATUS';

    const validSig = service.generateHmacSignature(requestId, nowIso, intent);
    const dto = createMockDto({ requestId, timestamp: nowIso, intent });

    // Valid signature succeeds
    const res = await service.dispatchMobileCommand(dto, validSig);
    expect(res.success).toBe(true);

    // Tampered signature MUST fail
    const tamperedDto = createMockDto({
      requestId: 'another-req-002',
      timestamp: nowIso,
      intent,
    });
    await expect(
      service.dispatchMobileCommand(tamperedDto, 'bad0000000000000000000000000000000000000000000000000000000000000'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should strictly enforce application whitelist in OPEN_APP', async () => {
    const allowedDto = createMockDto({
      intent: 'OPEN_APP',
      parameters: { app: 'notepad' },
    });
    const resAllowed = await service.dispatchMobileCommand(allowedDto);
    expect(resAllowed.success).toBe(true);

    const maliciousDto = createMockDto({
      intent: 'OPEN_APP',
      parameters: { app: 'cmd.exe /c format c:' },
    });
    await expect(service.dispatchMobileCommand(maliciousDto)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should detect and block SSRF attempts in OPEN_URL', async () => {
    const loopbackDto = createMockDto({
      intent: 'OPEN_URL',
      parameters: { url: 'http://localhost:5432' },
    });
    await expect(service.dispatchMobileCommand(loopbackDto)).rejects.toThrow(
      ForbiddenException,
    );

    const privateIpDto = createMockDto({
      intent: 'OPEN_URL',
      parameters: { url: 'http://192.168.1.1/admin' },
    });
    await expect(service.dispatchMobileCommand(privateIpDto)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should safely calculate deterministic arithmetic and bound length', async () => {
    const calcDto = createMockDto({
      intent: 'CALCULATE',
      parameters: { expression: '(15 * 4) + 10' },
    });
    const res = await service.dispatchMobileCommand(calcDto);
    expect(res.success).toBe(true);
    expect(res.result.result).toBe(70);

    const oversizedDto = createMockDto({
      intent: 'CALCULATE',
      parameters: { expression: '1+'.repeat(150) + '1' },
    });
    await expect(service.dispatchMobileCommand(oversizedDto)).rejects.toThrow(
      BadRequestException,
    );
  });
});
