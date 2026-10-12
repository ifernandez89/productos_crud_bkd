const http = require('http');
const fs = require('fs');

async function testPortrait() {
  console.log('--- Probando generación de retrato paramétrico 2.5D en JarBees ---');

  const payload = JSON.stringify({
    name: 'Aurelia Solaris',
    style: 'semi_realistic',
    expression: 'determined',
    palettePreset: 'golden_hour',
    resolution: 2048,
    seed: 42819,
    addCyberMarkings: true,
  });

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/jarbees/poster/portrait/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('HTTP Status:', res.statusCode);
          if (json.success) {
            console.log('✅ Retrato Generado con Éxito!');
            console.log('ID:', json.data.spec.id);
            console.log('Estilo:', json.data.spec.style);
            console.log('Expresión:', json.data.spec.expression);
            console.log('Resolución:', json.data.telemetry.resolution);
            console.log('Tiempo de renderizado:', json.data.telemetry.renderTimeMs, 'ms');
            console.log('Tamaño PNG:', json.data.telemetry.fileSizeKb, 'KB');
            console.log('QA Score:', json.data.qa.overallScore, '/ 100');
            console.log('Contraste WCAG:', json.data.qa.visualContrast.contrastRatio.toFixed(2) + ':1');
            console.log('Chequeos anatómicos:');
            json.data.qa.anatomicalValidity.checks.forEach(c => {
              console.log(` - ${c.name}: ${c.passed ? 'PASS' : 'FAIL'} (${c.measuredValue}) -> ${c.details}`);
            });
          } else {
            console.error('Error del servidor:', json);
          }
        } catch (e) {
          console.error('Respuesta cruda:', data);
        }
      });
    }
  );

  req.on('error', (err) => {
    console.error('Error de conexión:', err.message);
  });

  req.write(payload);
  req.end();
}

testPortrait();
