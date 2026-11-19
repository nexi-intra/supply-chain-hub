"""Hubert, the reddish-brown golden retriever of the Word-Puzzle room, built and rendered procedurally.

Run headless (Blender 5.2):
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode look  --out %TEMP%/hubert-look
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode look  --out %TEMP%/hubert-look --only sit --views side,front34 --zoom 0.62   (head close-ups)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode look  --out %TEMP%/hubert-look --only walk-n,lie-down --phase 0.3,0.75   (views, transition mid-poses)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode gait --strands 2000   (paw speed per view -> GAIT_SPEED in src/lib/hubertRoutine.ts)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode bounds --strands 2000   (screen extent per view -> FRAMES)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode tailcheck --strands 20000 [--verbose 1]   (tail vs basket wall, every in-basket frame)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode anims --out %TEMP%/hubert-frames [--only walk,sit]
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode anchors --out %TEMP%/hubert-frames   (re-projects anchors only, no rendering)
  blender.exe -b --factory-startup --python scripts/blender/hubert.py -- --mode sheets --out %TEMP%/hubert-frames --assets src/assets/multiplayer

The body is a metaball family parented to an armature (smooth joints in every pose); the coat is a
hair-curves object regenerated each frame from bone-skinned roots, so the fur follows the rig.
Every animation is a keyframed action; frames are rendered with Cycles on a transparent film with a
shadow catcher, then packed into horizontal WebP strips plus hubert.json (frame size, fps, anchors).
"""

import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

# ----------------------------------------------------------------------------- settings

FRAME_W, FRAME_H = 400, 280          # rendered at 2x of the 200 x 140 css box
ORTHO = 1.6                          # metres across the frame
CAM_ELEVATION = 14.0                 # degrees
DOG_TURN = -22.0                     # degrees; nose turned a little toward the camera
GROUND_Y = 255                       # pixel row of the world origin in a frame
SHADOW_EDGE_FADE = 40.0              # px over which the ground shadow fades out towards the frame edge
SHEET_SCALE = 0.75                   # strips are stored smaller (CSS sizes them by percent); keeps decoded memory low
SAMPLES = 40
STRANDS = 46000
# extra strands on the head, as a share of STRANDS
HEAD_EXTRA = 0.5

# name: (frames, fps, loop). A loop samples p = i / frames, so its last frame leads straight back into frame 0.
ANIMS = {
    'walk': (24, 24, True),
    'run': (24, 40, True),
    'sit': (20, 12, True),
    'beg': (16, 20, True),
    'sniff': (20, 16, True),
    'eat': (28, 20, False),
    'carry': (24, 24, True),
    'rest': (24, 12, True),
    'sleep': (24, 12, True),
    'chew': (20, 16, True),
    'basket': (1, 1, False),
    # standing idle and the one-shot transitions between the loops (side view); stop = start reversed,
    # stand-up = sit-down reversed, beg-down = beg-up reversed, sniff-up = sniff-down reversed, wake = doze reversed
    'stand': (16, 12, True),
    'start': (8, 20, False),
    'stand-bone': (1, 1, False),
    'sit-down': (12, 16, False),
    'beg-up': (6, 14, False),
    'sniff-down': (8, 16, False),
    'lie-down': (30, 14, False),
    'lie-down-bone': (30, 14, False),
    'get-up': (12, 14, False),
    'doze': (12, 12, False),
}
# The same gait cycle seen walking away (n), 3/4 away (ne), towards the viewer (s) and 3/4 towards (se);
# west-going views are these mirrored. Fewer frames, same period, so a view change keeps the gait phase.
for _view, _frames in (('ne', 16), ('n', 12), ('se', 16), ('s', 12)):
    ANIMS[f'walk-{_view}'] = (_frames, _frames, True)
    ANIMS[f'carry-{_view}'] = (_frames, _frames, True)
    ANIMS[f'run-{_view}'] = (15, 25, True) if _frames == 16 else (12, 20, True)
    ANIMS[f'start-{_view}'] = (8, 20, False)
    ANIMS[f'stand-bone-{_view}'] = (1, 1, False)
IN_BASKET = {'rest', 'sleep', 'chew', 'basket', 'lie-down', 'lie-down-bone', 'get-up', 'doze'}
# dog yaw per view (degrees); 'e' is the side view all the settled loops use
VIEWS = {'e': DOG_TURN, 'ne': 38.0, 'n': 90.0, 'se': -58.0, 's': -90.0}
# he turns round the middle of his body, which stays where it is in the side view
PIVOT = (-0.06, 0.0, 0.0)
BASKET_OFFSET = (-0.07, 0.02, 0.07)
# directional strips are stored smaller still; frame 0 of start-<view> doubles as the standing still of that view
DIRECTIONAL_SCALE = 0.6
STILLS = {f'stand-{v}': f'start-{v}' for v in ('ne', 'n', 'se', 's')}
# Frame box per view (width, height, ground x, ground y) at the side view's metres per pixel: walking away his head
# rises in the frame, seen from behind or in front he is narrow (measured with --mode bounds). 'tall' holds the
# circling and standing up in the basket.
FRAMES = {
    'e': (FRAME_W, FRAME_H, FRAME_W // 2, GROUND_Y),
    'ne': (360, 312, 190, 290),
    'n': (280, 316, 140, 294),
    'se': (340, 306, 175, 270),
    's': (280, 308, 140, 270),
    'tall': (480, 330, 240, 305),
}


def frame_of(name):
    base, view = split_name(name)
    return 'tall' if base in ('lie-down', 'lie-down-bone', 'get-up') else view


def split_name(name):
    """'walk-ne' -> ('walk', 'ne'); names without a view suffix are side views ('e')."""
    for view in ('ne', 'se', 'n', 's'):
        if name.endswith('-' + view):
            return name[:-len(view) - 1], view
    return name, 'e'


def srgb(hexstr, alpha=1.0):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


COAT = '#a5521f'
# melanin at tone 0 (dark ears) and tone 1 (light feathering); redness keeps him reddish golden-brown
MELANIN = (0.76, 0.32)
REDNESS = 0.9

# ----------------------------------------------------------------------------- args

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {'mode': 'look', 'out': os.path.join(os.environ.get('TEMP', '.'), 'hubert'), 'only': None, 'assets': None,
            'samples': SAMPLES, 'strands': STRANDS, 'blend': None, 'model': None}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip('-')
        args[key] = argv[i + 1]
        i += 2
    args['samples'] = int(args['samples'])
    args['strands'] = int(args['strands'])
    # Blender resolves relative render paths against the drive root, not the working directory
    args['out'] = os.path.abspath(args['out'])
    if args['assets']:
        args['assets'] = os.path.abspath(args['assets'])
    if args['only']:
        args['only'] = [name.strip() for name in args['only'].split(',') if name.strip()]
    return args

# ----------------------------------------------------------------------------- materials

def principled(name, color, roughness=0.5, **extra):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color) if isinstance(color, str) else color
    bsdf.inputs['Roughness'].default_value = roughness
    for key, value in extra.items():
        bsdf.inputs[key].default_value = value
    return mat


def coat_skin_material():
    mat = principled('HubertSkin', '#4f1f07', 0.85, **{'Sheen Weight': 0.5, 'Sheen Roughness': 0.5})
    mat.node_tree.nodes['Principled BSDF'].inputs['Sheen Tint'].default_value = srgb('#c9773a')
    return mat


def tint_head_skin(mat, head_ref):
    """The face coat is short, so the skin shows through: there it takes the coat colour instead of the dark undercoat."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    coord.object = head_ref
    dist = nodes.new('ShaderNodeVectorMath')
    dist.operation = 'LENGTH'
    links.new(coord.outputs['Object'], dist.inputs[0])
    fac = nodes.new('ShaderNodeMapRange')
    fac.inputs['From Min'].default_value = 0.1
    fac.inputs['From Max'].default_value = 0.24
    fac.inputs['To Min'].default_value = 1.0
    fac.inputs['To Max'].default_value = 0.0
    links.new(dist.outputs['Value'], fac.inputs['Value'])
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = srgb('#4f1f07')
    mix.inputs['B'].default_value = srgb('#64300f')
    links.new(fac.outputs['Result'], mix.inputs['Factor'])
    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    # no satin sheen where the coat is short, or the face reads as bare skin
    sheen = nodes.new('ShaderNodeMath')
    sheen.operation = 'MULTIPLY_ADD'
    sheen.inputs[1].default_value = -0.45
    sheen.inputs[2].default_value = 0.5
    links.new(fac.outputs['Result'], sheen.inputs[0])
    links.new(sheen.outputs[0], bsdf.inputs['Sheen Weight'])


def nose_material():
    mat = principled('Nose', '#120d0b', 0.5, **{'Coat Weight': 0.35, 'Coat Roughness': 0.25})
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    cells = nodes.new('ShaderNodeTexVoronoi')
    cells.inputs['Scale'].default_value = 420
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.002
    links.new(cells.outputs['Distance'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], nodes['Principled BSDF'].inputs['Normal'])
    return mat


def socket(node, name):
    return next(item for item in node.inputs if item.name == name)


def fur_material():
    """Physically based hair: the tone attribute (0 dark ears .. 1 light feathering) drives melanin."""
    mat = bpy.data.materials.new('HubertFur')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    hair = nodes.new('ShaderNodeBsdfHairPrincipled')
    hair.parametrization = 'MELANIN'
    info = nodes.new('ShaderNodeHairInfo')
    tone = nodes.new('ShaderNodeAttribute')
    tone.attribute_name = 'tone'
    tone.attribute_type = 'GEOMETRY'
    melanin = nodes.new('ShaderNodeMapRange')
    melanin.inputs['From Min'].default_value = 0.0
    melanin.inputs['From Max'].default_value = 1.0
    melanin.inputs['To Min'].default_value = MELANIN[0]
    melanin.inputs['To Max'].default_value = MELANIN[1]
    links.new(tone.outputs['Fac'], melanin.inputs['Value'])
    # sun-bleached tips: less melanin toward the tip
    tip = nodes.new('ShaderNodeMath')
    tip.operation = 'POWER'
    tip.inputs[1].default_value = 2.0
    links.new(info.outputs['Intercept'], tip.inputs[0])
    tip_scale = nodes.new('ShaderNodeMath')
    tip_scale.operation = 'MULTIPLY'
    tip_scale.inputs[1].default_value = -0.12
    links.new(tip.outputs[0], tip_scale.inputs[0])
    total = nodes.new('ShaderNodeMath')
    total.operation = 'ADD'
    links.new(melanin.outputs['Result'], total.inputs[0])
    links.new(tip_scale.outputs[0], total.inputs[1])
    links.new(total.outputs[0], socket(hair, 'Melanin'))
    socket(hair, 'Melanin Redness').default_value = REDNESS
    socket(hair, 'Roughness').default_value = 0.4
    socket(hair, 'Radial Roughness').default_value = 0.6
    socket(hair, 'Coat').default_value = 0.2
    socket(hair, 'Random Color').default_value = 0.1
    socket(hair, 'Random Roughness').default_value = 0.2
    links.new(hair.outputs[0], out.inputs['Surface'])
    return mat


def wicker_material():
    mat = bpy.data.materials.new('Wicker')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 26
    wave.inputs['Distortion'].default_value = 1.5
    wave2 = nodes.new('ShaderNodeTexWave')
    wave2.wave_type = 'RINGS'
    wave2.inputs['Scale'].default_value = 60
    links.new(coord.outputs['Object'], wave.inputs['Vector'])
    links.new(coord.outputs['Object'], wave2.inputs['Vector'])
    mixf = nodes.new('ShaderNodeMath')
    mixf.operation = 'MULTIPLY'
    links.new(wave.outputs['Fac'], mixf.inputs[0])
    links.new(wave2.outputs['Fac'], mixf.inputs[1])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#6b4320')
    ramp.color_ramp.elements[1].color = srgb('#d6a466')
    links.new(mixf.outputs[0], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    bump.inputs['Distance'].default_value = 0.01
    links.new(mixf.outputs[0], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.7
    return mat


def plaid_material():
    """Red-and-cream wool blanket."""
    mat = bpy.data.materials.new('Plaid')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord.outputs['Object'], sep.inputs[0])
    stripes = []
    for axis in ('X', 'Y'):
        mul = nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = 9.0
        links.new(sep.outputs[axis], mul.inputs[0])
        sine = nodes.new('ShaderNodeMath')
        sine.operation = 'SINE'
        links.new(mul.outputs[0], sine.inputs[0])
        gt = nodes.new('ShaderNodeMath')
        gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.35
        links.new(sine.outputs[0], gt.inputs[0])
        stripes.append(gt)
    add = nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    links.new(stripes[0].outputs[0], add.inputs[0])
    links.new(stripes[1].outputs[0], add.inputs[1])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb('#8e2a26')
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = srgb('#f0e4cc')
    mid = ramp.color_ramp.elements.new(0.4)
    mid.color = srgb('#b8483a')
    mul = nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 0.5
    links.new(add.outputs[0], mul.inputs[0])
    links.new(mul.outputs[0], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Sheen Weight'].default_value = 0.6
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 140
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat

# ----------------------------------------------------------------------------- helpers

def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, build, material=None):
    """build(bm) fills a bmesh."""
    import bmesh
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    if material:
        mesh.materials.append(material)
    return obj


def uv_sphere(name, center, radii, material, segments=32, rings=16, rotation=None):
    import bmesh

    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
        bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
        if rotation is not None:
            bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=rotation.to_matrix(), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return mesh_object(name, build, material)


def cylinder_between(name, a, b, radius, material, segments=24):
    import bmesh
    a, b = Vector(a), Vector(b)
    direction = b - a

    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=direction.length)
        rot = direction.to_track_quat('Z', 'Y').to_matrix()
        bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=rot, verts=bm.verts)
        bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return mesh_object(name, build, material)


def torus(name, center, major, minor, material, scale=(1, 1, 1), rotation=None, segments=48):
    import bmesh

    def build(bm):
        verts = []
        rings = 16
        for i in range(segments):
            u = 2 * math.pi * i / segments
            for j in range(rings):
                v = 2 * math.pi * j / rings
                x = (major + minor * math.cos(v)) * math.cos(u)
                y = (major + minor * math.cos(v)) * math.sin(u)
                z = minor * math.sin(v)
                verts.append(bm.verts.new((x * scale[0], y * scale[1], z * scale[2])))
        for i in range(segments):
            for j in range(rings):
                a = verts[i * rings + j]
                b = verts[((i + 1) % segments) * rings + j]
                c = verts[((i + 1) % segments) * rings + (j + 1) % rings]
                d = verts[i * rings + (j + 1) % rings]
                bm.faces.new((a, b, c, d))
        if rotation is not None:
            bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=rotation.to_matrix(), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return mesh_object(name, build, material)


def tube(name, points, radius, material, taper=(1.0, 1.0, 1.0)):
    """A smooth round tube through points; taper gives the radius factor at the start, middle and end."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for i, (point, co) in enumerate(zip(spline.bezier_points, points)):
        t = i / max(1, len(points) - 1)
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
        point.radius = taper[0] + (taper[1] - taper[0]) * t * 2 if t < 0.5 else taper[1] + (taper[2] - taper[1]) * (t - 0.5) * 2
    obj = link(bpy.data.objects.new(name, curve))
    obj.data.materials.append(material)
    return obj


def text_object(name, body, size, material, center, normal, up=Vector((0, 0, 1)), depth=0.002):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = depth
    for font_path in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(font_path):
            curve.font = bpy.data.fonts.load(font_path)
            break
    obj = link(bpy.data.objects.new(name, curve))
    obj.data.materials.append(material)
    normal = Vector(normal).normalized()
    side = up.cross(normal).normalized()
    true_up = normal.cross(side)
    rot = Matrix((side, true_up, normal)).transposed()
    obj.matrix_world = Matrix.Translation(Vector(center)) @ rot.to_4x4()
    return obj

# ----------------------------------------------------------------------------- the rig

NEAR, FAR = -1, 1   # y sign: the camera looks from -Y, so "near" legs have negative y

NECK_A, NECK_B = Vector((0.16, 0, 0.58)), Vector((0.29, 0, 0.765))
# collar centre and the neck axis it goes around
COLLAR = (NECK_A.lerp(NECK_B, 0.56), (NECK_B - NECK_A).normalized())
# eyes sit at the stop, set well apart, looking forward and a little out; (centre on the midline, half spacing)
EYE_AIM = (Vector((0.424, 0, 0.874)), 0.055)
EYE_OUT = Vector((0.6, 0.76, 0.2))
EYE_R = 0.016
# muzzle tip (leather), searched for along +X
NOSE_AIM = Vector((0.57, 0, 0.862))


def bone_table():
    bones = [
        ('root', (0, 0, 0), (0.15, 0, 0), None),
        ('hips', (-0.22, 0, 0.52), (-0.02, 0, 0.535), 'root'),
        ('chest', (-0.02, 0, 0.535), (0.16, 0, 0.56), 'hips'),
        ('neck', (0.16, 0, 0.58), (0.29, 0, 0.765), 'chest'),
        ('head', (0.29, 0, 0.765), (0.46, 0, 0.80), 'neck'),
        ('jaw', (0.40, 0, 0.80), (0.55, 0, 0.785), 'head'),
        ('tag', (0.321, 0, 0.62), (0.321, 0, 0.57), 'neck'),
        ('tail1', (-0.32, 0, 0.56), (-0.42, 0, 0.535), 'hips'),
        ('tail2', (-0.42, 0, 0.535), (-0.51, 0, 0.48), 'tail1'),
        ('tail3', (-0.51, 0, 0.48), (-0.57, 0, 0.405), 'tail2'),
        ('tail4', (-0.57, 0, 0.405), (-0.60, 0, 0.32), 'tail3'),
    ]
    for side, sign in (('n', NEAR), ('f', FAR)):
        fy, hy = 0.07 * sign, 0.078 * sign
        bones += [
            (f'ear_{side}', (0.338, 0.088 * sign, 0.905), (0.334, 0.106 * sign, 0.765), 'head'),
            (f'fu_{side}', (0.13, fy, 0.47), (0.09, fy, 0.31), 'chest'),
            (f'fl_{side}', (0.09, fy, 0.31), (0.10, fy, 0.075), f'fu_{side}'),
            (f'fp_{side}', (0.10, fy, 0.075), (0.155, fy, 0.022), f'fl_{side}'),
            (f'hu_{side}', (-0.24, hy, 0.48), (-0.165, hy, 0.295), 'hips'),
            (f'hl_{side}', (-0.165, hy, 0.295), (-0.29, hy, 0.125), f'hu_{side}'),
            (f'hm_{side}', (-0.29, hy, 0.125), (-0.272, hy, 0.042), f'hl_{side}'),
            (f'hp_{side}', (-0.272, hy, 0.042), (-0.215, hy, 0.022), f'hm_{side}'),
            (f'eye_{side}', EYE_AIM[0] + Vector((0, EYE_AIM[1] * sign, 0)), EYE_AIM[0] + Vector((0.015, (EYE_AIM[1] + 0.003) * sign, 0)), 'head'),
        ]
    return bones


def build_armature(table=None, name='HubertRig'):
    arm_data = bpy.data.armatures.new(name)
    arm = link(bpy.data.objects.new(name, arm_data))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    edit = arm_data.edit_bones
    for name, head, tail, parent in table or bone_table():
        bone = edit.new(name)
        bone.head, bone.tail = Vector(head), Vector(tail)
        bone.align_roll(Vector((0, 1, 0)))
        if parent:
            bone.parent = edit[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    return arm


def parent_to_bone(obj, arm, bone_name):
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone_name]
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    tail = arm.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))
    obj.matrix_parent_inverse = tail.inverted()

# ----------------------------------------------------------------------------- the body (metaball family)

VISIBLE = 0.575   # visible radius / influence radius for an isolated element (threshold 0.6, stiffness 2)


def pitch(deg):
    return Quaternion((0, 1, 0), math.radians(-deg))


def along(a, b):
    """Rotation that turns +X toward the direction a->b."""
    d = (Vector(b) - Vector(a)).normalized()
    return Vector((1, 0, 0)).rotation_difference(d)


def body_parts():
    """bone -> list of (center, semi_axes, rotation, negative)."""
    parts = {
        'hips': [
            ((-0.26, 0, 0.515), (0.125, 0.112, 0.112), None),
            ((-0.12, 0, 0.53), (0.125, 0.104, 0.098), None),
        ],
        'chest': [
            ((0.065, 0, 0.47), (0.165, 0.118, 0.155), pitch(-4)),
            ((0.11, 0, 0.565), (0.10, 0.095, 0.07), None),
            ((0.185, 0, 0.47), (0.07, 0.088, 0.10), None),
        ],
        'neck': [
            ((0.225, 0, 0.67), (0.12, 0.08, 0.086), along((0.16, 0, 0.58), (0.29, 0, 0.765))),
            ((0.195, 0, 0.61), (0.09, 0.098, 0.10), None),
        ],
        # golden retriever head: broad, slightly domed skull, moderate stop, a straight deep muzzle about as long
        # as the skull, full cheeks and soft flews
        'head': [
            ((0.332, 0, 0.858), (0.105, 0.086, 0.076), None),            # cranium
            ((0.352, 0, 0.893), (0.075, 0.072, 0.042), None),            # broad, flat top of the skull
            ((0.29, 0, 0.83), (0.06, 0.07, 0.07), None),                 # occiput into the neck
            ((0.372, 0, 0.828), (0.062, 0.084, 0.052), None),            # cheeks
            ((0.32, 0, 0.785), (0.07, 0.066, 0.045), None),              # throat under the skull
            ((0.418, 0, 0.872), (0.042, 0.046, 0.04), None),             # stop and brow
            ((0.482, 0, 0.845), (0.08, 0.051, 0.043), None),             # muzzle
            ((0.528, 0, 0.844), (0.044, 0.048, 0.04), None),             # blunt muzzle front
            ((0.43, 0, 0.838), (0.045, 0.052, 0.045), None),             # muzzle blends into the skull
        ],
        'jaw': [
            ((0.478, 0, 0.787), (0.075, 0.038, 0.02), pitch(-2)),        # lower jaw and chin
        ],
        'tail1': [((-0.37, 0, 0.548), (0.06, 0.033, 0.034), along((-0.32, 0, 0.56), (-0.42, 0, 0.535)))],
        'tail2': [((-0.465, 0, 0.508), (0.055, 0.027, 0.028), along((-0.42, 0, 0.535), (-0.51, 0, 0.48)))],
        'tail3': [((-0.54, 0, 0.443), (0.05, 0.022, 0.023), along((-0.51, 0, 0.48), (-0.57, 0, 0.405)))],
        'tail4': [((-0.585, 0, 0.362), (0.045, 0.017, 0.018), along((-0.57, 0, 0.405), (-0.60, 0, 0.32)))],
    }
    for side, sign in (('n', NEAR), ('f', FAR)):
        fy, hy = 0.07 * sign, 0.078 * sign
        # flews (the upper lips hang over the lower jaw), slightly higher at the corner of the mouth: a soft smile
        parts['head'].append(((0.495, 0.034 * sign, 0.802), (0.068, 0.026, 0.031), pitch(3)))
        parts['head'].append(((0.532, 0.03 * sign, 0.803), (0.04, 0.027, 0.03), None))
        # medium ears set at eye level behind the eye, hanging flat against the cheek, wide at the top
        tuck = Quaternion((1, 0, 0), math.radians(-6 * sign))
        parts[f'ear_{side}'] = [
            ((0.35, 0.097 * sign, 0.822), (0.044, 0.011, 0.062), tuck @ pitch(-8)),
            ((0.357, 0.093 * sign, 0.865), (0.046, 0.011, 0.027), tuck),
        ]
        parts[f'fu_{side}'] = [((0.112, fy, 0.39), (0.095, 0.046, 0.054), along((0.13, fy, 0.47), (0.09, fy, 0.31)))]
        parts[f'fl_{side}'] = [((0.095, fy, 0.19), (0.125, 0.035, 0.038), along((0.09, fy, 0.31), (0.10, fy, 0.075)))]
        parts[f'fp_{side}'] = [((0.124, fy, 0.03), (0.044, 0.034, 0.026), None)]
        parts[f'hu_{side}'] = [((-0.21, hy, 0.40), (0.10, 0.066, 0.125), pitch(-18))]
        parts[f'hl_{side}'] = [((-0.228, hy, 0.21), (0.105, 0.042, 0.046), along((-0.165, hy, 0.295), (-0.29, hy, 0.125)))]
        parts[f'hm_{side}'] = [((-0.282, hy, 0.083), (0.05, 0.03, 0.029), along((-0.29, hy, 0.125), (-0.272, hy, 0.042)))]
        parts[f'hp_{side}'] = [((-0.243, hy, 0.027), (0.044, 0.033, 0.026), None)]
    return parts


def build_body(arm, material):
    objects = []
    for index, (bone, items) in enumerate(body_parts().items()):
        name = 'Hubert' if index == 0 else f'Hubert.{index:03d}'
        data = bpy.data.metaballs.new(name)
        data.resolution = 0.012
        data.render_resolution = 0.0075
        data.threshold = 0.6
        for item in items:
            center, axes = item[0], item[1]
            rotation = item[2] if len(item) > 2 else None
            largest = max(axes)
            el = data.elements.new(type='ELLIPSOID')
            el.co = Vector(center)
            el.radius = largest / VISIBLE
            el.size_x, el.size_y, el.size_z = (a / largest for a in axes)
            el.stiffness = 2.0
            if rotation is not None:
                el.rotation = rotation
        if index == 0:
            data.materials.append(material)
        obj = link(bpy.data.objects.new(name, data))
        parent_to_bone(obj, arm, bone)
        objects.append((obj, bone))
    return objects

# ----------------------------------------------------------------------------- face, collar, tag, props

def skin_tree(basis):
    """BVH of the fused rest-pose skin, to seat the eyes and the nose on it."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    evaluated = basis.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    world = basis.matrix_world.copy()
    verts = [world @ v.co for v in mesh.vertices]
    polys = [tuple(p.vertices) for p in mesh.polygons]
    evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def surface_point(tree, near, outward):
    outward = Vector(outward).normalized()
    hit, normal, _, _ = tree.ray_cast(Vector(near) + outward * 0.25, -outward, 0.5)
    return (hit, normal) if hit is not None else (Vector(near), outward)


EYES = []


def build_details(arm, basis):
    # dark brown eyes with a glossy cornea, black rims; black leather nose; black lips
    eye_mat = principled('Eye', '#2a1307', 0.2, **{'Coat Weight': 0.35, 'Coat Roughness': 0.15})
    rim_mat = principled('EyeRim', '#0d0806', 0.55)
    nose_mat = nose_material()
    nostril_mat = principled('Nostril', '#040303', 0.8)
    mouth_mat = principled('Mouth', '#3a0f0e', 0.6)
    tongue_mat = principled('Tongue', '#d9656c', 0.35, **{'Subsurface Weight': 0.3})
    collar_mat = principled('Collar', '#1d5b66', 0.45, **{'Sheen Weight': 0.3})
    brass = principled('Brass', '#d9a944', 0.22, **{'Metallic': 1.0})
    engrave = principled('Engrave', '#3a250b', 0.5)
    glint_mat = principled('Glint', '#ffffff', 0.1, **{'Emission Color': (1, 1, 1, 1), 'Emission Strength': 1.2})
    details = {}
    tree = skin_tree(basis)

    EYES.clear()
    for side, sign in (('n', NEAR), ('f', FAR)):
        out = Vector((EYE_OUT.x, EYE_OUT.y * sign, EYE_OUT.z)).normalized()
        aim = EYE_AIM[0] + Vector((0, EYE_AIM[1] * sign, 0))
        hit, _ = surface_point(tree, aim, out)
        # a little more than half the eyeball is buried: almond-shaped, not bulging
        centre = hit - out * EYE_R * 0.42
        EYES.append(centre)
        # almond-shaped: narrower top to bottom than across
        flat = Vector((0, 0, 1)).cross(out).normalized()
        turn = Matrix((flat, out.cross(flat), out)).transposed().to_quaternion()
        eye = uv_sphere(f'eye_{side}', centre, (EYE_R * 1.12, EYE_R * 0.86, EYE_R * 0.9), eye_mat, rotation=turn)
        parent_to_bone(eye, arm, f'eye_{side}')
        rim = torus(f'rim_{side}', hit - out * 0.001, EYE_R * 0.93, EYE_R * 0.15, rim_mat, scale=(1.18, 0.84, 1.0), rotation=turn, segments=32)
        parent_to_bone(rim, arm, f'eye_{side}')
        glint_at = centre + (out + Vector((0.25, -0.2 * sign, 0.45))).normalized() * EYE_R * 0.92
        glint = uv_sphere(f'glint_{side}', glint_at, (0.0024, 0.0024, 0.0024), glint_mat, 12, 6)
        parent_to_bone(glint, arm, f'eye_{side}')
        details[f'eye_{side}'] = eye

    tip, _ = surface_point(tree, NOSE_AIM, Vector((1, 0, 0.1)))
    nose_at = tip + Vector((-0.016, 0, 0.003))
    nose = uv_sphere('nose', nose_at, (0.023, 0.035, 0.022), nose_mat, 40, 20, rotation=pitch(-12))
    parent_to_bone(nose, arm, 'head')
    for sign in (NEAR, FAR):
        nostril = uv_sphere('nostril', nose_at + Vector((0.015, 0.014 * sign, -0.004)), (0.0055, 0.0075, 0.004), nostril_mat, 16, 8,
                            rotation=Quaternion((0, 0, 1), math.radians(28 * sign)))
        parent_to_bone(nostril, arm, 'head')
    NOSE_X[0] = nose_at.x
    mouth = uv_sphere('mouth', (0.49, 0, 0.792), (0.07, 0.034, 0.012), mouth_mat)
    parent_to_bone(mouth, arm, 'head')
    # black lip edge along the flews, tucked up at the corner of the mouth: a soft smile
    lip_mat = principled('Lip', '#140c09', 0.5)
    for side, sign in (('n', NEAR), ('f', FAR)):
        points = []
        for k in range(10):
            t = k / 9
            x = 0.425 + t * 0.122
            z = 0.806 - 0.024 * t + 0.008 * (1 - t) ** 3
            hit, normal = surface_point(tree, Vector((x, 0, z)), Vector((0, sign, -0.2)))
            points.append(hit + normal * 0.001)
        lip = tube(f'lip_{side}', points, 0.0024, lip_mat, taper=(0.7, 1.0, 0.55))
        parent_to_bone(lip, arm, 'head')
    tongue = uv_sphere('tongue', (0.5, 0, 0.787), (0.055, 0.026, 0.008), tongue_mat, rotation=pitch(-6))
    parent_to_bone(tongue, arm, 'jaw')
    details['tongue'] = tongue

    # collar around the neck, brass ring at the front
    center, axis = COLLAR
    rot = Vector((0, 0, 1)).rotation_difference(axis)
    collar = torus('collar', center, 0.1, 0.017, collar_mat, scale=(1.0, 1.06, 0.62), rotation=rot)
    parent_to_bone(collar, arm, 'neck')
    forward = Vector((axis.z, 0, -axis.x))
    ring_at = center + forward * 0.108
    ring = torus('ring', ring_at, 0.011, 0.0025, brass, rotation=Quaternion((1, 0, 0), math.radians(90)), segments=24)
    parent_to_bone(ring, arm, 'neck')

    # name tag: a brass disc that faces the camera, "Hubert" engraved on it
    view = Vector((math.sin(math.radians(-DOG_TURN)), -math.cos(math.radians(-DOG_TURN)), 0.0))
    view = (view * math.cos(math.radians(CAM_ELEVATION)) + Vector((0, 0, math.sin(math.radians(CAM_ELEVATION))))).normalized()
    tag_center = Vector((0.322, 0, 0.576)) + view * 0.03
    tag_rot = Vector((0, 0, 1)).rotation_difference(view)
    tag = uv_sphere('tag', tag_center, (0.034, 0.034, 0.0055), brass, 40, 16, rotation=tag_rot)
    parent_to_bone(tag, arm, 'tag')
    label = text_object('tag_text', 'Hubert', 0.0155, engrave, tag_center + view * 0.0058, view, depth=0.0012)
    parent_to_bone(label, arm, 'tag')
    details['tag'] = tag
    details['tag_center'] = tag_center
    return details


def build_treat():
    biscuit = principled('Biscuit', '#c98b4b', 0.8)
    parts = []
    parts.append(cylinder_between('treat_shaft', (-0.022, 0, 0), (0.022, 0, 0), 0.010, biscuit))
    for x in (-0.026, 0.026):
        for y in (-0.009, 0.009):
            parts.append(uv_sphere('treat_knob', (x, y, 0), (0.011, 0.011, 0.010), biscuit, 16, 8))
    root = link(bpy.data.objects.new('treat', None))
    for part in parts:
        part.parent = root
    return root


def build_meat_bone():
    bone_mat = principled('BoneWhite', '#f1e7d4', 0.55, **{'Subsurface Weight': 0.1})
    meat_mat = principled('Meat', '#8a2d22', 0.35, **{'Coat Weight': 0.4, 'Coat Roughness': 0.2})
    fat_mat = principled('Fat', '#e9b9a2', 0.5)
    root = link(bpy.data.objects.new('meatbone', None))
    parts = [cylinder_between('mb_shaft', (-0.10, 0, 0), (0.06, 0, 0), 0.016, bone_mat)]
    for y in (-0.016, 0.016):
        parts.append(uv_sphere('mb_knob', (-0.108, y, 0), (0.022, 0.021, 0.02), bone_mat, 20, 10))
    parts.append(uv_sphere('mb_meat', (0.055, 0, 0), (0.06, 0.044, 0.04), meat_mat, 32, 16))
    parts.append(uv_sphere('mb_fat', (0.07, -0.01, 0.022), (0.035, 0.025, 0.015), fat_mat, 20, 10))
    for part in parts:
        part.parent = root
    return root


def build_basket():
    wicker = wicker_material()
    plaid = plaid_material()
    wood = principled('Plaque', '#e9d6b0', 0.6)
    ink = principled('PlaqueInk', '#6b2a1d', 0.5)
    root = link(bpy.data.objects.new('basket', None))
    rx, ry = 0.56, 0.40
    parts = []
    import bmesh

    def walls(bm):
        rings, segs = 6, 64
        verts = []
        for j in range(rings + 1):
            t = j / rings
            z = 0.02 + t * 0.17
            s = 0.90 + 0.10 * math.sin(t * math.pi / 2)
            row = []
            for i in range(segs):
                u = 2 * math.pi * i / segs
                row.append(bm.verts.new((rx * s * math.cos(u), ry * s * math.sin(u), z)))
            verts.append(row)
        for j in range(rings):
            for i in range(segs):
                bm.faces.new((verts[j][i], verts[j][(i + 1) % segs], verts[j + 1][(i + 1) % segs], verts[j + 1][i]))
        bottom = [verts[0][i] for i in range(segs)]
        bm.faces.new(bottom)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.025)
    parts.append(mesh_object('basket_walls', walls, wicker))
    parts.append(torus('basket_rim', (0, 0, 0.19), 1.0, 0.045, wicker, scale=(rx, ry, 1.0), segments=72))
    parts.append(uv_sphere('cushion', (0, 0, 0.06), (rx * 0.86, ry * 0.84, 0.05), plaid, 48, 16))
    for part in parts:
        part.parent = root
    # name plaque on the front rim, facing the camera
    view = Vector((0, -math.cos(math.radians(CAM_ELEVATION)), math.sin(math.radians(CAM_ELEVATION)))).normalized()
    front = Vector((0.0, -ry - 0.035, 0.16))
    plaque = uv_sphere('plaque', front, (0.19, 0.012, 0.058), wood, 40, 12)
    plaque.parent = root
    label = text_object('plaque_text', 'Hubert', 0.072, ink, front + Vector((0, -0.0135, 0.0)), Vector((0, -1, 0)), depth=0.002)
    label.parent = root
    return root


BASKET_R = (0.56, 0.40)
BASKET_TOP = 0.235   # top of the rim tube; above it the coat may lie over the rim
BASKET_WALL = 0.025  # half the wicker's thickness round the wall's centre surface (the rim tube fits inside it too)
TAIL_BONES = ('tail1', 'tail2', 'tail3', 'tail4')
TAIL_GIRTH = 0.05    # tail centre line to the outside of its coat


def basket_overlap(lines, basket, margin):
    """How deep (m) each polyline (n, k, 3, ordered from its root) cuts into the wicker: a point inside the wall, or
    a step from inside the basket to outside it (or back) without going over the rim. <= 0 = clear."""
    lines = np.asarray(lines, dtype=float)
    local = lines - np.array(basket.matrix_world.translation)
    z = local[..., 2]
    t = np.clip((z - 0.02) / 0.17, 0, 1)
    s = 0.9 + 0.1 * np.sin(t * math.pi / 2)
    e = np.maximum(np.hypot(local[..., 0] / (BASKET_R[0] * s), local[..., 1] / (BASKET_R[1] * s)), 1e-9)
    # signed distance from the wall's centre surface along the ray from the basket's axis (+ = outside)
    dist = np.hypot(local[..., 0], local[..., 1]) * (1 - 1 / e)
    band = BASKET_WALL + margin
    low = z < BASKET_TOP + margin
    depth = np.where(low, band - np.abs(dist), -1.0)
    side = np.where(low, np.sign(dist), 0.0)
    crossed = (side[:, 1:] * side[:, :-1]) < 0
    return np.maximum(depth.max(axis=1), np.where(crossed.any(axis=1), band, -1.0))


def tail_clearance(arm, basket, fur=None):
    """Worst cut of the tail (centre line + coat girth) and, after fur.update(), of its strands into the basket."""
    bpy.context.view_layer.update()
    line = []
    for name in TAIL_BONES:
        pb = arm.pose.bones[name]
        for k in np.linspace(0, 1, 6):
            line.append(arm.matrix_world @ pb.head.lerp(pb.tail, k))
    bone = float(basket_overlap([line], basket, TAIL_GIRTH).max())
    strands = None
    if fur is not None and fur.pts is not None:
        strands = float(basket_overlap(fur.pts[fur.tail_mask], basket, 0.003).max())
    return bone, strands

# ----------------------------------------------------------------------------- the Meshy model (--model)
# A sculpted, textured dog (Meshy, CC BY 4.0) instead of the metaball body and generated coat. Its own skeleton only
# says where the joints are: Hubert's rig is rebuilt on those joints (same bone names and parents, so every pose
# keeps working), the model's skin weights are renamed to Hubert's bones, and a reference copy of the original rig
# decides how high he stands in each frame, so his paws touch the floor where the original design put them.

MODEL_LENGTH = 1.0         # metres from nose to rump, as the original Hubert without his tail
MODEL = {'on': False, 'ref': None, 'corr': {}, 'ref_sole': 0.0, 'sole': 0.0}
# Meshy bone -> Hubert bone ('#' = the side: R_ is the near side, the camera looks from -Y)
MODEL_GROUPS = {
    'tail': 'hips', 'tailstart': 'hips',
    'chest': 'neck', 'head': 'head', 'headend': 'head',
    'frontleg': 'fu_#', 'frontleg0': 'fl_#', 'frontleg1': 'fp_#', 'frontleg2': 'fp_#',
    'backleg': 'hu_#', 'backleg0': 'hl_#', 'backleg1': 'hm_#', 'backleg2': 'hp_#',
}
# The model's visible tail (these groups) is re-weighted along four even segments from its root to its tip.
MODEL_TAIL = ('tail1', 'tail2', 'tail3')
# Bones whose rest direction is turned to the original rig's, so the poses fold the legs and lift the tail as designed;
# the neck and head keep the model's own carriage.
MODEL_CORRECT = ('hips', 'chest', 'fu_n', 'fu_f', 'fl_n', 'fl_f', 'fp_n', 'fp_f', 'hu_n', 'hu_f', 'hl_n', 'hl_f',
                 'hm_n', 'hm_f', 'hp_n', 'hp_f', 'tail1', 'tail2', 'tail3', 'tail4')


class NoFur:
    pts = None

    def update(self):
        pass


# Extra bends (deg) for the model in the settled poses: its upper arm and thigh are longer than the original rig's.
MODEL_TWEAKS = {
    'sit': {},
    'stand': {'tail1': 14, 'tail2': 6},
}


def model_tweak(spec, kind):
    if not MODEL['on']:
        return spec
    for bone, extra in MODEL_TWEAKS.get(kind, {}).items():
        bend, roll, yaw = _vec(bone, spec.get(bone))
        spec[bone] = (bend + extra, roll, yaw)
    return spec


def _side_angle(head, tail):
    return math.degrees(math.atan2(tail[2] - head[2], tail[0] - head[0]))


def import_model(path):
    """The model in Hubert's frame (nose +X, near side -Y, feet on z=0, MODEL_LENGTH long): mesh + joint positions."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [obj for obj in bpy.data.objects if obj not in before]
    marm = next(obj for obj in new if obj.type == 'ARMATURE')
    mesh = max((obj for obj in new if obj.type == 'MESH'), key=lambda obj: len(obj.data.vertices))
    if marm.animation_data:
        marm.animation_data.action = None
    marm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    heads = {pb.name: marm.matrix_world @ pb.bone.head_local for pb in marm.pose.bones}
    world = mesh.matrix_world.copy()
    mesh.modifiers.clear()
    mesh.parent = None
    mesh.data.transform(world)
    mesh.matrix_world = Matrix.Identity(4)
    co = np.empty(len(mesh.data.vertices) * 3)
    mesh.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    # the length runs along the longer horizontal axis; the head is the end with the highest points
    axis = 0 if hi[0] - lo[0] > hi[1] - lo[1] else 1
    top = co[co[:, 2] > lo[2] + 0.8 * (hi[2] - lo[2])]
    forward = 1 if top[:, axis].mean() > (lo[axis] + hi[axis]) / 2 else -1
    angle = {(0, 1): 0.0, (0, -1): 180.0, (1, 1): -90.0, (1, -1): 90.0}[(axis, forward)]
    centre = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
    size = hi[axis] - lo[axis]
    fit = Matrix.Scale(MODEL_LENGTH / size, 4) @ Matrix.Rotation(math.radians(angle), 4, 'Z') @ Matrix.Translation(-centre)
    mesh.data.transform(fit)
    joints = {name: fit @ value for name, value in heads.items()}
    for obj in new:
        if obj is not mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
    mesh.name = 'HubertModel'
    return mesh, joints


def group_points(mesh, names, minimum=0.5):
    index = {mesh.vertex_groups[name].index for name in names if name in mesh.vertex_groups}
    points = [v.co.copy() for v in mesh.data.vertices if any(g.group in index and g.weight >= minimum for g in v.groups)]
    return np.array(points) if points else np.zeros((0, 3))


def model_bone_table(mesh, J):
    """Hubert's bones (names and parents as in bone_table) placed on the model's joints."""
    head_pts = group_points(mesh, ['head', 'headend'])
    nose = Vector(head_pts[head_pts[:, 0].argmax()])
    nose.y = 0.0
    tail_pts = group_points(mesh, ['tail3'], 0.3)
    tip = Vector(tail_pts[np.linalg.norm(tail_pts - np.array(J['tail3']), axis=1).argmax()]) if len(tail_pts) else J['tail3'] + Vector((-0.08, 0, -0.08))

    def toe(group, joint):
        pts = group_points(mesh, [group], 0.3)
        front = pts[:, 0].max() if len(pts) else joint.x + 0.05
        return Vector((front, joint.y, max(0.01, joint.z * 0.6)))

    def ear(group):
        pts = group_points(mesh, [group], 0.4)
        if len(pts) < 8:
            return None
        z = pts[:, 2]
        top = pts[z >= np.percentile(z, 75)].mean(0)
        bottom = pts[z <= np.percentile(z, 25)].mean(0)
        return Vector(top), Vector(bottom), float(pts[:, 1].mean())

    mid = J['Hips'].lerp(J['chest'], 0.5)
    for key in ('Hips', 'chest', 'head', 'tailstart', 'tail1', 'tail2', 'tail3'):
        J[key] = Vector((J[key].x, 0.0, J[key].z))
    mid.y = 0.0
    drop = Vector((0, 0, 0.045 * MODEL_LENGTH))
    head_vec = nose - J['head']
    root_tail = J['tail1']
    tail_points = [root_tail.lerp(tip, k / 4) for k in range(5)]
    J['_tail'] = tail_points
    bones = [
        ('root', (0, 0, 0), (0.15, 0, 0), None),
        ('hips', J['Hips'], mid, 'root'),
        ('chest', mid, J['chest'], 'hips'),
        ('neck', J['chest'], J['head'], 'chest'),
        ('head', J['head'], nose, 'neck'),
        ('jaw', J['head'] + head_vec * 0.55 - drop, nose - drop, 'head'),
        ('tail1', tail_points[0], tail_points[1], 'hips'),
        ('tail2', tail_points[1], tail_points[2], 'tail1'),
        ('tail3', tail_points[2], tail_points[3], 'tail2'),
        ('tail4', tail_points[3], tail_points[4], 'tail3'),
    ]
    tag = J['chest'] + Vector((0.06, 0, -0.07)) * MODEL_LENGTH
    bones.append(('tag', tag, tag - Vector((0, 0, 0.05)), 'neck'))
    ears = [e for e in (ear(group) for group in ('earend', 'R_earend') if group in mesh.vertex_groups) if e]
    for side, sign, prefix in (('n', NEAR, 'R_'), ('f', FAR, '')):
        bones += [
            (f'fu_{side}', J[prefix + 'frontleg'], J[prefix + 'frontleg0'], 'chest'),
            (f'fl_{side}', J[prefix + 'frontleg0'], J[prefix + 'frontleg1'], f'fu_{side}'),
            (f'fp_{side}', J[prefix + 'frontleg1'], toe(prefix + 'frontleg2', J[prefix + 'frontleg2']), f'fl_{side}'),
            (f'hu_{side}', J[prefix + 'backleg'], J[prefix + 'backleg0'], 'hips'),
            (f'hl_{side}', J[prefix + 'backleg0'], J[prefix + 'backleg1'], f'hu_{side}'),
            (f'hm_{side}', J[prefix + 'backleg1'], J[prefix + 'backleg2'], f'hl_{side}'),
            (f'hp_{side}', J[prefix + 'backleg2'], toe(prefix + 'backleg2', J[prefix + 'backleg2']), f'hm_{side}'),
        ]
        eye = J['head'] + head_vec * 0.62 + Vector((0, 0.035 * sign, 0.03)) * MODEL_LENGTH
        bones.append((f'eye_{side}', eye, eye + Vector((0.015, 0.003 * sign, 0)), 'head'))
        # the ear on this side: the model's ear group whose vertices lie on this side, else a point beside the skull
        match = [e for e in ears if (e[2] < 0) == (sign < 0)]
        if match:
            bones.append((f'ear_{side}', match[0][0], match[0][1], 'head'))
        else:
            top = J['head'] + Vector((0, 0.05 * sign, 0.08)) * MODEL_LENGTH
            bones.append((f'ear_{side}', top, top - Vector((0, 0, 0.1)), 'head'))
    return [(name, tuple(head), tuple(tail), parent) for name, head, tail, parent in bones], ears


def remap_groups(mesh, J, ears):
    """The model's weights renamed to Hubert's bones; the back (one Meshy bone) is shared by hips and chest."""
    old = {g.index: g.name for g in mesh.vertex_groups}
    near_ear = next((name for name, e in zip(('earend', 'R_earend'), ears) if e[2] < 0), 'R_earend')
    weights = {}
    split_at = (J['Hips'].x + J['chest'].x) / 2
    blend_width = 0.12 * MODEL_LENGTH
    tail = J['_tail']
    axis = tail[4] - tail[0]
    for v in mesh.data.vertices:
        out = {}
        for g in v.groups:
            name = old[g.group]
            if name in MODEL_TAIL:
                # position along the tail -> the two nearest of the four segments
                k = min(3.999, max(0.0, (v.co - tail[0]).dot(axis) / axis.length_squared * 4))
                seg = min(3, int(k - 0.5)) if k > 0.5 else 0
                share = smooth(k - 0.5 - seg) if 0.5 < k < 3.5 else (0.0 if k <= 0.5 else 1.0)
                first, second = f'tail{seg + 1}', f'tail{min(4, seg + 2)}'
                out[first] = out.get(first, 0) + g.weight * (1 - share)
                out[second] = out.get(second, 0) + g.weight * share
                continue
            if name == 'Hips':
                w = smooth((v.co.x - (split_at - blend_width / 2)) / blend_width)
                out['chest'] = out.get('chest', 0) + g.weight * w
                out['hips'] = out.get('hips', 0) + g.weight * (1 - w)
                continue
            if name in ('earend', 'R_earend'):
                target = 'ear_n' if name == near_ear else 'ear_f'
            else:
                base = name[2:] if name.startswith('R_') else name
                target = MODEL_GROUPS.get(base)
                if target is None:
                    continue
                target = target.replace('#', 'n' if name.startswith('R_') else 'f')
            out[target] = out.get(target, 0) + g.weight
        weights[v.index] = out
    for g in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(g)
    groups = {}
    for index, out in weights.items():
        for name, w in out.items():
            if w <= 0:
                continue
            if name not in groups:
                groups[name] = mesh.vertex_groups.new(name=name)
            groups[name].add([index], w, 'REPLACE')


def build_model(path):
    mesh, J = import_model(path)
    table, ears = model_bone_table(mesh, J)
    remap_groups(mesh, J, ears)
    arm = build_armature(table)
    arm['hubert_model'] = True
    mesh.parent = arm
    modifier = mesh.modifiers.new('Armature', 'ARMATURE')
    modifier.object = arm
    for slot in mesh.material_slots:
        bsdf = slot.material.node_tree.nodes.get('Principled BSDF') if slot.material and slot.material.use_nodes else None
        if bsdf:
            bsdf.inputs['Roughness'].default_value = 0.75
            if 'Specular IOR Level' in bsdf.inputs:
                bsdf.inputs['Specular IOR Level'].default_value = 0.25
    # the original rig, never rendered: it says where the paws are in each frame of the design
    ref = build_armature(name='HubertReference')
    ref.hide_render = ref.hide_viewport = True
    set_pose(ref, {'root': (0, 0)})
    bpy.context.view_layer.update()
    MODEL['ref'] = ref
    MODEL['mesh'] = mesh
    tail_groups = {mesh.vertex_groups[name].index for name in TAIL_BONES if name in mesh.vertex_groups}
    MODEL['body'] = np.array([sum(g.weight for g in v.groups if g.group in tail_groups) < 0.3 for v in mesh.data.vertices])
    MODEL['on'] = True
    rest_arm = {pb.name: (pb.bone.head_local, pb.bone.tail_local) for pb in arm.pose.bones}
    parent = {name: par for name, _, _, par in table}
    ref_dir = {pb.name: (pb.head, pb.tail) for pb in ref.pose.bones}

    def angle(points, name):
        if name not in points:
            return 0.0
        return _side_angle(*points[name])
    corr = {}
    for name in MODEL_CORRECT:
        par = parent[name]
        want = angle(ref_dir, name) - (angle(ref_dir, par) if par != 'root' else 0.0)
        have = angle(rest_arm, name) - (angle(rest_arm, par) if par != 'root' else 0.0)
        corr[name] = (want - have + 180) % 360 - 180
    MODEL['corr'] = corr
    MODEL['ref_sole'] = lowest_point(ref)
    set_pose(arm, standing())
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    co = np.empty(len(ev.data.vertices) * 3)
    ev.data.vertices.foreach_get('co', co)
    MODEL['sole'] = lowest_point(arm) - float(co.reshape(-1, 3)[:, 2].min())
    print('HUBERT model corrections', {k: round(v, 1) for k, v in corr.items()}, 'sole', round(MODEL['sole'], 3), flush=True)
    print('HUBERT rest side angles', {k: round(angle(ref_dir, k), 1) for k in MODEL_CORRECT + ('neck', 'head')}, flush=True)
    tag = link(bpy.data.objects.new('HubertTag', None))
    tag_head = next(head for name, head, _, _ in table if name == 'tag')
    tag.location = tag_head
    parent_to_bone_keep(tag, arm, 'neck')
    return arm, mesh, {'tag': tag, 'tag_center': Vector((0, 0, 0))}


def model_lowest(arm):
    """Lowest point of the posed model, measured from the armature's own height (it is only ever turned about Z)."""
    bpy.context.view_layer.update()
    mesh = MODEL['mesh']
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    co = np.empty(len(ev.data.vertices) * 3)
    ev.data.vertices.foreach_get('co', co)
    # the tail may hang below the floor line (it is drawn over it); he stands on the rest of his body
    return float(co.reshape(-1, 3)[MODEL['body'], 2].min()) + mesh.matrix_world.translation.z - arm.location.z


def parent_to_bone_keep(obj, arm, bone_name):
    """Parents obj to a bone without moving it."""
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = world

# ----------------------------------------------------------------------------- fur

HEAD_BONES = ('head', 'jaw', 'ear_n', 'ear_f')
NOSE_X = [0.575]


def region_rules(rest, normal, bone):
    """Length (m), comb direction, lift, droop, tone for one strand at rest (tone 0 = darkest, 1 = lightest)."""
    x, y, z = rest
    nz = normal[2]
    back = Vector((-1, 0, -0.3)).normalized()
    length, comb, lift, droop, tone = 0.03, back, 0.38, 0.08, 0.42
    if bone == 'head':
        # short, dense, close-lying coat on the skull, combed back from the nose and, over the crown, smoothly
        # down into the neck (a sudden change of direction would part the coat)
        back_k = smooth((0.35 - x) / 0.11)
        length = 0.016 + 0.006 * back_k
        comb, lift, droop, tone = Vector((-1, 0, 0.12 - 0.72 * back_k)).normalized(), 0.42, 0.05 + 0.15 * back_k, 0.38
        if x > 0.405:
            length, comb, lift, tone = 0.011, Vector((-1, 0, -0.05)).normalized(), 0.4, 0.41
        if z < 0.81 and x < 0.42:
            # cheeks and throat: a little longer, falling down and back
            length, comb, droop, tone = 0.02, Vector((-0.55, 0, -0.85)).normalized(), 0.3, 0.44
        elif z < 0.81:
            length, comb, lift, tone = 0.01, Vector((-0.6, 0, -0.8)).normalized(), 0.3, 0.44
    elif bone == 'jaw':
        length, comb, lift, tone = 0.01, Vector((-1, 0, -0.4)).normalized(), 0.3, 0.46
    elif bone.startswith('ear'):
        length, comb, lift, droop, tone = 0.018, Vector((-0.15, 0, -1)).normalized(), 0.2, 0.4, 0.28
        # soft feathering along the back edge and the tip
        if x < 0.305 or z < 0.785:
            length, droop, tone = 0.032, 0.55, 0.46
    elif bone == 'neck':
        length, comb, lift, droop, tone = 0.04, Vector((-0.8, 0, -0.6)).normalized(), 0.4, 0.25, 0.45
        if nz < -0.2 or x > 0.24:
            length, droop, tone = 0.06, 0.55, 0.68
        if z > 0.8 and nz > -0.2:
            # back of the skull: short coat that lies back over the joint instead of parting there
            k = min(1.0, (z - 0.8) / 0.08)
            length, comb, lift, droop, tone = 0.04 - 0.018 * k, Vector((-1, 0, -0.6)).normalized(), 0.42, 0.2, 0.4
    elif bone == 'chest':
        length, tone = 0.034, 0.42
        if nz < -0.35 or x > 0.17:
            length, comb, lift, droop, tone = 0.08, Vector((0.15, 0, -1)).normalized(), 0.3, 0.75, 0.74
    elif bone == 'hips':
        length, tone = 0.034, 0.36
        if nz < -0.4:
            length, comb, droop, tone = 0.06, Vector((-0.3, 0, -1)).normalized(), 0.75, 0.68
    elif bone.startswith('tail'):
        length, comb, lift, droop, tone = 0.055, Vector((-0.4, 0, -1)).normalized(), 0.35, 0.7, 0.55
        if nz < 0.2:
            length, tone = 0.12, 0.78
    elif bone.startswith('fu'):
        length, comb, lift, tone = 0.024, Vector((-0.2, 0, -1)).normalized(), 0.35, 0.44
        if normal[0] < -0.25:
            length, lift, droop, tone = 0.065, 0.3, 0.7, 0.74
    elif bone.startswith('fl'):
        length, comb, lift, tone = 0.022, Vector((0, 0, -1)), 0.4, 0.46
        if normal[0] < -0.3:
            length, comb, lift, droop, tone = 0.055, Vector((-0.5, 0, -1)).normalized(), 0.3, 0.7, 0.74
    elif bone.startswith('hu'):
        length, comb, lift, tone = 0.03, Vector((-0.6, 0, -1)).normalized(), 0.38, 0.4
        if normal[0] < -0.35:
            length, lift, droop, tone = 0.07, 0.3, 0.7, 0.72
    elif bone.startswith('hl') or bone.startswith('hm'):
        length, comb, lift, tone = 0.022, Vector((0, 0, -1)), 0.4, 0.46
        if normal[0] < -0.4:
            length, lift, droop, tone = 0.045, 0.3, 0.6, 0.72
    elif bone.endswith(('p_n', 'p_f')):
        length, comb, lift, tone = 0.013, Vector((1, 0, -0.5)).normalized(), 0.3, 0.5
    # the collar presses the coat flat
    along_neck = (Vector(rest) - COLLAR[0]).dot(COLLAR[1])
    if bone in ('neck', 'head', 'chest') and abs(along_neck) < 0.03:
        length = min(length, 0.005)
    # keep the eyes and the nose leather clear
    if bone in ('head', 'jaw'):
        to_eye = min((Vector(rest) - eye).length for eye in EYES) if EYES else 1.0
        if to_eye < EYE_R * 1.45 or x > NOSE_X[0] - 0.018:
            length = 0.002
        elif to_eye < EYE_R * 2.2:
            length = min(length, 0.005)
    return length, comb, lift * 0.62, droop, tone


class Fur:
    def __init__(self, arm, body, count, seed=7):
        self.arm = arm
        self.rng = np.random.default_rng(seed)
        deform = [b for b in arm.data.bones if b.name not in ('root', 'tag') and not b.name.startswith('eye')]
        self.bones = [b.name for b in deform]
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        basis = body[0][0]
        self.basis = basis
        evaluated = basis.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        world = np.array(basis.matrix_world)
        verts = np.empty(len(mesh.vertices) * 3)
        mesh.vertices.foreach_get('co', verts)
        verts = verts.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
        mesh.calc_loop_triangles()
        tris = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
        mesh.loop_triangles.foreach_get('vertices', tris)
        tris = tris.reshape(-1, 3)
        evaluated.to_mesh_clear()
        a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
        cross = np.cross(b - a, c - a)
        area = np.linalg.norm(cross, axis=1) / 2
        normals = cross / np.maximum(np.linalg.norm(cross, axis=1, keepdims=True), 1e-12)
        pick = self.rng.choice(len(tris), size=count, p=area / area.sum())
        # the face coat is short, so it needs many more strands per area to look dense and golden
        centroid_bone = np.argmin(self._segment_distance((a + b + c) / 3), axis=1)
        on_head = np.isin(centroid_bone, [self.bones.index(name) for name in HEAD_BONES])
        head_area = area * on_head
        if head_area.sum() > 0:
            extra = int(count * HEAD_EXTRA)
            pick = np.concatenate([pick, self.rng.choice(len(tris), size=extra, p=head_area / head_area.sum())])
            count += extra
        r1, r2 = self.rng.random(count), self.rng.random(count)
        s = np.sqrt(r1)
        bary = np.stack([1 - s, s * (1 - r2), s * r2], axis=1)
        roots = bary[:, :1] * a[pick] + bary[:, 1:2] * b[pick] + bary[:, 2:3] * c[pick]
        nrm = normals[pick]
        self._bind(roots, nrm)

    def _segment_distance(self, points):
        heads = np.array([list(self.arm.data.bones[name].head_local) for name in self.bones])
        tails = np.array([list(self.arm.data.bones[name].tail_local) for name in self.bones])
        d = tails - heads
        rel = points[:, None, :] - heads[None, :, :]
        t = np.clip((rel * d[None]).sum(-1) / np.maximum((d * d).sum(-1), 1e-9)[None], 0, 1)
        closest = heads[None] + t[..., None] * d[None]
        dist = np.linalg.norm(points[:, None, :] - closest, axis=-1)
        # the ear bones run close to the skull: only the flap itself (outside the cheek, within its outline) is ear
        flap = (np.abs(points[:, 1]) > 0.087) & (points[:, 2] < 0.9) & (points[:, 0] > 0.29) & (points[:, 0] < 0.415)
        ears = np.array([name.startswith('ear') for name in self.bones])
        dist[~flap[:, None] & ears[None, :]] += 1.0
        # behind the head joint the neck segment is as close as the head's; the whole skull moves with the head
        skull = (((points - np.array([0.33, 0.0, 0.86])) / np.array([0.125, 0.12, 0.11])) ** 2).sum(axis=1) < 1.0
        neck = np.array([name == 'neck' for name in self.bones])
        dist[skull[:, None] & neck[None, :]] += 1.0
        # only the lower jaw itself opens with the mouth, not the muzzle, flews or throat above and beside it
        lower_jaw = (points[:, 2] < 0.795) & (np.abs(points[:, 1]) < 0.045) & (points[:, 0] > 0.4)
        jaw = np.array([name == 'jaw' for name in self.bones])
        dist[~lower_jaw[:, None] & jaw[None, :]] += 1.0
        return dist

    def _bind(self, roots, normals):
        dist = self._segment_distance(roots)
        order = np.argsort(dist, axis=1)
        nearest, second = order[:, 0], order[:, 1]
        d1 = dist[np.arange(len(roots)), nearest]
        d2 = dist[np.arange(len(roots)), second]
        w1 = (1 / np.maximum(d1, 1e-4) ** 3)
        w2 = (1 / np.maximum(d2, 1e-4) ** 3)
        # a strand is only shared between bones that are actually next to each other
        names = self.bones
        related = np.array([
            self.arm.data.bones[names[i]].parent is not None and self.arm.data.bones[names[i]].parent.name == names[j]
            or self.arm.data.bones[names[j]].parent is not None and self.arm.data.bones[names[j]].parent.name == names[i]
            for i, j in zip(nearest, second)
        ])
        w2 = np.where(related, w2, 0.0)
        total = w1 + w2
        self.idx = np.stack([nearest, second], axis=1)
        self.w = np.stack([w1 / total, w2 / total], axis=1)
        self.tail_mask = np.isin(nearest, [names.index(b) for b in TAIL_BONES])
        self.pts = None

        n = len(roots)
        lengths = np.empty(n)
        dirs = np.empty((n, 3))
        droop = np.empty(n)
        tone = np.empty(n)
        lift_min = np.empty(n)
        for i in range(n):
            length, comb, lift, dr, tn = region_rules(roots[i], normals[i], names[nearest[i]])
            nrm = Vector(normals[i])
            tangent = (comb - nrm * comb.dot(nrm))
            if tangent.length < 1e-4:
                tangent = comb
            direction = (tangent.normalized() * (1 - lift) + nrm * lift).normalized()
            dirs[i] = direction
            lift_min[i] = direction.dot(nrm) * 0.8
            lengths[i] = length * (0.75 + 0.5 * self.rng.random())
            droop[i] = dr
            tone[i] = tn
        self.lift_min = lift_min
        # short face hairs would vanish under the skin at the usual 2 mm inset
        self.inset = np.minimum(0.002, lengths * 0.12)[:, None]
        self.rest_roots = roots - normals * self.inset
        self.rest_dirs = dirs
        self.lengths = lengths
        self.droop = droop
        self.side_wave = self.rng.random(n) * math.tau
        # long coat falls in locks: strands in the same small cell pull toward their lock
        cells = np.floor(roots / 0.016).astype(np.int64)
        _, self.clump = np.unique(cells[:, 0] * 1_000_003 + cells[:, 1] * 1009 + cells[:, 2], return_inverse=True)
        self.clump = self.clump.ravel()
        self.clumps = int(self.clump.max()) + 1
        self.clump_factor = np.clip((lengths - 0.02) / 0.05, 0, 1) * 0.55
        clump_phase = self.rng.random(self.clumps) * math.tau
        self.wave_phase = clump_phase[self.clump]

        curves = bpy.data.hair_curves.new('HubertFur')
        self.points = 6
        curves.add_curves([self.points] * n)
        if 'radius' not in curves.attributes:
            curves.attributes.new('radius', 'FLOAT', 'POINT')
        taper = np.linspace(1.0, 0.15, self.points)
        base = np.where(lengths > 0.04, 0.0027, 0.0022)
        radii = (base[:, None] * taper[None, :]).ravel()
        curves.attributes['radius'].data.foreach_set('value', radii)
        tone_attr = curves.attributes.new('tone', 'FLOAT', 'CURVE')
        tone_attr.data.foreach_set('value', np.clip(tone + self.rng.normal(0, 0.06, n), 0, 1))
        self.curves = curves
        self.obj = link(bpy.data.objects.new('HubertFur', curves))
        curves.materials.append(fur_material())

    def _seat(self, root, direction):
        """Skinned roots drift into or off the re-fused metaball skin at bent joints; move each root along the
        nearest surface normal back onto the skin and make sure the strand still leans outward."""
        from mathutils.kdtree import KDTree
        dg = bpy.context.evaluated_depsgraph_get()
        evaluated = self.basis.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        world = np.array(self.basis.matrix_world)
        count = len(mesh.vertices)
        verts = np.empty(count * 3)
        mesh.vertices.foreach_get('co', verts)
        verts = verts.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
        normals = np.empty(count * 3)
        mesh.vertex_normals.foreach_get('vector', normals)
        normals = normals.reshape(-1, 3) @ world[:3, :3].T
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
        evaluated.to_mesh_clear()
        tree = KDTree(count)
        for i, co in enumerate(verts):
            tree.insert(co, i)
        tree.balance()
        nearest = np.fromiter((tree.find(co)[1] for co in root), dtype=np.int64, count=len(root))
        n = normals[nearest]
        depth = ((verts[nearest] - root) * n).sum(axis=1, keepdims=True)
        seated = root + n * (depth - self.inset)
        lean = (direction * n).sum(axis=1, keepdims=True)
        need = self.lift_min[:, None] - lean
        direction = np.where(need > 0, direction + n * need, direction)
        direction /= np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-9)
        return seated, direction

    def update(self, breeze=0.0):
        bpy.context.view_layer.update()
        arm_world = np.array(self.arm.matrix_world)
        mats = []
        for name in self.bones:
            pb = self.arm.pose.bones[name]
            rest = np.array(pb.bone.matrix_local)
            pose = np.array(pb.matrix)
            mats.append(arm_world @ pose @ np.linalg.inv(rest))
        mats = np.array(mats)
        m1, m2 = mats[self.idx[:, 0]], mats[self.idx[:, 1]]
        w1, w2 = self.w[:, :1], self.w[:, 1:]
        roots_h = np.concatenate([self.rest_roots, np.ones((len(self.rest_roots), 1))], axis=1)
        root = w1 * np.einsum('nij,nj->ni', m1, roots_h)[:, :3] + w2 * np.einsum('nij,nj->ni', m2, roots_h)[:, :3]
        direction = w1 * np.einsum('nij,nj->ni', m1[:, :3, :3], self.rest_dirs) + w2 * np.einsum('nij,nj->ni', m2[:, :3, :3], self.rest_dirs)
        direction /= np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-9)
        root, direction = self._seat(root, direction)
        s = np.linspace(0, 1, self.points)
        length = self.lengths[:, None, None]
        pts = root[:, None, :] + direction[:, None, :] * length * s[None, :, None]
        gravity = np.array([0, 0, -1.0])
        pts += gravity[None, None, :] * (length * self.droop[:, None, None]) * (s[None, :, None] ** 2) * 0.9
        # soft waves across the strand, shared by a lock
        side = np.cross(direction, gravity)
        side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
        wave = np.sin(self.wave_phase[:, None] + s[None, :] * 3.4 * math.pi) * s[None, :]
        pts += side[:, None, :] * (wave * self.lengths[:, None] * 0.09 * (self.clump_factor[:, None] > 0))[:, :, None]
        # pull toward the lock centre, more toward the tip
        centre = np.zeros((self.clumps, self.points, 3))
        long = self.clump_factor > 0
        counts = np.bincount(self.clump[long], minlength=self.clumps).astype(float)
        np.add.at(centre, self.clump[long], pts[long])
        centre /= np.maximum(counts, 1)[:, None, None]
        pull = (self.clump_factor[:, None] * s[None, :] ** 1.5)[:, :, None]
        pts = pts + (centre[self.clump] - pts) * pull
        # the root must stay on the skin
        pts[:, 0, :] = root
        if breeze:
            pts[:, :, 0] += (np.sin(self.side_wave + breeze)[:, None] * 0.12 * length[:, :, 0]) * s[None, :] ** 2
        self.pts = pts
        self.curves.attributes['position'].data.foreach_set('vector', pts.ravel())
        self.curves.update_tag()

# ----------------------------------------------------------------------------- poses

def deg(value):
    return math.radians(value)


BASE = {}


LEG_STRETCH = 1.12   # a retriever stands taller than the first model; the whole leg chain follows the top bone
HEAD_SCALE = 1.15
LEG_LIFT = 0.055
BODY_PIVOT = 0.3     # height of the line the whole body rolls round when he lies on his side (model mode)


def set_pose(arm, spec):
    """spec: bone -> bend (deg, CCW in camera view) or (bend, twist, yaw); special keys root, eyes, jaw."""
    model = bool(arm.get('hubert_model'))
    corr = MODEL['corr'] if model else {}
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, -deg(corr.get(pb.name, 0.0)))
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    if not model:
        for name in ('fu_n', 'fu_f', 'hu_n', 'hu_f'):
            arm.pose.bones[name].scale = (1, LEG_STRETCH, 1)
        arm.pose.bones['head'].scale = (HEAD_SCALE, HEAD_SCALE, HEAD_SCALE)
    # 'body' last: its pivot correction adds to the root's shift
    for bone, value in sorted(spec.items(), key=lambda item: item[0] == 'body'):
        if bone.startswith('_'):
            continue
        if bone == 'root':
            # the model's height comes from ground_fix (matched to the original rig's paws), only the shift is kept
            dx, dz = value[0], 0.0 if model else value[1] + spec.get('lift', LEG_LIFT)
            dy = value[2] if len(value) > 2 else 0.0
            # the root bone points +X with its Z axis on world +Y, so local X is world up and local Y is world forward
            arm.pose.bones['root'].location = (dz, dx, dy)
            continue
        if bone == 'body':
            # the whole dog rolled about his length round the middle of his body (lying on his side);
            # positive rolls his back towards the camera
            roll = deg(value)
            pb = arm.pose.bones['root']
            pb.rotation_euler = (0, roll, 0)
            up, fwd, side = pb.location
            pb.location = (up + BODY_PIVOT * (1 - math.cos(roll)), fwd, side + BODY_PIVOT * math.sin(roll))
            continue
        if bone == 'lift':
            continue
        if bone == 'eyes':
            for side in ('n', 'f'):
                arm.pose.bones[f'eye_{side}'].scale = (max(0.08, value), 1, 1)
            continue
        pb = arm.pose.bones[bone]
        extra = corr.get(bone, 0.0)
        if isinstance(value, (int, float)):
            pb.rotation_euler = (0, 0, -deg(value + extra))
        else:
            bend, roll, yaw = (list(value) + [0, 0])[:3]
            pb.rotation_euler = (deg(yaw), deg(roll), -deg(bend + extra))


def blend(*specs):
    out = {}
    for spec in specs:
        for key, value in spec.items():
            out[key] = value
    return out


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def pulse(p, at, width):
    """An eased bump of 0..1 round `at` on the loop (wraps at 1), so blinks and twitches never pop."""
    d = abs(p - at) % 1.0
    return smooth(1 - min(d, 1 - d) / width)


def standing():
    return model_tweak({'root': (0, 0), 'tail1': -12, 'tail2': -4, 'tail3': 4}, 'stand')


def legs_walk(p, amp_f=22, amp_h=18, lift_f=45, lift_h=34, trot=False):
    spec = {}
    phases = {'fu_n': 0.25, 'fu_f': 0.75, 'hu_n': 0.0, 'hu_f': 0.5} if not trot else {'fu_n': 0.0, 'hu_f': 0.0, 'fu_f': 0.5, 'hu_n': 0.5}
    for leg, phase in phases.items():
        side = leg[-1]
        u = 2 * math.pi * (p + phase)
        lift = max(0.0, math.cos(u)) ** 1.4
        if leg.startswith('fu'):
            spec[f'fu_{side}'] = amp_f * math.sin(u)
            spec[f'fl_{side}'] = -lift_f * lift
            spec[f'fp_{side}'] = -0.6 * amp_f * math.sin(u) - 25 * lift
        else:
            spec[f'hu_{side}'] = amp_h * math.sin(u) + 4
            spec[f'hl_{side}'] = -lift_h * lift
            spec[f'hm_{side}'] = lift_h * 1.3 * lift
            spec[f'hp_{side}'] = -amp_h * 0.5 * math.sin(u)
    return spec


def pose_walk(p, carrying=False):
    u = 2 * math.pi * p
    spec = blend(standing(), legs_walk(p))
    spec['root'] = (0, 0.008 * math.cos(2 * u))
    spec['chest'] = 1.5 * math.sin(2 * u)
    spec['neck'] = 2 * math.sin(2 * u + 0.8)
    spec['head'] = -2 * math.sin(2 * u + 0.8)
    spec['tail1'] = (-12, 0, 16 * math.sin(2 * u))
    spec['tail2'] = (-4, 0, 10 * math.sin(2 * u - 0.6))
    spec['tail3'] = (4, 0, 8 * math.sin(2 * u - 1.2))
    spec['ear_n'] = 4 * math.sin(2 * u + 1.4)
    spec['ear_f'] = 4 * math.sin(2 * u + 1.6)
    spec['tag'] = 10 * math.sin(2 * u + 1.0)
    if carrying:
        spec['jaw'] = -9
        spec['head'] = spec['head'] + 4
    return spec


def pose_run(p):
    u = 2 * math.pi * p
    spec = blend(standing(), legs_walk(p, amp_f=34, amp_h=30, lift_f=70, lift_h=50, trot=True))
    spec['root'] = (0, 0.022 * math.cos(2 * u) + 0.012)
    spec['hips'] = 2 * math.sin(2 * u)
    spec['chest'] = -2 * math.sin(2 * u)
    spec['neck'] = -6 + 3 * math.sin(2 * u + 0.6)
    spec['head'] = 4 - 3 * math.sin(2 * u + 0.6)
    spec['jaw'] = -12
    spec['tail1'] = (-22, 0, 22 * math.sin(2 * u))
    spec['tail2'] = (-2, 0, 14 * math.sin(2 * u - 0.7))
    spec['tail3'] = (6, 0, 10 * math.sin(2 * u - 1.3))
    spec['ear_n'] = 10 * math.sin(2 * u + 1.2) - 8
    spec['ear_f'] = 10 * math.sin(2 * u + 1.4) - 8
    spec['tag'] = 18 * math.sin(2 * u + 1.0)
    return spec


def pose_sit_base():
    return model_tweak({
        'root': (-0.03, -0.277),
        'lift': 0.03,
        'hips': 40,
        'chest': 4,
        'fu_n': -35, 'fu_f': -35, 'fl_n': -16, 'fl_f': -16, 'fp_n': 40, 'fp_f': 40,
        'hu_n': -7, 'hu_f': -9, 'hl_n': -76, 'hl_f': -74, 'hm_n': 121, 'hm_f': 119, 'hp_n': -59, 'hp_f': -59,
        'neck': -29, 'head': -22,
        'tail1': -34, 'tail2': 8, 'tail3': -5, 'tail4': -75,
        'tag': -30,
    }, 'sit')


def pose_sit(p):
    u = 2 * math.pi * p
    spec = pose_sit_base()
    spec['chest'] = 4 + 0.8 * math.sin(u)
    spec['head'] = (-22 + 1.5 * math.sin(u), 0, 0)
    spec['eyes'] = 1.0 - 0.88 * pulse(p, 0.6, 0.09)
    spec['tail4'] = (-75, 0, 6 * math.sin(u))
    return spec


def pose_beg(p):
    u = 2 * math.pi * p
    spec = pose_sit_base()
    spec['neck'] = -24
    spec['head'] = (-24, 9 + 2 * math.sin(u), 0)
    spec['jaw'] = -10 - 3 * math.sin(2 * u)
    spec['tail1'] = (-34, 0, 30 * math.sin(u))
    spec['tail2'] = (8, 0, 22 * math.sin(u - 0.7))
    spec['tail3'] = (-5, 0, 16 * math.sin(u - 1.4))
    spec['tail4'] = (-60, 0, 10 * math.sin(u - 2.0))
    spec['ear_n'] = -6
    spec['ear_f'] = -6
    spec['root'] = (-0.03, -0.277 + 0.004 * math.sin(2 * u))
    return spec


def pose_sniff(p):
    u = 2 * math.pi * p
    spec = blend(standing(), {'hu_n': 8, 'hu_f': 6, 'fu_n': 14, 'fu_f': 18, 'fl_n': -30, 'fl_f': -26, 'fp_n': 18, 'fp_f': 14})
    spec['chest'] = -10
    spec['root'] = (0, -0.06)
    spec['neck'] = -71 + 4 * math.sin(u)
    spec['head'] = (4 + 3 * math.sin(2 * u), 0, 12 * math.sin(u))
    spec['jaw'] = -2 * abs(math.sin(4 * u))
    spec['tail1'] = (16, 0, 12 * math.sin(2 * u))
    spec['tail2'] = (-2, 0, 8 * math.sin(2 * u - 0.6))
    spec['ear_n'] = 8
    spec['ear_f'] = 8
    spec['tag'] = 40
    return spec


def pose_eat(p):
    """Sitting, he watches the treat come, catches it, chews and squints happily (one shot, eased throughout)."""
    u = 2 * math.pi * p
    spec = pose_sit_base()
    reach = smooth(p / 0.3)
    caught = smooth((p - 0.3) / 0.06)
    settle = smooth((p - 0.4) / 0.12)
    up = reach * (1 - settle)
    # four chomps that end with the mouth closed
    chew = abs(math.sin((p - 0.4) / 0.6 * 4 * math.pi)) * settle if p > 0.4 else 0.0
    spec['neck'] = -29 + 6 * up
    spec['head'] = (-22 + 14 * up + 4 * settle + 3 * chew, 6 * up, 0)
    spec['jaw'] = -16 * reach * (1 - caught) - 2 * caught * (1 - settle) - 8 * chew
    spec['eyes'] = 1.0 - 0.55 * smooth((p - 0.6) / 0.05) * (1 - smooth((p - 0.8) / 0.05))
    spec['tail1'] = (-34, 0, 22 * math.sin(u * 3))
    spec['tail2'] = (8, 0, 14 * math.sin(u * 3 - 0.7))
    return spec


# The model lying in his basket: chest down between the forearms, which lie flat on the cushion, and the hips rolled
# onto his far side with the hind legs folded beside him (a straight sphinx stands the long-legged model on its knees).
MODEL_LIE = {
    'root': (0.05, -0.325),
    'lift': 0.0,
    'hips': (-2, 55, 0), 'chest': (0, -40, 0),
    'fu_n': -46, 'fu_f': -46, 'fl_n': 128.6, 'fl_f': 128.6, 'fp_n': -38.7, 'fp_f': -38.7,
    'hu_n': 57.9, 'hu_f': 57.9, 'hl_n': -101.6, 'hl_f': -101.6, 'hm_n': 116.5, 'hm_f': 116.5, 'hp_n': -53.5, 'hp_f': -53.5,
    'neck': 0, 'head': -8,
    'tail1': (30, 0, 60), 'tail2': (10, 0, 50), 'tail3': (0, 0, 40), 'tail4': (0, 0, 30),
    'tag': -40,
}


def add_bend(spec, bone, delta):
    bend, roll, yaw = _vec(bone, spec.get(bone))
    spec[bone] = (bend + delta, roll, yaw)


def pose_lie_base():
    if MODEL['on']:
        return dict(MODEL_LIE)
    return model_tweak({
        'root': (0.05, -0.325),
        'lift': 0.0,
        'hips': -2,
        'fu_n': 8, 'fu_f': 10, 'fl_n': 64, 'fl_f': 60, 'fp_n': -22, 'fp_f': -20,
        'hu_n': 50, 'hu_f': 48, 'hl_n': -82, 'hl_f': -80, 'hm_n': 102, 'hm_f': 100, 'hp_n': -49, 'hp_f': -49,
        'neck': 0, 'head': -14,
        # curled forward round his near hind leg, lying on the cushion inside the wicker (--mode tailcheck)
        'tail1': (48.5, 0, -28.5), 'tail2': (25.5, 0, -31.0), 'tail3': (14.5, 0, -3.5), 'tail4': (8.5, 0, 2.5),
        'tag': -40,
    }, 'lie')


def pose_rest(p):
    u = 2 * math.pi * p
    spec = pose_lie_base()
    spec['ear_n'] = -10 * pulse(p, 0.25, 0.1)
    spec['eyes'] = 1.0 - 0.9 * pulse(p, 0.75, 0.08)
    if MODEL['on']:
        add_bend(spec, 'chest', 1.2 * math.sin(u))
        spec['head'] = (-8 + 1.5 * math.sin(u), 0, 0)
        # a lazy flick of the tip along the cushion
        spec['tail3'] = (0, 0, 40 + 5 * math.sin(u))
        spec['tail4'] = (0, 0, 30 + 8 * math.sin(u - 0.5) + 8 * math.sin(0.5))
        return spec
    spec['chest'] = 1.2 * math.sin(u)
    spec['head'] = (-8 + 1.5 * math.sin(u), 0, 0)
    # a lazy flick of the tip on the cushion; the loop starts from the plain curl
    spec['tail3'] = (14.5, 0, -3.5 + 5 * math.sin(u))
    spec['tail4'] = (8.5, 0, 2.5 + 8 * math.sin(u - 0.5) + 8 * math.sin(0.5))
    return spec


def pose_sleep(p):
    u = 2 * math.pi * p
    spec = pose_lie_base()
    if MODEL['on']:
        # chin on his forearms, breathing slowly
        add_bend(spec, 'chest', 2.0 * math.sin(u))
        spec['neck'] = -47
        spec['head'] = 23 - 1.0 * math.sin(u)
        spec['eyes'] = 0.08
        spec['ear_n'] = 6
        spec['tail3'] = (0, 0, 44)
        spec['tail4'] = (0, 0, 36)
        return spec
    spec['root'] = (0.05, -0.335)
    spec['chest'] = (2.0 * math.sin(u), 0, -8)
    spec['neck'] = (-50, 0, -10)
    spec['head'] = (-10, -6, -10)
    spec['eyes'] = 0.08
    spec['ear_n'] = 6
    spec['tail3'] = (14.5, 0, -10)
    spec['tail4'] = (8.5, 0, -6)
    return spec


def pose_chew(p):
    u = 2 * math.pi * p
    spec = pose_lie_base()
    if MODEL['on']:
        # head down to the bone between his forearms, gnawing it from the side
        spec['neck'] = -30
        spec['head'] = (10 + 3 * math.sin(2 * u), 16 + 6 * math.sin(u), 0)
        spec['jaw'] = -6 - 8 * abs(math.sin(3 * u))
        spec['eyes'] = 0.55
        spec['tail3'] = (0, 0, 40 + 6 * math.sin(u))
        spec['tail4'] = (0, 0, 30 + 10 * math.sin(u - 0.6) + 10 * math.sin(0.6))
        return spec
    # the forearms reach 6 degrees further round the bone than when resting
    spec['fl_n'] = _vec('fl_n', spec['fl_n'])[0] + 6
    spec['fl_f'] = _vec('fl_f', spec['fl_f'])[0] + 6
    spec['neck'] = -16
    spec['head'] = (-22 + 3 * math.sin(2 * u), 18 + 6 * math.sin(u), 0)
    spec['jaw'] = -6 - 8 * abs(math.sin(3 * u))
    spec['eyes'] = 0.55
    spec['tail3'] = (14.5, 0, -3.5 + 6 * math.sin(u))
    spec['tail4'] = (8.5, 0, 2.5 + 10 * math.sin(u - 0.6) + 10 * math.sin(0.6))
    return spec


GROUPS = {
    'hind': ('root', 'lift', 'hips', 'hu_n', 'hu_f', 'hl_n', 'hl_f', 'hm_n', 'hm_f', 'hp_n', 'hp_f', 'tail1', 'tail2', 'tail3', 'tail4'),
    'front': ('chest', 'fu_n', 'fu_f', 'fl_n', 'fl_f', 'fp_n', 'fp_f'),
    'head': ('neck', 'head', 'jaw', 'ear_n', 'ear_f', 'eyes', 'tag'),
}
SCALARS = ('lift', 'eyes')


def _vec(key, value):
    if value is None:
        value = {'root': (0.0, 0.0), 'lift': LEG_LIFT, 'eyes': 1.0}.get(key, 0.0)
    if key in SCALARS:
        return [float(value)]
    if key == 'root':
        return [float(v) for v in value]
    if isinstance(value, (int, float)):
        return [float(value), 0.0, 0.0]
    return [float(v) for v in value] + [0.0] * (3 - len(value))


def tween(a, b, t, windows=None, ground=True):
    """Pose a -> b at t (0..1), each bone group eased over its own window of t, so a dog sits down hind end first.
    With ground, the paws are kept on the floor in between (see ground_fix)."""
    windows = windows or {}
    weights = {group: smooth((t - lo) / max(1e-6, hi - lo)) for group, (lo, hi) in ((g, windows.get(g, (0.0, 1.0))) for g in GROUPS)}
    out = {}
    for key in set(a) | set(b):
        if key.startswith('_'):
            continue
        group = next((g for g, keys in GROUPS.items() if key in keys), 'front')
        w = weights[group]
        value = [x + (y - x) * w for x, y in zip(_vec(key, a.get(key)), _vec(key, b.get(key)))]
        out[key] = value[0] if key in SCALARS else tuple(value)
    if ground:
        out['_ground'] = (a, b, weights['hind'])
    return out


FLOOR_BONES = ('fp_n', 'fp_f', 'hp_n', 'hp_f', 'hm_n', 'hm_f')


def lowest_point(arm):
    bpy.context.view_layer.update()
    return min(min(arm.pose.bones[n].head.z, arm.pose.bones[n].tail.z) for n in FLOOR_BONES)


def ground_fix(arm, spec):
    """Poses the rig with spec; returns how far to raise it so its lowest paw is where the two end poses put it.
    The model is raised so its soles are where the original rig's are in the same pose."""
    if arm.get('hubert_model'):
        # the model rests on its lowest point: paws when standing or walking, rump and paws when sitting, belly when lying
        set_pose(arm, spec)
        return -model_lowest(arm)
    target = spec.get('_ground')
    if target is None:
        set_pose(arm, spec)
        return 0.0
    a, b, w = target
    set_pose(arm, a)
    za = lowest_point(arm)
    set_pose(arm, b)
    zb = lowest_point(arm)
    set_pose(arm, spec)
    return za + (zb - za) * w - lowest_point(arm)


def pose_stand(p):
    """Standing at ease: breathing, a slow wag, a glance round. Frame 0 is exactly standing()."""
    u = 2 * math.pi * p
    spec = standing()
    spec['chest'] = 0.8 * math.sin(u)
    spec['neck'] = 1.5 * math.sin(u)
    spec['head'] = (-1.5 * math.sin(u), 0, 5 * math.sin(u))
    bend = {bone: _vec(bone, spec.get(bone))[0] for bone in ('tail1', 'tail2', 'tail3')}
    spec['tail1'] = (bend['tail1'], 0, 12 * math.sin(2 * u))
    spec['tail2'] = (bend['tail2'], 0, 8 * math.sin(2 * u - 0.6))
    spec['tail3'] = (bend['tail3'], 0, 6 * math.sin(2 * u - 1.2))
    spec['ear_n'] = 3 * math.sin(u)
    spec['ear_f'] = 3 * math.sin(u)
    spec['eyes'] = 1.0 - 0.88 * pulse(p, 0.55, 0.06)
    return spec


def pose_stand_bone(p=0.0):
    spec = standing()
    spec['jaw'] = -9
    spec['head'] = 4
    return spec


def pose_start(p):
    """Stand -> walk frame 0: the weight shifts and the first paw lifts as the stride grows."""
    return tween(standing(), pose_walk(((p - 1.0) * 0.3) % 1.0), p, ground=False)


def pose_sit_down(p):
    return tween(standing(), pose_sit(0.0), p, {'hind': (0.0, 0.78), 'front': (0.3, 1.0), 'head': (0.15, 0.95)})


def pose_beg_up(p):
    return tween(pose_sit(0.0), pose_beg(0.0), p, ground=False)


def pose_sniff_down(p):
    return tween(standing(), pose_sniff(0.0), p, {'head': (0.0, 0.9), 'front': (0.1, 1.0), 'hind': (0.2, 1.0)})


def tail_blend(a, b, w_bend, w_yaw, tuck=25.0):
    """Tail a -> b with the up/down bend and the sideways curl on their own weights, and tucked in further while it
    drops or lifts, so it never hangs over the wicker on its way between standing and the curl on the cushion."""
    out = {}
    bump = 4 * w_bend * (1 - w_bend)
    for bone in TAIL_BONES:
        ba, ra, ya = _vec(bone, a.get(bone))
        bb, rb, yb = _vec(bone, b.get(bone))
        extra = tuck * bump * (0.5 if bone == 'tail1' else 1.0)
        out[bone] = (ba + (bb - ba) * w_bend, ra + (rb - ra) * w_bend, ya + (yb - ya) * w_yaw - extra)
    return out


def pose_doze(p):
    return tween(pose_rest(0.0), pose_sleep(0.0), p, {'head': (0.15, 1.0), 'hind': (0.0, 0.8)}, ground=False)


def pose_get_up(p):
    """Lying in the basket -> standing in it: front end first, then the hind end, then he steps off the cushion."""
    if MODEL['on']:
        # the model pushes up onto his front legs into a sit, then rises behind
        sit = pose_sit(0.0)
        if p < 0.5:
            spec = tween(pose_rest(0.0), sit, p / 0.5, {'front': (0.0, 0.7), 'head': (0.0, 0.6), 'hind': (0.3, 1.0)})
        else:
            spec = tween(sit, standing(), (p - 0.5) / 0.5, {'hind': (0.0, 0.8), 'front': (0.1, 1.0), 'head': (0.0, 0.8)})
    else:
        spec = tween(pose_rest(0.0), standing(), p, {'front': (0.0, 0.6), 'head': (0.0, 0.55), 'hind': (0.3, 0.9)})
    spec.update(tail_blend(pose_rest(0.0), standing(), smooth((p - 0.3) / 0.3), smooth((p - 0.6) / 0.4)))
    spec['_inbasket'] = 1.0 - smooth((p - 0.55) / 0.45)
    return spec


CIRCLE_END = 0.6
CIRCLE_CURL = 22.0


def pose_lie_down(p, carrying=False):
    """Standing in the basket: he steps onto the cushion, turns once round on the spot (towards the viewer first),
    then settles, hind end first. With the bone he keeps it in his mouth and puts it between his paws."""
    still = pose_stand_bone() if carrying else standing()
    env = math.sin(math.pi * min(1.0, p / CIRCLE_END)) ** 0.6 if p < CIRCLE_END else 0.0
    stepping = pose_walk((p * 4.5) % 1.0, carrying)
    # the long-legged model takes small steps, so his paws stay inside the wicker while he turns
    spec = tween(still, stepping, env * (0.35 if MODEL['on'] else 0.7), ground=False) if env > 0 else dict(still)
    spec['neck'] = _vec('neck', spec.get('neck'))[0] - 14 * env
    # he curls round towards the way he turns, nose following his tail
    curl = -CIRCLE_CURL * env
    for bone, share in (('chest', 0.6), ('neck', 1.0), ('head', 0.7), ('hips', -0.5), ('tail1', -1.2), ('tail2', -1.0)):
        bend, roll, yaw = _vec(bone, spec.get(bone))
        spec[bone] = (bend, roll, yaw + curl * share)
    if p > CIRCLE_END:
        target = pose_chew(0.0) if carrying else pose_rest(0.0)
        t = (p - CIRCLE_END) / (1 - CIRCLE_END)
        if MODEL['on']:
            # the model sits down first, then walks his front paws forward and rolls onto his hip
            sit = pose_sit(0.0)
            if carrying:
                sit.update({'jaw': -9, 'head': (_vec('head', sit['head'])[0] + 4, 0, 0)})
            if t < 0.5:
                spec = tween(still, sit, t / 0.5, {'hind': (0.0, 0.8), 'front': (0.25, 1.0), 'head': (0.2, 1.0)})
            else:
                spec = tween(sit, target, (t - 0.5) / 0.5, {'front': (0.0, 0.75), 'hind': (0.15, 1.0), 'head': (0.3, 1.0)})
        else:
            spec = tween(still, target, t, {'hind': (0.0, 0.62), 'front': (0.3, 1.0), 'head': (0.35, 1.0)})
        spec.update(tail_blend(still, target, smooth((t - 0.25) / 0.45), smooth(t / 0.3)))
    spec['_yaw'] = DOG_TURN - 360.0 * smooth((p - 0.05) / (CIRCLE_END - 0.08))
    spec['_inbasket'] = smooth(p / 0.14)
    if MODEL['on']:
        spec['_back'] = 0.14 * env
    if carrying:
        spec['_bone'] = smooth((p - 0.86) / 0.14)
    return spec


POSES = {
    'walk': pose_walk,
    'run': pose_run,
    'sit': pose_sit,
    'beg': pose_beg,
    'sniff': pose_sniff,
    'eat': pose_eat,
    'carry': lambda p: pose_walk(p, carrying=True),
    'rest': pose_rest,
    'sleep': pose_sleep,
    'chew': pose_chew,
    'basket': pose_rest,
    'stand': pose_stand,
    'start': pose_start,
    'stand-bone': pose_stand_bone,
    'sit-down': pose_sit_down,
    'beg-up': pose_beg_up,
    'sniff-down': pose_sniff_down,
    'lie-down': pose_lie_down,
    'lie-down-bone': lambda p: pose_lie_down(p, carrying=True),
    'get-up': pose_get_up,
    'doze': pose_doze,
}

# ----------------------------------------------------------------------------- scene

def setup_scene(samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 8
    try:
        scene.cycles_curves.shape = 'RIBBONS'
    except Exception:
        pass
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = FRAME_W, FRAME_H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.0

    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb('#b9c6d6')
    bg.inputs['Strength'].default_value = 0.55
    scene.world = world

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ORTHO
    cam_data.sensor_fit = 'HORIZONTAL'
    cam = link(bpy.data.objects.new('Camera', cam_data))
    scene.camera = cam
    frame_camera(scene, 'e')

    def light(name, kind, energy, color, rotation, location=(0, 0, 0), size=None):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color[:3]
        if size is not None:
            if kind == 'AREA':
                data.size = size
            elif kind == 'SUN':
                data.angle = size
        obj = link(bpy.data.objects.new(name, data))
        obj.rotation_euler = [math.radians(a) for a in rotation]
        obj.location = location
        return obj

    light('Key', 'SUN', 3.2, srgb('#ffe2bd'), (36, 0, -40), size=math.radians(10))
    light('Rim', 'AREA', 260, srgb('#ffd29a'), (65, 0, 140), location=(-1.4, 1.6, 1.6), size=1.6)
    light('Fill', 'AREA', 120, srgb('#cfe0ff'), (70, 0, -20), location=(1.2, -2.2, 1.2), size=2.0)

    catcher = mesh_object('Ground', lambda bm: __import__('bmesh').ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0))
    catcher.is_shadow_catcher = True
    return scene


def frame_camera(scene, key):
    """Frames FRAMES[key]: same metres per pixel everywhere, the world origin on that frame's ground point."""
    width, height, gx, gy = FRAMES[key]
    scene.render.resolution_x, scene.render.resolution_y = width, height
    cam = scene.camera
    meters_per_px = ORTHO / FRAME_W
    cam.data.ortho_scale = width * meters_per_px
    elev = math.radians(CAM_ELEVATION)
    right = (width / 2 - gx) * meters_per_px
    up = (height / 2 - (height - gy)) * meters_per_px
    target = Vector((right, 0, 0)) + Vector((0, math.sin(elev), math.cos(elev))) * up
    cam.location = target + Vector((0, -math.cos(elev), math.sin(elev))) * 6.0
    cam.rotation_euler = (math.pi / 2 - elev, 0, 0)


def project(scene, cam, point):
    from bpy_extras.object_utils import world_to_camera_view
    co = world_to_camera_view(scene, cam, Vector(point))
    w, h = scene.render.resolution_x, scene.render.resolution_y
    return round(co.x * w, 1), round((1 - co.y) * h, 1)

# ----------------------------------------------------------------------------- build all

def build(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_scene(args['samples'])
    if args.get('model'):
        arm, _, details = build_model(args['model'])
        treat = build_treat()
        bone_prop = build_meat_bone()
        basket = build_basket()
        arm.rotation_euler = (0, 0, math.radians(DOG_TURN))
        bpy.context.view_layer.update()
        return scene, arm, details, treat, bone_prop, basket, NoFur()
    arm = build_armature()
    skin = coat_skin_material()
    body = build_body(arm, skin)
    head_ref = link(bpy.data.objects.new('HeadSkinRef', None))
    head_ref.location = (0.45, 0, 0.84)
    parent_to_bone(head_ref, arm, 'head')
    tint_head_skin(skin, head_ref)
    details = build_details(arm, body[0][0])
    treat = build_treat()
    bone_prop = build_meat_bone()
    basket = build_basket()
    fur = Fur(arm, body, args['strands'])
    arm.rotation_euler = (0, 0, math.radians(DOG_TURN))
    bpy.context.view_layer.update()
    return scene, arm, details, treat, bone_prop, basket, fur


def show(obj, visible):
    for item in [obj, *obj.children_recursive]:
        item.hide_render = not visible
        item.hide_viewport = not visible


def place_dog(arm, yaw, in_basket=0.0, lift=0.0, back=0.0):
    """Turns him to `yaw` round PIVOT (which stays where the side view has it) and steps him into the basket."""
    arm.rotation_euler = (0, 0, math.radians(yaw))
    pivot = Vector(PIVOT)
    keep = Matrix.Rotation(math.radians(DOG_TURN), 3, 'Z') @ pivot
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ pivot
    arm.location = Vector(BASKET_OFFSET) * in_basket + keep - turn + Vector((0, back, lift))


def mouth_offset(arm, original):
    """Distance along the jaw bone to the mouth: the original rig's value, or the same share of the model's shorter jaw."""
    if not arm.get('hubert_model'):
        return original
    return arm.pose.bones['jaw'].bone.length * {0.075: 0.45, 0.05: 0.3, 0.11: 0.85}[original]


def bone_in_mouth(arm):
    jaw = arm.matrix_world @ arm.pose.bones['jaw'].matrix
    at = jaw @ Matrix.Translation((0, mouth_offset(arm, 0.075), 0.0))
    yaw = math.degrees(arm.rotation_euler.z)
    # crosswise in the mouth, the meaty end on his near side
    return Matrix.Translation(at.to_translation() + Vector((0, 0, -0.008))) @ Matrix.Rotation(math.radians(yaw - 88), 4, 'Z') @ Matrix.Rotation(math.radians(10), 4, 'X')


def bone_between_paws(arm):
    yaw = math.degrees(arm.rotation_euler.z)
    if arm.get('hubert_model'):
        # on the cushion between his wrists, the meaty end towards him
        wrists = [arm.matrix_world @ arm.pose.bones[f'fl_{side}'].tail for side in ('n', 'f')]
        forward = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Vector((1, 0, 0))
        # held up between his front paws, above the rim where he can be seen gnawing it
        at = (wrists[0] + wrists[1]) / 2 + forward * 0.05 + Vector((0, -0.03, 0.13))
        return Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw - 110), 4, 'Z') @ Matrix.Rotation(math.radians(65), 4, 'Y')
    jaw = arm.matrix_world @ arm.pose.bones['jaw'].matrix
    at = (jaw @ Matrix.Translation((0, mouth_offset(arm, 0.05), 0))).to_translation() + Vector((0.0, -0.05, -0.06))
    return Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw - 110), 4, 'Z') @ Matrix.Rotation(math.radians(35), 4, 'Y')


def place_props(name, p, arm, details, treat, bone_prop, basket, spec=None):
    spec = spec or {}
    in_basket = name in IN_BASKET
    show(basket, in_basket)
    basket.location = (0.02, 0.08, 0) if in_basket else (0, 0, 0)
    dog_visible = name != 'basket'
    for obj in bpy.data.objects:
        if obj.parent == arm or obj.name == 'HubertFur':
            obj.hide_render = not dog_visible
    # the treat is tossed to him and caught
    show(treat, name == 'eat' and p < 0.31)
    if name == 'eat':
        bpy.context.view_layer.update()
        jaw = arm.matrix_world @ arm.pose.bones['jaw'].matrix
        mouth = (jaw @ Matrix.Translation((0, mouth_offset(arm, 0.11), 0))).to_translation()
        start = mouth + Vector((0.32, -0.2, 0.32))
        k = min(1.0, p / 0.3)
        at = start.lerp(mouth, k) + Vector((0, 0, 0.12 * math.sin(k * math.pi)))
        treat.matrix_world = Matrix.Translation(at) @ Matrix.Rotation(k * 6.0, 4, 'Y')
    # meat bone: 0 = in the mouth (carrying), 1 = between the paws (chewing)
    where = spec.get('_bone', 0.0 if name in ('carry', 'stand-bone') else 1.0 if name == 'chew' else None)
    show(bone_prop, where is not None)
    if where is not None:
        bpy.context.view_layer.update()
        a, b = bone_in_mouth(arm), bone_between_paws(arm)
        if where <= 0:
            bone_prop.matrix_world = a
        elif where >= 1:
            bone_prop.matrix_world = b
        else:
            rot = a.to_quaternion().slerp(b.to_quaternion(), where)
            bone_prop.matrix_world = Matrix.Translation(a.to_translation().lerp(b.to_translation(), where)) @ rot.to_matrix().to_4x4()


def pose_frame(name, p, arm):
    """Poses the rig for frame p of an animation; returns the spec and how far to raise him to keep his paws down."""
    base, _ = split_name(name)
    spec = POSES[base](p)
    return spec, ground_fix(arm, spec)


def place_frame(name, p, spec, lift, arm, details, treat, bone_prop, basket, yaw=None):
    base, view = split_name(name)
    in_basket = spec.get('_inbasket', 1.0 if base in IN_BASKET else 0.0)
    place_dog(arm, spec.get('_yaw', VIEWS[view]) if yaw is None else yaw, in_basket, lift, spec.get('_back', 0.0))
    bpy.context.view_layer.update()
    place_props(base, p, arm, details, treat, bone_prop, basket, spec)


def keyframe(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_euler', frame=frame)
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('scale', frame=frame)


def render_empty(args, scene, arm, treat, bone_prop, basket, key='e'):
    """The shadow catcher alone; its faint haze is subtracted from every frame so only real shadows stay."""
    show(basket, False)
    show(treat, False)
    show(bone_prop, False)
    for obj in bpy.data.objects:
        if obj.parent == arm or obj.name == 'HubertFur':
            obj.hide_render = True
    frame_camera(scene, key)
    scene.render.filepath = os.path.join(args['out'], empty_name(key))
    bpy.ops.render.render(write_still=True)


def empty_name(key):
    return 'empty.png' if key == 'e' else f'empty-{key}.png'


def render_anim(name, args, scene, arm, details, treat, bone_prop, basket, fur, manifest, render=True):
    frames, fps, loop = ANIMS[name]
    folder = os.path.join(args['out'], name)
    os.makedirs(folder, exist_ok=True)
    frame_camera(scene, frame_of(name))
    try:
        action = bpy.data.actions.new(f'Hubert_{name}')
        if arm.animation_data is None:
            arm.animation_data_create()
        arm.animation_data.action = action
    except Exception as error:
        print('keyframe setup skipped:', error)
    anchors = []
    for i in range(frames):
        p = i / frames if loop else (i / max(1, frames - 1))
        spec, lift = pose_frame(name, p, arm)
        try:
            keyframe(arm, i + 1)
        except Exception as error:
            print('keyframe skipped:', error)
        # the keyed action now drives the pose for this frame
        scene.frame_set(i + 1)
        place_frame(name, p, spec, lift, arm, details, treat, bone_prop, basket)
        if render:
            fur.update()
        bpy.context.view_layer.update()
        if split_name(name)[0] in IN_BASKET and name != 'basket':
            bone_hit, strand_hit = tail_clearance(arm, basket, fur if render else None)
            if bone_hit > 0 or (strand_hit or 0) > 0:
                print(f'HUBERT WARNING tail in the basket wall: {name} frame {i} tail={bone_hit:.3f} strands={strand_hit}', flush=True)
        # the tag's mesh is built in rest-pose world space round the object origin, so map its centre
        tag_world = details['tag'].matrix_world @ details['tag_center']
        head = arm.matrix_world @ arm.pose.bones['head'].matrix
        anchors.append({'tag': project(scene, scene.camera, tag_world), 'head': project(scene, scene.camera, head.to_translation())})
        if not render:
            continue
        scene.render.filepath = os.path.join(folder, f'{i:02d}.png')
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'HUBERT frame {name} {i + 1}/{frames} {time.time() - started:.1f}s', flush=True)
    manifest[name] = {'frames': frames, 'fps': fps, 'loop': loop, 'anchors': anchors}
    frame_camera(scene, 'e')


# 'game' = the animation's own view; the others turn him to a fixed yaw
LOOK_TURNS = {'game': None, 'side': 0.0, 'front34': -55.0, 'front': -88.0, 'top': None, **VIEWS}


def render_look(args, scene, arm, details, treat, bone_prop, basket, fur):
    """--views game,side,front34,front,ne,n,se,s  --zoom 0.6 frames the head (--focus tail: the tail) instead of the whole dog."""
    os.makedirs(args['out'], exist_ok=True)
    scene.render.resolution_percentage = int(args.get('lookpct', 200))
    cam = scene.camera
    zoom = float(args['zoom']) if args.get('zoom') else None
    views = [v.strip() for v in args.get('views', 'game').split(',') if v.strip()]
    phases = [float(x) for x in str(args.get('phase', 0.3)).split(',')]
    # --posefile variants.json: {name: {"base": "rest", "p": 0.0, "set": {bone: value}}} - pose experiments in one session
    variants = None
    if args.get('posefile'):
        with open(args['posefile'], encoding='utf-8') as handle:
            variants = json.load(handle)
    names = list(variants) if variants else args['only'] or ['walk', 'sit', 'rest', 'beg']
    shots = [(name, p, view) for name in names for p in phases for view in views]
    for name, p, view in shots:
        if variants:
            variant = variants[name]
            base = variant.get('base', 'rest')
            spec = POSES[base](variant.get('p', p))
            spec.update({key: tuple(value) if isinstance(value, list) else value for key, value in variant.get('set', {}).items()})
            lift = ground_fix(arm, spec)
            if view == views[0]:
                bpy.context.view_layer.update()
                print('HUBERT angles', name, {pb.name: round(_side_angle(pb.head, pb.tail), 1) for pb in arm.pose.bones
                                             if pb.name in MODEL_CORRECT + ('neck', 'head')}, flush=True)
            place_frame(base, p, spec, lift, arm, details, treat, bone_prop, basket, yaw=LOOK_TURNS[view])
        else:
            spec, lift = pose_frame(name, p, arm)
            place_frame(name, p, spec, lift, arm, details, treat, bone_prop, basket, yaw=LOOK_TURNS[view])
        fur.update()
        if zoom:
            frame_camera(scene, 'e')
            elev = math.radians(CAM_ELEVATION)
            head = arm.matrix_world @ (arm.pose.bones['head'].matrix @ Vector((0, 0.13, 0.02)))
            if args.get('focus') == 'tail':
                head = arm.matrix_world @ arm.pose.bones['tail3'].head
            cam.data.ortho_scale = zoom
            cam.location = head + Vector((0, -math.cos(elev), math.sin(elev))) * 6.0
        else:
            frame_camera(scene, frame_of(name) if view == 'game' else view if view in FRAMES else 'e')
            if view == 'top':
                cam.location = Vector((0.0, 0.0, 6.0))
                cam.rotation_euler = (0, 0, 0)
        suffix = '' if view == 'game' and not zoom else f'-{view}' + ('-head' if zoom else '')
        if len(phases) > 1:
            suffix += f'-{round(p * 100):03d}'
        scene.render.filepath = os.path.join(args['out'], f'look-{name}{suffix}.png')
        bpy.ops.render.render(write_still=True)
        print('HUBERT look', name, view, flush=True)
    arm.rotation_euler = (0, 0, math.radians(DOG_TURN))
    frame_camera(scene, 'e')

# ----------------------------------------------------------------------------- sheets

def load_rgba(path):
    image = bpy.data.images.load(path)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)


def save_webp(pixels, path, quality=82, scale=1.0):
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    image.alpha_mode = 'STRAIGHT'
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    if scale != 1.0:
        image.scale(round(w * scale), round(h * scale))
    scene = bpy.context.scene
    settings = scene.render.image_settings
    settings.file_format = 'WEBP'
    settings.color_mode = 'RGBA'
    settings.quality = quality
    image.save_render(path, scene=scene)
    bpy.data.images.remove(image)


def save_png(pixels, path):
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def build_sheets(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'Standard'
    with open(os.path.join(args['out'], 'anchors.json'), encoding='utf-8') as handle:
        manifest = json.load(handle)
    assets = args['assets']
    os.makedirs(assets, exist_ok=True)
    rows = []
    out = {'frameWidth': FRAME_W, 'frameHeight': FRAME_H, 'scale': 2, 'ground': {'x': FRAME_W / 2, 'y': GROUND_Y}, 'animations': {}}

    def plate(key):
        """The empty catcher's alpha for a frame, and a mask fading shadows out towards that frame's edges."""
        empty = load_rgba(os.path.join(args['out'], empty_name(key)))[..., 3]
        h, w = empty.shape
        ys, xs = np.arange(h)[:, None], np.arange(w)[None, :]
        edge = np.clip(np.minimum(np.minimum(xs, w - 1 - xs), np.minimum(ys, h - 1 - ys)) / SHADOW_EDGE_FADE, 0, 1).astype(np.float32)
        return empty, edge * edge * (3 - 2 * edge)
    plates = {}
    firsts = {}
    contact = args.get('contact')
    for name, info in manifest.items():
        key = frame_of(name)
        if key not in plates:
            plates[key] = plate(key)
        empty, edge = plates[key]
        frames = []
        for i in range(info['frames']):
            frame = load_rgba(os.path.join(args['out'], name, f'{i:02d}.png'))
            alpha = np.clip((frame[..., 3] - empty) / np.maximum(1 - empty, 1e-3), 0, 1)
            shadow = frame[..., :3].max(axis=-1) < 0.06
            alpha = np.where(shadow, alpha * edge, alpha)
            alpha[shadow & (alpha < 0.04)] = 0
            alpha[alpha < 0.015] = 0
            frame[..., 3] = alpha
            frames.append(frame)
        firsts[name] = frames[0]
        strip = np.concatenate(frames, axis=1)
        scale = SHEET_SCALE if split_name(name)[1] == 'e' else DIRECTIONAL_SCALE
        save_webp(strip, os.path.join(assets, f'hubert-{name}.webp'), scale=scale)
        out['animations'][name] = {'file': f'hubert-{name}.webp', 'frames': info['frames'], 'fps': info['fps'], 'loop': info['loop'],
                                   'tag': info['anchors'][0]['tag'], 'tags': [a['tag'] for a in info['anchors']]}
        if key != 'e':
            # this strip's frame (width, height, ground x, ground y) in the side frame's pixels
            out['animations'][name]['box'] = list(FRAMES[key])
        if contact:
            rows.append(strip)
        print('HUBERT sheet', name, flush=True)
    for still, source in STILLS.items():
        if source not in firsts:
            continue
        save_webp(firsts[source], os.path.join(assets, f'hubert-{still}.webp'), scale=DIRECTIONAL_SCALE)
        tag = manifest[source]['anchors'][0]['tag']
        out['animations'][still] = {'file': f'hubert-{still}.webp', 'frames': 1, 'fps': 1, 'loop': False, 'tag': tag, 'tags': [tag],
                                    'box': list(FRAMES[frame_of(source)])}
    with open(os.path.join(assets, 'hubert.json'), 'w', encoding='utf-8') as handle:
        json.dump(out, handle, indent=1)
    if not contact:
        print('HUBERT sheets written', flush=True)
        return
    # contact sheet on a warm floor colour (Blender images are bottom-up, so rows stack in reverse)
    width = max(row.shape[1] for row in rows)
    canvas = []
    for row in rows:
        pad = np.zeros((row.shape[0], width - row.shape[1], 4), dtype=np.float32)
        canvas.append(np.concatenate([row, pad], axis=1))
    sheet = np.concatenate(canvas[::-1], axis=0)
    bg = np.array(srgb('#c9a27a'))
    alpha = sheet[..., 3:4]
    flat = sheet[..., :3] * alpha + np.array([0.80, 0.66, 0.50]) * (1 - alpha)
    sheet = np.concatenate([flat, np.ones_like(alpha)], axis=-1)
    os.makedirs(os.path.dirname(contact), exist_ok=True)
    save_png(sheet, contact)
    print('HUBERT sheets written', flush=True)


def check_tail(args, arm, details, treat, bone_prop, basket, fur):
    """Every frame of every in-basket strip: tail centre line (with its girth) and tail strands against the wicker."""
    names = args['only'] or [n for n in ANIMS if n in IN_BASKET and n != 'basket']
    worst_all = -1.0
    for name in names:
        frames, _, loop = ANIMS[name]
        worst = (-1.0, -1.0, 0)
        for i in range(frames):
            p = i / frames if loop else (i / max(1, frames - 1))
            spec, lift = pose_frame(name, p, arm)
            place_frame(name, p, spec, lift, arm, details, treat, bone_prop, basket)
            fur.update()
            bone_hit, strand_hit = tail_clearance(arm, basket, fur)
            strand_hit = -1.0 if strand_hit is None else strand_hit
            tip = arm.matrix_world @ arm.pose.bones['tail4'].tail - basket.matrix_world.translation
            if args.get('verbose'):
                print(f'TAIL {name} {i:02d} tail={bone_hit:+.3f} strands={strand_hit:+.3f} tip=({tip.x:+.2f}, {tip.y:+.2f}, {tip.z:+.2f})', flush=True)
            if args.get('verbose') == '2' and i == 0:
                for joint in ('hips', 'tail1', 'tail2', 'tail3', 'tail4', 'hl_n', 'hp_n', 'hp_f', 'fp_n', 'chest'):
                    at = arm.matrix_world @ arm.pose.bones[joint].tail - basket.matrix_world.translation
                    print(f'JOINT {name} {joint} end=({at.x:+.3f}, {at.y:+.3f}, {at.z:+.3f})', flush=True)
            worst = max(worst, (max(bone_hit, strand_hit), bone_hit, i))
        worst_all = max(worst_all, worst[0])
        print(f'TAILCHECK {name} worst={worst[0]:+.3f} (centre line {worst[1]:+.3f}) at frame {worst[2]} -> {"OK" if worst[0] <= 0 else "CLIPS"}', flush=True)
    print(f'TAILCHECK {"PASS" if worst_all <= 0 else "FAIL"} worst={worst_all:+.3f}', flush=True)


def measure_gait(arm):
    """How fast a planted paw slides across the frame in each moving cycle and view: the room walk must match it
    (GAIT_SPEED and DEPTH_PACE in src/lib/hubertRoutine.ts). Screen speeds are in frame heights per second."""
    frame_h = ORTHO * FRAME_H / FRAME_W
    elev = math.radians(CAM_ELEVATION)
    up = Vector((0, math.sin(elev), math.cos(elev)))
    steps = 240
    for name in ('walk', 'run', 'carry'):
        frames, fps, _ = ANIMS[name]
        period = frames / fps
        for view, yaw in VIEWS.items():
            place_dog(arm, yaw)
            vx, vy = [], []
            for paw in ('fp_n', 'fp_f', 'hp_n', 'hp_f'):
                sx, sy, zs = np.empty(steps), np.empty(steps), np.empty(steps)
                for i in range(steps):
                    set_pose(arm, POSES[name](i / steps))
                    bpy.context.view_layer.update()
                    bone = arm.pose.bones[paw]
                    pad = arm.matrix_world @ ((bone.head + bone.tail) / 2)
                    sx[i], sy[i], zs[i] = pad.x, pad.dot(up), pad.z
                # the paw is planted for roughly the lower half of its cycle; the box must move against its slide
                stance = zs <= np.percentile(zs, 45)
                keep = stance & np.roll(stance, -1)
                vx.append(float(np.median(-(np.roll(sx, -1) - sx)[keep] * steps / period)))
                vy.append(float(np.median(-(np.roll(sy, -1) - sy)[keep] * steps / period)))
            x, y = np.mean(vx) / frame_h, np.mean(vy) / frame_h
            print(f'GAIT {name} {view} yaw={yaw:.0f} screen=({x:.3f}, {y:.3f}) speed={math.hypot(x, y):.3f} angle={math.degrees(math.atan2(y, x)):.1f}deg', flush=True)
    place_dog(arm, DOG_TURN)


def measure_bounds(scene, arm):
    """Screen extent of the rig per view over the moving cycles, relative to the ground point (px, side-view camera)."""
    names = ('walk', 'run', 'carry', 'start', 'stand-bone')
    gx, gy = FRAME_W / 2, GROUND_Y
    fur = 0.06 * FRAME_W / ORTHO
    model = bool(arm.get('hubert_model'))
    if model:
        fur = 4.0
        names = names + ('stand', 'sniff')
    for view, yaw in VIEWS.items():
        xs, ys = [], []
        for name in names:
            for i in range(24):
                spec, lift = pose_frame(name, i / 24, arm)
                place_dog(arm, yaw, 0.0, lift)
                bpy.context.view_layer.update()
                if model:
                    ev = MODEL['mesh'].evaluated_get(bpy.context.evaluated_depsgraph_get())
                    co = np.empty(len(ev.data.vertices) * 3)
                    ev.data.vertices.foreach_get('co', co)
                    world = MODEL['mesh'].matrix_world
                    for point in co.reshape(-1, 3)[::25]:
                        x, y = project(scene, scene.camera, world @ Vector(point))
                        xs.append(x - gx)
                        ys.append(y - gy)
                    continue
                for pb in arm.pose.bones:
                    for point in (pb.head, pb.tail):
                        x, y = project(scene, scene.camera, arm.matrix_world @ point)
                        xs.append(x - gx)
                        ys.append(y - gy)
        print(f'BOUNDS {view} x=[{min(xs) - fur:.0f}, {max(xs) + fur:.0f}] y=[{min(ys) - fur:.0f}, {max(ys) + fur:.0f}]', flush=True)
    place_dog(arm, DOG_TURN)


def main():
    args = parse_args()
    if args['mode'] == 'sheets':
        build_sheets(args)
        return
    scene, arm, details, treat, bone_prop, basket, fur = build(args)
    if args['mode'] == 'bounds':
        measure_bounds(scene, arm)
        return
    if args['mode'] == 'gait':
        measure_gait(arm)
        return
    if args['mode'] == 'tailcheck':
        check_tail(args, arm, details, treat, bone_prop, basket, fur)
        return
    if args['mode'] == 'look':
        render_look(args, scene, arm, details, treat, bone_prop, basket, fur)
    else:
        names = args['only'] or list(ANIMS)
        path = os.path.join(args['out'], 'anchors.json')
        manifest = {}
        if os.path.exists(path):
            with open(path, encoding='utf-8') as handle:
                manifest = json.load(handle)
        if not os.path.exists(os.path.join(args['out'], 'empty.png')):
            render_empty(args, scene, arm, treat, bone_prop, basket)
        for key in sorted({frame_of(name) for name in names}):
            if not os.path.exists(os.path.join(args['out'], empty_name(key))):
                render_empty(args, scene, arm, treat, bone_prop, basket, key)
        frame_camera(scene, 'e')
        for name in names:
            render_anim(name, args, scene, arm, details, treat, bone_prop, basket, fur, manifest, render=args['mode'] != 'anchors')
            with open(path, 'w', encoding='utf-8') as handle:
                json.dump({key: manifest[key] for key in ANIMS if key in manifest}, handle, indent=1)
    if args.get('blend'):
        bpy.ops.wm.save_as_mainfile(filepath=args['blend'])


main()
