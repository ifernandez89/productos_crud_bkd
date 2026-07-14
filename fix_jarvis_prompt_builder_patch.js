const fs = require("fs");
const path = "c:/Projects/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts";
let text = fs.readFileSync(path, "utf8");
const oldBlock = "          if (!categorySummary.isRequest) {\n" +
"          if (!categorySummary.isRequest) {\n" +
"            let chunks = [] as Array<{ content: string; document: { title?: string } }>;\n" +
"            try {\n" +
"              const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);\n" +
"              chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);\n" +
"            } catch (err: unknown) {\n" +
"              const msg = err instanceof Error ? err.message : String(err);\n" +
"              this.logger.warn(`[rag:semantic] fallback a búsqueda textual: ${msg}`);\n" +
"        }\n" +
"      }\n" +
"    }\n";
const newBlock = "          if (!categorySummary.isRequest) {\n" +
"            let chunks = [] as Array<{ content: string; document: { title?: string } }>;\n" +
"            try {\n" +
"              const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);\n" +
"              chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);\n" +
"            } catch (err: unknown) {\n" +
"              const msg = err instanceof Error ? err.message : String(err);\n" +
"              this.logger.warn(`[rag:semantic] fallback a búsqueda textual: ${msg}`);\n" +
"              chunks = await this.documentRepo.searchChunks(userMessage, 3);\n" +
"            }\n\n" +
"            if (chunks.length > 0) {\n" +
"              usedDocs = true;\n" +
"              const docText = chunks\n" +
"                .map((c) => `[${(c as any).document?.title || 'Doc'}]\n${c.content}`)\n" +
"                .join('\n---\n');\n" +
"              contextParts.push(`### DOCUMENTOS\n${docText}`);\n" +
"            }\n" +
"          }\n";
if (!text.includes(oldBlock)) {
  console.error('old block not found');
  process.exit(1);
}
text = text.replace(oldBlock, newBlock);
fs.writeFileSync(path, text, 'utf8');
console.log('patched');
