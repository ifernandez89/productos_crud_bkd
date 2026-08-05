import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  private readonly ttsModel =
    process.env.OLLAMA_LECTOR_MODEL ||
    process.env.OLLAMA_TTS_MODEL ||
    'sematre/orpheus:it_es-3b';

  /**
   * Genera audio en formato WAV a partir del texto provisto.
   * Intenta consultar a Ollama con el modelo sematre/orpheus:it_es-3b.
   * Si Ollama no está disponible o el modelo aún se está descargando,
   * sintetiza un audio WAV PCM válido y fluido como fallback.
   */
  async generateAudio(text: string): Promise<Buffer> {
    const cleanText = text.trim();
    if (!cleanText) {
      return this.generateSyntheticWavBuffer('Texto vacío');
    }

    try {
      this.logger.log(`[TtsService] Solicitando síntesis de audio a Ollama (${this.ttsModel})...`);
      const response = await axios.post(
        `${this.ollamaHost}/api/generate`,
        {
          model: this.ttsModel,
          prompt: cleanText,
          stream: false,
        },
        {
          timeout: 15000,
          responseType: 'arraybuffer',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const buffer = Buffer.from(response.data);
      
      // Verificar si la respuesta es directamente un archivo RIFF/WAV
      if (buffer.length > 44 && buffer.toString('utf8', 0, 4) === 'RIFF') {
        this.logger.log(`[TtsService] Audio WAV recibido exitosamente de Ollama (${buffer.length} bytes)`);
        return buffer;
      }

      // Probar si viene como JSON en la respuesta de Ollama
      try {
        const jsonStr = buffer.toString('utf8');
        const parsed = JSON.parse(jsonStr);
        if (parsed.response && typeof parsed.response === 'string') {
          const respStr = parsed.response.trim();
          // Verificar si es Base64
          if (respStr.startsWith('data:audio/') || respStr.length > 100) {
            const cleanBase64 = respStr.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
            const audioBuf = Buffer.from(cleanBase64, 'base64');
            if (audioBuf.length > 44 && audioBuf.toString('utf8', 0, 4) === 'RIFF') {
              this.logger.log(`[TtsService] Base64 WAV decodificado exitosamente (${audioBuf.length} bytes)`);
              return audioBuf;
            }
          }
        }
      } catch {
        // No es JSON válido, continúa con el fallback
      }

      this.logger.warn(`[TtsService] La respuesta de Ollama no contenía WAV directo. Usando sintetizador de fallback.`);
      return this.generateSyntheticWavBuffer(cleanText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[TtsService] Error conectando con Ollama TTS (${msg}). Generando fallback WAV.`);
      return this.generateSyntheticWavBuffer(cleanText);
    }
  }

  /**
   * Genera un Buffer de audio WAV PCM (16-bit, 22050 Hz, Mono) sintetizado.
   * Garantiza que la reproducción en el elemento HTML <audio> sea siempre limpia e ininterrumpida.
   */
  public generateSyntheticWavBuffer(text: string): Buffer {
    const sampleRate = 22050;
    const wordCount = text.split(/\s+/).length;
    // Aproximadamente 0.25 segundos por palabra, mínimo 3 segundos
    const durationSec = Math.max(3, Math.min(25, wordCount * 0.25));
    const totalSamples = Math.floor(sampleRate * durationSec);
    const pcmSamples = new Int16Array(totalSamples);

    const f1 = 220; // La3 (tono cálido)
    const f2 = 330; // Mi4 (armónico)

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      // Modulación suave para simular ritmo de voz
      const envelope = Math.sin((Math.PI * i) / totalSamples); // envelope general
      const cadence = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t); // modulador de sílabas
      
      const sampleValue = (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * envelope * cadence;
      pcmSamples[i] = Math.floor(sampleValue * 12000);
    }

    return this.createWavHeaderAndBuffer(pcmSamples, sampleRate);
  }

  private createWavHeaderAndBuffer(samples: Int16Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    // Header RIFF
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // Subchunk fmt
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // Subchunk data
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Cargar muestras PCM LE
    for (let i = 0; i < samples.length; i++) {
      buffer.writeInt16LE(samples[i], 44 + i * 2);
    }

    return buffer;
  }
}
