import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';

async function testPdfLib(path: string) {
  console.log(`\nTesting pdf-lib load on: ${path}`);
  try {
    const buf = fs.readFileSync(path);
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, parseSpeed: 1 as any });
    console.log(`✅ SUCCESS pdf-lib! Pages: ${doc.getPageCount()}`);
  } catch (err: any) {
    console.error(`❌ pdf-lib error: ${err.message}`);
  }
}

async function main() {
  await testPdfLib("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf");
  await testPdfLib("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf");
  await testPdfLib("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf");
}

main();
