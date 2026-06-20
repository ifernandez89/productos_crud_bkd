# 🌐 Conectar GitHub Pages con Backend Local

## Objetivo
Hacer que tu frontend en GitHub Pages (`https://ifernandez89.github.io`) se conecte a tu backend NestJS corriendo localmente en tu casa.

---

## ✅ Configuración Completada

### Backend (NestJS)
- **Puerto:** 4000
- **CORS configurado** para aceptar:
  - `http://localhost:3000` (desarrollo local Next.js)
  - `https://ifernandez89.github.io` (GitHub Pages)
  - URLs de ngrok y localtunnel (para tunelización)

---

## 🚀 Opción 1: Usar ngrok (Recomendado)

### Paso 1: Instalar ngrok
```bash
# Descargá e instalá desde: https://ngrok.com/download
# O con choco (Windows):
choco install ngrok

# O con npm:
npm install -g ngrok
```

### Paso 2: Autenticarte (opcional pero recomendado)
```bash
ngrok config add-authtoken TU_TOKEN_AQUI
```
👉 Conseguí tu token gratis en: https://dashboard.ngrok.com/get-started/your-authtoken

### Paso 3: Ejecutar tu Backend
```bash
npm run start:dev
```
✅ Tu backend estará corriendo en `http://localhost:4000`

### Paso 4: Exponer con ngrok
```bash
ngrok http 4000
```

**Output esperado:**
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:4000
```

### Paso 5: Configurar GitHub Secret
1. Andá a tu repo de frontend en GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Crear/editar el secret:
   - **Name:** `NEXT_PUBLIC_BACKEND_URL`
   - **Value:** `https://abc123.ngrok-free.app` (la URL que te dio ngrok)

### Paso 6: Deployar
- Hacé un push a tu repo o re-ejecutá el workflow de GitHub Actions
- Tu frontend ahora apuntará a tu backend local a través de ngrok

---

## 🔄 Opción 2: Localtunnel (Alternativa Gratuita)

```bash
# Ejecutar tu backend
npm run start:dev

# En otra terminal:
npx localtunnel --port 4000
```

**Output:**
```
your url is: https://xyz123.loca.lt
```

Usá esa URL en el secret `NEXT_PUBLIC_BACKEND_URL` de GitHub.

⚠️ **Nota:** La primera vez que accedas a una URL de localtunnel, te pedirá que ingreses un endpoint password. Solo hacé click en "Continue".

---

## 🔐 Seguridad y Consideraciones

### CORS ya está configurado ✅
Tu `main.ts` ahora acepta requests desde:
- GitHub Pages
- ngrok/localtunnel
- localhost (para desarrollo)

### Logs del Backend
- Los requests desde GitHub Pages aparecerán en tus logs de NestJS
- Podés ver en tiempo real lo que está pasando

### Limitaciones
- **ngrok gratis:** La URL cambia cada vez que reiniciás ngrok
- **localtunnel:** Puede ser más lento y menos estable
- **Tu PC debe estar encendida** para que funcione

---

## 🛠️ Troubleshooting

### "CORS Error" en el navegador
✅ Ya está configurado, pero si tenés problemas:
```typescript
// Verificá en src/main.ts que tenés:
app.enableCors({
  origin: ['https://ifernandez89.github.io'],
  credentials: true,
});
```

### "Network Error" o "ERR_CONNECTION_REFUSED"
1. Verificá que ngrok esté corriendo: `ngrok http 4000`
2. Verificá que tu backend esté corriendo: `npm run start:dev`
3. Verificá que la URL en GitHub Actions sea la correcta

### ngrok se desconecta
- Con la versión gratuita, ngrok puede desconectarse después de 8 horas
- Simplemente reinicialo y actualizá el secret en GitHub

### Tu IP cambió
- Si usás DHCP, tu IP puede cambiar
- ngrok maneja esto automáticamente
- Si configuraste port forwarding manual, necesitás actualizar las reglas

---

## 📝 Comandos Rápidos

```bash
# Iniciar backend en modo desarrollo
npm run start:dev

# Iniciar backend en modo producción
npm run start:prod

# Exponer con ngrok
ngrok http 4000

# Exponer con localtunnel
npx localtunnel --port 4000

# Ver logs en tiempo real (si usás Winston)
tail -f logs/combined.log
```

---

## 🎯 Resumen: ¿Qué necesitás hacer?

1. **En tu PC local:**
   ```bash
   npm run start:dev          # Terminal 1: Backend
   ngrok http 4000            # Terminal 2: Túnel
   ```

2. **En GitHub:**
   - Copiá la URL de ngrok (ej: `https://abc123.ngrok-free.app`)
   - Actualizá el secret `NEXT_PUBLIC_BACKEND_URL` en tu repo
   - Trigger un nuevo deploy (push o re-run workflow)

3. **¡Listo!** 🎉
   - Accedé a `https://ifernandez89.github.io`
   - Tu frontend se conectará a tu backend local a través de ngrok

---

## 🔗 URLs Útiles

- **ngrok Dashboard:** https://dashboard.ngrok.com
- **GitHub Actions:** https://github.com/ifernandez89/TU_REPO/actions
- **GitHub Pages:** https://ifernandez89.github.io
- **Backend Local:** http://localhost:4000
- **API Docs (Swagger):** http://localhost:4000/api/docs
