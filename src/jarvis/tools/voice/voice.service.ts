import { Injectable, Logger } from '@nestjs/common';
import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type AudioContainerFormat = 'wav' | 'ogg' | 'webm' | 'mp4' | 'mp3' | 'unknown';

export interface VoiceTranscriptionResult {
  text: string;
  confidence: number;
  durationMs: number;
  engine: string;
}

export interface VoiceStatus {
  opusdecAvailable: boolean;
  opusdecPath: string;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  sapiAvailable: boolean;
  ttsAvailable: boolean;
  supportedInputFormats: string[];
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly opusdecPath: string;
  private readonly ffmpegPath: string | null;
  private readonly tempDir: string;

  constructor() {
    this.opusdecPath =
      process.env.OPUSDEC_PATH ||
      'I:\\Programas\\CrystalDiskInfo8_12_13\\CdiResource\\opus\\opusdec.exe';

    this.ffmpegPath = this.resolveFfmpegPath();

    this.tempDir = path.join(os.tmpdir(), 'jarbees_voice');
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch (err) {
        this.logger.warn(`No se pudo crear tempDir: ${err.message}`);
      }
    }

    const opusAvailable = fs.existsSync(this.opusdecPath);
    this.logger.log(
      `[VoiceService] opusdec.exe ${opusAvailable ? 'detectado ✅' : 'no encontrado ⚠️'} en: ${this.opusdecPath}`,
    );
    this.logger.log(
      `[VoiceService] FFmpeg ${this.ffmpegPath ? 'detectado ✅ (' + this.ffmpegPath + ')' : 'no encontrado ⚠️'}`,
    );
  }

  /**
   * Intenta localizar el binario de FFmpeg en el sistema (WinGet, rutas estándar o PATH)
   */
  private resolveFfmpegPath(): string | null {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }

    // 1. Escanear directorio de paquetes WinGet
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackages)) {
      try {
        const dirs = fs.readdirSync(wingetPackages);
        for (const d of dirs) {
          if (d.toLowerCase().includes('ffmpeg')) {
            const fullD = path.join(wingetPackages, d);
            const candidate1 = path.join(fullD, 'bin', 'ffmpeg.exe');
            if (fs.existsSync(candidate1)) return candidate1;
            const candidateDirect = path.join(fullD, 'ffmpeg.exe');
            if (fs.existsSync(candidateDirect)) return candidateDirect;
            const subdirs = fs.readdirSync(fullD);
            for (const sub of subdirs) {
              const candidate2 = path.join(fullD, sub, 'bin', 'ffmpeg.exe');
              if (fs.existsSync(candidate2)) return candidate2;
            }
          }
        }
      } catch {
        // Ignorar posibles accesos restringidos
      }
    }

    // 2. Rutas estándar conocidas en Windows
    const standardPaths = [
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      'I:\\Programas\\ffmpeg\\bin\\ffmpeg.exe',
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return p;
    }

    // 3. Variables de entorno PATH del sistema
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);
    for (const dir of pathDirs) {
      if (!dir) continue;
      const candidate = path.join(dir, 'ffmpeg.exe');
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  /**
   * Obtiene la ruta del ejecutable FFmpeg si está disponible
   */
  getFfmpegPath(): string | null {
    if (this.ffmpegPath && fs.existsSync(this.ffmpegPath)) {
      return this.ffmpegPath;
    }
    return this.resolveFfmpegPath();
  }

  /**
   * Detecta el formato contenedor del audio inspeccionando sus números mágicos binarios
   */
  detectAudioContainer(buffer: Buffer): AudioContainerFormat {
    if (!buffer || buffer.length < 4) {
      return 'unknown';
    }

    // RIFF....WAVE (WAV PCM / IEEE Float)
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE'
    ) {
      return 'wav';
    }

    // OggS (Contenedor Ogg, usado por Opus/Vorbis nativo)
    if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
      return 'ogg';
    }

    // EBML Header (0x1A 0x45 0xDF 0xA3), usado por WebM / Matroska
    if (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return 'webm';
    }

    // MP4 / M4A (ftyp box en offset 4)
    if (
      buffer.length >= 8 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    ) {
      return 'mp4';
    }

    // MP3 (ID3v2 o frame sync 0xFF 0xEx/0xFx)
    if (
      buffer.length >= 3 &&
      buffer.subarray(0, 3).toString('ascii') === 'ID3'
    ) {
      return 'mp3';
    }
    if (
      buffer.length >= 2 &&
      buffer[0] === 0xff &&
      (buffer[1] & 0xe0) === 0xe0
    ) {
      return 'mp3';
    }

    return 'unknown';
  }

  /**
   * Retorna el estado y las capacidades de voz del sistema
   */
  async getStatus(): Promise<VoiceStatus> {
    const opusAvailable = fs.existsSync(this.opusdecPath);
    const currentFfmpeg = this.getFfmpegPath();
    let sapiAvailable = false;
    let ttsAvailable = false;

    try {
      const psCheck = `
        Add-Type -AssemblyName System.Speech;
        $recs = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()).Count;
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
        $voices = @($synth.GetInstalledVoices()).Count;
        Write-Output "$recs,$voices";
      `;
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCheck.replace(/\r?\n/g, ' ')}"`,
      );
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const recs = lines[0] || '0';
      const voices = lines[1] || '0';
      sapiAvailable = parseInt(recs, 10) > 0;
      ttsAvailable = parseInt(voices, 10) > 0;
    } catch (e) {
      this.logger.warn(`Error verificando SAPI: ${e.message}`);
    }

    return {
      opusdecAvailable: opusAvailable,
      opusdecPath: this.opusdecPath,
      ffmpegAvailable: !!currentFfmpeg,
      ffmpegPath: currentFfmpeg,
      sapiAvailable,
      ttsAvailable,
      supportedInputFormats: ['.opus', '.ogg', '.webm', '.wav', '.mp4', '.m4a', '.mp3'],
    };
  }

  /**
   * Decodifica un archivo de audio (WebM, OGG, Opus, MP4, MP3, WAV) a PCM WAV a 16kHz mono
   */
  async decodeToWav(
    inputPath: string,
    outputPath: string,
    containerType?: AudioContainerFormat,
  ): Promise<string> {
    const ffmpeg = this.getFfmpegPath();

    if (ffmpeg) {
      try {
        await execFileAsync(ffmpeg, [
          '-y',
          '-i',
          inputPath,
          '-ar',
          '16000',
          '-ac',
          '1',
          '-c:a',
          'pcm_s16le',
          outputPath,
        ]);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 44) {
          return outputPath;
        }
        throw new Error('FFmpeg finalizó pero no generó un archivo WAV de salida válido.');
      } catch (err) {
        this.logger.warn(
          `[VoiceService] Falló decodificación con FFmpeg (${err.message}). Intentando fallback si aplica...`,
        );
      }
    }

    // Fallback con opusdec únicamente si el contenedor es Ogg/Opus (opusdec no soporta WebM ni MP4)
    if (
      containerType !== 'webm' &&
      containerType !== 'mp4' &&
      containerType !== 'mp3' &&
      fs.existsSync(this.opusdecPath)
    ) {
      try {
        await execFileAsync(this.opusdecPath, [
          '--rate',
          '16000',
          '--force-wav',
          '--quiet',
          inputPath,
          outputPath,
        ]);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 44) {
          return outputPath;
        }
        throw new Error('opusdec no generó el archivo WAV de salida.');
      } catch (err) {
        this.logger.error(`Error en decodeOpusToWav: ${err.message}`);
        throw err;
      }
    }

    // Si ya es WAV y no tenemos FFmpeg disponible para remuestreo
    if (containerType === 'wav' && fs.existsSync(inputPath)) {
      await fs.promises.copyFile(inputPath, outputPath);
      return outputPath;
    }

    throw new Error(
      `No hay decodificador disponible para convertir el formato de audio detectado (${containerType || 'desconocido'}) a WAV. ` +
        `Por favor asegurate de que FFmpeg esté disponible o configurá FFMPEG_PATH.`,
    );
  }

  /**
   * Decodifica un archivo Opus/OGG a un archivo WAV PCM a 16kHz (mantenido por retrocompatibilidad)
   */
  async decodeOpusToWav(inputPath: string, outputPath: string): Promise<string> {
    return this.decodeToWav(inputPath, outputPath, 'ogg');
  }

  /**
   * Transcribe un archivo WAV utilizando el reconocedor SAPI en español de Windows
   */
  async transcribeWav(wavPath: string): Promise<VoiceTranscriptionResult> {
    const startTime = Date.now();
    const normalizedWav = wavPath.replace(/\\/g, '/');

    const psCommand = `
      Add-Type -AssemblyName System.Speech;
      $recs = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers();
      $rec = $recs | Where-Object { $_.Culture.Name -like 'es*' } | Select-Object -First 1;
      if (-not $rec -and $recs.Count -gt 0) { $rec = $recs[0]; }
      if ($rec) {
          $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($rec.Culture);
          $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));
          $engine.SetInputToWaveFile('${normalizedWav}');
          $res = $engine.Recognize();
          if ($res) {
              @{ text = $res.Text; confidence = [math]::Round($res.Confidence, 3); engine = $rec.Description } | ConvertTo-Json -Compress
          } else {
              '{"text":"","confidence":0,"engine":"' + $rec.Description + '"}'
          }
          $engine.Dispose();
      } else {
          '{"text":"","confidence":0,"engine":"none","error":"No recognizer installed"}'
      }
    `;

    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/\r?\n/g, ' ')}"`,
      );

      const parsed = JSON.parse(stdout.trim() || '{"text":"","confidence":0}');
      return {
        text: parsed.text || '',
        confidence: Number(parsed.confidence) || 0,
        durationMs: Date.now() - startTime,
        engine: parsed.engine || 'Windows SAPI',
      };
    } catch (err) {
      this.logger.error(`Error transcribiendo WAV: ${err.message}`);
      return {
        text: '',
        confidence: 0,
        durationMs: Date.now() - startTime,
        engine: 'error',
      };
    }
  }

  /**
   * Procesa un buffer de audio subido por el cliente (WebM, Opus, OGG, WAV, MP4, MP3) y devuelve la transcripción
   */
  async processAudioToText(
    buffer: Buffer,
    originalFilename = 'audio.opus',
  ): Promise<VoiceTranscriptionResult> {
    if (!buffer || buffer.length === 0) {
      return {
        text: '',
        confidence: 0,
        durationMs: 0,
        engine: 'empty_input',
      };
    }

    const container = this.detectAudioContainer(buffer);
    let ext = path.extname(originalFilename).toLowerCase();

    // Normalizar extensión según contenedor binario detectado para guiar a los decodificadores
    if (container === 'webm') ext = '.webm';
    else if (container === 'ogg') ext = ext === '.opus' ? '.opus' : '.ogg';
    else if (container === 'wav') ext = '.wav';
    else if (container === 'mp4') ext = '.mp4';
    else if (container === 'mp3') ext = '.mp3';
    else if (!ext) ext = '.bin';

    const tempBase = path.join(
      this.tempDir,
      `voice_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    );
    const tempInput = `${tempBase}${ext}`;
    const tempWav = `${tempBase}.wav`;

    try {
      await fs.promises.writeFile(tempInput, buffer);

      // Decodificar a WAV PCM 16kHz mono (optimizado para el reconocedor SAPI/Whisper)
      const targetWav = await this.decodeToWav(tempInput, tempWav, container);

      const result = await this.transcribeWav(targetWav);
      return result;
    } finally {
      try {
        if (fs.existsSync(tempInput)) await fs.promises.unlink(tempInput);
        if (fs.existsSync(tempWav)) await fs.promises.unlink(tempWav);
      } catch (cleanupErr) {
        this.logger.warn(`Error limpiando archivos temporales: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Sintetiza texto a voz generando un archivo WAV con la voz en español de Windows (Helena)
   */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    const tempWav = path.join(
      this.tempDir,
      `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`,
    );
    const normalizedWav = tempWav.replace(/\\/g, '/');
    const b64Text = Buffer.from(text, 'utf8').toString('base64');

    const psCommand = `
      Add-Type -AssemblyName System.Speech;
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $voices = @($synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es*' });
      if ($voices.Count -gt 0) {
          $synth.SelectVoice($voices[0].VoiceInfo.Name);
      }
      $synth.SetOutputToWaveFile('${normalizedWav}');
      $textBytes = [System.Convert]::FromBase64String('${b64Text}');
      $textToSpeak = [System.Text.Encoding]::UTF8.GetString($textBytes);
      $synth.Speak($textToSpeak);
      $synth.Dispose();
    `;

    try {
      await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/\r?\n/g, ' ')}"`,
      );

      if (!fs.existsSync(tempWav)) {
        throw new Error('No se generó el archivo de audio sintetizado.');
      }

      const buffer = await fs.promises.readFile(tempWav);
      return buffer;
    } finally {
      try {
        if (fs.existsSync(tempWav)) await fs.promises.unlink(tempWav);
      } catch (cleanupErr) {
        this.logger.warn(`Error eliminando archivo TTS: ${cleanupErr.message}`);
      }
    }
  }

  /**
   * Une múltiples buffers WAV (con el mismo sample rate y canales) en un solo archivo WAV continuo válido
   */
  stitchWavBuffers(wavBuffers: Buffer[]): Buffer {
    if (!wavBuffers || wavBuffers.length === 0) return Buffer.alloc(0);
    if (wavBuffers.length === 1) return wavBuffers[0];

    const firstHeader = wavBuffers[0].subarray(0, 44);
    const pcmChunks = wavBuffers.map((buf) => buf.subarray(44));
    const totalPcm = Buffer.concat(pcmChunks);

    const masterHeader = Buffer.from(firstHeader);
    const totalFileSize = 36 + totalPcm.length;
    masterHeader.writeUInt32LE(totalFileSize, 4);
    masterHeader.writeUInt32LE(totalPcm.length, 40);

    return Buffer.concat([masterHeader, totalPcm]);
  }

  /**
   * Genera un audiolibro completo a partir de un texto extenso dividiéndolo en fragmentos narrables
   */
  async generateAudiobook(
    text: string,
    metadata?: { title?: string; author?: string },
  ): Promise<Buffer> {
    // 1. Dividir texto en párrafos o secciones manejables (<350 caracteres)
    const rawSentences = text
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const chunks: string[] = [];
    let currentChunk = '';

    if (metadata?.title) {
      currentChunk = `Audiolibro: ${metadata.title}. ${metadata.author ? `Por ${metadata.author}.` : ''} `;
    }

    for (const sentence of rawSentences) {
      if ((currentChunk + ' ' + sentence).length > 350) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    this.logger.log(
      `[VoiceService] Generando audiolibro (${chunks.length} fragmentos de audio narrados)...`,
    );

    // 2. Sintetizar cada fragmento
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      try {
        const buf = await this.synthesizeSpeech(chunk);
        buffers.push(buf);
      } catch (err) {
        this.logger.warn(`Error sintetizando fragmento: ${err.message}`);
      }
    }

    // 3. Unir todos los fragmentos en un WAV continuo
    return this.stitchWavBuffers(buffers);
  }
}
