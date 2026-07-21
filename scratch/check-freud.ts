import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = path.join(process.cwd(), 'docs', 'libros', 'Freud, Sigmund. - Obras completas.pdf');
  console.log(`Reading Freud PDF file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error('File does not exist.');
    return;
  }

  const buffer = fs.readFileSync(filePath);
  console.log(`Buffer length: ${buffer.length} bytes`);

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  console.log(`Total Pages:`, result.total);
  console.log(`Text Length:`, result.text?.length);
  console.log(`Snippet of first 500 characters of text:`);
  console.log('--------------------------------');
  console.log(result.text?.slice(0, 500));
  console.log('--------------------------------');
}

main().catch(console.error);
