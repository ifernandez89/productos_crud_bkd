"""Vuelca las texturas embebidas del GLB a PNG para analizarlas.
Uso: blender -b -P scripts/blender/dump_textures.py -- <input.glb> <out_dir>
"""
import sys, os
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, out_dir = os.path.abspath(args[0]), os.path.abspath(args[1])
os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

mat = bpy.data.materials["Material_0"]
for n in mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE':
        users = [l.to_socket.name + "@" + l.to_node.name for o in n.outputs for l in o.links]
        print("TEX", n.image.name, "->", users)
    if n.type == 'NORMAL_MAP':
        print("NORMALMAP strength", n.inputs['Strength'].default_value)

for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    p = os.path.join(out_dir, img.name.replace(".", "_") + ".png")
    img.filepath_raw = p
    img.file_format = 'PNG'
    img.save()
    print("SAVED", p)
