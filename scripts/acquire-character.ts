import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CharacterAcquisitionService } from '../src/jarvis/library/character-acquisition.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const args = process.argv.slice(2);
  const forceRefresh = args.includes('--refresh') || args.includes('--force');
  const noBooks = args.includes('--no-books');

  let focusTopic: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--tema' || args[i] === '--focus') && args[i + 1]) {
      focusTopic = args[++i];
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i]);
    }
  }
  const name = positional.join(' ').trim();

  if (!name) {
    console.error(
      'Uso: npx ts-node scripts/acquire-character.ts "<Nombre del personaje>" [--tema "<enfoque>"] [--refresh] [--no-books]',
    );
    process.exit(1);
  }

  console.log(
    `\n🏛️  Iniciando adquisición autónoma para: "${name}"${focusTopic ? ` (enfoque: ${focusTopic})` : ''}...`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const acquisition = app.get(CharacterAcquisitionService);
    const prisma = app.get(PrismaService);

    const result = await acquisition.acquireCharacter(name, {
      autoApprove: true,
      forceRefresh,
      focusTopic,
      downloadPublicDomainBooks: !noBooks,
      maxPublicDomainBooks: 1,
    });

    const chunkCount = await prisma.chunk.count({
      where: { documentId: result.documentId },
    });
    const chapterCount = await prisma.chapter.count({
      where: { documentId: result.documentId },
    });

    // Esperar hasta 120s para que los embeddings bge-m3 en background completen antes de salir
    if (!result.alreadyExists && chunkCount > 0) {
      const embedDeadline = Date.now() + 120_000;
      while (Date.now() < embedDeadline) {
        const state = await prisma.document.findUnique({
          where: { id: result.documentId },
          select: { progressEmbed: true, progressSummary: true },
        });
        if (state && (state.progressEmbed ?? 0) >= 100) {
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const finalState = await prisma.document.findUnique({
      where: { id: result.documentId },
      select: { status: true, progressIndex: true, progressEmbed: true, progressSummary: true },
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(acquisition.formatChatReport(result));
    console.log('═══════════════════════════════════════════════════════════');
    console.log(
      `[Verificación PostgreSQL] docId=${result.documentId} | status=${finalState?.status || result.status} | chapters=${chapterCount} | chunks=${chunkCount} | embed=${finalState?.progressEmbed ?? 0}% | summary=${finalState?.progressSummary ?? 0}%`,
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
