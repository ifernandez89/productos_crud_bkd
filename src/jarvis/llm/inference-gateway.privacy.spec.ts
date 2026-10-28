import { InferenceGatewayService } from './inference-gateway.service';
import { ForbiddenException } from '@nestjs/common';

describe('InferenceGatewayService Data Privacy Gate', () => {
  let gateway: InferenceGatewayService;
  let mockLlamaCpp: any;
  let mockOllama: any;
  let mockOpenRouter: any;

  beforeEach(() => {
    mockLlamaCpp = {
      generate: jest.fn(),
      getProviderName: () => 'llamacpp',
      getDefaultModel: () => 'qwen3:8b',
    };

    mockOllama = {
      generate: jest.fn(),
      getProviderName: () => 'ollama',
      getDefaultModel: () => 'qwen3:8b',
    };

    mockOpenRouter = {
      generate: jest.fn(),
      getProviderName: () => 'openrouter',
      getDefaultModel: () => 'meta-llama/llama-3.1-8b',
    };

    gateway = new InferenceGatewayService(
      mockLlamaCpp,
      mockOllama,
      mockOpenRouter,
      undefined,
    );
  });

  it('should always allow local providers (llamacpp and ollama) regardless of sensitivity', () => {
    const options = {
      messages: [{ role: 'user' as const, content: 'my private password and secret token' }],
      sensitivity: 'confidential' as const,
    };

    expect(gateway.isRemoteProviderAllowed('llamacpp', options)).toBe(true);
    expect(gateway.isRemoteProviderAllowed('ollama', options)).toBe(true);
  });

  it('should allow openrouter if sensitivity is public and no sensitive tokens are present', () => {
    const options = {
      messages: [{ role: 'user' as const, content: 'What is the capital of Argentina?' }],
      sensitivity: 'public' as const,
    };

    expect(gateway.isRemoteProviderAllowed('openrouter', options)).toBe(true);
  });

  it('should block openrouter if sensitivity is marked as private', () => {
    const options = {
      messages: [{ role: 'user' as const, content: 'Summarize this chapter of my private PDF book.' }],
      sensitivity: 'private' as const,
    };

    expect(gateway.isRemoteProviderAllowed('openrouter', options)).toBe(false);
  });

  it('should block openrouter if allowRemoteFallback is false', () => {
    const options = {
      messages: [{ role: 'user' as const, content: 'General query' }],
      sensitivity: 'public' as const,
      allowRemoteFallback: false,
    };

    expect(gateway.isRemoteProviderAllowed('openrouter', options)).toBe(false);
  });

  it('should detect sensitive tokens in prompt and block openrouter by default', () => {
    const options = {
      messages: [{ role: 'user' as const, content: 'Here is my google refresh_token for calendar integration' }],
    };

    expect(gateway.isRemoteProviderAllowed('openrouter', options)).toBe(false);
  });

  it('should throw ForbiddenException and fail-close when fallback to openrouter is attempted with private data', async () => {
    // Primary fails
    mockLlamaCpp.generate.mockRejectedValue(new Error('Connection refused'));
    // Fallback is set to openrouter
    (gateway as any).fallbackProviderName = 'openrouter';

    const privateOptions = {
      messages: [{ role: 'user' as const, content: 'My private health facts and memories' }],
      sensitivity: 'private' as const,
    };

    await expect(gateway.generate(privateOptions)).rejects.toThrow(ForbiddenException);
    expect(mockOpenRouter.generate).not.toHaveBeenCalled();
  });
});
