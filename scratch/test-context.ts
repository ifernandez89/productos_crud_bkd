import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('Context initialized.');

  const prisma = app.get(PrismaService);
  const dbDocs = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      progressIndex: true,
      progressEmbed: true,
      progressSummary: true,
    },
  });

  console.log(`Found ${dbDocs.length} documents in the database:`);
  console.log(JSON.stringify(dbDocs, null, 2));

  await app.close();
}

main().catch(err => {
  console.error('Error running test script:', err);
  process.exit(1);
});
