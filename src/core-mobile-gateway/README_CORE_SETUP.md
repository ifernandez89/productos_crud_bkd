# 🖥️ Guía de Integración: MobileGateway en JarBees Core (NestJS)

Esta carpeta contiene los archivos listos para integrar en tu backend **JarBees Core** cuando enciendas tu PC en casa.

---

## 📁 1. Copiar Archivos al Backend NestJS

Copia los archivos a tu carpeta del backend (por ejemplo en `src/mobile-gateway/`):
- `mobile-gateway.controller.ts`
- `mobile-gateway.service.ts`
- `mobile-gateway.module.ts`

---

## ⚙️ 2. Registrar en `app.module.ts` de tu Core

En tu `app.module.ts` de NestJS:
```typescript
import { Module } from '@nestjs/common';
import { MobileGatewayModule } from './mobile-gateway/mobile-gateway.module';

@Module({
  imports: [
    // Tus módulos existentes...
    MobileGatewayModule,
  ],
})
export class AppModule {}
```

---

## 🌐 3. Asegurar CORS en `main.ts` de tu Core

En `main.ts` de NestJS, asegura que los orígenes de GitHub Pages y localhost estén permitidos:
```typescript
app.enableCors({
  origin: [
    'https://ifernandez89.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'ngrok-skip-browser-warning'],
});
```

---

## 🚀 4. Probar la Conexión desde el Celular

1. Inicia tu túnel Ngrok / Cloudflare o servidor en casa:
   ```bash
   ngrok http 4000
   ```
2. Abre **JarBees Mobile** en tu teléfono:
   - El badge superior cambiará a **`Core 45ms` 🟢** automáticamente.
3. Prueba comandos:
   - *"JarBees, ¿cómo está mi teléfono?"* (Modo local)
   - *"Calculá cuánto me queda si descuento 21% de 1837"*
   - O selecciona en Settings el motor **`Core Gateway (PC)`** para controlar tu PC remotamente desde el móvil.
