# Plan de Activación de pgvector
**Para ejecutar en casa — requiere acceso a PostgreSQL con permisos de superusuario**

---

## Estado actual (honesto)

Los embeddings **se generan** pero **no se buscan semánticamente**:

```
DocumentIngestService
  ↓
EmbeddingsService.generateEmbedding(text)   ← Ollama nomic-embed-text → number[768]
  ↓
JSON.stringify(vec)                          ← se guarda como String en embeddingId
  ↓
PostgreSQL: embeddingId String?              ← campo de texto, no vector
```

La búsqueda en `DocumentRepository.searchChunks()` usa `contains` (LIKE), no coseno.
El método `cosineSimilarity()` existe en `EmbeddingsService` pero **nunca se llama**.

---

## Lo que hay que hacer (4 pasos)

### Paso 1 — Habilitar la extensión pgvector en PostgreSQL

```sql
-- Conectarse como superusuario
CREATE EXTENSION IF NOT EXISTS vector;

-- Verificar que está instalada
SELECT * FROM pg_extension WHERE extname = 'vector';
```

Si pgvector no está instalado en el sistema:
```bash
# Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# macOS (Homebrew)
brew install pgvector

# Windows — descargar desde https://github.com/pgvector/pgvector/releases
# y ejecutar el .sql de instalación manualmente
```

---

### Paso 2 — Modificar el schema de Prisma

**Archivo:** `prisma/schema.prisma`

Agregar el tipo `Unsupported` para el campo vector en `Chunk` y `MemoryChunk`:

```prisma
// ANTES:
model Chunk {
  id          Int      @id @default(autoincrement())
  documentId  Int
  content     String   @db.Text
  embeddingId String?  // ← actualmente JSON string
  metadata    Json?
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([embeddingId])
}

// DESPUÉS:
model Chunk {
  id        Int                        @id @default(autoincrement())
  documentId Int
  content   String                     @db.Text
  embedding Unsupported("vector(768)")?  // ← campo nativo pgvector
  metadata  Json?
  document  Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
}
```

Lo mismo para `MemoryChunk`:
```prisma
// DESPUÉS:
model MemoryChunk {
  id        Int                        @id @default(autoincrement())
  memoryId  Int
  content   String                     @db.Text
  embedding Unsupported("vector(768)")?  // ← campo nativo pgvector
  memory    Memory @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  @@index([memoryId])
}
```

> **Nota:** Prisma usa `Unsupported("vector(768)")` porque no tiene soporte nativo de pgvector todavía. El campo existe en la DB pero Prisma no lo serializa/deserializa automáticamente — hay que usar `$queryRaw` para escritura y búsqueda.

---

### Paso 3 — Crear y ejecutar la migración

```bash
# Crear la migración sin ejecutarla (para revisar el SQL antes)
npx prisma migrate dev --name activate_pgvector --create-only

# Editar el archivo de migración generado para agregar:
# 1. El índice HNSW (más rápido que IVFFlat para búsqueda aproximada)
# 2. La columna de forma correcta
```

**Editar el archivo** `prisma/migrations/TIMESTAMP_activate_pgvector/migration.sql`:

```sql
-- Asegurarse de que la extensión esté instalada
CREATE EXTENSION IF NOT EXISTS vector;

-- Agregar columna embedding a Chunk
ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(768);

-- Agregar columna embedding a MemoryChunk
ALTER TABLE "MemoryChunk" ADD COLUMN "embedding" vector(768);

-- Índice HNSW para búsqueda aproximada rápida (coseno)
-- m=16, ef_construction=64 son buenos defaults para 768 dims
CREATE INDEX "chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX "memory_chunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

```bash
# Ejecutar la migración
npx prisma migrate dev --name activate_pgvector
```

---

### Paso 4 — Migrar datos existentes (JSON string → vector real)

Los chunks existentes tienen el embedding guardado como string JSON en `embeddingId`.
Hay que parsearlos y moverlos al nuevo campo `embedding`.

Crear script `scripts/migrate-embeddings.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateEmbeddings() {
  console.log('Migrando embeddings de Chunk...');

  const chunks = await prisma.chunk.findMany({
    where: { embeddingId: { not: null } },
    select: { id: true, embeddingId: true },
  });

  console.log(`Total chunks con embeddingId: ${chunks.length}`);
  let migrated = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const vec = JSON.parse(chunk.embeddingId!);
      if (!Array.isArray(vec) || vec.length !== 768) {
        console.warn(`Chunk ${chunk.id}: embedding inválido (dims: ${vec?.length})`);
        failed++;
        continue;
      }

      // Insertar usando $queryRaw porque Prisma no soporta vector nativo
      await prisma.$queryRaw`
        UPDATE "Chunk"
        SET "embedding" = ${vec}::vector
        WHERE "id" = ${chunk.id}
      `;

      migrated++;
      if (migrated % 100 === 0) console.log(`  ${migrated}/${chunks.length}...`);
    } catch (err) {
      console.warn(`Chunk ${chunk.id}: error - ${err.message}`);
      failed++;
    }
  }

  console.log(`✅ Chunks migrados: ${migrated}, fallidos: ${failed}`);

  // Repetir para MemoryChunk
  console.log('\nMigrando embeddings de MemoryChunk...');
  const memChunks = await prisma.memoryChunk.findMany({
    where: { embeddingId: { not: null } },
    select: { id: true, embeddingId: true },
  });

  let migratedMem = 0;
  for (const mc of memChunks) {
    try {
      const vec = JSON.parse(mc.embeddingId!);
      if (Array.isArray(vec) && vec.length === 768) {
        await prisma.$queryRaw`
          UPDATE "MemoryChunk"
          SET "embedding" = ${vec}::vector
          WHERE "id" = ${mc.id}
        `;
        migratedMem++;
      }
    } catch { /* skip */ }
  }

  console.log(`✅ MemoryChunks migrados: ${migratedMem}`);
  await prisma.$disconnect();
}

migrateEmbeddings();
```

```bash
npx ts-node scripts/migrate-embeddings.ts
```

---

## Paso 5 — Reescribir la búsqueda semántica

Una vez activado pgvector, reemplazar la búsqueda `contains` por búsqueda coseno.

**En `DocumentRepository`** — reemplazar `searchChunks()`:

```typescript
async searchChunksSemantic(query: string, embedding: number[], limit = 10) {
  // Búsqueda por similitud coseno con pgvector
  const results = await this.prisma.$queryRaw<Array<{
    id: number;
    documentId: number;
    content: string;
    similarity: number;
  }>>`
    SELECT
      c.id,
      c."documentId",
      c.content,
      1 - (c.embedding <=> ${embedding}::vector) AS similarity
    FROM "Chunk" c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `;

  return results;
}
```

**En `DocumentIngestService`** — guardar embedding nativo al crear chunks:

```typescript
// Reemplazar embeddingId (JSON string) por $queryRaw con vector nativo
await this.prisma.$queryRaw`
  UPDATE "Chunk"
  SET "embedding" = ${vec}::vector
  WHERE "id" = ${chunk.id}
`;
```

**En `JarvisService.buildJarvisContext()`** — usar búsqueda semántica:

```typescript
// ANTES:
const chunks = await this.documentRepo.searchChunks(userMessage, 3);

// DESPUÉS:
const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);
const chunks = await this.documentRepo.searchChunksSemantic(userMessage, queryEmbedding, 3);
```

---

## Impacto esperado

| Métrica | Antes (LIKE) | Después (pgvector) |
|---------|-------------|-------------------|
| Búsqueda "plantas antiinflamatorias" | Necesita la palabra exacta | Encuentra "anti-inflamatorio", "reduce inflamación" |
| Búsqueda "NestJS guard" | Necesita "guard" exacto | Encuentra "protección de endpoints", "autenticación middleware" |
| Recall@5 (estimado) | ~30-40% | ~70-85% |
| Latencia de búsqueda | ~5ms (LIKE) | ~8-15ms (HNSW) |
| Escala hasta | ~10k chunks cómodo | ~1M chunks cómodo |

---

## Checklist de ejecución

```
□ 1. Instalar pgvector en PostgreSQL (apt/brew/manual)
□ 2. CREATE EXTENSION IF NOT EXISTS vector;
□ 3. Modificar schema.prisma (Chunk + MemoryChunk)
□ 4. Crear migración con --create-only
□ 5. Editar SQL de migración: agregar índices HNSW
□ 6. Ejecutar migración: npx prisma migrate dev
□ 7. Ejecutar script de migración de datos
□ 8. Verificar: SELECT COUNT(*) FROM "Chunk" WHERE embedding IS NOT NULL;
□ 9. Actualizar DocumentRepository.searchChunks()
□ 10. Actualizar DocumentIngestService (guardar embedding nativo)
□ 11. Actualizar JarvisService.buildJarvisContext()
□ 12. Probar con: GET /jarbees/library/document/search?q=plantas antiinflamatorias
```

---

## Notas importantes

- `nomic-embed-text` genera vectores de **768 dimensiones** — verificar que `vector(768)` coincida con lo que devuelve Ollama antes de migrar.
- El índice **HNSW** es más rápido que IVFFlat para búsqueda aproximada pero requiere más memoria en construcción. Para un dataset personal (<100k chunks) es la mejor opción.
- Prisma **no soporta** el tipo `vector` nativamente todavía. Toda lectura/escritura del campo debe ser con `$queryRaw`. El campo `embeddingId String?` puede mantenerse como fallback legacy.
- Si querés usar `pgvector` con Prisma de forma más limpia, existe `@pgvector/prisma` como extensión unofficial — pero `$queryRaw` es suficiente para este caso de uso.
