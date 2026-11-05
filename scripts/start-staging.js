const path = require('path');
const dotenv = require('dotenv');

// Load .env.staging with override: true so it takes strict precedence over any .env
const envPath = path.resolve(__dirname, '../.env.staging');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  console.error('FAILED to load .env.staging:', result.error);
  process.exit(1);
}

// Security assertions
if (process.env.PORT !== '4001') {
  console.error(`SECURITY BLOCK: Staging PORT must be 4001, got ${process.env.PORT}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('jarbees_stage')) {
  console.error('SECURITY BLOCK: Staging DATABASE_URL must target jarbees_stage');
  process.exit(1);
}

console.log('====================================================');
console.log('[STAGING-BOOT] Environment: staging');
console.log(`[STAGING-BOOT] Port: ${process.env.PORT}`);
console.log(`[STAGING-BOOT] Database: jarbees_stage (PostgreSQL 5432)`);
console.log(`[STAGING-BOOT] LLM Primary: ${process.env.INFERENCE_PRIMARY_PROVIDER || 'llamacpp'} (${process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080'})`);
console.log('====================================================');

// Launch NestJS application
require('../dist/main.js');
