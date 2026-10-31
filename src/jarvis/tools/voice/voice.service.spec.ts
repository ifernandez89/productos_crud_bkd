import { VoiceService } from './voice.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('VoiceService', () => {
  let service: VoiceService;
  const tempFiles: string[] = [];

  beforeAll(() => {
    service = new VoiceService();
  });

  afterAll(async () => {
    // Teardown limpio de archivos temporales de prueba
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) {
          await fs.promises.unlink(f);
        }
      } catch {}
    }
  });

  describe('detectAudioContainer', () => {
    it('debe detectar formato WAV con encabezado RIFF...WAVE', () => {
      const header = Buffer.alloc(16);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(36, 4);
      header.write('WAVE', 8, 'ascii');
      header.write('fmt ', 12, 'ascii');

      expect(service.detectAudioContainer(header)).toBe('wav');
    });

    it('debe detectar formato OGG con encabezado OggS', () => {
      const header = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00', 'binary');
      expect(service.detectAudioContainer(header)).toBe('ogg');
    });

    it('debe detectar formato WebM con número mágico EBML (1a 45 df a3)', () => {
      const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
      expect(service.detectAudioContainer(header)).toBe('webm');
    });

    it('debe detectar formato MP4 con caja ftyp en offset 4', () => {
      const header = Buffer.alloc(16);
      header.writeUInt32BE(16, 0);
      header.write('ftyp', 4, 'ascii');
      header.write('isom', 8, 'ascii');

      expect(service.detectAudioContainer(header)).toBe('mp4');
    });

    it('debe detectar formato MP3 con etiqueta ID3', () => {
      const header = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary');
      expect(service.detectAudioContainer(header)).toBe('mp3');
    });

    it('debe devolver unknown para buffers desconocidos o vacíos', () => {
      expect(service.detectAudioContainer(Buffer.alloc(0))).toBe('unknown');
      expect(service.detectAudioContainer(Buffer.from([0x00, 0x01, 0x02]))).toBe('unknown');
      expect(service.detectAudioContainer(Buffer.from('TEXTFILE12345', 'utf8'))).toBe('unknown');
    });
  });

  describe('getStatus', () => {
    it('debe reportar correctamente el estado de decodificadores (FFmpeg / opusdec)', async () => {
      const status = await service.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.opusdecAvailable).toBe('boolean');
      expect(typeof status.ffmpegAvailable).toBe('boolean');
      expect(Array.isArray(status.supportedInputFormats)).toBe(true);
      expect(status.supportedInputFormats).toContain('.webm');
      expect(status.supportedInputFormats).toContain('.opus');
      expect(status.supportedInputFormats).toContain('.wav');
    });
  });

  describe('stitchWavBuffers', () => {
    it('debe combinar múltiples buffers PCM WAV respetando los headers', () => {
      const pcm1 = Buffer.alloc(100, 0x11);
      const header1 = Buffer.alloc(44);
      header1.write('RIFF', 0, 'ascii');
      header1.writeUInt32LE(36 + pcm1.length, 4);
      header1.write('WAVE', 8, 'ascii');
      header1.writeUInt32LE(pcm1.length, 40);
      const wav1 = Buffer.concat([header1, pcm1]);

      const pcm2 = Buffer.alloc(200, 0x22);
      const header2 = Buffer.alloc(44);
      header2.write('RIFF', 0, 'ascii');
      header2.writeUInt32LE(36 + pcm2.length, 4);
      header2.write('WAVE', 8, 'ascii');
      header2.writeUInt32LE(pcm2.length, 40);
      const wav2 = Buffer.concat([header2, pcm2]);

      const stitched = service.stitchWavBuffers([wav1, wav2]);
      expect(stitched.length).toBe(44 + 300);
      expect(stitched.readUInt32LE(4)).toBe(36 + 300);
      expect(stitched.readUInt32LE(40)).toBe(300);
    });
  });

  describe('decodeToWav & WebM handling', () => {
    it('debe manejar buffers vacíos retornando transcripción vacía sin lanzar excepciones', async () => {
      const res = await service.processAudioToText(Buffer.alloc(0));
      expect(res.text).toBe('');
      expect(res.confidence).toBe(0);
      expect(res.engine).toBe('empty_input');
    });

    it('debe decodificar un archivo WebM a WAV usando FFmpeg si FFmpeg está disponible', async () => {
      const ffmpeg = service.getFfmpegPath();
      if (!ffmpeg) {
        // Si no está disponible en este entorno, ignorar la prueba de integración
        return;
      }

      const inputWebm = path.join(os.tmpdir(), `test_spec_${Date.now()}.webm`);
      const outputWav = path.join(os.tmpdir(), `test_spec_${Date.now()}.wav`);
      tempFiles.push(inputWebm, outputWav);

      // Crear un WebM sintético con FFmpeg
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);

      await execFileAsync(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.5',
        '-c:a',
        'libopus',
        inputWebm,
      ]);

      expect(fs.existsSync(inputWebm)).toBe(true);

      const resultWav = await service.decodeToWav(inputWebm, outputWav, 'webm');
      expect(resultWav).toBe(outputWav);
      expect(fs.existsSync(outputWav)).toBe(true);
      expect(fs.statSync(outputWav).size).toBeGreaterThan(44);

      // Verificar que el resultado sea un WAV válido (RIFF...WAVE)
      const wavBuf = await fs.promises.readFile(outputWav);
      expect(service.detectAudioContainer(wavBuf)).toBe('wav');
    });
  });
});

