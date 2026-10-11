import { Injectable, Logger } from '@nestjs/common';
import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface VoiceTranscriptionResult {
  text: string;
  confidence: number;
  durationMs: number;
  engine: string;
}

export interface VoiceStatus {
  opusdecAvailable: boolean;
  opusdecPath: string;
  sapiAvailable: boolean;
  ttsAvailable: boolean;
  supportedInputFormats: string[];
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly opusdecPath: string;
  private readonly tempDir: string;

  constructor() {
    this.opusdecPath =
      process.env.OPUSDEC_PATH ||
      'I:\\Programas\\CrystalDiskInfo8_12_13\\CdiResource\\opus\\opusdec.exe';

    this.tempDir = path.join(os.tmpdir(), 'jarbees_voice');
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch (err) {
        this.logger.warn(`No se pudo crear tempDir: ${err.message}`);
      }
    }

    const available = fs.existsSync(this.opusdecPath);
    this.logger.log(
      `[VoiceService] opusdec.exe ${available ? 'detectado ✅' : 'no encontrado ⚠️'} en: ${this.opusdecPath}`,
    );
  }

  /**
   * Retorna el estado y las capacidades de voz del sistema
   */
  async getStatus(): Promise<VoiceStatus> {
    const opusAvailable = fs.existsSync(this.opusdecPath);
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
      sapiAvailable,
      ttsAvailable,
      supportedInputFormats: ['.opus', '.ogg', '.webm', '.wav'],
    };
  }

  /**
   * Decodifica un archivo Opus/OGG a un archivo WAV PCM a 16kHz
   */
  async decodeOpusToWav(inputPath: string, outputPath: string): Promise<string> {
    if (!fs.existsSync(this.opusdecPath)) {
      throw new Error(
        `opusdec.exe no encontrado en ${this.opusdecPath}. Por favor verificá la ruta o configurá OPUSDEC_PATH.`,
      );
    }

    try {
      await execFileAsync(this.opusdecPath, [
        '--rate',
        '16000',
        '--force-wav',
        '--quiet',
        inputPath,
        outputPath,
      ]);

      if (!fs.existsSync(outputPath)) {
        throw new Error('opusdec no generó el archivo WAV de salida.');
      }

      return outputPath;
    } catch (err) {
      this.logger.error(`Error en decodeOpusToWav: ${err.message}`);
      throw err;
    }
  }

  /**
   * Transcribe un archivo WAV utilizando el reconocedor SAPI en español de Windows
   */
  async transcribeWav(wavPath: string): Promise<VoiceTranscriptionResult> {
    const startTime = Date.now();
    const normalizedWav = wavPath.replace(/\\/g, '/');

    const psCommand = `
      Add-Type -AssemblyName System.Speech;
      $culture = New-Object System.Globalization.CultureInfo('es-ES');
      $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture);
      $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));
      $engine.SetInputToWaveFile('${normalizedWav}');
      $res = $engine.Recognize();
      if ($res) {
          @{ text = $res.Text; confidence = [math]::Round($res.Confidence, 3) } | ConvertTo-Json -Compress
      } else {
          '{"text":"","confidence":0}'
      }
      $engine.Dispose();
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
        engine: 'Windows SAPI 8.0 (es-ES)',
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
   * Procesa un buffer de audio subido por el cliente (Opus, OGG, WebM o WAV) y devuelve la transcripción
   */
  async processAudioToText(
    buffer: Buffer,
    originalFilename = 'audio.opus',
  ): Promise<VoiceTranscriptionResult> {
    const ext = path.extname(originalFilename).toLowerCase() || '.opus';
    const tempBase = path.join(
      this.tempDir,
      `voice_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    );
    const tempInput = `${tempBase}${ext}`;
    const tempWav = `${tempBase}.wav`;

    try {
      await fs.promises.writeFile(tempInput, buffer);

      let targetWav = tempInput;
      if (ext !== '.wav') {
        targetWav = await this.decodeOpusToWav(tempInput, tempWav);
      }

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
