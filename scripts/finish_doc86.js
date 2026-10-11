const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { DocumentRepository } = require('../dist/jarvis/repositories/document.repository');
const { EmbeddingsService } = require('../dist/jarvis/library/embeddings.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const docRepo = app.get(DocumentRepository);
  const embService = app.get(EmbeddingsService);

  const doc = await prisma.document.findUnique({ where: { id: 86 } });
  if (!doc) {
    console.error('Doc 86 not found');
    await app.close();
    return;
  }

  console.log('Doc 86 encontrado:', doc.title, '- Longitud:', doc.content.length);

  // Dividir en chunks
  const chunkSize = 1000;
  const overlap = 150;
  const text = doc.content;
  let start = 0;
  const rawChunks = [];
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const nextBreak = text.indexOf('\n\n', end);
      if (nextBreak !== -1 && nextBreak - end < 150) end = nextBreak;
    }
    const c = text.slice(start, end).trim();
    if (c.length > 50) rawChunks.push(c);
    start += chunkSize - overlap;
  }

  console.log(`Creando ${rawChunks.length} chunks y vectores bge-m3 para Doc 86...`);
  for (let i = 0; i < rawChunks.length; i++) {
    const content = rawChunks[i];
    const chunk = await docRepo.createChunk({
      documentId: 86,
      content,
      metadata: { chunkIndex: i, totalChunks: rawChunks.length, author: 'Nikola Tesla' },
    });
    const vector = await embService.generateEmbedding(content);
    await docRepo.saveChunkEmbedding(chunk.id, vector);
    console.log(`Chunk ${i + 1}/${rawChunks.length} vectorizado.`);
  }

  await docRepo.updateDocumentStatus(86, 'ready');
  console.log('✅ Doc 86 marcado como READY con todos sus vectores!');

  await app.close();
}

main().catch(console.error);
