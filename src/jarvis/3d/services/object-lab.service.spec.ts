import { ObjectLabService } from './object-lab.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ObjectLabService', () => {
  let service: ObjectLabService;
  let tempDir: string;

  beforeEach(() => {
    service = new ObjectLabService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'object-lab-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('validates a correct parametric workshop table template', () => {
    const template = service.createWorkshopTableTemplate({
      objectId: 'test_table_01',
      width: 2.0,
      depth: 1.0,
      height: 0.9,
    });

    const validation = service.validateSpec(template);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
    expect(validation.partCount).toBe(5); // 1 top + 4 legs
    expect(validation.anchorCount).toBe(2);
    expect(validation.colliderCount).toBe(1);
  });

  it('rejects specs missing mandatory fields or invalid part dimensions', () => {
    const invalidSpec: any = {
      name: 'Mesa Rota',
      dimensions: { widthX: -1, depthY: 0, heightZ: 0.8 },
      parts: [
        {
          id: 'bad_part',
          dimensions: { x: 0, y: -2, z: 1 },
        },
      ],
    };

    const validation = service.validateSpec(invalidSpec);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('objectId'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('dimensiones'))).toBe(true);
  });

  it('saves spec JSON to disk correctly', async () => {
    const template = service.createWorkshopTableTemplate({ objectId: 'table_persisted' });
    const targetFile = path.join(tempDir, 'table.object.json');

    const savedPath = await service.saveSpecToDisk(template, targetFile);
    expect(savedPath).toBe(path.resolve(targetFile));
    expect(fs.existsSync(savedPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
    expect(content.objectId).toBe('table_persisted');
  });
});
