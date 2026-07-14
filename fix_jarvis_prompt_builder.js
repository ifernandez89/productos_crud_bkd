const fs = require("fs");
const path = "c:/Projects/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts";
const content = fs.readFileSync(path, "utf8");
const lines = content.split(/\r?\n/);
const replacement = [
  "          if (!categorySummary.isRequest) {",
  "            let chunks = [] as Array<{ content: string; document: { title?: string } }>;",
  "            try {",
  "              const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);",
  "              chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);",
  "            } catch (err: unknown) {",
  "              const msg = err instanceof Error ? err.message : String(err);",
  "              this.logger.warn(`[rag:semantic] fallback a búsqueda textual: ${msg}`);",
  "              chunks = await this.documentRepo.searchChunks(userMessage, 3);",
  "            }",
  "",
  "            if (chunks.length > 0) {",
  "              usedDocs = true;",
  "              const docText = chunks",
  "                .map((c) => `[${(c as any).document?.title || 'Doc'}]\\n${c.content}`)",
  "                .join('\\n---\\n');",
  "              contextParts.push(`### DOCUMENTOS\\n${docText}`);",
  "            }",
  "          }"
];
for (let i = 198; i <= 205; i += 1) {
  lines[i] = replacement[i - 198];
}
fs.writeFileSync(path, lines.join("\n"), "utf8");
console.log("patched");
