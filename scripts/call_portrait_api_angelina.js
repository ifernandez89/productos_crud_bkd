const http = require('http');
const fs = require('fs');
const path = require('path');

async function testAngelinaApi() {
  console.log('=== Invocando endpoint /api/jarbees/poster/portrait/generate con nuestro backend NestJS ===');

  const payload = JSON.stringify({
    name: 'Angelina Jolie',
    style: 'semi_realistic',
    expression: 'determined',
    palettePreset: 'golden_hour',
    resolution: 2048,
    seed: 77700,
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
          console.log('HTTP Status Code:', res.statusCode);
          if (json.success) {
            console.log('✅ Retrato de Angelina Jolie generado con éxito por el servicio!');
            console.log('ID:', json.data.spec.id);
            console.log('Nombre:', json.data.spec.name);
            console.log('Estilo:', json.data.spec.style);
            console.log('Expresión:', json.data.spec.expression);
            console.log('Resolución:', json.data.telemetry.resolution);
            console.log('Tiempo de renderizado GPU:', json.data.telemetry.renderTimeMs, 'ms');
            console.log('Tamaño PNG:', json.data.telemetry.fileSizeKb, 'KB');
            console.log('Puntaje QA Anatómico:', json.data.qa.overallScore, '/ 100');
            console.log('Contraste WCAG:', json.data.qa.visualContrast.contrastRatio.toFixed(2) + ':1');
            console.log('Ruta PNG generada:', json.data.pngPath);

            // Copiar a directorio de artifacts
            const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\bb2b02ab-1056-4da6-a344-b2bb0f45627f';
            const destArtifact = path.join(artifactDir, 'angelina_jolie_jarbees_engine.png');
            fs.copyFileSync(json.data.pngPath, destArtifact);
            console.log('Copia guardada en Artifacts:', destArtifact);
          } else {
            console.error('Error reportado por el backend:', json);
          }
        } catch (e) {
          console.error('Error parseando JSON:', data);
        }
      });
    }
  );

  req.on('error', (err) => {
    console.error('Error HTTP:', err.message);
  });

  req.write(payload);
  req.end();
}

testAngelinaApi();
