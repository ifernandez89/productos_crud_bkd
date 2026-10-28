import os
import sys
import math
import bpy
from mathutils import Vector, Euler

def render_ironman_transparent(input_glb, output_png, resolution=(1080, 1440)):
    print(f"🎬 Iniciando render 3D transparente de Iron Man desde: {input_glb}")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Importar modelo
    bpy.ops.import_scene.gltf(filepath=input_glb)

    # Limpiar helpers innecesarios si existen
    for obj_name in ["Icosphere", "Cube", "Light"]:
        obj = bpy.data.objects.get(obj_name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    # 2. Configuración de Iluminación Cinematográfica de 3 Puntos
    # Luz Principal (Key Light)
    key_data = bpy.data.lights.new("KeyLight", 'AREA')
    key_data.energy = 1200.0
    key_data.size = 2.0
    key_data.color = (1.0, 0.98, 0.95)
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    key_obj.location = Vector((-1.8, -2.4, 2.8))
    key_obj.rotation_euler = Euler((math.radians(52), math.radians(-15), math.radians(-32)), 'XYZ')
    bpy.context.scene.collection.objects.link(key_obj)

    # Luz de Borde Cobalt (Rim / Kicker Light)
    rim_data = bpy.data.lights.new("RimLight", 'SPOT')
    rim_data.energy = 2200.0
    rim_data.spot_size = math.radians(65)
    rim_data.color = (0.2, 0.75, 1.0) # Cyan eléctrico
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    rim_obj.location = Vector((2.2, 2.2, 2.5))
    rim_obj.rotation_euler = Euler((math.radians(-45), math.radians(45), math.radians(135)), 'XYZ')
    bpy.context.scene.collection.objects.link(rim_obj)

    # Kicker Ámbar desde abajo (Reflejo del suelo polar)
    amber_data = bpy.data.lights.new("AmberKicker", 'AREA')
    amber_data.energy = 650.0
    amber_data.size = 1.8
    amber_data.color = (1.0, 0.65, 0.15) # Ámbar dorado
    amber_obj = bpy.data.objects.new("AmberKicker", amber_data)
    amber_obj.location = Vector((0.0, -1.5, -0.4))
    amber_obj.rotation_euler = Euler((math.radians(105), 0, 0), 'XYZ')
    bpy.context.scene.collection.objects.link(amber_obj)

    # 3. Cámara Cinemática Heroica (Encuadre plano medio de torso y casco)
    cam_data = bpy.data.cameras.new("ActionHeroCam")
    cam_data.lens = 70.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 2.4
    cam_data.dof.aperture_fstop = 3.5

    cam_obj = bpy.data.objects.new("ActionHeroCam", cam_data)
    # Iron Man suele medir ~1.85m; centramos el encuadre en Z=1.35m
    cam_obj.location = Vector((0.0, -2.5, 1.35))
    cam_obj.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # 4. Configuración de Render con FONDO 100% TRANSPARENTE
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    
    # ¡CLAVE: Transparencia total en el canal Alpha del render!
    scene.render.film_transparent = True

    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - High Contrast'

    os.makedirs(os.path.dirname(output_png), exist_ok=True)
    scene.render.filepath = output_png

    print(f"🎬 Renderizando still a {output_png}...")
    bpy.ops.render.render(write_still=True)
    print("✅ Renderizado 3D con transparencia finalizado con éxito.")

if __name__ == "__main__":
    model_path = r"C:\Projects\Jarbees_the_game\assets_source\models\iron_man.glb"
    if not os.path.exists(model_path):
        model_path = r"C:\Projects\Jarbees_the_game\assets_source\models\iron_man_cobalt_protocol.glb"

    out_file = os.path.abspath(r"storage/assets/renders/iron_man_hero_transparent.png")
    render_ironman_transparent(model_path, out_file)
