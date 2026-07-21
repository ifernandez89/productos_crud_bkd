import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = path.join(process.cwd(), 'docs', 'libros', 'Carl Gustav Jung', 'Arquetipos EI inconsciente Colectivo-1.pdf');
  console.log(`Reading PDF file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error('File does not exist.');
    return;
  }

  const buffer = fs.readFileSync(filePath);
  console.log(`Buffer length: ${buffer.length} bytes`);

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  console.log(`Metadata:`, result.metadata);
  console.log(`Total Pages:`, result.total);
  console.log(`Text Length:`, result.text?.length);
  console.log(`First 500 characters of text:`);
  console.log('--------------------------------');
  console.log(result.text?.slice(0, 500));
  console.log('--------------------------------');
}

main().catch(console.error);
