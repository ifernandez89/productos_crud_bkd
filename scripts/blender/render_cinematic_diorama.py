"""
Script de Renderizado Cinematográfico 3D y Generador de Dioramas en Blender 5.2 LTS Headless.
Ecosistema JarBees / productos_crud_bkd.

Composición:
- Pedestal modular estilizado (césped o plataforma suspendida).
- Sujeto Hero (personaje con esqueleto posado en fotograma clave, o producto del catálogo).
- Props complementarios (moneda dorada con shader PBR reflectivo, bloques, nubes multicapa).
- Iluminación cinematográfica de 3 puntos (Key cálida, Fill fría, Rim kicker de alto contraste).
- Cámara cinematográfica con Depth of Field (DoF Bokeh) y gestión de color AgX.

Uso:
  blender -b --python-exit-code 1 -P scripts/blender/render_cinematic_diorama.py -- [opciones]
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

    parser = argparse.ArgumentParser(description="Render cinematográfico 3D de diorama")
    parser.add_argument("--hero", default="character", help="Ruta al modelo GLB del héroe o 'character'")
    parser.add_argument("--action", default="jump", help="Animación para el personaje ('jump', 'walk', 'idle', 'none')")
    parser.add_argument("--frame", type=int, default=6, help="Fotograma clave de la animación")
    parser.add_argument("--pedestal", default="grass-round", help="Tipo de pedestal ('grass-round', 'large', 'none')")
    parser.add_argument("--mood", default="golden_hour", help="Atmósfera lumínica ('golden_hour', 'cyberpunk', 'daylight', 'studio')")
    parser.add_argument("--width", type=int, default=2048, help="Ancho de resolución")
    parser.add_argument("--height", type=int, default=1536, help="Alto de resolución")
    parser.add_argument("--samples", type=int, default=64, help="Muestras EEVEE")
    parser.add_argument("--output", default="storage/assets/renders/platformer_cinematic_hero.png", help="Ruta de salida PNG")
    parser.add_argument("--include-props", action="store_true", default=True, help="Incluir nubes, moneda y hierba")

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

def setup_world_environment(assets_dir, mood="golden_hour"):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Cinematic_Diorama_World")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()

    node_out = nodes.new(type='ShaderNodeOutputWorld')
    node_bg = nodes.new(type='ShaderNodeBackground')

    skybox_path = os.path.join(assets_dir, "textures", "skybox", "platformer_skybox.png")
    if os.path.exists(skybox_path):
        node_env = nodes.new(type='ShaderNodeTexEnvironment')
        node_env.image = bpy.data.images.load(skybox_path)
        
        # Mapeo y rotación del cielo panorámico
        node_coord = nodes.new(type='ShaderNodeTexCoord')
        node_mapping = nodes.new(type='ShaderNodeMapping')
        node_mapping.inputs['Rotation'].default_value[2] = math.radians(110)
        
        links.new(node_coord.outputs['Generated'], node_mapping.inputs['Vector'])
        links.new(node_mapping.outputs['Vector'], node_env.inputs['Vector'])
        links.new(node_env.outputs['Color'], node_bg.inputs['Color'])
        
        # Intensidad según mood
        if mood == "golden_hour":
            node_bg.inputs['Strength'].default_value = 1.15
        elif mood == "cyberpunk":
            node_bg.inputs['Strength'].default_value = 0.5
        else:
            node_bg.inputs['Strength'].default_value = 1.0
    else:
        # Fallback de color sólido según mood
        if mood == "golden_hour":
            node_bg.inputs['Color'].default_value = (0.2, 0.35, 0.55, 1.0)
        else:
            node_bg.inputs['Color'].default_value = (0.1, 0.15, 0.25, 1.0)
        node_bg.inputs['Strength'].default_value = 1.0

    links.new(node_bg.outputs['Background'], node_out.inputs['Surface'])

def setup_cinematic_lighting(mood="golden_hour"):
    scene = bpy.context.scene

    if mood == "golden_hour":
        key_color = (1.0, 0.90, 0.75)   # Ámbar dorado cálido
        fill_color = (0.45, 0.70, 0.95)  # Cian/celeste crepuscular suave
        rim_color = (1.0, 0.65, 0.25)   # Naranja intenso de silueta
        key_energy = 5.5
        fill_energy = 160.0
        rim_energy = 420.0
    elif mood == "cyberpunk":
        key_color = (0.15, 0.90, 1.0)   # Neón cian
        fill_color = (0.85, 0.10, 0.70)  # Magenta neón
        rim_color = (0.2, 1.0, 0.4)     # Verde esmeralda
        key_energy = 6.0
        fill_energy = 200.0
        rim_energy = 500.0
    elif mood == "studio":
        key_color = (1.0, 0.98, 0.95)   # Blanco estudio puro
        fill_color = (0.85, 0.90, 1.0)   # Relleno frío
        rim_color = (1.0, 0.95, 0.85)   # Recorte suave
        key_energy = 5.0
        fill_energy = 180.0
        rim_energy = 300.0
    else: # daylight
        key_color = (1.0, 0.96, 0.90)
        fill_color = (0.6, 0.8, 1.0)
        rim_color = (1.0, 0.9, 0.7)
        key_energy = 5.0
        fill_energy = 140.0
        rim_energy = 280.0

    # 1. Key Light (Luz Principal con sombras direccionales)
    bpy.ops.object.light_add(type='SUN', location=(4.0, -5.0, 6.5))
    key_light = bpy.context.active_object
    key_light.name = "Key_Light_Sun"
    key_light.data.energy = key_energy
    key_light.data.color = key_color
    key_light.rotation_euler = (math.radians(50), math.radians(15), math.radians(40))

    # 2. Fill Light (Área suave frontal-lateral para levantar sombras)
    bpy.ops.object.light_add(type='AREA', location=(-3.5, -4.0, 2.5))
    fill_light = bpy.context.active_object
    fill_light.name = "Fill_Light_Area"
    fill_light.data.shape = 'RECTANGLE'
    fill_light.data.size = 4.0
    fill_light.data.size_y = 3.0
    fill_light.data.energy = fill_energy
    fill_light.data.color = fill_color
    fill_light.rotation_euler = (math.radians(35), math.radians(-25), math.radians(-40))

    # 3. Rim Light / Kicker (Luz trasera para delinear bordes y siluetas)
    bpy.ops.object.light_add(type='SPOT', location=(2.8, 4.0, 4.0))
    rim_light = bpy.context.active_object
    rim_light.name = "Rim_Light_Kicker"
    rim_light.data.energy = rim_energy
    rim_light.data.color = rim_color
    rim_light.data.spot_size = math.radians(65)
    rim_light.data.spot_blend = 0.4
    rim_light.rotation_euler = (math.radians(-45), math.radians(30), math.radians(140))

    # 4. Bounce / Ground Uplight (Rebote sutil de césped)
    bpy.ops.object.light_add(type='AREA', location=(0.0, 0.0, -0.5))
    bounce_light = bpy.context.active_object
    bounce_light.name = "Bounce_Light_Ground"
    bounce_light.data.energy = 40.0
    bounce_light.data.color = (0.35, 0.75, 0.30) # Verde césped
    bounce_light.data.size = 3.0
    bounce_light.rotation_euler = (math.radians(180), 0, 0)

def import_glb_collection(glb_path, collection_name):
    initial_objects = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    new_objects = [o for o in bpy.data.objects if o not in initial_objects]

    col = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(col)
    for obj in new_objects:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        col.objects.link(obj)

    return new_objects, col

def setup_diorama_pedestal(assets_dir, pedestal_type="grass-round"):
    if pedestal_type == "none":
        return None

    pedestal_file = "platform-grass-large-round.glb" if pedestal_type == "grass-round" else "platform-large.glb"
    pedestal_path = os.path.join(assets_dir, "models", "platformer", pedestal_file)
    if not os.path.exists(pedestal_path):
        print(f"[Aviso] No se encontró el archivo de pedestal: {pedestal_path}")
        return None

    objs, col = import_glb_collection(pedestal_path, "Pedestal_Collection")
    # Centrar pedestal en el origen
    for obj in objs:
        if obj.parent is None:
            obj.location = (0, 0, 0)

    # Añadir detalle de hierba decorativa sobre el borde del pedestal
    grass_path = os.path.join(assets_dir, "models", "platformer", "grass.glb")
    grass_small_path = os.path.join(assets_dir, "models", "platformer", "grass-small.glb")

    grass_positions = [
        ((1.4, 0.4, 0.95), math.radians(15), 1.2),
        ((-1.3, -0.5, 0.95), math.radians(75), 1.0),
        ((0.5, 1.3, 0.95), math.radians(-40), 1.1),
        ((-0.8, 1.2, 0.95), math.radians(110), 0.9),
    ]

    for i, (pos, rot_z, scale) in enumerate(grass_positions):
        model_file = grass_path if i % 2 == 0 else grass_small_path
        if os.path.exists(model_file):
            g_objs, g_col = import_glb_collection(model_file, f"Grass_Prop_{i}")
            for g in g_objs:
                if g.parent is None:
                    g.location = pos
                    g.rotation_euler[2] = rot_z
                    g.scale = (scale, scale, scale)

    return objs

def setup_hero(assets_dir, hero_arg="character", action_name="jump", frame=6):
    if hero_arg == "character":
        hero_path = os.path.join(assets_dir, "models", "platformer", "character.glb")
    else:
        hero_path = os.path.abspath(hero_arg)

    if not os.path.exists(hero_path):
        raise FileNotFoundError(f"No existe el modelo hero: {hero_path}")

    objs, col = import_glb_collection(hero_path, "Hero_Collection")

    # Localizar nodo raíz
    root_obj = next((o for o in objs if o.parent is None), objs[0])
    
    # Elevar y rotar hacia la cámara de forma dinámica
    if action_name == "jump":
        root_obj.location = (0.0, -0.15, 1.45) # Suspendido en el aire sobre el pedestal
        root_obj.rotation_euler = (math.radians(-10), math.radians(5), math.radians(35))
    else:
        root_obj.location = (0.0, 0.0, 0.95)
        root_obj.rotation_euler = (0, 0, math.radians(35))

    # Aplicar animación si existe
    if action_name and action_name != "none":
        # Buscar la acción en los datos importados
        matching_actions = [a for a in bpy.data.actions if action_name.lower() in a.name.lower()]
        if matching_actions:
            target_action = matching_actions[0]
            print(f"[Hero] Aplicando acción '{target_action.name}' en fotograma {frame}")
            
            # Asignar la acción a los objetos con datos de animación
            for obj in objs:
                if obj.animation_data:
                    obj.animation_data.action = target_action
                elif obj.type in ('ARMATURE', 'EMPTY', 'MESH'):
                    obj.animation_data_create()
                    obj.animation_data.action = target_action

            bpy.context.scene.frame_set(frame)

    return root_obj, objs

def setup_floating_props(assets_dir):
    props_created = []

    # 1. Moneda dorada brillante alcanzada por el héroe
    coin_path = os.path.join(assets_dir, "models", "platformer", "coin.glb")
    if os.path.exists(coin_path):
        c_objs, c_col = import_glb_collection(coin_path, "Coin_Prop")
        c_root = next((o for o in c_objs if o.parent is None), c_objs[0])
        c_root.location = (0.55, -0.45, 2.35) # Arriba a la derecha de la mano del héroe
        c_root.rotation_euler = (math.radians(25), math.radians(45), math.radians(30))
        c_root.scale = (1.35, 1.35, 1.35)

        # Mejorar material de la moneda con acabado dorado PBR ultra reflectivo
        for obj in c_objs:
            if obj.type == 'MESH':
                for slot in obj.material_slots:
                    if slot.material and slot.material.use_nodes:
                        bsdf = slot.material.node_tree.nodes.get("Principled BSDF")
                        if bsdf:
                            bsdf.inputs['Metallic'].default_value = 0.96
                            bsdf.inputs['Roughness'].default_value = 0.16
                            if 'Specular IOR Level' in bsdf.inputs:
                                bsdf.inputs['Specular IOR Level'].default_value = 0.9

        # Luz puntual propia dorada para la moneda (efecto glow de ítem)
        bpy.ops.object.light_add(type='POINT', location=(0.55, -0.45, 2.45))
        coin_glow = bpy.context.active_object
        coin_glow.name = "Coin_Glow_Light"
        coin_glow.data.energy = 25.0
        coin_glow.data.color = (1.0, 0.85, 0.35)
        coin_glow.data.shadow_soft_size = 0.25

        props_created.append("coin")

    # 2. Bloque misterioso o ladrillo en el fondo derecho
    block_path = os.path.join(assets_dir, "models", "platformer", "block-coin.glb")
    if os.path.exists(block_path):
        b_objs, b_col = import_glb_collection(block_path, "Block_Prop")
        b_root = next((o for o in b_objs if o.parent is None), b_objs[0])
        b_root.location = (2.2, 1.2, 2.6)
        b_root.rotation_euler = (math.radians(5), math.radians(10), math.radians(-25))
        b_root.scale = (0.85, 0.85, 0.85)
        props_created.append("block-coin")

    # 3. Nubes volumétricas estilizadas en capas de profundidad (Bokeh DoF)
    cloud_path = os.path.join(assets_dir, "models", "platformer", "cloud.glb")
    if os.path.exists(cloud_path):
        cloud_configs = [
            # Nube 1: Plano medio izquierdo detrás del héroe
            ((-2.4, 0.8, 2.2), (0, 0, math.radians(20)), (1.2, 1.2, 1.2)),
            # Nube 2: Plano de fondo alto
            ((2.8, 3.2, 4.0), (0, 0, math.radians(-45)), (1.6, 1.6, 1.6)),
            # Nube 3: Primer plano derecha muy cerca de la cámara (se desenfoca deliciosamente con DoF)
            ((1.6, -2.2, 0.8), (0, 0, math.radians(10)), (0.9, 0.9, 0.9)),
        ]

        for i, (loc, rot, scl) in enumerate(cloud_configs):
            cl_objs, cl_col = import_glb_collection(cloud_path, f"Cloud_Layer_{i}")
            cl_root = next((o for o in cl_objs if o.parent is None), cl_objs[0])
            cl_root.location = loc
            cl_root.rotation_euler = rot
            cl_root.scale = scl
            props_created.append(f"cloud_{i}")

    return props_created

def setup_cinematic_camera(focus_target_location, focal_length=52, fstop=2.4):
    scene = bpy.context.scene

    # Target Empty de enfoque para la cámara
    target_empty = bpy.data.objects.new("Camera_Focus_Target", None)
    target_empty.empty_display_type = 'SPHERE'
    target_empty.empty_display_size = 0.2
    target_empty.location = focus_target_location
    scene.collection.objects.link(target_empty)

    # Crear Cámara de Cine
    cam_data = bpy.data.cameras.new("Cinematic_Camera")
    cam_data.lens = focal_length
    cam_data.sensor_width = 36.0 # Sensor Full-Frame 35mm
    
    # Configuración de Depth of Field (DoF) Bokeh
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = target_empty
    cam_data.dof.aperture_fstop = fstop
    cam_data.dof.aperture_blades = 7 # Bokeh heptagonal suave de cine

    cam_obj = bpy.data.objects.new("Cinematic_Camera_Obj", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Posición cinematográfica: ángulo 3/4 ligeramente contrapicado (Hero Shot)
    # Distancia aproximada ~4.5m con ángulo hacia el target
    cam_obj.location = (1.3, -4.2, 2.1)

    # Constraint Track-To hacia el target
    track_con = cam_obj.constraints.new(type='TRACK_TO')
    track_con.target = target_empty
    track_con.track_axis = 'TRACK_NEGATIVE_Z'
    track_con.up_axis = 'UP_Y'

    return cam_obj, target_empty

def render_scene(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    bpy.context.scene.render.filepath = os.path.abspath(output_path)
    print(f"[Render] Iniciando renderizado en {output_path}...")
    bpy.ops.render.render(write_still=True)
    print(f"[Render] Finalizado con éxito.")

def main():
    args = parse_args()
    print("=" * 70)
    print("🎬 GENERADOR DE DIORAMA CINEMATOGRÁFICO 3D - BLENDER HEADLESS")
    print("=" * 70)

    # Rutas base
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    assets_dir = os.path.join(project_root, "storage", "assets")

    # 1. Resetear escena a blanco
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2. Configurar motor de renderizado y gestión de color AgX
    setup_eevee_renderer(args.width, args.height, args.samples)

    # 3. Configurar entorno del mundo y cielo panorámico
    setup_world_environment(assets_dir, mood=args.mood)

    # 4. Esquema de iluminación cinematográfica de 3 puntos
    setup_cinematic_lighting(mood=args.mood)

    # 5. Cargar pedestal y escenario base
    setup_diorama_pedestal(assets_dir, pedestal_type=args.pedestal)

    # 6. Cargar y posar sujeto héroe
    hero_root, hero_objs = setup_hero(assets_dir, hero_arg=args.hero, action_name=args.action, frame=args.frame)

    # 7. Cargar props complementarios (moneda, nubes, bloques)
    props = []
    if args.include_props:
        props = setup_floating_props(assets_dir)

    # 8. Cámara de cine con DoF enfocada en el pecho/cabeza del héroe
    focus_loc = hero_root.location.copy()
    focus_loc.z += 0.45
    setup_cinematic_camera(focus_loc, focal_length=54, fstop=2.4)

    # 9. Ejecutar render
    output_abs = os.path.abspath(args.output)
    render_scene(output_abs)

    # 10. Emitir reporte estructurado JSON
    result = {
        "status": "success",
        "output": output_abs,
        "width": args.width,
        "height": args.height,
        "hero": args.hero,
        "action": args.action,
        "frame": args.frame,
        "pedestal": args.pedestal,
        "mood": args.mood,
        "props": props,
        "objects_in_scene": len(bpy.data.objects),
        "materials_in_scene": len(bpy.data.materials)
    }

    print(">>> DIORAMA_RENDER_START >>>")
    print(json.dumps(result, indent=2))
    print("<<< DIORAMA_RENDER_END <<<")

if __name__ == "__main__":
    main()
