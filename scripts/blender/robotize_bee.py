"""
robotize_bee.py — Convierte la abeja orgánica (Bee.glb) en "JarBee" robótica para avatar web.

Principio: NO se toca la topología, el skin (107 huesos) ni las animaciones. Todo el cambio
es de superficie: se repinta el atlas UV con numpy y se reconstruye un material PBR
glTF-estándar (baseColor + ORM + normal + emissive) que Three.js lee sin shaders custom.

Uso:
  blender -b --python-exit-code 1 -P scripts/blender/robotize_bee.py -- \
      --input storage/assets/models/bee_source.glb \
      --out-dir storage/assets/models/jarbee \
      [--tex-size 1024] [--renders storage/assets/renders/bee]
"""
import sys
import os
import math
import json
import time
import numpy as np
import bpy
from mathutils import Vector, Matrix


# ----------------------------------------------------------------------------- args
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"tex_size": 1024, "renders": None}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip("-").replace("-", "_")
        out[key] = argv[i + 1]
        i += 2
    out["tex_size"] = int(out["tex_size"])
    return out


# ----------------------------------------------------------------------------- numpy helpers
def box_blur(a, r, axis):
    if r <= 0:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, r):
    """Aproximación gaussiana: 3 pasadas de box blur separables."""
    for _ in range(3):
        a = box_blur(box_blur(a, r, 0), r, 1)
    return a


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def read_image(img):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4)


def write_image(name, rgb, colorspace, size):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.colorspace_settings.name = colorspace
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    if size != w:
        img.scale(size, size)
    img.pack()
    return img


# ----------------------------------------------------------------------------- 1. texturas
def build_robot_textures(src_rgb):
    """src_rgb: HxWx3 en espacio sRGB (valores tal cual del PNG)."""
    H, W = src_rgb.shape[:2]
    r, g, b = src_rgb[..., 0], src_rgb[..., 1], src_rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx = src_rgb.max(axis=2)
    mn = src_rgb.min(axis=2)
    sat = (mx - mn) / (mx + 1e-5)

    # --- clasificación por color del atlas original
    membrane_px = ((lum > 0.50) & (sat < 0.38)).astype(np.float32)
    wing = blur(membrane_px, 6) > 0.30                                   # ala completa (incluye nervaduras)
    veins = wing & (membrane_px < 0.5) & (lum < 0.55)

    eye_px = ((b > r * 1.08) & (b > 0.05) & (lum < 0.30) & ~wing).astype(np.float32)
    eye_soft = blur(eye_px, 4)
    eye = eye_soft > 0.5
    halo = blur(eye.astype(np.float32), 9)
    ring = (halo > 0.06) & ~eye                                          # anillo ámbar alrededor del visor

    yellowness = smoothstep(0.16, 0.34, lum) * smoothstep(0.35, 0.55, sat) * (r > b * 1.6)
    plate_y = blur(yellowness.astype(np.float32), 5)                    # promedia los pelos → placas
    yellow = (plate_y > 0.42) & ~wing & ~eye & ~ring

    copper_px = ((r > g * 1.75) & (lum > 0.10) & (lum < 0.45) & (sat > 0.5)).astype(np.float32)
    copper = (blur(copper_px, 3) > 0.5) & ~yellow & ~wing & ~eye & ~ring

    dark = ~(yellow | wing | eye | ring | copper)

    # --- costuras entre placas (borde amarillo/oscuro) y paneles procedurales
    ymask = yellow.astype(np.float32)
    seam = np.abs(ymask - blur(ymask, 2)) > 0.18

    v_idx, u_idx = np.mgrid[0:H, 0:W].astype(np.float32)
    cell = H / 16.0
    fu, fv = (u_idx % cell) / cell, (v_idx % cell) / cell
    panel = ((np.minimum(fu, 1 - fu) < 0.012) | (np.minimum(fv, 1 - fv) < 0.012)) & (yellow | dark) & ~seam
    # remaches: pequeños discos cerca de cada esquina de panel
    du, dv = np.minimum(fu, 1 - fu), np.minimum(fv, 1 - fv)
    rivet_d = np.sqrt((du - 0.06) ** 2 + (dv - 0.06) ** 2)
    rivet = (rivet_d < 0.018) & (yellow | dark)

    # rejilla triangular holográfica en la membrana del ala
    k = 46.0
    uu, vv = u_idx / W, v_idx / H

    def line(x):
        f = (x * k) % 1.0
        return np.minimum(f, 1 - f)

    grid = np.minimum.reduce([line(uu), line(uu * 0.5 + vv * 0.866), line(uu * 0.5 - vv * 0.866)])
    hexgrid = wing & ~veins & (grid < 0.045)

    # scanlines del visor
    scan = 0.65 + 0.35 * (np.sin(v_idx * (2 * math.pi / 7.0)) > 0)

    # ---------------------------------------------------------------- base color (sRGB)
    shade = 0.82 + 0.18 * blur(lum, 10) / (blur(lum, 10).max() + 1e-5)  # conserva algo de volumen pintado
    base = np.zeros((H, W, 3), np.float32)

    def paint(mask, color, mod=None):
        c = np.array(color, np.float32)
        if mod is None:
            base[mask] = c
        else:
            base[mask] = c * mod[mask][:, None]

    paint(dark, (0.085, 0.092, 0.108), shade)                 # gunmetal
    paint(yellow, (0.97, 0.64, 0.09), shade)                  # ámbar industrial (pintura metálica)
    paint(copper, (0.75, 0.40, 0.20))                         # cobre en tarsos/antenas
    paint(wing, (0.09, 0.16, 0.24))                           # vidrio ahumado azul
    paint(veins, (0.05, 0.06, 0.07))
    paint(eye, (0.015, 0.025, 0.04))
    paint(ring, (0.20, 0.12, 0.03))
    base[seam] *= 0.25
    base[panel] *= 0.55
    base[rivet] = base[rivet] * 0.6 + 0.25

    # ---------------------------------------------------------------- ORM (R=AO, G=rough, B=metal)
    brushed = (src_rgb.mean(axis=2) - blur(src_rgb.mean(axis=2), 2)) * 0.6   # micro-variación tipo cepillado
    rough = np.full((H, W), 0.4, np.float32)
    metal = np.zeros((H, W), np.float32)
    rough[dark], metal[dark] = 0.34, 0.92
    rough[yellow], metal[yellow] = 0.26, 0.78
    rough[copper], metal[copper] = 0.30, 1.0
    rough[wing], metal[wing] = 0.10, 0.55
    rough[veins], metal[veins] = 0.30, 0.9
    rough[eye], metal[eye] = 0.04, 0.0
    rough[ring], metal[ring] = 0.25, 0.9
    rough[seam | panel] = 0.6
    rough = np.clip(rough + brushed * (yellow | dark), 0.03, 1.0)
    ao = np.where(seam, 0.35, np.where(panel, 0.6, 1.0)).astype(np.float32)
    orm = np.stack([ao, rough, metal], axis=2)

    # ---------------------------------------------------------------- emissive (sRGB)
    emis = np.zeros((H, W, 3), np.float32)
    cyan = np.array((0.05, 0.85, 1.0), np.float32)
    emis[eye] = cyan * scan[eye][:, None]
    emis[veins] = cyan * 0.95
    emis[hexgrid] = cyan * 0.22
    emis[ring] = np.array((1.0, 0.55, 0.05), np.float32) * 0.9
    emis = blur(emis, 1)  # antialias de los trazos

    # ---------------------------------------------------------------- normal desde altura
    height = np.full((H, W), 0.0, np.float32)
    height[yellow] += 0.25                       # las placas ámbar sobresalen de la estructura
    height = blur(height, 2)
    height -= seam * 0.9 + panel * 0.5
    height += rivet * 0.45
    height[wing] = 0.0
    height -= veins * 0.15
    height = blur(height, 1)
    gy, gx = np.gradient(height)                 # fila 0 = v=0 (Blender), así que gy = dH/dv
    strength = 6.0
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(gx)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    normal = n * 0.5 + 0.5

    stats = {k: float(m.mean()) for k, m in dict(
        dark=dark, yellow=yellow, copper=copper, wing=wing, veins=veins, eye=eye, ring=ring).items()}
    return base, orm, emis, normal, stats


# ----------------------------------------------------------------------------- 2. material
def rebuild_material(mat, tex_base, tex_orm, tex_normal, tex_emis, emission_strength):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def tex(img):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        return n

    nb = tex(tex_base)
    nt.links.new(nb.outputs["Color"], bsdf.inputs["Base Color"])

    no = tex(tex_orm)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(no.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    nn = tex(tex_normal)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nn.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    ne = tex(tex_emis)
    nt.links.new(ne.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.name = "JarBee_Robot"


# ----------------------------------------------------------------------------- 3. transform web
def normalize_for_web(mesh_obj, arm_obj, top_root):
    """Envuelve la jerarquía en un nodo 'JarBee': tamaño máx = 1, centrada, cabeza hacia la cámara.
    En Blender la cámara web por defecto mira desde +Z glTF == -Y Blender."""
    bpy.context.view_layer.update()
    pts = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
    head = arm_obj.matrix_world @ arm_obj.data.bones["head_Jnt.4"].head_local
    tail = arm_obj.matrix_world @ arm_obj.data.bones["abdomen_jnt04.35"].head_local
    d = (head - tail)
    d.z = 0
    ang = math.atan2(d.y, d.x) - math.atan2(-1.0, 0.0)   # rotar para que la cabeza apunte a -Y
    R = Matrix.Rotation(-ang, 4, 'Z')

    rp = [R @ p for p in pts]
    mn = Vector([min(p[i] for p in rp) for i in range(3)])
    mx = Vector([max(p[i] for p in rp) for i in range(3)])
    size = mx - mn
    s = 1.0 / max(size)
    center = (mn + mx) / 2

    wrapper = bpy.data.objects.new("JarBee", None)
    bpy.context.scene.collection.objects.link(wrapper)
    top_root.parent = wrapper
    wrapper.matrix_world = Matrix.Diagonal((s, s, s, 1.0)) @ Matrix.Translation(-center) @ R
    bpy.context.view_layer.update()
    return {
        "rotation_deg": round(math.degrees(-ang), 2),
        "scale": s,
        "size_normalized": [round(v * s, 4) for v in size],
    }


# ----------------------------------------------------------------------------- 4. export
def export_glb(path, draco=False):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_optimize_animation_size=True,
        export_morph=False,
        export_image_format='WEBP',
        export_image_quality=90,
        export_draco_mesh_compression_enable=draco,
        export_draco_mesh_compression_level=6,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    return os.path.getsize(path)


# ----------------------------------------------------------------------------- main
def main():
    a = parse_args()
    t0 = time.time()
    src = os.path.abspath(a["input"])
    out_dir = os.path.abspath(a["out_dir"])
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    # basura del archivo fuente: una icosfera suelta sin material
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)

    mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    top_root = arm
    while top_root.parent:
        top_root = top_root.parent
    verts_before = len(mesh.data.vertices)
    groups_before = len(mesh.vertex_groups)

    mat = mesh.data.materials[0]
    base_img = next(n.image for n in mat.node_tree.nodes
                    if n.type == 'TEX_IMAGE' and any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links))
    src_rgb = read_image(base_img)[..., :3]
    print(f"[robotize] atlas {base_img.size[0]}x{base_img.size[1]}")

    base, orm, emis, normal, stats = build_robot_textures(src_rgb)
    print("[robotize] cobertura por clase:", json.dumps({k: round(v, 3) for k, v in stats.items()}))

    size = a["tex_size"]
    t_base = write_image("jarbee_basecolor", base, "sRGB", size)
    t_orm = write_image("jarbee_orm", orm, "Non-Color", size)
    t_nrm = write_image("jarbee_normal", normal, "Non-Color", size)
    t_emi = write_image("jarbee_emissive", emis, "sRGB", size)
    rebuild_material(mat, t_base, t_orm, t_nrm, t_emi, emission_strength=3.0)

    # limpiar imágenes huérfanas del material original para que no se exporten
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)

    # nombres de clips limpios para el front
    clip_names = {}
    for act in bpy.data.actions:
        new = act.name.replace("_bee_", "").strip("_")
        clip_names[new] = [round(f, 2) for f in act.frame_range]
        act.name = new

    xf = normalize_for_web(mesh, arm, top_root)
    mesh.name = "JarBee_Body"
    arm.name = "JarBee_Rig"

    glb = os.path.join(out_dir, "jarbee_robot.glb")
    glb_draco = os.path.join(out_dir, "jarbee_robot.draco.glb")
    size_plain = export_glb(glb, draco=False)
    size_draco = export_glb(glb_draco, draco=True)

    # previews de las texturas para revisión
    if a.get("renders"):
        rdir = os.path.abspath(a["renders"])
        os.makedirs(rdir, exist_ok=True)
        for img in (t_base, t_emi, t_nrm, t_orm):
            img.filepath_raw = os.path.join(rdir, f"{img.name}.png")
            img.file_format = 'PNG'
            img.save()

    report = {
        "source": src,
        "outputs": {"glb": glb, "glb_bytes": size_plain, "draco_glb": glb_draco, "draco_bytes": size_draco},
        "vertices": {"before": verts_before, "after": len(mesh.data.vertices)},
        "vertex_groups": {"before": groups_before, "after": len(mesh.vertex_groups)},
        "bones": len(arm.data.bones),
        "clips": clip_names,
        "fps": bpy.context.scene.render.fps,
        "texture_size": size,
        "transform": xf,
        "class_coverage": stats,
        "seconds": round(time.time() - t0, 2),
    }
    with open(os.path.join(out_dir, "jarbee_robot.report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("[robotize] REPORT", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
