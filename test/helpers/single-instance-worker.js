/**
 * Worker auxiliar para pruebas de concurrencia inter-proceso (DEV-001-B1.3.1: TEST-01)
 * Ejecuta SingleInstanceLockService en un proceso Node.js completamente independiente.
 */
const { SingleInstanceLockService } = require('../../dist/auth/single-instance-lock.service');

const port = process.env.TEST_MUTEX_PORT ? parseInt(process.env.TEST_MUTEX_PORT, 10) : 40299;
const lockDir = process.env.TEST_LOCK_DIR || 'storage/security-test-concurrency';

const lockService = new SingleInstanceLockService({ port, lockDir });

lockService
  .acquireLock()
  .then((result) => {
    if (process.send) {
      process.send({ status: 'acquired', ...result });
    } else {
      process.stdout.write(`ACQUIRED:${result.pid}\n`);
    }

    process.on('message', (msg) => {
      if (msg === 'release') {
        lockService.releaseLock();
        process.exit(0);
      }
    });
  })
  .catch((err) => {
    if (process.send) {
      process.send({ status: 'failed', error: err.message, name: err.name });
    } else {
      process.stderr.write(`FAILED:${err.message}\n`);
    }
    process.exit(1);
  });

