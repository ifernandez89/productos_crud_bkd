import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';
import { DocumentSummaryService } from '../src/jarvis/library/document-summary.service';

// Cargar archivo .env de forma manual para inicializar variables antes de instanciar Prisma
const envPath = 'C:/nest/productos_crud_bkd/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const parts = trimmedLine.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    }
  }
}

async function run() {
  console.log('=== Iniciando Debug de Match de Documentos ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  const documentRepo = app.get(DocumentRepository);
  const summaryService = app.get(DocumentSummaryService);

  try {
    // 1. Ver qué documentos existen en la base de datos
    console.log('\n[1] Documentos en la base de datos:');
    const docs = await documentRepo.getMostRecentDocuments(100);
    for (const d of docs) {
      console.log(`- ID: ${d.id} | Título: "${d.title}" | Categoría: "${(d as any).category}"`);
    }

    // 2. Ejecutar la búsqueda de findDocumentByTitle directamente con la query del usuario
    const query = "Ícaros: Cantos Sagrados del Amazonas";
    console.log(`\n[2] Ejecutando findDocumentByTitle para "${query}"...`);
    
    // Accedemos al método privado mediante cast
    const matchedDoc = await (summaryService as any).findDocumentByTitle(query);
    if (matchedDoc) {
      console.log(`✅ MATCH ENCONTRADO: ID=${matchedDoc.id} | Título="${matchedDoc.title}"`);
    } else {
      console.log('❌ NO SE ENCONTRÓ NINGÚN MATCH.');
    }

  } catch (error) {
    console.error('Error durante el debug:', error);
  } finally {
    await app.close();
    console.log('\n=== Debug Finalizado ===');
  }
}

run();
