import { ExecutionFeedbackLoopService } from './execution-feedback-loop.service';
import { InferenceGatewayService } from '../llm/inference-gateway.service';

describe('ExecutionFeedbackLoopService', () => {
  let service: ExecutionFeedbackLoopService;
  let gateway: jest.Mocked<InferenceGatewayService>;

  beforeEach(() => {
    gateway = {
      generate: jest.fn(),
    } as any;

    service = new ExecutionFeedbackLoopService(gateway);
  });

  describe('validateCode', () => {
    it('debe validar código TypeScript sintácticamente balanceado', () => {
      const code = `
        function sumar(a: number, b: number): number {
          return a + b;
        }
      `;
      const res = service.validateCode(code, 'typescript');
      expect(res.valid).toBe(true);
    });

    it('debe detectar delimitadores desbalanceados en TypeScript', () => {
      const code = `
        function broken() {
          const arr = [1, 2, 3;
        }
      `;
      const res = service.validateCode(code, 'typescript');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Delimitador/);
    });

    it('debe detectar strings no cerrados', () => {
      const code = `const str = "hola mundo;`;
      const res = service.validateCode(code, 'typescript');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/String literal no cerrado/);
    });

    it('debe validar y rechazar JSON adecuadamente', () => {
      expect(service.validateCode('{"ok": true}', 'json').valid).toBe(true);
      expect(service.validateCode('{"ok": true', 'json').valid).toBe(false);
    });

    it('debe validar sentencias SQL básicas', () => {
      expect(
        service.validateCode('SELECT * FROM "Document" WHERE id = 1;', 'sql')
          .valid,
      ).toBe(true);
      expect(
        service.validateCode('ESTO NO ES SQL VALIDO', 'sql').valid,
      ).toBe(false);
    });
  });

  describe('extractCode', () => {
    it('debe extraer código de bloques Markdown', () => {
      const markdown = 'Aquí está el código:\n```ts\nconst x = 10;\n```\nFin.';
      expect(service.extractCode(markdown)).toBe('const x = 10;');
    });

    it('debe devolver texto limpio si no hay bloques Markdown', () => {
      expect(service.extractCode('const x = 10;')).toBe('const x = 10;');
    });
  });

  describe('executeTask', () => {
    it('debe resolver en intento 1 sin escalar cuando el 4B genera código válido', async () => {
      gateway.generate.mockResolvedValueOnce({
        content: '```typescript\nexport const x = 42;\n```',
        latencyMs: 120,
        model: 'qwen3:4b',
        provider: 'llamacpp',
      });

      const result = await service.executeTask('crea una constante x');

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.escalated).toBe(false);
      expect(result.modelUsed).toBe('qwen3:4b');
      expect(result.code).toBe('export const x = 42;');
      expect(gateway.generate).toHaveBeenCalledTimes(1);
    });

    it('debe escalar al especialista 8B cuando el 4B falla la validación sintáctica', async () => {
      // Intento 1 (4B): código con delimitador abierto
      gateway.generate.mockResolvedValueOnce({
        content: '```typescript\nfunction fail( {\n```',
        latencyMs: 110,
        model: 'qwen3:4b',
        provider: 'llamacpp',
      });

      // Intento 2 (8B): código corregido
      gateway.generate.mockResolvedValueOnce({
        content: '```typescript\nfunction fixed() { return true; }\n```',
        latencyMs: 350,
        model: 'qwen3:8b',
        provider: 'llamacpp',
      });

      const result = await service.executeTask('escribe una función', {
        language: 'typescript',
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.escalated).toBe(true);
      expect(result.modelUsed).toBe('qwen3:8b');
      expect(result.code).toBe('function fixed() { return true; }');
      expect(result.diagnostics?.length).toBeGreaterThan(0);
      expect(gateway.generate).toHaveBeenCalledTimes(2);

      // Verificamos que el segundo llamado recibió el diagnóstico de error en los mensajes
      const secondCallArgs = gateway.generate.mock.calls[1][0];
      const userMessage = secondCallArgs.messages.find((m) => m.role === 'user');
      expect(typeof userMessage?.content === 'string' && userMessage.content).toMatch(
        /DIAGNÓSTICO EXACTO/,
      );
      expect(secondCallArgs.model).toBe('qwen3:8b');
    });
  });
});
