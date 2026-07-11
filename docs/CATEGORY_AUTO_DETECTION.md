# Sistema de Detección Automática de Categorías y Resúmenes Inteligentes

## Resumen

Este documento describe el sistema de **detección automática de categorías** para documentos/PDFs subidos al sistema y el **generador de resúmenes inteligentes** que combina información de múltiples documentos de una misma categoría.

## 🎯 Problema Resuelto

Antes, cuando un usuario subía un PDF, debía especificar manualmente la categoría. Ahora:

1. **El sistema detecta la categoría automáticamente** analizando el título y contenido del documento
2. **El usuario puede pedir resúmenes temáticos** como "resumen sobre plantas medicinales" y el sistema combina información de TODOS los documentos de esa categoría

## 🔍 Detección Automática de Categorías

### ¿Cómo funciona?

Cuando se sube un documento (PDF, texto, URL), el sistema sigue esta estrategia en cascada:

#### 1. Detección por Keywords (Rápido)
Primero intenta detectar la categoría usando un sistema de keywords en el **título**:

```typescript
// Ejemplo: "Manual de Plantas Medicinales" → detecta "plantas_medicinales"
```

Si no hay match en el título, analiza los **primeros 2000 caracteres del contenido**:

```typescript
// Busca keywords como "medicina", "hierba medicinal", "fitoterapia", etc.
```

#### 2. Clasificación con LLM (Fallback Inteligente)
Si no hay match de keywords, usa el **modelo de IA local** para clasificar:

```typescript
// El LLM analiza título + contenido y devuelve una categoría específica
// Ejemplo: "Este documento habla de programación en TypeScript" → "desarrollo"
```

#### 3. Fallback Final
Si el LLM no está disponible, extrae una categoría básica del título o usa "general".

### Categorías Detectables

El sistema reconoce automáticamente estas categorías (y más):

**Ciencias de la Salud:**
- `medicina`, `plantas_medicinales`, `salud`, `farmacologia`

**Ciencias Naturales:**
- `biologia`, `quimica`, `fisica`, `matematicas`
- `agricultura`, `veterinaria`, `ambiente`

**Tecnología:**
- `desarrollo`, `ia`, `tecnologia`, `ciberseguridad`

**Ciencias Sociales:**
- `economia`, `derecho`, `historia`, `filosofia`, `educacion`

**Arte y Cultura:**
- `literatura`, `arte`, `musica`, `cine`, `gastronomia`

**Otras:**
- `deportes`, `astronomia`, `astrologia`, `politica`, `turismo`

### Código de Detección

El código principal está en: `src/jarvis/library/document-ingest.service.ts`

```typescript
private async detectCategory(title: string, content: string): Promise<string> {
  // 1. Intentar detectar desde el título
  const categoryFromTitle = this.detectCategoryFromKeywords(title);
  if (categoryFromTitle) return categoryFromTitle;

  // 2. Intentar detectar desde el contenido (primeros 2000 chars)
  const categoryFromContent = this.detectCategoryFromKeywords(content.slice(0, 2000));
  if (categoryFromContent) return categoryFromContent;

  // 3. Fallback: usar LLM para clasificar
  return this.detectCategoryWithLLM(title, content.slice(0, 1500));
}
```

## 📚 Resúmenes Inteligentes por Categoría

### ¿Qué son?

Cuando el usuario pregunta:
```
"resumen sobre plantas medicinales"
```

El sistema:
1. Detecta que es una solicitud de resumen por categoría
2. Busca TODOS los documentos con `category='plantas_medicinales'`
3. Recupera los chunks más relevantes
4. Los combina de forma inteligente (balanceando información de diferentes documentos)
5. Genera un resumen coherente usando el LLM

### Ejemplos de Uso

**Resumen general de una categoría:**
```
Usuario: "resumen sobre plantas medicinales"
Sistema: [Combina info de 5 PDFs sobre plantas medicinales y genera resumen unificado]
```

**Resumen con query específica:**
```
Usuario: "información sobre desarrollo con TypeScript"
Sistema: [Busca en categoría "desarrollo" y filtra por "TypeScript"]
```

**Variantes aceptadas:**
- "qué dicen mis documentos de medicina"
- "mostrame información sobre agricultura"
- "busca en mis archivos de economía"
- "resumen de física cuántica"

### Endpoints Disponibles

#### 1. Subir PDF (con auto-detección)

**POST** `/jarbees/library/ingest/pdf`

```typescript
// Body (multipart/form-data)
{
  file: <PDF file>,
  title: "Manual de Fitoterapia",  // opcional
  category: "plantas_medicinales",  // opcional - se detecta automáticamente si no se envía
  source: "manual_universidad",     // opcional
  question: "qué plantas son antiinflamatorias?" // opcional
}

// Response
{
  success: true,
  documentId: 123,
  title: "Manual de Fitoterapia",
  category: "plantas_medicinales",  // detectada automáticamente
  chunks: 45,
  answer: "El documento menciona las siguientes plantas antiinflamatorias: ..."
}
```

#### 2. Subir Texto (con auto-detección)

**POST** `/jarbees/library/ingest/text`

```typescript
// Body
{
  title: "Introducción a TypeScript",
  content: "TypeScript es un superset de JavaScript...",
  category: "desarrollo"  // opcional - se detecta automáticamente
}

// Response
{
  success: true,
  documentId: 124,
  title: "Introducción a TypeScript",
  category: "desarrollo",  // detectada automáticamente
  chunks: 12
}
```

#### 3. Generar Resumen por Categoría

**POST** `/jarbees/library/category-summary`

```typescript
// Body
{
  category: "plantas_medicinales",
  query: "propiedades curativas",  // opcional - filtra chunks específicos
  maxChunks: 15                    // opcional - default 15
}

// Response
{
  success: true,
  category: "plantas_medicinales",
  documentsUsed: 5,
  chunksUsed: 15,
  summary: "Basándome en los documentos disponibles sobre plantas medicinales...",
  documentTitles: [
    "Manual de Fitoterapia",
    "Plantas Medicinales de Argentina",
    "Herbolaria Tradicional",
    ...
  ]
}
```

#### 4. Chat Integrado (Detección Automática)

**POST** `/jarbees/chat`

El sistema detecta automáticamente solicitudes de resumen por categoría:

```typescript
// Body
{
  message: "resumen sobre plantas medicinales",
  sessionId: "abc-123"
}

// El sistema automáticamente:
// 1. Detecta que es un resumen por categoría
// 2. Ejecuta CategorySummaryService
// 3. Devuelve respuesta combinada de múltiples documentos
```

## 🔧 Arquitectura Técnica

### Componentes Principales

1. **DocumentIngestService** (`src/jarvis/library/document-ingest.service.ts`)
   - Maneja la ingestión de PDFs, texto plano y URLs
   - Implementa la detección automática de categorías
   - Genera chunks y embeddings

2. **CategorySummaryService** (`src/jarvis/library/category-summary.service.ts`)
   - Genera resúmenes combinados de múltiples documentos
   - Balancea información de diferentes fuentes
   - Usa el LLM para sintetizar contenido coherente

3. **DocumentRepository** (`src/jarvis/repositories/document.repository.ts`)
   - Nuevos métodos:
     - `searchChunksByCategory(category, limit)`
     - `searchChunksByQueryAndCategory(query, category, limit)`
   - Tracking de uso de documentos

4. **IntentRouter** (`src/jarvis/tools/intent/intent-router.service.ts`)
   - Detecta solicitudes de resumen por categoría
   - Clasifica como intent `RAG`

5. **JarvisService** (`src/jarvis/jarvis.service.ts`)
   - Integra CategorySummaryService en el flujo conversacional
   - Intercepta solicitudes antes de búsqueda normal de chunks

## 📊 Flujo de Trabajo Completo

### Flujo 1: Subir PDF

```mermaid
Usuario sube PDF
    ↓
DocumentIngestService.ingestPdf()
    ↓
Extraer texto del PDF
    ↓
detectCategory(title, text)
    ├→ detectCategoryFromKeywords(title) → Match? → ✓ Categoría
    ├→ detectCategoryFromKeywords(content) → Match? → ✓ Categoría
    └→ detectCategoryWithLLM(title, content) → ✓ Categoría
    ↓
Guardar documento con categoría detectada
    ↓
Crear chunks + embeddings
    ↓
Respuesta al usuario con categoría detectada
```

### Flujo 2: Solicitar Resumen

```mermaid
Usuario: "resumen sobre plantas medicinales"
    ↓
IntentRouter → detecta RAG
    ↓
JarvisService.detectCategorySummaryRequest()
    ├→ isRequest: true
    └→ category: "plantas_medicinales"
    ↓
CategorySummaryService.generateCategorySummary()
    ↓
documentRepo.searchChunksByCategory("plantas_medicinales", 15)
    ↓
combineChunksIntelligently() → balancea chunks de diferentes docs
    ↓
generateSummaryWithLLM() → sintetiza con IA
    ↓
Respuesta: resumen unificado de N documentos
```

## 🚀 Ventajas del Sistema

1. **Cero fricción para el usuario**
   - No necesita pensar en categorías al subir documentos
   - Puede hacer preguntas naturales como "resumen sobre X"

2. **Detección inteligente y robusta**
   - Keywords (rápido) → LLM (preciso) → Fallback (seguro)
   - Maneja documentos en múltiples idiomas

3. **Resúmenes de alta calidad**
   - Combina información de múltiples fuentes
   - Balancea contenido para evitar sesgos hacia un solo documento
   - Cita las fuentes consultadas

4. **Escalable**
   - Fácil agregar nuevas categorías (solo keywords)
   - El LLM aprende nuevas categorías sin cambios de código

## 📝 Ejemplos de Uso Real

### Ejemplo 1: Investigación Médica

```bash
# 1. Subir varios PDFs sobre medicina
curl -X POST /jarbees/library/ingest/pdf \
  -F "file=@plantas_medicinales_vol1.pdf" \
  -F "title=Plantas Medicinales Vol 1"
# → Sistema detecta: category="plantas_medicinales"

curl -X POST /jarbees/library/ingest/pdf \
  -F "file=@fitoterapia_avanzada.pdf"
# → Sistema detecta: category="plantas_medicinales"

# 2. Pedir resumen combinado
curl -X POST /jarbees/library/category-summary \
  -d '{"category": "plantas_medicinales"}'
# → Sistema devuelve resumen unificado de ambos PDFs
```

### Ejemplo 2: Desarrollo de Software

```bash
# Subir documentación
curl -X POST /jarbees/library/ingest/text \
  -d '{
    "title": "NestJS Best Practices",
    "content": "NestJS es un framework..."
  }'
# → Sistema detecta: category="desarrollo"

# Conversar naturalmente
curl -X POST /jarbees/chat \
  -d '{
    "message": "resumen sobre desarrollo con NestJS"
  }'
# → Sistema genera resumen automáticamente
```

## 🔮 Futuras Mejoras

1. **Embeddings semánticos** para categorización más precisa
2. **Multi-categoría** (un documento puede pertenecer a varias categorías)
3. **Auto-sugerencia de categorías** al usuario antes de guardar
4. **Taxonomía jerárquica** (ej: medicina > plantas_medicinales > antiinflamatorias)
5. **Detección de idioma** para mejorar la clasificación

## 📚 Referencias

- Código fuente: `src/jarvis/library/`
- Tests: `src/jarvis/library/*.spec.ts` (TODO)
- API Docs: `/api/docs` (Swagger)
