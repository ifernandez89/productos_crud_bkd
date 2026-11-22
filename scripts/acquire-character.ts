import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CharacterAcquisitionService } from '../src/jarvis/library/character-acquisition.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const args = process.argv.slice(2);
  const forceRefresh = args.includes('--refresh') || args.includes('--force');
  const noBooks = args.includes('--no-books');
  const name = args.filter((a) => !a.startsWith('--')).join(' ').trim();

  if (!name) {
    console.error(
      'Uso: npx ts-node scripts/acquire-character.ts "<Nombre del personaje>" [--refresh] [--no-books]',
    );
    process.exit(1);
  }

  console.log(`\n🏛️  Iniciando adquisición autónoma para: "${name}"...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const acquisition = app.get(CharacterAcquisitionService);
    const prisma = app.get(PrismaService);

    const result = await acquisition.acquireCharacter(name, {
      autoApprove: true,
      forceRefresh,
      downloadPublicDomainBooks: !noBooks,
      maxPublicDomainBooks: 1,
    });

    const chunkCount = await prisma.chunk.count({
      where: { documentId: result.documentId },
    });
    const chapterCount = await prisma.chapter.count({
      where: { documentId: result.documentId },
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(acquisition.formatChatReport(result));
    console.log('═══════════════════════════════════════════════════════════');
    console.log(
      `[Verificación PostgreSQL] docId=${result.documentId} | status=${result.status} | chapters=${chapterCount} | chunks=${chunkCount}`,
    );
  } finally {
    await app.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error fatal en acquire-character:', err?.message || err);
  process.exit(1);
});
