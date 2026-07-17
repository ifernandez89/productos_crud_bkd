import { Injectable, Logger } from '@nestjs/common';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentRepository } from '../repositories/document.repository';
import { PrismaService } from '../../prisma/prisma.service';

export interface DocumentEnrichment {
  summary: string;
  concepts: string[]; // 15-20 conceptos clave
  entities: {
    people: string[]; // personas mencionadas
    theories: string[]; // teorías / frameworks
    technologies: string[]; // tecnologías / herramientas
  };
  quotes: string[]; // citas destacadas (máx 5)
  tags: string[]; // tags para búsqueda
}

/**
 * DocumentEnrichmentService — transforma un PDF en conocimiento estructurado.
 *
 * Dado el texto completo de un documento, extrae:
 * - Resumen global (2-3 párrafos)
 * - 15-20 conceptos clave
 * - Entidades (personas, teorías, tecnologías)
 * - Citas destacadas
 * - Tags para búsqueda
 *
 * El enriquecimiento se guarda como:
 * 1. Chunks especiales (type: enrichment) en la tabla Chunk → disponibles para RAG
 * 2. TopicSnapshot por cada concepto clave → disponible en Knowledge Evolution
 *
 * Se ejecuta en background — no bloquea la respuesta al usuario.
 */
@Injectable()
export class DocumentEnrichmentService {
  private readonly logger = new Logger(DocumentEnrichmentService.name);

  // Procesar el texto en secciones de 4000 chars para no saturar el modelo
  private readonly SECTION_SIZE = 4000;
  // Máximo de secciones a procesar (evita tiempos excesivos en libros muy largos)
  private readonly MAX_SECTIONS = 8;

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaProvider,
  ) {}

  /**
   * Punto de entrada principal. Se llama en background desde ingestPdf.
   * Guarda el enriquecimiento en BD y retorna el resultado.
   */
  async enrich(
    documentId: number,
    title: string,
    fullText: string,
  ): Promise<DocumentEnrichment | null> {
    this.logger.log(
      `[enrichment] iniciando para "${title}" (${fullText.length} chars)`,
    );

    try {
      const enrichment = await this.extractEnrichment(title, fullText);
      if (!enrichment) return null;

      await this.saveEnrichment(documentId, title, enrichment);

      this.logger.log(
        `[enrichment] OK "${title}" — ${enrichment.concepts.length} conceptos, ` +
          `${enrichment.quotes.length} citas, tags: [${enrichment.tags.join(', ')}]`,
      );
      return enrichment;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[enrichment] falló para "${title}": ${msg}`);
      return null;
    }
  }

  // ── Extracción ──────────────────────────────────────────────────────────────

  private async extractEnrichment(
    title: string,
    fullText: string,
  ): Promise<DocumentEnrichment | null> {
    // Para textos largos, hacer una primera pasada por secciones y luego consolidar
    const sections = this.splitSections(fullText);
    this.logger.log(`[enrichment] procesando ${sections.length} secciones`);

    // Recolectar conceptos y entidades de cada sección
    const sectionResults: Array<{
      concepts: string[];
      entities: any;
      quotes: string[];
    }> = [];

    for (const [i, section] of sections.entries()) {
      this.logger.log(`[enrichment] sección ${i + 1}/${sections.length}`);
      const partial = await this.extractFromSection(section, title);
      if (partial) sectionResults.push(partial);
    }

    if (sectionResults.length === 0) return null;

    // Consolidar todo en una pasada final con el LLM
    return this.consolidate(title, fullText, sectionResults);
  }

  private async extractFromSection(
    text: string,
    title: string,
  ): Promise<{ concepts: string[]; entities: any; quotes: string[] } | null> {
    const prompt = `Analizá este fragmento del documento "${title}".
Devolvé SOLO JSON válido, sin markdown.

{
  "concepts": ["concepto1", "concepto2"],
  "entities": {
    "people": ["persona1"],
    "theories": ["teoría1"],
    "technologies": ["tech1"]
  },
  "quotes": ["cita textual destacada si existe"]
}

Fragmento:
${text.slice(0, 3500)}`;

    try {
      const response = await this.ollama.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 400,
      });

      const clean = response.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json|```/gi, '')
        .trim();

      // Extraer el primer bloque JSON válido
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return null;

      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  private async consolidate(
    title: string,
    fullText: string,
    sections: Array<{ concepts: string[]; entities: any; quotes: string[] }>,
  ): Promise<DocumentEnrichment | null> {
    // Agrupar todo lo recolectado
    const allConcepts = [...new Set(sections.flatMap((s) => s.concepts ?? []))];
    const allPeople = [
      ...new Set(sections.flatMap((s) => s.entities?.people ?? [])),
    ];
    const allTheories = [
      ...new Set(sections.flatMap((s) => s.entities?.theories ?? [])),
    ];
    const allTechs = [
      ...new Set(sections.flatMap((s) => s.entities?.technologies ?? [])),
    ];
    const allQuotes = [
      ...new Set(sections.flatMap((s) => s.quotes ?? [])),
    ].slice(0, 5);

    // Generar resumen con el texto completo (primeros 5000 chars para el resumen)
    const summaryText = fullText.slice(0, 5000);
    const summaryPrompt = `Generá un resumen completo y estructurado del documento "${title}".
El resumen debe tener 2-3 párrafos y capturar las ideas principales.
Respondé en español argentino. Solo el resumen, sin introducción.

Texto:
${summaryText}`;

    let summary = '';
    try {
      const res = await this.ollama.generate({
        messages: [{ role: 'user', content: summaryPrompt }],
        maxTokens: 600,
      });
      summary = res.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } catch {
      summary = `Documento "${title}" — ${allConcepts.slice(0, 5).join(', ')}.`;
    }

    // Generar tags desde conceptos + entidades
    const tags = [
      ...allConcepts.slice(0, 8),
      ...allTechs.slice(0, 4),
      ...allTheories.slice(0, 4),
    ]
      .map((t) => t.toLowerCase().replace(/\s+/g, '-'))
      .filter((t, i, arr) => t.length > 2 && arr.indexOf(t) === i)
      .slice(0, 15);

    return {
      summary,
      concepts: allConcepts.slice(0, 20),
      entities: {
        people: allPeople.slice(0, 15),
        theories: allTheories.slice(0, 10),
        technologies: allTechs.slice(0, 15),
      },
      quotes: allQuotes,
      tags,
    };
  }

  // ── Persistencia ────────────────────────────────────────────────────────────

  private async saveEnrichment(
    documentId: number,
    title: string,
    enrichment: DocumentEnrichment,
  ): Promise<void> {
    // 1. Guardar resumen como chunk especial (type: summary) — disponible en RAG
    await this.documentRepo.createChunk({
      documentId,
      content: `RESUMEN DE "${title}":\n${enrichment.summary}`,
      metadata: { type: 'summary', generated: true },
    });

    // 2. Guardar conceptos clave como chunk (type: concepts) — aparece en búsquedas
    if (enrichment.concepts.length > 0) {
      await this.documentRepo.createChunk({
        documentId,
        content: `CONCEPTOS CLAVE DE "${title}":\n${enrichment.concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        metadata: { type: 'concepts', generated: true },
      });
    }

    // 3. Guardar entidades como chunk (type: entities)
    const entityLines: string[] = [];
    if (enrichment.entities.people.length > 0)
      entityLines.push(`Personas: ${enrichment.entities.people.join(', ')}`);
    if (enrichment.entities.theories.length > 0)
      entityLines.push(
        `Teorías/Frameworks: ${enrichment.entities.theories.join(', ')}`,
      );
    if (enrichment.entities.technologies.length > 0)
      entityLines.push(
        `Tecnologías: ${enrichment.entities.technologies.join(', ')}`,
      );

    if (entityLines.length > 0) {
      await this.documentRepo.createChunk({
        documentId,
        content: `ENTIDADES EN "${title}":\n${entityLines.join('\n')}`,
        metadata: { type: 'entities', generated: true },
      });
    }

    // 4. Guardar citas como chunk (type: quotes)
    if (enrichment.quotes.length > 0) {
      await this.documentRepo.createChunk({
        documentId,
        content: `CITAS DE "${title}":\n${enrichment.quotes.map((q, i) => `${i + 1}. "${q}"`).join('\n')}`,
        metadata: { type: 'quotes', generated: true },
      });
    }

    // 5. Guardar en TopicSnapshot para Knowledge Evolution
    //    Un snapshot por documento con el resumen y tags
    await this.prisma.topicSnapshot.create({
      data: {
        topic: title,
        conclusion: enrichment.summary.slice(0, 500),
        tags: JSON.stringify(enrichment.tags),
        sessionId: null,
      },
    });

    // 6. Snapshots individuales para los conceptos más importantes (top 5)
    for (const concept of enrichment.concepts.slice(0, 5)) {
      await this.prisma.topicSnapshot.create({
        data: {
          topic: concept,
          conclusion: `Mencionado en "${title}". ${enrichment.summary.slice(0, 200)}`,
          tags: JSON.stringify([
            ...enrichment.tags.slice(0, 3),
            'pdf',
            'libro',
          ]),
          sessionId: null,
        },
      });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private splitSections(text: string): string[] {
    const sections: string[] = [];
    let start = 0;
    while (start < text.length && sections.length < this.MAX_SECTIONS) {
      sections.push(text.slice(start, start + this.SECTION_SIZE));
      start += this.SECTION_SIZE;
    }
    return sections;
  }
}
