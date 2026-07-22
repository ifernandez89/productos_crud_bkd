import * as fs from 'fs';
import * as path from 'path';

function main() {
  const p = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const docs = data.documentos || [];
  const idx = docs.findIndex((d: any) => d.autor === 'Sigmund Freud' || d.titulo === 'Obras Completas');
  console.log('Freud doc index:', idx);
  if (idx !== -1) {
    console.log(JSON.stringify(docs[idx], null, 2));
  }
}

main();
