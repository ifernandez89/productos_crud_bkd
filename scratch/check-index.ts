import * as fs from 'fs';
import * as path from 'path';

function main() {
  const indexPath = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('library-index.json does not exist.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const docs = data.documentos || [];
  
  console.log(`Total documents in index: ${docs.length}`);

  // List unique authors
  const authors = Array.from(new Set(docs.map((d: any) => d.autor))).filter(Boolean);
  console.log('Unique authors:', authors);

  // Search for Freud or Sigmund
  const freudDocs = docs.filter((d: any) => 
    (d.autor && d.autor.toLowerCase().includes('freud')) || 
    (d.titulo && d.titulo.toLowerCase().includes('freud')) ||
    (d.archivo && d.archivo.toLowerCase().includes('freud'))
  );

  console.log(`Found ${freudDocs.length} documents matching 'freud':`);
  console.log(JSON.stringify(freudDocs, null, 2));
}

main();
