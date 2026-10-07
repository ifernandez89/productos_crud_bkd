# 📘 Guía de Integración Frontend: Selector de Especialistas y Disciplinas

Esta guía detalla cómo el frontend debe comunicarse con el backend de JarBees y qué componentes de interfaz (UI) debe exponer para soportar la arquitectura modular por disciplinas.

---

## 1. 🎛️ Componente Principal de UI: Selector de Especialistas

El frontend debe mostrar un selector accesible (pestañas, barra de pills, menú desplegable o barra lateral) que permita al usuario cambiar de modo o especialista según la tarea.

### Especialistas Disponibles

| Etiqueta (`mode`) | Nombre en UI | Icono | Descripción corta | Modelo Asociado en Back |
| :--- | :--- | :---: | :--- | :--- |
| `chatbot` | **Chat General** | 💬 | Conversación fluida, razonamiento cotidiano y asistencia general libre. | `qwen2.5:7b` |
| `coder` | **Código & Dev** | 💻 | Programación, debugging, refactorización y arquitectura. | `qwen2.5-coder:7b` |
| `traductor` | **Traductor** | 🌐 | Traducción directa y rápida de textos, párrafos o subtítulos. | `RogerBen/hy-mt1.5-1.8b:latest` |
| `reader` | **Lector en Voz Alta** | 🎙️ | Lectura de libros y PDFs optimizada para síntesis de audio (TTS). | `sematre/orpheus:it_es-3b` |
| `ocr` | **PDF / OCR** | 📄 | Extracción de texto, escaneo y resumen de documentos. | `yemifo/qwen25-vl-3b-q4km:latest` |
| `video` | **Video Analysis** | 🎬 | Análisis de frames, descripción visual y multimedia. | `yemifo/qwen25-vl-3b-q4km:latest` |
| `rag` | **Búsqueda RAG** | 🔎 | Recuperación vectorial sobre documentos y memoria permanente. | `bge-m3:latest` |
| `planner` | **JarBees Planner** | 🧠 | Descomposición y ejecución multi-paso de objetivos complejos. | JarBees Execution Engine |
| `tools` | **Herramientas** | 🛠️ | Acciones reales (Google Calendar, Tasks, Gmail, Clima, Web). | Tool Execution Engine |
| `auto` | **Automático (Router)** | 🧭 | Detección inteligente automática según la pregunta. | `llama3.2:3b` / Heurística |

---

## 2. 🔌 Comunicación con la API

### A. Obtener el Catálogo de Especialistas (Al iniciar la UI)

Permite al frontend construir dinámicamente el selector sin hardcodear opciones.

```http
GET /aichat/disciplines
# o también:
GET /jarbees/disciplines
```

**Ejemplo de Respuesta:**
```json
{
  "success": true,
  "disciplines": [
    {
      "id": "chatbot",
      "name": "Chat General",
      "icon": "💬",
      "category": "Conversación",
      "model": "qwen2.5:7b",
      "description": "Conversación fluida, razonamiento cotidiano y asistencia general.",
      "suggestedPrompt": "Hola, ¿en qué me puedes ayudar hoy?",
      "tags": ["chat", "asistente", "general"]
    },
    {
      "id": "coder",
      "name": "Código & Desarrollo",
      "icon": "💻",
      "category": "Programación",
      "model": "qwen2.5-coder:7b",
      "description": "Programación, debugging, refactorización, tipado estricto y arquitectura.",
      "suggestedPrompt": "Escribe una función en TypeScript para validar...",
      "tags": ["code", "programacion", "typescript", "nestjs"]
    }
  ]
}
```

---

### B. Enviar Mensajes / Consultas

El frontend envía la consulta incluyendo la propiedad `mode` según la opción activa en el selector.

#### Endpoint Estándar: `POST /aichat/preguntar`

```http
POST /aichat/preguntar
Content-Type: application/json

{
  "pregunta": "¿Cómo implementar un interceptor de logging en NestJS?",
  "mode": "coder",
  "sessionId": "b6a8f129-3890-449e-b7fb-6d7c48924bcf"
}
```

#### Endpoint JarBees Core: `POST /jarbees/query`

```http
POST /jarbees/query
Content-Type: application/json

{
  "message": "Resume el último documento subido a la biblioteca",
  "mode": "ocr",
  "sessionId": "b6a8f129-3890-449e-b7fb-6d7c48924bcf"
}
```

---

## 3. 💡 Recomendaciones de UX en el Frontend

1. **Estado Persistente de Modo**:
   - Guardar el último `mode` seleccionado en `localStorage` para que se conserve al recargar.
   - Si no hay modo guardado, usar `'auto'` o `'chatbot'` por defecto.

2. **Placeholder y Sugerencias Dinámicas**:
   - Al cambiar de modo, actualizar el placeholder del input de texto con el campo `suggestedPrompt` devuelto por `/aichat/disciplines`.
   - Ejemplo en `coder`: *"Escribe una función en TypeScript para..."*
   - Ejemplo en `traductor`: *"Pega el texto a traducir..."*

3. **Renderizado Especializado de Respuestas**:
   - Si `mode === 'coder'`, habilitar syntax highlighting para bloques de código con botón "Copiar".
   - Si `mode === 'reader'`, mostrar controles de audio/reproducción TTS si están habilitados.
   - Si `mode === 'chatbot'`, renderizado Markdown limpio y fluido.
