import * as fs from 'fs';

const files = [
  "docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf",
  "docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf",
  "docs/libros/Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf"
];

for (const f of files) {
  console.log(`\n=== File: ${f} ===`);
  const fd = fs.openSync(f, 'r');
  const stat = fs.fstatSync(fd);
  
  const headerBuf = Buffer.alloc(100);
  fs.readSync(fd, headerBuf, 0, 100, 0);
  console.log(`Header (first 100 bytes ascii):`);
  console.log(headerBuf.toString('ascii').replace(/[^\x20-\x7E]/g, '.'));

  const tailSize = Math.min(1000, stat.size);
  const tailBuf = Buffer.alloc(tailSize);
  fs.readSync(fd, tailBuf, 0, tailSize, stat.size - tailSize);
  console.log(`Tail (last ${tailSize} bytes ascii):`);
  console.log(tailBuf.toString('ascii').replace(/[^\x20-\x7E]/g, '.'));
  
  fs.closeSync(fd);
}
