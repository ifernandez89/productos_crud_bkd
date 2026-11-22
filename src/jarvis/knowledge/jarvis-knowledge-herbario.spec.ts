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
});
