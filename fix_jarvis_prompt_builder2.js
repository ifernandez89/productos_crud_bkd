const fs = require('fs');
const path = 'c:/Projects/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts';
let text = fs.readFileSync(path, 'utf8');
const startMarker = '          if (!categorySummary.isRequest) {\n          if (!categorySummary.isRequest) {';
const endMarker = '\n\n    if (browserContext) {';
const startIndex = text.indexOf(startMarker);
if (startIndex === -1) {
  console.error('start marker not found');
  process.exit(1);
}
const endIndex = text.indexOf(endMarker, startIndex);
if (endIndex === -1) {
  console.error('end marker not found');
  process.exit(1);
}
const replacement = '          if (!categorySummary.isRequest) {\n' +
'            let chunks = [] as Array<{ content: string; document: { title?: string } }>;\n' +
'            try {\n' +
'              const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);\n' +
'              chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);\n' +
'            } catch (err: unknown) {\n' +
'              const msg = err instanceof Error ? err.message : String(err);\n' +
'              this.logger.warn(`[rag:semantic] fallback a búsqueda textual: ${msg}`);\n' +
'              chunks = await this.documentRepo.searchChunks(userMessage, 3);\n' +
'            }\n\n' +
'            if (chunks.length > 0) {\n' +
'              usedDocs = true;\n' +
'              const docText = chunks\n' +
'                .map((c) => `[${(c as any).document?.title || \'Doc\'}]\\n${c.content}`)\n' +
'                .join(\\'\\n---\\n\\');\n' +
'              contextParts.push(`### DOCUMENTOS\\n${docText}`);\n' +
'            }\n' +
'          }';
text = text.slice(0, startIndex) + replacement + text.slice(endIndex);
fs.writeFileSync(path, text, 'utf8');
console.log('patched');
