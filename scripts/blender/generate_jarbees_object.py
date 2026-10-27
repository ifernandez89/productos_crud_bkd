"""
JarBees Object Lab — Blender Parametric Object Generator
========================================================
Executes deterministic geometric assembly in Blender 4.x / 5.x using Python (bpy).
Reads a `*.object.json` specification and builds:
1. Hierarchical, non-collapsed part geometry with metric dimensions.
2. Procedural Bevel modifiers for realistic micro-fillets.
3. Box-projected UV coordinates (1 meter = 1 UV unit, stretch-free).
4. Physical Colliders in `COL_Colliders` collection.
5. Semantic Interaction Anchors in `ANCHORS` collection for Auren IK.
6. Optional GLB / .blend export.

Usage:
  blender --background --python scripts/generate_jarbees_object.py -- --spec public/data/objects/table_001.object.json --out table_001.blend
"""

import bpy
import bmesh
import math
import os
import sys
import json
from mathutils import Vector, Euler

# Parse CLI arguments if executed in headless mode
def parse_args():
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []
    
    spec_path = "public/data/objects/table_001.object.json"
    out_blend = "assets_source/table_001.blend"
    out_glb = "public/models/table_001.glb"

    for i in range(len(args)):
        if args[i] == "--spec" and i + 1 < len(args):
            spec_path = args[i + 1]
        elif args[i] == "--out" and i + 1 < len(args):
            out_blend = args[i + 1]
        elif args[i] == "--glb" and i + 1 < len(args):
            out_glb = args[i + 1]

    return spec_path, out_blend, out_glb

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'

def create_collection(name, parent=None):
    col = bpy.data.collections.new(name)
    if parent:
        parent.children.link(col)
    else:
        bpy.context.scene.collection.children.link(col)
    return col

def get_or_create_material(name, base_color=(0.35, 0.22, 0.12, 1.0), roughness=0.45):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = base_color
            bsdf.inputs["Roughness"].default_value = roughness
    return mat

def create_box_mesh(name, dimensions, location, collection, material=None, bevel_radius=0.0):
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    
    # Scale cube from unit (1.0) to actual dimensions
    bmesh.ops.scale(bm, vec=dimensions, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    collection.objects.link(obj)

    if material:
        obj.data.materials.append(material)

    # Apply Bevel modifier for realistic rounded edge highlights
    if bevel_radius > 0.001:
        mod = obj.modifiers.new(name="Bevel", type='BEVEL')
        mod.width = bevel_radius
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(35)
        mod.use_clamp_overlap = True

    # Smart Cube Projection UV (1m = 1 UV unit)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=1.0)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as e:
        print(f"UV projection notice for {name}: {e}")
    obj.select_set(False)

    return obj

def create_anchor(name, position, normal, collection, anchor_type="chair_slot"):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'SINGLE_ARROW'
    empty.empty_display_size = 0.25
    empty.location = position
    
    # Align arrow to normal
    v_norm = Vector(normal).normalized()
    rot_quat = Vector((0, 0, 1)).rotation_difference(v_norm)
    empty.rotation_euler = rot_quat.to_euler()
    
    empty["jarbees_anchor_type"] = anchor_type
    collection.objects.link(empty)
    return empty

def build_table(spec):
    dims = spec["dimensions"]
    params = spec["parameters"]

    w_x = dims["widthX"]
    d_y = dims["depthY"]
    h_z = dims["heightZ"]

    leg_thick = params["legThickness"]
    leg_inset = params["legInset"]
    top_thick = params["topThickness"]
    bevel_rad = params.get("topBevelRadius", 0.01)
    apron_h = params.get("apronHeight", 0.09)
    apron_thick = params.get("apronThickness", 0.025)

    # Collections
    col_root = create_collection(f"OBJ_{spec['objectId']}")
    col_geo = create_collection("GEO_Visual", parent=col_root)
    col_colliders = create_collection("COL_Colliders", parent=col_root)
    col_anchors = create_collection("ANCHORS", parent=col_root)

    # Materials
    mat_oak = get_or_create_material("MAT_Oak_Varnished", (0.38, 0.23, 0.13, 1.0), roughness=0.42)
    mat_col = get_or_create_material("MAT_Collider_Proxy", (0.2, 0.8, 0.2, 0.3), roughness=1.0)

    # 1. Table Top
    top_loc = Vector((0, 0, h_z - (top_thick / 2)))
    top_dims = Vector((w_x, d_y, top_thick))
    create_box_mesh("Table_Top", top_dims, top_loc, col_geo, mat_oak, bevel_radius=bevel_rad)

    # Collider: Top
    create_box_mesh("COL_Table_Top", top_dims, top_loc, col_colliders, mat_col)

    # 2. Legs
    leg_h = h_z - top_thick
    leg_z = leg_h / 2
    leg_pos_x = (w_x / 2) - leg_inset - (leg_thick / 2)
    leg_pos_y = (d_y / 2) - leg_inset - (leg_thick / 2)
    leg_dims = Vector((leg_thick, leg_thick, leg_h))

    corners = [
        ("Leg_SW", -leg_pos_x, -leg_pos_y),
        ("Leg_SE", leg_pos_x, -leg_pos_y),
        ("Leg_NW", -leg_pos_x, leg_pos_y),
        ("Leg_NE", leg_pos_x, leg_pos_y),
    ]

    for name, lx, ly in corners:
        loc = Vector((lx, ly, leg_z))
        create_box_mesh(name, leg_dims, loc, col_geo, mat_oak, bevel_radius=0.004)
        create_box_mesh(f"COL_{name}", leg_dims, loc, col_colliders, mat_col)

    # 3. Aprons
    apron_z = h_z - top_thick - (apron_h / 2)
    span_x = (leg_pos_x * 2) - leg_thick
    span_y = (leg_pos_y * 2) - leg_thick

    dims_apron_x = Vector((span_x, apron_thick, apron_h))
    create_box_mesh("Apron_South", dims_apron_x, Vector((0, -leg_pos_y, apron_z)), col_geo, mat_oak, bevel_radius=0.003)
    create_box_mesh("Apron_North", dims_apron_x, Vector((0, leg_pos_y, apron_z)), col_geo, mat_oak, bevel_radius=0.003)

    dims_apron_y = Vector((apron_thick, span_y, apron_h))
    create_box_mesh("Apron_West", dims_apron_y, Vector((-leg_pos_x, 0, apron_z)), col_geo, mat_geo := mat_oak, bevel_radius=0.003)
    create_box_mesh("Apron_East", dims_apron_y, Vector((leg_pos_x, 0, apron_z)), col_geo, mat_oak, bevel_radius=0.003)

    # 4. Interaction Anchors for Auren
    if "interaction" in spec and "anchors" in spec["interaction"]:
        for anch in spec["interaction"]["anchors"]:
            pos = Vector(anch["localPos"])
            norm = Vector(anch["normal"])
            create_anchor(anch["id"], pos, norm, col_anchors, anchor_type=anch["type"])

def main():
    spec_path, out_blend, out_glb = parse_args()
    
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    full_spec_path = os.path.join(project_root, spec_path) if not os.path.isabs(spec_path) else spec_path
    
    if not os.path.exists(full_spec_path):
        print(f"Error: Spec file not found at {full_spec_path}")
        return

    with open(full_spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)

    print(f"Generating JarBees Object: {spec.get('name', 'Unknown')} ({spec.get('objectId')})")
    reset_scene()
    build_table(spec)

    # Save .blend
    full_blend_path = os.path.join(project_root, out_blend) if not os.path.isabs(out_blend) else out_blend
    os.makedirs(os.path.dirname(full_blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=full_blend_path)
    print(f"Saved Blender file: {full_blend_path}")

    # Optional glb export
    if out_glb:
        full_glb_path = os.path.join(project_root, out_glb) if not os.path.isabs(out_glb) else out_glb
        os.makedirs(os.path.dirname(full_glb_path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=full_glb_path,
            export_format='GLB',
            use_selection=False,
            export_apply=False,
            export_materials='EXPORT',
            export_yup=True
        )
        print(f"Exported GLB: {full_glb_path}")

if __name__ == "__main__":
    main()
