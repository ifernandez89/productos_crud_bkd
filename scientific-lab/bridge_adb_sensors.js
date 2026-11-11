const { execFile } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const ADB = path.resolve('tools/platform-tools/adb.exe');

function adb(args) {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function ensureAdbForward() {
  try {
    await adb(['forward', 'tcp:8080', 'tcp:8080']);
    console.log('✅ ADB port forward tcp:8080 establecido.');
  } catch (err) {
    console.error('Error configurando adb forward:', err.message);
  }
}

async function ensurePhyphoxMeasuring() {
  try {
    const res = await fetch('http://127.0.0.1:8080/control?cmd=start');
    if (res.ok) {
      console.log('▶️ Phyphox medición activada en el móvil.');
    }
  } catch (err) {
    // If not reachable yet, will retry in loop
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('🛰️ JARBEES HARDWARE SENSOR BRIDGE (PHYPHOX HAL -> FIELD LAB)');
  console.log('='.repeat(70));

  const expectedSerial = (process.env.ADB_DEVICE_SERIAL || '').trim();
  const devices = await adb(['devices']);
  const hasDevice = expectedSerial
    ? devices.includes(expectedSerial)
    : /\bdevice\b/.test(devices.replace('List of devices attached', ''));
  if (!hasDevice) {
    console.log('⚠️ Nodo móvil Android no detectado por ADB.');
    console.log('   Por favor, verifica la conexión USB y la depuración ADB.');
    process.exit(1);
  }

  console.log('✅ Nodo móvil Android conectado por USB ADB.');
  await ensureAdbForward();
  await ensurePhyphoxMeasuring();

  // Connect to Lab WebSocket server
  let ws = null;
  function connectWs() {
    ws = new WebSocket('ws://127.0.0.1:3333');
    ws.on('open', () => {
      console.log('✅ Conectado al Dashboard en ws://127.0.0.1:3333');
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      setTimeout(connectWs, 2000);
    });
  }
  connectWs();

  let count = 0;
  let lastStateCheck = 0;

  console.log('🟢 Transmitiendo mediciones de alta precisión del magnetómetro...');

  while (true) {
    try {
      const now = Date.now();
      // Keep measurement alive every 5s
      if (now - lastStateCheck > 5000) {
        lastStateCheck = now;
        ensurePhyphoxMeasuring().catch(() => {});
      }

      const res = await fetch('http://127.0.0.1:8080/get?magX&magY&magZ&mag', {
        signal: AbortSignal.timeout(800)
      });

      if (res.ok) {
        const data = await res.json();
        const buf = data.buffer;

        if (buf && buf.magX && buf.magX.buffer && buf.magX.buffer.length > 0) {
          const bx = buf.magX.buffer[buf.magX.buffer.length - 1];
          const by = buf.magY.buffer[buf.magY.buffer.length - 1];
          const bz = buf.magZ.buffer[buf.magZ.buffer.length - 1];
          const norm = buf.mag ? buf.mag.buffer[buf.mag.buffer.length - 1] : Math.sqrt(bx*bx + by*by + bz*bz);

          count++;

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'telemetry',
              ts: now,
              mag: [bx, by, bz],
              acc: [0, 0, 9.8],
              gyro: [0, 0, 0],
              source: 'HARDWARE_ADB_HAL'
            }));
          }

          process.stdout.write(`[# ${count.toString().padStart(5, '0')}] B = ${norm.toFixed(2).padStart(6, ' ')} µT | Bx=${bx.toFixed(2).padStart(6, ' ')}, By=${by.toFixed(2).padStart(6, ' ')}, Bz=${bz.toFixed(2).padStart(6, ' ')} µT\r`);
        }
      }
    } catch (e) {
      // Re-establish forward if connection drops
      if (e.code === 'ECONNREFUSED' || e.name === 'TimeoutError') {
        await ensureAdbForward();
        await sleep(500);
      }
    }

    await sleep(30); // ~30 Hz sampling rate
  }
}

main().catch(err => {
  console.error('Fatal bridge error:', err);
  process.exit(1);
});
