# ✅ Checklist: Conectar GitHub Pages con Backend Local

## 🎯 Objetivo
Hacer que tu frontend en **GitHub Pages** (`https://ifernandez89.github.io`) se conecte a tu backend NestJS corriendo localmente.

---

## 📋 Pre-requisitos

### En tu PC
- [ ] Node.js instalado (v18+)
- [ ] Backend NestJS funcional
- [ ] PostgreSQL corriendo (local o Neon)
- [ ] Ollama instalado y corriendo (opcional, para chat IA)

### Instalar ngrok
- [ ] Descargar desde: https://ngrok.com/download
- [ ] Instalar: `npm install -g ngrok` o usar instalador
- [ ] (Opcional) Crear cuenta gratis en ngrok
- [ ] (Opcional) Autenticarse: `ngrok config add-authtoken TU_TOKEN`

### En GitHub
- [ ] Frontend deployado en GitHub Pages
- [ ] Acceso a Settings del repositorio
- [ ] GitHub Actions habilitado

---

## ✅ Configuración Completada

### Backend (Ya está hecho ✅)
- [x] **CORS configurado** en `src/main.ts`
  - Acepta `https://ifernandez89.github.io`
  - Acepta URLs de ngrok y localtunnel
  - Acepta localhost para desarrollo
- [x] **Scripts npm agregados** para facilitar uso
- [x] **Documentación creada** (README, NGROK_SETUP)
- [x] **Scripts de inicio automático** (.bat y .ps1)

---

## 🚀 Pasos para Conectar (Primera Vez)

### 1. Iniciar Backend + ngrok

**Opción A: Script Automático (Recomendado)**
```bash
npm run start:ngrok
```

**Opción B: Manual**
```bash
# Terminal 1: Backend
npm run start:dev

# Terminal 2: ngrok
npm run ngrok
```

### 2. Copiar URL de ngrok

Cuando ngrok inicie, verás algo como:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:4000
```

**¡Copiá esa URL!** (`https://abc123.ngrok-free.app`)

### 3. Configurar Secret en GitHub

1. Andá a tu repo de frontend: `https://github.com/ifernandez89/TU_REPO`
2. Click en **Settings** (⚙️)
3. En el menú izquierdo: **Secrets and variables** → **Actions**
4. Click en **New repository secret** (o editar si ya existe)
5. Configurar:
   - **Name:** `NEXT_PUBLIC_BACKEND_URL`
   - **Value:** `https://abc123.ngrok-free.app` (la URL de ngrok)
6. Click en **Add secret**

### 4. Deployar Frontend

**Opción A: Push a main/master**
```bash
git add .
git commit -m "Update backend URL"
git push
```

**Opción B: Re-ejecutar Workflow**
1. Andá a **Actions** en tu repo
2. Click en el último workflow
3. Click en **Re-run all jobs**

### 5. Verificar

1. Esperá que GitHub Actions termine (1-3 minutos)
2. Accedé a: `https://ifernandez89.github.io`
3. Abrí **DevTools** (F12) → **Console**
4. Verificá que no haya errores CORS
5. Probá hacer un request al backend (ej: cargar productos)

---

## 🔄 Uso Diario

Cada vez que quieras trabajar desde tu casa:

### Inicio Rápido
```bash
# Opción 1: Todo automático
npm run start:ngrok

# Opción 2: Manual
npm run start:dev  # Terminal 1
npm run ngrok      # Terminal 2
```

### Si la URL de ngrok cambió
1. Copiá la nueva URL de ngrok
2. Actualizá el secret `NEXT_PUBLIC_BACKEND_URL` en GitHub
3. Re-ejecutá el workflow de GitHub Actions

### Detener
- `Ctrl + C` en ambas terminales
- Cerrá las ventanas de cmd/PowerShell

---

## 🧪 Testing

### Verificar CORS
```bash
# Desde la consola del navegador (F12):
fetch('https://abc123.ngrok-free.app/api/products')
  .then(r => r.json())
  .then(console.log)
```

✅ **Debe funcionar sin errores CORS**

### Verificar Backend Local
```bash
# Desde tu PC:
curl http://localhost:4000/api/products

# Desde ngrok:
curl https://abc123.ngrok-free.app/api/products
```

### Ver Logs
```bash
# Logs del backend (Winston)
tail -f logs/combined.log

# O ver en la terminal donde corre el backend
```

---

## 🐛 Troubleshooting

### ❌ "CORS Error" en el navegador

**Causa:** La URL del frontend no está en la whitelist

**Solución:**
```typescript
// Verificá en src/main.ts:
origin: [
  'https://ifernandez89.github.io',  // ✅ Tu URL aquí
]
```

### ❌ "Network Error" o "ERR_CONNECTION_REFUSED"

**Causa:** ngrok no está corriendo o la URL es incorrecta

**Solución:**
1. Verificá que ngrok esté corriendo: `npm run ngrok`
2. Verificá que el backend esté corriendo: `npm run start:dev`
3. Verificá que la URL en GitHub sea correcta

### ❌ ngrok dice "Session Expired"

**Causa:** La versión gratis de ngrok caduca después de 8 horas

**Solución:**
1. Reiniciá ngrok: `npm run ngrok`
2. Actualizá el secret en GitHub con la nueva URL
3. Re-ejecutá el workflow

### ❌ "Failed to load resource: net::ERR_NAME_NOT_RESOLVED"

**Causa:** La URL de ngrok no está configurada en GitHub o es incorrecta

**Solución:**
1. Verificá que el secret `NEXT_PUBLIC_BACKEND_URL` existe en GitHub
2. Verificá que el valor sea una URL válida de ngrok
3. Re-ejecutá el workflow después de configurar

### ❌ Backend no recibe requests

**Causa:** Tu PC está en suspensión o el backend se detuvo

**Solución:**
1. Verificá que el backend esté corriendo
2. Verificá los logs: `tail -f logs/combined.log`
3. Reiniciá el backend si es necesario

---

## 📊 Estado de Configuración

### ✅ Completado

- [x] CORS configurado en backend
- [x] Scripts npm agregados
- [x] Documentación creada
- [x] Scripts de inicio automático (.bat, .ps1)
- [x] README con instrucciones completas

### 🟡 Por hacer (Usuario)

- [ ] Instalar ngrok
- [ ] (Opcional) Autenticarse en ngrok
- [ ] Configurar secret en GitHub
- [ ] Probar conexión end-to-end

---

## 🎉 Resultado Final

Cuando todo funcione:

1. ✅ Abrís `https://ifernandez89.github.io`
2. ✅ El frontend se conecta a tu backend local vía ngrok
3. ✅ Los datos se cargan desde tu base de datos local
4. ✅ Podés ver logs en tiempo real en tu PC
5. ✅ Sin errores CORS en el navegador

---

## 📝 Comandos de Referencia Rápida

```bash
# Iniciar todo (automático)
npm run start:ngrok

# Iniciar backend solo
npm run start:dev

# Iniciar ngrok solo
npm run ngrok

# Alternativa: localtunnel
npm run tunnel

# Ver logs
tail -f logs/combined.log

# Verificar que ngrok está corriendo
curl https://TU_URL.ngrok-free.app/api/products
```

---

## 🔗 Links Importantes

- **ngrok Dashboard:** https://dashboard.ngrok.com
- **GitHub Actions:** https://github.com/ifernandez89/TU_REPO/actions
- **GitHub Pages:** https://ifernandez89.github.io
- **Backend Local:** http://localhost:4000
- **API Docs:** http://localhost:4000/api/docs
- **Guía Completa:** [docs/NGROK_SETUP.md](docs/NGROK_SETUP.md)

---

**¿Todo listo?** ¡Ejecutá `npm run start:ngrok` y empezá a trabajar! 🚀
