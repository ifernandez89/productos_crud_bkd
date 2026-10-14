const fs = require('fs');

async function askOllamaAlien() {
  console.log('👽 Consultando al modelo gratuito local (qwen3:8b) en Ollama para versión NAVE ALIENÍGENA...');
  const prompt = `Actúa como Director de Arte de Sci-Fi para el juego "ArcheoScope".
Diseña una versión alternativa de la máquina del tiempo, mucho más futurista y similar a una "nave alienígena / hovercraft extraterrestre":
Nombre: "Cronos-Omega: Xenotech Temporal Vessel".
Inspiración: Fusión entre la silueta aerodinámica retrofuturista en cuña y tecnología alienígena ancestral recuperada (estilo 'ancient astronauts' / ingeniería inversa extraterrestre).

Describe con precisión para renderizado Three.js PBR:
1. **Modo Levitación / Propulsión Antigravedad**: Las ruedas se pliegan horizontalmente convertidas en propulsores antigravedad iónicos con vórtices de energía de plasma cian y esmeralda. El vehículo levita en el aire.
2. **Carrocería e Interfaz Alienígena**: Aleación metálica alienígena de obsidiana iridiscente / bismuto con circuitos luminosos grabados en la chapa que pulsan con energía taquiónica.
3. **Núcleo de Singularidad Cuántica**: En la zaga, un prisma o núcleo de cristal alienígena suspendido magnéticamente que distorsiona la luz a su alrededor, rodeado de aros de levitación.
4. **Haz Gravitacional y Atmósfera**: Haz de descenso tractor cónico hacia el suelo, partículas de distorsión temporal y atmósfera nocturna con auroras y monolitos ancestrales.`;

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: prompt,
        stream: false,
        options: { temperature: 0.75 }
      })
    });
    const data = await res.json();
    console.log('\n======================================================');
    console.log('🛸 CONCEPTO ALIEN GENERADO POR OLLAMA:');
    console.log('======================================================\n');
    console.log(data.response);
    
    fs.writeFileSync('storage/posters/cronos_omega_alien_concept.txt', data.response, 'utf-8');
    console.log('\n📄 Guardado en: storage/posters/cronos_omega_alien_concept.txt');
  } catch (err) {
    console.error('Error al conectar con Ollama:', err.message);
  }
}

askOllamaAlien();
