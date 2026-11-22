import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeEntityType, KnowledgeRelationType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DocumentIngestService } from '../src/jarvis/library/document-ingest.service';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { EntityGraphService } from '../src/jarvis/knowledge/entity-graph.service';
import { EntityGraphRepository } from '../src/jarvis/repositories/entity-graph.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const DOC_TITLE =
  'Tarot Rider–Waite–Smith: Guía Completa de los 56 Arcanos Menores y 22 Arcanos Mayores';
const FILE_REL_PATH = 'characters/tarot-rider-waite-smith-78-arcanos.md';

async function main() {
  const absPath = path.join(process.cwd(), 'docs', 'books', FILE_REL_PATH);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Archivo fuente no encontrado: ${absPath}`);
  }
  const markdown = fs.readFileSync(absPath, 'utf8');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const ingestService = app.get(DocumentIngestService);
    const corpusSelector = app.get(CorpusSelectorService);
    const entityGraphService = app.get(EntityGraphService);
    const entityGraphRepo = app.get(EntityGraphRepository);

    // 1. Verificar existencia exacta por título (idempotente)
    let existing = await prisma.document.findFirst({
      where: { title: { equals: DOC_TITLE, mode: 'insensitive' } },
      select: { id: true, status: true, progressIndex: true, progressEmbed: true },
    });

    let documentId: number;
    if (existing) {
      documentId = existing.id;
      console.log(
        `[ingest-rws] Documento ya existente id=${documentId} (status=${existing.status}, embed=${existing.progressEmbed}%)`,
      );
      if (existing.status === 'quarantined') {
        await ingestService.approveDocument(documentId);
      }
    } else {
      const ingested = await ingestService.ingestText(
        DOC_TITLE,
        markdown,
        'Tarot y Simbolismo',
        absPath,
      );
      documentId = ingested.documentId;
      console.log(`[ingest-rws] Ingestado en cuarentena docId=${documentId}. Aprobando...`);
      await ingestService.approveDocument(documentId);
    }

    // 2. Esperar indexación estructural + embeddings bge-m3 al 100%
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const state = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          status: true,
          progressIndex: true,
          progressEmbed: true,
          _count: { select: { chunks: true, chapters: true } },
        },
      });
      if (
        state &&
        state.status === 'ready' &&
        (state.progressIndex ?? 0) >= 100 &&
        (state.progressEmbed ?? 0) >= 100 &&
        state._count.chunks > 0
      ) {
        console.log(
          `[ingest-rws] READY docId=${documentId} | chapters=${state._count.chapters} | chunks=${state._count.chunks} | embed=${state.progressEmbed}%`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Verificar vectores reales en chunks
    const chunks = await prisma.chunk.findMany({
      where: { documentId },
      select: { id: true, content: true, metadata: true },
    });
    let withVectors = 0;
    for (const c of chunks) {
      if (!c.metadata) continue;
      try {
        const meta = JSON.parse(c.metadata);
        if (Array.isArray(meta.vector) && meta.vector.length > 0) withVectors++;
      } catch {}
    }
    console.log(
      `[ingest-rws] Verificación de chunks: total=${chunks.length}, con_vector=${withVectors}`,
    );

    // 3. Sembrar entidades y relaciones en el Knowledge Graph
    const pamela = await entityGraphService.mergeEntity(
      'Pamela Colman Smith',
      KnowledgeEntityType.PERSON,
      'Artista e ilustradora angloestadounidense (1878-1951), creadora de las 78 ilustraciones del Tarot Rider–Waite–Smith (1909), pionera en ilustrar narrativamente los 56 Arcanos Menores.',
      ['Pamela Coleman Smith', 'Pixie Smith', 'P. C. Smith'],
    );
    const waite = await entityGraphService.mergeEntity(
      'Arthur Edward Waite',
      KnowledgeEntityType.PERSON,
      'Erudito esotérico y autor de The Pictorial Key to the Tarot (1910), cocreador del Tarot Rider–Waite–Smith junto a Pamela Colman Smith.',
      ['A. E. Waite', 'Arthur Waite'],
    );
    const rwsDeck = await entityGraphService.mergeEntity(
      'Tarot Rider–Waite–Smith',
      KnowledgeEntityType.WORK,
      'Baraja de 78 cartas publicada en 1909 (22 Arcanos Mayores y 56 Arcanos Menores en cuatro palos: Bastos, Copas, Espadas y Oros/Pentáculos).',
      ['Rider-Waite Tarot', 'Tarot Rider-Waite', 'The Pictorial Key to the Tarot'],
    );
    const minorArcana = await entityGraphService.mergeEntity(
      'Arcanos Menores',
      KnowledgeEntityType.CONCEPT,
      'Los 56 naipes del Tarot repartidos en cuatro palos de 14 cartas (Bastos, Copas, Espadas, Oros/Pentáculos; As al Diez más Sota, Caballero, Reina y Rey).',
      ['Minor Arcana', '56 Arcanos Menores'],
    );
    const majorArcana = await entityGraphService.mergeEntity(
      'Arcanos Mayores',
      KnowledgeEntityType.CONCEPT,
      'Los 22 triunfos arquetípicos del Tarot, numerados del 0 (El Loco) al XXI (El Mundo).',
      ['Major Arcana', '22 Arcanos Mayores'],
    );

    for (const ent of [pamela, waite, rwsDeck, minorArcana, majorArcana]) {
      await prisma.knowledgeEntitySource
        .upsert({
          where: { entityId_documentId: { entityId: ent.id, documentId } },
          update: { confidence: 1.0 },
          create: { entityId: ent.id, documentId, confidence: 1.0 },
        })
        .catch(() => undefined);
    }

    await entityGraphRepo.upsertRelation(
      pamela.id,
      rwsDeck.id,
      KnowledgeRelationType.CREATED,
      {
        label: 'ilustró íntegramente las 78 cartas de',
        confidence: 0.99,
        sourceDocId: documentId,
        quote: 'Pamela Colman Smith ilustró las 78 cartas del mazo Rider–Waite–Smith (1909), incluyendo los 56 Arcanos Menores con escenas narrativas.',
      },
    );
    await entityGraphRepo.upsertRelation(
      waite.id,
      rwsDeck.id,
      KnowledgeRelationType.CREATED,
      {
        label: 'dirigió y escribió la clave pictórica de',
        confidence: 0.99,
        sourceDocId: documentId,
        quote: 'Arthur Edward Waite concibió el simbolismo del mazo y publicó The Pictorial Key to the Tarot en 1910.',
      },
    );
    await entityGraphRepo.upsertRelation(
      rwsDeck.id,
      minorArcana.id,
      KnowledgeRelationType.RELATED_TO,
      {
        label: 'revolucionó la iconografía narrativa de',
        confidence: 0.98,
        sourceDocId: documentId,
        quote: '56 Arcanos Menores distribuidos en 4 palos de 14 cartas: Bastos, Copas, Espadas y Oros/Pentáculos.',
      },
    );
    await entityGraphRepo.upsertRelation(
      rwsDeck.id,
      majorArcana.id,
      KnowledgeRelationType.RELATED_TO,
      {
        label: 'integra los 22 arquetipos de',
        confidence: 0.98,
        sourceDocId: documentId,
        quote: '22 Arcanos Mayores del 0 El Loco al XXI El Mundo (con VIII La Fuerza y XI La Justicia).',
      },
    );

    // 4. Registrar y enriquecer las 4 obras de Tarot en library-index.json
    corpusSelector.upsertDocumentEntry({
      id: 'ref-tarot-rider-waite-smith-78-arcanos',
      dbId: documentId,
      titulo: DOC_TITLE,
      tituloAlternativo:
        'The Pictorial Key to the Tarot — Pamela Coleman Smith — Arcanos Menores y Arcanos Mayores — Bastos Copas Espadas Oros Pentáculos',
      archivo: FILE_REL_PATH,
      tipo: 'guia_referencia',
      formato: 'md',
      autor: 'Pamela Colman Smith & Arthur Edward Waite',
      idioma: 'es',
      escuela: 'TAROT_RIDER_WAITE_SMITH',
      categorias: ['Tarot y Simbolismo', 'tarot', 'arcanos', 'simbolismo'],
      conceptosClave: [
        'tarot',
        'arcanos menores',
        'arcanos mayores',
        '56 arcanos menores',
        '22 arcanos mayores',
        'pamela colman smith',
        'pamela coleman smith',
        'arthur edward waite',
        'rider-waite-smith',
        'bastos',
        'copas',
        'espadas',
        'oros',
        'pentáculos',
        'significados del tarot',
      ],
      capitulos: [
        { numero: 1, titulo: 'El Tarot Rider–Waite–Smith (1909–1910)', paginas: '1-2' },
        { numero: 2, titulo: 'Tabla Maestra de los 56 Arcanos Menores (2-3 palabras)', paginas: '3-5' },
        { numero: 3, titulo: 'Estudio Iconográfico de los 56 Arcanos Menores', paginas: '6-12' },
        { numero: 4, titulo: 'Los 22 Arcanos Mayores y su Relación con los Menores', paginas: '13-15' },
      ],
      embeddings: 'ready',
      descripcionBreve:
        'Guía completa de las 78 cartas del Tarot Rider–Waite–Smith (56 Arcanos Menores en Bastos, Copas, Espadas y Oros/Pentáculos + 22 Arcanos Mayores), basada en la iconografía de Pamela Colman Smith (1909) y The Pictorial Key to the Tarot de A. E. Waite (1910).',
      tags: ['tarot', 'rider-waite-smith', 'pamela colman smith', 'arcanos menores', 'arcanos mayores'],
    });

    // Enriquecer La Vía del Tarot (docId #23)
    const jodoExisting = corpusSelector.getDocumentById(
      'lib-la-v-a-del-tarot-alejandro-jodorowsky-pd',
    );
    if (jodoExisting) {
      corpusSelector.upsertDocumentEntry({
        ...jodoExisting,
        dbId: 23,
        tituloAlternativo:
          'Tarot de Marsella — Arcanos Mayores y Arcanos Menores — Alejandro Jodorowsky',
        conceptosClave: Array.from(
          new Set([
            ...jodoExisting.conceptosClave,
            'tarot',
            'tarot de marsella',
            'arcanos mayores',
            'arcanos menores',
            'bastos',
            'copas',
            'espadas',
            'oros',
            'alejandro jodorowsky',
            'marianne costa',
          ]),
        ),
        embeddings: 'ready',
      });
    }

    // Registrar Tarot y Kábala - Samael Aun Weor (docId #252)
    corpusSelector.upsertDocumentEntry({
      id: 'lib-tarot-y-kabala-samael-aun-weor',
      dbId: 252,
      titulo: 'Tarot y Kábala - Samael Aun Weor -',
      tituloAlternativo:
        'Tarot y Cábala — Arcanos Mayores y Arcanos Menores — Samael Aun Weor',
      archivo: 'Tarot y Kábala - Samael Aun Weor -.pdf',
      tipo: 'libro',
      formato: 'pdf',
      autor: 'Samael Aun Weor',
      idioma: 'es',
      escuela: 'GNOSIS_CABALA',
      categorias: ['Gnosis y Cábala', 'tarot', 'cabala', 'arcanos', 'simbolismo'],
      conceptosClave: [
        'tarot',
        'kábala',
        'cabala',
        'arcanos mayores',
        'arcanos menores',
        'sefirot',
        'árbol de la vida',
        'numerología',
        'gnosis',
        'samael aun weor',
        'alquimia',
      ],
      capitulos: [
        { numero: 1, titulo: 'Descripción Esotérica de los 22 Arcanos Mayores', paginas: '1-120' },
        { numero: 2, titulo: 'Cábala, Sefirot y Arcanos Menores', paginas: '121-240' },
      ],
      embeddings: 'ready',
      descripcionBreve:
        'Tratado esotérico de Samael Aun Weor que correlaciona los Arcanos Mayores y Menores del Tarot con la Cábala, el Árbol de la Vida, los Sefirot y la numerología hermética.',
      tags: ['tarot', 'cabala', 'kabala', 'samael aun weor', 'arcanos mayores', 'arcanos menores'],
    });

    // Enriquecer dossier biográfico Pamela Colman Smith (docId #259)
    const pamelaDossier = corpusSelector.getDocumentById('char-pamela-colman-smith-tarot');
    if (pamelaDossier) {
      corpusSelector.upsertDocumentEntry({
        ...pamelaDossier,
        dbId: 259,
        tituloAlternativo:
          'Pamela Coleman Smith — Biografía, Obra e Historia del Tarot Rider-Waite-Smith',
        conceptosClave: Array.from(
          new Set([
            ...pamelaDossier.conceptosClave,
            'Pamela Coleman Smith',
            'Rider-Waite-Smith',
            'arcanos menores',
            'arcanos mayores',
          ]),
        ),
        embeddings: 'ready',
      });
    }

    console.log('[ingest-rws] ✅ Guía RWS 78 Arcanos, Knowledge Graph y library-index.json sincronizados.');
  } finally {
    await app.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error en ingest-tarot-rws:', err?.message || err);
  process.exit(1);
});
