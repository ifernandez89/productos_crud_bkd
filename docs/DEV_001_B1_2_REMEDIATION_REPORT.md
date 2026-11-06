# DEV-001-B1.2 — Informe de Remediación de Persistencia, Confinamiento y Aislamiento

> **Misión:** DEV-001-B1.2 — Cierre de Brechas de Persistencia y Confinamiento  
> **Rama de Aislamiento:** `security/dev-001-b`  
> **Commit Base:** `89993c777d55c56af788980d2d28ebdb95ede8c3`  
> **Fecha:** 2026-11-06  
> **Estado de Homologación:** ⚠️ **NO HOMOLOGADO (DETENIDO ANTE PUERTA DE REVISIÓN INDEPENDIENTE)**  
> **Estado de Fase B2:** 🛑 **BLOQUEADO (ESTRICTAMENTE PROHIBIDO AVANZAR A B2 SIN REVISIÓN INDEPENDIENTE)**

---

## 1. Resumen Ejecutivo y Alcance de B1.2

Tras los resultados de la auditoría de código `DEV-001-B1.1-REVIEW` y la posterior ejecución de la suite de integración HTTP real `DEV-001-B1-HOMOLOGATION`, se identificaron cinco (5) brechas críticas o arquitectónicas que impedían otorgar la homologación formal a la Fase B1:

1. **`A1`**: Lista blanca pública vulnerable a colisión de nombres de métodos (`AUTHORIZED_PUBLIC_HANDLERS` basada únicamente en el nombre de la función).
2. **`A2`**: Pérdida de estado anti-replay en `MobileGatewayService` ante reinicios efímeros de instancia o procesos distribuidos (vulnerabilidad demostrada empíricamente en test e2e `E9`).
3. **`F-B1-02`**: Pérdida del bloqueo progresivo contra fuerza bruta en `/auth/login` ante reinicios del proceso (demostrado empíricamente en test e2e `C4`).
4. **`F-B1-10`**: Riesgo de escape de confinamiento mediante enlaces simbólicos o *junctions* NTFS en componentes de directorios intermedios y ventana TOCTOU en lectura de assets 3D en `Studio3DController`.
5. **`A5`**: Ambigüedad en la clasificación de seguridad de `AssetSecurityService` (formato `.jb3d`), que emplea AES-256-CTR sin MAC con secreto estático.

En esta iteración **DEV-001-B1.2**, las cinco brechas han sido técnicamente cerradas en el código fuente, validadas con suites unitarias y e2e, y documentadas bajo los principios de *Zero Trust*, ejecución como máximo una vez (*at-most-once execution*), defensa en profundidad y aislamiento de fronteras.

---

## 2. Reconciliación del Conteo de Pruebas de Homologación

Durante la homologación HTTP previa (`DEV-001-B1-HOMOLOGATION`), la tabla del informe reportó 42 filas conceptuales mientras que la salida de Jest reportaba exactamente 40 pruebas ejecutadas.

**Causa identificada y reconciliada:**  
En la implementación real de `test/dev-001-b1-homologation.e2e-spec.ts`:
- **Sección C:** Los conceptos `C1` (Límite por minuto) y `C2` (Bloqueo progresivo tras 5 intentos) fueron unificados intencionalmente en un único bloque de prueba Jest:  
  `it('C1 & C2. Aplica bloqueo progresivo (429) tras 5 intentos consecutivos', ...)`
- **Sección D:** Los conceptos `D1` (Emisión de token HITL) y `D2` (Firma HMAC y expiración de token) fueron unificados en:  
  `it('D1 & D2. Solicitar y recibir token HITL firmado para LIBRARY_DELETE_DOCUMENT sobre #101', ...)`

Al sumar las pruebas individuales de Jest (A1–A9 [9] + B1–B5 [5] + C1/C2, C3, C4 [3] + D1/D2, D3, D4, D5, D6, D7, D8, D9 [8] + E1–E9 [9] + F1–F6 [6]), el total es **exactamente 40 pruebas en ejecución**. La discrepancia era puramente de nomenclatura en la tabla y ha quedado formalmente reconciliada.

---

## 3. Matriz de Remediación Técnica DEV-001-B1.2

| Ref | Vulnerabilidad / Hallazgo | Gravedad | Archivo Modificado | Remediación Implementada | Evidencia de Validación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`A1`** | Bypass de `@Public()` por colisión de nombres de métodos (`handlerName`) | **ALTA** | `src/jarvis/security/security-kernel-auth.guard.ts` | Reemplazo de lista por nombres simples por `AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES = Set(['AuthController.login', 'JarvisController.getInferenceStatus', 'MobileGatewayController.getHealth', 'GoogleAuthController.callback'])`. El guard extrae `${context.getClass().name}.${context.getHandler().name}` y falla cerrado (`403 Forbidden`) si no coincide exactamente. | Unit test 15 (`RogueController.login` / `callback` rechazados con 403) + e2e `B4`/`B5` PASS. |
| **`A2`** | Replay Attack tras reinicio del proceso en Mobile Gateway | **ALTA** | `src/mobile-gateway/mobile-gateway.service.ts` | Registro atómico y persistente en disco en `storage/security/mobile-replay/`. Uso de primitivas de SO `fs.openSync(path, O_CREAT \| O_EXCL)` con permisos `0o600`. Unicidad garantizada a nivel de kernel de archivos; precarga en arranque y purga automática de expirados. | Test e2e `E9` modificado: tras reinicio efímero, re-envío del mismo comando es RECHAZADO con `403 Forbidden` (`Ataque de repetición detectado`). |
| **`F-B1-02`** | Pérdida de bloqueo por fuerza bruta tras reinicio en `/auth/login` | **MEDIA-ALTA** | `src/auth/auth.service.ts` | Persistencia durable de buckets de fuerza bruta en `storage/security/auth-lockout/`. `initLockoutStore()` carga bloqueos activos al arrancar; borrado al expirar o tras login exitoso. | Test e2e `C4` modificado: tras reinicio de la app NestJS, el 6to intento sigue bloqueado con `429 Too Many Requests`. |
| **`F-B1-10`** | Symlink/Junction traversal y ventana TOCTOU en `Studio3DController` | **ALTA** | `src/jarvis/3d/controllers/studio-3d.controller.ts`<br>`src/jarvis/3d/services/asset-security.service.ts` | 1. `ensureNoSymlinksInPath`: inspección recursiva con `fs.lstatSync` de cada directorio intermedio.<br>2. Verificación estricta de `fs.realpathSync` tanto en origen como en destino.<br>3. Lector atómico anti-TOCTOU `readConfined3DFileBuffer`: apertura mediante `fs.openSync` y comparación estricta `fstatSync(fd).ino === lstatSync(path).ino` y `dev`. | Unit test 14 y 17 PASS + e2e `F3` y `F4` PASS. |
| **`A5`** | Ambigüedad de frontera criptográfica en `AssetSecurityService` (.jb3d) | **MEDIA** | `src/jarvis/3d/services/asset-security.service.ts` | Documentación arquitectónica explícita y anotaciones de frontera. Clasificación de `.jb3d` como ofuscación de conveniencia para cliente web Three.js sin MAC. Aislamiento estricto: el Security Kernel jamás delega autenticación ni autorización en este módulo. | Inspección de código y validación de tipos + unit test PASS. |

---

## 4. Detalle de Cambios en la Arquitectura

### 4.1. Firma Exacta Controller.handler en `SecurityKernelAuthGuard` (`A1`)
En versiones anteriores, un controlador rogue que declarara `@Public()` en un método denominado `callback` o `getInferenceStatus` podía ser autorizado debido a que la lista blanca comprobaba únicamente `AUTHORIZED_PUBLIC_HANDLERS.has(handler.name)`.  
En B1.2, se implementó:
```typescript
export const AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES = new Set<string>([
  'AuthController.login',                // POST /auth/login
  'JarvisController.getInferenceStatus',  // GET /jarbees/inference/status
  'MobileGatewayController.getHealth',   // GET /mobile/v1/health
  'GoogleAuthController.callback',       // GET /jarbees/google/callback (OAuth state firmado)
]);
```
En `canActivate`, se resuelve:
```typescript
const controllerName = context.getClass().name;
const handlerName = context.getHandler().name;
const signature = `${controllerName}.${handlerName}`;

if (isPublic) {
  if (!AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES.has(signature)) {
    throw new ForbiddenException(
      `SecurityKernel: el endpoint público "${signature}" no figura en la lista blanca de excepciones públicas autorizadas (Fail-Closed).`,
    );
  }
  return true;
}
```

### 4.2. Libro Mayor de Replay Atómico a Nivel de Sistema Operativo (`A2`)
Para garantizar la propiedad de *at-most-once execution* sin dependencias de red como Redis:
- Cada `requestId` se procesa calculando su hash SHA-256 canónico y generando una ruta en `storage/security/mobile-replay/<hash>.json`.
- La persistencia se efectúa mediante `fs.openSync(filePath, O_CREAT | O_EXCL | O_WRONLY, 0o600)`.
- Si el archivo ya existe (incluso tras un reinicio del proceso), el sistema operativo falla inmediatamente con código `EEXIST`, provocando una `ForbiddenException` inmediata.
- En el arranque del servicio, `pruneAndLoadPersistedReplayEntries()` recarga en memoria únicamente los identificadores cuyo TTL no haya expirado y purga los obsoletos.

### 4.3. Persistencia de Bloqueos en `/auth/login` (`F-B1-02`)
- La tabla de intentos fallidos y bloqueos progresivos se sincroniza en `storage/security/auth-lockout/<hash>.json`.
- En caso de reinicio de la instancia, el operador o atacante que haya superado los 5 intentos consecutivos (o que esté en ventanas de penalización de 5/15 minutos) continúa bloqueado con código HTTP `429 Too Many Requests`.

### 4.4. Confinamiento contra Symlinks/Junctions y Lector Anti-TOCTOU (`F-B1-10`)
- **Inspección de Segmentos:** `ensureNoSymlinksInPath` valida secuencialmente cada directorio padre desde `storage/assets` hasta el archivo solicitado con `fs.lstatSync`, abortando si detecta `isSymbolicLink()`.
- **Lector Anti-TOCTOU:** `readConfined3DFileBuffer` abre el descriptor de lectura (`fs.openSync`), obtiene sus metadatos internos (`fs.fstatSync(fd)`), los contrasta con los del sistema de archivos (`fs.lstatSync(safePath)`) validando que coincidan inodo y dispositivo y que no sea enlace, y lee el buffer a memoria desde el descriptor abierto.

### 4.5. Frontera y Aislamiento de `AssetSecurityService` (`A5`)
Se incorporaron advertencias claras en el código fuente de `AssetSecurityService`:
```typescript
/**
 * ⚠️ CLASIFICACIÓN DE FRONTERA DE SEGURIDAD (DEV-001-B1.2 A5):
 * - Este servicio constituye EXCLUSIVAMENTE una capa de conveniencia y ofuscación de
 *   assets 3D (.glb) para su consumo en el runtime cliente (Jarbees_the_game / Three.js).
 * - Utiliza AES-256-CTR con claves estáticas y NO implementa un código de autenticación de
 *   mensaje (MAC / HMAC / Poly1305). Por diseño criptográfico (maleabilidad de CTR),
 *   NO proporciona autenticidad ni integridad criptográfica contra adversarios activos.
 * - QUEDA TERMINANTEMENTE PROHIBIDO utilizar este servicio o el formato .jb3d para decisiones
 *   de autorización, autenticación o control de acceso en el backend.
 */
```

---

## 5. Resultados de Pruebas y Evidencia Empírica

### 5.1. Pruebas Unitarias de Hardening y Seguridad
Comando ejecutado:
```powershell
npx jest src/jarvis/security/dev-001-b1-security-hardening.spec.ts \
         src/jarvis/security/action-gatekeeper.service.spec.ts \
         src/jarvis/security/redacted-observability.service.spec.ts \
         src/shared/crypto-vault.service.spec.ts \
         src/google/google-auth.service.spec.ts \
         src/mobile-gateway/mobile-gateway.service.spec.ts \
         --runInBand --silent
```

**Resultado:**
- **Suites:** 6 passed, 6 total
- **Tests:** 70 passed, 70 total
- **Tiempo de ejecución:** 13.518 s
- **Incidencias:** 0 fallos

### 5.2. Suite de Integración HTTP Real (e2e Homologation)
Comando ejecutado:
```powershell
npx jest test/dev-001-b1-homologation.e2e-spec.ts --config ./test/jest-e2e.json --runInBand --silent
```

**Resultado:**
- **Suites:** 1 passed, 1 total
- **Tests:** 40 passed, 40 total
- **Tiempo de ejecución:** 16.386 s
- **Incidencias:** 0 fallos

**Comportamiento de las pruebas clave remediadas:**
- **`C4`:** Demostración de persistencia de bloqueo por fuerza bruta: tras reinicio completo de la aplicación NestJS, el intento continúa bloqueado con código `429 Too Many Requests` (`PASS`).
- **`E9`:** Demostración de persistencia anti-replay en Mobile Gateway: tras reinicio de la aplicación, el reenvío del mismo comando con idéntico `requestId` y firma dentro de la ventana de deriva es RECHAZADO con código `403 Forbidden` (`PASS`).

### 5.3. Verificación de Compilación y Tipado TypeScript
Comando ejecutado:
```powershell
npm run build
```
**Resultado:** Código de salida 0. Cero errores de compilación o tipado.

---

## 6. Estado de Homologación y Puerta de Control (Stop Criterion)

> [!CAUTION]
> **REGLA ESTRICTA DE GOBERNANZA AGÉNTICA:**  
> Como agente implementador de DEV-001-B1.2, **ESTÁ TERMINANTEMENTE PROHIBIDO auto-declarar homologada la Fase B1 o avanzar unilateralmente hacia la Fase B2**.  
> El presente informe se entrega como evidencia formal para que un auditor independiente ejecute la revisión `DEV-001-B1.2-REVIEW`.  
> 
> **Estado de Fase B1:** Pendiente de dictamen independiente.  
> **Estado de Fase B2:** Bloqueado.
