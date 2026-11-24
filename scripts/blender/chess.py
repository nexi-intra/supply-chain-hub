"""Staunton chess pieces (boxwood and ebony) and the board's maple/walnut inlay, rendered once with Cycles.

  blender.exe -b --factory-startup --python scripts/blender/chess.py -- --out src/assets/chess [--only pieces,board] [--samples 96] [--pieces wk,bq]

Outputs (WebP):
  w{p,n,b,r,q,k}.webp / b{p,n,b,r,q,k}.webp   one piece per image, transparent, all in the same frame so their sizes
                                             compare; the base centre sits at BASE_Y of the height (see chess.css)
  board.webp                                  the 8 x 8 playing field seen from above, a1 dark in the lower left
All geometry is lathed from profiles in millimetres; the knight's head is a bevelled silhouette with carved details.
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

FRAME_W, FRAME_H = 0.072, 0.096      # metres covered by the image
RES = (288, 384)
ELEVATION = 22.0                      # camera looks down this many degrees
BASE_Y = 0.86                         # base centre, as a fraction of the image height from the top
MM = 0.001


def srgb(hexstr, alpha=1.0):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {'out': 'src/assets/chess', 'only': 'pieces,board', 'samples': '96', 'pieces': 'wp,wn,wb,wr,wq,wk,bp,bn,bb,br,bq,bk'}
    for i in range(0, len(argv), 2):
        args[argv[i].lstrip('-')] = argv[i + 1]
    args['only'] = [item for item in args['only'].split(',') if item]
    args['pieces'] = [item for item in args['pieces'].split(',') if item]
    args['out'] = os.path.abspath(args['out'])
    args['samples'] = int(args['samples'])
    return args


def reset(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 8
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

# ----------------------------------------------------------------------------- materials


def wood(name, light, dark, grain_scale=(40.0, 40.0, 1.2), roughness=0.4, coat=0.5, coat_roughness=0.12, figure=0.3, texture='Object'):
    """Fine straight grain along the object's Z (turned pieces) with a gentle figure and a lacquer coat."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    scale = nodes.new('ShaderNodeMapping')
    scale.inputs['Scale'].default_value = grain_scale
    links.new(coord.outputs[texture], scale.inputs['Vector'])
    fibres = nodes.new('ShaderNodeTexNoise')
    fibres.inputs['Scale'].default_value = 12.0
    fibres.inputs['Detail'].default_value = 10.0
    fibres.inputs['Roughness'].default_value = 0.6
    links.new(scale.outputs['Vector'], fibres.inputs['Vector'])
    waves = nodes.new('ShaderNodeTexWave')
    waves.wave_type = 'RINGS'
    waves.inputs['Scale'].default_value = 3.0
    waves.inputs['Distortion'].default_value = 6.0
    waves.inputs['Detail'].default_value = 2.0
    ring_map = nodes.new('ShaderNodeMapping')
    ring_map.inputs['Scale'].default_value = (60.0, 60.0, 8.0)
    links.new(coord.outputs[texture], ring_map.inputs['Vector'])
    links.new(ring_map.outputs['Vector'], waves.inputs['Vector'])
    mix = nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = figure
    links.new(waves.outputs['Fac'], mix.inputs[0])
    links.new(fibres.outputs['Fac'], mix.inputs[2])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = srgb(dark)
    ramp.color_ramp.elements[1].position = 0.9
    ramp.color_ramp.elements[1].color = srgb(light)
    links.new(mix.outputs[0], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.04
    links.new(fibres.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    return mat


def piece_material(color):
    if color == 'w':
        return wood('Boxwood', '#efc983', '#b97d3a', roughness=0.4, coat=0.5, figure=0.1)
    return wood('Ebony', '#2e1c13', '#080403', roughness=0.3, coat=0.9, coat_roughness=0.06, figure=0.08)

# ----------------------------------------------------------------------------- geometry


def arc(cx, cz, radius, a0, a1, n=8):
    return [(cx + radius * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))), cz + radius * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))) for i in range(n)]


def lathe(name, profile, material, segments=128, crease=38.0):
    """Spins a profile [(r, z) mm] from the axis at the bottom to the axis at the top; corners sharper than
    `crease` degrees stay crisp, everything else is smooth."""
    pts = [(max(0.0, r) * MM, z * MM) for r, z in profile]
    bm = bmesh.new()
    rings = []
    for r, z in pts:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / segments), r * math.sin(2 * math.pi * j / segments), z)) for j in range(segments)])
    sharp_rings = set()
    for i in range(1, len(pts) - 1):
        a = Vector((pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        b = Vector((pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
        if a.length and b.length and math.degrees(a.angle(b)) > crease:
            sharp_rings.add(i)
    for i in range(len(rings) - 1):
        lower, upper = rings[i], rings[i + 1]
        for j in range(segments):
            k = (j + 1) % segments
            if len(lower) == 1 and len(upper) == 1:
                continue
            if len(lower) == 1:
                bm.faces.new((lower[0], upper[j], upper[k])[::-1])
            elif len(upper) == 1:
                bm.faces.new((lower[j], lower[k], upper[0])[::-1])
            else:
                bm.faces.new((lower[j], lower[k], upper[k], upper[j])[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    for i in sharp_rings:
        ring = set(rings[i])
        for edge in bm.edges:
            if edge.verts[0] in ring and edge.verts[1] in ring:
                edge.smooth = False
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    return link(bpy.data.objects.new(name, mesh))


def cutter_box(name, center_mm, size_mm, rot_deg=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector([s * MM for s in size_mm]), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = [c * MM for c in center_mm]
    obj.rotation_euler = [math.radians(a) for a in rot_deg]
    obj.hide_render = True
    return obj


def cutter_sphere(name, center_mm, radius_mm):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=radius_mm * MM)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = [c * MM for c in center_mm]
    obj.hide_render = True
    return obj


def subtract(target, cutter):
    mod = target.modifiers.new(f'cut-{cutter.name}', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter


def box(name, center_mm, size_mm, material, bevel_mm=0.6):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector([s * MM for s in size_mm]), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = [c * MM for c in center_mm]
    mesh.materials.append(material)
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = bevel_mm * MM
    mod.segments = 4
    mod.limit_method = 'NONE'
    return obj


def ball(name, center_mm, radius_mm, material):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=radius_mm * MM)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = [c * MM for c in center_mm]
    mesh.materials.append(material)
    return obj


def foot(r, z=0.0):
    """The weighted foot every piece stands on: a broad bead, a cove and a smaller bead."""
    return [(0, z), (r - 1.6, z)] + arc(r - 1.6, z + 2.1, 2.1, -90, 90, 9) + [(r - 2.6, z + 4.6), (r - 3.8, z + 5.0)] + arc(r - 4.2, z + 6.7, 1.5, -90, 90, 7)


def pawn(mat):
    profile = foot(18.6) + [(12.8, 8.7), (10.6, 10.1), (8.7, 12.4), (7.3, 15.8), (6.4, 19.6), (5.9, 23.4), (5.7, 26.0),
                            (8.6, 26.4), (9.7, 27.1), (9.9, 28.2), (9.2, 29.2), (7.4, 29.7), (5.4, 30.2)] + arc(0, 38.2, 8.8, -54, 90, 22)
    lathe('pawn', profile, mat)


def rook(mat):
    profile = foot(20.0) + [(14.2, 8.7), (12.9, 10.2), (12.2, 12.8), (11.8, 20.0), (11.4, 28.0), (11.1, 33.5), (11.1, 35.6),
                            (11.9, 36.6), (13.3, 37.5), (14.0, 38.5)] + arc(14.0, 39.7, 1.2, -90, 90, 6) + [
        (13.6, 41.2), (13.6, 51.2), (13.1, 52.0), (9.8, 52.0), (9.6, 51.4), (9.6, 48.4), (0, 48.4)]
    body = lathe('rook', profile, mat)
    for i, angle in enumerate((0, 60, 120)):
        subtract(body, cutter_box(f'crenel{i}', (0, 0, 50.6), (34, 3.8, 6.0), (0, 0, angle)))


KNIGHT_HEAD = [
    # (x, z, handle): x < 0 is the muzzle side (faces left), z from the plinth top
    (11.0, 0.0, 'V'), (13.4, 6.0, 'A'), (14.2, 12.0, 'A'), (13.8, 18.0, 'A'), (12.6, 23.5, 'A'), (10.6, 28.5, 'A'),
    (8.2, 32.6, 'A'), (6.4, 35.4, 'A'), (3.8, 41.2, 'V'), (1.0, 36.4, 'V'), (-1.0, 36.0, 'A'), (-4.8, 34.8, 'A'),
    (-9.0, 31.8, 'A'), (-13.4, 27.6, 'A'), (-17.6, 23.4, 'A'), (-20.4, 20.4, 'A'), (-21.4, 17.6, 'A'), (-20.6, 15.2, 'A'),
    (-17.6, 14.6, 'V'), (-19.0, 12.8, 'A'), (-17.4, 11.2, 'A'), (-13.4, 11.0, 'A'), (-9.6, 12.2, 'A'), (-7.0, 14.4, 'V'),
    (-6.0, 10.4, 'A'), (-7.6, 6.0, 'A'), (-10.2, 2.4, 'A'), (-11.4, 0.0, 'V'),
]
KNIGHT_SCALE = 1.0


def knight(mat):
    plinth = 16.0
    profile = foot(20.0) + [(14.2, 8.7), (13.0, 10.3), (12.5, 12.4)] + arc(12.5, 14.0, 1.6, -90, 90, 6) + [(11.8, plinth), (0, plinth)]
    lathe('knight-base', profile, mat)
    curve = bpy.data.curves.new('knight-head', 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    curve.extrude = 5.6 * MM
    curve.bevel_depth = 3.0 * MM
    curve.offset = -2.6 * MM
    curve.bevel_resolution = 6
    curve.resolution_u = 24
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(KNIGHT_HEAD) - 1)
    for point, (x, z, handle) in zip(spline.bezier_points, KNIGHT_HEAD):
        point.co = (x * KNIGHT_SCALE * MM, (z + plinth - 1.5) * MM, 0)
        kind = 'VECTOR' if handle == 'V' else 'AUTO'
        point.handle_left_type = kind
        point.handle_right_type = kind
    spline.use_cyclic_u = True
    head = link(bpy.data.objects.new('knight-head', curve))
    head.rotation_euler = (math.radians(90), 0, 0)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = head
    head.select_set(True)
    bpy.ops.object.convert(target='MESH')
    head = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(head.data)
    bm.free()
    for poly in head.data.polygons:
        poly.use_smooth = True
    depth = 5.6 + 3.0
    top = plinth - 1.5
    s = KNIGHT_SCALE
    for side in (-1, 1):
        subtract(head, cutter_sphere(f'eye{side}', (-5.6 * s, side * (depth + 0.9), top + 30.6), 2.0))
        subtract(head, cutter_sphere(f'nostril{side}', (-18.6 * s, side * (depth + 0.5), top + 19.8), 1.5))
        bpy.ops.mesh.primitive_torus_add(major_radius=6.6 * MM, minor_radius=0.5 * MM, major_segments=64, minor_segments=8,
                                         location=(-4.4 * s * MM, side * (depth + 0.1) * MM, (top + 19.6) * MM), rotation=(math.radians(90), 0, 0))
        jaw = bpy.context.active_object
        jaw.hide_render = True
        subtract(head, jaw)
    # the mane: carved tufts standing proud of the neck's back edge
    for i, (x, z, angle) in enumerate(((13.4, 6.5, 0), (14.2, 12.0, 2), (13.9, 17.5, 8), (12.8, 22.8, 18), (10.8, 27.8, 30), (8.4, 32.0, 42))):
        tuft = ball(f'mane{i}', (x * s - 0.8, 0, top + z), 1.0, mat)
        tuft.scale = (2.6, 7.0, 2.6)
        tuft.rotation_euler = (0, math.radians(-angle), 0)


def bishop(mat):
    profile = foot(19.0) + [(13.4, 8.7), (11.3, 10.3), (9.4, 13.0), (8.0, 17.0), (6.9, 22.0), (6.2, 27.0), (5.9, 31.0),
                            (9.2, 31.4), (10.4, 32.2), (10.6, 33.2), (9.8, 34.2), (8.2, 34.6), (9.5, 35.2), (9.8, 36.0), (9.0, 36.8),
                            (6.2, 37.4), (7.7, 38.6), (8.9, 41.0), (9.4, 44.0), (9.1, 47.5), (8.2, 50.6), (6.7, 53.4),
                            (4.8, 56.0), (2.8, 58.2), (1.5, 59.4), (1.4, 59.8)] + arc(0, 62.0, 2.5, -56, 90, 10)
    body = lathe('bishop', profile, mat)
    subtract(body, cutter_box('mitre', (4.2, -2.0, 50.6), (2.0, 30.0, 19.0), (0, 50, 0)))


def queen(mat):
    profile = foot(21.0) + [(15.4, 8.7), (13.0, 10.6), (10.6, 13.4), (8.8, 17.6), (7.6, 23.0), (6.8, 29.0), (6.3, 35.0), (6.1, 40.0),
                            (9.8, 40.6), (11.0, 41.4), (11.2, 42.4), (10.2, 43.4), (8.0, 43.8), (9.4, 44.4), (9.6, 45.2), (8.6, 46.0),
                            (6.4, 46.6), (6.8, 48.5), (8.0, 52.0), (9.6, 55.5), (11.2, 58.5), (12.2, 60.5), (12.7, 61.6), (12.4, 62.5),
                            (10.9, 62.6), (10.4, 63.0), (9.5, 64.7), (7.8, 66.5), (5.3, 67.8), (3.0, 68.5), (2.0, 68.9), (2.1, 69.6)] + arc(0, 72.3, 3.3, -52, 90, 12)
    lathe('queen', profile, mat)
    for i in range(10):
        angle = 2 * math.pi * (i + 0.5) / 10
        ball(f'pearl{i}', (11.4 * math.cos(angle), 11.4 * math.sin(angle), 63.6), 1.55, mat)


def king(mat):
    profile = foot(21.4) + [(15.8, 8.7), (13.4, 10.6), (11.0, 13.4), (9.2, 17.6), (8.0, 23.0), (7.1, 29.0), (6.6, 36.0), (6.4, 42.0),
                            (10.2, 42.6), (11.4, 43.4), (11.6, 44.4), (10.6, 45.4), (8.3, 45.8), (9.8, 46.4), (10.0, 47.2), (9.0, 48.0),
                            (6.6, 48.6), (7.0, 50.5), (8.2, 54.0), (9.6, 58.0), (10.8, 61.4), (11.4, 63.4), (11.6, 64.5), (11.0, 65.4),
                            (9.6, 65.6), (9.2, 66.2), (8.0, 68.2), (6.0, 69.8), (3.6, 70.8), (2.4, 71.2), (2.7, 71.7), (3.5, 72.2),
                            (3.5, 73.3), (0, 73.3)]
    lathe('king', profile, mat)
    box('cross-v', (0, 0, 79.8), (3.8, 3.8, 13.4), mat)
    box('cross-h', (0, 0, 81.2), (10.6, 3.3, 3.6), mat)


BUILDERS = {'p': pawn, 'n': knight, 'b': bishop, 'r': rook, 'q': queen, 'k': king}

# ----------------------------------------------------------------------------- scenes


def piece_camera(scene):
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = FRAME_H
    cam = link(bpy.data.objects.new('Camera', cam_data))
    e = math.radians(ELEVATION)
    target = Vector((0, 0, (BASE_Y - 0.5) * FRAME_H / math.cos(e)))
    cam.location = target + Vector((0, -math.cos(e), math.sin(e))) * 1.0
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = RES
    cam_data.sensor_fit = 'VERTICAL'


def piece_lights(scene, color):
    world = scene.world.node_tree.nodes['Background']
    world.inputs['Color'].default_value = srgb('#e9dccb')
    world.inputs['Strength'].default_value = 0.16 if color == 'w' else 0.55

    def area(name, location, energy, size, tint):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        data.color = srgb(tint)[:3]
        obj = link(bpy.data.objects.new(name, data))
        obj.location = location
        aim(obj, (0, 0, 0.035))
        return obj

    boost = 1.0 if color == 'w' else 1.5
    area('Key', (-0.28, -0.32, 0.36), 9.0 * boost, 0.22, '#fff0dc')
    area('Fill', (0.34, -0.26, 0.12), (1.2 if color == 'w' else 3.3), 0.3, '#dfe8f5')
    # rim light from behind so dark pieces keep an edge on dark squares
    area('Rim', (0.16, 0.34, 0.22), 7.0 * boost, 0.12, '#ffe6c4')
    area('Top', (0.0, 0.0, 0.42), 2.5 * boost, 0.25, '#fff6ea')


def render_piece(code, args):
    color, kind = code[0], code[1]
    scene = reset(args['samples'])
    mat = piece_material(color)
    BUILDERS[kind](mat)
    piece_camera(scene)
    piece_lights(scene, color)
    scene.render.filepath = os.path.join(args['out'], f'{code}.webp')
    bpy.ops.render.render(write_still=True)
    print('CHESS piece', code, flush=True)


def veneer(name, light, dark, vertical):
    """Flat-sawn veneer for the board: fine fibres, broader streaks and soft growth bands, every square cut from a
    different part of the log."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    info = nodes.new('ShaderNodeObjectInfo')
    shift = nodes.new('ShaderNodeVectorMath')
    shift.operation = 'MULTIPLY_ADD'
    shift.inputs[1].default_value = (0, 0, 0)
    links.new(coord.outputs['Object'], shift.inputs[0])
    offset = nodes.new('ShaderNodeCombineXYZ')
    scaled = nodes.new('ShaderNodeMath')
    scaled.operation = 'MULTIPLY'
    scaled.inputs[1].default_value = 7.3
    links.new(info.outputs['Random'], scaled.inputs[0])
    links.new(scaled.outputs[0], offset.inputs['X'])
    links.new(scaled.outputs[0], offset.inputs['Y'])
    links.new(offset.outputs[0], shift.inputs[2])
    shift.inputs[1].default_value = (1, 1, 1)

    def layer(stretch, scale, detail, roughness):
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (stretch[1], stretch[0], 1) if vertical else stretch
        links.new(shift.outputs[0], mapping.inputs['Vector'])
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = detail
        noise.inputs['Roughness'].default_value = roughness
        links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
        return noise.outputs['Fac']

    fine = layer((4.0, 260.0, 1.0), 6.0, 8.0, 0.6)
    broad = layer((2.0, 26.0, 1.0), 3.0, 4.0, 0.5)
    bands = nodes.new('ShaderNodeTexWave')
    bands.wave_type = 'BANDS'
    bands.bands_direction = 'X' if vertical else 'Y'
    bands.wave_profile = 'SIN'
    bands.inputs['Scale'].default_value = 9.0
    bands.inputs['Distortion'].default_value = 3.0
    bands.inputs['Detail'].default_value = 2.0
    links.new(shift.outputs[0], bands.inputs['Vector'])

    def mix(a, b, weight):
        node = nodes.new('ShaderNodeMix')
        node.data_type = 'FLOAT'
        node.inputs['Factor'].default_value = weight
        links.new(a, node.inputs['A'])
        links.new(b, node.inputs['B'])
        return node.outputs['Result']

    value = mix(mix(fine, broad, 0.4), bands.outputs['Fac'], 0.14)
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.26
    ramp.color_ramp.elements[0].color = srgb(dark)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = srgb(light)
    links.new(value, ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    return mat


def render_board(args):
    scene = reset(min(args['samples'], 48))
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.quality = 86
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    maple = veneer('Maple', '#f3dfb6', '#d6b17a', vertical=False)
    walnut = veneer('Walnut', '#7d4c2f', '#3a2114', vertical=True)
    inlay = bpy.data.materials.new('Inlay')
    inlay.use_nodes = True
    inlay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#24150c')
    size = 0.05
    gap = 0.00035
    bm_back = bmesh.new()
    bmesh.ops.create_grid(bm_back, x_segments=1, y_segments=1, size=size * 4)
    back_mesh = bpy.data.meshes.new('back')
    bm_back.to_mesh(back_mesh)
    bm_back.free()
    back = link(bpy.data.objects.new('back', back_mesh))
    back.location = (0, 0, -0.0005)
    back_mesh.materials.append(inlay)
    for file in range(8):
        for rank in range(8):
            dark = (file + rank) % 2 == 0
            x0 = -4 * size + file * size + gap
            y0 = -4 * size + rank * size + gap
            bm = bmesh.new()
            s = size - 2 * gap
            for vx, vy in ((x0, y0), (x0 + s, y0), (x0 + s, y0 + s), (x0, y0 + s)):
                bm.verts.new((vx, vy, 0))
            bm.faces.new(bm.verts)
            mesh = bpy.data.meshes.new(f'sq{file}{rank}')
            bm.to_mesh(mesh)
            bm.free()
            obj = link(bpy.data.objects.new(f'sq{file}{rank}', mesh))
            mesh.materials.append(walnut if dark else maple)
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = 1.0
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 8 * size
    cam = link(bpy.data.objects.new('Camera', cam_data))
    cam.location = (0, 0, 2.0)
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.filepath = os.path.join(args['out'], 'board.webp')
    bpy.ops.render.render(write_still=True)
    print('CHESS board', flush=True)


def main():
    args = parse_args()
    os.makedirs(args['out'], exist_ok=True)
    if 'pieces' in args['only']:
        for code in args['pieces']:
            render_piece(code, args)
    if 'board' in args['only']:
        render_board(args)


main()
