const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SRC = path.join(ROOT_DIR, 'src');

const patterns = [
  /\$executeRaw/g,
  /\$queryRaw/g,
  /exec\(/g,
  /spawn\(/g,
  /child_process/g,
  /eval\(/g,
  /::vector/g,
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file === 'node_modules') return;
      results = results.concat(walk(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

function isAllowed(file, pattern) {
  const normalizedPath = file.replace(/\\/g, '/');
  
  if (pattern.source === 'child_process' || pattern.source === 'spawn\\(') {
    return normalizedPath.endsWith('src/jarvis/security/safe-exec.service.ts');
  }
  
  if (pattern.source === '\\$executeRaw' || pattern.source === '\\$queryRaw' || pattern.source === '::vector') {
    return normalizedPath.endsWith('src/jarvis/repositories/pgvector.service.ts');
  }
  
  if (pattern.source === 'exec\\(') {
    return (
      normalizedPath.endsWith('src/jarvis/library/sitemap-crawler.service.ts') ||
      normalizedPath.endsWith('src/jarvis/tools/intent/intent-router.service.ts')
    );
  }
  
  return false;
}

const files = walk(SRC).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
let found = false;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const p of patterns) {
    const match = content.match(p);
    if (match && match.length > 0) {
      if (isAllowed(file, p)) {
        continue;
      }
      console.log(`${file}: found ${p}`);
      found = true;
    }
  }
}

if (found) {
  console.error('\nSecurity check failed: dangerous patterns detected.');
  process.exit(2);
}
console.log('Security check passed.');
process.exit(0);
