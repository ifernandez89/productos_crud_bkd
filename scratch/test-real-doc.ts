import { PrismaClient } from '@prisma/client';
import { ReaderService } from '../src/modules/reader/reader.service';
import { TtsService } from '../src/modules/reader/tts.service';

async function testRealDoc() {
  const prisma = new PrismaClient();
  const ttsService = new TtsService();
  const readerService = new ReaderService(prisma as any, ttsService);

  console.log('--- Probando obtención de libro real desde Base de Datos ---');
  
  // 1. Listar todos los documentos de la BD
  const list = await readerService.listDocuments();
  console.log(`\nDocumentos retornados por listDocuments (${list.length} total):`);
  const dbDocsList = list.filter(d => typeof d.id === 'number');
  console.log('Documentos reales de la BD:');
  for (const doc of dbDocsList) {
    console.log(`  - [ID ${doc.id}] "${doc.titulo}" (${doc.cantidadChunks} chunks)`);
  }

  // 2. Obtener detalle de ID 2 (LA HISTORIA DEL TIEMPO)
  console.log('\n--- Probando getDocument(2) ---');
  const doc2 = await readerService.getDocument(2);
  console.log(`- Título: "${doc2.title}"`);
  console.log(`- Autor: "${doc2.author}"`);
  console.log(`- Páginas: ${doc2.paginas}`);
  console.log(`- Cantidad total de bloques (chunks): ${doc2.cantidadChunks}`);
  console.log(`- Primeros 3 bloques:`);
  doc2.blocks.slice(0, 3).forEach((block, idx) => {
    console.log(`  [Bloque ${idx + 1}] (${block.length} caracteres): "${block.substring(0, 120)}..."`);
  });

  // 3. Probando getDocument(15) (Multi-Dimensional Man)
  console.log('\n--- Probando getDocument(15) ---');
  const doc15 = await readerService.getDocument(15);
  console.log(`- Título: "${doc15.title}"`);
  console.log(`- Cantidad total de bloques: ${doc15.cantidadChunks}`);

  await prisma.$disconnect();
}

testRealDoc().catch(err => console.error(err));
