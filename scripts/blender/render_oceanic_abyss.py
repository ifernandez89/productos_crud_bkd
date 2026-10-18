"""
Script de Renderizado Submarino Cinematográfico en Blender 5.2 LTS Headless.
Estilo: 'Ecco the Dolphin' (Dreamcast Aesthetic x 2026 Photorealism).
Sujeto: Ballena jorobada (Humpback Whale) surcando el abismo oceánico.

Características:
- Volumetría submarina con rayos crepusculares (god rays / sunbeams).
- Proyección de cáusticas marinas dinámicas sobre el dorso de la ballena.
- Malla de banco de peces y plancton bioluminiscente en planos de profundidad.
- Subsurface Scattering (SSS) sutil en aletas y bordes dérmicos.
- Cámara cinematográfica con Depth of Field (DoF Bokeh) f/2.8 y encuadre 3/4 heroico.
- Gestión de color AgX (Medium High Contrast) para retener azules profundos y altas luces celestes.

Uso:
  blender -b --python-exit-code 1 -P scripts/blender/render_oceanic_abyss.py -- [opciones]
"""

import sys
import os
import math
import argparse
import json
import bpy
from mathutils import Vector, Euler

def parse_args():
    argv = sys.argv
    if "--" in argv:
        args_to_parse = argv[argv.index("--") + 1:]
    else:
        args_to_parse = []

    parser = argparse.ArgumentParser(description="Render submarino cinematográfico estilo Ecco the Dolphin")
    parser.add_argument("--whale", default=r"G:\new models\Ballena jorobada.glb", help="Ruta al modelo GLB de la ballena")
    parser.add_argument("--fish-school", default=r"G:\new models\Banco de peces.glb", help="Ruta al modelo del banco de peces")
    parser.add_argument("--width", type=int, default=2560, help="Ancho de resolución (default 2560 - 1440p)")
    parser.add_argument("--height", type=int, default=1440, help="Alto de resolución (default 1440)")
    parser.add_argument("--samples", type=int, default=64, help="Muestras EEVEE")
    parser.add_argument("--output", default="storage/assets/renders/ecco_whale_cinematic_abyss.png", help="Ruta de salida")
    parser.add_argument("--include-particles", action="store_true", default=True, help="Incluir partículas de plancton y burbujas")

    return parser.parse_args(args_to_parse)

def setup_eevee_renderer(width, height, samples):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'

    # Color Management AgX
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'

    return scene

def setup_oceanic_world():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Oceanic_Abyss_World")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()

    node_out = nodes.new(type='ShaderNodeOutputWorld')
    
    # 1. Background Surface con Gradiente Vertical (Abismo zafiro en el fondo -> Turquesa radiante en superficie)
    node_bg = nodes.new(type='ShaderNodeBackground')
    node_coord = nodes.new(type='ShaderNodeTexCoord')
    node_mapping = nodes.new(type='ShaderNodeMapping')
    node_grad = nodes.new(type='ShaderNodeTexGradient')
    node_grad.gradient_type = 'LINEAR'
    node_ramp = nodes.new(type='ShaderNodeValToRGB')

    # Color 0 (Fondo abisal): Azul zafiro medianoche
    node_ramp.color_ramp.elements[0].position = 0.25
    node_ramp.color_ramp.elements[0].color = (0.010, 0.05, 0.18, 1.0)
    # Color 1 (Superficie marina): Turquesa cian radiante estilo Dreamcast
    node_ramp.color_ramp.elements[1].position = 0.85
    node_ramp.color_ramp.elements[1].color = (0.04, 0.52, 0.72, 1.0)

    # Mapeo rotado para que el gradiente sea vertical (eje Z)
    node_mapping.inputs['Rotation'].default_value[1] = math.radians(90)
    node_mapping.inputs['Location'].default_value[0] = 0.5

    links.new(node_coord.outputs['Generated'], node_mapping.inputs['Vector'])
    links.new(node_mapping.outputs['Vector'], node_grad.inputs['Vector'])
    links.new(node_grad.outputs['Fac'], node_ramp.inputs['Fac'])
    links.new(node_ramp.outputs['Color'], node_bg.inputs['Color'])
    node_bg.inputs['Strength'].default_value = 0.95
    links.new(node_bg.outputs['Background'], node_out.inputs['Surface'])

    # 2. Volumetric Scatter (Dispersión de luz submarina para God Rays)
    node_vol = nodes.new(type='ShaderNodeVolumeScatter')
    node_vol.inputs['Color'].default_value = (0.10, 0.60, 0.80, 1.0) # Turquesa marino acuático
    node_vol.inputs['Density'].default_value = 0.035 # Densidad óptima para rayos definidos sin opacar
    node_vol.inputs['Anisotropy'].default_value = 0.70 # Forward scattering potente (estilo haz de luz)
    links.new(node_vol.outputs['Volume'], node_out.inputs['Volume'])

def setup_oceanic_lighting():
    scene = bpy.context.scene

    # 1. Sunbeam / God Rays Principal (Penetra desde la superficie con rayos volumétricos)
    bpy.ops.object.light_add(type='SUN', location=(3.5, -2.5, 12.0))
    sun = bpy.context.active_object
    sun.name = "Oceanic_Sun_Rays"
    sun.data.energy = 28.0
    sun.data.color = (0.35, 0.95, 1.0) # Turquesa tropical radiante
    sun.rotation_euler = (math.radians(32), math.radians(18), math.radians(40))

    # 2. Key Light Frontal (Ilumina la cara, ojo y pliegues ventrales de la ballena)
    bpy.ops.object.light_add(type='AREA', location=(2.2, -4.8, 1.5))
    key_frontal = bpy.context.active_object
    key_frontal.name = "Whale_Frontal_Key"
    key_frontal.data.shape = 'RECTANGLE'
    key_frontal.data.size = 5.5
    key_frontal.data.size_y = 4.0
    key_frontal.data.energy = 1500.0
    key_frontal.data.color = (0.50, 0.88, 0.98) # Azul turquesa claro
    key_frontal.rotation_euler = (math.radians(15), math.radians(22), math.radians(22))

    # 3. Proyector de Cáusticas Cenital Ampliado (Patrón de agua refractada sobre el lomo, aletas y rostro)
    bpy.ops.object.light_add(type='SPOT', location=(0.6, -1.0, 5.2))
    caustics_light = bpy.context.active_object
    caustics_light.name = "Caustics_Projector_Light"
    caustics_light.data.energy = 14000.0
    caustics_light.data.color = (0.75, 1.0, 1.0)
    caustics_light.data.spot_size = math.radians(105)
    caustics_light.data.spot_blend = 0.55
    caustics_light.rotation_euler = (math.radians(12), math.radians(8), math.radians(15))

    # Proyección procedural de cáusticas Voronoi
    caustics_light.data.use_nodes = True
    lt_tree = caustics_light.data.node_tree
    lt_nodes = lt_tree.nodes
    lt_links = lt_tree.links
    emission = lt_nodes.get("Emission")
    if emission:
        voronoi = lt_nodes.new(type='ShaderNodeTexVoronoi')
        voronoi.feature = 'SMOOTH_F1'
        voronoi.inputs['Scale'].default_value = 7.5
        
        ramp = lt_nodes.new(type='ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[0].color = (0.15, 0.45, 0.65, 1.0)
        ramp.color_ramp.elements[1].position = 0.80
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)

        lt_links.new(voronoi.outputs['Distance'], ramp.inputs['Fac'])
        lt_links.new(ramp.outputs['Color'], emission.inputs['Color'])

    # 4. Fill Light Lateral Izquierda (Levanta sombras profundas con azul zafiro)
    bpy.ops.object.light_add(type='AREA', location=(-4.5, -2.5, 0.5))
    fill_left = bpy.context.active_object
    fill_left.name = "Abyss_Fill_Left"
    fill_left.data.shape = 'RECTANGLE'
    fill_left.data.size = 6.0
    fill_left.data.size_y = 6.0
    fill_left.data.energy = 850.0
    fill_left.data.color = (0.08, 0.38, 0.72)
    fill_left.rotation_euler = (math.radians(10), math.radians(-45), math.radians(-70))

    # 5. Rim Kicker Trasero Superior (Delinea silueta de lomo y aleta caudal)
    bpy.ops.object.light_add(type='SPOT', location=(-1.5, 5.0, 3.8))
    rim = bpy.context.active_object
    rim.name = "Oceanic_Rim_Kicker"
    rim.data.energy = 9500.0
    rim.data.color = (0.25, 1.0, 0.90) # Esmeralda cian neón
    rim.data.spot_size = math.radians(75)
    rim.data.spot_blend = 0.4
    rim.rotation_euler = (math.radians(-35), math.radians(-10), math.radians(-160))

def import_and_pose_whale(whale_glb_path):
    if not os.path.exists(whale_glb_path):
        raise FileNotFoundError(f"No se encontró el modelo de la ballena: {whale_glb_path}")

    initial_objects = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=whale_glb_path)
    new_objs = [o for o in bpy.data.objects if o not in initial_objects]

    # Agrupar en colección
    col = bpy.data.collections.new("Whale_Collection")
    bpy.context.scene.collection.children.link(col)
    for obj in new_objs:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        col.objects.link(obj)

    root_obj = next((o for o in new_objs if o.parent is None), new_objs[0])

    # Pose majestuosa: navegando en diagonal ascendente hacia la luz superior derecha
    root_obj.location = (0.0, 0.0, 0.4)
    root_obj.rotation_euler = (math.radians(12), math.radians(-8), math.radians(-35))

    # Calibrar sombreador dérmico de la ballena (piel cetácea húmeda con SSS sutil)
    for obj in new_objs:
        if obj.type == 'MESH':
            for slot in obj.material_slots:
                mat = slot.material
                if mat and mat.use_nodes:
                    bsdf = mat.node_tree.nodes.get("Principled BSDF")
                    if bsdf:
                        bsdf.inputs['Roughness'].default_value = 0.22
                        if 'Specular IOR Level' in bsdf.inputs:
                            bsdf.inputs['Specular IOR Level'].default_value = 0.75
                        
                        if 'Subsurface Weight' in bsdf.inputs:
                            bsdf.inputs['Subsurface Weight'].default_value = 0.12
                            bsdf.inputs['Subsurface Radius'].default_value = (0.1, 0.35, 0.5)

    return root_obj, new_objs

def setup_background_fish_school(fish_glb_path):
    if not os.path.exists(fish_glb_path):
        print(f"[Aviso] No se encontró el modelo del banco de peces: {fish_glb_path}")
        return None

    initial_objects = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=fish_glb_path)
    fish_objs = [o for o in bpy.data.objects if o not in initial_objects]

    col = bpy.data.collections.new("Fish_School_Collection")
    bpy.context.scene.collection.children.link(col)
    for obj in fish_objs:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        col.objects.link(obj)

    root_fish = next((o for o in fish_objs if o.parent is None), fish_objs[0])

    # Escalar y ubicar en plano de fondo medio directamente visible detrás de la aleta
    root_fish.scale = (0.045, 0.045, 0.045)
    root_fish.location = (-1.4, 3.2, 1.6)
    root_fish.rotation_euler = (math.radians(8), math.radians(-10), math.radians(-35))

    for obj in fish_objs:
        if obj.type == 'MESH':
            for slot in obj.material_slots:
                mat = slot.material
                if mat and mat.use_nodes:
                    bsdf = mat.node_tree.nodes.get("Principled BSDF")
                    if bsdf:
                        if 'Emission Color' in bsdf.inputs:
                            bsdf.inputs['Emission Color'].default_value = (0.4, 0.90, 1.0, 1.0)
                            bsdf.inputs['Emission Strength'].default_value = 0.45
                        elif 'Emission' in bsdf.inputs:
                            bsdf.inputs['Emission'].default_value = (0.2, 0.4, 0.5, 1.0)

    return fish_objs

def setup_marine_particles():
    """Genera nieve marina (plancton suspendido y micro-burbujas translúcidas)"""
    part_col = bpy.data.collections.new("Marine_Plankton_Particles")
    bpy.context.scene.collection.children.link(part_col)

    # Material bioluminiscente tenue de plancton suave
    mat_plankton = bpy.data.materials.new("Plankton_Bioluminescent")
    mat_plankton.use_nodes = True
    p_tree = mat_plankton.node_tree
    p_nodes = p_tree.nodes
    p_nodes.clear()
    
    p_out = p_nodes.new(type='ShaderNodeOutputMaterial')
    p_emit = p_nodes.new(type='ShaderNodeEmission')
    p_emit.inputs['Color'].default_value = (0.50, 0.95, 1.0, 1.0) # Cian luminoso suave
    p_emit.inputs['Strength'].default_value = 1.2
    p_tree.links.new(p_emit.outputs['Emission'], p_out.inputs['Surface'])

    # Coordenadas distribuidas en el campo de visión
    import random
    random.seed(42) # Determinismo para render idéntico siempre

    for i in range(65):
        # Dispersar partículas alrededor de la ballena y cerca de la cámara
        x = random.uniform(-3.2, 3.5)
        y = random.uniform(-4.8, 3.2)
        z = random.uniform(-1.2, 4.0)
        radius = random.uniform(0.004, 0.015) # Escala micro-mote delicada

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=(x, y, z))
        p_obj = bpy.context.active_object
        p_obj.name = f"Marine_Snow_{i}"
        bpy.ops.object.shade_smooth()
        p_obj.data.materials.append(mat_plankton)

        for c in p_obj.users_collection:
            c.objects.unlink(p_obj)
        part_col.objects.link(p_obj)

def setup_cinematic_camera(focus_point):
    scene = bpy.context.scene

    # Target de enfoque (Empty en el ojo/cabeza de la ballena)
    target = bpy.data.objects.new("Camera_Focus_Target_Whale", None)
    target.empty_display_type = 'SPHERE'
    target.empty_display_size = 0.3
    target.location = focus_point
    scene.collection.objects.link(target)

    # Cámara de cine
    cam_data = bpy.data.cameras.new("Oceanic_Cinematic_Camera")
    cam_data.lens = 38.0 # Gran angular cinematográfico (38mm) para enfatizar la escala monumental
    cam_data.sensor_width = 36.0 # 35mm Full Frame

    # Depth of Field con bokeh suave
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = target
    cam_data.dof.aperture_fstop = 2.8
    cam_data.dof.aperture_blades = 8

    cam_obj = bpy.data.objects.new("Oceanic_Camera_Obj", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Posición cinematográfica: contrapicado elegante desde el cuadrante frontal inferior
    # Ángulo 3/4 mirando hacia arriba mientras la ballena nada hacia la luz
    cam_obj.location = (2.2, -4.8, 0.2)

    # Track to constraint
    track = cam_obj.constraints.new(type='TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'

    return cam_obj, target

def render_scene(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    bpy.context.scene.render.filepath = os.path.abspath(output_path)
    print(f"[Render] Guardando render en: {output_path}...")
    bpy.ops.render.render(write_still=True)
    print(f"[Render] Render completado con éxito.")

def main():
    args = parse_args()
    print("=" * 70)
    print("🌊 ECCO THE DOLPHIN OCEANIC ABYSS - BLENDER 5.2 HEADLESS RENDERER")
    print("=" * 70)

    # 1. Limpiar escena
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2. Configurar motor EEVEE Next y color AgX
    setup_eevee_renderer(args.width, args.height, args.samples)

    # 3. Configurar entorno abisal y volumetría marina
    setup_oceanic_world()

    # 4. Esquema de iluminación: Sol de superficie, cáusticas Voronoi, relleno abisal y rim kicker
    setup_oceanic_lighting()

    # 5. Cargar y posar Ballena Jorobada
    whale_root, whale_objs = import_and_pose_whale(args.whale)

    # 6. Cargar Banco de Peces secundario en el fondo medio
    fish_objs = setup_background_fish_school(args.fish_school)

    # 7. Generar nieve marina y partículas bioluminiscentes
    if args.include_particles:
        setup_marine_particles()

    # 8. Cámara de cine con DoF enfocada en el rostro/ojo de la ballena
    focus_loc = whale_root.location.copy()
    focus_loc.x += 0.4
    focus_loc.y -= 0.6
    focus_loc.z += 0.2
    setup_cinematic_camera(focus_loc)

    # 9. Ejecutar render
    output_abs = os.path.abspath(args.output)
    render_scene(output_abs)

    # 10. Emitir reporte JSON estructurado
    result = {
        "status": "success",
        "output": output_abs,
        "width": args.width,
        "height": args.height,
        "whale_model": args.whale,
        "fish_school_included": fish_objs is not None,
        "objects_in_scene": len(bpy.data.objects),
        "materials_in_scene": len(bpy.data.materials),
    }

    print(">>> OCEANIC_RENDER_START >>>")
    print(json.dumps(result, indent=2))
    print("<<< OCEANIC_RENDER_END <<<")

if __name__ == "__main__":
    main()
