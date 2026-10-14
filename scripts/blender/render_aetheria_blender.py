"""
Script de Renderizado 3D Cinematográfico para Aetheria en Blender 5.2 LTS Headless (v2 Optimizado).
Genera la Ciudadela Celeste flotante con:
- Composición cinematográfica balanceada (Cámara 36mm con Track-To constraint a la Acrópolis).
- Isla flotante esculpida con risco geológico, estratos de roca PBR y agujas basálticas.
- Meseta orgánica con praderas alpinas de alta densidad, sendero de mármol y estanque celestial.
- Cascada frontal majestuosa precipitándose al abismo infinito con bruma volumétrica.
- Gran Templo de Aetheria: escalinatas de crepidoma, peristilo de columnas estriadas corintias
  con capiteles y basas doradas, arquitrabe, frontón clásico con medallón de oro al frente,
  cúpula imperial dorada con tambor de mármol, aguja celestial con orbe de cristal radiante,
  y torres gemelas con miradores y agujas de oro.
- Pebeteros de mármol con llamas sagradas de alta emisión y ventanales con resplandor interior.
- Cristales arcanos gigantes flotando en órbita con energía cian y partículas celestes.
- Arboleda de coníferas estilizadas y cordillera alpina nevada en el fondo crepuscular.
- Esquema de iluminación de estudio de 3 puntos (Key Sun dorado, Fill crepuscular, Rim turquesa).
- Exportación GLB y renderizado PNG 2048x1536 en Blender EEVEE Next con gestión de color AgX.
"""

import bpy
import math
import os
import shutil

def build_aetheria_scene():
    print("=" * 70)
    print("🏛️ GENERANDO AETHERIA V2: CIUDADELA CELESTIAL EN BLENDER 5.2 LTS")
    print("=" * 70)

    # 1. Resetear escena a blanco
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # Configuración de Renderizado EEVEE
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1536
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'

    # Color Management (AgX para un look fílmico de alta fidelidad)
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'

    # World Shader: Cielo crepuscular profundo con gradiente cósmico
    world = bpy.data.worlds.new("Aetheria_Sky_World")
    scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs['Color'].default_value = (0.025, 0.06, 0.14, 1.0)
        bg_node.inputs['Strength'].default_value = 0.85

    # Rutas del proyecto
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    tex_dir = os.path.join(project_root, "storage", "assets", "textures", "pbr")
    rock_diff_path = os.path.join(tex_dir, "rock_boulder_diff_1k.jpg")
    rock_nor_path = os.path.join(tex_dir, "rock_boulder_nor_1k.jpg")
    rock_rough_path = os.path.join(tex_dir, "rock_boulder_rough_1k.jpg")

    # 2. DEFINICIÓN DE MATERIALES PBR
    def create_pbr_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5,
                            emission_color=(0,0,0,1), emission_strength=0.0, transmission=0.0, ior=1.45):
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs['Base Color'].default_value = base_color
            bsdf.inputs['Metallic'].default_value = metallic
            bsdf.inputs['Roughness'].default_value = roughness
            if 'Transmission Weight' in bsdf.inputs:
                bsdf.inputs['Transmission Weight'].default_value = transmission
            if 'IOR' in bsdf.inputs:
                bsdf.inputs['IOR'].default_value = ior
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = emission_color
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = emission_strength
        return mat

    # Material de Roca con mapas PBR reales
    def create_rock_pbr_material():
        mat = bpy.data.materials.new(name="PBR_Rock_Cliff")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        bsdf.inputs['Roughness'].default_value = 0.90

        if os.path.exists(rock_diff_path):
            tex_diff = nodes.new('ShaderNodeTexImage')
            tex_diff.image = bpy.data.images.load(rock_diff_path)
            links.new(tex_diff.outputs['Color'], bsdf.inputs['Base Color'])

        if os.path.exists(rock_nor_path):
            tex_nor = nodes.new('ShaderNodeTexImage')
            tex_nor.image = bpy.data.images.load(rock_nor_path)
            tex_nor.image.colorspace_settings.name = 'Non-Color'
            nor_map = nodes.new('ShaderNodeNormalMap')
            nor_map.inputs['Strength'].default_value = 2.2
            links.new(tex_nor.outputs['Color'], nor_map.inputs['Color'])
            links.new(nor_map.outputs['Normal'], bsdf.inputs['Normal'])

        if os.path.exists(rock_rough_path):
            tex_rough = nodes.new('ShaderNodeTexImage')
            tex_rough.image = bpy.data.images.load(rock_rough_path)
            tex_rough.image.colorspace_settings.name = 'Non-Color'
            links.new(tex_rough.outputs['Color'], bsdf.inputs['Roughness'])

        return mat

    # Material de Césped Alpino Esmeralda
    def create_grass_material():
        mat = bpy.data.materials.new(name="PBR_Grass_Meadow")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")

        tex_noise = nodes.new('ShaderNodeTexNoise')
        tex_noise.inputs['Scale'].default_value = 22.0
        tex_noise.inputs['Detail'].default_value = 5.0

        color_ramp = nodes.new('ShaderNodeValToRGB')
        color_ramp.color_ramp.elements[0].position = 0.25
        color_ramp.color_ramp.elements[0].color = (0.05, 0.22, 0.05, 1.0)
        color_ramp.color_ramp.elements[1].position = 0.75
        color_ramp.color_ramp.elements[1].color = (0.16, 0.42, 0.09, 1.0)

        links.new(tex_noise.outputs['Fac'], color_ramp.inputs['Fac'])
        links.new(color_ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.88
        return mat

    # Material Mármol Imperial con Veteado Suave
    def create_marble_material():
        mat = bpy.data.materials.new(name="PBR_Imperial_Marble")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")

        tex_noise = nodes.new('ShaderNodeTexNoise')
        tex_noise.inputs['Scale'].default_value = 14.0
        tex_noise.inputs['Detail'].default_value = 6.0
        tex_noise.inputs['Roughness'].default_value = 0.65

        color_ramp = nodes.new('ShaderNodeValToRGB')
        color_ramp.color_ramp.elements[0].position = 0.45
        color_ramp.color_ramp.elements[0].color = (0.86, 0.84, 0.80, 1.0)
        color_ramp.color_ramp.elements[1].position = 0.55
        color_ramp.color_ramp.elements[1].color = (0.96, 0.95, 0.92, 1.0)

        links.new(tex_noise.outputs['Fac'], color_ramp.inputs['Fac'])
        links.new(color_ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.24
        return mat

    # Instanciación de materiales
    mat_rock = create_rock_pbr_material()
    mat_grass = create_grass_material()
    mat_marble = create_marble_material()
    mat_gold = create_pbr_material("PBR_Celestial_Gold", base_color=(1.0, 0.74, 0.16, 1.0), metallic=0.96, roughness=0.15)
    mat_plaza_stone = create_pbr_material("PBR_Plaza_Stone", base_color=(0.60, 0.62, 0.66, 1.0), roughness=0.62)
    mat_water = create_pbr_material("PBR_Celestial_Water", base_color=(0.06, 0.62, 0.88, 1.0), roughness=0.04, transmission=0.88, ior=1.333)
    mat_waterfall = create_pbr_material("PBR_Waterfall_Flow", base_color=(0.75, 0.94, 1.0, 1.0), roughness=0.25, transmission=0.45,
                                        emission_color=(0.1, 0.7, 0.9, 1.0), emission_strength=0.8)
    mat_mist = create_pbr_material("PBR_Waterfall_Mist", base_color=(0.88, 0.94, 1.0, 1.0), roughness=0.85, transmission=0.4,
                                   emission_color=(0.3, 0.8, 1.0, 1.0), emission_strength=0.4)
    mat_crystal = create_pbr_material("PBR_Arcane_Crystal", base_color=(0.0, 0.88, 1.0, 1.0), roughness=0.08, transmission=0.82,
                                      emission_color=(0.0, 0.85, 1.0, 1.0), emission_strength=5.5)
    mat_temple_glow = create_pbr_material("PBR_Temple_Window_Glow", base_color=(1.0, 0.75, 0.20, 1.0),
                                          emission_color=(1.0, 0.68, 0.16, 1.0), emission_strength=7.0)
    mat_snow = create_pbr_material("PBR_Alpine_Snow", base_color=(0.98, 0.98, 1.0, 1.0), roughness=0.35)
    mat_wood = create_pbr_material("PBR_Tree_Wood", base_color=(0.20, 0.11, 0.07, 1.0), roughness=0.88)
    mat_pine = create_pbr_material("PBR_Pine_Needles", base_color=(0.06, 0.20, 0.08, 1.0), roughness=0.78)
    mat_cloud = create_pbr_material("PBR_Cloud_Vapor", base_color=(0.90, 0.93, 0.98, 1.0), roughness=0.95)

    print("✓ Materiales PBR inicializados.")

    # 3. GEOMETRÍA DE LA ISLA FLOTANTE
    # Cono invertido de roca masiva con fracturas
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=6.8, radius2=0.5, depth=8.4, location=(0, 0, -4.2))
    cliff_obj = bpy.context.active_object
    cliff_obj.name = "Island_Cliff_Base"
    cliff_obj.rotation_euler[0] = math.pi
    cliff_obj.data.materials.append(mat_rock)

    for v in cliff_obj.data.vertices:
        z = v.co.z
        if z < 3.6:
            disp = (math.sin(v.co.x * 2.4 + z * 1.6) * math.cos(v.co.y * 2.4) * 0.46 +
                    math.cos(v.co.x * 4.2 + z * 2.8) * 0.20)
            v.co.x += disp
            v.co.y += disp * 0.8
            v.co.z += (math.sin(v.co.x * 3.2) * 0.25)
    cliff_obj.data.update()
    bpy.ops.object.shade_smooth()

    # Agujas y raíces rocosas suspendidas
    for i in range(16):
        ang = (i / 16.0) * math.pi * 2.0
        rad = 4.6 + (i % 4) * 0.55
        h = 3.6 + (i % 3) * 1.8
        bx = math.cos(ang) * rad
        by = math.sin(ang) * rad
        bz = -3.2 - (i % 3) * 0.8
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.6, radius2=0.06, depth=h, location=(bx, by, bz))
        spike = bpy.context.active_object
        spike.rotation_euler[0] = math.pi + (i % 5 - 2) * 0.08
        spike.rotation_euler[1] = (i % 3 - 1) * 0.08
        spike.data.materials.append(mat_rock)
        bpy.ops.object.shade_smooth()

    # Meseta con Césped Alpino
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=6.9, depth=0.7, location=(0, 0, 0.35))
    plateau = bpy.context.active_object
    plateau.name = "Island_Plateau"
    plateau.data.materials.append(mat_grass)
    for v in plateau.data.vertices:
        if v.co.z > 0.1:
            roll = math.sin(v.co.x * 0.6) * math.cos(v.co.y * 0.6) * 0.22 + math.cos(v.co.x * 1.1) * 0.10
            v.co.z += roll
    plateau.data.update()
    bpy.ops.object.shade_smooth()

    # Colinas laterales
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=3.0, location=(-2.8, -1.2, 0.7))
    hill1 = bpy.context.active_object
    hill1.scale = (1.5, 1.2, 0.35)
    hill1.data.materials.append(mat_grass)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=3.2, location=(2.8, -1.4, 0.75))
    hill2 = bpy.context.active_object
    hill2.scale = (1.5, 1.3, 0.38)
    hill2.data.materials.append(mat_grass)
    bpy.ops.object.shade_smooth()

    # Plaza de Mármol y Sendero ceremonial
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=3.8, depth=0.08, location=(-0.5, -0.6, 0.78))
    plaza = bpy.context.active_object
    plaza.data.materials.append(mat_plaza_stone)
    bpy.ops.object.shade_smooth()

    # Camino de piedra hacia el frente
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.5, -3.2, 0.76))
    path_stone = bpy.context.active_object
    path_stone.scale = (2.2, 3.4, 0.06)
    path_stone.data.materials.append(mat_plaza_stone)

    # Peñascos dispersos en los márgenes
    boulders = [
        (2.8, 1.8, 0.85, 0.48),
        (-3.2, 1.6, 0.85, 0.42),
        (-1.2, -4.8, 0.80, 0.40),
        (3.6, -1.8, 0.80, 0.52),
    ]
    for b_idx, (bx, by, bz, bs) in enumerate(boulders):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=bs, location=(bx, by, bz))
        b_obj = bpy.context.active_object
        b_obj.data.materials.append(mat_rock)
        bpy.ops.object.shade_smooth()

    print("✓ Geometría de isla, riscos y meseta completada.")

    # 4. PALACIO Y TEMPLO CLÁSICO DE AETHERIA
    palace_center = (-0.5, 0.2, 0.8) # Desplazado ligeramente hacia atrás (+Y) para equilibrar la vista
    px, py, pz = palace_center

    # 4A. Crepidoma / Escalinatas de Mármol
    steps_data = [
        (5.2, 4.2, 0.28, pz + 0.14),
        (4.7, 3.7, 0.28, pz + 0.42),
        (4.2, 3.2, 0.52, pz + 0.80),
    ]
    for s_idx, (sx, sy, sz_h, sz_loc) in enumerate(steps_data):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, sz_loc))
        st = bpy.context.active_object
        st.name = f"Temple_Step_{s_idx}"
        st.scale = (sx, sy, sz_h)
        st.data.materials.append(mat_marble)
        bpy.ops.object.shade_smooth()

    # 4B. Cella Central
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, pz + 2.15))
    cella = bpy.context.active_object
    cella.name = "Temple_Cella"
    cella.scale = (3.0, 2.2, 2.0)
    cella.data.materials.append(mat_marble)
    bpy.ops.object.shade_smooth()

    # Ventanas arqueadas frontales (hacia -Y, que mira a la cámara)
    for wx_off in [-0.85, 0.85]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px + wx_off, py - 1.12, pz + 2.25))
        win = bpy.context.active_object
        win.scale = (0.45, 0.08, 1.0)
        win.data.materials.append(mat_temple_glow)

    # 4C. Peristilo: 14 Columnas Corintias con Capiteles y Basas Doradas
    col_x_coords = [-1.8, -1.2, -0.6, 0.0, 0.6, 1.2, 1.8]
    col_y_coords = [-1.45, 1.45] # -1.45 es el frente hacia la cámara
    for cx in col_x_coords:
        for cy in col_y_coords:
            # Fuste estriado
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.13, depth=2.1,
                                                location=(px + cx, py + cy, pz + 2.12))
            col_shaft = bpy.context.active_object
            col_shaft.data.materials.append(mat_marble)
            bpy.ops.object.shade_smooth()

            # Capitel corintio de oro
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.20, depth=0.18,
                                                location=(px + cx, py + cy, pz + 3.22))
            cap = bpy.context.active_object
            cap.data.materials.append(mat_gold)

            # Basa clásica de oro
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.19, depth=0.16,
                                                location=(px + cx, py + cy, pz + 1.15))
            base_col = bpy.context.active_object
            base_col.data.materials.append(mat_gold)

    # 4D. Arquitrabe y Cornisa Moldurada
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, pz + 3.40))
    architrave = bpy.context.active_object
    architrave.scale = (4.4, 3.6, 0.28)
    architrave.data.materials.append(mat_marble)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, pz + 3.66))
    cornice = bpy.context.active_object
    cornice.scale = (4.65, 3.85, 0.22)
    cornice.data.materials.append(mat_gold)

    # 4E. Frontón Clásico Triangular (Tympanum)
    # Cilindro de 3 lados orientado con el frontón mirando a -Y (hacia la cámara)
    bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=2.35, depth=3.65, location=(px, py, pz + 4.18))
    pediment = bpy.context.active_object
    pediment.name = "Temple_Pediment"
    pediment.rotation_euler = (math.pi * 0.5, 0, 0)
    pediment.scale = (1.0, 0.44, 1.0)
    pediment.data.materials.append(mat_marble)

    # Medallón solar frontal mirando a la cámara (en -Y)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.38, depth=0.12, location=(px, py - 1.84, pz + 4.18))
    medallion = bpy.context.active_object
    medallion.rotation_euler = (math.pi * 0.5, 0, 0)
    medallion.data.materials.append(mat_gold)

    # 4F. Cúpula Central Imperial Dorada
    # Tambor de mármol
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.45, depth=0.6, location=(px, py, pz + 4.68))
    drum = bpy.context.active_object
    drum.data.materials.append(mat_marble)

    # Cúpula dorada esférica
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.46, location=(px, py, pz + 4.95))
    dome = bpy.context.active_object
    dome.data.materials.append(mat_gold)
    bpy.ops.object.shade_smooth()

    # Aguja celestial esbelta
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.16, radius2=0.02, depth=2.9, location=(px, py, pz + 6.75))
    spire = bpy.context.active_object
    spire.data.materials.append(mat_gold)

    # Orbe de cristal arcano flotante
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.32, location=(px, py, pz + 8.35))
    orb = bpy.context.active_object
    orb.data.materials.append(mat_crystal)

    # 4G. Torres Gemelas Flanqueantes
    for tx_off in [-2.65, 2.65]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.72, depth=4.4, location=(px + tx_off, py, pz + 2.6))
        tower = bpy.context.active_object
        tower.data.materials.append(mat_marble)
        bpy.ops.object.shade_smooth()

        # Mirador / Balcón de oro
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.86, depth=0.24, location=(px + tx_off, py, pz + 4.85))
        balcony = bpy.context.active_object
        balcony.data.materials.append(mat_gold)

        # Cúpula cónica de la torre
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.82, radius2=0.03, depth=2.0, location=(px + tx_off, py, pz + 5.95))
        t_roof = bpy.context.active_object
        t_roof.data.materials.append(mat_gold)

    # 4H. Pebeteros de Mármol con Fuego Sagrado Dorado al frente
    for bx_off in [-2.0, 2.0]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.25, depth=0.6, location=(px + bx_off, py - 2.1, pz + 0.45))
        b_base = bpy.context.active_object
        b_base.data.materials.append(mat_marble)

        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.38, depth=0.22, location=(px + bx_off, py - 2.1, pz + 0.85))
        b_bowl = bpy.context.active_object
        b_bowl.data.materials.append(mat_gold)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.20, location=(px + bx_off, py - 2.1, pz + 1.06))
        b_flame = bpy.context.active_object
        b_flame.data.materials.append(mat_temple_glow)

        bpy.ops.object.light_add(type='POINT', radius=0.25, location=(px + bx_off, py - 2.1, pz + 1.25))
        flame_light = bpy.context.active_object
        flame_light.data.energy = 60.0
        flame_light.data.color = (1.0, 0.65, 0.20)

    print("✓ Santuario Clásico de Aetheria terminado.")

    # 5. RÍO CELESTE Y CASCADA FRONTAL COLOSAL
    # Estanque de origen
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=2.2, depth=0.12, location=(2.6, 0.4, 0.85))
    pond = bpy.context.active_object
    pond.data.materials.append(mat_water)

    # Cauce del río serpenteando hacia el frente izquierdo
    river_nodes = [
        (2.4, -0.6, 0.83, 1.2),
        (1.4, -2.0, 0.81, 1.3),
        (-0.2, -3.2, 0.79, 1.4),
        (-2.2, -4.5, 0.77, 1.6),
        (-3.2, -5.4, 0.75, 1.8),
    ]
    for r_idx, (rx, ry, rz, rs) in enumerate(river_nodes):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=rs * 0.5, depth=0.08, location=(rx, ry, rz))
        r_part = bpy.context.active_object
        r_part.data.materials.append(mat_water)

    # Cascada frontal precipitándose al abismo
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(-3.2, -5.55, -2.8))
    fall = bpy.context.active_object
    fall.name = "Aetheria_Waterfall_Main"
    fall.scale = (2.2, 1.0, 7.8)
    fall.rotation_euler = (math.pi * 0.48, 0, -0.15)
    fall.data.materials.append(mat_waterfall)

    # Bruma / espuma en la base de la cascada
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=2.4, location=(-3.2, -5.8, -6.8))
    mist = bpy.context.active_object
    mist.scale = (2.0, 1.2, 0.9)
    mist.data.materials.append(mat_mist)
    bpy.ops.object.shade_smooth()

    # 6. CRISTALES ARCANOS ORBITANTES
    crystal_coords = [
        (-7.8, -2.8, 2.4, 0.28),
        (-6.2, 4.2, 3.4, -0.22),
        (7.4, -1.8, 2.2, 0.32),
        (5.8, 3.8, 3.0, -0.20),
        (-0.8, -8.2, 2.8, 0.15),
    ]
    for c_idx, (cx, cy, cz, crot) in enumerate(crystal_coords):
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.75, radius2=0.0, depth=2.4, location=(cx, cy, cz))
        c_top = bpy.context.active_object
        c_top.rotation_euler = (crot, 0.2, crot * 2.0)
        c_top.data.materials.append(mat_crystal)

        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.75, radius2=0.0, depth=2.4, location=(cx, cy, cz))
        c_bot = bpy.context.active_object
        c_bot.rotation_euler = (math.pi + crot, -0.2, crot * 2.0)
        c_bot.data.materials.append(mat_crystal)

        bpy.ops.object.light_add(type='POINT', radius=0.4, location=(cx, cy, cz))
        c_light = bpy.context.active_object
        c_light.data.energy = 55.0
        c_light.data.color = (0.0, 0.85, 1.0)

    # 7. ARBOLEDA DE PINOS ALPINOS
    tree_coords = [
        (2.2, -1.8, 1.1),
        (3.4, -0.8, 1.2),
        (4.2, 1.2, 1.35),
        (2.8, 2.8, 1.0),
        (-3.8, -1.8, 1.15),
        (-4.4, 0.4, 1.25),
        (-3.2, 2.4, 0.95),
    ]
    for tx, ty, ts in tree_coords:
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.14 * ts, depth=0.9 * ts,
                                            location=(tx, ty, 0.8 + 0.45 * ts))
        trunk = bpy.context.active_object
        trunk.data.materials.append(mat_wood)

        for l in range(3):
            bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=(0.95 - l * 0.18) * ts, radius2=0.04,
                                            depth=1.15 * ts,
                                            location=(tx, ty, 0.8 + (0.95 + l * 0.58) * ts))
            leaves = bpy.context.active_object
            leaves.data.materials.append(mat_pine)
            bpy.ops.object.shade_smooth()

    # 8. MAR DE NUBES Y CORDILLERA EN EL HORIZONTE
    for i in range(48):
        ang = (i / 48.0) * math.pi * 2.0
        dist = 14.5 + (i % 5) * 3.5
        cx = math.cos(ang) * dist
        cy = math.sin(ang) * dist
        cz = -5.4 + (i % 3) * 0.8
        r = 3.2 + (i % 4) * 0.8
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=(cx, cy, cz))
        c_mesh = bpy.context.active_object
        c_mesh.scale = (1.8, 1.6, 0.6)
        c_mesh.data.materials.append(mat_cloud)
        bpy.ops.object.shade_smooth()

    mountain_pos = [
        (-24, 32, 18, 12),
        (-8, 38, 24, 16),
        (12, 35, 20, 14),
        (28, 28, 16, 11),
    ]
    for mx, my, mh, mr in mountain_pos:
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=mr, radius2=0.5, depth=mh,
                                        location=(mx, my, mh * 0.5 - 6.0))
        m_obj = bpy.context.active_object
        m_obj.data.materials.append(mat_rock)
        bpy.ops.object.shade_smooth()

        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=mr * 0.45, radius2=0.2, depth=mh * 0.42,
                                        location=(mx, my, mh * 0.79 - 6.0))
        s_obj = bpy.context.active_object
        s_obj.data.materials.append(mat_snow)
        bpy.ops.object.shade_smooth()

    print("✓ Paisaje celestial completado.")

    # 9. ILUMINACIÓN CINEMATOGRÁFICA DE 3 PUNTOS
    # Key Light: Sol Dorado
    bpy.ops.object.light_add(type='SUN', location=(14.0, -12.0, 16.0))
    sun = bpy.context.active_object
    sun.name = "Key_Sun_GoldenHour"
    sun.data.energy = 4.6
    sun.data.color = (1.0, 0.92, 0.80)
    sun.data.angle = math.radians(6.5) # Sombras suaves y sedosas
    sun.rotation_euler = (math.radians(52), math.radians(14), math.radians(-38))

    # Fill Light: Resplandor celeste crepuscular
    bpy.ops.object.light_add(type='SUN', location=(-12.0, -10.0, 10.0))
    sky_fill = bpy.context.active_object
    sky_fill.name = "Fill_Sky_Twilight"
    sky_fill.data.energy = 1.7
    sky_fill.data.color = (0.30, 0.52, 0.82)
    sky_fill.rotation_euler = (math.radians(-40), math.radians(-20), math.radians(135))

    # Rim Light: Contraluz cian mágico
    bpy.ops.object.light_add(type='SUN', location=(0.0, 18.0, 8.0))
    rim = bpy.context.active_object
    rim.name = "Rim_Cyan_Backlight"
    rim.data.energy = 3.8
    rim.data.color = (0.0, 0.88, 1.0)
    rim.rotation_euler = (math.radians(-65), 0, math.radians(180))

    # Luz de acento interior del templo
    bpy.ops.object.light_add(type='POINT', radius=1.4, location=(px, py, pz + 2.4))
    temple_core = bpy.context.active_object
    temple_core.name = "Temple_Core_Glow"
    temple_core.data.energy = 95.0
    temple_core.data.color = (1.0, 0.70, 0.18)

    # 10. CÁMARA CINEMATOGRÁFICA HEROICA (Track-To constraint)
    # Crear un Empty como objetivo de enfoque en el centro de la Acrópolis
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(-0.5, -0.6, 3.2))
    cam_target = bpy.context.active_object
    cam_target.name = "Camera_Focus_Target"

    # Posicionar cámara a distancia cinematográfica de 36mm
    bpy.ops.object.camera_add(location=(5.6, -21.5, 5.4))
    camera = bpy.context.active_object
    camera.name = "Cinematic_Hero_Camera"
    camera.data.lens = 36 # 36mm para capturar toda la majestuosidad de la isla y el cielo
    camera.data.clip_start = 0.1
    camera.data.clip_end = 250.0

    # Constraint Track-To
    track = camera.constraints.new(type='TRACK_TO')
    track.target = cam_target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    scene.camera = camera

    print("✓ Cámara y Track-To configurados hacia la Acrópolis.")

    # 11. EXPORTACIÓN GLB
    models_dir = os.path.join(project_root, "storage", "assets", "models")
    os.makedirs(models_dir, exist_ok=True)
    out_glb = os.path.join(models_dir, "aetheria_celestial_island.glb")

    print(f"📦 Exportando modelo 3D GLB a: {out_glb}")
    try:
        bpy.ops.export_scene.gltf(
            filepath=out_glb,
            export_format='GLB',
            export_attributes=True,
            export_normals=True
        )
        glb_size = os.path.getsize(out_glb) / (1024 * 1024)
        print(f"✓ Modelo GLB exportado con éxito ({glb_size:.2f} MB).")
    except Exception as e:
        print(f"⚠️ Error exportando GLB: {e}")

    # 12. RENDERIZADO CINEMATOGRÁFICO PNG
    renders_dir = os.path.join(project_root, "storage", "assets", "renders")
    os.makedirs(renders_dir, exist_ok=True)
    out_png = os.path.join(renders_dir, "aetheria_blender_cinematic.png")
    scene.render.filepath = out_png

    print("🎬 Renderizando Aetheria v2 en 2048x1536 con Blender EEVEE...")
    bpy.ops.render.render(write_still=True)
    png_size = os.path.getsize(out_png) / (1024 * 1024)
    print(f"✓ Render finalizado con éxito: {out_png} ({png_size:.2f} MB)")

    # Copiar a storage/posters
    posters_dir = os.path.join(project_root, "storage", "posters")
    os.makedirs(posters_dir, exist_ok=True)
    shutil.copyfile(out_png, os.path.join(posters_dir, "aetheria_blender_cinematic.png"))

    # Copiar a artifacts
    artifact_dir = r"C:\Users\xiphos-pc1\.gemini\antigravity-ide\brain\c2671350-674a-49d7-b91f-df147e558782"
    if os.path.exists(artifact_dir):
        shutil.copyfile(out_png, os.path.join(artifact_dir, "aetheria_blender_cinematic.png"))
        print(f"✓ Copia en artifacts IDE guardada: aetheria_blender_cinematic.png")

    print("=" * 70)
    print("🎉 PIPELINE AETHERIA V2 COMPLETADO EXITOSAMENTE!")
    print("=" * 70)

if __name__ == "__main__":
    build_aetheria_scene()
