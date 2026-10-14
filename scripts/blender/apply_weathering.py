"""
apply_weathering.py - Motor de Modificación y Desgaste Procedural PBR en Blender Headless
Parte del pipeline de assets 3D de JarBees.
"""

import sys
import os
import json
import math
import bpy
from mathutils import Vector, Euler

def parse_args():
    argv = sys.argv
    if "--" not in argv:
        return {}
    args = argv[argv.index("--") + 1:]
    parsed = {
        "input": "",
        "output": "",
        "render_before": "",
        "render_after": "",
        "moss_color": [0.20, 0.35, 0.12, 1.0],
        "dirt_color": [0.12, 0.09, 0.06, 1.0],
        "moss_coverage": 0.40,
        "dirt_intensity": 0.50,
        "normal_strength": 0.65,
        "resolution": 1024,
    }
    i = 0
    while i < len(args):
        key = args[i]
        if key == "--input" and i + 1 < len(args):
            parsed["input"] = os.path.abspath(args[i + 1])
            i += 2
        elif key == "--output" and i + 1 < len(args):
            parsed["output"] = os.path.abspath(args[i + 1])
            i += 2
        elif key == "--render-before" and i + 1 < len(args):
            parsed["render_before"] = os.path.abspath(args[i + 1])
            i += 2
        elif key == "--render-after" and i + 1 < len(args):
            parsed["render_after"] = os.path.abspath(args[i + 1])
            i += 2
        elif key == "--moss-coverage" and i + 1 < len(args):
            parsed["moss_coverage"] = float(args[i + 1])
            i += 2
        elif key == "--dirt-intensity" and i + 1 < len(args):
            parsed["dirt_intensity"] = float(args[i + 1])
            i += 2
        elif key == "--normal-strength" and i + 1 < len(args):
            parsed["normal_strength"] = float(args[i + 1])
            i += 2
        elif key == "--resolution" and i + 1 < len(args):
            parsed["resolution"] = int(args[i + 1])
            i += 2
        else:
            i += 1
    return parsed

def get_scene_bbox():
    mesh_objects = [o for o in bpy.data.objects if o.type == 'MESH']
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

    dims = max_coord - min_coord
    center = (max_coord + min_coord) / 2.0
    return dims, center, min_coord, max_coord

def setup_studio(dims, center, resolution):
    scene = bpy.context.scene
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.film_transparent = True
    scene.render.engine = 'BLENDER_EEVEE'

    # Color Management filmico
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'

    max_dim = max(dims.x, dims.y, dims.z)
    distance = max_dim * 2.2

    # Cámara cinemática en ángulo 3/4
    cam_data = bpy.data.cameras.new("StudioCamera")
    cam_data.lens = 75.0
    cam_data.sensor_width = 36.0
    cam_obj = bpy.data.objects.new("StudioCamera", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    cam_angle_deg = 28.0
    cam_elev_deg = 16.0
    rad_h = math.radians(cam_angle_deg)
    rad_v = math.radians(cam_elev_deg)

    cx, cy, cz = center.x, center.y, center.z
    cam_x = cx + distance * math.sin(rad_h) * math.cos(rad_v)
    cam_y = cy - distance * math.cos(rad_h) * math.cos(rad_v)
    cam_z = cz + distance * math.sin(rad_v)
    cam_obj.location = (cam_x, cam_y, cam_z)

    # Orientar cámara hacia el centro
    direction = Vector((cx, cy, cz)) - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # 1. Key Light (frontal cálida)
    key_light = bpy.data.lights.new("KeyLight", 'AREA')
    key_light.energy = max_dim * 450.0
    key_light.size = max_dim * 1.5
    key_light.color = (1.0, 0.95, 0.88)
    key_obj = bpy.data.objects.new("KeyLight", key_light)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (cx + distance * 0.7, cy - distance * 0.9, cz + distance * 0.8)
    key_obj.rotation_euler = (direction).to_track_quat('-Z', 'Y').to_euler()

    # 2. Fill Light (lateral suave fría)
    fill_light = bpy.data.lights.new("FillLight", 'AREA')
    fill_light.energy = max_dim * 180.0
    fill_light.size = max_dim * 2.0
    fill_light.color = (0.85, 0.90, 1.0)
    fill_obj = bpy.data.objects.new("FillLight", fill_light)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (cx - distance * 1.0, cy - distance * 0.6, cz + distance * 0.3)

    # 3. Rim / Kicker Light (trasera rasante)
    rim_light = bpy.data.lights.new("RimLight", 'SPOT')
    rim_light.energy = max_dim * 600.0
    rim_light.spot_size = math.radians(60)
    rim_light.spot_blend = 0.5
    rim_light.color = (0.95, 0.98, 1.0)
    rim_obj = bpy.data.objects.new("RimLight", rim_light)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = (cx - distance * 0.5, cy + distance * 1.0, cz + distance * 0.9)
    rim_dir = Vector((cx, cy, cz)) - rim_obj.location
    rim_obj.rotation_euler = rim_dir.to_track_quat('-Z', 'Y').to_euler()

def apply_weathering_pbr(min_coord, max_coord, moss_color, dirt_color, moss_cov, dirt_int, bump_str):
    height = max_coord.z - min_coord.z
    if height <= 0:
        height = 1.0

    materials_modified = 0
    for mat in bpy.data.materials:
        if not mat or not mat.node_tree:
            continue

        tree = mat.node_tree
        nodes = tree.nodes
        links = tree.links

        principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not principled:
            continue

        # Conservar textura original
        orig_base_socket = None
        orig_base_color = (0.7, 0.7, 0.7, 1.0)
        if principled.inputs['Base Color'].is_linked:
            orig_base_socket = principled.inputs['Base Color'].links[0].from_socket
        else:
            orig_base_color = principled.inputs['Base Color'].default_value

        # ── 1. Nodos de Textura de Ruido Procedural (Macro y Micro) ──
        noise_macro = nodes.new(type='ShaderNodeTexNoise')
        noise_macro.location = (-1200, 200)
        noise_macro.inputs['Scale'].default_value = 8.0
        noise_macro.inputs['Detail'].default_value = 5.0
        noise_macro.inputs['Roughness'].default_value = 0.65

        noise_micro = nodes.new(type='ShaderNodeTexNoise')
        noise_micro.location = (-1200, -200)
        noise_micro.inputs['Scale'].default_value = 28.0
        noise_micro.inputs['Detail'].default_value = 8.0

        # ── 2. Nodos Geométricos (Posición Z y Normal Z) ──
        geom_node = nodes.new(type='ShaderNodeNewGeometry')
        geom_node.location = (-1400, 500)

        sep_pos = nodes.new(type='ShaderNodeSeparateXYZ')
        sep_pos.location = (-1200, 600)
        links.new(geom_node.outputs['Position'], sep_pos.inputs['Vector'])

        sep_norm = nodes.new(type='ShaderNodeSeparateXYZ')
        sep_norm.location = (-1200, 400)
        links.new(geom_node.outputs['Normal'], sep_norm.inputs['Vector'])

        # Máscara de altura (acumulación en base)
        # Normalizar Z a rango 0-1
        map_range_z = nodes.new(type='ShaderNodeMapRange')
        map_range_z.location = (-950, 600)
        map_range_z.inputs['From Min'].default_value = min_coord.z
        map_range_z.inputs['From Max'].default_value = min_coord.z + (height * 0.45)
        map_range_z.inputs['To Min'].default_value = 1.0
        map_range_z.inputs['To Max'].default_value = 0.0
        map_range_z.clamp = True
        links.new(sep_pos.outputs['Z'], map_range_z.inputs['Value'])

        # Multiplicar altura con ruido macro para que el musgo de la base tenga borde orgánico
        math_moss_base = nodes.new(type='ShaderNodeMath')
        math_moss_base.operation = 'MULTIPLY'
        math_moss_base.location = (-750, 450)
        links.new(map_range_z.outputs['Result'], math_moss_base.inputs[0])
        links.new(noise_macro.outputs['Fac'], math_moss_base.inputs[1])

        # ColorRamp para contrastar el musgo
        ramp_moss = nodes.new(type='ShaderNodeValToRGB')
        ramp_moss.location = (-550, 450)
        cov_min = max(0.05, 0.50 - (moss_cov * 0.45))
        cov_max = min(0.95, cov_min + 0.25)
        ramp_moss.color_ramp.elements[0].position = cov_min
        ramp_moss.color_ramp.elements[1].position = cov_max
        links.new(math_moss_base.outputs['Value'], ramp_moss.inputs['Fac'])

        # ColorRamp para suciedad/sedimento en oquedades
        ramp_dirt = nodes.new(type='ShaderNodeValToRGB')
        ramp_dirt.location = (-550, 100)
        ramp_dirt.color_ramp.elements[0].position = 0.35
        ramp_dirt.color_ramp.elements[1].position = min(0.9, 0.35 + dirt_int * 0.5)
        links.new(noise_micro.outputs['Fac'], ramp_dirt.inputs['Fac'])

        # ── 3. Mezclador 1: Piedra Base + Suciedad / Sedimento Oscuro ──
        mix_dirt = nodes.new(type='ShaderNodeMix')
        mix_dirt.data_type = 'RGBA'
        mix_dirt.blend_type = 'MULTIPLY'
        mix_dirt.location = (-300, 150)
        mix_dirt.inputs['Factor'].default_value = dirt_int
        if orig_base_socket:
            links.new(orig_base_socket, mix_dirt.inputs['A'])
        else:
            mix_dirt.inputs['A'].default_value = orig_base_color
        mix_dirt.inputs['B'].default_value = dirt_color

        # ── 4. Mezclador 2: Capa Suciedad + Musgo Vegetal ──
        mix_moss = nodes.new(type='ShaderNodeMix')
        mix_moss.data_type = 'RGBA'
        mix_moss.blend_type = 'MIX'
        mix_moss.location = (-50, 250)
        links.new(ramp_moss.outputs['Color'], mix_moss.inputs['Factor'])
        links.new(mix_dirt.outputs['Result'], mix_moss.inputs['A'])
        mix_moss.inputs['B'].default_value = moss_color

        # Conectar al Principled BSDF Base Color
        links.new(mix_moss.outputs['Result'], principled.inputs['Base Color'])

        # ── 5. Relieve Normal / Bump de Erosión y Porosidad de Piedra ──
        bump_node = nodes.new(type='ShaderNodeBump')
        bump_node.location = (-300, -350)
        bump_node.inputs['Strength'].default_value = bump_str
        bump_node.inputs['Distance'].default_value = 0.05
        links.new(noise_micro.outputs['Fac'], bump_node.inputs['Height'])

        # Si ya había un Normal Map, encadenarlo en Normal
        if principled.inputs['Normal'].is_linked:
            orig_normal = principled.inputs['Normal'].links[0].from_socket
            links.new(orig_normal, bump_node.inputs['Normal'])

        links.new(bump_node.outputs['Normal'], principled.inputs['Normal'])

        # ── 6. Rugosidad Aumentada (Piedra porosa mate + musgo absorbente) ──
        principled.inputs['Roughness'].default_value = 0.88

        materials_modified += 1

    return materials_modified

def main():
    args = parse_args()
    input_file = args.get("input")
    output_file = args.get("output")
    render_before = args.get("render_before")
    render_after = args.get("render_after")

    if not input_file or not os.path.exists(input_file):
        print(json.dumps({"status": "error", "message": f"Archivo de entrada no existe: {input_file}"}))
        sys.exit(1)

    # 1. Cargar escena limpia e importar GLB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=input_file)

    dims, center, min_coord, max_coord = get_scene_bbox()
    mesh_objects = [o for o in bpy.data.objects if o.type == 'MESH']
    total_verts = sum(len(o.data.vertices) for o in mesh_objects)
    total_tris = sum(len(o.data.polygons) for o in mesh_objects)

    # 2. Configurar estudio de render
    setup_studio(dims, center, args["resolution"])

    # 3. Renderizar ANTES
    if render_before:
        os.makedirs(os.path.dirname(render_before), exist_ok=True)
        bpy.context.scene.render.filepath = render_before
        bpy.ops.render.render(write_still=True)
        print(f"✓ Render ANTES guardado: {render_before}")

    # 4. Aplicar Desgaste PBR
    mats_count = apply_weathering_pbr(
        min_coord=min_coord,
        max_coord=max_coord,
        moss_color=args["moss_color"],
        dirt_color=args["dirt_color"],
        moss_cov=args["moss_coverage"],
        dirt_int=args["dirt_intensity"],
        bump_str=args["normal_strength"]
    )
    print(f"✓ Materiales PBR procesados con desgaste: {mats_count}")

    # 5. Renderizar DESPUÉS
    if render_after:
        os.makedirs(os.path.dirname(render_after), exist_ok=True)
        bpy.context.scene.render.filepath = render_after
        bpy.ops.render.render(write_still=True)
        print(f"✓ Render DESPUÉS guardado: {render_after}")

    # 6. Exportar nuevo GLB
    if output_file:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        # Seleccionar solo mallas para exportar sin cámaras ni luces de estudio
        bpy.ops.object.select_all(action='DESELECT')
        for obj in mesh_objects:
            obj.select_set(True)

        bpy.ops.export_scene.gltf(
            filepath=output_file,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_materials='EXPORT',
            export_normals=True,
            export_attributes=True
        )
        print(f"✓ Nuevo modelo GLB exportado: {output_file}")

    result = {
        "status": "success",
        "input": input_file,
        "output": output_file,
        "render_before": render_before,
        "render_after": render_after,
        "materials_modified": mats_count,
        "total_vertices": total_verts,
        "total_triangles": total_tris,
        "parameters": {
            "moss_coverage": args["moss_coverage"],
            "dirt_intensity": args["dirt_intensity"],
            "normal_strength": args["normal_strength"]
        }
    }
    print(">>> WEATHERING_RESULT_START >>>")
    print(json.dumps(result, indent=2))
    print("<<< WEATHERING_RESULT_END <<<")

if __name__ == "__main__":
    main()
