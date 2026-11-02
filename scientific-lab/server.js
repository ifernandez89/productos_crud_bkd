const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/node') pathname = '/node.html';

  const filePath = path.join(PUBLIC_DIR, pathname);

  // Security check: restrict to PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access Denied');
  }

  // REST API: list experiments
  if (pathname === '/api/experiments') {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ experiments: files }));
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

let activeRecording = null;
let recordingStream = null;

let sampleCount = 0;
let lastTimestamps = [];
let effectiveFrequency = 0;
let interSampleJitter = 0;

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] Nueva conexión desde: ${ip}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Handle ping/pong for latency
      if (data.type === 'ping') {
        return ws.send(JSON.stringify({ type: 'pong', clientTime: data.clientTime, serverTime: Date.now() }));
      }

      // Handle Telemetry from Mobile Node
      if (data.type === 'telemetry') {
        sampleCount++;
        const now = Date.now();
        lastTimestamps.push(now);
        if (lastTimestamps.length > 30) lastTimestamps.shift();

        if (lastTimestamps.length >= 2) {
          const deltas = [];
          for (let i = 1; i < lastTimestamps.length; i++) {
            deltas.push(lastTimestamps[i] - lastTimestamps[i - 1]);
          }
          const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          effectiveFrequency = avgDelta > 0 ? (1000 / avgDelta) : 0;

          // Jitter (std deviation of delta)
          const variance = deltas.reduce((acc, d) => acc + Math.pow(d - avgDelta, 2), 0) / deltas.length;
          interSampleJitter = Math.sqrt(variance);
        }

        // Add server-side verified metrics
        data.metrics = {
          sampleCount,
          effectiveFrequency: Math.round(effectiveFrequency * 10) / 10,
          interSampleJitter: Math.round(interSampleJitter * 10) / 10
        };

        // If recording is active, write to CSV
        if (activeRecording && recordingStream) {
          const row = [
            now,
            data.mono || 0,
            (data.mag ? data.mag[0] : 0).toFixed(2),
            (data.mag ? data.mag[1] : 0).toFixed(2),
            (data.mag ? data.mag[2] : 0).toFixed(2),
            (data.acc ? data.acc[0] : 0).toFixed(3),
            (data.acc ? data.acc[1] : 0).toFixed(3),
            (data.acc ? data.acc[2] : 0).toFixed(3),
            (data.gyro ? data.gyro[0] : 0).toFixed(3),
            (data.gyro ? data.gyro[1] : 0).toFixed(3),
            (data.gyro ? data.gyro[2] : 0).toFixed(3),
            effectiveFrequency.toFixed(1)
          ].join(',') + '\n';
          recordingStream.write(row);
        }

        // Broadcast to all other clients (dashboards)
        const payloadStr = JSON.stringify(data);
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(payloadStr);
          }
        });
      }

      // Handle Control Commands from Dashboard
      if (data.type === 'start_experiment') {
        const title = (data.title || 'ensayo').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `exp_${title}_${Date.now()}.csv`;
        const filepath = path.join(DATA_DIR, filename);

        activeRecording = {
          title,
          filename,
          filepath,
          startTime: Date.now(),
          hypothesis: data.hypothesis || 'Sin hipótesis declarada'
        };

        recordingStream = fs.createWriteStream(filepath, { encoding: 'utf8' });
        recordingStream.write('timestamp,mono_ms,bx_uT,by_uT,bz_uT,ax_ms2,ay_ms2,az_ms2,gx_rads,gy_rads,gz_rads,freq_hz\n');

        console.log(`[REC] Iniciado experimento: ${filename}`);
        broadcast({ type: 'experiment_status', status: 'RECORDING', activeRecording });
      }

      if (data.type === 'stop_experiment') {
        if (recordingStream) {
          recordingStream.end();
          recordingStream = null;
        }
        const savedExp = activeRecording;
        activeRecording = null;
        console.log(`[REC] Finalizado experimento: ${savedExp ? savedExp.filename : 'N/A'}`);
        broadcast({ type: 'experiment_status', status: 'IDLE', lastExperiment: savedExp });
      }

    } catch (e) {
      console.error('[WS] Error procesando mensaje:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Conexión cerrada: ${ip}`);
  });
});

function broadcast(msgObj) {
  const str = JSON.stringify(msgObj);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(str);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(72));
  console.log('🔬 JARBEES SCIENTIFIC LAB — SERVER ONLINE');
  console.log('   Experimental instrumentation · Physical sensing · AI-assisted research');
  console.log('='.repeat(72));
  console.log(`📡 Panel de Control PC (Field Lab 3D): http://localhost:${PORT}`);
  console.log(`📱 Sensor Node Móvil (Moto G22):        http://10.187.49.76:${PORT}/node`);
  console.log(`                                        (o http://localhost:${PORT}/node vía adb reverse)`);
  console.log('='.repeat(72));
});

