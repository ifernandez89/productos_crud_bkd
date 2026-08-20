import axios from 'axios';

async function testTranslation() {
  const model = process.env.OLLAMA_TRADUCTOR_MODEL || 'RogerBen/hy-mt1.5-1.8b:latest';
  const ollamaHost = 'http://localhost:11434';

  const testLines = [
    "Bastard.",
    "(HONKING HORN)",
    "A few days, you say?",
    "Not what I'd call a light traveller,\nare you, pet?",
    "Sorry. It's mainly work.",
    "I wouldn't apologise\nfor having work, flower. Not round here.",
    "DANNY: All right then, lads and lassies,\nLand of Hope and bloody Glory, eh?",
    "(PLAYING LAND OF HOPE AND GLORY)"
  ];

  console.log(`Testing model: ${model}`);
  for (let i = 0; i < testLines.length; i++) {
    const text = testLines[i];
    try {
      const res = await axios.post(`${ollamaHost}/api/generate`, {
        model,
        system: 'You are an expert subtitle translator translating English movie subtitles into natural European/Latin Spanish. Translate accurately while keeping concise subtitle phrasing. Maintain speaker tags like "MAN:" or sound effects like "(HONKING HORN)". Output ONLY the Spanish translation.',
        prompt: `Translate this subtitle line into Spanish:\n\n${text}`,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 256
        }
      });
      console.log(`[${i+1}] EN: ${JSON.stringify(text)}`);
      console.log(`    ES: ${JSON.stringify(res.data.response.trim())}\n`);
    } catch (err: any) {
      console.error(`Error on line ${i+1}:`, err.message);
    }
  }
}

testTranslation();
