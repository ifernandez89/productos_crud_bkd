import { ReaderService } from '../src/modules/reader/reader.service';
import { TtsService } from '../src/modules/reader/tts.service';

async function testFullReader() {
  console.log('--- Test End-to-End de ReaderService ---');
  const ttsService = new TtsService();
  const mockPrisma: any = {
    document: {
      findMany: async () => [],
      findUnique: async () => null,
    },
  };
  const readerService = new ReaderService(mockPrisma, ttsService);

  // 1. Listar documentos
  const docs = await readerService.listDocuments();
  console.log(`Documentos encontrados en la biblioteca: ${docs.length}`);
  console.log('Primer documento:', docs[0]);

  // 2. Obtener documento y chunks
  const docDetails = await readerService.getDocument(docs[0].id);
  console.log('\nDetalles del documento:');
  console.log(`- Título: ${docDetails.title}`);
  console.log(`- Autor: ${docDetails.author}`);
  console.log(`- Bloques de texto (chunks): ${docDetails.cantidadChunks}`);
  console.log(`- Texto del primer bloque: "${docDetails.blocks[0]?.substring(0, 100)}..."`);

  // 3. Obtener audio para el bloque 0 (con Ollama sematre/orpheus:it_es-3b)
  console.log('\nSolicitando audio para el bloque 0...');
  const audioBuffer = await readerService.getChunkAudio(docs[0].id, 0);
  console.log(`- Tamaño del audio retornado: ${audioBuffer.length} bytes`);
  console.log(`- Formato de encabezado: ${audioBuffer.toString('utf8', 0, 4)}`);

  // 4. Probar caché (segunda llamada inmediata)
  console.log('\nProbando recuperación desde caché...');
  const cachedAudio = await readerService.getChunkAudio(docs[0].id, 0);
  console.log(`- Audio recuperado de caché: ${cachedAudio.length} bytes`);
  console.log('--- Test End-to-End completado con Éxito ---');
}

testFullReader().catch((err) => console.error(err));
