const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download ${url}: status code ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const size = fs.statSync(dest).size;
          console.log(`✅ Descargado: ${path.basename(dest)} (${Math.round(size / 1024)} KB)`);
          resolve(dest);
        });
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  const modelsDir = path.join(process.cwd(), 'storage', 'assets', 'models');
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

  console.log('--- Descargando modelos humanos anatómicos de alta fidelidad (CC0) ---');
  await downloadFile(
    'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb',
    path.join(modelsDir, 'brunette.glb')
  );
  await downloadFile(
    'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/avaturn.glb',
    path.join(modelsDir, 'avaturn.glb')
  );
  console.log('Todos los modelos descargados exitosamente.');
}

main().catch(console.error);
