# Integración de Autenticación JWT en Frontend

Este documento describe cómo integrar la autenticación JWT del backend JarBees en tu aplicación frontend (Next.js, React, o cualquier otro).

## Flujo de autenticación

```
Usuario → Login (password) → Backend JWT → LocalStorage → Todas las requests
```

## Endpoints del backend

### 1. `POST /auth/login` (público)

Autentica con la contraseña maestra y devuelve un JWT.

**Request:**
```typescript
POST http://localhost:4000/auth/login
Content-Type: application/json

{
  "password": "tu-contraseña-maestra"
}
```

**Response exitosa (200):**
```typescript
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": "30d"
}
```

**Response error (401):**
```typescript
{
  "statusCode": 401,
  "message": "Contraseña incorrecta",
  "error": "Unauthorized"
}
```

### 2. Todos los demás endpoints (protegidos)

Requieren header `Authorization: Bearer <token>`.

**Request protegida:**
```typescript
POST http://localhost:4000/jarbees/query
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "message": "¿Qué noticias hay hoy?",
  "sessionId": "uuid-here"
}
```

**Response sin token (401):**
```typescript
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## Implementación en el frontend

### Opción 1: Vanilla JavaScript / TypeScript

```typescript
// auth.ts
const API_URL = 'http://localhost:4000';

export async function login(password: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error('Contraseña incorrecta');
  }

  const { access_token, expires_in } = await response.json();
  
  // Guardar en localStorage
  localStorage.setItem('jarbees_token', access_token);
  localStorage.setItem('jarbees_token_expires', expires_in);
  
  return access_token;
}

export function getToken(): string | null {
  return localStorage.getItem('jarbees_token');
}

export function logout(): void {
  localStorage.removeItem('jarbees_token');
  localStorage.removeItem('jarbees_token_expires');
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
```

```typescript
// api.ts
import { getToken } from './auth';

const API_URL = 'http://localhost:4000';

export async function queryJarbees(message: string, sessionId: string) {
  const token = getToken();
  
  if (!token) {
    throw new Error('No autenticado');
  }

  const response = await fetch(`${API_URL}/jarbees/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message, sessionId }),
  });

  if (response.status === 401) {
    // Token expirado o inválido
    logout();
    throw new Error('Sesión expirada');
  }

  return response.json();
}
```

### Opción 2: React con Context

```typescript
// AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Cargar token desde localStorage al iniciar
    const savedToken = localStorage.getItem('jarbees_token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const login = async (password: string) => {
    const response = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      throw new Error('Contraseña incorrecta');
    }

    const { access_token } = await response.json();
    localStorage.setItem('jarbees_token', access_token);
    setToken(access_token);
  };

  const logout = () => {
    localStorage.removeItem('jarbees_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{
      token,
      login,
      logout,
      isAuthenticated: token !== null
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
```

```typescript
// LoginPage.tsx
import { useState } from 'react';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(password);
      // Redirigir al chat
      window.location.href = '/chat';
    } catch (err) {
      setError('Contraseña incorrecta');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña maestra"
        minLength={4}
      />
      <button type="submit">Entrar</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
```

```typescript
// useFetch.ts - Hook personalizado con auth
import { useAuth } from './AuthContext';

export function useAuthFetch() {
  const { token, logout } = useAuth();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    if (!token) {
      throw new Error('No autenticado');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error('Sesión expirada');
    }

    return response;
  };

  return authFetch;
}
```

### Opción 3: Next.js con Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('jarbees_token')?.value;

  // Si no hay token y no es la página de login, redirigir
  if (!token && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Si hay token y está en login, redirigir al chat
  if (token && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

```typescript
// app/api/jarbees/route.ts (API Route con proxy)
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('jarbees_token')?.value;
  
  if (!token) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const body = await request.json();

  const response = await fetch('http://localhost:4000/jarbees/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  return Response.json(await response.json(), { status: response.status });
}
```

## Cambios necesarios en el frontend existente

Si ya tienes un frontend funcionando, estos son los cambios mínimos:

### 1. Agregar pantalla de login

Crear un componente/página que:
- Pida la contraseña maestra
- Llame a `POST /auth/login`
- Guarde el token en `localStorage` o `cookies`

### 2. Agregar header Authorization a todas las requests

**Antes:**
```typescript
fetch('http://localhost:4000/jarbees/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, sessionId }),
})
```

**Después:**
```typescript
const token = localStorage.getItem('jarbees_token');

fetch('http://localhost:4000/jarbees/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ message, sessionId }),
})
```

### 3. Manejar token expirado

Cuando el backend devuelva 401, limpiar el token y redirigir al login:

```typescript
if (response.status === 401) {
  localStorage.removeItem('jarbees_token');
  window.location.href = '/login';
}
```

## Rate Limiting

El backend tiene configurado rate limiting de **100 requests por minuto**.

Si superas el límite, recibirás:
```typescript
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

En el frontend puedes:
1. Mostrar un mensaje amigable: "Muchas consultas, esperá unos segundos"
2. Implementar retry con backoff exponencial
3. Deshabilitar el botón de envío temporalmente

```typescript
async function sendWithRetry(message: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(/* ... */);
    
    if (response.status === 429) {
      // Esperar 2^i segundos antes de reintentar
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Rate limit excedido, intentá más tarde');
}
```

## Testing

Para probar la autenticación localmente:

```bash
# 1. Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"tu-contraseña-maestra"}'

# Copiar el access_token de la respuesta

# 2. Usar el token en una request protegida
curl -X POST http://localhost:4000/jarbees/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{"message":"Hola","sessionId":"test-123"}'
```

## Seguridad

### Variables de entorno en producción

Antes de desplegar, cambiar en `.env`:

```env
# ❌ NO usar en producción
MASTER_PASSWORD="change-me-to-a-secure-password"
JWT_SECRET="change-me-to-a-random-secret-key"

# ✅ Usar en producción
MASTER_PASSWORD="tu-contraseña-muy-segura-con-símbolos-123!@#"
JWT_SECRET="ae3f8b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2"
```

Generar JWT_SECRET aleatorio:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### HTTPS en producción

Siempre usar HTTPS cuando el backend esté expuesto a Internet:
- Los tokens JWT viajan en el header Authorization
- Sin HTTPS, pueden ser interceptados (man-in-the-middle)

### Expiración del token

Por defecto el token expira en 30 días. Para cambiar:

```env
JWT_EXPIRES_IN="7d"   # 7 días
JWT_EXPIRES_IN="1h"   # 1 hora
JWT_EXPIRES_IN="30m"  # 30 minutos
```

## Próximos pasos (opcional)

Si en el futuro quieres agregar más usuarios:
1. El AuthModule ya está preparado
2. Solo necesitas agregar una tabla `users` en Prisma
3. Cambiar `AuthService.login()` para validar contra la DB
4. Agregar endpoints de registro/cambio de contraseña

La arquitectura JWT actual escala perfectamente a múltiples usuarios sin cambios mayores.
