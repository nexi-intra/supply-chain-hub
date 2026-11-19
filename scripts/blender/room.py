"""The Word-Puzzle living room and the table's materials, rendered once with Cycles.

  blender.exe -b --factory-startup --python scripts/blender/room.py -- --out src/assets/multiplayer [--only day,night,oak,walnut,mug,bag] [--samples 96] [--scale 1.0]

Outputs (WebP):
  room-day.webp / room-night.webp  living room plate, golden hour and evening, wall/floor line at FLOOR_LINE of the height
  oak.webp / walnut.webp           top-down wood for the tabletop and the board frame + rack
  prop-mug.webp / prop-bag.webp    a coffee mug and the tile bag, seen from above at the table's angle
  room.json                        plate geometry used by the renderer to line the floor up with Hubert's walkway
"""

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Vector

PLATE_W, PLATE_H = 2000, 1375
FLOOR_LINE = 0.205          # wall/floor line as a fraction of the plate height (measured below and written to room.json)
CAM_HEIGHT = 1.3
BACK_WALL = 8.5
LENS = 24.0


def srgb(hexstr, alpha=1.0):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {'out': 'src/assets/multiplayer', 'only': 'day,night,oak,walnut,mug,bag', 'samples': '96', 'scale': '1.0'}
    for i in range(0, len(argv), 2):
        args[argv[i].lstrip('-')] = argv[i + 1]
    args['only'] = [item for item in args['only'].split(',') if item]
    args['out'] = os.path.abspath(args['out'])
    args['samples'] = int(args['samples'])
    args['scale'] = float(args['scale'])
    return args


def reset(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 6
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.quality = 80
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj

# ----------------------------------------------------------------------------- materials

def mat_basic(name, color, roughness=0.5, **extra):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color) if isinstance(color, str) else color
    bsdf.inputs['Roughness'].default_value = roughness
    for key, value in extra.items():
        bsdf.inputs[key].default_value = value
    return mat


def mat_emission(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    em = nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = srgb(color)
    em.inputs['Strength'].default_value = strength
    mat.node_tree.links.new(em.outputs[0], out.inputs['Surface'])
    return mat


def wood(name, light, dark, plank_w=0.19, plank_l=1.6, scale=1.0, roughness=0.42, planks=True, horizontal=False, figure_amount=0.35):
    """Planks with fine straight grain: long stretched noise for the fibres, a softly distorted wave for
    the figure, and a per-plank tint from the brick texture."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (scale, scale, scale)
    # the grain runs along X; vertical boards are the same pattern turned 90 degrees
    mapping.inputs['Rotation'].default_value = (0, 0, 0 if horizontal else math.radians(90))
    links.new(coord.outputs['Object'], mapping.inputs['Vector'])

    def stretched(sx, sy):
        node = nodes.new('ShaderNodeMapping')
        node.inputs['Scale'].default_value = (sx, sy, 1.0)
        links.new(mapping.outputs['Vector'], node.inputs['Vector'])
        return node.outputs['Vector']

    fibres = nodes.new('ShaderNodeTexNoise')
    fibres.inputs['Scale'].default_value = 3.0
    fibres.inputs['Detail'].default_value = 12.0
    fibres.inputs['Roughness'].default_value = 0.65
    links.new(stretched(0.6, 40.0), fibres.inputs['Vector'])
    figure = nodes.new('ShaderNodeTexWave')
    figure.wave_type = 'BANDS'
    figure.bands_direction = 'Y'
    figure.wave_profile = 'SAW'
    figure.inputs['Scale'].default_value = 7.0
    figure.inputs['Distortion'].default_value = 5.0
    figure.inputs['Detail'].default_value = 3.0
    figure.inputs['Detail Scale'].default_value = 1.5
    links.new(stretched(0.25, 1.0), figure.inputs['Vector'])
    blend_value = nodes.new('ShaderNodeMath')
    blend_value.operation = 'MULTIPLY_ADD'
    blend_value.inputs[1].default_value = figure_amount
    links.new(figure.outputs['Fac'], blend_value.inputs[0])
    links.new(fibres.outputs['Fac'], blend_value.inputs[2])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = srgb(dark)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = srgb(light)
    links.new(blend_value.outputs[0], ramp.inputs['Fac'])
    color_out = ramp.outputs['Color']
    if planks:
        brick = nodes.new('ShaderNodeTexBrick')
        brick.offset = 0.37
        brick.squash = 1.0
        brick.inputs['Scale'].default_value = 1.0
        brick.inputs['Mortar Size'].default_value = 0.0025
        brick.inputs['Bias'].default_value = 0.0
        brick.inputs['Brick Width'].default_value = plank_l
        brick.inputs['Row Height'].default_value = plank_w
        brick.inputs['Color1'].default_value = (1, 1, 1, 1)
        brick.inputs['Color2'].default_value = (0.8, 0.76, 0.72, 1)
        brick.inputs['Mortar'].default_value = (0.3, 0.3, 0.3, 1)
        links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
        tint = nodes.new('ShaderNodeMix')
        tint.data_type = 'RGBA'
        tint.blend_type = 'MULTIPLY'
        tint.inputs['Factor'].default_value = 1.0
        links.new(color_out, tint.inputs['A'])
        links.new(brick.outputs['Color'], tint.inputs['B'])
        color_out = tint.outputs['Result']
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.35
        links.new(brick.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    links.new(color_out, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = 0.15
    return mat


def berber(name, base, line):
    """Wool rug with a soft diamond lattice, like a Scandinavian Berber rug."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    coord = nodes.new('ShaderNodeTexCoord')
    bands = []
    for angle in (45, -45):
        turn = nodes.new('ShaderNodeMapping')
        turn.inputs['Rotation'].default_value = (0, 0, math.radians(angle))
        links.new(coord.outputs['Object'], turn.inputs['Vector'])
        wave = nodes.new('ShaderNodeTexWave')
        wave.wave_type = 'BANDS'
        wave.bands_direction = 'X'
        wave.inputs['Scale'].default_value = 3.2
        wave.inputs['Distortion'].default_value = 0.6
        links.new(turn.outputs['Vector'], wave.inputs['Vector'])
        sharp = nodes.new('ShaderNodeMath')
        sharp.operation = 'GREATER_THAN'
        sharp.inputs[1].default_value = 0.93
        links.new(wave.outputs['Fac'], sharp.inputs[0])
        bands.append(sharp)
    both = nodes.new('ShaderNodeMath')
    both.operation = 'MAXIMUM'
    links.new(bands[0].outputs[0], both.inputs[0])
    links.new(bands[1].outputs[0], both.inputs[1])
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = srgb(base)
    mix.inputs['B'].default_value = srgb(line)
    links.new(both.outputs[0], mix.inputs['Factor'])
    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 220
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.8
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.95
    bsdf.inputs['Sheen Weight'].default_value = 0.9
    return mat


def fabric(name, color, scale=200, bump=0.25, sheen=0.8, pattern=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    base = srgb(color)
    if pattern:
        coord = nodes.new('ShaderNodeTexCoord')
        checker = nodes.new('ShaderNodeTexChecker')
        checker.inputs['Scale'].default_value = pattern[0]
        checker.inputs['Color1'].default_value = base
        checker.inputs['Color2'].default_value = srgb(pattern[1])
        links.new(coord.outputs['Object'], checker.inputs['Vector'])
        links.new(checker.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = base
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    b = nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = bump
    links.new(noise.outputs['Fac'], b.inputs['Height'])
    links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Sheen Weight'].default_value = sheen
    return mat


def limewash(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.6
    noise.inputs['Detail'].default_value = 6
    ramp = nodes.new('ShaderNodeValToRGB')
    c = srgb(color)
    ramp.color_ramp.elements[0].color = (c[0] * 0.86, c[1] * 0.86, c[2] * 0.86, 1)
    ramp.color_ramp.elements[1].color = (min(1, c[0] * 1.08), min(1, c[1] * 1.08), min(1, c[2] * 1.08), 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.95
    return mat

# ----------------------------------------------------------------------------- geometry

def box(name, center, size, material, bevel=0.0, segments=3, rotation=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rotation]
    mesh.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'NONE'
        for poly in mesh.polygons:
            poly.use_smooth = True
        mod.harden_normals = False
    return obj


def cylinder(name, center, radius, depth, material, segments=48, radius2=None, rotation=(0, 0, 0), bevel=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rotation]
    mesh.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    return obj


def sphere(name, center, radii, material, rotation=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rotation]
    mesh.materials.append(material)
    return obj


def plane(name, center, size, material, rotation=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = center
    obj.rotation_euler = [math.radians(a) for a in rotation]
    mesh.materials.append(material)
    return obj


def leaf_plant(name, base, height, leaf_mat, stem_mat, count=14, spread=0.7, leaf=(0.22, 0.15), seed=3):
    import random
    rng = random.Random(seed)
    for i in range(count):
        angle = rng.uniform(0, math.tau)
        lift = rng.uniform(0.45, 1.0)
        tip = Vector(base) + Vector((math.cos(angle) * spread * rng.uniform(0.4, 1.0), math.sin(angle) * spread * 0.6 * rng.uniform(0.4, 1.0), height * lift))
        mid = Vector(base).lerp(tip, 0.5) + Vector((0, 0, height * 0.12))
        for a, b in ((Vector(base), mid), (mid, tip)):
            d = b - a
            stem = cylinder(f'{name}_stem', (a + b) / 2, 0.008, d.length, stem_mat, segments=8)
            stem.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        sphere(f'{name}_leaf', tip, (leaf[0] * rng.uniform(0.8, 1.2), leaf[1] * rng.uniform(0.8, 1.2), 0.012), leaf_mat,
               rotation=(rng.uniform(-30, 30), rng.uniform(-40, 40), math.degrees(angle)))

# ----------------------------------------------------------------------------- the room

def build_room(theme):
    night = theme == 'night'
    wall = limewash('Wall', '#c4b8a3' if not night else '#8f8577')
    floor = wood('Floor', '#c99a68', '#8a5d36', scale=1.0, figure_amount=0.12)
    rug = berber('Rug', '#b5a183', '#7d6a50')
    rug_border = fabric('RugBorder', '#5c4431', scale=120, bump=0.6)
    linen = fabric('Linen', '#c9bba2', scale=260, bump=0.2)
    throw = fabric('Throw', '#a0532c', scale=150, bump=0.35)
    cushion_a = fabric('CushionA', '#4f6b5e', scale=200)
    cushion_b = fabric('CushionB', '#d8a64a', scale=200)
    oak = wood('Oak', '#b98f63', '#7a5232', planks=False, scale=3.0)
    black = mat_basic('BlackSteel', '#1d1c1b', 0.45, **{'Metallic': 0.6})
    slate = mat_basic('Slate', '#3b3b3d', 0.6)
    brass = mat_basic('Brass', '#c9a24b', 0.25, **{'Metallic': 1.0})
    ceramic = mat_basic('Ceramic', '#efe9dc', 0.3)
    terracotta = mat_basic('Terracotta', '#b0643f', 0.7)
    leaf = mat_basic('Leaf', '#3f6b3a', 0.45, **{'Subsurface Weight': 0.2})
    leaf2 = mat_basic('Leaf2', '#557f45', 0.45)
    stem = mat_basic('Stem', '#4a5a32', 0.6)
    frame = mat_basic('Frame', '#2a2420', 0.5)
    book_colors = ['#7c2f35', '#1f5f6b', '#d9a441', '#3c4a63', '#8a6e52', '#40624f']

    # shell: floor, back wall with a big window, side walls, ceiling
    plane('floor', (0, 4, 0), (18, 14), floor)
    W = BACK_WALL
    win_x0, win_x1, win_z0, win_z1 = -4.4, -1.9, 0.12, 2.6
    box('wall_left', (-6.7, W + 0.1, 1.5), (4.6, 0.2, 3.0), wall)
    box('wall_mid', (3.05, W + 0.1, 1.5), (10.0, 0.2, 3.0), wall)
    box('wall_sill', ((win_x0 + win_x1) / 2, W + 0.1, win_z0 / 2), (win_x1 - win_x0, 0.2, win_z0), wall)
    box('wall_head', ((win_x0 + win_x1) / 2, W + 0.1, (win_z1 + 3.0) / 2), (win_x1 - win_x0, 0.2, 3.0 - win_z1), wall)
    box('side_left', (-8.0, 3, 1.5), (0.2, 12, 3.0), wall)
    box('side_right', (8.0, 3, 1.5), (0.2, 12, 3.0), wall)
    box('ceiling', (0, 3, 3.0), (16, 12, 0.1), wall)
    box('skirting', (0, W - 0.01, 0.05), (16, 0.03, 0.1), mat_basic('Skirting', '#e9e1d3' if not night else '#b5ab9c', 0.5))
    # window frame with mullions
    for x in (win_x0, (win_x0 + win_x1) / 2, win_x1):
        box('mullion', (x, W + 0.05, (win_z0 + win_z1) / 2), (0.06, 0.12, win_z1 - win_z0), frame)
    for z in (win_z0, 1.5, win_z1):
        box('transom', ((win_x0 + win_x1) / 2, W + 0.05, z), (win_x1 - win_x0, 0.12, 0.06), frame)
    # outside: sky and blurred garden
    sky = mat_emission('Sky', '#f8dcae' if not night else '#1b2440', 2.4 if not night else 0.35)
    outside = plane('outside', ((win_x0 + win_x1) / 2, W + 2.5, 1.6), (6, 5), sky, rotation=(90, 0, 0))
    outside.visible_shadow = False
    garden = mat_emission('Garden', '#a3a477' if not night else '#0e1424', 0.75 if not night else 0.2)
    for i, x in enumerate((-5.2, -4.0, -2.8, -1.6)):
        hedge = sphere('hedge', (x, W + 1.6, 0.5 + 0.2 * (i % 2)), (0.8, 0.4, 0.7), garden)
        hedge.visible_shadow = False
    if night:
        lamp_out = mat_emission('StreetLight', '#ffcf86', 30)
        sphere('street_lamp', (-2.6, W + 2.2, 1.9), (0.05, 0.05, 0.05), lamp_out)
        sphere('window_light', (-3.7, W + 2.4, 1.2), (0.04, 0.04, 0.06), lamp_out)

    # big monstera in a pot by the window
    cylinder('pot', (-4.9, W - 0.55, 0.22), 0.26, 0.44, terracotta, radius2=0.2)
    leaf_plant('monstera', (-4.9, W - 0.55, 0.42), 1.25, leaf, stem, count=16, spread=0.75, leaf=(0.28, 0.2), seed=4)
    # linen sofa with cushions and a rust throw
    sx, sy = 0.0, W - 0.55
    box('sofa_base', (sx, sy, 0.27), (2.5, 0.95, 0.36), linen, bevel=0.06)
    box('sofa_back', (sx, sy + 0.36, 0.62), (2.5, 0.24, 0.62), linen, bevel=0.09)
    box('sofa_arm_l', (sx - 1.18, sy, 0.48), (0.24, 0.95, 0.5), linen, bevel=0.09)
    box('sofa_arm_r', (sx + 1.18, sy, 0.48), (0.24, 0.95, 0.5), linen, bevel=0.09)
    for x in (-0.53, 0.53):
        box('seat', (sx + x, sy - 0.06, 0.5), (1.04, 0.78, 0.18), linen, bevel=0.07)
    box('cushion1', (sx - 0.75, sy + 0.18, 0.78), (0.5, 0.16, 0.44), cushion_a, bevel=0.07, rotation=(-14, 0, 8))
    box('cushion2', (sx + 0.78, sy + 0.18, 0.78), (0.48, 0.16, 0.42), cushion_b, bevel=0.07, rotation=(-14, 0, -10))
    box('throw', (sx + 0.55, sy - 0.1, 0.62), (0.6, 0.85, 0.05), throw, bevel=0.02, rotation=(0, 6, 4))
    for x in (-1.15, 1.15):
        for y in (-0.38, 0.38):
            cylinder('leg', (sx + x, sy + y, 0.045), 0.025, 0.09, oak, radius2=0.018)
    # side table with a lamp and books
    cylinder('side_table', (1.75, W - 0.4, 0.27), 0.28, 0.04, oak)
    cylinder('side_leg', (1.75, W - 0.4, 0.13), 0.025, 0.26, oak)
    for i, color in enumerate(book_colors[:3]):
        box('book', (1.72, W - 0.42, 0.31 + i * 0.035), (0.26 - i * 0.03, 0.2, 0.032), mat_basic(f'Book{i}', color, 0.6), rotation=(0, 0, 8 * i))
    cylinder('lamp_base', (1.85, W - 0.32, 0.45), 0.07, 0.3, ceramic, radius2=0.05)
    shade_mat = mat_basic('Shade', '#efe3cb', 0.8, **{'Transmission Weight': 0.3})
    if night:
        shade_mat = mat_emission('ShadeLit', '#ffd59a', 6)
    cylinder('lamp_shade', (1.85, W - 0.32, 0.69), 0.16, 0.2, shade_mat, radius2=0.12)
    # black wood stove on a slate hearth, with firewood
    box('hearth', (3.2, W - 0.45, 0.02), (1.2, 0.9, 0.04), slate)
    box('stove', (3.2, W - 0.38, 0.6), (0.56, 0.46, 1.0), black, bevel=0.03)
    cylinder('stove_pipe', (3.2, W - 0.34, 1.8), 0.075, 1.6, black)
    fire_strength = 14 if night else 2.5
    fire = mat_emission('Fire', '#ff8a2a', fire_strength)
    box('fire_window', (3.2, W - 0.615, 0.62), (0.36, 0.01, 0.4), fire)
    box('fire_frame', (3.2, W - 0.62, 0.62), (0.42, 0.005, 0.46), black)
    cylinder('log_basket', (2.45, W - 0.5, 0.18), 0.22, 0.36, fabric('Felt', '#5d5650', 160))
    log = mat_basic('Log', '#7b5a3e', 0.8)
    for i in range(5):
        cylinder('log', (2.38 + 0.05 * (i % 3), W - 0.5, 0.38 + 0.03 * i), 0.045, 0.42, log, rotation=(0, 80 + 6 * i, 15 * i))
    # brass floor lamp between sofa and stove
    cylinder('fl_base', (2.35, W - 0.95, 0.015), 0.17, 0.03, brass)
    cylinder('fl_pole', (2.35, W - 0.95, 0.75), 0.012, 1.5, brass)
    fl_shade = mat_emission('FloorLampLit', '#ffd59a', 9) if night else mat_basic('FloorShade', '#e8dcc3', 0.7)
    cylinder('fl_shade', (2.35, W - 0.95, 1.55), 0.2, 0.26, fl_shade, radius2=0.14)
    # low oak bench + ceramics on the left near the window
    box('bench', (-2.9, W - 0.35, 0.22), (1.3, 0.38, 0.06), oak, bevel=0.01)
    for x in (-3.45, -2.35):
        box('bench_leg', (-2.9 + (x + 2.9), W - 0.35, 0.1), (0.05, 0.3, 0.2), oak)
    cylinder('vase', (-3.2, W - 0.35, 0.39), 0.07, 0.28, ceramic, radius2=0.04)
    sphere('bowl', (-2.7, W - 0.35, 0.3), (0.14, 0.14, 0.06), mat_basic('Glaze', '#2f5d64', 0.2))
    leaf_plant('sprig', (-3.2, W - 0.35, 0.5), 0.35, leaf2, stem, count=6, spread=0.18, leaf=(0.06, 0.03), seed=8)
    # wool rug under the table, with a darker border
    box('rug_edge', (0, 3.4, 0.002), (5.5, 4.1, 0.004), rug_border)
    box('rug', (0, 3.4, 0.004), (5.3, 3.9, 0.004), rug)
    # a plant in the near left corner, out of focus
    cylinder('pot2', (-3.9, 1.3, 0.25), 0.3, 0.5, ceramic, radius2=0.24)
    leaf_plant('fig', (-3.9, 1.3, 0.5), 1.4, leaf, stem, count=18, spread=0.6, leaf=(0.2, 0.14), seed=11)
    return night


def light_room(scene, night):
    world = scene.world
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb('#f2d7ae') if not night else srgb('#1a2238')
    bg.inputs['Strength'].default_value = 0.25 if not night else 0.04

    def add(name, kind, energy, color, location=(0, 0, 0), rotation=(0, 0, 0), size=None, radius=None):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = srgb(color)[:3]
        if kind == 'AREA' and size:
            data.shape = 'RECTANGLE'
            data.size, data.size_y = size
        if kind == 'SUN' and size:
            data.angle = size
        if radius is not None:
            data.shadow_soft_size = radius
        obj = link(bpy.data.objects.new(name, data))
        obj.location = location
        obj.rotation_euler = [math.radians(a) for a in rotation]
        obj.visible_camera = False
        return obj

    if not night:
        # low golden sun pouring through the window toward the camera
        add('Sun', 'SUN', 9.0, '#ffb46c', rotation=(-68, 0, 22), size=math.radians(1.2))
        add('WindowSky', 'AREA', 180, '#ffe6c4', location=(-3.15, BACK_WALL - 0.05, 1.4), rotation=(-90, 0, 0), size=(2.4, 2.4))
        add('Bounce', 'AREA', 70, '#ffe9cf', location=(0, 1.0, 2.9), rotation=(0, 0, 0), size=(6, 4))
    else:
        add('Fire', 'POINT', 300, '#ff8a3a', location=(3.2, BACK_WALL - 0.75, 0.62), radius=0.2)
        add('TableLamp', 'POINT', 70, '#ffc98a', location=(1.85, BACK_WALL - 0.32, 0.7), radius=0.12)
        add('FloorLamp', 'POINT', 140, '#ffc98a', location=(2.35, BACK_WALL - 0.95, 1.45), radius=0.15)
        add('Pendant', 'POINT', 55, '#ffcf96', location=(0, 2.6, 2.4), radius=0.2)
        add('Moon', 'AREA', 40, '#8ea4d6', location=(-3.15, BACK_WALL - 0.05, 1.4), rotation=(-90, 0, 0), size=(2.4, 2.4))


def plate_camera(scene, scale):
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = LENS
    cam_data.sensor_width = 36
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 1.7
    cam_data.dof.aperture_fstop = 1.4
    cam = link(bpy.data.objects.new('Camera', cam_data))
    scene.camera = cam
    scene.render.resolution_x = int(PLATE_W * scale)
    scene.render.resolution_y = int(PLATE_H * scale)
    # tilt so the wall/floor line lands on FLOOR_LINE of the frame height
    v_half = math.atan((36 / (PLATE_W / PLATE_H)) / 2 / LENS)
    above = math.atan((0.5 - FLOOR_LINE) * 2 * math.tan(v_half))
    depression = math.atan(CAM_HEIGHT / BACK_WALL)
    tilt = above + depression
    cam.location = (0, 0, CAM_HEIGHT)
    cam.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    return cam


def render_plate(theme, args):
    scene = reset(args['samples'])
    night = build_room(theme)
    light_room(scene, night)
    scene.view_settings.exposure = 0.2 if not night else 0.1
    plate_camera(scene, args['scale'])
    scene.render.filepath = os.path.join(args['out'], f'room-{theme}.webp')
    bpy.ops.render.render(write_still=True)
    print('ROOM rendered', theme, flush=True)

# ----------------------------------------------------------------------------- textures and props

def ortho_camera(scene, width_m, res, elevation=90.0, target=(0, 0, 0), distance=4.0):
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = width_m
    cam = link(bpy.data.objects.new('Camera', cam_data))
    e = math.radians(elevation)
    cam.location = Vector(target) + Vector((0, -math.cos(e), math.sin(e))) * distance
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    return cam


def render_wood(name, light, dark, args, res, width_m, plank_w, plank_l):
    scene = reset(min(args['samples'], 32))
    scene.render.image_settings.quality = 82
    mat = wood(name, light, dark, plank_w=plank_w, plank_l=plank_l, roughness=0.5, horizontal=True)
    plane('board', (0, 0, 0), (width_m, width_m * res[1] / res[0]), mat)
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    ortho_camera(scene, width_m, res)
    scene.render.filepath = os.path.join(args['out'], f'{name}.webp')
    bpy.ops.render.render(write_still=True)
    print('ROOM texture', name, flush=True)


def prop_scene(args, res=(260, 260), width_m=0.24):
    scene = reset(min(args['samples'], 64))
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 86
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb('#f3dcc0')
    bg.inputs['Strength'].default_value = 0.6
    # no shadow catcher: its faint haze would tint the whole transparent frame; the page adds the shadow
    data = bpy.data.lights.new('Key', 'AREA')
    data.energy = 28
    data.size = 1.4
    data.color = srgb('#ffe2bd')[:3]
    key = link(bpy.data.objects.new('Key', data))
    key.location = (-0.5, -0.3, 0.9)
    key.rotation_euler = (math.radians(30), math.radians(-35), 0)
    fill = bpy.data.lights.new('Fill', 'AREA')
    fill.energy = 10
    fill.size = 1.0
    fill_obj = link(bpy.data.objects.new('Fill', fill))
    fill_obj.location = (0.6, -0.5, 0.6)
    fill_obj.rotation_euler = (math.radians(50), math.radians(40), 0)
    ortho_camera(scene, width_m, res, elevation=62, target=(0, 0.01, 0.03))
    return scene


def render_mug(args):
    scene = prop_scene(args, res=(300, 300), width_m=0.13)
    glaze = mat_basic('Glaze', '#e6dccb', 0.18, **{'Coat Weight': 0.6})
    band = mat_basic('Band', '#2f5d64', 0.2, **{'Coat Weight': 0.6})
    coffee = mat_basic('Coffee', '#3a1f0f', 0.08, **{'Coat Weight': 1.0})
    mesh = bpy.data.meshes.new('mug')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=64, radius1=0.04, radius2=0.042, depth=0.09)
    bottom = bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=0.04)
    bmesh.ops.translate(bm, vec=Vector((0, 0, -0.045)), verts=bottom['verts'])
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    body = link(bpy.data.objects.new('mug', mesh))
    body.location = (0, 0, 0.045)
    mesh.materials.append(glaze)
    solid = body.modifiers.new('solid', 'SOLIDIFY')
    solid.thickness = 0.004
    body.modifiers.new('bevel', 'BEVEL').width = 0.0015
    cylinder('band', (0, 0, 0.03), 0.0408, 0.012, band, segments=64)
    cylinder('coffee', (0, 0, 0.072), 0.0375, 0.002, coffee, segments=64)
    handle = bpy.data.meshes.new('handle')
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=24, radius=0.025)
    bm.to_mesh(handle)
    bm.free()
    obj = link(bpy.data.objects.new('handle', handle))
    obj.location = (0.045, 0, 0.048)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.scale = (0.8, 1.0, 1.0)
    skin = obj.modifiers.new('skin', 'SKIN')
    obj.modifiers.new('sub', 'SUBSURF').levels = 2
    for v in handle.skin_vertices[0].data:
        v.radius = (0.0055, 0.0055)
    handle.materials.append(glaze)
    scene.render.filepath = os.path.join(args['out'], 'prop-mug.webp')
    bpy.ops.render.render(write_still=True)
    print('ROOM prop mug', flush=True)


def render_bag(args):
    """A natural linen tile pouch lying on its side, a few tiles spilled from its mouth."""
    scene = prop_scene(args, res=(340, 300), width_m=0.26)
    cloth = fabric('BagCloth', '#a88d68', scale=700, bump=0.8, sheen=0.4)
    stitch = mat_basic('Stitch', '#7c2f35', 0.7)
    cord = mat_basic('Cord', '#7c2f35', 0.6)
    maple = mat_basic('Maple', '#f3e6c8', 0.35, **{'Coat Weight': 0.4})
    ink = mat_basic('Ink', '#2a1d12', 0.5)
    bag = sphere('bag', (-0.045, 0.0, 0.04), (0.085, 0.062, 0.042), cloth, rotation=(0, 0, 18))
    bag.modifiers.new('sub', 'SUBSURF').levels = 2
    # soft wrinkles in the linen
    wrinkles = bpy.data.textures.new('wrinkles', 'CLOUDS')
    wrinkles.noise_scale = 0.022
    displace = bag.modifiers.new('wrinkle', 'DISPLACE')
    displace.texture = wrinkles
    displace.strength = 0.007
    displace.mid_level = 0.5
    # the gathered mouth points at the spilled tiles
    angle = math.radians(18)
    out = Vector((math.cos(angle), math.sin(angle), 0))
    mouth = Vector((-0.045, 0, 0.034)) + out * 0.085
    neck = cylinder('neck', mouth, 0.022, 0.026, cloth, radius2=0.016, rotation=(0, 90, 18))
    ruffle = cylinder('ruffle', mouth + out * 0.022, 0.016, 0.02, cloth, radius2=0.03, rotation=(0, 90, 18))
    tie = cylinder('tie', mouth + out * 0.004, 0.021, 0.006, cord, rotation=(0, 90, 18))
    cylinder('cordtail', mouth + Vector((0.01, -0.03, -0.02)), 0.0022, 0.07, cord, rotation=(80, 0, 40))
    # a stitched band around the pouch
    band = cylinder('band', (-0.045, 0, 0.04), 0.0625, 0.004, stitch, rotation=(0, 90, 18))
    band.scale = (0.68, 1.0, 1.0)
    for i, (x, y, rot, letter) in enumerate(((0.085, 0.03, 18, 'H'), (0.115, -0.025, -14, 'U'), (0.07, -0.06, 32, 'B'))):
        tile = box('tile', (x, y, 0.005), (0.032, 0.032, 0.009), maple, bevel=0.002, rotation=(0, 0, rot))
        curve = bpy.data.curves.new('letter', 'FONT')
        curve.body = letter
        curve.size = 0.022
        curve.align_x = 'CENTER'
        curve.align_y = 'CENTER'
        for path in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
            if os.path.exists(path):
                curve.font = bpy.data.fonts.load(path)
                break
        text = link(bpy.data.objects.new('letter', curve))
        text.location = (x, y, 0.0101)
        text.rotation_euler = (0, 0, math.radians(rot))
        curve.materials.append(ink)
    scene.render.filepath = os.path.join(args['out'], 'prop-bag.webp')
    bpy.ops.render.render(write_still=True)
    print('ROOM prop bag', flush=True)


def main():
    args = parse_args()
    os.makedirs(args['out'], exist_ok=True)
    for item in args['only']:
        if item in ('day', 'night'):
            render_plate(item, args)
        elif item == 'oak':
            render_wood('oak', '#8a6142', '#4e3220', args, (1600, 1000), 1.6, 0.16, 2.2)
        elif item == 'walnut':
            render_wood('walnut', '#6a4128', '#2f1b10', args, (900, 900), 0.6, 0.6, 3.0)
        elif item == 'mug':
            render_mug(args)
        elif item == 'bag':
            render_bag(args)
    with open(os.path.join(args['out'], 'room.json'), 'w', encoding='utf-8') as handle:
        json.dump({'width': PLATE_W, 'height': PLATE_H, 'floorLine': FLOOR_LINE}, handle, indent=1)


main()
