import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { JarvisService } from '../src/jarvis/jarvis.service';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';

async function main() {
  console.log('🧪 Iniciando test de lazy loading...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const corpusSelector = app.get(CorpusSelectorService);
  const jarvisService = app.get(JarvisService);
  const documentRepo = app.get(DocumentRepository);

  // 1. Mostrar estado inicial de algún libro de Jung
  const docs = corpusSelector.getAllDocuments();
  const testDoc = docs.find(d => d.archivo.includes('Fundamentos Racionales de la Astrología.pdf') || d.archivo.includes('Tesla'));
  
  if (!testDoc) {
    console.error('❌ No se encontró ningún libro apto para la prueba rápida en el índice.');
    await app.close();
    return;
  }

  console.log(`\n📖 Documento seleccionado para prueba:`);
  console.log(`   Título: "${testDoc.titulo}"`);
  console.log(`   Archivo: "${testDoc.archivo}"`);
  console.log(`   Estado embeddings inicial: "${testDoc.embeddings}"`);

  // 2. Limpiar de la base de datos si ya existía para asegurar que el test sea real
  const existing = await documentRepo.searchDocumentsByTitle(testDoc.titulo, 1);
  if (existing.length > 0) {
    console.log(`🧹 Eliminando documento existente en la base de datos (ID ${existing[0].id}) para forzar la recreación...`);
    await documentRepo.deleteDocument(existing[0].id);
  }

  // Forzar estado "pending" para la prueba
  testDoc.embeddings = 'pending';
  // Guardar en disco para forzar el estado inicial
  (corpusSelector as any).saveIndexToDisk();

  // 3. Simular una consulta del usuario que dispare la carga perezosa
  const query = `¿Qué dice el documento de ${testDoc.titulo}?`;
  console.log(`\n💬 Ejecutando query de prueba: "${query}"`);
  console.log(`⏳ Procesando (esto llamará a pdf-parse y generará embeddings en Ollama)...`);

  const response = await jarvisService.query(query, { useMemory: false, provider: 'ollama' });
  
  console.log(`\n🤖 Respuesta de Jarvis:`);
  console.log(`----------------------------------------`);
  console.log(response);
  console.log(`----------------------------------------`);

  // 4. Verificar que se cargó en la base de datos
  const afterIngest = await documentRepo.searchDocumentsByTitle(testDoc.titulo, 1);
  if (afterIngest.length > 0) {
    console.log(`\n✅ Éxito: El documento se guardó en Postgres con ID ${afterIngest[0].id}.`);
  } else {
    console.error(`\n❌ Error: El documento no se encontró en la base de datos después del query.`);
  }

  // 5. Verificar que el estado del índice cambió a "ready"
  corpusSelector.reloadIndex();
  const updatedDoc = corpusSelector.getDocumentById(testDoc.id);
  console.log(`✅ Estado de embeddings en library-index.json tras consulta: "${updatedDoc?.embeddings}"`);

  await app.close();
  console.log('\n🧪 Test finalizado.');
}

main().catch(err => {
  console.error('❌ Error ejecutando el test:', err);
  process.exit(1);
});
