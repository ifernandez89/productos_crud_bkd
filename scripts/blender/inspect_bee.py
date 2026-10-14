"""Inspección detallada de un GLB para decidir cómo convertirlo en avatar web.
Uso: blender -b -P scripts/blender/inspect_bee.py -- <input.glb>
"""
import sys
import bpy
from mathutils import Vector

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

print("\n===== OBJECTS =====")
for o in bpy.data.objects:
    extra = ""
    if o.type == 'MESH':
        me = o.data
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        sk = len(me.shape_keys.key_blocks) if me.shape_keys else 0
        mats = [m.name for m in me.materials if m]
        extra = f"verts={len(me.vertices)} tris={tris} shapekeys={sk} vgroups={len(o.vertex_groups)} mats={mats}"
    elif o.type == 'ARMATURE':
        extra = f"bones={len(o.data.bones)} -> {[b.name for b in o.data.bones][:40]}"
    print(f"- {o.name} [{o.type}] parent={o.parent.name if o.parent else None} {extra}")

print("\n===== BOUNDS =====")
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
print("min", tuple(round(v, 3) for v in mn), "max", tuple(round(v, 3) for v in mx),
      "size", tuple(round(v, 3) for v in (mx - mn)))

print("\n===== ANIMATIONS =====")
for a in bpy.data.actions:
    print(f"- {a.name} frames={tuple(a.frame_range)}")

print("\n===== MATERIALS =====")
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    info = []
    if bsdf:
        for name in ('Base Color', 'Metallic', 'Roughness', 'Normal', 'Emission Color', 'Alpha'):
            s = bsdf.inputs.get(name)
            if s is None:
                continue
            if s.is_linked:
                src = s.links[0].from_node
                info.append(f"{name}<-{src.type}:{getattr(getattr(src, 'image', None), 'name', '')}")
            elif hasattr(s, 'default_value'):
                v = s.default_value
                v = tuple(round(x, 3) for x in v) if hasattr(v, '__len__') else round(v, 3)
                info.append(f"{name}={v}")
    print(f"- {m.name} blend={getattr(m, 'surface_render_method', '?')} :: {'; '.join(info)}")

print("\n===== IMAGES =====")
for img in bpy.data.images:
    print(f"- {img.name} size={tuple(img.size)} cs={img.colorspace_settings.name}")
print("===== END =====")
