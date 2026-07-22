import * as fs from 'fs';
import * as path from 'path';

function main() {
  const p = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const docs = data.documentos || [];
  const doc = docs.find((d: any) => d.autor === 'Sigmund Freud' || d.titulo === 'Obras Completas');
  if (doc) {
    const extraConcepts = ['sexualidad', 'sexual', 'libido', 'sexo', 'histeria', 'neurosis', 'placer'];
    for (const c of extraConcepts) {
      if (!doc.conceptosClave.includes(c)) {
        doc.conceptosClave.push(c);
      }
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    console.log('Updated library-index.json successfully');
  }
}

main();
