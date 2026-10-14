"""
inspect_glb.py - Blender Headless Inspector para JarBees 3D Pipeline
Ejecución:
  blender.exe -b -P scripts/blender/inspect_glb.py -- --input "model.glb" [--json-out "report.json"]
"""

import sys
import json
import bpy
from mathutils import Vector

def parse_args():
    argv = sys.argv
    if "--" not in argv:
        return {}
    args = argv[argv.index("--") + 1:]
    parsed = {}
    i = 0
    while i < len(args):
        if args[i] == "--input" and i + 1 < len(args):
            parsed["input"] = args[i + 1]
            i += 2
        elif args[i] == "--json-out" and i + 1 < len(args):
            parsed["json_out"] = args[i + 1]
            i += 2
        else:
            i += 1
    return parsed

def inspect(filepath: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    total_vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
    total_triangles = sum(len(obj.data.polygons) for obj in mesh_objects)

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

    materials_info = []
    for mat in bpy.data.materials:
        if not mat:
            continue
        nodes_list = [n.type for n in mat.node_tree.nodes] if mat.node_tree else []
        has_texture = any('TEX_IMAGE' in n for n in nodes_list)
        materials_info.append({
            "name": mat.name,
            "has_texture": has_texture,
            "nodes_count": len(nodes_list)
        })

    report = {
        "status": "success",
        "file": filepath,
        "mesh_count": len(mesh_objects),
        "meshes": [obj.name for obj in mesh_objects],
        "total_vertices": total_vertices,
        "total_triangles": total_triangles,
        "materials": materials_info,
        "bounding_box": {
            "width": round(dims.x, 4),
            "depth": round(dims.y, 4),
            "height": round(dims.z, 4),
            "center": [round(center.x, 4), round(center.y, 4), round(center.z, 4)]
        }
    }
    return report

def main():
    args = parse_args()
    input_file = args.get("input")
    if not input_file:
        print(json.dumps({"status": "error", "message": "Falta parametro --input"}))
        sys.exit(1)

    try:
        report = inspect(input_file)
        json_str = json.dumps(report, indent=2)
        print(">>> INSPECTION_REPORT_START >>>")
        print(json_str)
        print("<<< INSPECTION_REPORT_END <<<")

        if args.get("json_out"):
            with open(args["json_out"], "w", encoding="utf-8") as f:
                f.write(json_str)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
