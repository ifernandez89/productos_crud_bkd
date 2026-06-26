# Módulo de Autenticación JWT

Sistema de autenticación simple con contraseña única + JWT + rate limiting para JarBees.

## Arquitectura

```
Frontend
  ↓ POST /auth/login { password }
  ← { access_token: "jwt...", expires_in: "30d" }
  
Frontend (guarda token en localStorage)
  ↓ POST /jarbees/query + Authorization: Bearer <token>
  ↓ JwtAuthGuard verifica token
  ↓ Request llega al controller
```

## Componentes

### AuthModule
Configura JWT y Passport con variables de entorno.

### AuthService
- `login(password)` — valida contraseña maestra, emite JWT
- `verifyPayload()` — valida payload del token

### AuthController
- `POST /auth/login` — endpoint público que devuelve JWT

### JwtStrategy
Estrategia Passport que:
- Extrae token del header `Authorization: Bearer <token>`
- Verifica firma con `JWT_SECRET`
- Verifica expiración

### JwtAuthGuard
Guard global que protege todos los endpoints excepto los marcados con `@Public()`.

### @Public() decorator
Decorador para marcar endpoints públicos (sin autenticación).

Ejemplo:
```typescript
@Public()
@Get('health')
healthCheck() {
  return { ok: true };
}
```

## Variables de entorno

```env
MASTER_PASSWORD="tu-contraseña-segura"
JWT_SECRET="secret-aleatorio-de-64-chars"
JWT_EXPIRES_IN="30d"
```

Generar JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Uso en nuevos endpoints

### Endpoint protegido (default)
```typescript
@Get('protected')
someEndpoint() {
  // Este endpoint requiere JWT automáticamente
  return { data: 'sensitive' };
}
```

### Endpoint público
```typescript
@Public()
@Get('public')
healthCheck() {
  // Este endpoint NO requiere JWT
  return { ok: true };
}
```

### Acceder al usuario autenticado
```typescript
@Get('me')
getProfile(@Request() req) {
  // req.user contiene { userId, role } del JWT payload
  return req.user;
}
```

## Rate Limiting

Configurado globalmente en `AppModule`:
- **Default**: 100 req/minuto
- **Strict**: 10 req/minuto (opcional con decorador)

### Aplicar límite estricto a un endpoint
```typescript
import { Throttle } from '@nestjs/throttler';

@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post('expensive-operation')
slowEndpoint() {
  return { ok: true };
}
```

### Excluir un endpoint del rate limiting
```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Get('unlimited')
noLimitEndpoint() {
  return { ok: true };
}
```

## Testing con curl

```bash
# 1. Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"tu-contraseña"}'

# Response: { "access_token": "eyJ...", "expires_in": "30d" }

# 2. Usar token en request protegida
curl -X POST http://localhost:4000/jarbees/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{"message":"Hola","sessionId":"test"}'
```

## Respuestas de error

### 401 Unauthorized - Sin token
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 401 Unauthorized - Contraseña incorrecta
```json
{
  "statusCode": 401,
  "message": "Contraseña incorrecta",
  "error": "Unauthorized"
}
```

### 429 Too Many Requests - Rate limit excedido
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

## Seguridad

### ✅ DO
- Usar HTTPS en producción
- Generar `JWT_SECRET` aleatorio fuerte (64+ chars)
- Usar contraseña maestra segura
- Rotar `JWT_SECRET` si se compromete
- Mantener `JWT_EXPIRES_IN` razonable (7-30 días)

### ❌ DON'T
- Exponer `JWT_SECRET` en código o logs
- Commitear `.env` con secrets reales
- Usar contraseñas débiles en producción
- Confiar en el payload del JWT sin verificar la firma

## Migración futura (multi-usuario)

Esta arquitectura escala fácilmente:

1. Agregar tabla `users` en Prisma:
```prisma
model User {
  id       String @id @default(uuid())
  email    String @unique
  password String
  role     String
}
```

2. Cambiar `AuthService.login()`:
```typescript
async login(email: string, password: string) {
  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new UnauthorizedException();
  }
  const payload = { sub: user.id, email: user.email, role: user.role };
  return { access_token: this.jwt.sign(payload) };
}
```

3. Ya está. El resto del sistema (guards, strategy, controllers) no cambia.

## Documentación completa

Ver `docs/FRONTEND_AUTH_INTEGRATION.md` para integración con frontend (React, Next.js, vanilla JS).
