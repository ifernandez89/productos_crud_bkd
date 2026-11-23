import { JarvisKnowledgeService } from './jarvis-knowledge.service';
import * as fs from 'fs';
import * as path from 'path';

describe('JarvisKnowledgeService — Herbario Sync & Cannabis Botanical Identification', () => {
  let service: JarvisKnowledgeService;

  beforeEach(() => {
    service = new JarvisKnowledgeService();
  });

  it('debe sincronizar todas las plantas desde G:\\Projects2\\PlantasMedicinales incluyendo Cannabis Medicinal', () => {
    const report = service.syncHerbariumFromSource(true);
    expect(report.synced).toBe(true);
    expect(report.totalPlants).toBeGreaterThanOrEqual(74);

    const jsonPath = path.join(
      process.cwd(),
      'src',
      'jarvis',
      'knowledge',
      'plantas_medicinales.json',
    );
    expect(fs.existsSync(jsonPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const cannabis = data.plantas.find((p: any) => p.slug === 'cannabis');

    expect(cannabis).toBeDefined();
    expect(cannabis.nombre).toBe('Cannabis Medicinal');
    expect(cannabis.nombreCientifico).toContain('Cannabis sativa L.');
    expect(cannabis.familia).toBe('Cannabaceae');
    expect(cannabis.imagen).toBe('/imagenes/cannabis.webp');
    expect(cannabis.imagenes).toEqual(
      expect.arrayContaining([
        '/imagenes/cannabis.webp',
        '/imagenes/cannabis-sativa-floracion.webp',
        '/imagenes/cannabis-hibrido-vegetativo.webp',
        '/imagenes/cannabis-sativa-vegetativo.webp',
      ]),
    );
  });

  it('debe recuperar la ficha completa de Cannabis Medicinal e imágenes al consultar por cannabis, sativa, indica o CBD', async () => {
    service.syncHerbariumFromSource(false);

    const ctxCannabis = await service.extractRelevantContext(
      '¿Tenemos registrada la cannabis en el herbario y qué tipos o imágenes tiene?',
    );
    expect(ctxCannabis).not.toBeNull();
    expect(ctxCannabis).toContain('Cannabis Medicinal');
    expect(ctxCannabis).toContain('/imagenes/cannabis-sativa-floracion.webp');
    expect(ctxCannabis).toContain('/imagenes/cannabis-hibrido-vegetativo.webp');
    expect(ctxCannabis).toContain('/imagenes/cannabis-sativa-vegetativo.webp');

    const ctxSativa = await service.extractRelevantContext(
      '¿Cómo diferenciar cannabis sativa de un híbrido indica?',
    );
    expect(ctxSativa).not.toBeNull();
    expect(ctxSativa).toContain('Cannabis Medicinal');
  });

  it('debe incluir las 122 especies del Boticario ampliado con flora patagónica sin duplicar especies', async () => {
    const report = service.syncHerbariumFromSource(false);
    expect(report.totalPlants).toBeGreaterThanOrEqual(122);

    const jsonPath = path.join(
      process.cwd(),
      'src',
      'jarvis',
      'knowledge',
      'plantas_medicinales.json',
    );
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const slugs = data.plantas.map((p: any) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // Verificar especies patagónicas emblemáticas recién incorporadas + alias sin duplicar
    const expectedSlugs = [
      'calafate',
      'canelo',
      'paramela',
      'panil',
      'maqui',
      'radal',
      'palo-pichi',
      'bailahuen',
      'nancolahuen',
      'rosa-mosqueta',
      'jarilla',
      'neneo',
      'marrubio',
      'vara-de-oro',
    ];
    for (const slug of expectedSlugs) {
      expect(slugs).toContain(slug);
    }

    const ctxParamela = await service.extractRelevantContext(
      '¿Para qué sirve la paramela de la Patagonia y cuáles son sus principios activos?',
    );
    expect(ctxParamela).not.toBeNull();
    expect(ctxParamela).toContain('Adesmia boronioides');

    const ctxToronjilCuyano = await service.extractRelevantContext(
      '¿Qué propiedades tiene el toronjil cuyano?',
    );
    expect(ctxToronjilCuyano).not.toBeNull();
    expect(ctxToronjilCuyano).toContain('Marrubium vulgare');

    // handleListCommand NO debe secuestrar preguntas de usos/precauciones sobre especies específicas
    const notAList = await service.handleListCommand(
      '¿Para qué sirven la paramela, el pañil y el radal entre las plantas medicinales de la Patagonia, y qué precauciones tienen?',
    );
    expect(notAList).toBeNull();

    // Pero SÍ debe responder ante pedidos explícitos de listado del boticario
    const explicitList = await service.handleListCommand(
      'Mostrame la lista de plantas del boticario',
    );
    expect(explicitList).not.toBeNull();
    expect(explicitList).toContain('122 elementos registrados');
  });
});
