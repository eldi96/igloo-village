# 등대 내부. 매끈한 플라스틱·점토 3D 아이콘 질감(크게 둥근 모서리, 한 가지 색, 살짝 윤기)으로 만들고
# 빛을 구워 assets/lighthouse-room.glb + KTX2 그림으로 내보낸다.
# 실행: blender -b -P blender/lighthouse_room.py -- preview <png> [samples]
#       blender -b -P blender/lighthouse_room.py -- bake <폴더>   (그 다음 bash blender/encode_lighthouse.sh <폴더>)
# 좌표는 Blender 기준(Z 위, 방 가운데 원점, 정면 +Y). three.js 좌표 = (x, z, -y).
# lighthouse-room.js의 시점·클릭 영역·충돌 값이 이 파일의 배치와 같아야 한다.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['preview', '//lighthouse_preview.png']
R, H, WALL_T = 4.0, 3.4, 0.4            # 방 반지름, 천장 높이, 벽 두께
WINDOWS = (70, 90, 110)                 # 아치창 각도(+X에서 반시계, 도)
WIN_W, WIN_SILL, WIN_SPRING = 1.0, 0.9, 2.15
SHELF_A, MAP_A, CLOCK_A, PLANT_A = 35, 145, 126, 54
DESK_Y = R - 1.0                        # 책상 중심 y
TEA = (-2.35, 0.75)                     # 찻잔 탁자
SEATS = ((-2.6, -0.2), (-1.45, 1.25))   # 안락의자 둘
CAM = ((0, -3.05, 1.5), (0, 2.0, 1.2), 60)   # 시작 시점(위치, 바라보는 점, 세로 화각)
random.seed(7)

def rad(a): return math.radians(a)
def on_wall(a, r=R): return Vector((r * math.cos(rad(a)), r * math.sin(rad(a)), 0))

def mesh_object(name, verts, faces, smooth=False, mat=None):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    return ob

def group(name, loc=(0, 0, 0), rot_z=0.0):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.location = loc; e.rotation_euler = (0, 0, rot_z); return e

def soften(ob, width, segments=5, angle=None):
    """크게 둥근 모서리: 베벨 + 매끈한 음영. 평평한 면은 harden_normals로 얼룩 없이 유지."""
    md = ob.modifiers.new('bv', 'BEVEL'); md.width = width; md.segments = segments
    md.limit_method = 'ANGLE' if angle else 'NONE'
    if angle: md.angle_limit = rad(angle)
    md.harden_normals = True; md.miter_outer = 'MITER_ARC'
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def box(name, size, loc, mat, r=None, parent=None, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2 for s in size)
    v = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    ob = mesh_object(name, v, f, mat=mat); ob.location = loc; ob.rotation_euler = rot
    soften(ob, min(min(size) * 0.3, 0.06) if r is None else r)
    if parent: ob.parent = parent
    return ob

def cyl(name, r, depth, loc, mat, verts=40, parent=None, rot=(0, 0, 0), r2=None, round_=None):
    r2 = r if r2 is None else r2
    v = [(r * math.cos(2 * math.pi * i / verts), r * math.sin(2 * math.pi * i / verts), -depth / 2) for i in range(verts)]
    v += [(r2 * math.cos(2 * math.pi * i / verts), r2 * math.sin(2 * math.pi * i / verts), depth / 2) for i in range(verts)]
    f = [tuple(range(verts))[::-1], tuple(range(verts, 2 * verts))] + [(i, (i + 1) % verts, verts + (i + 1) % verts, verts + i) for i in range(verts)]
    ob = mesh_object(name, v, f, mat=mat); ob.location = loc; ob.rotation_euler = rot
    w = min(min(r, r2) * 0.45, depth * 0.45, 0.05) if round_ is None else round_
    if w > 0: soften(ob, w, 4, angle=30)
    else:
        for p in ob.data.polygons[2:]: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    ob = bpy.context.active_object; ob.name = name; ob.data.materials.append(mat); ob.scale = scale
    for p in ob.data.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def boolean(ob, cutter, op='DIFFERENCE'):
    md = ob.modifiers.new('b', 'BOOLEAN'); md.object = cutter; md.operation = op; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='b')
    bpy.data.objects.remove(cutter)

# ---------- 재질: 한 가지 색 플라스틱 ----------
def plastic(name, color, rough=0.42, coat=0.25, emit=None, emit_s=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.25
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = emit_s
    return m

def window_glass():
    m = bpy.data.materials.new('WinGlass'); m.use_nodes = True; nt = m.node_tree
    out = nt.nodes['Material Output']; nt.nodes.remove(nt.nodes['Principled BSDF'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.05
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.06
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return m

def materials():
    P = plastic
    return {
        'wall': P('Wall', (0.74, 0.46, 0.27), 0.6, 0.05),      # 복숭아·캐러멜 벽
        'wallLow': P('WallLow', (0.55, 0.27, 0.11), 0.55, 0.1),
        'ceiling': P('Ceiling', (0.80, 0.56, 0.36), 0.7, 0.0),
        'floor': P('Floor', (0.33, 0.50, 0.30), 0.6, 0.05),     # 세이지 그린 바닥
        'rug': P('Rug', (0.62, 0.30, 0.14), 0.85, 0.0),
        'frame': P('Frame', (0.92, 0.91, 0.88), 0.38),
        'orange': P('Orange', (0.80, 0.31, 0.10)),              # 주황 플라스틱 가구
        'caramel': P('Caramel', (0.52, 0.20, 0.06)),            # 책장 캐러멜
        'tan': P('Tan', (0.70, 0.40, 0.17), 0.5),               # 안락의자
        'white': P('White', (0.90, 0.90, 0.88), 0.35),
        'cream': P('Cream', (0.88, 0.74, 0.48), 0.5),
        'mint': P('Mint', (0.24, 0.55, 0.42), 0.5),
        'navy': P('Navy', (0.05, 0.14, 0.20), 0.4),
        'gold': P('Gold', (0.80, 0.55, 0.20), 0.3, 0.4),
        'red': P('Red', (0.72, 0.10, 0.05)),
        'green': P('Green', (0.10, 0.45, 0.15)),
        'blue': P('Blue', (0.08, 0.32, 0.65)),
        'yellow': P('Yellow', (0.92, 0.55, 0.06)),
        'leaf': P('Leaf', (0.12, 0.40, 0.15), 0.5),
        'glow': P('Glow', (1, 0.95, 0.85), 0.3, 0.0, emit=(1.0, 0.85, 0.62), emit_s=3),
        'winglass': window_glass(),
        'map': P('MapArt', (0.9, 0.85, 0.8), 0.8, 0.0),
        'sea': P('SeaMat', (0.01, 0.03, 0.05), 0.6, 0.0),
        'moon': P('MoonMat', (1, 1, 1), 1.0, 0.0, emit=(0.85, 0.9, 1.0), emit_s=6),
    }

# ---------- 방 ----------
def arch_prism(name, w, z0, spring, depth, a, r_mid, seg=24):
    hw = w / 2
    pts = [(-hw, z0), (hw, z0)] + [(hw * math.cos(math.pi * i / seg), spring + hw * math.sin(math.pi * i / seg)) for i in range(seg + 1)]
    n = len(pts)
    v = [(x, -depth / 2, z) for x, z in pts] + [(x, depth / 2, z) for x, z in pts]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    ob = mesh_object(name, v, f)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    ob.location = on_wall(a, r_mid); ob.rotation_euler = (0, 0, rad(a) - math.pi / 2)
    return ob

def ring(name, r0, r1, z0, z1, mat, seg=96):
    v = []
    for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1)):
        v += [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]
    f = []
    for k in range(4):
        a, b = k * seg, ((k + 1) % 4) * seg
        f += [(a + i, a + (i + 1) % seg, b + (i + 1) % seg, b + i) for i in range(seg)]
    ob = mesh_object(name, v, f, smooth=True, mat=mat)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    return ob

def build_room(M):
    wall = ring('Wall', R, R + WALL_T, 0, H, M['wall'])
    base = ring('Base', R - 0.08, R + 0.01, 0, 0.32, M['wallLow'])
    for a in WINDOWS:
        for ob in (wall, base):
            boolean(ob, arch_prism('cut', WIN_W, WIN_SILL, WIN_SPRING, 2.0, a, R + WALL_T / 2))
        # 두툼한 흰 아치 창틀(안쪽으로 살짝 튀어나옴)과 넓은 창턱
        frame = arch_prism('Frame', WIN_W + 0.22, WIN_SILL - 0.04, WIN_SPRING, 0.16, a, R - 0.02)
        boolean(frame, arch_prism('fcut', WIN_W - 0.02, WIN_SILL, WIN_SPRING, 1.0, a, R - 0.02))
        frame.data.materials.append(M['frame']); soften(frame, 0.04, 4, angle=40)
        d = on_wall(a, R + 0.1); rot = (0, 0, rad(a) - math.pi / 2)
        box('Transom', (WIN_W, 0.06, 0.06), (d.x, d.y, 1.75), M['frame'], 0.025, rot=rot)
        g = arch_prism('Pane', WIN_W - 0.02, WIN_SILL, WIN_SPRING, 0.01, a, R + 0.15); g.data.materials.append(M['winglass'])
        s = on_wall(a, R - 0.06)
        box('Sill', (WIN_W + 0.36, 0.3, 0.08), (s.x, s.y, WIN_SILL - 0.06), M['frame'], 0.035, rot=rot)
    soften(base, 0.035, 4, angle=40)
    for p in wall.data.polygons: p.use_smooth = False   # 창 구멍 주변 음영 얼룩 방지
    cyl('Floor', R + 0.05, 0.1, (0, 0, -0.05), M['floor'], verts=96, round_=0.0)
    cyl('Ceiling', R + 0.05, 0.12, (0, 0, H + 0.06), M['ceiling'], verts=96, round_=0.0)
    ring('Crown', R - 0.12, R + 0.01, H - 0.16, H, M['wallLow'])
    # 천장 펜던트 등: 흰 둥근 갓
    cyl('PendantRod', 0.012, 0.5, (0, 0, H - 0.25), M['gold'], 12, round_=0.0)
    sphere('Pendant', 0.2, (0, 0, H - 0.68), M['glow'], scale=(1, 1, 0.85))
    cyl('PendantCap', 0.09, 0.08, (0, 0, H - 0.52), M['gold'], 24)
    cyl('Rug', 1.25, 0.03, (0.25, 0.45, 0.015), M['rug'], 64, round_=0.012)

def drawer_handle(M, loc, parent, w=0.16):
    cyl('Handle', 0.018, w, loc, M['white'], 16, parent, rot=(0, math.pi / 2, 0), round_=0.017)

def build_desk(M):
    # 서랍장 아이콘처럼: 튀어나온 두툼한 상판, 둥근 몸통, 흰 손잡이 서랍, 짧고 굵은 다리.
    g = group('Desk', (0, DESK_Y, 0), 0)
    box('Top', (1.55, 0.72, 0.08), (0, 0, 0.77), M['orange'], 0.035, g)
    box('Body', (1.42, 0.6, 0.5), (0, 0.02, 0.48), M['orange'], 0.05, g)
    for x in (-0.46, 0, 0.46):
        box('Drawer', (0.42, 0.04, 0.38), (x, -0.29, 0.48), M['orange'], 0.025, g)
        drawer_handle(M, (x, -0.325, 0.5), g, 0.17)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('Leg', 0.05, 0.24, (sx * 0.6, sy * 0.22, 0.12), M['orange'], 24, g, r2=0.04)
    # 위: 편지 묶음(크림 + 빨간 봉랍), 민트 갓 램프, 머그
    for k in range(3):
        box('Letter', (0.3, 0.21, 0.025), (-0.38 + k * 0.01, -0.06, 0.825 + k * 0.026), M['cream'], 0.01, g, rot=(0, 0, rad(-6 + k * 5)))
    cyl('Seal', 0.035, 0.018, (-0.36, -0.06, 0.9), M['red'], 24, g)
    cyl('LampBase', 0.09, 0.04, (0.48, 0.12, 0.83), M['white'], 32, g)
    cyl('LampStem', 0.016, 0.3, (0.48, 0.12, 0.99), M['white'], 16, g, round_=0.0)
    cyl('Shade', 0.17, 0.15, (0.48, 0.12, 1.19), M['mint'], 40, g, r2=0.09, round_=0.03)
    sphere('Bulb', 0.05, (0.48, 0.12, 1.12), M['glow'], g)
    cyl('Mug', 0.045, 0.09, (0.1, -0.12, 0.855), M['white'], 24, g)

def build_desk_chair(M):
    c = group('DeskChair', (0.12, DESK_Y - 0.72, 0), rad(-8))
    box('Seat', (0.46, 0.44, 0.08), (0, 0, 0.46), M['orange'], 0.035, c)
    box('Back', (0.46, 0.08, 0.4), (0, -0.2, 0.74), M['orange'], 0.035, c)
    for sx in (-1, 1):
        for sy in (-1, 1): cyl('Leg', 0.03, 0.42, (sx * 0.18, sy * 0.17, 0.21), M['orange'], 16, c, r2=0.025)

def build_shelf(M):
    # 책장 아이콘처럼: 두꺼운 캐러멜 틀, 선반 셋, 큼직한 원색 책과 눕힌 책 더미.
    p = on_wall(SHELF_A, R - 0.26)
    g = group('Shelf', (p.x, p.y, 0), rad(SHELF_A) - math.pi / 2)
    W, D, Hs, T = 1.25, 0.42, 1.95, 0.08
    box('Back', (W, 0.04, Hs), (0, 0.19, Hs / 2), M['caramel'], 0.015, g)
    for sx in (-1, 1): box('Side', (T, D, Hs), (sx * (W - T) / 2, 0, Hs / 2), M['caramel'], 0.03, g)
    box('TopBoard', (W, D, T), (0, 0, Hs - T / 2), M['caramel'], 0.03, g)
    rows = (0.04, 0.68, 1.3)
    for z in rows: box('Board', (W - 0.1, D - 0.04, 0.06), (0, 0, z + 0.03), M['caramel'], 0.02, g)
    colors = [M['orange'], M['red'], M['green'], M['blue'], M['yellow']]
    for i, z in enumerate(rows):
        x = -W / 2 + T + 0.04
        for k in range(3 + (i % 2)):
            bw, bh = 0.095, 0.4 + ((k + i) % 3) * 0.04
            pull = i == 1 and k == 1   # 마우스를 올리면 살짝 뽑히는 책: 따로 굽고 three.js가 움직인다
            box('PullBook' if pull else 'Book', (bw, 0.28, bh), (x + bw / 2, -0.02, z + 0.06 + bh / 2), colors[(k + i * 2) % 5], 0.022, g)
            box('PullPages' if pull else 'Pages', (bw - 0.03, 0.26, bh - 0.04), (x + bw / 2, -0.035, z + 0.06 + bh / 2), M['cream'], 0.01, g)
            x += bw + 0.01
        # 눕힌 책 더미
        for k in range(2):
            box('Stack', (0.3, 0.26, 0.075), (W / 2 - T - 0.2, -0.02, z + 0.1 + k * 0.08), M['caramel' if k else 'orange'], 0.025, g)
            box('StackPages', (0.27, 0.24, 0.05), (W / 2 - T - 0.2, -0.035, z + 0.1 + k * 0.08), M['cream'], 0.012, g)

def build_map(M):
    p = on_wall(MAP_A, R - 0.05)
    g = group('MapWall', (p.x, p.y, 0), rad(MAP_A) - math.pi / 2)
    W, Hm = 1.35, 0.9
    box('MapFrame', (W + 0.18, 0.08, Hm + 0.18), (0, 0, 1.75), M['frame'], 0.035, g)
    me = mesh_object('MapFace', [(-W / 2, -0.045, -Hm / 2), (W / 2, -0.045, -Hm / 2), (W / 2, -0.045, Hm / 2), (-W / 2, -0.045, Hm / 2)], [(0, 1, 2, 3)], mat=M['map'])
    me.data.uv_layers.new(name='UV')
    for loop, uv in zip(me.data.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): me.data.uv_layers[0].data[loop.index].uv = uv
    me.parent = g; me.location = (0, 0, 1.75)

def build_clock(M):
    p = on_wall(CLOCK_A, R - 0.05)
    g = group('Clock', (p.x, p.y, 2.45), rad(CLOCK_A) - math.pi / 2)
    cyl('ClockRim', 0.2, 0.06, (0, 0, 0), M['navy'], 48, g, rot=(math.pi / 2, 0, 0), round_=0.025)
    cyl('ClockFace', 0.16, 0.02, (0, -0.03, 0), M['white'], 48, g, rot=(math.pi / 2, 0, 0), round_=0.008)
    box('HandH', (0.018, 0.012, 0.09), (0.02, -0.045, 0.03), M['navy'], 0.005, g, rot=(0, rad(-40), 0))
    box('HandM', (0.014, 0.012, 0.13), (-0.03, -0.047, 0.04), M['navy'], 0.005, g, rot=(0, rad(35), 0))

def sconce(M, a, z):
    p = on_wall(a, R - 0.03)
    g = group('Sconce', (p.x, p.y, z), rad(a) - math.pi / 2)
    cyl('ScPlate', 0.06, 0.03, (0, 0, 0), M['gold'], 24, g, rot=(math.pi / 2, 0, 0))
    cyl('ScArm', 0.014, 0.16, (0, -0.08, 0.03), M['gold'], 12, g, rot=(rad(70), 0, 0), round_=0.0)
    sphere('ScGlobe', 0.075, (0, -0.16, -0.02), M['glow'], g)
    light = bpy.data.lights.new('ScLight', 'POINT'); light.energy = 30; light.color = (1.0, 0.8, 0.55); light.shadow_soft_size = 0.08
    lo = bpy.data.objects.new('ScLight', light); bpy.context.scene.collection.objects.link(lo); lo.parent = g; lo.location = (0, -0.16, -0.02)

def armchair(M, loc, rot):
    # 참고 이미지 소파처럼 두툼하고 말랑한 덩어리. 앞면 = 로컬 -Y.
    g = group('Armchair', loc, rot)
    box('ChairBase', (0.86, 0.8, 0.32), (0, 0, 0.26), M['tan'], 0.1, g)
    box('Cushion', (0.6, 0.62, 0.14), (0, -0.05, 0.47), M['tan'], 0.06, g)
    box('BackRest', (0.86, 0.22, 0.62), (0, 0.3, 0.66), M['tan'], 0.1, g)
    for sx in (-1, 1): box('Arm', (0.18, 0.78, 0.34), (sx * 0.36, 0, 0.5), M['tan'], 0.08, g)
    box('Pillow', (0.34, 0.12, 0.3), (0.12, 0.13, 0.66), M['mint'], 0.06, g, rot=(rad(-12), 0, rad(-10)))
    for sx in (-1, 1):
        for sy in (-1, 1): cyl('Foot', 0.04, 0.1, (sx * 0.32, sy * 0.3, 0.05), M['caramel'], 16, g)

def build_seats(M):
    tx, ty = TEA
    for cx, cy in SEATS:
        armchair(M, (cx, cy, 0), math.atan2(-(tx - cx), ty - cy) + math.pi)
    t = group('TeaTable', (tx, ty, 0), 0)
    cyl('TeaTop', 0.34, 0.07, (0, 0, 0.5), M['orange'], 48, t, round_=0.03)
    for k in range(3):
        a = k * 2 * math.pi / 3
        cyl('TeaLeg', 0.035, 0.46, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.23), M['orange'], 16, t, r2=0.03)
    cyl('Saucer', 0.07, 0.015, (-0.08, -0.05, 0.545), M['white'], 32, t)
    cyl('Cup', 0.042, 0.06, (-0.08, -0.05, 0.58), M['white'], 24, t, r2=0.05)
    cyl('Plate', 0.075, 0.015, (0.11, 0.08, 0.545), M['white'], 32, t)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.04, minor_radius=0.022, location=(tx + 0.11, ty + 0.08, 0.57), major_segments=24, minor_segments=12)
    d = bpy.context.active_object; d.data.materials.append(M['red'])
    for p_ in d.data.polygons: p_.use_smooth = True

def build_plant(M):
    p = on_wall(PLANT_A, R - 0.5)
    g = group('Plant', (p.x, p.y, 0), 0)
    cyl('StoolTop', 0.22, 0.06, (0, 0, 0.62), M['cream'], 40, g)
    for k in range(3):
        a = k * 2 * math.pi / 3
        cyl('StoolLeg', 0.025, 0.6, (math.cos(a) * 0.13, math.sin(a) * 0.13, 0.3), M['cream'], 12, g)
    cyl('Pot', 0.12, 0.18, (0, 0, 0.74), M['white'], 32, g, r2=0.14)
    for k in range(7):
        a = k * 2 * math.pi / 7
        cyl('Leaf', 0.03, 0.34, (math.cos(a) * 0.04, math.sin(a) * 0.04, 0.98), M['leaf'], 12, g, r2=0.004,
            rot=(-math.sin(a) * rad(18), math.cos(a) * rad(18), 0), round_=0.0)

def build_outside(M):
    sea = mesh_object('Sea', [(-300, -40, -9), (300, -40, -9), (300, 400, -9), (-300, 400, -9)], [(0, 1, 2, 3)], mat=M['sea'])
    moon = sphere('MoonBall', 5, (-28, 160, 46), M['moon'])
    return [sea, moon]

def build_lights(M):
    sc = bpy.context.scene
    world = bpy.data.worlds.new('Night'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.02, 0.04, 0.08, 1); bg.inputs['Strength'].default_value = 1.0
    # 방 안이 밝고 고르게: 천장 아래 넓은 따뜻한 면광 + 펜던트 + 앞쪽 보조광 + 창의 은은한 하늘빛
    top = bpy.data.lights.new('TopSoft', 'AREA'); top.shape = 'DISK'; top.size = 4.5; top.energy = 420; top.color = (1.0, 0.97, 0.92)
    to = bpy.data.objects.new('TopSoft', top); sc.collection.objects.link(to); to.location = (0, 0, H - 0.05)
    pend = bpy.data.lights.new('PendantL', 'POINT'); pend.energy = 70; pend.color = (1.0, 0.82, 0.6); pend.shadow_soft_size = 0.2
    po = bpy.data.objects.new('PendantL', pend); sc.collection.objects.link(po); po.location = (0, 0, H - 0.68)
    front = bpy.data.lights.new('FrontFill', 'AREA'); front.size = 3; front.energy = 160; front.color = (1.0, 0.98, 0.95)
    fo = bpy.data.objects.new('FrontFill', front); sc.collection.objects.link(fo); fo.location = (0, -3.2, 2.2)
    fo.rotation_euler = (Vector((0, 1.5, 1.0)) - fo.location).to_track_quat('-Z', 'Y').to_euler()
    for a in WINDOWS:
        p = on_wall(a, R - 0.08); p.z = 1.6
        sky = bpy.data.lights.new('WinSky', 'AREA'); sky.shape = 'RECTANGLE'; sky.size = WIN_W; sky.size_y = 1.8; sky.energy = 18; sky.color = (0.6, 0.72, 1.0)
        ko = bpy.data.objects.new('WinSky', sky); sc.collection.objects.link(ko); ko.location = p
        ko.rotation_euler = (Vector((0, 0, 1.2)) - p).to_track_quat('-Z', 'Y').to_euler()
    desk = bpy.data.lights.new('DeskLamp', 'POINT'); desk.energy = 22; desk.color = (1.0, 0.8, 0.55); desk.shadow_soft_size = 0.05
    do = bpy.data.objects.new('DeskLamp', desk); sc.collection.objects.link(do); do.location = (0.48, DESK_Y + 0.12, 1.1)
    sconce(M, MAP_A - 14, 2.0)
    sconce(M, SHELF_A + 14, 2.0)

def setup_render(samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception:
        sc.cycles.device = 'CPU'
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8; sc.cycles.sample_clamp_indirect = 4
    # 색이 바래지 않게 Standard로 굽고(three.js에서 다시 톤 보정), 노출을 낮춘다.
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = -1.25

# 벽과 천장(shell), 바닥(floor), 가구(props)를 따로 굽는다.
SHELL = ('Wall', 'Base', 'Frame', 'Transom', 'Sill', 'Ceiling', 'Crown')

def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials()
    build_room(M); build_desk(M); build_desk_chair(M); build_shelf(M); build_map(M); build_clock(M)
    build_seats(M); build_plant(M)
    outside = build_outside(M); build_lights(M)
    return M, outside

def add_camera():
    sc = bpy.context.scene
    (px, py, pz), (tx, ty, tz), fov = CAM
    cam = bpy.data.cameras.new('Cam'); cam.sensor_fit = 'VERTICAL'; cam.angle = rad(fov)
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
    pos, target = Vector((px, py, pz)), Vector((tx, ty, tz))
    co.location = pos; co.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()

def preview(path, samples):
    setup_render(samples); add_camera()
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)

def flatten(obs, name):
    """모디파이어를 적용하고 부모를 풀어 한 물체로 합친다."""
    for ob in obs:
        mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob

def uv_unwrap(ob, margin):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=rad(60), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')

def bake(ob, size, samples, out_png):
    setup_render(samples)
    sc = bpy.context.scene; sc.cycles.use_denoising = False; sc.render.bake.margin = 8
    img = bpy.data.images.new(ob.name + 'Bake', size, size, float_buffer=True)
    for slot in ob.material_slots:
        if not slot.material: continue
        nt = slot.material.node_tree
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img
        for other in nt.nodes: other.select = False
        n.select = True; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='COMBINED')
    exr = out_png[:-4] + '.exr'
    img.filepath_raw = exr; img.file_format = 'OPEN_EXR'; img.save()
    return denoise(exr, out_png, size)

def denoise(exr, out_png, size):
    """구운 그림의 잡티를 OIDN으로 지운다(igloo_room.py와 같은 방식)."""
    sc = bpy.context.scene
    hidden = [ob for ob in sc.objects if not ob.hide_render]
    for ob in hidden: ob.hide_render = True
    if not sc.camera: add_camera()
    sc.cycles.samples = 1
    sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.new('Denoise', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    src = ng.nodes.new('CompositorNodeImage'); src.image = bpy.data.images.load(exr)
    dn = ng.nodes.new('CompositorNodeDenoise'); out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(src.outputs['Image'], dn.inputs['Image']); ng.links.new(dn.outputs['Image'], out.inputs[0])
    sc.compositing_node_group = ng
    bpy.ops.render.render()
    bpy.data.images['Render Result'].save_render(out_png, scene=sc)
    for ob in hidden: ob.hide_render = False
    return out_png

def main():
    M, outside = build_scene()
    if ARGS[0] == 'preview':
        preview(ARGS[1], int(ARGS[2]) if len(ARGS) > 2 else 128); return
    tmp = os.path.abspath(ARGS[1]); os.makedirs(tmp, exist_ok=True)
    # 바깥(바다·달)은 three.js가 그리므로 굽는 빛에서 뺀다. 창유리는 굽지 않고 three.js에서 투명하게 그린다.
    for ob in outside: bpy.data.objects.remove(ob)
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    pane_obs = [ob for ob in meshes if ob.data.materials and ob.data.materials[0] == M['winglass']]
    floor = [ob for ob in meshes if ob.name.split('.')[0] in ('Floor', 'Rug')]
    shell = [ob for ob in meshes if ob not in pane_obs and ob not in floor and ob.name.split('.')[0] in SHELL]
    # 벽 액자 그림 면은 three.js가 캔버스로 그리므로 굽지 않고 자체 UV를 지닌 채 내보낸다.
    mapface = [ob for ob in meshes if ob.name.startswith('MapFace')]
    book = [ob for ob in meshes if ob.name.startswith('Pull')]
    props = [ob for ob in meshes if ob not in pane_obs and ob not in floor and ob not in shell and ob not in mapface and ob not in book]
    panes = flatten(pane_obs, 'LhPanes')
    shell, floor, props = flatten(shell, 'LhShell'), flatten(floor, 'LhFloor'), flatten(props, 'LhProps')
    mapface = flatten(mapface, 'LhMap')
    book = flatten(book, 'LhBook')
    panes.hide_render = True
    uv_unwrap(shell, 0.002); uv_unwrap(floor, 0.004); uv_unwrap(props, 0.002); uv_unwrap(book, 0.01)
    q = int(os.environ.get('SAMPLES', 384))
    bake(shell, 4096, q, os.path.join(tmp, 'shell.png'))
    bake(floor, 2048, q, os.path.join(tmp, 'floor.png'))
    bake(props, 4096, q, os.path.join(tmp, 'props.png'))
    bake(book, 512, q, os.path.join(tmp, 'book.png'))
    panes.hide_render = False
    bpy.ops.object.select_all(action='DESELECT')
    for ob in (shell, floor, props, panes, mapface, book): ob.select_set(True)
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'lighthouse-room.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='NONE', export_attributes=False, export_yup=True)
    print('EXPORTED', out)

main()
