import { BadRequestException } from '@nestjs/common';
import { SpecialistCapabilityRouterService } from './specialist-capability-router.service';

describe('SpecialistCapabilityRouterService (Capability-based Routing)', () => {
  let router: SpecialistCapabilityRouterService;

  beforeEach(() => {
    router = new SpecialistCapabilityRouterService();
  });

  it('debe clasificar tareas de programación y enrutar a qwen2.5-coder', () => {
    const decision = router.routeRequest({
      messages: [{ role: 'user', content: 'Escribí una función en TypeScript para NestJS con Prisma' }],
    });

    expect(decision.taskType).toBe('coding');
    expect(decision.selectedModel).toContain('qwen2.5-coder');
    expect(decision.hardwareSuitability).toBe('optimal');
  });

  it('debe clasificar tareas dialécticas y enrutar a deepseek-r1', () => {
    const decision = router.routeRequest({
      messages: [{ role: 'user', content: 'Hacé un contraste dialéctico entre Jung y Freud con auditoría de premisas' }],
    });

    expect(decision.taskType).toBe('dialectic_reasoning');
    expect(decision.selectedModel).toContain('deepseek-r1');
  });

  it('debe clasificar tareas de resumen o síntesis y enrutar a gemma3', () => {
    const decision = router.routeRequest({
      messages: [{ role: 'user', content: 'Generá un meta-resumen y sintetizá los 12 capítulos del libro' }],
    });

    expect(decision.taskType).toBe('synthesis');
    expect(decision.selectedModel).toContain('gemma3');
  });

  it('debe rechazar con BadRequestException si hay payload de visión pero no hay modelo en VRAM', () => {
    expect(() => {
      router.routeRequest(
        {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '¿Qué ves en esta foto?' },
                { type: 'image_url', image_url: 'https://example.com/cat.jpg' },
              ],
            },
          ],
        },
        false, // hasVisionModelLoaded = false
      );
    }).toThrow(BadRequestException);
  });

  it('debe aceptar payload de visión si el modelo de visión está cargado en VRAM', () => {
    const decision = router.routeRequest(
      {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '¿Qué ves en esta foto?' },
              { type: 'image', image: 'base64...' },
            ],
          },
        ],
      },
      true, // hasVisionModelLoaded = true
    );

    expect(decision.taskType).toBe('vision_multimodal');
    expect(decision.selectedModel).toContain('llava');
    expect(decision.hardwareSuitability).toBe('optimal');
  });
});
