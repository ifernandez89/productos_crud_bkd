import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentIngestService } from '../src/jarvis/library/document-ingest.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  console.log('🚀 Iniciando script de aprobación e indexación de Obras Completas...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const ingestService = app.get(DocumentIngestService);
  const prisma = app.get(PrismaService);

  const doc = await prisma.document.findFirst({
    where: {
      title: {
        contains: 'Obras Completas',
        mode: 'insensitive'
      }
    }
  });

  if (!doc) {
    console.log('❌ No se encontró el documento "Obras Completas" en la base de datos.');
    await app.close();
    return;
  }

  console.log(`Documento encontrado: ID=${doc.id}, Título="${doc.title}", Status="${doc.status}"`);

  if (doc.status === 'ready') {
    console.log('✅ El documento ya está en estado READY. Nada que hacer.');
    await app.close();
    return;
  }

  console.log('Aprobando e iniciando indexación jerárquica...');
  await ingestService.approveDocument(doc.id);
  console.log('✅ Aprobado con éxito. El procesamiento continuará en segundo plano.');

  // Monitorear un poco el progreso inicial
  let retries = 5;
  while (retries > 0) {
    const updated = await prisma.document.findUnique({
      where: { id: doc.id }
    });
    if (updated) {
      console.log(`Status actual: ${updated.status} | Index: ${updated.progressIndex}% | Embed: ${updated.progressEmbed}% | Summary: ${updated.progressSummary}%`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    retries--;
  }

  console.log('El script finalizó la observación inicial. Dejamos que termine en background...');
  await app.close();
}

bootstrap()
  .catch((e) => {
    console.error('❌ Error en bootstrap:', e);
  });
