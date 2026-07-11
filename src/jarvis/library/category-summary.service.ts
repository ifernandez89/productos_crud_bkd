import { Injectable, Logger } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { OllamaProvider } from '../llm/ollama.provider';

export interface CategorySummaryResult {
  category: string;
  documentsUsed: number;
  chunksUsed: number;
  summary: string;
  documentTitles: string[];
}

/**
 * Servicio especializado en generar resúmenes combinados de múltiples documentos
 * de una misma categoría.
 * 
 * Ejemplo de uso:
 * - Usuario: "resumen sobre plantas medicinales"
 * - Sistema: detecta categoría "plantas_medicinales" → recupera chunks → genera resumen unificado
 */
@Injectable()
export class CategorySummaryService {
  private readonly logger = new Logger(CategorySummaryService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly ollamaProvider: OllamaProvider,
  ) {}

  /**
   * Genera un resumen combinado de todos los documentos de una categoría.
   * Recupera los chunks más relevantes y los sintetiza en una respuesta coherente.
   */
  async generateCategorySummary(
    category: string,
    specificQuery?: string,
    maxChunks = 15,
  ): Promise<CategorySummaryResult> {
    this.logger.log(`[category-summary] generando resumen para categoría="${category}" | query="${specificQuery ?? 'general'}"`);

    // 1. Recuperar chunks relevantes
    const chunks = specificQuery
      ? await this.documentRepo.searchChunksByQueryAndCategory(specificQuery, category, maxChunks)
      : await this.documentRepo.searchChunksByCategory(category, maxChunks);

    if (chunks.length === 0) {
      // Intentar buscar categorías similares o listar las disponibles
      const stats = await this.documentRepo.getLibraryStats();
      const availableCategories = stats.byCategory
        .filter(c => c.category)
        .map(c => `${c.category} (${c._count.id} doc${c._count.id > 1 ? 's' : ''})`)
        .slice(0, 10);

      let message = `❌ No encontré documentos en la categoría "${category}".`;
      
      if (availableCategories.length > 0) {
        message += `\n\n📚 **Categorías disponibles:**\n${availableCategories.map(c => `  • ${c}`).join('\n')}`;
        message += `\n\n💡 Podés pedirme un resumen de cualquiera de estas categorías.`;
      } else {
        message += `\n\n📤 Aún no tenés documentos en tu biblioteca. Subí PDFs o textos para que pueda ayudarte.`;
      }
      
      return {
        category,
        documentsUsed: 0,
        chunksUsed: 0,
        summary: message,
        documentTitles: [],
      };
    }

    // 2. Extraer información de los documentos
    const uniqueDocs = new Map<number, string>();
    chunks.forEach(chunk => {
      uniqueDocs.set(chunk.document.id, chunk.document.title);
    });

    const documentTitles = Array.from(uniqueDocs.values());
    
    // 3. Combinar contenido de chunks (limitado para no saturar el contexto del LLM)
    const combinedContent = this.combineChunksIntelligently(chunks, 4000);

    // 4. Generar resumen con LLM
    const summary = await this.generateSummaryWithLLM(
      category,
      combinedContent,
      documentTitles,
      specificQuery,
    );

    this.logger.log(
      `[category-summary] OK — ${uniqueDocs.size} docs, ${chunks.length} chunks → resumen de ${summary.length} chars`,
    );

    return {
      category,
      documentsUsed: uniqueDocs.size,
      chunksUsed: chunks.length,
      summary,
      documentTitles,
    };
  }

  /**
   * Combina chunks de forma inteligente:
   * - Prioriza chunks de diferentes documentos para mayor diversidad
   * - Elimina duplicados y contenido muy similar
   * - Limita el tamaño total para no saturar el contexto del LLM
   */
  private combineChunksIntelligently(
    chunks: Array<{ content: string; document: { id: number; title: string } }>,
    maxChars: number,
  ): string {
    const docChunks = new Map<number, string[]>();
    
    // Agrupar chunks por documento
    chunks.forEach(chunk => {
      if (!docChunks.has(chunk.document.id)) {
        docChunks.set(chunk.document.id, []);
      }
      docChunks.get(chunk.document.id)!.push(chunk.content);
    });

    // Tomar chunks balanceados de cada documento
    const combined: string[] = [];
    let totalChars = 0;
    
    for (const [docId, docChunkList] of docChunks) {
      const docTitle = chunks.find(c => c.document.id === docId)?.document.title ?? 'Sin título';
      
      // Agregar título del documento como separador
      const header = `\n[📄 ${docTitle}]\n`;
      combined.push(header);
      totalChars += header.length;
      
      // Agregar chunks de este documento
      for (const chunkContent of docChunkList) {
        if (totalChars + chunkContent.length > maxChars) break;
        
        combined.push(chunkContent);
        totalChars += chunkContent.length + 2; // +2 por saltos de línea
        
        if (totalChars >= maxChars) break;
      }
      
      if (totalChars >= maxChars) break;
    }

    return combined.join('\n\n');
  }

  /**
   * Genera el resumen usando el LLM, con instrucciones específicas para
   * sintetizar información de múltiples documentos.
   */
  private async generateSummaryWithLLM(
    category: string,
    content: string,
    documentTitles: string[],
    specificQuery?: string,
  ): Promise<string> {
    const systemPrompt = `Sos un asistente experto en sintetizar información de múltiples documentos.

Tu tarea es generar un resumen completo y bien estructurado combinando la información de varios documentos sobre "${category}".

INSTRUCCIONES:
1. Sintetizá la información de forma coherente y organizada
2. Identificá los conceptos y temas principales
3. Si hay información contradictoria, mencionala
4. Usá viñetas o numeración para mejorar la legibilidad
5. Mencioná los documentos fuente cuando sea relevante
6. Respondé siempre en español argentino, claro y preciso

${specificQuery ? `PREGUNTA ESPECÍFICA DEL USUARIO: ${specificQuery}\nEnfocá tu respuesta en esta pregunta.` : 'Generá un resumen general de toda la información disponible.'}`;

    const userPrompt = `Documentos disponibles: ${documentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Contenido combinado:
${content}

---
Generá un resumen completo basándote en esta información.`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        maxTokens: 1000,
      });

      return response.content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[category-summary:llm] error: ${msg}`);
      
      // Fallback: devolver contenido crudo con formato básico
      return this.generateFallbackSummary(category, documentTitles, content);
    }
  }

  /**
   * Genera un resumen básico cuando el LLM no está disponible.
   */
  private generateFallbackSummary(
    category: string,
    documentTitles: string[],
    content: string,
  ): string {
    return `📚 Resumen sobre "${category}" (${documentTitles.length} documento${documentTitles.length > 1 ? 's' : ''})

**Documentos consultados:**
${documentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

**Contenido extraído:**
${content.slice(0, 2000)}${content.length > 2000 ? '\n\n[... contenido truncado ...]' : ''}

⚠️ El modelo de IA no estaba disponible. Este es el contenido crudo extraído de tus documentos.`;
  }
}
