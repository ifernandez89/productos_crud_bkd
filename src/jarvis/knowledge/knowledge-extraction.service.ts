import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeEntityType, KnowledgeRelationType } from '@prisma/client';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentRepository } from '../repositories/document.repository';
import {
  EntityGraphRepository,
  PendingRelationData,
} from '../repositories/entity-graph.repository';
import { EntityGraphService } from './entity-graph.service';
import { EvidenceService } from './evidence.service';

// ── Tipos de extracción ───────────────────────────────────────────────────────

interface RawEntity {
  name: string;
  type: string;
  description?: string;
  aliases?: string[];
}

interface RawRelation {
  source: string;
  target: string;
  type: string;
  label?: string;
  confidence: number;
  quote: string; // cita literal del texto que respalda la relación
}

interface RawExtraction {
  entities: RawEntity[];
  relations: RawRelation[];
}

export interface ExtractionResult {
  documentId: number;
  entitiesCreated: number;
  relationsApproved: number;
  relationsPending: number;
  relationsRejected: number;
}

// Mapeo de strings a enums (el LLM devuelve strings)
const ENTITY_TYPE_MAP: Record<string, KnowledgeEntityType> = {
  PERSON: KnowledgeEntityType.PERSON,
  CONCEPT: KnowledgeEntityType.CONCEPT,
  WORK: KnowledgeEntityType.WORK,
  PROJECT: KnowledgeEntityType.PROJECT,
  TECHNOLOGY: KnowledgeEntityType.TECHNOLOGY,
  PLACE: KnowledgeEntityType.PLACE,
  EVENT: KnowledgeEntityType.EVENT,
};

const RELATION_TYPE_MAP: Record<string, KnowledgeRelationType> = {
  DEVELOPED: KnowledgeRelationType.DEVELOPED,
  INFLUENCED: KnowledgeRelationType.INFLUENCED,
  CREATED: KnowledgeRelationType.CREATED,
  USES: KnowledgeRelationType.USES,
  RELATED_TO: KnowledgeRelationType.RELATED_TO,
  PART_OF: KnowledgeRelationType.PART_OF,
  BELONGS_TO: KnowledgeRelationType.BELONGS_TO,
  OPPOSITE_OF: KnowledgeRelationType.OPPOSITE_OF,
};

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class KnowledgeExtractionService {
  private readonly logger = new Logger(KnowledgeExtractionService.name);

  constructor(
    private readonly ollama: OllamaProvider,
    private readonly documentRepo: DocumentRepository,
    private readonly graphRepo: EntityGraphRepository,
    private readonly graphService: EntityGraphService,
    private readonly evidenceService: EvidenceService,
  ) {}

  /**
   * Entry point: extrae entidades y relaciones de un documento indexado.
   * Se llama en background al finalizar la indexación (status → "ready").
   * No bloquea ninguna respuesta al usuario.
   */
  async extractFromDocument(documentId: number): Promise<ExtractionResult> {
    this.logger.log(`Iniciando extracción de Knowledge Graph para doc #${documentId}`);

    const result: ExtractionResult = {
      documentId,
      entitiesCreated: 0,
      relationsApproved: 0,
      relationsPending: 0,
      relationsRejected: 0,
    };

    try {
      // Obtener chunks del documento (los primeros 5 para no saturar el LLM)
      const doc = await this.documentRepo.getDocumentWithChunks(documentId);
      if (!doc || doc.status !== 'ready') {
        this.logger.warn(`Doc #${documentId} no está listo para extracción`);
        return result;
      }

      // Usar el summary/ficha de conocimiento si existe (más denso en info)
      const textToAnalyze = (doc as any).summary || doc.content.slice(0, 4000);

      // Extraer con Qwen3:4B (temperatura 0 = determinista)
      const extraction = await this.extractWithLLM(textToAnalyze, doc.title);
      if (!extraction) return result;

      // Persistir entidades validadas
      const entityMap = new Map<string, number>(); // name → id en BD

      for (const rawEntity of extraction.entities) {
        const type = ENTITY_TYPE_MAP[rawEntity.type.toUpperCase()];
        if (!type) continue;

        try {
          const entity = await this.graphService.mergeEntity(
            rawEntity.name,
            type,
            rawEntity.description,
            rawEntity.aliases,
          );
          entityMap.set(rawEntity.name.toLowerCase(), entity.id);
          result.entitiesCreated++;
        } catch (err: any) {
          this.logger.warn(`No se pudo crear entidad "${rawEntity.name}": ${err?.message ?? err}`);
        }
      }

      // Procesar relaciones: cuarentena → validación → aprobar/rechazar
      for (const rawRel of extraction.relations) {
        const sourceId = entityMap.get(rawRel.source.toLowerCase());
        const targetId = entityMap.get(rawRel.target.toLowerCase());
        const relationType = RELATION_TYPE_MAP[rawRel.type.toUpperCase()];

        // Guardar en PendingRelation siempre (con o sin entidades resueltas)
        const pendingData: PendingRelationData = {
          sourceName: rawRel.source,
          targetName: rawRel.target,
          relationType: rawRel.type,
          label: rawRel.label,
          confidence: rawRel.confidence,
          sourceDocId: documentId,
          quote: rawRel.quote,
        };

        const pending = await this.graphRepo.savePendingRelation(pendingData);
        result.relationsPending++;

        // Validar: necesitamos entidades resueltas + quote + tipo válido + conf ≥ 0.7
        if (!sourceId || !targetId || !relationType || rawRel.confidence < 0.7) {
          await this.graphRepo.rejectPending(
            pending.id,
            `Confianza insuficiente (${rawRel?.confidence ?? 0}) o entidades no resueltas`,
          );
          result.relationsRejected++;
          result.relationsPending--;
          continue;
        }

        // Verificar evidencia: la quote debe aparecer en los chunks del documento
        const hasEvidence = await this.verifyQuote(rawRel.quote, documentId);
        if (!hasEvidence) {
          await this.graphRepo.rejectPending(
            pending.id,
            'Quote no encontrada en los chunks del documento',
          );
          result.relationsRejected++;
          result.relationsPending--;
          continue;
        }

        // Aprobar → promover a KnowledgeRelation
        await this.graphRepo.approvePending(pending.id, sourceId, targetId, relationType);
        result.relationsApproved++;
        result.relationsPending--;
      }

      this.logger.log(
        `Doc #${documentId}: ${result.entitiesCreated} entidades, ` +
        `${result.relationsApproved} relaciones aprobadas, ` +
        `${result.relationsRejected} rechazadas`,
      );
    } catch (err: any) {
      this.logger.error(`Error en extracción de doc #${documentId}: ${err?.message ?? err}`);
    }

    return result;
  }

  /**
   * Llama a Qwen3:4B con temperatura 0 para extraer entidades y relaciones.
   * El prompt exige JSON estricto con citas literales por cada relación.
   */
  private async extractWithLLM(
    text: string,
    title: string,
  ): Promise<RawExtraction | null> {
    const prompt = `Analizá el siguiente texto y extraé entidades y relaciones.

TÍTULO: ${title}

TEXTO:
${text}

Retorná ÚNICAMENTE un JSON válido con este esquema exacto (sin texto adicional):
{
  "entities": [
    { "name": "string", "type": "PERSON|CONCEPT|WORK|PROJECT|TECHNOLOGY|PLACE|EVENT", "description": "string opcional", "aliases": ["string"] }
  ],
  "relations": [
    { "source": "nombre exacto de entidad", "target": "nombre exacto de entidad", "type": "DEVELOPED|INFLUENCED|CREATED|USES|RELATED_TO|PART_OF|BELONGS_TO|OPPOSITE_OF", "label": "descripción legible opcional", "confidence": 0.0_a_1.0, "quote": "cita literal del texto que respalda esta relación" }
  ]
}

REGLAS CRÍTICAS:
- Solo incluí relaciones respaldadas por citas LITERALES del texto.
- La "quote" debe ser un fragmento textual real que aparezca en el texto.
- NO inventes relaciones que no estén explícitas en el texto.
- confidence debe reflejar la claridad con que el texto expresa la relación.
- Ignorá relaciones genéricas o triviales.
- Máximo 10 entidades y 15 relaciones.`;

    try {
      const response = await this.ollama.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2000,
      });

      const raw = response.content?.trim() ?? '';
      return this.parseExtractionResponse(raw);
    } catch (err: any) {
      this.logger.warn(`LLM extraction falló: ${err?.message ?? err}`);
      return null;
    }
  }

  /**
   * Parsea la respuesta JSON del LLM con manejo robusto de errores.
   */
  private parseExtractionResponse(raw: string): RawExtraction | null {
    try {
      // Limpiar bloques markdown si el LLM los agrega
      const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '');

      // Extraer JSON del texto (por si el LLM agrega texto antes o después)
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as RawExtraction;

      if (!Array.isArray(parsed.entities) || !Array.isArray(parsed.relations)) {
        return null;
      }

      return parsed;
    } catch {
      this.logger.warn('No se pudo parsear la respuesta de extracción del LLM');
      return null;
    }
  }

  /**
   * Verifica que una quote aparezca (aproximadamente) en los chunks del documento.
   * Previene que el LLM invente citas inexistentes.
   */
  private async verifyQuote(quote: string, documentId: number): Promise<boolean> {
    if (!quote || quote.length < 10) return false;

    try {
      // Buscar la quote en los chunks del documento
      const chunkWithQuote = await (this.documentRepo as any)['prisma'].chunk.findFirst({
        where: {
          documentId,
          content: { contains: quote.slice(0, 50), mode: 'insensitive' },
        },
      });

      return !!chunkWithQuote;
    } catch {
      // Si no se puede verificar, aceptamos con duda (conservative)
      return false;
    }
  }
}
