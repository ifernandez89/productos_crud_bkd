# Skill: Seguridad y Eficiencia de Ejecución y Testing (Anti-OOM)

Esta skill proporciona las directivas obligatorias para JarBees al diseñar, ejecutar, analizar y diagnosticar pruebas unitarias, de integración y benchmarks en el backend de `productos_crud_bkd`.

---

## 1. Principio Fundamental de Recursos (Heap vs RAM)

* **Separación de capas:** El sistema operativo anfitrión puede disponer de abundante memoria física libre (ej: 32 GB RAM con 27 GB libres), pero los procesos individuales de Node.js y los procesos renderer de Electron (Antigravity IDE) tienen **techos estrictos de Heap en V8** (por defecto entre 2 GB y 4 GB).
* **Sobrecarga de ts-jest:** Compilar TypeScript al vuelo para múltiples suites de prueba en paralelo multiplica el consumo de memoria por cada worker. Si Jest instancia 4 a 8 workers concurrentes, cada worker consume ~2.5 GB, detonando `Allocation failed - JavaScript heap out of memory`.
* **Saturación del Renderizador:** Al generar miles de líneas de output en terminal durante pruebas masivas concurrentes, el visor web de la IDE acumula nodos en el DOM hasta disparar el error fatal `The window terminated unexpectedly (reason: 'oom', code: '536870904')`.

---

## 2. Directivas Obligatorias de Testing

1. **Ejecución Serial Estricta (`--runInBand` / `maxWorkers: 1`):**
   * Toda ejecución de pruebas unitarias o de integración debe realizarse en un único proceso o con `maxWorkers: 1`.
   * Comando canónico: `npm test -- --runInBand` o filtrando por suite específica: `npm test -- --runInBand src/ruta/al/archivo.spec.ts`.
   * **PROHIBIDO** lanzar `jest` desatendido sin límite de workers en background si hay servicios locales de IA activos (Ollama, llama-server).

2. **Aislamiento de Modelos y Mocking:**
   * En pruebas unitarias de servicios dependientes de LLMs (`InferenceGatewayService`, `EmbeddingsService`, `JarvisService`), **mockear siempre** las llamadas de red externas a Ollama o llama-server a menos que sea un test de integración explícitamente etiquetado como E2E local.
   * Si Ollama o llama-server no están levantados en el puerto esperado, el test debe fallar limpiamente con aserción controlada y no quedar en bucles de reintento infinito que saturen el event loop.

3. **Cierre de Temporizadores y Conexiones Abiertas (Teardown):**
   * Todo servicio que utilice `setInterval`, `setTimeout`, o conexiones a Prisma/WebSocket debe ser destruido explícitamente en el bloque `afterEach` o `afterAll` (`onModuleDestroy`).
   * Evitar "tests leaking due to improper teardown" llamando a `.unref()` en temporizadores de fondo.

4. **Tratamiento del Buffer de Logs:**
   * En pruebas que iteran sobre múltiples casos (como `general-intelligence-trials`), no volcar payloads completos de respuestas o embeddings gigantescos al stdout.
   * Utilizar logs concisos (`[test:ok]`, métricas resumidas) para proteger el buffer del terminal y la memoria de la IDE.

---

## 3. Protocolo de Recuperación ante Incidentes OOM

Si una ventana de desarrollo o un subproceso colapsa por `oom`:
1. **En la IDE:** Marcar siempre `[x] Don't restore editors` antes de reabrir para descartar estados de memoria corruptos o búferes saturados.
2. **Ciclo de Chat:** Finalizar hilos de conversación con más de 300-500 turnos creando un nuevo chat limpio para prevenir fugas de DOM en Electron.
3. **Procesos Huérfanos:** Verificar con el sistema operativo que no hayan quedado workers de Node o Jest en estado zombi consumiendo ciclos de CPU o memoria en segundo plano.
