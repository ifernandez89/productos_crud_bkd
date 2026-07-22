import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';

function main() {
  const service = new CorpusSelectorService();
  const query = "Energetica Psiquica y Esencia Del Sueño";
  console.log(`Testing query: "${query}"`);
  
  const matches = service.findRelevantDocuments(query, 5);
  console.log(`Found ${matches.length} matches:`);
  for (const m of matches) {
    console.log(`- Title: "${m.document.titulo}" | Autor: "${m.document.autor}" | Score: ${m.score} | MatchedOn: ${m.matchedOn.join(', ')}`);
  }
}

main();
