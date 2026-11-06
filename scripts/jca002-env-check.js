const fs = require('fs');

['.env', '.env.staging'].forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const m = content.match(/DATABASE_URL=["']?[^@]+@[^/]+\/([^?]+)/);
  console.log(`${f} -> db: ${m ? m[1] : 'unknown'}`);
});

