# 🏛️ JarBees 3D Asset Pipeline: Automatización Headless con Blender (`bpy`)

**Fecha de implementación:** 14 de Octubre de 2026  
**Motor 3D:** Blender 5.2.2 LTS (Modo Headless `-b -P`)  
**Hardware de referencia:** NVIDIA GeForce RTX 5070 (12 GB VRAM)  
**Servicio Backend:** `BlenderService` (`src/jarvis/3d/blender.service.ts`)  
**Skill Especializada:** `.agents/skills/blender-automation/SKILL.md`

---

## 1. Filosofía Arquitectónica: Modificación Determinista vs. IA Generativa Cruda

En lugar de delegar la creación de geometría 3D a modelos generativos (que producen topologías caóticas, mallas no manifold, triangulaciones imposibles y escalas arbitrarias) o generar imágenes 2D planas por difusión que no pueden rotarse en el motor del juego:

> **Regla de Oro de Assets 3D:**  
> JarBees toma modelos 3D reales existentes (`.glb` / `.gltf`), inspecciona su estructura topológica y materiales, planifica intervenciones controladas y las ejecuta mediante scripts de Python (`bpy`) en Blender headless acelerado por GPU.

---

## 2. Roles del Ecosistema de Modelos

| Componente | Rol en el Pipeline 3D |
| :--- | :--- |
| **`qwen3:8b`** | **Planificador Cognitivo:** Interpreta la intención del usuario (*«agregá musgo en la base y suciedad en las oquedades de la cabeza olmeca»*) y define los parámetros del shader (cobertura, rugosidad, orientaciones vectoriales). |
| **`qwen2.5-coder:7b`** | **Generador de Scripts `bpy`:** Ensambla o refactoriza los árboles de nodos de Blender basándose en la librería modular de skills. |
| **`BlenderService` (Blender 5.2 LTS)** | **Motor de Ejecución y Render:** Ejecuta el script de forma aislada, calcula Bounding Box, renderiza capturas de estudio cinemáticas a 1024x1024 y re-exporta el nuevo GLB. |
| **Playwright / Visión** | **Control de Calidad (QA):** Genera la lámina comparativa antes/después y valida visualmente que la silueta y proporciones no hayan sido alteradas. |

---

## 3. Niveles de Intervención

1. **Nivel 1 — PBR Superficial y Pátina Procedural (Implementado y Validado 100%)**:
   - Musgo orgánico condicionado por altura ($Z$) y normales hacia arriba ($+Z$).
   - Sedimento y suciedad oscura en oquedades y pliegues (*cavity darkening*).
   - Micro-relieve y porosidad de piedra erosionada mediante *ShaderNodeBump*.
   - **Riesgo topológico:** CERO (la malla original conserva el 100% de sus vértices).
2. **Nivel 2 — Modificadores Geométricos No Destructivos**:
   - Desplazamiento procedural (*Displace*) con texturas voronoi/ruido para bordes mellados.
   - Biselado controlado (*Bevel*) y micro-fracturas.
3. **Nivel 3 — Modificaciones Semánticas Estructurales**:
   - Fusión booleana de elementos arquitectónicos (columnas, capiteles, inscripciones talladas).

---

## 4. Validación Experimental en la Cabeza Olmeca (`olmec_head.glb`)

Se ejecutó el pipeline completo de Nivel 1 sobre el modelo arqueológico `storage/assets/models/olmec_head.glb` de ArcheoScope:

* **Inspección Inicial:**
  * Vértices: **22.564**
  * Triángulos: **40.000**
  * Dimensiones Bounding Box: **1.45m × 1.62m × 1.95m** (proporciones colosales auténticas)
  * Material: `Material_0` con mapa difuso base.
* **Tiempo de Ejecución Total:** **~3.5 segundos** (en RTX 5070 con motor EEVEE).
* **Vértices Preservados:** **22.564 de 22.564 (100.0%)**.
* **Integridad glTF 2.0:** El archivo `olmec_head_weathered.glb` (5.8 MB) fue re-importado en Blender en **0.05s** sin errores de validación.

### 🖼️ Resultado Visual Generado:
* **Antes:** `storage/assets/renders/olmec_head_before.png`
* **Después:** `storage/assets/renders/olmec_head_after.png`
* **Lámina Comparativa:** `storage/assets/renders/olmec_head_comparison.png`

---

## 5. Uso desde el Backend de NestJS

```typescript
import { BlenderService } from './src/jarvis/3d/blender.service';

// 1. Inyectar el servicio
constructor(private readonly blenderService: BlenderService) {}

// 2. Inspeccionar modelo
const info = await this.blenderService.inspectModel('storage/assets/models/olmec_head.glb');

// 3. Aplicar desgaste y generar renders
const result = await this.blenderService.applyWeathering({
  inputGlbPath: 'storage/assets/models/olmec_head.glb',
  mossCoverage: 0.45,
  dirtIntensity: 0.55,
  normalStrength: 0.65,
  resolution: 1024,
});

console.log(`GLB listo en: ${result.output}`);
console.log(`Render antes: ${result.render_before}`);
console.log(`Render después: ${result.render_after}`);
```

---

## 6. Caso de Estudio: Angelina Jolie (Retrato Humano con SSS & ARKit)

Se implementó el script [`scripts/blender/render_angelina_blender.py`](file:///c:/Projects/productos_crud_bkd/scripts/blender/render_angelina_blender.py) sobre el modelo anatómico base `storage/assets/models/avaturn.glb`:

- **Translucidez Dérmica (Subsurface Scattering)**:
  - Factor de dispersión: `Weight = 0.16`.
  - Radio RGB: `(1.0, 0.38, 0.18)` emulando la dispersión capilar de hemoglobina bajo la epidermis.
  - Elimina de raíz el aspecto de "plástico/maniquí" de WebGL.
- **Claves de Forma ARKit (Micro-expresiones Facial Pose)**:
  - Sonrisa asimétrica cálida: `mouthSmileLeft = 0.28`, `mouthSmileRight = 0.18`.
  - Expresión ocular: `eyeSquintLeft = 0.26`, `eyeSquintRight = 0.26`.
  - Apertura sutil de labios: `jawOpen = 0.03`.
  - Cejas: `browOuterUpLeft = 0.35`, `browOuterUpRight = 0.35`.
  - Inclinación ósea natural del cuello: +4.2° roll y +2.5° yaw.
- **Iluminación de Estudio Rembrandt & Óptica Telefoto**:
  - Teleobjetivo de retrato de **95mm f/2.8** con profundidad de campo focalizada en los ojos.
  - Key Light a 45° con soft penumbra, Fill crepuscular frío y Hair Rim Light.
- **Entregables**:
  - Modelo GLB con shape keys y rig intactos: [`storage/assets/models/angelina_jolie_blender.glb`](file:///c:/Projects/productos_crud_bkd/storage/assets/models/angelina_jolie_blender.glb)
  - Render de retrato 1600x2000: [`storage/assets/renders/angelina_blender_portrait.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/angelina_blender_portrait.png) (5.3 MB).

---

## 7. Caso de Estudio: Aetheria (Ciudadela Celestial con Acrópolis PBR)

Se implementó el script [`scripts/blender/render_aetheria_blender.py`](file:///c:/Projects/productos_crud_bkd/scripts/blender/render_aetheria_blender.py) generando la versión fotorrealista de Aetheria:

- **Geología de Risco Flotante**:
  - Cono masivo de roca basáltica con mapa difuso, mapa de normales 1K y desplazamiento fractal de estratos rocosos y agujas suspendidas en el vacío.
- **Acrópolis Clásica y Cúpula Imperial**:
  - Escalinata de crepidoma de mármol imperial veteado.
  - Peristilo de 14 columnas corintias estriadas con capiteles y basas doradas.
  - Frontón triangular clásico con medallón solar de oro.
  - Gran cúpula central imperial de oro con tambor de mármol y aguja celestial con orbe arcano flotante.
  - Torres gemelas flanqueantes y pebeteros de mármol con fuego sagrado encendido.
- **Hidrología y Cascada al Vacío**:
  - Estanque de origen cristalino, arroyo meandriforme y cascada frontal precipitándose al abismo hacia un mar de nubes bajas con bruma volumétrica.
- **Iluminación Cinematográfica & Cámara Track-To**:
  - Cámara de 36mm con constraint `Track-To` dirigida a la Acrópolis.
  - Iluminación de 3 puntos (Sol dorado crepuscular, Fill azul cielo y Rim cian cósmico) con gestión de color `AgX`.
- **Entregables**:
  - Modelo 3D exportado: [`storage/assets/models/aetheria_celestial_island.glb`](file:///c:/Projects/productos_crud_bkd/storage/assets/models/aetheria_celestial_island.glb) (3.52 MB).
  - Render cinemático 2048x1536: [`storage/assets/renders/aetheria_blender_cinematic.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/aetheria_blender_cinematic.png) (4.22 MB).

---

## 8. Lámina Comparativa de Evolución Visual

La lámina [`storage/assets/renders/blender_upgrades_showcase.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/blender_upgrades_showcase.png) (2560x1440) sintetiza el salto cualitativo entre el renderizado WebGL básico y el pipeline de Blender 5.2 LTS tanto para mallas humanas como para escenas arquitectónicas y paisajísticas completas.

