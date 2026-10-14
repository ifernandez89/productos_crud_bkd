"""Render de referencia del GLB original (frente / lateral / 3-4) + lista completa de huesos.
Uso: blender -b -P scripts/blender/preview_glb.py -- <input.glb> <out_prefix>
"""
import sys, math, os
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
path, out_prefix = os.path.abspath(args[0]), os.path.abspath(args[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print("BONES:", [b.name for b in arm.data.bones])

mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
pts = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
center = sum(pts, Vector()) / 8
size = max((max(p[i] for p in pts) - min(p[i] for p in pts)) for i in range(3))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.film_transparent = False
world = bpy.data.worlds.new("w"); scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.19, 0.22, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
sun = bpy.context.active_object; sun.data.energy = 3.0
sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(30))

target = bpy.data.objects.new("target", None); scene.collection.objects.link(target)
target.location = center
bpy.ops.object.camera_add()
cam = bpy.context.active_object; scene.camera = cam
cam.data.lens = 60
c = cam.constraints.new('TRACK_TO'); c.target = target
c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

d = size * 2.1
views = {
    "front": Vector((0, -d, size * 0.25)),
    "side": Vector((d, 0, size * 0.25)),
    "top": Vector((0.001, -0.3, d)),
    "threequarter": Vector((d * 0.7, -d * 0.7, size * 0.5)),
}
for name, off in views.items():
    cam.location = center + off
    scene.render.filepath = f"{out_prefix}_{name}.png"
    bpy.ops.render.render(write_still=True)
print("PREVIEW DONE")
