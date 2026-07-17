import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentIngestService } from '../src/jarvis/library/document-ingest.service';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  console.log('--- TEST LAZY EMBEDDINGS START ---');
  const app = await NestFactory.createApplicationContext(AppModule);

  const ingestService = app.get(DocumentIngestService);
  const documentRepo = app.get(DocumentRepository);
  const prisma = app.get(PrismaService);

  // Limpiar posibles ejecuciones anteriores de test
  const existingTestDoc = await prisma.document.findFirst({
    where: { title: 'Test de Ingesta Jerárquica de Astronomía' },
  });
  if (existingTestDoc) {
    console.log(`Borrando documento de test anterior (ID ${existingTestDoc.id})...`);
    await documentRepo.deleteDocument(existingTestDoc.id);
  }

  // 1. Ingerir texto de prueba (debe entrar en CUARENTENA)
  const testTitle = 'Test de Ingesta Jerárquica de Astronomía';
  const testContent = `
# Capítulo 1: Introducción al Cosmos
El universo es un vasto espacio que contiene miles de millones de galaxias. La Vía Láctea es solo una de ellas.
El sol es nuestra estrella más cercana y la fuente de luz y energía para la Tierra.

## Sección 1.1: El Sistema Solar
El sistema solar se compone del Sol y todos los cuerpos celestes que orbitan a su alrededor, incluyendo los ocho planetas principales.
Los planetas terrestres como Mercurio, Venus, la Tierra y Marte son rocosos.

# Capítulo 2: Las Estrellas y Nebulosas
Las estrellas son hornos de fusión nuclear que brillan intensamente en la oscuridad del espacio sideral.
Nacen en nubes de gas llamadas nebulosas.

## Sección 2.1: Ciclo de Vida Estelar
Una estrella nace, vive brillando por fusiones de hidrógeno, y finalmente muere dejando una enana blanca, una estrella de neutrones o un agujero negro.

## Sección 2.2: Glosario y Bibliografía Redundante
Esta sección contiene referencias y bibliografía esotérica que debe ser omitida por el filtro de ruido del parser jerárquico.
  `;

  console.log('Ingestando texto de prueba...');
  const result = await ingestService.ingestText(testTitle, testContent, 'astronomia', 'manual_test');
  console.log('Resultado de ingesta inicial (Fase 1/Registro Express):', result);

  const doc = await prisma.document.findUnique({
    where: { id: result.documentId },
  });
  console.log(`Documento creado en DB. Status = ${doc?.status} (Esperado: quarantined)`);

  // 2. Aprobar documento para iniciar indexación jerárquica
  console.log('Aprobando documento en cuarentena...');
  await ingestService.approveDocument(result.documentId);

  // Esperar a que el status sea 'ready' (máximo 120 segundos)
  console.log('Esperando a que la indexación y los resúmenes en background finalicen (cambio a ready)...');
  let retries = 40;
  let updatedDoc = await prisma.document.findUnique({
    where: { id: result.documentId },
    include: {
      chapters: {
        include: {
          sections: {
            include: {
              chunks: true,
            },
          },
        },
      },
    },
  });

  while (updatedDoc && updatedDoc.status !== 'ready' && retries > 0) {
    console.log(`Status actual: ${updatedDoc.status} | Progreso Embed: ${updatedDoc.progressEmbed}% | Progreso Summary: ${updatedDoc.progressSummary}% | Esperando...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    updatedDoc = await prisma.document.findUnique({
      where: { id: result.documentId },
      include: {
        chapters: {
          include: {
            sections: {
              include: {
                chunks: true,
              },
            },
          },
        },
      },
    });
    retries--;
  }

  console.log('--- ESTADO DE ESTRUCTURA FINAL ---');
  console.log(`Status = ${updatedDoc?.status}`);
  console.log(`Progreso Index = ${updatedDoc?.progressIndex}%`);
  console.log(`Progreso Embed = ${updatedDoc?.progressEmbed}%`);
  console.log(`Progreso Summary = ${updatedDoc?.progressSummary}%`);
  console.log(`Meta Resumen = ${updatedDoc?.summary ? 'Generado' : 'No generado'}`);
  if (updatedDoc?.summary) {
    console.log(`Meta Resumen contenido: "${updatedDoc.summary}"`);
  }
  console.log(`Cantidad de Capítulos = ${updatedDoc?.chapters.length}`);

  if (updatedDoc) {
    for (const ch of updatedDoc.chapters) {
      console.log(`  - Capítulo: "${ch.title}" (Orden ${ch.order})`);
      console.log(`    Resumen capítulo: ${ch.summary}...`);
      for (const sec of ch.sections) {
        console.log(`    * Sección: "${sec.title}" - Chunks asociados: ${sec.chunks.length}`);
      }
    }
  }

  // 4. Test de búsqueda híbrida semántica y calentamiento en caliente
  console.log('--- PROBANDO BÚSQUEDA HÍBRIDA / LAZY EMBEDDINGS ---');
  const query = '¿Qué son las estrellas de neutrones y el ciclo de vida estelar?';
  const queryEmbedding = Array(1024).fill(0.01); // vector de prueba dummy

  console.log(`Buscando: "${query}"`);
  // Ahora el documento debería estar ready y ser devuelto en la búsqueda híbrida!
  const foundChunks = await documentRepo.searchChunksSemantic(queryEmbedding, 3);
  console.log(`Cantidad de chunks devueltos: ${foundChunks.length}`);
  
  for (const chunk of foundChunks) {
    console.log(`  Documento: ${chunk.document.title}`);
    console.log(`  Contenido: ${chunk.content}`);
  }

  // Cerrar app
  await app.close();
  console.log('--- TEST LAZY EMBEDDINGS END ---');
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Fallo fatal en test:', err);
  process.exit(1);
});
