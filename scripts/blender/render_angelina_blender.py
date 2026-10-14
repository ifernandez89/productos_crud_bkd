"""
render_angelina_blender.py - Motor de Retrato 3D Fotorrealista de Angelina Jolie en Blender 5.2
Parte del pipeline de assets 3D de JarBees.
"""

import sys
import os
import math
import json
import bpy
from mathutils import Vector, Euler

def build_angelina_portrait(
    input_glb="storage/assets/models/avaturn.glb",
    output_glb="storage/assets/models/angelina_jolie_blender.glb",
    output_render="storage/assets/renders/angelina_blender_portrait.png",
    resolution_x=1600,
    resolution_y=2000
):
    abs_input = os.path.abspath(input_glb)
    abs_output = os.path.abspath(output_glb)
    abs_render = os.path.abspath(output_render)
    os.makedirs(os.path.dirname(abs_render), exist_ok=True)
    os.makedirs(os.path.dirname(abs_output), exist_ok=True)

    # 1. Limpieza de escena e importación de la malla humana continua
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=abs_input)

    # 2. Configuración de Shape Keys (Blendshapes ARKit para fisonomía de Angelina Jolie)
    head_obj = bpy.data.objects.get("Head_Mesh")
    if head_obj and head_obj.data.shape_keys:
        kb = head_obj.data.shape_keys.key_blocks
        
        # Sonrisa sutil icónica asimétrica
        if "mouthSmileLeft" in kb: kb["mouthSmileLeft"].value = 0.28
        if "mouthSmileRight" in kb: kb["mouthSmileRight"].value = 0.20
        if "mouthDimpleLeft" in kb: kb["mouthDimpleLeft"].value = 0.16
        if "mouthSmile" in kb: kb["mouthSmile"].value = 0.10

        # Ojos felinos rasgados y mirada intensa
        if "eyeSquintLeft" in kb: kb["eyeSquintLeft"].value = 0.26
        if "eyeSquintRight" in kb: kb["eyeSquintRight"].value = 0.26
        if "cheekSquintLeft" in kb: kb["cheekSquintLeft"].value = 0.20
        if "cheekSquintRight" in kb: kb["cheekSquintRight"].value = 0.18

        # Cejas arqueadas altas
        if "browOuterUpLeft" in kb: kb["browOuterUpLeft"].value = 0.35
        if "browOuterUpRight" in kb: kb["browOuterUpRight"].value = 0.30
        if "browInnerUp" in kb: kb["browInnerUp"].value = 0.12

        # Labios carnosos con leve separación sensual
        if "mouthOpen" in kb: kb["mouthOpen"].value = 0.05
        if "jawOpen" in kb: kb["jawOpen"].value = 0.03
        if "mouthPucker" in kb: kb["mouthPucker"].value = 0.08
        if "mouthRollUpper" in kb: kb["mouthRollUpper"].value = -0.05

        print("✓ Blendshapes ARKit de Angelina Jolie aplicados exitosamente.")

    # 3. Postura del Rig Esquelético (Leve giro de cabeza para pose natural)
    armature = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if armature:
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='POSE')
        
        head_bone = armature.pose.bones.get("Head")
        if head_bone:
            # Leve rotación en Z (giro de 7 grados) y X (inclinación de 2 grados)
            head_bone.rotation_mode = 'XYZ'
            head_bone.rotation_euler = Euler((math.radians(-2.5), math.radians(1.5), math.radians(7.0)), 'XYZ')

        neck_bone = armature.pose.bones.get("Neck")
        if neck_bone:
            neck_bone.rotation_mode = 'XYZ'
            neck_bone.rotation_euler = Euler((math.radians(1.0), 0.0, math.radians(2.0)), 'XYZ')

        bpy.ops.object.mode_set(mode='OBJECT')
        print("✓ Rig esquelético ajustado con pose natural.")

    # 4. Materiales PBR y Subsurface Scattering (SSS)
    # A) Piel de rostro y cuerpo
    for mat_name in ["Head", "Body"]:
        mat = bpy.data.materials.get(mat_name)
        if mat and mat.node_tree:
            p = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if p:
                if 'Subsurface Weight' in p.inputs:
                    p.inputs['Subsurface Weight'].default_value = 0.16
                if 'Subsurface Radius' in p.inputs:
                    p.inputs['Subsurface Radius'].default_value = (1.0, 0.38, 0.18)
                if 'Subsurface Scale' in p.inputs:
                    p.inputs['Subsurface Scale'].default_value = 0.012
                if 'Roughness' in p.inputs:
                    p.inputs['Roughness'].default_value = 0.48
                if 'Specular IOR Level' in p.inputs:
                    p.inputs['Specular IOR Level'].default_value = 0.50

    # B) Ojos con brillo corneal y humectación
    eye_mat = bpy.data.materials.get("Eyes")
    if eye_mat and eye_mat.node_tree:
        p = next((n for n in eye_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p:
            if 'Roughness' in p.inputs:
                p.inputs['Roughness'].default_value = 0.04
            if 'Specular IOR Level' in p.inputs:
                p.inputs['Specular IOR Level'].default_value = 0.90
            if 'Coat Weight' in p.inputs:
                p.inputs['Coat Weight'].default_value = 0.95
            if 'Coat Roughness' in p.inputs:
                p.inputs['Coat Roughness'].default_value = 0.03

    # C) Cabello castaño oscuro (Iconic Brunette de Angelina)
    for hair_mat_name in ["avaturn_hair_0_material", "avaturn_hair_1_material"]:
        h_mat = bpy.data.materials.get(hair_mat_name)
        if h_mat and h_mat.node_tree:
            nodes = h_mat.node_tree.nodes
            links = h_mat.node_tree.links
            p = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if p:
                # Oscurecer hacia castaño oscuro / chocolate profundo
                tex_node = next((n for n in nodes if n.type == 'TEX_IMAGE'), None)
                if tex_node and p.inputs['Base Color'].is_linked:
                    mix_hair = nodes.new(type='ShaderNodeMix')
                    mix_hair.data_type = 'RGBA'
                    mix_hair.blend_type = 'MULTIPLY'
                    mix_hair.inputs['Factor'].default_value = 0.85
                    mix_hair.inputs['B'].default_value = (0.16, 0.10, 0.07, 1.0) # Tinte chocolate oscuro
                    orig_link = p.inputs['Base Color'].links[0].from_socket
                    links.new(orig_link, mix_hair.inputs['A'])
                    links.new(mix_hair.outputs['Result'], p.inputs['Base Color'])
                else:
                    p.inputs['Base Color'].default_value = (0.08, 0.05, 0.04, 1.0)

                if 'Roughness' in p.inputs:
                    p.inputs['Roughness'].default_value = 0.50
                if 'Specular IOR Level' in p.inputs:
                    p.inputs['Specular IOR Level'].default_value = 0.75

    print("✓ Shaders de piel calibrados y cabello castaño profundo.")

    # 5. Estudio Cinemático de Retrato: Iluminación Rembrandt Calibrada
    scene = bpy.context.scene
    scene.render.resolution_x = resolution_x
    scene.render.resolution_y = resolution_y
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False

    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    scene.view_settings.exposure = -0.3 # Compensar sobreexposición

    # Fondo de estudio elegante carbón / pizarra
    if scene.world and scene.world.node_tree:
        bg_node = scene.world.node_tree.nodes.get("Background")
        if bg_node:
            bg_node.inputs['Color'].default_value = (0.04, 0.05, 0.07, 1.0)
            bg_node.inputs['Strength'].default_value = 0.35

    # Altura del rostro (centro entre ojos y nariz)
    head_z = 1.58

    # Cámara 95mm Retrato Teleobjetivo
    cam_data = bpy.data.cameras.new("PortraitCam")
    cam_data.lens = 95.0
    cam_data.sensor_width = 36.0
    cam_obj = bpy.data.objects.new("PortraitCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Posicionar cámara a la altura exacta de los ojos
    cam_dist = 0.95
    cam_angle = math.radians(12.0)
    cam_obj.location = (
        cam_dist * math.sin(cam_angle),
        -cam_dist * math.cos(cam_angle),
        head_z + 0.08
    )
    target_focus = Vector((0.0, 0.0, head_z + 0.08))
    direction = target_focus - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    # 1. Key Light (Softbox a 40 grados, exposición controlada)
    key_light = bpy.data.lights.new("RembrandtKey", 'AREA')
    key_light.energy = 55.0
    key_light.size = 0.9
    key_light.color = (1.0, 0.97, 0.92)
    key_obj = bpy.data.objects.new("RembrandtKey", key_light)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (0.50, -0.70, head_z + 0.35)
    key_obj.rotation_euler = (target_focus - key_obj.location).to_track_quat('-Z', 'Y').to_euler()

    # 2. Fill Light (Luz difusa fría)
    fill_light = bpy.data.lights.new("SoftFill", 'AREA')
    fill_light.energy = 16.0
    fill_light.size = 1.4
    fill_light.color = (0.88, 0.93, 1.0)
    fill_obj = bpy.data.objects.new("SoftFill", fill_light)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (-0.60, -0.65, head_z + 0.10)
    fill_obj.rotation_euler = (target_focus - fill_obj.location).to_track_quat('-Z', 'Y').to_euler()

    # 3. Rim Light (Luz rasante de recorte en pómulo y silueta de cabello)
    rim_light = bpy.data.lights.new("HairKicker", 'SPOT')
    rim_light.energy = 85.0
    rim_light.spot_size = math.radians(45)
    rim_light.spot_blend = 0.4
    rim_light.color = (0.95, 0.98, 1.0)
    rim_obj = bpy.data.objects.new("HairKicker", rim_light)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = (-0.40, 0.55, head_z + 0.45)
    rim_obj.rotation_euler = (target_focus - rim_obj.location).to_track_quat('-Z', 'Y').to_euler()

    # 4. Catchlight (Reflejo especular en la mirada)
    eye_catch = bpy.data.lights.new("EyeCatch", 'POINT')
    eye_catch.energy = 15.0
    eye_catch.color = (1.0, 1.0, 1.0)
    catch_obj = bpy.data.objects.new("EyeCatch", eye_catch)
    bpy.context.collection.objects.link(catch_obj)
    catch_obj.location = (0.10, -0.60, head_z + 0.05)

    print("✓ Sistema de iluminación Rembrandt de 4 fuentes configurado.")

    # 6. Renderizar Retrato Fotorrealista
    scene.render.filepath = abs_render
    bpy.ops.render.render(write_still=True)
    print(f"✓ Render fotorrealista de Angelina Jolie guardado en: {abs_render}")

    # 7. Exportar modelo calibrado GLB
    mesh_objects = [o for o in bpy.data.objects if o.type in {'MESH', 'ARMATURE'}]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in mesh_objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=abs_output,
        export_format='GLB',
        use_selection=True,
        export_apply=False, # Preservar shape keys y armature intactos
        export_materials='EXPORT',
        export_morph=True,
        export_normals=True,
        export_attributes=True
    )
    print(f"✓ Modelo 3D calibrado exportado a: {abs_output}")

    return {
        "status": "success",
        "render_path": abs_render,
        "model_path": abs_output,
        "resolution": [resolution_x, resolution_y]
    }

if __name__ == "__main__":
    build_angelina_portrait()
