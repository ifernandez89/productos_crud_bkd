# Arquitectura de JarBees: Estado Actual, Posibilidades y Limitaciones

Esta documentación detalla el estado actual del asistente **JarBees**, diseñado como un sistema modular y autónomo sobre **NestJS** y **PostgreSQL**.

---

## 1. Diseño y Arquitectura Core

JarBees no es un simple wrapper de la API de un LLM. Está diseñado como un **Agente Cognitivo** con múltiples capas de procesamiento:

### 🧠 Sistema de Memoria de 5 Capas (Base de Datos)
El conocimiento de JarBees está persistido en PostgreSQL vía Prisma:
1. **Perfil de Usuario:** Información básica, idioma y zona horaria (`UserProfile`).
2. **Memoria Semántica (Permanente):** Hechos, preferencias y contexto histórico que el asistente aprende sobre el usuario (`Memory` y `MemoryChunk`).
3. **Historial y Resúmenes:** Guarda el progreso conversacional (`ConversationMessage`) y consolida sesiones largas en resúmenes para no agotar el contexto del LLM (`SessionSummary`).
4. **Conocimiento (RAG):** Documentos, PDFs o bases de conocimiento externas que el asistente puede consultar (`Document`, `KnowledgeSource`, `Collection`).
5. **Tareas (Planner):** Capacidad de descomponer un objetivo complejo en pasos ejecutables y trackear su progreso (`Task`, `TaskStep`).

### 🚦 Intent Router (Enrutador de Intenciones)
Antes de llamar al LLM, cada mensaje pasa por el `IntentRouterService`, que decide qué herramienta usar:
- **Fast Classify:** Reglas determinísticas ultra rápidas mediante expresiones regulares para detectar comandos directos (clima, matemáticas, calendario, url explícitas).
- **LLM Classify (Ollama):** Si la intención es ambigua, un modelo local pequeño (ej. Llama 3.2 3B) clasifica la intención de forma económica y veloz.

### 🛠️ Ecosistema de Herramientas (Tools)
Una vez detectada la intención, JarBees recolecta el contexto del mundo real a través de servicios especializados:
- **Web Browser (DuckDuckGo & Playwright):** Búsqueda web orgánica en tiempo real, enriquecimiento de consultas (ej. agregando "hoy") y scraping robusto con selectores adaptativos.
- **Content Cache:** Evita buscar en la web lo que ya se buscó recientemente, priorizando fuentes confiables.
- **Google Workspace (Módulo):** Conectores listos para Calendar y Tasks vía OAuth2.

### 🌐 Knowledge Acquisition Layer (Capa de Adquisición de Conocimiento)
Responsable de nutrir al agente con información del mundo exterior para que no dependa exclusivamente de lo que "aprendió" el LLM durante su entrenamiento. Esta arquitectura acerca a JarBees a sistemas modernos como AnythingLLM, Project Nomad o Mem0.
- **Búsqueda Web:** Extracción de datos en tiempo real.
- **RSS & Noticias:** Suscripción a feeds de actualidad.
- **APIs Externas:** Consumo de datos crudos (clima, deportes, finanzas).
- **Ingesta de Documentos (PDFs/TXTs):** Procesamiento de archivos locales.

### ⚡ Sistema de Skills (Capacidades Modulares)
Inspirado en ecosistemas como [skills.sh](https://www.skills.sh/), las *Skills* son paquetes modulares que se cargan dinámicamente en JarBees. No están "hardcodeadas" en el LLM, sino que se activan según la necesidad del usuario:
- **Astronomía:** Calcular fases lunares o eclipses.
- **Programación & NestJS / PostgreSQL:** Búsqueda rápida de documentación de tu stack.
- **Productividad:** Manejo de calendario y agendas.
- *Incluso capacidades futuras que aún no existen pueden conectarse como un plugin.*

### ⏰ Scheduled Jobs (Tareas Programadas Diarias)
Un sistema de cron-jobs o "Daily Jobs" permite que JarBees no sea solo un asistente reactivo (que espera tu pregunta), sino proactivo.
Ejemplos de procesos automáticos ejecutados periódicamente:
- **Resumen Matutino:** Enviarte un reporte diario a las 8 AM con las noticias, tu agenda y el clima.
- **Procesamiento Nocturno:** Leer, indexar y generar embeddings de los PDFs pesados mientras dormís.
- **Monitoreo de Noticias Tecnológicas:** Avisarte solo si detecta una actualización crítica de NestJS o PostgreSQL.

---

## 2. Posibilidades Actuales (Qué podemos hacer AHORA)

A pesar del bloqueo temporal con las credenciales de Google, JarBees es extremadamente funcional:

✅ **Búsqueda Web Autónoma y Gratuita:** 
Podés pedirle resúmenes de noticias, el clima, resultados deportivos o información actualizada. El sistema utilizará DuckDuckGo y scraping (que son **100% gratuitos y sin cuotas de API**) para inyectar información real al modelo.

✅ **Memoria y Contexto Persistente:**
Podés decirle *"Anotá que prefiero usar TypeScript"* y JarBees lo recordará en sesiones futuras.

✅ **Gestión Local de Tareas:**
Aunque no tengamos Google Tasks activo, el motor de `PlannerService` y la base de datos ya soportan la creación de Tareas y Subtareas de forma nativa. Podés usar JarBees para planificar proyectos localmente.

✅ **Respuestas Inteligentes Fallback:**
Si una página web local (como El Once) cambia su estructura, el WebHelper tiene mecanismos de fallback para leer el `<body>` y extraer el texto más relevante usando los keywords de tu pregunta.

✅ **Privacidad y Ahorro (Ollama):**
Podés correr todo el procesamiento confidencial y el Intent Routing usando modelos locales mediante Ollama, reservando OpenRouter/OpenAI solo para respuestas de alta complejidad.

---

## 3. Limitaciones Actuales

A continuación, las barreras y posibles deudas técnicas:

❌ **APIs Restringidas (Google Cloud):**
- **Bloqueo:** Sin una tarjeta vinculada a Google Cloud Console (aunque el uso sea gratuito), Google a veces bloquea la generación de credenciales OAuth2 para la pantalla de consentimiento de aplicaciones de terceros, impidiendo usar Google Calendar, Tasks y Drive.
- **Alternativa Temporal:** Crear un sistema de calendario/tareas interno en la base de datos de PostgreSQL para gestionar tu agenda localmente a través del chat, hasta que puedas habilitar las credenciales de Google.

❌ **Búsqueda Semántica Vectorial (RAG):**
- **Bloqueo:** El esquema de Prisma está preparado para embeddings (`embeddingId`), pero la extensión `pgvector` de PostgreSQL aún no está completamente cableada en el flujo de búsqueda, lo que significa que la búsqueda de documentos complejos por ahora depende de consultas más tradicionales.
- **Alternativa Temporal:** Filtrado de base de datos por palabras clave o resúmenes indexados.

❌ **Límites de Scraping (Anti-Bot):**
- **Bloqueo:** Sitios muy protegidos (como Twitter/X o Cloudflare) bloquearán el `BrowserToolService`.
- **Alternativa Temporal:** Uso de APIs no oficiales o fuentes de noticias en formato RSS.

---

## 💡 Próximos Pasos Recomendados (Sin Google)

Ya que Google está pausado, te sugiero las siguientes **Fases Alternativas** para seguir agregando valor inmediato:

1. **Planner y To-Do Interno:**
   Aprovechemos los modelos `Task` y `TaskStep` de Prisma para que JarBees administre tu agenda internamente. *"Agendame comprar leche"* → Se guarda en Postgres.
2. **Sistema de Ingesta RAG (Librería de Archivos):**
   Habilitar un endpoint para que le subas PDFs o archivos `.txt` y JarBees los lea y procese localmente, convirtiéndolo en un buscador experto de tus propios apuntes.
3. **Comandos de Sistema Operativo (PC Local):**
   Ya que está corriendo en tu máquina, podríamos darle a JarBees una herramienta para leer carpetas locales o ejecutar scripts de terminal.
