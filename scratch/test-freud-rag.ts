import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';
import { EmbeddingsService } from '../src/jarvis/library/embeddings.service';

async function bootstrap() {
  console.log('🚀 Iniciando prueba de RAG sobre Freud...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const documentRepo = app.get(DocumentRepository);
  const embeddingsService = app.get(EmbeddingsService);

  const query = 'sueños';
  console.log(`1. Generando embedding para la query: "${query}"...`);
  const embedding = await embeddingsService.generateEmbedding(query);
  console.log('Embedding generado con éxito.');

  console.log('2. Buscando chunks semánticos en Obras Completas (ID=52) con límite = 15...');
  const startTime = Date.now();
  const chunks = await documentRepo.searchChunksSemanticInDocuments(embedding, [52], 15);
  const duration = Date.now() - startTime;

  console.log(`\n📊 Búsqueda finalizada en ${duration}ms. Se recuperaron ${chunks.length} chunks.`);

  chunks.forEach((c: any, idx) => {
    console.log(`\n[${idx + 1}] ID=${c.id} | Capítulo: "${c.section?.chapter?.title || 'Sin cap'}" | Sección: "${c.section?.title || 'Sin sec'}"`);
    console.log(`    Contenido (truncado): ${c.content.slice(0, 200)}...`);
  });

  await app.close();
}

bootstrap().catch((e) => console.error(e));
