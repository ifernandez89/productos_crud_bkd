import { Injectable, Logger } from '@nestjs/common';

export interface ParsedChunk {
  content: string;
  metadata: Record<string, any>;
}

export interface ParsedSection {
  title: string;
  chunks: ParsedChunk[];
}

export interface ParsedChapter {
  title: string;
  order: number;
  sections: ParsedSection[];
}

@Injectable()
export class HierarchicalParserService {
  private readonly logger = new Logger(HierarchicalParserService.name);

  // Blacklist para excluir secciones irrelevantes (reducción de volumen en ingesta)
  private readonly NOISE_SECTION_PATTERNS = [
    /bibliografia/i,
    /referencias/i,
    /agradecimientos/i,
    /glosario/i,
    /indice analitico/i,
    /indice de terminos/i,
    /notas editoriales/i,
    /prologo/i,
    /colofon/i,
  ];

  private readonly CHUNK_SIZE = 1200;
  private readonly CHUNK_OVERLAP = 150;

  /**
   * Parsea un texto completo en capítulos, secciones y chunks.
   */
  parseDocument(title: string, content: string): ParsedChapter[] {
    this.logger.log(
      `Iniciando parseo jerárquico para: "${title}" (${content.length} caracteres)`,
    );

    // 1. Detectar si el texto tiene formato markdown
    const lines = content.split('\n');
    const hasMarkdownHeaders = lines.some(
      (line) => line.startsWith('# ') || line.startsWith('## '),
    );

    let chapters: ParsedChapter[] = [];

    if (hasMarkdownHeaders) {
      chapters = this.parseMarkdown(lines);
    } else {
      chapters = this.parseTextByRegex(lines);
    }

    // 2. Si no se detectó ninguna estructura jerárquica clara, agrupar todo en un capítulo genérico
    if (chapters.length === 0) {
      this.logger.log(
        `Sin estructura jerárquica clara detectada. Creando capítulo y sección única por defecto.`,
      );
      const genericChapter: ParsedChapter = {
        title: 'Introducción y Contenido General',
        order: 1,
        sections: [
          {
            title: 'Contenido Completo',
            chunks: this.splitIntoChunks(content),
          },
        ],
      };
      chapters.push(genericChapter);
    }

    // 3. Filtrar secciones de ruido (Zero-Trust/Eficiencia de ingesta)
    const originalCount = chapters.reduce(
      (acc, c) => acc + c.sections.length,
      0,
    );
    chapters = this.filterNoise(chapters);
    const filteredCount = chapters.reduce(
      (acc, c) => acc + c.sections.length,
      0,
    );

    if (originalCount !== filteredCount) {
      this.logger.log(
        `Filtro de ruido aplicado: se redujeron las secciones de ${originalCount} a ${filteredCount}`,
      );
    }

    return chapters;
  }

  /**
   * Parser basado en títulos Markdown (# Capítulo, ## Sección)
   */
  private parseMarkdown(lines: string[]): ParsedChapter[] {
    const chapters: ParsedChapter[] = [];
    let currentChapter: ParsedChapter | null = null;
    let currentSection: ParsedSection | null = null;
    let currentTextBuffer: string[] = [];

    const flushText = () => {
      const text = currentTextBuffer.join('\n').trim();
      if (text && currentSection) {
        currentSection.chunks.push(...this.splitIntoChunks(text));
      }
      currentTextBuffer = [];
    };

    let chapterOrder = 1;

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // Nuevo capítulo
        flushText();
        const chapterTitle = line.substring(2).trim();
        currentChapter = {
          title: chapterTitle,
          order: chapterOrder++,
          sections: [],
        };
        chapters.push(currentChapter);

        // Crear sección por defecto para el capítulo
        currentSection = {
          title: 'Inicio del Capítulo',
          chunks: [],
        };
        currentChapter.sections.push(currentSection);
      } else if (line.startsWith('## ')) {
        // Nueva sección
        flushText();
        const sectionTitle = line.substring(3).trim();
        if (!currentChapter) {
          currentChapter = {
            title: 'Introducción / Preliminares',
            order: chapterOrder++,
            sections: [],
          };
          chapters.push(currentChapter);
        }
        currentSection = {
          title: sectionTitle,
          chunks: [],
        };
        currentChapter.sections.push(currentSection);
      } else {
        currentTextBuffer.push(line);
      }
    }

    flushText();
    return chapters;
  }

  /**
   * Parser basado en expresiones regulares para libros tradicionales
   */
  private parseTextByRegex(lines: string[]): ParsedChapter[] {
    const chapters: ParsedChapter[] = [];
    let currentChapter: ParsedChapter | null = null;
    let currentSection: ParsedSection | null = null;
    let currentTextBuffer: string[] = [];

    const chapterRegex =
      /^(?:capitulo|chapter|parte|seccion|capítulo)\s+([ivxldcm\d]+)/i;
    const sectionRegex =
      /^(?:seccion|subseccion|section|subchapter|subcapitulo)\s+([ivxldcm\d]+)/i;

    const flushText = () => {
      const text = currentTextBuffer.join('\n').trim();
      if (text && currentSection) {
        currentSection.chunks.push(...this.splitIntoChunks(text));
      }
      currentTextBuffer = [];
    };

    let chapterOrder = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      const isChapterMatch = chapterRegex.test(trimmed);
      const isSectionMatch = sectionRegex.test(trimmed);

      if (isChapterMatch && trimmed.length < 100) {
        flushText();
        currentChapter = {
          title: trimmed,
          order: chapterOrder++,
          sections: [],
        };
        chapters.push(currentChapter);

        currentSection = {
          title: 'Introducción de Capítulo',
          chunks: [],
        };
        currentChapter.sections.push(currentSection);
      } else if (isSectionMatch && trimmed.length < 100) {
        flushText();
        if (!currentChapter) {
          currentChapter = {
            title: 'Preliminares',
            order: chapterOrder++,
            sections: [],
          };
          chapters.push(currentChapter);
        }
        currentSection = {
          title: trimmed,
          chunks: [],
        };
        currentChapter.sections.push(currentSection);
      } else {
        currentTextBuffer.push(line);
      }
    }

    flushText();
    return chapters;
  }

  /**
   * Filtra secciones de ruido (bibliografía, índices, etc.)
   */
  private filterNoise(chapters: ParsedChapter[]): ParsedChapter[] {
    return chapters
      .map((chapter) => {
        const filteredSections = chapter.sections.filter((section) => {
          const isNoise = this.NOISE_SECTION_PATTERNS.some((pattern) =>
            pattern.test(section.title),
          );
          return !isNoise;
        });
        return {
          ...chapter,
          sections: filteredSections,
        };
      })
      .filter((chapter) => chapter.sections.length > 0);
  }

  /**
   * Divide un bloque de texto en chunks con solapamiento
   */
  private splitIntoChunks(text: string): ParsedChunk[] {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 30);

    const chunks: ParsedChunk[] = [];
    let chunkIndex = 0;

    for (const para of paragraphs) {
      if (para.length <= this.CHUNK_SIZE) {
        chunks.push({
          content: para,
          metadata: { chunkIndex: chunkIndex++ },
        });
      } else {
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + this.CHUNK_SIZE, para.length);
          chunks.push({
            content: para.slice(start, end).trim(),
            metadata: { chunkIndex: chunkIndex++ },
          });
          start += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
        }
      }
    }

    return chunks.filter((c) => c.content.length > 20);
  }
}
