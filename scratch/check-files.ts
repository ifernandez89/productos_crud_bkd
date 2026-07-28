import * as fs from 'fs';
import * as path from 'path';

const dir = 'docs/libros/Jacobo-Grinberg-Zylberbaum';
const files = fs.readdirSync(dir);
for (const f of files) {
  const stat = fs.statSync(path.join(dir, f));
  console.log(`${f} (${stat.size} bytes)`);
}
