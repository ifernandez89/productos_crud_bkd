import { AssetSecurityService } from './asset-security.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('AssetSecurityService', () => {
  let service: AssetSecurityService;
  let tempDir: string;

  beforeEach(() => {
    service = new AssetSecurityService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb3d-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('correctly derives 256-bit AES key from secret + salt', () => {
    const key = service.getDerivedKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32); // 256 bits
  });

  it('detects unencrypted GLB buffer magic bytes', () => {
    const mockGlb = Buffer.from('glTFfakebinarypayload');
    expect(service.isGlb(mockGlb)).toBe(true);
    expect(service.isJb3dContainer(mockGlb)).toBe(false);
  });

  it('encrypts a GLB buffer into a valid .jb3d container and decrypts it back identically', () => {
    const originalGlbPayload = Buffer.from('glTF\x02\x00\x00\x00\x20\x00\x00\x00SomeBinaryDataAndMeshes');
    const encryptedJb3d = service.encryptGlbToJb3d(originalGlbPayload);

    expect(service.isJb3dContainer(encryptedJb3d)).toBe(true);
    expect(encryptedJb3d.length).toBeGreaterThan(30);

    const validation = service.validateBuffer(encryptedJb3d);
    expect(validation.valid).toBe(true);
    expect(validation.isJb3d).toBe(true);
    expect(validation.version).toBe(1);
    expect(validation.payloadSize).toBe(originalGlbPayload.length);

    const decryptedGlb = service.decryptJb3dToGlb(encryptedJb3d);
    expect(decryptedGlb.toString('utf-8')).toBe(originalGlbPayload.toString('utf-8'));
  });

  it('packs and unpacks a file on disk correctly', async () => {
    const sourceGlbPath = path.join(tempDir, 'test_model.glb');
    const targetJb3dPath = path.join(tempDir, 'test_model.jb3d');
    const unpackedGlbPath = path.join(tempDir, 'test_model_restored.glb');

    const fakeGlbContent = Buffer.from('glTFmockmeshgeometry1234567890');
    fs.writeFileSync(sourceGlbPath, fakeGlbContent);

    const packRes = await service.packFile(sourceGlbPath, targetJb3dPath);
    expect(packRes.status).toBe('success');
    expect(fs.existsSync(targetJb3dPath)).toBe(true);

    const unpackRes = await service.unpackFile(targetJb3dPath, unpackedGlbPath);
    expect(unpackRes.status).toBe('success');
    expect(fs.existsSync(unpackedGlbPath)).toBe(true);

    const restoredData = fs.readFileSync(unpackedGlbPath);
    expect(restoredData.toString('utf-8')).toBe(fakeGlbContent.toString('utf-8'));
  });

  it('rejects invalid or corrupted container headers gracefully', () => {
    const invalidBuffer = Buffer.from('NOT_A_VALID_HEADER');
    const val = service.validateBuffer(invalidBuffer);
    expect(val.valid).toBe(false);
    expect(val.error).toContain('Firma de archivo 3D inválida');
  });
});
