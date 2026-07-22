import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JarvisService } from '../src/jarvis/jarvis.service';
import { DocumentSummaryService } from '../src/jarvis/library/document-summary.service';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn', 'debug'] });
  
  const docRepo = app.get(DocumentRepository);
  const docSummaryService = app.get(DocumentSummaryService);
  const jarvisService = app.get(JarvisService);

  console.log('--- TEST 1: Checking DB for document "Energetica Psiquica y Esencia Del Sueño" ---');
  const dbDoc = await docRepo.findDocumentByExactTitle("Energetica Psiquica y Esencia Del Sueño");
  console.log('Exact title search in DB:', dbDoc ? { id: dbDoc.id, title: dbDoc.title, hasSummary: !!dbDoc.summary, summaryLen: dbDoc.summary?.length } : 'NULL');

  const titleCandidates = await docRepo.searchDocumentsByTitle("Energetica Psiquica y Esencia Del Sueño", 5);
  console.log('Title candidates in DB:', titleCandidates.map(c => ({ id: c.id, title: c.title })));

  console.log('\n--- TEST 2: Calling DocumentSummaryService ---');
  try {
    const summaryResult = await docSummaryService.generateDocumentSummary("Energetica Psiquica y Esencia Del Sueño");
    console.log('Summary Result:', {
      documentId: summaryResult.documentId,
      title: summaryResult.title,
      category: summaryResult.category,
      wordCount: summaryResult.wordCount,
      chunkCount: summaryResult.chunkCount,
      summaryPreview: summaryResult.summary.slice(0, 200),
      keyPointsCount: summaryResult.keyPoints.length,
    });
  } catch (err: any) {
    console.error('DocumentSummaryService ERROR:', err.message, err.stack);
  }

  console.log('\n--- TEST 3: Full JarvisService query ---');
  try {
    const response = await jarvisService.query("Energetica Psiquica y Esencia Del Sueño", {
      sessionId: "test-session-123",
      useDocuments: true,
    });
    console.log('\n=== JARVIS RESPONSE ===');
    console.log(response);
  } catch (err: any) {
    console.error('JarvisService ERROR:', err.message, err.stack);
  }

  await app.close();
}

main().catch(console.error);
