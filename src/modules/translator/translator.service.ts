import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// pdf-parse v2: API basada en clase
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

export interface TranslationJob {
  jobId: string;
  status: 'pending' | 'translating' | 'building_pdf' | 'ingesting' | 'done' | 'error';
  progress: number; // 0-100
  originalTitle: string;
  translatedTitle?: string;
  documentId?: number;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
}

export interface TranslationResult {
  jobId: string;
  documentId: number;
  title: string;
  originalTitle: string;
  language: string;
  pdfPath: string;
  chunks: number;
}

@Injectable()
export class TranslatorService {
  private readonly logger = new Logger(TranslatorService.name);
  private readonly translatedDir = path.join(process.cwd(), 'storage', 'translated');
  private readonly jobs = new Map<string, TranslationJob>();

  // Idiomas soportados para detección
  private readonly LANG_PATTERNS: Record<string, string[]> = {
    en: [' the ', ' and ', ' of ', ' to ', ' in ', ' that ', ' is ', ' was ', ' for ', ' with ', ' as ', ' have ', ' this ', ' chapter ', ' book '],
    ro: [' și ', ' că ', ' este ', ' sunt ', ' de ', ' la ', ' cu ', ' din ', ' pe ', ' pentru ', ' nu ', ' se ', ' o ', ' un '],
    fr: [' les ', ' des ', ' que ', ' est ', ' dans ', ' sur ', ' pour ', ' avec ', ' une ', ' qui ', ' pas ', ' sont ', ' ont ', ' ce '],
    de: [' die ', ' der ', ' und ', ' den ', ' ein ', ' ist ', ' ich ', ' dass ', ' von ', ' mit ', ' sich ', ' auf ', ' eine '],
    pt: [' que ', ' de ', ' o ', ' a ', ' os ', ' as ', ' um ', ' uma ', ' para ', ' com ', ' não ', ' se ', ' são ', ' mas '],
    it: [' che ', ' non ', ' un ', ' una ', ' con ', ' per ', ' del ', ' nel ', ' gli ', ' una ', ' sono ', ' dei ', ' nella '],
  };

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.translatedDir)) {
      fs.mkdirSync(this.translatedDir, { recursive: true });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // MÉTODO PRINCIPAL: Traducir un PDF (buffer) al español
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Recibe un buffer de PDF, lo traduce completamente al español con Qwen3:4b,
   * genera un nuevo PDF, lo ingesta en la BD y oculta el documento original si existe.
   */
  async translatePdfBuffer(
    buffer: Buffer,
    filename: string,
    customTitle?: string,
    category?: string,
    originalDocId?: number,
  ): Promise<TranslationJob> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const job: TranslationJob = {
      jobId,
      status: 'pending',
      progress: 0,
      originalTitle: customTitle || filename.replace(/\.pdf$/i, ''),
      startedAt: new Date(),
    };
    this.jobs.set(jobId, job);

    // Ejecutar en background sin bloquear la respuesta HTTP
    this.runTranslationPipeline(buffer, filename, customTitle, category, originalDocId, job).catch(
      (err) => {
        job.status = 'error';
        job.error = err?.message || String(err);
        job.finishedAt = new Date();
        this.logger.error(`[TranslatorService] Pipeline falló para job ${jobId}: ${job.error}`);
      },
    );

    return job;
  }

  /**
   * Traduce un documento ya indexado en la BD (por ID) al español.
   */
  async translateExistingDocument(
    docId: number,
    customTitle?: string,
    category?: string,
  ): Promise<TranslationJob> {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException(`Documento ${docId} no encontrado`);

    const content = doc.content?.trim();
    if (!content) throw new NotFoundException(`Documento ${docId} no tiene contenido extraíble`);

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: TranslationJob = {
      jobId,
      status: 'pending',
      progress: 0,
      originalTitle: doc.title,
      startedAt: new Date(),
    };
    this.jobs.set(jobId, job);

    // Convertir el texto existente a Buffer ficticio para reusar el pipeline
    this.runTranslationFromText(
      content,
      doc.title,
      customTitle,
      category || doc.category || undefined,
      docId,
      job,
    ).catch((err) => {
      job.status = 'error';
      job.error = err?.message || String(err);
      job.finishedAt = new Date();
    });

    return job;
  }

  /**
   * Obtiene el estado de un job de traducción en curso.
   */
  getJobStatus(jobId: string): TranslationJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Lista todos los jobs de traducción (incluyendo los finalizados en memoria).
   */
  listJobs(): TranslationJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );
  }

  /**
   * Oculta un documento del Reader sin borrarlo de la BD.
   */
  async hideDocument(docId: number, reason = 'foreign_language'): Promise<void> {
    await this.prisma.document.update({
      where: { id: docId },
      data: {
        hidden: true,
        category: reason, // Guardamos la razón en category como nota de auditoría
      },
    });
    this.logger.log(`[TranslatorService] Documento ${docId} ocultado del Reader (razón: ${reason})`);
  }

  /**
   * Lista todos los documentos traducidos disponibles.
   */
  async listTranslatedDocuments() {
    return this.prisma.document.findMany({
      where: { language: 'es', hidden: false },
      select: { id: true, title: true, category: true, createdAt: true, translatedFromId: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // PIPELINE INTERNO
  // ──────────────────────────────────────────────────────────────────────────────

  private async runTranslationPipeline(
    buffer: Buffer,
    filename: string,
    customTitle: string | undefined,
    category: string | undefined,
    originalDocId: number | undefined,
    job: TranslationJob,
  ): Promise<void> {
    // PASO 1: Extraer texto del PDF
    job.status = 'translating';
    job.progress = 5;
    this.logger.log(`[TranslatorService] [${job.jobId}] Extrayendo texto del PDF "${filename}"...`);

    let text: string;
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      text = result.text?.trim();
      if (!text) throw new Error('PDF sin texto extraíble (puede ser imagen escaneada)');
      text = this.sanitizeText(text);
    } catch (err: any) {
      throw new Error(`No se pudo extraer texto del PDF: ${err?.message || err}`);
    }

    const title = customTitle || filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    await this.runTranslationFromText(text, title, customTitle, category, originalDocId, job);
  }

  private async runTranslationFromText(
    text: string,
    originalTitle: string,
    customTitle: string | undefined,
    category: string | undefined,
    originalDocId: number | undefined,
    job: TranslationJob,
  ): Promise<void> {
    job.status = 'translating';
    job.progress = 10;

    // PASO 2: Detectar idioma
    const detectedLang = this.detectLanguage(text);
    this.logger.log(`[TranslatorService] [${job.jobId}] Idioma detectado: ${detectedLang} para "${originalTitle}"`);

    if (detectedLang === 'es') {
      this.logger.warn(`[TranslatorService] [${job.jobId}] El texto ya está en español. Se ingesta directamente.`);
    }

    // PASO 3: Dividir texto en chunks y traducir al español
    // Nota: Ollama en CPU es single-threaded — 1 worker secuencial con chunks medianos es óptimo
    const chunks = this.splitTextIntoTranslationChunks(text, 2000);
    this.logger.log(`[TranslatorService] [${job.jobId}] ${chunks.length} chunks a traducir para "${originalTitle}"`);

    const translatedChunks: string[] = new Array(chunks.length).fill('');

    if (detectedLang === 'es') {
      for (let i = 0; i < chunks.length; i++) translatedChunks[i] = chunks[i];
      job.progress = 80;
    } else {
      for (let i = 0; i < chunks.length; i++) {
        translatedChunks[i] = await this.translateChunkWithModel(chunks[i], originalTitle);
        job.progress = 10 + Math.floor(((i + 1) / chunks.length) * 70);
        if ((i + 1) % 5 === 0 || i + 1 === chunks.length) {
          this.logger.log(
            `[TranslatorService] [${job.jobId}] Chunk ${i + 1}/${chunks.length} (${job.progress}%)`,
          );
        }
      }
    }

    const fullTranslatedText = translatedChunks.join('\n\n');
    const finalTitle = customTitle || `${originalTitle} (Español)`;
    job.translatedTitle = finalTitle;

    // PASO 4: Generar PDF traducido
    job.status = 'building_pdf';
    job.progress = 82;
    this.logger.log(`[TranslatorService] [${job.jobId}] Generando PDF traducido "${finalTitle}"...`);

    const pdfBuffer = await this.buildTranslatedPdf(finalTitle, originalTitle, fullTranslatedText, detectedLang);
    const safeFilename = finalTitle.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '_').replace(/\s+/g, '_');
    const pdfPath = path.join(this.translatedDir, `${safeFilename}_es.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    this.logger.log(`[TranslatorService] [${job.jobId}] PDF guardado en: ${pdfPath}`);

    // PASO 5: Ingestar en la BD
    job.status = 'ingesting';
    job.progress = 90;
    this.logger.log(`[TranslatorService] [${job.jobId}] Ingresando documento en BD...`);

    const newDoc = await this.prisma.document.create({
      data: {
        title: finalTitle,
        content: fullTranslatedText,
        category: category || 'traduccion-jarbees',
        source: pdfPath,
        status: 'ready', // Disponible inmediatamente para el Reader
        language: 'es',
        translatedFromId: originalDocId ?? null,
        progressIndex: 100.0,
        progressEmbed: 0.0,
        progressSummary: 0.0,
      },
    });

    this.logger.log(`[TranslatorService] [${job.jobId}] Documento creado con ID=${newDoc.id} status=ready`);

    // PASO 6: Ocultar documento original si se indicó
    if (originalDocId) {
      await this.hideDocument(originalDocId, 'traducido_al_espanol');
      this.logger.log(`[TranslatorService] [${job.jobId}] Documento original ${originalDocId} ocultado del Reader`);
    }

    // Completado
    job.status = 'done';
    job.progress = 100;
    job.documentId = newDoc.id;
    job.finishedAt = new Date();

    this.logger.log(`[TranslatorService] [${job.jobId}] ✅ Traducción completada. DocId=${newDoc.id} | "${finalTitle}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TRADUCCIÓN CON MODELO DEDICADO (OLLAMA_TRADUCTOR_MODEL)
  // ──────────────────────────────────────────────────────────────────────────────

  private async translateChunkWithModel(text: string, bookTitle: string): Promise<string> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_TRADUCTOR_MODEL || 'RogerBen/hy-mt1.5-1.8b:latest';

    const prompt = `Translate the following excerpt from "${bookTitle}" into fluent Spanish:\n\n${text}`;

    // Reintentos con backoff
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await axios.post(
          `${ollamaHost}/api/generate`,
          {
            model,
            system: 'You are a professional translator. Translate the text accurately into clear Spanish. Preserve paragraph breaks and formatting. Output ONLY the Spanish translation without commentary or instructions.',
            prompt,
            stream: false,
            options: {
              temperature: 0.1,
              top_p: 0.9,
              num_predict: 4096,
            },
          },
          { timeout: 90000 }, // 90s por chunk (modelo 1.8B ultra rápido)
        );

        let response = res.data?.response?.trim();
        if (!response) {
          this.logger.warn(`[TranslatorService] ${model} devolvió respuesta vacía (intento ${attempt}/${maxRetries})`);
          if (attempt === maxRetries) return text;
          continue;
        }

        // Limpiar prefijos residuales si el modelo incluyera el encabezado
        response = response
          .replace(/^(Translate the following excerpt|Traduce el siguiente fragmento)[^\n]*\n+/i, '')
          .replace(/^Traducción:\s*/i, '')
          .trim();

        return response;
      } catch (err: any) {
        const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('timeout');
        this.logger.warn(
          `[TranslatorService] Intento ${attempt}/${maxRetries} fallido con ${model}: ${err?.message || err}${
            isTimeout ? ' — timeout al procesar chunk' : ''
          }`,
        );
        if (attempt < maxRetries) {
          const waitMs = attempt * 5000;
          this.logger.log(`[TranslatorService] Reintentando en ${waitMs / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else {
          this.logger.warn(`[TranslatorService] Chunk no traducido tras ${maxRetries} intentos. Usando texto original.`);
          return text;
        }
      }
    }
    return text;
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // GENERACIÓN DEL PDF TRADUCIDO (libro completo)
  // ──────────────────────────────────────────────────────────────────────────────

  private async buildTranslatedPdf(
    title: string,
    originalTitle: string,
    fullText: string,
    sourceLang: string,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const pageWidth = 595; // A4
    const pageHeight = 842;
    const marginTop = 70;
    const marginBottom = 60;
    const marginLeft = 72;
    const marginRight = 72;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const lineHeight = 14;
    const titleFontSize = 22;
    const subtitleFontSize = 12;
    const bodyFontSize = 11;
    const footerFontSize = 9;

    const colorPrimary = rgb(0.08, 0.12, 0.28);   // Azul oscuro para títulos
    const colorBody = rgb(0.1, 0.1, 0.1);           // Gris muy oscuro para cuerpo
    const colorMeta = rgb(0.4, 0.4, 0.45);          // Gris medio para metadatos
    const colorAccent = rgb(0.15, 0.45, 0.72);      // Azul JarBees para accent

    // ── PORTADA ────────────────────────────────────────────────────────────────
    const coverPage = pdfDoc.addPage([pageWidth, pageHeight]);

    // Fondo de portada (rectángulo oscuro superior)
    coverPage.drawRectangle({
      x: 0, y: pageHeight - 300,
      width: pageWidth, height: 300,
      color: colorPrimary,
    });

    // Título del libro (portada)
    const titleLines = this.wrapText(title, fontBold, titleFontSize, contentWidth);
    let coverY = pageHeight - 110;
    for (const line of titleLines) {
      coverPage.drawText(line, {
        x: marginLeft,
        y: coverY,
        size: titleFontSize,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      coverY -= titleFontSize + 8;
    }

    // Badge "Traducido al Español"
    coverPage.drawRectangle({
      x: marginLeft, y: coverY - 10,
      width: 200, height: 26,
      color: colorAccent,
    });
    coverPage.drawText('Traducido al Español', {
      x: marginLeft + 10, y: coverY - 2,
      size: 12, font: fontBold, color: rgb(1, 1, 1),
    });
    coverY -= 60;

    // Línea separadora
    coverPage.drawLine({
      start: { x: marginLeft, y: coverY },
      end: { x: pageWidth - marginLeft, y: coverY },
      thickness: 1.5,
      color: colorAccent,
    });
    coverY -= 30;

    // Subtítulo "Título original"
    coverPage.drawText(`Título original: ${originalTitle}`, {
      x: marginLeft, y: coverY,
      size: subtitleFontSize, font: fontItalic, color: colorMeta,
    });
    coverY -= 20;

    const langNames: Record<string, string> = { en: 'Inglés', ro: 'Rumano', fr: 'Francés', de: 'Alemán', pt: 'Portugués', it: 'Italiano' };
    coverPage.drawText(`Idioma original: ${langNames[sourceLang] || sourceLang.toUpperCase()}`, {
      x: marginLeft, y: coverY,
      size: subtitleFontSize, font: fontItalic, color: colorMeta,
    });
    coverY -= 40;

    // Sello JarBees AI
    coverPage.drawText('Traducción generada automáticamente por JarBees AI', {
      x: marginLeft, y: coverY,
      size: 10, font: font, color: colorMeta,
    });
    coverY -= 16;
    coverPage.drawText(`Modelo: ${process.env.OLLAMA_TRADUCTOR_MODEL || 'qwen3:4b'} | ${new Date().toLocaleDateString('es-AR')}`, {
      x: marginLeft, y: coverY,
      size: 9, font: font, color: colorMeta,
    });

    // Nota al pie de la portada
    coverPage.drawText(
      'Esta es una traducción automática para uso personal en la Biblioteca JarBees.',
      { x: marginLeft, y: 60, size: 8, font: fontItalic, color: colorMeta },
    );

    // ── PÁGINAS DE CONTENIDO ───────────────────────────────────────────────────
    const paragraphs = fullText.split(/\n+/).filter((p) => p.trim().length > 0);
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPos = pageHeight - marginTop;
    let pageNumber = 1;

    // Helper para agregar footer
    const addFooter = (page: ReturnType<typeof pdfDoc.addPage>, pageNum: number) => {
      page.drawLine({
        start: { x: marginLeft, y: marginBottom - 5 },
        end: { x: pageWidth - marginLeft, y: marginBottom - 5 },
        thickness: 0.5,
        color: colorMeta,
      });
      page.drawText(title, {
        x: marginLeft, y: marginBottom - 18,
        size: footerFontSize, font: fontItalic, color: colorMeta,
      });
      const pageStr = String(pageNum);
      const pageTextWidth = font.widthOfTextAtSize(pageStr, footerFontSize);
      page.drawText(pageStr, {
        x: pageWidth - marginRight - pageTextWidth,
        y: marginBottom - 18,
        size: footerFontSize, font: font, color: colorMeta,
      });
    };

    for (const para of paragraphs) {
      // Detectar si es un posible encabezado de capítulo
      const isChapter = /^(cap[íi]tulo|chapter|parte|part|secci[oó]n|section|[IVXLC]+\.?\s)/i.test(para.trim()) && para.length < 80;

      const paraFont = isChapter ? fontBold : font;
      const paraSize = isChapter ? bodyFontSize + 2 : bodyFontSize;
      const paraColor = isChapter ? colorPrimary : colorBody;
      const paraSpaceBefore = isChapter ? lineHeight * 1.8 : lineHeight * 0.3;

      const lines = this.wrapText(para, paraFont, paraSize, contentWidth);

      // Calcular espacio necesario
      const neededHeight = lines.length * (lineHeight + 1) + paraSpaceBefore + lineHeight;

      // Si no cabe en la página actual, agregar footer y crear nueva
      if (yPos - neededHeight < marginBottom + 20) {
        addFooter(currentPage, pageNumber);
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - marginTop;
        pageNumber++;
      }

      yPos -= paraSpaceBefore;

      // Si es capítulo, agregar línea decorativa
      if (isChapter) {
        currentPage.drawLine({
          start: { x: marginLeft, y: yPos + 4 },
          end: { x: marginLeft + 40, y: yPos + 4 },
          thickness: 2, color: colorAccent,
        });
        yPos -= 8;
      }

      for (const line of lines) {
        if (yPos - lineHeight < marginBottom + 20) {
          addFooter(currentPage, pageNumber);
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          yPos = pageHeight - marginTop;
          pageNumber++;
        }

        currentPage.drawText(line, {
          x: marginLeft,
          y: yPos,
          size: paraSize,
          font: paraFont,
          color: paraColor,
        });
        yPos -= lineHeight + 1;
      }

      yPos -= lineHeight * 0.5; // espacio entre párrafos
    }

    // Footer en la última página
    addFooter(currentPage, pageNumber);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // UTILIDADES
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Detecta el idioma del texto usando frecuencia de palabras funcionales.
   */
  detectLanguage(text: string): string {
    if (!text) return 'unknown';
    const sample = text.slice(0, 3000).toLowerCase();
    const scores: Record<string, number> = {};

    for (const [lang, words] of Object.entries(this.LANG_PATTERNS)) {
      scores[lang] = words.filter((w) => sample.includes(w)).length;
    }

    // Palabras en español
    const esWords = [' que ', ' de ', ' la ', ' el ', ' los ', ' las ', ' una ', ' con ', ' no ', ' se ', ' en ', ' por ', ' del ', ' al '];
    scores['es'] = esWords.filter((w) => sample.includes(w)).length;

    const bestLang = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return bestLang[1] >= 3 ? bestLang[0] : 'unknown';
  }

  /**
   * Divide el texto en chunks respetando párrafos para la traducción.
   */
  private splitTextIntoTranslationChunks(text: string, maxChars = 1500): string[] {
    const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if ((current + '\n\n' + para).length > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  /**
   * Envuelve texto en líneas que caben dentro de `maxWidth` usando la fuente dada.
   */
  private wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Limpia el texto de caracteres problemáticos para PostgreSQL, pdf-lib (WinAnsi) y el modelo LLM.
   */
  private sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\x00/g, '') // null bytes
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
      .replace(/\uFFFD/g, '') // replacement chars
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[^\u0000-\u00FF]/g, '') // eliminar caracteres fuera de WinAnsi (como glifos CJK)
      .replace(/\s+/g, ' ') // normalizar espacios
      .trim();
  }
}
