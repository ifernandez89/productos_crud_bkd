import { Injectable, Logger } from '@nestjs/common';
import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type AudioContainerFormat = 'wav' | 'ogg' | 'webm' | 'mp4' | 'mp3' | 'unknown';

export interface VoiceTranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface VoiceTranscriptionResult {
  text: string;
  confidence: number;
  durationMs: number;
  engine: string;
  language?: string;
  segments?: VoiceTranscriptionSegment[];
}

export interface VoiceStatus {
  opusdecAvailable: boolean;
  opusdecPath: string;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  sapiAvailable: boolean;
  ttsAvailable: boolean;
  whisperAvailable: boolean;
  edgeTtsAvailable: boolean;
  defaultTtsVoice: string;
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
   * Resuelve la ruta absoluta de un script Python auxiliar de voz
   */
  resolveVoiceScript(scriptName: string): string | null {
    const candidate1 = path.join(__dirname, scriptName);
    if (fs.existsSync(candidate1)) return candidate1;
    const candidate2 = path.join(process.cwd(), 'src', 'jarvis', 'tools', 'voice', scriptName);
    if (fs.existsSync(candidate2)) return candidate2;
    return null;
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

    const whisperScript = this.resolveVoiceScript('whisper_transcribe.py');
    const edgeTtsScript = this.resolveVoiceScript('edge_tts_synthesize.py');

    return {
      opusdecAvailable: opusAvailable,
      opusdecPath: this.opusdecPath,
      ffmpegAvailable: !!currentFfmpeg,
      ffmpegPath: currentFfmpeg,
      sapiAvailable,
      ttsAvailable: ttsAvailable || !!edgeTtsScript,
      whisperAvailable: !!whisperScript,
      edgeTtsAvailable: !!edgeTtsScript,
      defaultTtsVoice: process.env.JARVIS_TTS_VOICE || 'es-AR-TomasNeural',
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
   * Transcribe un archivo de audio con Faster-Whisper (precisión superior en niños, adultos y ruido)
   */
  async transcribeWithWhisper(wavPath: string): Promise<VoiceTranscriptionResult | null> {
    const scriptPath = this.resolveVoiceScript('whisper_transcribe.py');
    if (!scriptPath) {
      return null;
    }

    const startTime = Date.now();
    try {
      const { stdout } = await execFileAsync('python', [
        scriptPath,
        wavPath,
        process.env.JARVIS_WHISPER_MODEL || 'base',
        'es',
      ], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const parsed = JSON.parse(stdout.trim());
      if (parsed.error) {
        this.logger.warn(`[VoiceService:Whisper] Falló Whisper: ${parsed.error}`);
        return null;
      }

      if (!parsed.text || parsed.text.trim().length === 0) {
        return null;
      }

      this.logger.log(
        `[VoiceService:Whisper] Transcripción exitosa (${parsed.durationMs}ms, conf: ${parsed.confidence}): "${parsed.text.slice(0, 80)}"`,
      );

      return {
        text: parsed.text.trim(),
        confidence: Number(parsed.confidence) || 0.85,
        durationMs: Date.now() - startTime,
        engine: parsed.engine || 'faster-whisper-base',
        language: parsed.language || 'es',
        segments: parsed.segments || [],
      };
    } catch (err: any) {
      this.logger.warn(`[VoiceService:Whisper] Excepción ejecutando Whisper (${err.message}). Derivando a fallback...`);
      return null;
    }
  }

  /**
   * Fallback de transcripción usando Windows SAPI 5.x
   */
  async transcribeWithSapi(wavPath: string): Promise<VoiceTranscriptionResult> {
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
      this.logger.error(`Error transcribiendo con SAPI: ${err.message}`);
      return {
        text: '',
        confidence: 0,
        durationMs: Date.now() - startTime,
        engine: 'error',
      };
    }
  }

  /**
   * Transcribe un archivo WAV utilizando Faster-Whisper con fallback transparente a SAPI
   */
  async transcribeWav(wavPath: string): Promise<VoiceTranscriptionResult> {
    // 1. Intentar primero con Faster-Whisper (soporte de acento argentino, niños y adultos)
    const whisperRes = await this.transcribeWithWhisper(wavPath);
    if (whisperRes && whisperRes.text && whisperRes.text.length > 0) {
      return whisperRes;
    }

    // 2. Fallback resiliente con Windows SAPI
    return this.transcribeWithSapi(wavPath);
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
    const tempInput = `${tempBase}_in${ext}`;
    const tempWav = `${tempBase}_out.wav`;

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
   * Sintetiza texto a voz neural hiper-realista en español rioplatense/latino (Edge-TTS)
   */
  async synthesizeWithEdgeTTS(
    text: string,
    voice = process.env.JARVIS_TTS_VOICE || 'es-AR-TomasNeural',
  ): Promise<Buffer | null> {
    const scriptPath = this.resolveVoiceScript('edge_tts_synthesize.py');
    const ffmpeg = this.getFfmpegPath();
    if (!scriptPath || !ffmpeg) {
      return null;
    }

    const tempBase = path.join(
      this.tempDir,
      `edge_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    );
    const tempMp3 = `${tempBase}.mp3`;
    const tempWav = `${tempBase}.wav`;
    const b64Text = Buffer.from(text, 'utf8').toString('base64');

    try {
      await execFileAsync('python', [
        scriptPath,
        `base64:${b64Text}`,
        tempMp3,
        voice,
      ], {
        timeout: 30000,
      });

      if (!fs.existsSync(tempMp3) || fs.statSync(tempMp3).size === 0) {
        throw new Error('edge-tts no generó el archivo MP3');
      }

      // Convertir a PCM WAV a 24000Hz mono con FFmpeg para máxima nitidez y compatibilidad
      await execFileAsync(ffmpeg, [
        '-y',
        '-i',
        tempMp3,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        tempWav,
      ]);

      if (!fs.existsSync(tempWav) || fs.statSync(tempWav).size === 0) {
        throw new Error('FFmpeg falló al convertir salida MP3 a WAV');
      }

      const buffer = await fs.promises.readFile(tempWav);
      this.logger.log(`[VoiceService:EdgeTTS] Síntesis neural completada (${buffer.length} bytes, voz: ${voice})`);
      return buffer;
    } catch (err: any) {
      this.logger.warn(`[VoiceService:EdgeTTS] Falló síntesis neural (${err.message}). Cayendo a SAPI...`);
      return null;
    } finally {
      try {
        if (fs.existsSync(tempMp3)) await fs.promises.unlink(tempMp3);
        if (fs.existsSync(tempWav)) await fs.promises.unlink(tempWav);
      } catch {}
    }
  }

  /**
   * Fallback de síntesis de voz con Windows SAPI (Microsoft Helena Desktop)
   */
  async synthesizeSpeechWithSapi(text: string): Promise<Buffer> {
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
        throw new Error('No se generó el archivo de audio sintetizado con SAPI.');
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
   * Sintetiza texto a voz (Edge-TTS neural primario con fallback a SAPI)
   */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    // 1. Intentar primero con síntesis neural hiper-realista
    const neuralBuffer = await this.synthesizeWithEdgeTTS(text);
    if (neuralBuffer && neuralBuffer.length > 44) {
      return neuralBuffer;
    }

    // 2. Fallback offline con Windows SAPI
    return this.synthesizeSpeechWithSapi(text);
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
