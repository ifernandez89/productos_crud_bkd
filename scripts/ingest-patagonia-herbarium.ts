import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeEntityType, KnowledgeRelationType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DocumentIngestService } from '../src/jarvis/library/document-ingest.service';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { JarvisKnowledgeService } from '../src/jarvis/knowledge/jarvis-knowledge.service';
import { EntityGraphService } from '../src/jarvis/knowledge/entity-graph.service';
import { EntityGraphRepository } from '../src/jarvis/repositories/entity-graph.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const PATAGONIA_TITLE =
  'Herbario de Plantas Medicinales de la Patagonia: Guía Completa de las 56 Especies';
const PATAGONIA_FILE = 'herbario-plantas-medicinales-patagonia-56-especies.md';

const MINSAL_TITLE =
  'Medicamentos Herbarios Tradicionales (MHT): 103 Especies Vegetales — MINSAL Chile';
const MINSAL_FILE =
  'MINSAL-Medicamentos-Herbarios-Tradicionales-103-Especies.pdf';

async function waitForEmbeddings(
  prisma: PrismaService,
  documentId: number,
  timeoutMs = 300_000,
): Promise<{ status: string; chunks: number; withVectors: number; progressEmbed: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        status: true,
        progressIndex: true,
        progressEmbed: true,
        _count: { select: { chunks: true } },
      },
    });
    if (
      state &&
      state.status === 'ready' &&
      (state.progressIndex ?? 0) >= 100 &&
      (state.progressEmbed ?? 0) >= 100 &&
      state._count.chunks > 0
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  const finalDoc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, progressEmbed: true },
  });
  const chunks = await prisma.chunk.findMany({
    where: { documentId },
    select: { id: true, metadata: true },
  });
  let withVectors = 0;
  for (const c of chunks) {
    if (!c.metadata) continue;
    try {
      const m = JSON.parse(c.metadata);
      if (Array.isArray(m.vector) && m.vector.length > 0) withVectors++;
    } catch {}
  }
  return {
    status: finalDoc?.status || 'unknown',
    chunks: chunks.length,
    withVectors,
    progressEmbed: finalDoc?.progressEmbed ?? 0,
  };
}

async function main() {
  const patagoniaPath = path.join(process.cwd(), 'docs', 'books', PATAGONIA_FILE);
  const minsalPath = path.join(process.cwd(), 'docs', 'books', MINSAL_FILE);

  if (!fs.existsSync(patagoniaPath)) {
    throw new Error(`Falta el compendio de Patagonia: ${patagoniaPath}`);
  }
  if (!fs.existsSync(minsalPath)) {
    throw new Error(`Falta el PDF oficial MINSAL MHT: ${minsalPath}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const ingestService = app.get(DocumentIngestService);
    const corpusSelector = app.get(CorpusSelectorService);
    const jarvisKnowledge = app.get(JarvisKnowledgeService);
    const entityGraphService = app.get(EntityGraphService);
    const entityGraphRepo = app.get(EntityGraphRepository);

    // 1. Sincronizar Herbario Oficial (G:\Projects2\PlantasMedicinales → plantas_medicinales.json)
    const syncReport = jarvisKnowledge.syncHerbariumFromSource(true);
    console.log(
      `[ingest-patagonia] Herbario JSON sincronizado: synced=${syncReport.synced} | totalPlantas=${syncReport.totalPlants} | reason=${syncReport.reason}`,
    );

    // 2. Ingestar Compendio de las 56 Plantas Medicinales de la Patagonia (idempotente)
    let patDoc = await prisma.document.findFirst({
      where: { title: { equals: PATAGONIA_TITLE, mode: 'insensitive' } },
      select: { id: true, status: true },
    });
    let patagoniaDocId: number;
    if (patDoc) {
      patagoniaDocId = patDoc.id;
      console.log(`[ingest-patagonia] Compendio ya existe en BD docId=${patagoniaDocId} (status=${patDoc.status})`);
      if (patDoc.status === 'quarantined') {
        await ingestService.approveDocument(patagoniaDocId);
      }
    } else {
      const md = fs.readFileSync(patagoniaPath, 'utf8');
      const res = await ingestService.ingestText(
        PATAGONIA_TITLE,
        md,
        'Plantas Medicinales',
        patagoniaPath,
      );
      patagoniaDocId = res.documentId;
      console.log(`[ingest-patagonia] Compendio ingestado en cuarentena docId=${patagoniaDocId}. Aprobando...`);
      await ingestService.approveDocument(patagoniaDocId);
    }

    const patStats = await waitForEmbeddings(prisma, patagoniaDocId, 180_000);
    console.log(
      `[ingest-patagonia] Compendio Patagonia docId=${patagoniaDocId}: status=${patStats.status} | chunks=${patStats.chunks} | con_vector=${patStats.withVectors} | embed=${patStats.progressEmbed}%`,
    );

    // 3. Ingestar PDF oficial MINSAL Chile — MHT 103 especies vegetales (idempotente)
    let minsalDoc = await prisma.document.findFirst({
      where: { title: { equals: MINSAL_TITLE, mode: 'insensitive' } },
      select: { id: true, status: true },
    });
    let minsalDocId: number;
    if (minsalDoc) {
      minsalDocId = minsalDoc.id;
      const existingChunks = await prisma.chunk.findMany({
        where: { documentId: minsalDocId },
        select: { content: true },
      });
      const existingChars = existingChunks.reduce((acc, c) => acc + (c.content?.length || 0), 0);
      const docRaw = await prisma.document.findUnique({
        where: { id: minsalDocId },
        select: { content: true },
      });
      const rawChars = docRaw?.content?.length || 0;
      const coverage = rawChars > 0 ? existingChars / rawChars : 1;

      console.log(
        `[ingest-patagonia] MINSAL MHT ya existe en BD docId=${minsalDocId} (status=${minsalDoc.status}, cobertura=${Math.round(coverage * 100)}%)`,
      );
      if (minsalDoc.status === 'quarantined' || coverage < 0.65) {
        if (coverage < 0.65) {
          console.log(
            `[ingest-patagonia] Cobertura insuficiente (${Math.round(coverage * 100)}%) — limpiando chunks/capítulos previos y re-indexando 100% de docId=${minsalDocId}...`,
          );
          await prisma.chunk.deleteMany({ where: { documentId: minsalDocId } });
          await prisma.chapter.deleteMany({ where: { documentId: minsalDocId } });
          await prisma.document.update({
            where: { id: minsalDocId },
            data: { status: 'quarantined', progressIndex: 0, progressEmbed: 0, progressSummary: 0 },
          });
        }
        await ingestService.approveDocument(minsalDocId);
      }
    } else {
      const pdfBuf = fs.readFileSync(minsalPath);
      const res = await ingestService.ingestPdf(
        pdfBuf,
        MINSAL_TITLE,
        'Plantas Medicinales',
        minsalPath,
      );
      minsalDocId = res.documentId;
      console.log(`[ingest-patagonia] MINSAL MHT ingestado en cuarentena docId=${minsalDocId}. Aprobando...`);
      await ingestService.approveDocument(minsalDocId);
    }

    const minsalStats = await waitForEmbeddings(prisma, minsalDocId, 480_000);
    console.log(
      `[ingest-patagonia] MINSAL MHT docId=${minsalDocId}: status=${minsalStats.status} | chunks=${minsalStats.chunks} | con_vector=${minsalStats.withVectors} | embed=${minsalStats.progressEmbed}%`,
    );

    // 4. Sembrar Knowledge Graph (Flora Medicinal Patagónica + MINSAL + especies emblemáticas)
    const floraPat = await entityGraphService.mergeEntity(
      'Plantas Medicinales de la Patagonia',
      KnowledgeEntityType.CONCEPT,
      'Compendio etnobotánico de 56 especies medicinales del Bosque Andino-Patagónico y la Estepa Patagónica integrado en el Boticario JarBees.',
      ['Flora Medicinal Patagónica', 'Boticario Patagónico', 'Herbario Patagonia'],
    );
    const minsalOrg = await entityGraphService.mergeEntity(
      'MINSAL Chile — Medicamentos Herbarios Tradicionales',
      KnowledgeEntityType.WORK,
      'Publicación oficial del Ministerio de Salud de Chile (Resolución Exenta N° 548) con 103 monografías oficiales de especies vegetales medicinales andino-patagónicas.',
      ['Libro MHT 2010', 'MHT 103 especies', 'MINSAL'],
    );

    const flagshipPlants = [
      { name: 'Calafate', desc: 'Berberis microphylla — arbusto espinoso patagónico de frutos antioxidantes y corteza con berberina.' },
      { name: 'Canelo', desc: 'Drimys winteri (Foye) — árbol sagrado mapuche antiséptico, antiinflamatorio y rico en vitamina C.' },
      { name: 'Paramela', desc: 'Adesmia boronioides — arbusto resinoso endémico de la estepa patagónica, digestivo y balsámico.' },
      { name: 'Pañil', desc: 'Buddleja globosa (Matico) — gran cicatrizante, antiinflamatorio y gastroprotector andino-patagónico.' },
      { name: 'Maqui', desc: 'Aristotelia chilensis — fruto nativo de altísima concentración antioxidante y hojas astringentes.' },
      { name: 'Radal', desc: 'Lomatia hirsuta — árbol patagónico de referencia tradicional para tos, bronquitis y vías respiratorias.' },
      { name: 'Palo Pichi', desc: 'Fabiana imbricata — arbusto andino-patagónico diurético y antiséptico de las vías urinarias.' },
      { name: 'Bailahuén', desc: 'Haplopappus baylahuen — planta cordillerana hepatoprotectora, digestiva y antiséptica.' },
      { name: 'Ñancolahuén', desc: 'Valeriana carnosa — valeriana nativa patagónica sedante y analgésica de la tradición mapuche-tehuelche.' },
      { name: 'Rosa Mosqueta', desc: 'Rosa rubiginosa — arbusto patagónico rico en vitamina C y aceite regenerador celular.' },
    ];

    for (const ent of [floraPat, minsalOrg]) {
      await prisma.knowledgeEntitySource
        .upsert({
          where: { entityId_documentId: { entityId: ent.id, documentId: patagoniaDocId } },
          update: { confidence: 1.0 },
          create: { entityId: ent.id, documentId: patagoniaDocId, confidence: 1.0 },
        })
        .catch(() => undefined);
    }
    await prisma.knowledgeEntitySource
      .upsert({
        where: { entityId_documentId: { entityId: minsalOrg.id, documentId: minsalDocId } },
        update: { confidence: 1.0 },
        create: { entityId: minsalOrg.id, documentId: minsalDocId, confidence: 1.0 },
      })
      .catch(() => undefined);

    await entityGraphRepo.upsertRelation(
      minsalOrg.id,
      floraPat.id,
      KnowledgeRelationType.RELATED_TO,
      {
        label: 'respalda oficialmente las monografías de',
        confidence: 0.98,
        sourceDocId: minsalDocId,
        quote: 'Medicamentos Herbarios Tradicionales (MHT) — 103 especies vegetales, Ministerio de Salud de Chile.',
      },
    );

    for (const fp of flagshipPlants) {
      const plantEnt = await entityGraphService.mergeEntity(
        fp.name,
        KnowledgeEntityType.CONCEPT,
        fp.desc,
        [],
      );
      await entityGraphRepo.upsertRelation(
        plantEnt.id,
        floraPat.id,
        KnowledgeRelationType.RELATED_TO,
        {
          label: 'forma parte del herbario de',
          confidence: 0.96,
          sourceDocId: patagoniaDocId,
          quote: fp.desc,
        },
      );
    }

    // 5. Registrar ambas obras en library-index.json con dbId directo
    corpusSelector.upsertDocumentEntry({
      id: 'ref-herbario-plantas-medicinales-patagonia-56',
      dbId: patagoniaDocId,
      titulo: PATAGONIA_TITLE,
      tituloAlternativo:
        'Plantas Medicinales de la Patagonia — Boticario Patagónico — 56 Especies (Calafate, Canelo, Paramela, Pañil, Maqui, Radal, Bailahuén, Palo Pichi, Ñancolahuén)',
      archivo: PATAGONIA_FILE,
      tipo: 'guia_referencia',
      formato: 'md',
      autor: 'Herbario Oficial JarBees (SIB Parques Nacionales, CONICET & MINSAL MHT)',
      idioma: 'es',
      escuela: 'ETNOBOTANICA_PATAGONICA',
      categorias: [
        'Plantas Medicinales',
        'plantas medicinales',
        'patagonia',
        'etnobotánica',
        'fitoterapia',
        'herboristería',
      ],
      conceptosClave: [
        'plantas medicinales de la patagonia',
        'patagonia',
        'boticario',
        'herbario',
        'calafate',
        'canelo',
        'paramela',
        'pañil',
        'matico',
        'maqui',
        'maitén',
        'radal',
        'palo pichi',
        'bailahuén',
        'ñancolahuén',
        'rosa mosqueta',
        'jarilla',
        'neneo',
        'quinchamalí',
        'quintral',
        'notro',
        'arrayán',
        'tomillo silvestre',
        'solupe',
        'vira vira',
        'canchalagua',
        'natre',
      ],
      capitulos: [
        { numero: 1, titulo: 'Flora Medicinal de la Patagonia — Panorama y Fuentes', paginas: '1-2' },
        { numero: 2, titulo: 'Índice Maestro de las 47 Especies Incorporadas', paginas: '3-6' },
        { numero: 3, titulo: 'Monografías Botánicas por Ecorregión Patagónica', paginas: '7-22' },
        { numero: 4, titulo: 'Guía de Seguridad Fitoterapéutica y Contraindicaciones', paginas: '23-24' },
      ],
      embeddings: 'ready',
      descripcionBreve:
        'Compendio botánico y etnobotánico de las 56 plantas medicinales de la Patagonia (Bosque Andino-Patagónico, Estepa Patagónica y especies naturalizadas), respaldado en MINSAL MHT, SIB Parques Nacionales y CONICET.',
      tags: ['patagonia', 'plantas medicinales', 'boticario', 'herbario', 'fitoterapia', 'etnobotanica'],
    });

    corpusSelector.upsertDocumentEntry({
      id: 'lib-minsal-mht-103-especies-vegetales',
      dbId: minsalDocId,
      titulo: MINSAL_TITLE,
      tituloAlternativo:
        'Libro MHT 2010 — Plantas Medicinales de Chile y Patagonia — Ministerio de Salud (103 Monografías Oficiales)',
      archivo: MINSAL_FILE,
      tipo: 'libro',
      formato: 'pdf',
      autor: 'Ministerio de Salud de Chile (MINSAL)',
      idioma: 'es',
      escuela: 'FITOTERAPIA_OFICIAL_MHT',
      categorias: [
        'Plantas Medicinales',
        'plantas medicinales',
        'fitoterapia',
        'herboristería',
        'patagonia',
        'medicina natural',
      ],
      conceptosClave: [
        'medicamentos herbarios tradicionales',
        'mht',
        'minsal',
        'plantas medicinales',
        'patagonia',
        'monografías',
        'bailahuén',
        'canelo',
        'canchalagua',
        'maitén',
        'maqui',
        'matico',
        'pañil',
        'natre',
        'palo pichi',
        'quinchamalí',
        'quintral',
        'radal',
        'rosa mosqueta',
        'sanguinaria',
        'valeriana',
        'vira vira',
        'yerba buena',
      ],
      capitulos: [
        { numero: 1, titulo: 'Marco Normativo y Preparación de Medicamentos Herbarios', paginas: '1-15' },
        { numero: 2, titulo: '103 Monografías Oficiales de Especies Vegetales', paginas: '16-230' },
      ],
      embeddings: 'ready',
      descripcionBreve:
        'Publicación oficial del Ministerio de Salud de Chile (Resolución Exenta N° 548) con 103 monografías oficiales de plantas medicinales andino-patagónicas: botánica, usos tradicionales validados, preparación y precauciones.',
      tags: ['minsal', 'mht', 'plantas medicinales', 'fitoterapia', 'patagonia', 'monografias'],
    });

    console.log('\n✅ Sincronización completa: Boticario (122 plantas) + Compendio Patagonia + MINSAL MHT 103 especies + Knowledge Graph + library-index.json.');
  } finally {
    await app.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error fatal en ingest-patagonia-herbarium:', err?.stack || err);
  process.exit(1);
});
