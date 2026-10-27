# Incidente Post-Mórtem: Crasheo OOM de Ventana IDE y Falla de Memoria en Tests Jest

**Fecha del Incidente:** 27 de Octubre de 2026  
**Hora de Eventos:** 19:12:22 UTC-3 (Primer colapso) / 19:13:10 UTC-3 (Segundo colapso)  
**Severidad:** Alta (Interrupción de entorno de trabajo e interfaz de usuario)  
**Estado:** Resuelto y Mitigado  
**Servicio Afectado:** Antigravity IDE (Electron Renderer Process) / Backend Test Runner (`productos_crud_bkd`)

---

## 1. Resumen Ejecutivo

Durante la ejecución de validaciones y pruebas de regresión en el backend, la ventana principal de la interfaz de desarrollo (Antigravity IDE) colapsó repentinamente mostrando el siguiente cuadro de diálogo crítico:

```text
Antigravity IDE
The window terminated unexpectedly (reason: 'oom', code: '536870904')
We are sorry for the inconvenience. You can reopen the window to continue where you left off.
[ ] Don't restore editors
[Reopen] [Close]
```

Menos de 50 segundos después, tras presionar `Reopen` sin modificar las opciones, la ventana volvió a colapsar de manera idéntica. 

El análisis técnico demostró que:
1. **La memoria física del equipo anfitrión estaba en perfecto estado:** El sistema disponía de **32 GB de RAM total con más de 27 GB libres**.
2. **El colapso fue estrictamente a nivel de proceso (Heap de V8/Chromium):** Se combinaron dos factores: una explosión de workers paralelos de Jest (`ts-jest`) que agotaron el heap de Node.js a más de 2.4 GB por proceso, y una conversación de chat con más de 930 turnos de mensajes, diffs y logs extensos que superó el límite de memoria del visor web de Electron.

---

## 2. Cronología Detallada de los Eventos

| Hora (Local) | Evento Registrado | Fuente de Registro |
| :--- | :--- | :--- |
| **19:06:21** | Se lanza `npm test` en segundo plano desde el asistente para verificar los cambios de `jarvis.service.ts`. | `transcript.jsonl` (Paso 906) |
| **19:07:34** | Jest inicia 15 suites de pruebas en paralelo utilizando todos los núcleos lógicos de la CPU. | Jest Runner Task 911 |
| **19:10:12** | Los workers de Jest comienzan a consumir >2.3 GB de heap cada uno compilando TypeScript al vuelo. | `task-911.log` |
| **19:12:22** | Primer crasheo: La ventana de Antigravity IDE muere por `oom`. El proceso de renderizado excede el tope de memoria de Chromium (`code: -536870904`). | `main.log` (Línea 24) |
| **19:12:46** | Se reabre la ventana (`window2`) intentando restaurar automáticamente todas las pestañas y el chat saturado. | `main.log` / `window2/renderer.log` |
| **19:13:07** | Worker de Jest falla con `FATAL ERROR: NewSpace::EnsureCurrentCapacity Allocation failed - JavaScript heap out of memory`. | `task-911.log` |
| **19:13:10** | Segundo crasheo inmediato: `CodeWindow: renderer process gone (reason: oom, code: -536870904)` a 24 segundos de reabrirse. | `main.log` (Línea 28) |
| **19:13:51** | El usuario inicia un nuevo hilo reportando la recurrencia ("otra vvezzz"). | Chat actual |

---

## 3. Diagnóstico de Causa Raíz (Root Cause Analysis)

### Factor A: Explosión de Concurrencia en Jest (`ts-jest`)
* Por defecto en `package.json`, el comando era `"test": "jest"`. En estaciones con múltiples núcleos (8-16 hilos), Jest instancia automáticamente `(CPUs - 1)` procesos trabajadores independientes.
* Cada worker ejecuta `ts-jest`, compilando en tiempo real las definiciones completas de TypeScript de NestJS, decoradores y módulos de Prisma.
* Como resultado, múltiples workers alcanzaron simultáneamente el techo de ~2.4 GB de heap asignado por Node.js (`allocation failure`). Cuatro suites fallaron con procesos forzadamente terminados por el sistema operativo (`SIGTERM`).

### Factor B: Sobrecarga del DOM en el Renderer de Electron
* El hilo de conversación con el asistente superó los **930 turnos de interacción** y más de 1.3 MB de datos JSON en disco.
* Cada turno contenía bloques de código resaltado con Prism/Monaco, visualizadores de diferencias Git y transcripciones completas de terminal.
* En Electron, el proceso que dibuja la interfaz (Renderer) es un proceso Chromium con un límite interno de Heap de JavaScript de 2 a 4 GB. Al intentar renderizar o mantener en memoria todo el historial acumulado más las pestañas abiertas, el proceso de renderizado agotó su memoria y abortó con `RESULT_CODE_OUT_OF_MEMORY` (`536870904` / `0x20000000`).

### Factor C: El Bucle de Restauración ("Reopen" sin limpiar)
* Al producirse el fallo, la IDE ofrece reabrir restaurando la sesión anterior.
* Al pulsar `Reopen` sin tildar `Don't restore editors`, Electron intenta recrear inmediatamente todos los componentes pesados en la nueva ventana, provocando que vuelva a exceder el heap en menos de un minuto.

---

## 4. Medidas Correctivas y Preventivas Aplicadas

### 1. Blindaje en `package.json`
Se actualizaron los scripts y la configuración de Jest para garantizar **ejecución serial estricta**:
```json
{
  "scripts": {
    "test": "jest --runInBand",
    "test:watch": "jest --watch --runInBand",
    "test:cov": "jest --coverage --runInBand"
  },
  "jest": {
    "maxWorkers": 1
  }
}
```
* **Impacto:** Ningún comando de test podrá volver a instanciar workers paralelos que compitan por gigabytes de memoria. La ejecución serial consume una fracción mínima de RAM (~350 MB) y finaliza de manera limpia y predecible.

### 2. Creación de Skill Interna para JarBees (`skills/testing-safety`)
Se creó e indexó en el motor cognitivo de JarBees la skill:
* **Archivo de Metadata:** [`skills/testing-safety/metadata.json`](file:///c:/Projects/productos_crud_bkd/skills/testing-safety/metadata.json)
* **Directivas de Comportamiento:** [`skills/testing-safety/skill.md`](file:///c:/Projects/productos_crud_bkd/skills/testing-safety/skill.md)
* Contiene instrucciones precisas para que JarBees conozca la diferencia entre memoria física y heap de V8, exija siempre `--runInBand`, aplique mockeos a llamadas de inferencia LLM y realice el teardown adecuado de temporizadores y conexiones.

### 3. Reglas Permanentes de Proyecto ([`.agents/AGENTS.md`](file:///c:/Projects/productos_crud_bkd/.agents/AGENTS.md))
Se formalizó la sección `## Testing & Resource Safety Rules (Anti-OOM)` con directivas obligatorias para cualquier modelo o agente de IA que opere sobre el repositorio:
* Ejecución serial forzosa en tests.
* Prohibición de volcado indiscriminado de payloads masivos a la terminal.
* Liberación obligatoria de temporizadores (`.unref()`) y cierre de conexiones en `afterAll`.

---

## 5. Protocolo de Usuario Ante Ocurrencias Futuras

1. Si la ventana de la IDE muestra el diálogo `reason: 'oom'`:
   * Marcar la casilla **`☑ Don't restore editors`** antes de pulsar **`[Reopen]`**.
2. Evitar extender una misma sesión de chat más allá de 300 turnos; iniciar una nueva conversación cuando se cambie de tarea o tema.
3. Ejecutar siempre pruebas unitarias usando `npm test` (que ahora incluye `--runInBand` por defecto) o especificando el archivo puntual:
   ```powershell
   npm test -- src/jarvis/skills/skill-registry.service.spec.ts
   ```
