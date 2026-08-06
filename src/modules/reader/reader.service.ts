import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TtsService } from './tts.service';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export interface DocumentItem {
  id: string | number;
  titulo: string;
  autor?: string;
  formato: string;
  paginas?: number;
  cantidadChunks?: number;
}

export interface ReaderDocumentDetails {
  documentId: string | number;
  title: string;
  author: string;
  paginas: number;
  cantidadChunks: number;
  blocks: string[];
}

@Injectable()
export class ReaderService {
  private readonly logger = new Logger(ReaderService.name);
  private readonly storageAudioDir = path.join(process.cwd(), 'storage', 'audio');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ttsService: TtsService,
  ) {
    if (!fs.existsSync(this.storageAudioDir)) {
      fs.mkdirSync(this.storageAudioDir, { recursive: true });
    }
  }

  /**
   * Obtiene la lista completa de documentos disponibles para la lectura en JarBees.
   * Combina los documentos indexados en PostgreSQL/Prisma con los libros de library-index.json.
   */
  async listDocuments(): Promise<DocumentItem[]> {
    const list: DocumentItem[] = [];

    // 1. Obtener de la BD (Prisma)
    try {
      const dbDocs = await this.prisma.document.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          createdAt: true,
          _count: { select: { chunks: true } },
        },
        orderBy: { id: 'asc' },
      });

      for (const d of dbDocs) {
        const chunkCount = d._count?.chunks || 1;
        // Aproximadamente 5-6 chunks por bloque de 800 palabras
        const estimatedBlocks = Math.max(1, Math.ceil(chunkCount / 5));
        list.push({
          id: d.id,
          titulo: d.title,
          autor: d.category ? `Categoría: ${d.category}` : 'Biblioteca JarBees',
          formato: 'pdf',
          paginas: Math.max(15, chunkCount * 3),
          cantidadChunks: estimatedBlocks,
        });
      }
    } catch (err) {
      this.logger.warn(`[ReaderService] Error consultando BD para lista de documentos: ${err}`);
    }

    // 2. Obtener de library-index.json
    try {
      const indexPath = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
      if (fs.existsSync(indexPath)) {
        const raw = fs.readFileSync(indexPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const docs = parsed.documentos || [];
        for (const item of docs) {
          if (!list.some((existing) => existing.titulo.toLowerCase() === item.titulo.toLowerCase())) {
            list.push({
              id: item.id || item.titulo,
              titulo: item.titulo,
              autor: item.autor || 'JarBees Knowledge',
              formato: item.formato || 'pdf',
              paginas: item.paginas || 120,
              cantidadChunks: item.capitulos?.length || 5,
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn(`[ReaderService] Error leyendo library-index.json: ${err}`);
    }

    // 3. Fallback estático si no hay nada guardado
    if (list.length === 0) {
      return [
        { id: 'munay-ki-001', titulo: "Los Nueve Ritos del Munay-Ki", autor: "Tradición Q'ero / Alberto Villoldo", formato: 'pdf', paginas: 150, cantidadChunks: 4 },
        { id: 'astral-001', titulo: 'El Plano Astral', autor: 'Charles Webster Leadbeater', formato: 'pdf', paginas: 180, cantidadChunks: 6 },
        { id: 'buhlman-001', titulo: 'Adventures Beyond the Body', autor: 'William Buhlman', formato: 'pdf', paginas: 210, cantidadChunks: 8 },
        { id: 'herbario-001', titulo: 'Herbario y Plantas Medicinales', autor: 'Recopilación propia', formato: 'pdf', paginas: 95, cantidadChunks: 3 },
        { id: 'kybalion-001', titulo: 'El Kybalion', autor: 'Tres Iniciados / Hermes Trismegisto', formato: 'pdf', paginas: 130, cantidadChunks: 5 },
      ];
    }

    return list;
  }

  /**
   * Obtiene la información detallada de un documento y divide su contenido en bloques (chunks).
   */
  async getDocument(id: string | number): Promise<ReaderDocumentDetails> {
    const rawId = String(id).trim();
    let title = rawId;
    let author = 'Autor Desconocido';
    let paginas = 150;
    let contentText = '';

    // 1. Buscar en BD por ID entero
    const numericId = parseInt(rawId, 10);
    let dbDoc: any = null;

    if (!isNaN(numericId)) {
      try {
        dbDoc = await this.prisma.document.findUnique({
          where: { id: numericId },
          include: { chunks: { orderBy: { id: 'asc' } } },
        });
      } catch (err) {
        this.logger.warn(`[ReaderService] Error buscando por ID numérico ${numericId}: ${err}`);
      }
    }

    // 1.1 Si no es un entero o no se encontró por ID, buscar en BD por coincidencia de título
    if (!dbDoc) {
      try {
        dbDoc = await this.prisma.document.findFirst({
          where: {
            title: {
              contains: rawId,
              mode: 'insensitive',
            },
          },
          include: { chunks: { orderBy: { id: 'asc' } } },
        });

        // Si no se encontró exacto, buscar por palabras clave principales del título
        if (!dbDoc) {
          const keywords = rawId
            .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 4);

          for (const kw of keywords) {
            dbDoc = await this.prisma.document.findFirst({
              where: {
                title: {
                  contains: kw,
                  mode: 'insensitive',
                },
              },
              include: { chunks: { orderBy: { id: 'asc' } } },
            });
            if (dbDoc) break;
          }
        }
      } catch (err) {
        this.logger.warn(`[ReaderService] Error buscando por título "${rawId}": ${err}`);
      }
    }

    // Si se encontró en la BD
    if (dbDoc) {
      title = dbDoc.title;
      author = dbDoc.category ? `Categoría: ${dbDoc.category}` : 'Biblioteca JarBees';
      paginas = Math.max(15, dbDoc.chunks.length * 3);
      if (dbDoc.content && dbDoc.content.trim().length > 0) {
        contentText = dbDoc.content;
      } else if (dbDoc.chunks && dbDoc.chunks.length > 0) {
        contentText = dbDoc.chunks.map((c: any) => c.content).join('\n\n');
      }
    }

    // 2. Buscar en library-index.json o archivos de conocimiento en disco
    if (!contentText) {
      try {
        const indexPath = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
        if (fs.existsSync(indexPath)) {
          const raw = fs.readFileSync(indexPath, 'utf-8');
          const parsed = JSON.parse(raw);
          const docs: any[] = parsed.documentos || [];
          const item = docs.find((d) => String(d.id) === rawId || d.titulo.toLowerCase().includes(rawId.toLowerCase()) || rawId.toLowerCase().includes(d.titulo.toLowerCase()));
          if (item) {
            title = item.titulo;
            author = item.autor || 'JarBees Knowledge';
            paginas = item.paginas || 120;

            // Intentar cargar archivo .json o .md correspondiente únicamente a este documento
            const potentialFiles = [
              item.archivo,
              `${rawId}.json`,
              `${rawId}.md`,
              item.id ? `${item.id}.json` : null,
              item.id ? `${item.id}.md` : null,
            ].filter((f): f is string => Boolean(f));

            for (const filename of potentialFiles) {
              const fileLoc = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', filename);
              if (fs.existsSync(fileLoc)) {
                const fileRaw = fs.readFileSync(fileLoc, 'utf-8');
                if (filename.endsWith('.json')) {
                  try {
                    const parsedJson = JSON.parse(fileRaw);
                    contentText = this.flattenJsonToText(parsedJson);
                  } catch {
                    contentText = fileRaw;
                  }
                } else {
                  contentText = fileRaw;
                }
                if (contentText.trim()) break;
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn(`[ReaderService] Error buscando metadatos en library-index.json: ${err}`);
      }
    }

    // 3. Dividir texto en bloques
    let blocks: string[];
    if (contentText.trim().length > 0) {
      blocks = this.splitIntoBlocks(contentText, 800);
    } else {
      blocks = [
        `Capítulo 1 de ${title}. Bienvenido a la lectura mediante el módulo de audiolibro de JarBees.`,
        `Obra de ${author}. El texto extraído de la biblioteca se procesa progresivamente en bloques de síntesis de voz.`,
        `Mientras escuchas este fragmento, JarBees continúa generando en segundo plano los siguientes bloques con el modelo sematre/orpheus:it_es-3b.`,
        `Puedes bloquear la pantalla de tu dispositivo y el reproductor continuará emitiendo el audiolibro sin interrupciones.`,
      ];
    }

    if (this.isEnglishText(contentText)) {
      this.logger.log(`[ReaderService] Documento "${title}" detectado en inglés. Traduciendo bloques iniciales al español...`);
      for (let i = 0; i < Math.min(blocks.length, 3); i++) {
        blocks[i] = await this.translateBlockToSpanish(blocks[i]);
      }
    }

    return {
      documentId: dbDoc ? dbDoc.id : id,
      title,
      author,
      paginas,
      cantidadChunks: blocks.length,
      blocks,
    };
  }

  /**
   * Obtiene o genera el archivo de audio (.wav) para un bloque específico.
   * Almacena en caché en `storage/audio/doc_<id>/chunk<N>.wav` para no regenerar en reproducciones posteriores.
   */
  async getChunkAudio(id: string | number, chunkIndex: number): Promise<Buffer> {
    const safeDocId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const docAudioDir = path.join(this.storageAudioDir, `doc_${safeDocId}`);
    if (!fs.existsSync(docAudioDir)) {
      fs.mkdirSync(docAudioDir, { recursive: true });
    }

    const chunkFileName = `chunk${chunkIndex}.wav`;
    const chunkPath = path.join(docAudioDir, chunkFileName);

    // 1. Si ya existe en caché, devolverlo directamente
    if (fs.existsSync(chunkPath)) {
      this.logger.log(`[ReaderService] Sirviendo bloque ${chunkIndex} desde caché: ${chunkPath}`);
      return fs.readFileSync(chunkPath);
    }

    // 2. Si no existe, obtener el texto del bloque
    const docDetails = await this.getDocument(id);
    let textToSynthesize = docDetails.blocks[chunkIndex] || docDetails.blocks[0] || `Bloque ${chunkIndex} de ${docDetails.title}`;

    if (this.isEnglishText(textToSynthesize)) {
      this.logger.log(`[ReaderService] Texto en inglés detectado para bloque ${chunkIndex} de "${docDetails.title}". Traduciendo al español antes de la síntesis...`);
      textToSynthesize = await this.translateBlockToSpanish(textToSynthesize);
    }

    this.logger.log(`[ReaderService] Generando audio para bloque ${chunkIndex} de "${docDetails.title}"...`);
    const audioBuffer = await this.ttsService.generateAudio(textToSynthesize);

    // 3. Guardar en la caché de storage/audio
    try {
      fs.writeFileSync(chunkPath, audioBuffer);
      this.logger.log(`[ReaderService] Bloque ${chunkIndex} guardado exitosamente en caché.`);
    } catch (err) {
      this.logger.error(`[ReaderService] No se pudo guardar chunk en caché: ${err}`);
    }

    return audioBuffer;
  }

  /**
   * Detecta si un fragmento de texto está en inglés mediante análisis de vocabulario frecuente.
   */
  private isEnglishText(text: string): boolean {
    if (!text) return false;
    const sample = text.slice(0, 1500).toLowerCase();
    const englishWords = [
      ' the ', ' and ', ' of ', ' to ', ' in ', ' that ', ' is ', ' was ',
      ' for ', ' with ', ' as ', ' by ', ' on ', ' at ', ' from ', ' an ',
      ' have ', ' this ', ' produces ', ' chapter ', ' book ', ' experience '
    ];
    let matchCount = 0;
    for (const w of englishWords) {
      if (sample.includes(w)) matchCount++;
    }
    return matchCount >= 4;
  }

  /**
   * Traduce un bloque de texto del inglés al español usando el LLM local ultra-rápido (gemma3:1b / qwen3:1.7b).
   */
  private async translateBlockToSpanish(text: string): Promise<string> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    // Priorizar gemma3:1b o qwen3:1.7b para velocidad ultra-rápida (cero costo, respuesta en ~2s)
    const translationModel =
      process.env.OLLAMA_MODEL_TEST4_NAME ||
      process.env.OLLAMA_MODEL_TEST5_NAME ||
      'gemma3:1b';

    // Dividir en párrafos para evitar timeouts en Ollama con textos largos
    const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
    const translatedParts: string[] = [];

    for (const para of paragraphs) {
      if (!this.isEnglishText(para)) {
        translatedParts.push(para);
        continue;
      }

      try {
        const prompt = `Translate the following excerpt into clear, natural Spanish for an audiobook narrator. Output ONLY the Spanish translation without introduction or quotes:\n\n${para}`;

        const res = await axios.post(
          `${ollamaHost}/api/generate`,
          {
            model: translationModel,
            prompt,
            stream: false,
            options: {
              temperature: 0.2,
            },
          },
          { timeout: 30000 }
        );

        if (res.data && res.data.response && res.data.response.trim().length > 0) {
          translatedParts.push(res.data.response.trim());
        } else {
          translatedParts.push(para);
        }
      } catch (err: any) {
        this.logger.warn(`[ReaderService] Fallo traducción de párrafo con modelo ${translationModel} (${err?.message || err}).`);
        translatedParts.push(para);
      }
    }

    return translatedParts.join('\n\n');
  }

  /**
   * Transforma recursivamente una estructura JSON en prosa de texto continuo para síntesis de voz.
   */
  private flattenJsonToText(obj: any): string {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) {
      return obj.map((item) => this.flattenJsonToText(item)).join('. ');
    }
    if (typeof obj === 'object') {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'metadata' || key === 'id' || key === 'version') continue;
        const valText = this.flattenJsonToText(value);
        if (valText.trim()) {
          parts.push(`${key}: ${valText}`);
        }
      }
      return parts.join('\n\n');
    }
    return '';
  }

  /**
   * Divide un texto en bloques de aproximadamente `targetWords` palabras.
   */
  private splitIntoBlocks(text: string, targetWords = 800): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= targetWords) {
      return [text];
    }

    const blocks: string[] = [];
    for (let i = 0; i < words.length; i += targetWords) {
      const chunkWords = words.slice(i, i + targetWords);
      blocks.push(chunkWords.join(' '));
    }

    return blocks;
  }
}
