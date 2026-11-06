# DEV-001-B2.0.1 — Diseño del Modelo de Seguridad de Red y Prevención de SSRF

**Misión:** DEV-001-B2.0.1  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** DEV-001-B2.0 (Design Preliminar)  
**Estado:** Documento de Diseño y Validación Técnica (Sin cambios en código)

---

## 1. Fase 1: Modo Inicial Hermético (Offline / Local-First)

En cumplimiento de la **Decisión 2 (Opción A)** adoptada por el operador, la primera implementación del Execution Broker y de la Fase B2 operará bajo un **Modo Inicial Hermético**:

```
┌────────────────────────────────────────────────────────┐
│                   INTELLIGENCE PLANE                   │
│         Solicita: net:fetch_url / browser              │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                    EXECUTION BROKER                    │
│   POLÍTICA ACTIVA: HERMETIC_OFFLINE_MODE = TRUE        │
│                                                        │
│   ❌ RECHAZO DETERMINISTA INMEDIATO (403 FORBIDDEN):    │
│   "Operación de red saliente bloqueada por política    │
│    hermética de seguridad de la Fase B2."              │
└────────────────────────────────────────────────────────┘
```

### Reglas Inmutables del Modo Hermético:
1. **Cero Peticiones HTTP/HTTPS Autónomas:** Ni el LLM ni las herramientas del asistente pueden iniciar conexiones salientes a la web sin autorización explícita.
2. **Cero Conectividad a Localhost o Redes Privadas:** Bloqueo absoluto de cualquier intento de alcanzar interfaces locales (`127.0.0.1`, `localhost`, `::1`) o subredes de intranet.
3. **Navegador Confinado a Archivos Locales o Deshabilitado:** Si Playwright se utiliza para generar imágenes o diagnosticar WebGL (ej: `PngExporter`), solo puede cargar rutas locales seguras (`file:///` pre-validadas o `data:text/html`), sin acceso a la pila de red.
4. **Prohibición de Descargas:** Queda prohibida la descarga de cualquier archivo binario, ejecutable o paquete desde Internet.

---

## 2. Fase 2: Arquitectura de Cortafuegos Saliente y Lista Blanca Controlada

Cuando el operador autorice la transición hacia una lista blanca de dominios pre-aprobados, el sistema **no utilizará un cliente HTTP estándar**, sino un **Egress Firewall Gateway** diseñado para neutralizar ataques avanzados de red.

### 2.1. Anatomía de los Ataques de Red a Neutralizar

1. **DNS Rebinding (TOCTOU de Resolución):**  
   Un atacante controla el dominio `attacker.com`. La primera consulta DNS devuelve una IP pública legítima (`1.2.3.4`) con un TTL de 1 segundo. Inmediatamente después, el servidor DNS devuelve `127.0.0.1` o `192.168.1.1`. Si la aplicación valida la IP antes pero delega la conexión a un cliente HTTP que re-resuelve el dominio, la conexión real se realiza contra la IP interna.
2. **SSRF vía Redirecciones HTTP (Redirect Bypassing):**  
   La URL inicial `https://allowed-site.com/redirect?to=http://127.0.0.1:4000/api` está en lista blanca, pero el servidor responde con `302 Found` hacia una dirección interna protegida.
3. **Representaciones Anómalas de IPv4 e IPv6:**  
   Bypasses mediante notaciones hexadecimales (`0x7f000001`), decimales (`2130706433`), octales (`017700000001`), IPv6 mapeadas a IPv4 (`::ffff:127.0.0.1`, `[0:0:0:0:0:ffff:7f00:1]`) o direcciones locales de enlace (`fe80::/10`).

---

## 3. Especificación Técnica del Validador de Red en el Punto Efectivo de Conexión

Para prevenir DNS Rebinding y manipulación de IPs, la validación debe realizarse **en el momento exacto en que se abre el socket TCP**, interceptando la función `createConnection` del `http.Agent` y `https.Agent` de Node.js.

### 3.1. Algoritmo de Verificación de IP en Dual-Stack (IPv4 / IPv6)

```typescript
import * as net from 'net';
import * as dns from 'dns/promises';

// Rangos de IP estrictamente prohibidos (RFC 1918, RFC 3927, RFC 4193, Loopback, Multicast)
const BLOCKED_IP_RANGES = [
  // IPv4 Loopback
  { prefix: '127.', mask: 8 },
  // IPv4 Private (RFC 1918)
  { prefix: '10.', mask: 8 },
  { prefix: '172.16.', mask: 12 }, // 172.16.0.0 - 172.31.255.255
  { prefix: '192.168.', mask: 16 },
  // IPv4 Link-Local / Cloud Metadata (RFC 3927)
  { prefix: '169.254.', mask: 16 },
  // IPv4 Carrier-Grade NAT (RFC 6598)
  { prefix: '100.64.', mask: 10 },
  // IPv4 Broadcast / Current Network
  { prefix: '0.0.0.0', mask: 8 },
  { prefix: '255.255.255.255', mask: 32 },
];

export function isPrivateOrReservedIp(ip: string): boolean {
  // 1. Normalizar IPv6 mapeada a IPv4 (ej: ::ffff:127.0.0.1)
  let normalizedIp = ip;
  if (normalizedIp.startsWith('::ffff:')) {
    normalizedIp = normalizedIp.replace('::ffff:', '');
  }

  // 2. Comprobar IPv6 Loopback y Link-Local
  if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;
  if (normalizedIp.startsWith('fe80:') || normalizedIp.startsWith('fe90:') || 
      normalizedIp.startsWith('fea0:') || normalizedIp.startsWith('feb0:')) {
    return true; // IPv6 Link-Local
  }
  if (normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd')) {
    return true; // IPv6 Unique Local Address (ULA - RFC 4193)
  }

  // 3. Comprobar IPv4 contra lista negra de prefijos
  const family = net.isIP(normalizedIp);
  if (family === 4) {
    const parts = normalizedIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformada -> Bloqueada por Fail-Closed
    }

    const [a, b] = parts;
    if (a === 127) return true; // Loopback
    if (a === 10) return true;  // Private Class A
    if (a === 172 && b >= 16 && b <= 31) return true; // Private Class B
    if (a === 192 && b === 168) return true; // Private Class C
    if (a === 169 && b === 254) return true; // Link-Local / Metadata
    if (a === 0 || a >= 224) return true;    // Multicast / Reservado
  }

  return false;
}
```

---

### 3.2. Socket-Level Pinning: Agente HTTP Seguro Anti-DNS Rebinding

Para garantizar que la IP validada sea la misma que recibe la conexión TCP, se diseña un `SafePinnedAgent`:

```typescript
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as dns from 'dns/promises';

export class SafeNetworkDispatcher {
  private readonly allowedDomains: Set<string>;

  constructor(allowedDomains: string[] = []) {
    this.allowedDomains = new Set(allowedDomains.map((d) => d.toLowerCase()));
  }

  async createSafeConnection(
    options: http.ClientRequestArgs,
    onSocketReady: (err: Error | null, socket?: net.Socket) => void,
  ): Promise<void> {
    try {
      const hostname = options.hostname || options.host;
      if (!hostname || typeof hostname !== 'string') {
        throw new Error('SSRF_DENIED: Hostname ausente o inválido.');
      }

      const canonicalHost = hostname.toLowerCase();

      // 1. Validar lista blanca estricta de dominios
      if (this.allowedDomains.size > 0 && !this.allowedDomains.has(canonicalHost)) {
        throw new Error(`SSRF_DENIED: Dominio "${canonicalHost}" no está en la lista blanca autorizada.`);
      }

      // 2. Resolver DNS de forma previa y explícita
      const lookupResult = await dns.lookup(canonicalHost, { all: true });
      if (!lookupResult || lookupResult.length === 0) {
        throw new Error(`DNS_ERROR: No se pudo resolver la dirección de "${canonicalHost}".`);
      }

      // 3. Validar todas las IPs devueltas (A y AAAA)
      for (const record of lookupResult) {
        if (isPrivateOrReservedIp(record.address)) {
          throw new Error(`SSRF_DENIED: El dominio "${canonicalHost}" resolvió a una dirección privada/restringida (${record.address}).`);
        }
      }

      // 4. IP PINNING: Conectar directamente a la primera IP validada, fijando el SNI
      const pinnedIp = lookupResult[0].address;
      const port = Number(options.port) || (options.protocol === 'https:' ? 443 : 80);

      const socket = net.createConnection({
        host: pinnedIp,
        port,
        timeout: 5000,
      });

      onSocketReady(null, socket);
    } catch (err: any) {
      onSocketReady(err);
    }
  }
}
```

---

### 3.3. Control Estricto de Redirecciones HTTP (Redirect Handling)

Cualquier redirección (`301`, `302`, `307`, `308`) debe ser interceptada antes de seguirse:
1. **Límite de Redirecciones:** Máximo 3 saltos.
2. **Evaluación de Salto:** La URL del encabezado `Location` debe pasar por el ciclo completo de validación (`isPrivateOrReservedIp`, lista blanca de dominios y resolución DNS fija).
3. **Prohibición de Downgrade:** Prohibido redirigir de `https:` a `http:`.

---

### 3.4. Cuotas y Límites de Contenido Saliente

| Parámetro | Límite Estricto | Acción ante Infracción |
| :--- | :---: | :--- |
| **Tamaño Máximo de Descarga** | 5 MB | Abortar stream inmediatamente (`socket.destroy()`) |
| **Tipos MIME Permitidos** | `text/html`, `application/json`, `text/plain` | Rechazar binarios, `.exe`, `.dll`, `.zip`, `.sh` |
| **Timeout de Conexión (Connect)**| 3.000 ms | Abortar con `ETIMEDOUT` |
| **Timeout de Lectura (Read)** | 10.000 ms | Abortar con `ETIMEDOUT` |
| **Protocolos Permitidos** | `http:`, `https:` | Prohibir terminantemente `file:`, `ftp:`, `gopher:`, `ws:` |

---

## 4. Conclusión del Diseño de Red

El modelo de red diseñado proporciona dos líneas de defensa infranqueables:
1. **Fase Actual (B2.0/B2.1):** Hermetismo total sin tráfico saliente.
2. **Fase Futura (Lista Blanca):** Conexión mediada por socket pinning a nivel de kernel de red de Node.js, imposibilitando físicamente ataques de SSRF, DNS Rebinding y bypass por redirecciones.

