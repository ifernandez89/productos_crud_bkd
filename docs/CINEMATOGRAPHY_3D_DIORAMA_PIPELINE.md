# Pipeline de Cinematografía 3D y Generador de Dioramas Headless

## 1. Visión General

El servicio de cinematografía 3D de `productos_crud_bkd` permite orquestar composiciones tridimensionales de alta fidelidad directamente desde Node.js/NestJS mediante Blender 5.2 LTS en modo headless (`--background`).

Aprovechando la biblioteca de assets modular CC0 de **Kenney Starter Kit 3D Platformer**, el sistema ahora puede generar dioramas dinámicos, pósteres de personajes y pedestales comerciales para productos sin depender de generación estocástica de mallas.

---

## 2. Biblioteca de Props Integrada (`storage/assets/models/platformer/`)

Todos los modelos se integraron en formato `.glb` estándar con paleta de color optimizada y mallas ligeras de producción:

| Asset | Archivo | Tamaño | Descripción / Uso |
|---|---|---|---|
| **Hero Character** | `character.glb` | 85 KB | Personaje robótico con esqueleto completo y animaciones (`jump`, `walk`, `idle`, `static`). |
| **Podio Redondo** | `platform-grass-large-round.glb` | 11 KB | Pedestal circular con superficie de césped, ideal para exhibición de productos y personajes. |
| **Moneda Dorada** | `coin.glb` | 21 KB | Moneda coleccionable 3D con shader PBR reflectivo de alto brillo metálico. |
| **Bloque Misterioso** | `block-coin.glb` | 64 KB | Cubo estilizado de plataformas para decoración y props secundarios. |
| **Ladrillo Modular** | `brick.glb` | 22 KB | Ladrillo de plataforma para pruebas de desgaste o escenografía. |
| **Nube Volumétrica** | `cloud.glb` | 23 KB | Nube esponjosa para fondos multicapa y efecto Depth of Field (DoF Bokeh). |
| **Plataformas Modulares** | `platform-large.glb`, `platform.glb`, `platform-falling.glb` | 13 - 24 KB | Islas flotantes y puentes para escenarios complejos. |
| **Hierba & Vegetación** | `grass.glb`, `grass-small.glb` | 9 KB | Mechones de césped para bordes orgánicos del pedestal. |
| **Skybox Panorámico** | `textures/skybox/platformer_skybox.png` | 3.8 MB | Textura de cielo 360° para iluminación ambiental y reflejos. |
| **Efectos de Sonido** | `storage/assets/sounds/platformer/*.ogg` | 5 - 11 KB | SFX CC0 (`jump.ogg`, `coin.ogg`, `break.ogg`, etc.). |

---

## 3. Arquitectura del Generador de Dioramas (`scripts/blender/render_cinematic_diorama.py`)

El script implementa una técnica de composición modular de estudio cinematográfico:

```
┌────────────────────────────────────────────────────────┐
│                      Skybox 360°                       │
│     [Nube Fondo]                   [Nube Alta]         │
│                                                        │
│                    [Moneda Glow] ✨                    │
│                      (Metálico 0.96)                   │
│                          ▲                             │
│                  [Héroe en Salto]                      │
│                  (Frame 6 / Jump)                      │
│                                                        │
│   [Nube Desenfoque]   [Hierba]                         │
│          ╲                │                            │
│           [Pedestal Césped Circular]                   │
│                                                        │
│         ☀️ Key Light (Ámbar Frontal 45°)                │
│         💡 Fill Light (Cian Suave Lateral)             │
│         🔦 Rim Kicker (Contraluz Silueta)             │
│         📷 Cámara 54mm (DoF Bokeh f/2.4)               │
└────────────────────────────────────────────────────────┘
```

### 3.1 Esquema de Iluminación de 3 Puntos + Rim Kicker
- **Key Light (Sun)**: Luz cálida direccional ámbar (`#FFF3D1`) a 45° que define el volumen y las sombras de contacto.
- **Fill Light (Area)**: Luz fría suave celeste (`#7EC8E3`) de 4x3 metros para levantar sombras sin aplanar la escena.
- **Rim Light (Spot)**: Contraluz de alta potencia (`#FFA726`) ubicado detrás del sujeto para trazar un contorno de silueta definido contra el fondo.
- **Bounce Ground Light**: Rebote sutil verde césped (`#59BF4D`) hacia arriba desde el pedestal.

### 3.2 Óptica y Depth of Field (Bokeh Cinematográfico)
- **Lente**: 54mm (distorsión natural equivalente a 35mm full-frame).
- **Apertura**: `f/2.4` con 7 palas de diafragma (`aperture_blades = 7`) para generar bokeh heptagonal cremoso en nubes lejanas y en elementos de primer plano.
- **Target Tracking**: La cámara sigue automáticamente un Empty `Camera_Focus_Target` colocado exactamente en el centro de gravedad / pecho del sujeto.
- **Gestión de Color**: Transformación `AgX` con look `AgX - Medium High Contrast` para rango dinámico fílmico.

---

## 4. Uso Programático desde NestJS (`BlenderService`)

El método `renderCinematicDiorama` está completamente tipado e integrado en `src/jarvis/3d/blender.service.ts`:

```typescript
import { BlenderService } from './blender.service';

// Inyección en cualquier servicio o controlador de Jarvis
const result = await blenderService.renderCinematicDiorama({
  heroModel: 'character',            // 'character' o ruta a un .glb personalizado
  action: 'jump',                    // 'jump' | 'walk' | 'idle' | 'static' | 'none'
  frame: 6,                          // Fotograma clave (ej. 6 para el ápice del salto)
  pedestal: 'grass-round',           // 'grass-round' | 'large' | 'none'
  mood: 'golden_hour',               // 'golden_hour' | 'cyberpunk' | 'daylight' | 'studio'
  width: 2048,
  height: 1536,
  samples: 64,
  outputRenderPath: 'storage/assets/renders/mi_diorama.png',
  includeProps: true,
});

console.log(`Render completado en ${result.durationMs}ms`);
console.log(`Archivo generado: ${result.output}`);
```

---

## 5. Invocación por Línea de Comandos

También se puede ejecutar directamente con Blender:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python-exit-code 1 `
  -P scripts/blender/render_cinematic_diorama.py -- `
  --hero character `
  --action jump `
  --frame 6 `
  --mood golden_hour `
  --pedestal grass-round `
  --width 2048 `
  --height 1536 `
  --output storage/assets/renders/mi_render.png
```

### Atmósferas (`--mood`):
- `golden_hour`: Cálido crepuscular con rim light naranja y cielo dorado.
- `cyberpunk`: Neón cian y magenta de alto contraste con rim verde esmeralda.
- `daylight`: Luz solar directa neutra para catálogos limpios.
- `studio`: Fondo limpio de iluminación controlada de fotografía de estudio.

---

## 6. Pruebas y Resultados de Rendimiento

- **Tiempo de renderizado**: ~3.4 segundos para 1920x1080 (64 samples EEVEE Next).
- **Consumo de memoria**: Ultra ligero (< 150 MB RAM de pico).
- **Renders de validación**:
  - `storage/assets/renders/platformer_cinematic_hero.png` (2048x1536, 3.07 MB)
  - `storage/assets/renders/platformer_cinematic_hero_test.png` (1920x1080, 1.94 MB)
