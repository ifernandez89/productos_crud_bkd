import { PDFParse } from 'pdf-parse';
import * as fs from 'fs';

async function testPdfParse() {
  const files = [
    "c:/Projects/productos_crud_bkd/docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf",
    "c:/Projects/productos_crud_bkd/docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf",
    "c:/Projects/productos_crud_bkd/docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf",
  ];

  for (const f of files) {
    console.log(`\nTesting PDF parse on: ${f}`);
    try {
      const buffer = fs.readFileSync(f);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      console.log(`✅ SUCCESS! Pages: ${result.total}, Chars: ${result.text?.length ?? 0}`);
      console.log(`Snippet: "${result.text?.slice(0, 200).replace(/\s+/g, ' ')}"`);
    } catch (err: any) {
      console.error(`❌ FAILED: ${err.message}`);
    }
  }
}

testPdfParse();
