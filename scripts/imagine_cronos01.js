const fs = require('fs');

async function askOllama() {
  console.log('🤖 Consultando al modelo gratuito local (qwen3:8b) en Ollama...');
  const prompt = `Actúa como Director de Arte y Diseñador Conceptual para el juego "ArcheoScope".
Diseña una máquina del tiempo llamada "Cronos-01: Temporal Explorer".
Inspirada en el espíritu retrofuturista de los 80s y los autos deportivos en cuña (como el DeLorean), pero 100% ORIGINAL para evitar cualquier infracción de derechos de autor (sin logos de DMC, sin detalles cinematográficos idénticos).

Proporciona especificaciones concisas:
1. **Silueta y Carrocería**: Geometría origami/cuña, paneles de aleación titanio-acero inoxidable cepillado (PBR), puertas diédricas/ala de gaviota con guías luminosas.
2. **Reactor Temporal Cuántico**: Montado en la zaga/chasis trasero, bobinas de cobre, anillos de confinamiento de plasma cian/ultravioleta, radiación Cherenkov y distorsión gravitacional.
3. **Sensores Arqueológicos y Ópticos**: Array LiDAR en el techo, escáner de taquiones, barra de luz LED matricial continua ultra-delgada en el morro (en vez de ópticas cuadradas clásicas).
4. **Paleta y Acabados Three.js**: Valores hexadecimales y parámetros PBR (Roughness, Metalness, Emissive) para renderizado por GPU RTX 5070.`;

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
        }
      })
    });
    const data = await res.json();
    console.log('\n======================================================');
    console.log('✨ CONCEPTO GENERADO POR MODELO GRATUITO LOCAL (OLLAMA):');
    console.log('======================================================\n');
    console.log(data.response);
    
    fs.writeFileSync('storage/posters/cronos01_concept_design.txt', data.response, 'utf-8');
    console.log('\n📄 Guardado en: storage/posters/cronos01_concept_design.txt');
  } catch (err) {
    console.error('Error al conectar con Ollama:', err.message);
  }
}

askOllama();
