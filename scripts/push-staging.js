const fs = require('fs');
const { execSync } = require('child_process');

const envContent = fs.readFileSync('.env.staging', 'utf8');
const lines = envContent.split(/\r?\n/);
let stagingUrl = '';
for (const line of lines) {
  if (line.startsWith('DATABASE_URL=')) {
    stagingUrl = line.substring('DATABASE_URL='.length).trim();
    if ((stagingUrl.startsWith('"') && stagingUrl.endsWith('"')) || (stagingUrl.startsWith("'") && stagingUrl.endsWith("'"))) {
      stagingUrl = stagingUrl.slice(1, -1);
    }
    break;
  }
}

if (!stagingUrl) {
  console.error('ERROR: DATABASE_URL not found in .env.staging');
  process.exit(1);
}

const dbName = stagingUrl.split('/').pop().split('?')[0];
console.log(`[staging-db-push] Target DB: "${dbName}"`);
if (dbName !== 'jarbees_stage') {
  console.error(`SECURITY BLOCK: Target DB must be "jarbees_stage", got "${dbName}"`);
  process.exit(1);
}

console.log('[staging-db-push] Executing prisma db push on jarbees_stage...');
try {
  const output = execSync('npx prisma db push --schema=prisma/schema.prisma --skip-generate', {
    env: {
      ...process.env,
      DATABASE_URL: stagingUrl,
      PRISMA_CLI_QUERY_ENGINE_TYPE: 'binary',
    },
    stdio: 'pipe',
  });
  console.log(output.toString());
  console.log('[staging-db-push] SUCCESS: Schema pushed to jarbees_stage.');
} catch (err) {
  console.error('[staging-db-push] FAILED:');
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}
