import * as fs from 'fs';
import * as path from 'path';

const corruptedFiles = [
  'docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf',
  'docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf',
  'docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf'
];

for (const f of corruptedFiles) {
  const fullPath = path.resolve(f);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`[DELETE] Eliminado archivo corrupto: ${f}`);
  } else {
    console.log(`[WARN] El archivo ya no existe: ${f}`);
  }
}
