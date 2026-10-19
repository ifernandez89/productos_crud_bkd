# 🎨 Asset Metadata Storage

Este directorio contiene los archivos de metadata estructurada para todos los assets 3D del sistema JarBees Procedural 3D Studio.

## 📁 Estructura de Archivos

```
metadata/
├── {packageId}_info.json           # Metadata completa del asset
├── {packageId}_render_report.json  # Reporte de calidad y rendimiento
└── README.md                       # Este archivo
```

## 🔍 Tipos de Archivos

### 1. `*_info.json` - Metadata de Asset

Contiene toda la información técnica del asset:

- **Identificación**: `packageId`, `assetName`, `assetType`
- **Geometría**: vértices, faces, bounding box, armature
- **Materiales**: texturas PBR, propiedades, SSS
- **Iluminación**: tipo, HDRI, volumetrics, god rays, caustics
- **Cámara**: focal length, f-stop, posición, rotación
- **Render Config**: engine, resolución, samples, denoiser, color management
- **Performance**: render time, GPU model, VRAM usage
- **Tags y Estilo**: clasificación semántica
- **Uso**: historial y variantes

**Ejemplo**: `bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json` (render de ballena jorobada)

### 2. `*_render_report.json` - Reporte de Calidad

Análisis post-render con:

- Calidad de imagen (score 0-100)
- Detección de renders vacíos
- Detección de artifacts
- Rango dinámico y brillo promedio
- Recomendaciones de optimización

## 🚀 Uso

### Consultar Metadata

```bash
# Ver estadísticas del catálogo
curl http://localhost:3000/jarvis/3d/metadata/stats

# Obtener metadata de un asset
curl http://localhost:3000/jarvis/3d/metadata/{packageId}

# Buscar por criterios
curl "http://localhost:3000/jarvis/3d/metadata?style=dreamcast-aesthetic&tags=underwater"
```

### Guardar Metadata

```bash
POST /jarvis/3d/metadata
Content-Type: application/json

{
  "packageId": "nuevo-uuid",
  "assetName": "Mi Render",
  "assetType": "scene",
  ...
}
```

### Clonar para Variantes

```bash
POST /jarvis/3d/metadata/{packageId}/clone
Content-Type: application/json

{
  "overrides": {
    "lighting": { ... },
    "camera": { ... }
  }
}
```

## 📊 Assets Actuales

### Ballena Jorobada - Abismo Oceánico (Ecco Style)

- **Package ID**: `bebffbcb-1435-4626-b4d1-b9dc0b7d63f7`
- **Archivo**: `bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json`
- **Render**: `storage/assets/renders/ecco_whale_cinematic_abyss.png`
- **Estilo**: Dreamcast aesthetic, volumetric lighting, god rays
- **Performance**: 4.96s @ RTX 5070, 2560x1440, 256 samples EEVEE Next

## 🔗 Referencias

- **Documentación completa**: `docs/ASSET_METADATA_SYSTEM.md`
- **API Controller**: `src/jarvis/3d/controllers/asset-metadata.controller.ts`
- **Service**: `src/jarvis/3d/services/asset-metadata.service.ts`
- **Script de prueba**: `scripts/test_asset_metadata.js`

## 🎯 Beneficios

✅ **No más setup manual**: Clona configuraciones exitosas  
✅ **Búsqueda inteligente**: Encuentra assets por características técnicas  
✅ **Optimización continua**: Analiza qué configuraciones son más rápidas  
✅ **Trazabilidad completa**: Historial de uso y variantes  
✅ **Escalable**: Preparado para miles de assets
