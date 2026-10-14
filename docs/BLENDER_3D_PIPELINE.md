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
