import * as fs from 'fs';
import { PDFParse } from 'pdf-parse';

async function fixAndTest(filePath: string) {
  console.log(`\n=== Repairing: ${filePath} ===`);
  const buf = fs.readFileSync(filePath);
  
  // Find where HTML error starts: "<html" or "<!DOCTYPE"
  let htmlIdx = buf.indexOf('<!DOCTYPE');
  if (htmlIdx === -1) htmlIdx = buf.indexOf('<html');
  
  let cleanBuf = buf;
  if (htmlIdx !== -1) {
    console.log(`Found HTML error at byte offset: ${htmlIdx} of ${buf.length}. Truncating HTML error...`);
    cleanBuf = buf.subarray(0, htmlIdx);
  } else {
    console.log(`No HTML tag found in file.`);
  }

  // Try parsing with pdf-parse
  try {
    const parser = new PDFParse({ data: cleanBuf });
    const result = await parser.getText();
    await parser.destroy();
    console.log(`🎉 SUCCESS parsing text! Total pages: ${result.total}, Total chars: ${result.text?.length ?? 0}`);
    console.log(`Sample snippet: "${result.text?.slice(0, 300).replace(/\s+/g, ' ')}"`);
    
    // Save cleaned file back to disk
    fs.writeFileSync(filePath, cleanBuf);
    console.log(`💾 Saved repaired file to disk.`);
  } catch (err: any) {
    console.error(`❌ pdf-parse error: ${err.message}`);
  }
}

async function main() {
  await fixAndTest("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf");
  await fixAndTest("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf");
  await fixAndTest("docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf");
}

main();
