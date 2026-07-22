import { IntentRouterService } from '../src/jarvis/tools/intent/intent-router.service';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';

async function testScenario(
  router: IntentRouterService,
  corpusSelector: CorpusSelectorService,
  query: string
) {
  console.log(`\n--------------------------------------------------`);
  console.log(`💬 Query: "${query}"`);
  
  // 1. Fast Classify
  const fastResult = (router as any).fastClassify(query);
  console.log(`🕵️ Fast Classify Result:`);
  console.log(`   Intent: ${fastResult.intent} | Confidence: ${fastResult.confidence} | Reason: ${fastResult.reason}`);

  // 2. Library Index Check
  const libraryMatches = corpusSelector.findRelevantDocuments(query, 3);
  const topMatch = libraryMatches.length > 0 ? libraryMatches[0] : null;
  if (topMatch) {
    console.log(`📚 Library Match:`);
    console.log(`   Title: "${topMatch.document.titulo}" | Score: ${topMatch.score}`);
  } else {
    console.log(`📚 Library Match: None`);
  }

  // 3. Simulate Override Logic
  let finalIntent = fastResult.intent;
  let finalConfidence = fastResult.confidence;
  let finalReason = fastResult.reason;
  let overridden = false;

  if (libraryMatches.length > 0 && libraryMatches[0].score >= 2.0) {
    const isAstrologyOrWeb = fastResult.intent === 'ASTROLOGY' || fastResult.intent === 'WEB';
    const isLowConfidenceLocal = fastResult.intent === 'LOCAL' && fastResult.confidence !== 'high';

    if (isAstrologyOrWeb || isLowConfidenceLocal) {
      finalIntent = 'RAG';
      finalConfidence = 'high';
      finalReason = `library match: ${libraryMatches[0].document.titulo}`;
      overridden = true;
    }
  }

  console.log(`🔮 Final Simulated Routing:`);
  console.log(`   Intent: ${finalIntent} | Confidence: ${finalConfidence} | Reason: ${finalReason} ${overridden ? '(OVERRIDDEN)' : ''}`);
}

async function main() {
  const router = new IntentRouterService();
  const corpusSelector = new CorpusSelectorService();

  const testCases = [
    // 1. Book Query (which matched ASTROLOGY in the past due to LLM routing or keyword)
    "Energetica Psiquica y Esencia Del Sueño",
    
    // 2. Greetings & Trivial Messages (should match LOCAL with high confidence)
    "hola como estas!",
    "buen dia!",
    
    // 3. Tasks & Pending items (should match TASKS with high confidence)
    "que tenemos pendiente hoy?",
    
    // 4. Conversation history (should match LOCAL with high confidence)
    "hola donde quedamos ayer?",
    
    // 5. Jokes (should match LOCAL with high confidence)
    "cuentame un chiste!",
    
    // 6. Non-existing library match (should remain unchanged, fallback to normal flow)
    "que dice el libro de Harry Potter?"
  ];

  for (const tc of testCases) {
    await testScenario(router, corpusSelector, tc);
  }
}

main().catch(console.error);
