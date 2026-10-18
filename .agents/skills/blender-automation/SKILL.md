---
name: blender-automation
description: Guía experta y patrones de producción para automatización headless de Blender (v5.x/4.x) mediante Python (bpy). Cubre inspección de mallas GLB/glTF, manipulación de árboles de nodos Principled BSDF, máscaras procedurales (musgo, pátina, oquedades), modificadores no destructivos, renderizado de estudio EEVEE y exportación validada.
license: MIT
metadata:
  author: JarBees 3D Studio
  version: "1.0.0"
---

# Blender Headless Automation & Asset Pipeline (`bpy`)

Guía técnica especializada para operar Blender 5.x / 4.x en modo headless (`blender -b -P script.py`) dentro del ecosistema JarBees, transformando modelos 3D existentes (`.glb`) mediante Python determinista sin depender de generación de geometría descontrolada con IA.

---

## 1. Reglas de Ejecución Headless

### 1.1 Invocación por Línea de Comandos
Blender headless se invoca siempre con `-b` (background) y `-P` (ejecutar script Python):
```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python-exit-code 1 -P script.py -- --input "model.glb" --output "model_weathered.glb"
```
* **`--python-exit-code 1`**: Garantiza que si el script de Python lanza una excepción, el proceso Blender termine con código de error `1`, permitiendo al backend capturar fallos.
* **Separador `--`**: Todos los argumentos posteriores al `--` son accesibles en Python mediante `sys.argv[sys.argv.index('--') + 1:]`.

### 1.2 Limpieza de Escena Inicial Obligatoria
Al iniciar en modo headless, Blender puede cargar la escena de fábrica (cubo, cámara, luz). Siempre resetear la escena antes de importar:
```python
import bpy

# Limpiar objetos existentes de forma segura
bpy.ops.wm.read_factory_settings(use_empty=True)
```

---

## 2. Inspección de Modelos GLB / glTF

Antes de aplicar cualquier modificación, se debe inspeccionar el modelo para conocer sus dimensiones, topología y slots de materiales:

```python
import bpy
from mathutils import Vector

def inspect_scene(glb_path: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    total_vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
    total_triangles = sum(len(obj.data.polygons) for obj in mesh_objects)
    
    # Bounding Box unificado
    min_coord = Vector((float('inf'), float('inf'), float('inf')))
    max_coord = Vector((float('-inf'), float('-inf'), float('-inf')))
    
    for obj in mesh_objects:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(corner)
            min_coord.x = min(min_coord.x, world_corner.x)
            min_coord.y = min(min_coord.y, world_corner.y)
            min_coord.z = min(min_coord.z, world_corner.z)
            max_coord.x = max(max_coord.x, world_corner.x)
            max_coord.y = max(max_coord.y, world_corner.y)
            max_coord.z = max(max_coord.z, world_corner.z)
            
    dimensions = max_coord - min_coord
    center = (max_coord + min_coord) / 2.0
    
    return {
        "meshes": [obj.name for obj in mesh_objects],
        "materials": [mat.name for mat in bpy.data.materials if mat],
        "total_vertices": total_vertices,
        "total_triangles": total_triangles,
        "bounding_box": {
            "width": dimensions.x,
            "depth": dimensions.y,
            "height": dimensions.z,
            "center": [center.x, center.y, center.z]
        }
    }
```

---

## 3. Manipulación de Materiales PBR (Shader Nodes en Principled BSDF)

### 3.1 Pátina de Desgaste y Musgo Procedural
Para aplicar musgo o suciedad sin destruir la textura original:
1. Localizar el nodo `BSDF_PRINCIPLED`.
2. Conservar el mapa base (`TEX_IMAGE`) conectado a `Base Color`.
3. Intercalar un nodo `ShaderNodeMixRGB` (o `ShaderNodeMix` en Blender 4/5):
   * **Color A**: La textura original.
   * **Color B**: Color de musgo / pátina (ej. `#3a5323` verde musgo, `#2e251a` tierra).
   * **Fac**: Una combinación de:
     - Vector Normal hacia arriba (+Z) para musgo que crece en superficies horizontales superiores.
     - Gradiente de Altura Z (para concentrar suciedad y humedad en la base).
     - Ruido procedural (`ShaderNodeTexNoise`) para bordes orgánicos e irregulares.

```python
def add_procedural_moss(mat, moss_color=(0.22, 0.35, 0.12, 1.0), coverage=0.4):
    if not mat.use_nodes:
        mat.use_nodes = True
    tree = mat.node_tree
    nodes = tree.nodes
    links = tree.links
    
    principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not principled:
        return
        
    # Obtener lo que esté conectado a Base Color
    original_input = None
    if principled.inputs['Base Color'].is_linked:
        original_input = principled.inputs['Base Color'].links[0].from_socket
        
    # Crear nodo Mix (Color)
    mix_node = nodes.new(type='ShaderNodeMix')
    mix_node.data_type = 'RGBA'
    mix_node.blend_type = 'MIX'
    
    # Crear nodo de Textura de Ruido para borde orgánico
    noise_node = nodes.new(type='ShaderNodeTexNoise')
    noise_node.inputs['Scale'].default_value = 15.0
    noise_node.inputs['Detail'].default_value = 4.0
    
    # Crear ColorRamp para contrastar la máscara
    ramp_node = nodes.new(type='ShaderNodeValToRGB')
    ramp_node.color_ramp.elements[0].position = 0.4
    ramp_node.color_ramp.elements[1].position = 0.6
    
    # Enlazar máscara
    links.new(noise_node.outputs['Fac'], ramp_node.inputs['Fac'])
    links.new(ramp_node.outputs['Color'], mix_node.inputs['Factor'])
    
    # Entradas de color
    if original_input:
        links.new(original_input, mix_node.inputs[6]) # Entrada A
    else:
        mix_node.inputs[6].default_value = principled.inputs['Base Color'].default_value
        
    mix_node.inputs[7].default_value = moss_color # Entrada B (Musgo)
    
    # Conectar al Principled BSDF
    links.new(mix_node.outputs[2], principled.inputs['Base Color'])
```

---

## 4. Renderizado de Estudio para Verificación (Antes vs Después)

Para verificar visualmente el modelo modificado:
1. Centrar la cámara calculando la distancia óptica según el Bounding Box:
   $$\text{distance} = \frac{\text{max}(\text{dimensions})}{2 \cdot \tan(\text{FOV} / 2)} \cdot 1.5$$
2. Iluminación cinematográfica de 3 puntos (Key Light frontal cálida, Fill Light fría suave, Rim Light trasera para recortar silueta).
3. Motor `BLENDER_EEVEE` a 1080x1080 con samples moderados para renderizar en < 2 segundos.

---

## 5. Reglas de Exportación de GLB

Para preservar compatibilidad total con Three.js y motores web:
* `export_format='GLB'`
* `export_apply=True` (aplica transformaciones de escala/rotación)
* `export_materials='EXPORT'`
* `export_draco_mesh_compression_enable=False` (o True si se busca tamaño ultra liviano)
* `export_colors=True`
* `export_normals=True`

---

## 6. Generación de Dioramas y Cinematografía con Props CC0

Para generar escenas de exhibición de productos, dioramas o tomas de héroe cinematográficas:
1. **Composición Modular**: Usar pedestales base (`platform-grass-large-round.glb` en `storage/assets/models/platformer/`), vegetación en los bordes y props en capas de profundidad.
2. **Cámara con Depth of Field (DoF Bokeh)**:
   * En Blender 5.x / 4.x la propiedad para el objeto de enfoque es obligatoriamente `cam_data.dof.focus_object = target_empty` (no `focus_target`).
   * Configurar `cam_data.dof.aperture_fstop = 2.4` y `cam_data.dof.aperture_blades = 7` para bokeh cremoso de cine.
3. **Iluminación de 3 Puntos + Rim Light Kicker**:
   * Key Light (Sun cálido a 45°).
   * Fill Light (Area suave fría frontal-lateral).
   * Rim Light Kicker (Spot trasero de alta intensidad para recortar silueta).
   * Bounce Light suave ascendente desde el pedestal.
4. **Color Management**:
   * Usar `view_transform = 'AgX'` con `look = 'AgX - Medium High Contrast'` para retener detalle en altas luces sin quemar ni apagar los colores.

