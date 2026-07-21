import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

async function main() {
  const dirPath = path.join(process.cwd(), 'docs', 'libros', 'Carl Gustav Jung');
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Analyzing ${files.length} PDFs in ${dirPath}...`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`${'File Name'.padEnd(50)} | ${'Pages'.padStart(5)} | ${'Text Length'.padStart(12)} | ${'Status'}`);
  console.log('--------------------------------------------------------------------------------');

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const buffer = fs.readFileSync(filePath);
    
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      
      const textLen = result.text?.replace(/\s+/g, ' ').trim().length ?? 0;
      const pages = result.total ?? 0;
      
      // Heurística simple: si hay menos de 50 caracteres por página en promedio, probablemente sea escaneado.
      const ratio = pages > 0 ? textLen / pages : 0;
      const status = ratio > 50 ? '✅ Text Layer' : '❌ Scanned / Image-only';
      
      console.log(`${file.padEnd(50)} | ${String(pages).padStart(5)} | ${String(textLen).padStart(12)} | ${status} (avg: ${Math.round(ratio)} char/pg)`);
    } catch (err: any) {
      console.log(`${file.padEnd(50)} | ERROR | ${err.message}`);
    }
  }
}

main().catch(console.error);
