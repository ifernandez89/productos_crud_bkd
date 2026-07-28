import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

interface DocumentIndexEntry {
  id: string;
  titulo: string;
  archivo: string;
  tipo: string;
  formato: string;
  autor: string;
  idioma: string;
  categorias: string[];
  conceptosClave: string[];
  capitulos: any[];
  embeddings: string;
  descripcionBreve: string;
  tags: string[];
}

interface IndexData {
  metadata: any;
  documentos: DocumentIndexEntry[];
}

async function extractPdfMetadata(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, sizeBytes: 0, pages: 0 };
    }
    const stat = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return {
      exists: true,
      sizeBytes: stat.size,
      sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
      pages: pdfDoc.getPageCount()
    };
  } catch (e: any) {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    return {
      exists: fs.existsSync(filePath),
      sizeBytes: stat ? stat.size : 0,
      sizeMB: stat ? (stat.size / (1024 * 1024)).toFixed(2) : '0',
      pages: 'N/A (Error al parsear páginas)'
    };
  }
}

function isJungOrFreud(doc: DocumentIndexEntry): boolean {
  const normAuthor = (doc.autor || '').toLowerCase();
  const normFile = (doc.archivo || '').toLowerCase();
  const normTitle = (doc.titulo || '').toLowerCase();

  const matchesJung = normAuthor.includes('jung') || normFile.includes('carl gustav jung') || normTitle.includes('jung');
  const matchesFreud = normAuthor.includes('freud') || normFile.includes('sigmund freud') || normTitle.includes('freud');

  return matchesJung || matchesFreud;
}

async function run() {
  const rootDir = process.cwd();
  const indexPath = path.join(rootDir, 'src', 'jarvis', 'knowledge', 'library-index.json');
  const librosDir = path.join(rootDir, 'docs', 'libros');

  console.log('====================================================');
  console.log('🧠 EXTRACCIÓN DE INFORMACIÓN: NUEVOS LIBROS JUNG & FREUD 🧠');
  console.log('====================================================\n');

  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Error: No se encontró el archivo de índice en: ${indexPath}`);
    process.exit(1);
  }

  const indexContent: IndexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const allDocs = indexContent.documentos || [];

  // Filtrar libros de Jung y Freud
  const jungFreudDocs = allDocs.filter(isJungOrFreud);

  console.log(`📚 Total de libros identificados de Jung / Freud en el índice: ${jungFreudDocs.length}`);

  // Filtrar libros NUEVOS (embeddings !== 'ready' o 'pending')
  const forceAll = process.argv.includes('--all');
  const newDocs = forceAll ? jungFreudDocs : jungFreudDocs.filter(d => d.embeddings !== 'ready');

  console.log(`🆕 Nuevos libros pendientes de procesamiento / indexación: ${newDocs.length}\n`);

  if (newDocs.length === 0) {
    console.log('✨ Todos los libros de Jung y Freud están al día y marcados como "ready".');
    console.log('💡 Tip: Utiliza la bandera --all para listar la información de TODOS los libros de Jung y Freud.');
    return;
  }

  const results = [];

  for (let i = 0; i < newDocs.length; i++) {
    const doc = newDocs[i];
    const fullPath = path.join(librosDir, doc.archivo);
    const pdfInfo = await extractPdfMetadata(fullPath);

    const docSummary = {
      index: i + 1,
      id: doc.id,
      titulo: doc.titulo,
      autor: doc.autor,
      archivo: doc.archivo,
      fullPath,
      formato: doc.formato,
      estadoEmbeddings: doc.embeddings,
      categorias: doc.categorias,
      tags: doc.tags,
      conceptosClave: doc.conceptosClave,
      descripcionBreve: doc.descripcionBreve,
      archivoExiste: pdfInfo.exists,
      tamanoMB: pdfInfo.sizeMB,
      totalPaginas: pdfInfo.pages
    };

    results.push(docSummary);

    console.log(`----------------------------------------------------`);
    console.log(`📖 [${i + 1}/${newDocs.length}] ${doc.titulo}`);
    console.log(`   👤 Autor:              ${doc.autor}`);
    console.log(`   📁 Archivo:            ${doc.archivo}`);
    console.log(`   ⚖️  Tamaño:             ${pdfInfo.sizeMB} MB | Páginas: ${pdfInfo.pages}`);
    console.log(`   🏷️  Categorías:         ${doc.categorias.join(', ')}`);
    console.log(`   🔑 Conceptos clave:    ${doc.conceptosClave.slice(0, 6).join(', ')}`);
    console.log(`   📝 Descripción breve:  ${doc.descripcionBreve}`);
    console.log(`   🚦 Estado Embeddings:  ${doc.embeddings}`);
  }

  console.log(`\n====================================================`);
  console.log(`🎉 Resumen de extracción finalizado. Total nuevos: ${newDocs.length}`);
  console.log(`====================================================`);
}

run().catch(err => {
  console.error('❌ Error ejecutando la extracción:', err);
  process.exit(1);
});
