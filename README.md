# 🚀 Productos CRUD Backend - NestJS

Backend API para gestión de productos con integración de IA (Ollama) y sistema de chat inteligente.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Conectar con Frontend en GitHub Pages](#-conectar-con-frontend-en-github-pages)
- [API Endpoints](#-api-endpoints)
- [Scripts Disponibles](#-scripts-disponibles)
- [Estructura del Proyecto](#-estructura-del-proyecto)

---

## ✨ Características

- ✅ **CRUD Completo** de productos con TypeORM/Prisma
- 🤖 **Integración con IA** (Ollama) para chat inteligente
- 📊 **Validación robusta** con class-validator
- 🔐 **CORS configurado** para desarrollo y producción
- 📝 **Documentación automática** con Swagger/OpenAPI
- 🪵 **Logging avanzado** con Winston (rotating files)
- 📁 **Upload de archivos** con validación
- 🗄️ **Base de datos PostgreSQL** (local y Neon)
- 🧪 **Testing** configurado con Jest

---

## 🛠️ Stack Tecnológico

- **Framework:** NestJS 10.x
- **Lenguaje:** TypeScript 5.x
- **Base de Datos:** PostgreSQL + Prisma ORM
- **IA:** Ollama (Llama3.2) + LangChain
- **Validación:** class-validator + class-transformer
- **Documentación:** Swagger/OpenAPI
- **Logging:** Winston + nest-winston
- **Testing:** Jest + Supertest

---

## 📦 Instalación

```bash
# Clonar el repositorio
git clone <tu-repo>
cd productos_crud_bkd

# Instalar dependencias
npm install

# Configurar Prisma
npx prisma generate
npx prisma migrate dev
```

---

## ⚙️ Configuración

### 1. Variables de Entorno (`.env`)

```env
# Base de datos local (PostgreSQL)
DATABASE_URL="postgresql://postgres:password@localhost:5433/productos?schema=public"

# O base de datos en la nube (Neon)
POSTGRES_PRISMA_URL="postgres://user:pass@host/db?pgbouncer=true"
POSTGRES_URL_NON_POOLING="postgres://user:pass@host/db"

# Puerto del servidor (opcional, default: 4000)
PORT=4000
```

### 2. Base de Datos

**Opción A: PostgreSQL Local**
```bash
# Con Docker
docker run --name postgres-productos \
  -e POSTGRES_PASSWORD=1464 \
  -p 5433:5432 \
  -d postgres:15

# Ejecutar migraciones
npx prisma migrate dev
```

**Opción B: Neon (PostgreSQL en la nube)**
- Creá una cuenta en [Neon.tech](https://neon.tech)
- Copiá las connection strings al `.env`

### 3. Ollama (IA)

```bash
# Instalar Ollama
# Windows: https://ollama.com/download
# Linux/Mac: curl -fsSL https://ollama.com/install.sh | sh

# Descargar modelo
ollama pull llama3.2
```

---

## 🚀 Uso

### Desarrollo Local

```bash
# Modo desarrollo (hot-reload)
npm run start:dev

# Ver logs en tiempo real
tail -f logs/combined.log
```

✅ API disponible en: `http://localhost:4000`  
📚 Documentación Swagger: `http://localhost:4000/api/docs`

### Producción

```bash
# Build
npm run build

# Ejecutar
npm run start:prod
```

---

## 🌐 Conectar con Frontend en GitHub Pages

Si tu frontend está deployado en **GitHub Pages** y querés que se conecte a tu backend local:

### Opción 1: ngrok (Recomendado)

```bash
# En una terminal: Iniciar backend
npm run start:dev

# En otra terminal: Exponer con ngrok
npm run ngrok
# O usar el script automático:
npm run start:ngrok
```

**Copiá la URL de ngrok** (ej: `https://abc123.ngrok-free.app`) y agregala como secret en GitHub:

1. Repo → **Settings** → **Secrets and variables** → **Actions**
2. Crear/editar: `NEXT_PUBLIC_BACKEND_URL` con el valor de ngrok
3. Hacer push o re-ejecutar el workflow

### Opción 2: localtunnel

```bash
npm run tunnel
```

📖 **Guía completa:** Ver [docs/NGROK_SETUP.md](docs/NGROK_SETUP.md)

---

## 📡 API Endpoints

### Productos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/products` | Listar todos los productos |
| `GET` | `/api/products/:id` | Obtener producto por ID |
| `POST` | `/api/products` | Crear nuevo producto |
| `PATCH` | `/api/products/:id` | Actualizar producto |
| `DELETE` | `/api/products/:id` | Eliminar producto |

### Chat IA

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/aichat` | Enviar mensaje al chatbot |
| `GET` | `/api/aichat/history` | Obtener historial de conversaciones |

### Upload

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/upload` | Subir archivo |

📚 **Documentación completa en Swagger:** `http://localhost:4000/api/docs`

---

## 📜 Scripts Disponibles

```bash
# Desarrollo
npm run start:dev         # Iniciar en modo desarrollo
npm run start:debug       # Iniciar con debugger

# Build & Producción
npm run build             # Compilar proyecto
npm run start:prod        # Ejecutar compilado

# Tunneling (conectar con GitHub Pages)
npm run ngrok             # Solo ngrok (manual)
npm run start:ngrok       # Backend + ngrok (automático)
npm run tunnel            # Usar localtunnel

# Testing
npm run test              # Ejecutar tests
npm run test:watch        # Tests en modo watch
npm run test:cov          # Tests con coverage
npm run test:e2e          # Tests end-to-end

# Code Quality
npm run lint              # Linter (ESLint)
npm run format            # Formatear código (Prettier)

# Base de Datos (Prisma)
npx prisma generate       # Generar Prisma Client
npx prisma migrate dev    # Ejecutar migraciones
npx prisma studio         # Abrir UI de base de datos
```

---

## 📁 Estructura del Proyecto

```
productos_crud_bkd/
├── src/
│   ├── products/          # Módulo de productos
│   │   ├── dto/          # Data Transfer Objects
│   │   ├── entities/     # Entidades de base de datos
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   └── products.module.ts
│   ├── aichat/           # Módulo de chat IA
│   ├── upload/           # Módulo de uploads
│   ├── app.module.ts     # Módulo principal
│   └── main.ts           # Entry point (CORS aquí)
├── prisma/
│   ├── schema.prisma     # Schema de base de datos
│   └── migrations/       # Migraciones
├── logs/                 # Logs de Winston
├── docs/
│   ├── NGROK_SETUP.md   # Guía de ngrok
│   └── arquitectura-sistema.md
├── test/                 # Tests E2E
├── .env                  # Variables de entorno
├── package.json
└── README.md
```

---

## 🔐 CORS Configurado

El backend acepta requests desde:

- ✅ `http://localhost:3000` (frontend local)
- ✅ `https://ifernandez89.github.io` (GitHub Pages)
- ✅ URLs de ngrok (`*.ngrok.io`, `*.ngrok-free.app`)
- ✅ URLs de localtunnel (`*.loca.lt`)

Ver configuración en: `src/main.ts`

---

## 🐛 Troubleshooting

### CORS Error
- Verificá que tu URL de frontend esté en la whitelist de `src/main.ts`
- Asegurate que ngrok esté corriendo

### Base de datos no conecta
```bash
# Verificar que PostgreSQL esté corriendo
# Con Docker:
docker ps

# Probar conexión
npx prisma studio
```

### Ollama no responde
```bash
# Verificar que Ollama esté corriendo
ollama list

# Iniciar servidor
ollama serve
```

---

## 📝 Licencia

UNLICENSED - Proyecto privado

---

## 👨‍💻 Autor

Ignacio Fernández - [@ifernandez89](https://github.com/ifernandez89)

---

## 🔗 Links Útiles

- [Documentación NestJS](https://docs.nestjs.com/)
- [Prisma Docs](https://www.prisma.io/docs)
- [Ollama](https://ollama.com/)
- [ngrok](https://ngrok.com/)
- [GitHub Pages](https://pages.github.com/)
