import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const prisma = new PrismaClient();
const cacheFilePath = path.join(__dirname, 'doc_13_chunks_cache.json');

function sanitizeWinAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0000-\u00FF]/g, '') // remove non-WinAnsi characters
    .trim();
}

async function main() {
  const docId = 13;
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc || !doc.content) {
    console.error(`Documento ${docId} no encontrado o sin contenido.`);
    process.exit(1);
  }

  const originalTitle = doc.title;
  const finalTitle = 'Viajes fuera del cuerpo (Journeys Out of the Body)';
  console.log(`[Traducción] Iniciando traducción completa para: "${originalTitle}" (Doc ID: ${docId})`);

  const text = doc.content;
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > 2000 && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  console.log(`[Traducción] Total de chunks a traducir: ${chunks.length}`);
  const model = process.env.OLLAMA_TRADUCTOR_MODEL || 'RogerBen/hy-mt1.5-1.8b:latest';
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  console.log(`[Traducción] Modelo activo: ${model}`);

  // Cargar caché si existe
  let cache: Record<number, string> = {};
  if (fs.existsSync(cacheFilePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      console.log(`[Caché] Se cargaron ${Object.keys(cache).length} chunks guardados en disco.`);
    } catch {
      cache = {};
    }
  }

  const translatedChunks: string[] = new Array(chunks.length).fill('');
  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    if (cache[i] && cache[i].trim().length > 0) {
      translatedChunks[i] = cache[i];
      continue;
    }

    const chunkStart = Date.now();
    const prompt = `Translate the following excerpt into fluent Spanish:\n\n${chunks[i]}`;

    let translated = '';
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await axios.post(
          `${ollamaHost}/api/generate`,
          {
            model,
            system:
              'You are a professional translator. Translate the text accurately into clear Spanish. Preserve paragraph breaks and formatting. Output ONLY the Spanish translation without commentary or instructions.',
            prompt,
            stream: false,
            options: {
              temperature: 0.1,
              top_p: 0.9,
              num_predict: 4096,
            },
          },
          { timeout: 90000 },
        );

        let response = res.data?.response?.trim();
        if (response) {
          response = response
            .replace(/^(Translate the following excerpt|Traduce el siguiente fragmento)[^\n]*\n+/i, '')
            .replace(/^Traducción:\s*/i, '')
            .trim();
          translated = response;
          break;
        }
      } catch (err: any) {
        console.warn(`[Chunk ${i + 1}] Reintento ${attempt}/${maxRetries} falló: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        } else {
          translated = chunks[i]; // Fallback al original si falla tras reintentos
        }
      }
    }

    translatedChunks[i] = translated;
    cache[i] = translated;
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));

    const elapsed = ((Date.now() - chunkStart) / 1000).toFixed(1);
    const progress = Math.round(((i + 1) / chunks.length) * 100);

    if ((i + 1) % 5 === 0 || i + 1 === chunks.length) {
      const avg = ((Date.now() - startTime) / 1000 / (i + 1)).toFixed(1);
      const remainingSeconds = Math.round((chunks.length - (i + 1)) * parseFloat(avg));
      const remMin = Math.floor(remainingSeconds / 60);
      console.log(
        `[Traducción] Chunk ${i + 1}/${chunks.length} (${progress}%) - t=${elapsed}s | Promedio: ${avg}s/chunk | Est. restante: ${remMin}m`,
      );
    }
  }

  const fullTranslatedText = translatedChunks.join('\n\n');
  console.log(`[Traducción] ✅ Traducción completa finalizada.`);

  // 1. Generar PDF
  console.log('[PDF] Generando archivo PDF con pdf-lib (con sanitización WinAnsi)...');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 595;
  const pageHeight = 842;
  const marginTop = 70;
  const marginBottom = 60;
  const marginLeft = 72;
  const marginRight = 72;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = 14;

  const colorPrimary = rgb(0.08, 0.12, 0.28);
  const colorBody = rgb(0.1, 0.1, 0.1);
  const colorMeta = rgb(0.4, 0.4, 0.45);
  const colorAccent = rgb(0.15, 0.45, 0.72);

  // Portada
  const coverPage = pdfDoc.addPage([pageWidth, pageHeight]);
  coverPage.drawRectangle({ x: 0, y: pageHeight - 300, width: pageWidth, height: 300, color: colorPrimary });

  coverPage.drawText(sanitizeWinAnsi(finalTitle), { x: marginLeft, y: pageHeight - 110, size: 20, font: fontBold, color: rgb(1, 1, 1) });
  coverPage.drawRectangle({ x: marginLeft, y: pageHeight - 160, width: 200, height: 26, color: colorAccent });
  coverPage.drawText('Traducido al Español', { x: marginLeft + 10, y: pageHeight - 152, size: 12, font: fontBold, color: rgb(1, 1, 1) });

  coverPage.drawText(sanitizeWinAnsi(`Título original: ${originalTitle}`), { x: marginLeft, y: pageHeight - 210, size: 12, font: fontItalic, color: colorMeta });
  coverPage.drawText(sanitizeWinAnsi(`Modelo: ${model} | ${new Date().toLocaleDateString('es-AR')}`), { x: marginLeft, y: pageHeight - 230, size: 10, font: font, color: colorMeta });

  // Párrafos
  const outParagraphs = fullTranslatedText.split(/\n+/).filter((p) => p.trim().length > 0);
  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - marginTop;
  let pageNumber = 1;

  const wrapText = (txt: string, fnt: any, sz: number, maxW: number) => {
    const cleanText = sanitizeWinAnsi(txt);
    const words = cleanText.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (fnt.widthOfTextAtSize(test, sz) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const addFooter = (page: any, pNum: number) => {
    page.drawLine({ start: { x: marginLeft, y: marginBottom - 5 }, end: { x: pageWidth - marginLeft, y: marginBottom - 5 }, thickness: 0.5, color: colorMeta });
    page.drawText(sanitizeWinAnsi(finalTitle), { x: marginLeft, y: marginBottom - 18, size: 9, font: fontItalic, color: colorMeta });
    page.drawText(String(pNum), { x: pageWidth - marginRight - 20, y: marginBottom - 18, size: 9, font: font, color: colorMeta });
  };

  for (const p of outParagraphs) {
    const isChapter = /^(cap[íi]tulo|chapter|parte|part|secci[oó]n|[IVXLC]+\.?\s)/i.test(p.trim()) && p.length < 80;
    const pFont = isChapter ? fontBold : font;
    const pSize = isChapter ? 13 : 11;
    const pColor = isChapter ? colorPrimary : colorBody;
    const lines = wrapText(p, pFont, pSize, contentWidth);

    for (const line of lines) {
      if (yPos - lineHeight < marginBottom + 20) {
        addFooter(currentPage, pageNumber);
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - marginTop;
        pageNumber++;
      }
      currentPage.drawText(line, { x: marginLeft, y: yPos, size: pSize, font: pFont, color: pColor });
      yPos -= lineHeight + 1;
    }
    yPos -= lineHeight * 0.5;
  }
  addFooter(currentPage, pageNumber);

  const translatedDir = path.join(process.cwd(), 'storage', 'translated');
  if (!fs.existsSync(translatedDir)) fs.mkdirSync(translatedDir, { recursive: true });

  const pdfPath = path.join(translatedDir, 'Viajes_fuera_del_cuerpo_es.pdf');
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  console.log(`[PDF] PDF guardado exitosamente en: ${pdfPath}`);

  // 2. Ingestar en la Base de Datos
  console.log('[BD] Guardando nuevo documento en PostgreSQL...');
  const newDoc = await prisma.document.create({
    data: {
      title: finalTitle,
      content: fullTranslatedText,
      category: 'experiencias fuera del cuerpo',
      source: pdfPath,
      status: 'ready',
      language: 'es',
      translatedFromId: docId,
      progressIndex: 100.0,
      progressEmbed: 0.0,
      progressSummary: 0.0,
    },
  });

  // 3. Ocultar documento original
  await prisma.document.update({
    where: { id: docId },
    data: { hidden: true, category: 'traducido_al_espanol' },
  });

  console.log(`[BD] ✅ Documento traducido registrado con éxito en BD (ID: ${newDoc.id}). Documento original ${docId} ocultado.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error] Falló el proceso de traducción:', err);
  process.exit(1);
});
