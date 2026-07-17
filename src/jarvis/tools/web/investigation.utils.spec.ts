import { extractInvestigationCommand } from './investigation.utils';

describe('extractInvestigationCommand', () => {
  it('detecta una URL después del comando /investigar', () => {
    const result = extractInvestigationCommand(
      '/investigar https://docs.nestjs.com/security/authentication',
    );
    expect(result).toBe('https://docs.nestjs.com/security/authentication');
  });

  it('devuelve null cuando no hay URL', () => {
    expect(extractInvestigationCommand('/investigar')).toBeNull();
    expect(extractInvestigationCommand('hola mundo')).toBeNull();
  });
});
