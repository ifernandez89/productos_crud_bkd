import axios from 'axios';

async function testBatch(modelName: string) {
  const ollamaHost = 'http://localhost:11434';

  const sample = [
    { id: 1, text: "Downloaded from\nYTS.MX" },
    { id: 2, text: "Official YIFY movies site:\nYTS.MX" },
    { id: 3, text: "Bastard." },
    { id: 4, text: "(HONKING HORN)" },
    { id: 5, text: "A few days, you say?" },
    { id: 6, text: "Not what I'd call a light traveller,\nare you, pet?" },
    { id: 7, text: "Sorry. It's mainly work." },
    { id: 8, text: "I wouldn't apologise\nfor having work, flower. Not round here." },
    { id: 9, text: "What's this, then?" },
    { id: 10, text: "MAN: Good on you!" }
  ];

  const formattedInput = sample.map(s => `[${s.id}] ${s.text.replace(/\n/g, ' / ')}`).join('\n');

  const system = `You are a professional translator for movie subtitles (English to Spanish).
Translate each line. 
Keep the exact line number prefix like [1], [2], etc.
Keep sound effects like (HONKING HORN) translated as (BOCINAZO) or (SONIDO DE BOCINA).
If a line is a credit or site name like "YTS.MX", keep it as is.
Return EXACTLY one line per item in the format: [ID] Translated Text. Do not add extra chat or explanations.`;

  const prompt = `Translate the following subtitle lines to Spanish:\n\n${formattedInput}`;

  console.log(`=== Testing model: ${modelName} ===`);
  const start = Date.now();
  try {
    const res = await axios.post(`${ollamaHost}/api/generate`, {
      model: modelName,
      system,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 1024
      }
    });
    console.log(`Duration: ${Date.now() - start}ms`);
    console.log('Response:\n', res.data.response);
  } catch (err: any) {
    console.error(`Error on ${modelName}:`, err.message);
  }
}

async function main() {
  await testBatch('RogerBen/hy-mt1.5-1.8b:latest');
  await testBatch('qwen3:1.7b');
  await testBatch('llama3.2:3b');
}

main();
