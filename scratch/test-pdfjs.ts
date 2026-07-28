import * as fs from 'fs';
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function repairAndExtract(filePath: string) {
  console.log(`\n--- Testing PDFJS legacy on: ${filePath} ---`);
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      ignoreErrors: true,
      stopAtErrors: false,
    });
    const pdfDoc = await loadingTask.promise;
    console.log(`Total pages: ${pdfDoc.numPages}`);
    let fullText = '';
    for (let i = 1; i <= Math.min(5, pdfDoc.numPages); i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    console.log(`Extracted sample text (first 5 pages): ${fullText.length} chars`);
    console.log(`Snippet: "${fullText.slice(0, 200).replace(/\s+/g, ' ')}"`);
  } catch (err: any) {
    console.error(`❌ PDFJS Error: ${err.message}`);
  }
}

async function main() {
  await repairAndExtract("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf");
  await repairAndExtract("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf");
  await repairAndExtract("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf");
}

main();
