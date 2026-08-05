import axios from 'axios';

async function inspectOllama() {
  console.log('Sending request to Ollama for sematre/orpheus:it_es-3b...');
  const res = await axios.post('http://localhost:11434/api/generate', {
    model: 'sematre/orpheus:it_es-3b',
    prompt: 'Hola, esta es una prueba de JarBees.',
    stream: false,
  });

  console.log('Status:', res.status);
  console.log('Keys in response data:', Object.keys(res.data));
  console.log('Response content preview:', JSON.stringify(res.data).substring(0, 500));
}

inspectOllama().catch((err) => console.error(err));
