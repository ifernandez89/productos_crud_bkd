# 🚀 Quick Start - Sistema de Metadata 3D

## Inicio Rápido en 5 Minutos

### 1. Verificar el Sistema

```bash
# Iniciar servidor
npm run start:dev

# En otra terminal, verificar que el servicio está activo
curl http://localhost:3000/jarvis/3d/metadata/stats
```

**Respuesta esperada:**
```json
{
  "success": true,
  "stats": {
    "totalAssets": 1,
    "byType": { "scene": 1 },
    "byCategory": { "cinematic-render": 1 },
    "totalRenders": 1,
    "averageRenderTime": 4.96
  }
}
```

---

### 2. Ver el Asset de Ejemplo (Ballena Jorobada)

```bash
curl http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7
```

Verás toda la metadata del render de la ballena jorobada incluyendo:
- Configuración de iluminación volumétrica
- Setup de cámara cinematográfica
- Métricas de rendimiento (4.96s en RTX 5070)
- Tags y estilo artístico

---

### 3. Buscar Assets por Estilo

```bash
# Buscar renders con estética Dreamcast
curl "http://localhost:3000/jarvis/3d/metadata?style=dreamcast-aesthetic"

# Buscar renders submarinos con volumetrics
curl "http://localhost:3000/jarvis/3d/metadata?tags=underwater,volumetric"

# Buscar renders rápidos (< 10 segundos)
curl "http://localhost:3000/jarvis/3d/metadata?assetType=scene"
```

---

### 4. Clonar Configuración para Crear Variante

```bash
curl -X POST http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7/clone \
  -H "Content-Type: application/json" \
  -d '{
    "overrides": {
      "assetName": "Ballena Jorobada - Amanecer Dorado",
      "lighting": {
        "hdriPath": "G:\\HDRIs\\Sunrise_8K.exr",
        "volumetrics": {
          "scatterColor": [0.95, 0.75, 0.35]
        }
      },
      "tags": ["whale", "underwater", "sunrise", "golden-hour"]
    }
  }'
```

**Resultado**: Nueva configuración lista para render sin setup manual!

---

### 5. Guardar Metadata de un Nuevo Render

```bash
curl -X POST http://localhost:3000/jarvis/3d/metadata \
  -H "Content-Type: application/json" \
  -d '{
    "packageId": "tu-nuevo-uuid",
    "assetName": "Mi Nuevo Render",
    "assetType": "model",
    "sourcePath": "path/to/model.glb",
    "sourceFormat": ".glb",
    "fileSize": 12345678,
    "checksum": "sha256-hash",
    "tags": ["product", "ecommerce"],
    "category": "product-catalog",
    "style": ["studio-lighting"],
    "renderConfig": {
      "engine": "eevee-next",
      "resolution": [1920, 1080],
      "samples": 128
    },
    "performance": {
      "renderTime": 3.2,
      "gpuModel": "RTX 5070",
      "vramUsage": 4500
    }
  }'
```

---

## 📊 Ejemplos de Consultas Útiles

### Encontrar configuraciones rápidas
```bash
# Assets que renderizaron en menos de 5 segundos
curl "http://localhost:3000/jarvis/3d/metadata?assetType=scene" | \
  jq '.results[] | select(.performance.renderTime < 5)'
```

### Buscar por múltiples tags
```bash
# Renders cinematográficos submarinos
curl "http://localhost:3000/jarvis/3d/metadata?tags=cinematic,underwater&category=cinematic-render"
```

### Encontrar assets similares
```bash
# Similar a la ballena jorobada
curl "http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7/similar?limit=5"
```

---

## 🧪 Ejecutar Test Suite

```bash
# Ejecutar suite completa de tests
node scripts/test_asset_metadata.js
```

**Output esperado:**
```
🎨 === JarBees Asset Metadata System - Test Suite ===

📊 1. Consultando estadísticas del catálogo...
   ✅ Estadísticas: { totalAssets: 1, ... }

🐋 2. Obteniendo metadata del render de ballena jorobada...
   ✅ Asset encontrado:
      - Nombre: Ballena Jorobada - Abismo Oceánico Ecco Style
      - Render Time: 4.96s
      - GPU: NVIDIA GeForce RTX 5070

🔍 3. Buscando assets con estilo "dreamcast-aesthetic"...
   ✅ Encontrados 1 assets

🔄 5. Clonando configuración para crear variante "Amanecer Dorado"...
   ✅ Configuración clonada exitosamente
```

---

## 📁 Archivos Clave

### Código Fuente
- **Service**: `src/jarvis/3d/services/asset-metadata.service.ts`
- **Controller**: `src/jarvis/3d/controllers/asset-metadata.controller.ts`
- **Module**: `src/jarvis/jarvis.module.ts` (ya integrado)

### Datos
- **Metadata de Ballena**: `storage/assets/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json`
- **Catálogo Global**: `storage/assets/catalog.json`

### Documentación
- **Guía Completa**: `docs/ASSET_METADATA_SYSTEM.md`
- **Resumen Ejecutivo**: `docs/METADATA_SYSTEM_EXECUTIVE_SUMMARY.md`
- **Este archivo**: `docs/METADATA_SYSTEM_QUICKSTART.md`

---

## 🎯 Próximos Pasos

1. **Integrar con BlenderService**
   - Guardar metadata automáticamente después de cada render
   - Ver ejemplo: `scripts/examples/render_with_metadata_example.ts`

2. **Crear Dashboard Visual**
   - Galería de renders con filtros
   - Gráficas de rendimiento por GPU
   - Timeline de producción

3. **Implementar Búsqueda Semántica**
   - Embeddings de descripciones
   - Búsqueda por similitud visual

4. **Auto-tuning de Parámetros**
   - ML para predecir tiempos de render
   - Recomendaciones automáticas de samples

---

## 💡 Tips

- **Usa tags descriptivos**: Facilitan búsqueda futura
- **Guarda performance metrics**: Ayuda a optimizar configuraciones
- **Clona en lugar de crear desde cero**: Ahorra 90% de tiempo
- **Mantén estilo consistente**: Facilita encontrar assets relacionados

---

## 🆘 Troubleshooting

### El servidor no responde
```bash
# Verificar que está corriendo
curl http://localhost:3000/health

# Reiniciar
npm run start:dev
```

### No encuentra el asset
```bash
# Verificar que el archivo existe
ls storage/assets/metadata/
```

### Error al clonar
```bash
# Verificar que el packageId existe
curl http://localhost:3000/jarvis/3d/metadata/{packageId}
```

---

**¿Listo para producir assets 10x más rápido? 🚀**

Ver documentación completa: [`docs/ASSET_METADATA_SYSTEM.md`](./ASSET_METADATA_SYSTEM.md)
