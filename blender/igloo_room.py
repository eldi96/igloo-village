# 이글루 내부 벽·바닥을 Blender에서 만들고 빛을 구워 assets/igloo-room.glb로 내보낸다.
# 실행: blender -b -P blender/igloo_room.py -- preview <png>   (빛을 넣은 장면 미리보기)
#       blender -b -P blender/igloo_room.py -- bake <폴더>     (빛 굽기 + GLB 내보내기, 그림은 blender/encode_textures.sh로 KTX2 압축)
# 미리보기 시점: preview <png> [close|window|ceiling]
# 좌표: three.js (x, y, z) = Blender (x, -y, z)를 바꿔 쓴다. 즉 Blender (X, Y, Z) = three (x, -z, y).
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['preview']
MODE = ARGS[0]

# room.js와 같은 값
DOME_R = 9.0
ROOM_YAW = 3.5
# 들어오면 보이는 정면(three.js 각도). 정면 줄에 대표작 액자 3개가 걸릴 블록을 맞춰 둔다.
FRONT_A = ROOM_YAW - math.pi
# 창문은 정면에서 오른쪽으로 옮긴다.
WIN_A, WIN_W, WIN_LOW, WIN_HIGH = FRONT_A + 1.05, 0.24, 0.12, 0.62
WINDOW_PHI = math.pi - WIN_A
RUG_R = 2.1   # 털 러그
# 입구: 시작 시점 바로 뒤 벽(three 각도), 반폭, 높이(room.js와 같게)
ENTRY_A, ENTRY_HALF, ENTRY_B = 3.6, 2.0, 4.2   # 구멍 반폭·높이, 둘레 블록 아치 두께는 0.6m
# 왼쪽 벽 앞 얼음 받침대: 방 가운데 기준 각도·거리, 가로·깊이·높이(room.js 충돌과 같게)
BENCH_A, BENCH_R, BENCH_W, BENCH_D, BENCH_H = FRONT_A - 0.66, DOME_R - 2.3, 7.2, 1.7, 1.3
# 반타원(아치) 창: 아래는 평평한 창턱, 위는 반타원. 창 아래 가운데 점의 높이각과 반폭·높이(room.js와 같게)
ARCH_BASE_E, ARCH_A, ARCH_B, ARCH_F = 0.17, 1.6, 2.4, 0.1

def three_to_blender(x, y, z):
    return Vector((x, -z, y))

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh_object(name, verts, faces, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

# ---------- 재질 ----------
def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']

def bump_chain(nt, bsdf, scale_strengths):
    """노이즈 여러 겹을 이어서 표면 요철을 만든다."""
    prev = None
    for scale, strength, detail in scale_strengths:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = detail
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        if prev:
            nt.links.new(prev.outputs['Normal'], bump.inputs['Normal'])
        prev = bump
    nt.links.new(prev.outputs['Normal'], bsdf.inputs['Normal'])

def ice_material():
    # 참고 이미지의 얼음 벽돌: 밝은 하늘빛 흰 얼음에 뿌연 서리 얼룩, 반쯤 윤기, 빛이 살짝 스며든다.
    m, nt, b = node_mat('IceBrick')
    attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'Col'
    tint = nt.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['A'].default_value = (0.68, 0.81, 0.97, 1)
    nt.links.new(attr.outputs['Color'], tint.inputs['B'])
    vein_tex = nt.nodes.new('ShaderNodeTexNoise')
    vein_tex.inputs['Scale'].default_value = 2.2
    vein_tex.inputs['Detail'].default_value = 4
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.42, (0, 0, 0, 1)
    e[1].position, e[1].color = 0.68, (0.6, 0.6, 0.6, 1)
    nt.links.new(vein_tex.outputs['Fac'], ramp.inputs['Fac'])
    veins = nt.nodes.new('ShaderNodeMix'); veins.data_type = 'RGBA'
    veins.inputs['B'].default_value = (0.97, 0.98, 1.0, 1)
    nt.links.new(ramp.outputs['Color'], veins.inputs['Factor'])
    nt.links.new(tint.outputs['Result'], veins.inputs['A'])
    nt.links.new(veins.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.45
    b.inputs['Subsurface Weight'].default_value = 0.35
    b.inputs['Subsurface Radius'].default_value = (0.5, 0.75, 1.0)
    b.inputs['Subsurface Scale'].default_value = 0.2
    bump_chain(nt, b, [(1.2, 0.12, 4), (9.0, 0.05, 2)])
    return m

def wood_material():
    # 따뜻한 원목 마루: 판자 줄, 판자마다 다른 색, 나뭇결.
    m, nt, b = node_mat('Wood')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.inputs['Scale'].default_value = 0.22
    brick.inputs['Mortar Size'].default_value = 0.006
    brick.inputs['Brick Width'].default_value = 2.4
    brick.inputs['Row Height'].default_value = 0.32
    brick.inputs['Color1'].default_value = (0.42, 0.22, 0.10, 1)
    brick.inputs['Color2'].default_value = (0.52, 0.30, 0.14, 1)
    brick.inputs['Mortar'].default_value = (0.16, 0.08, 0.04, 1)
    brick.offset = 0.37
    nt.links.new(coord.outputs['Object'], brick.inputs['Vector'])
    grain = nt.nodes.new('ShaderNodeTexWave'); grain.wave_type = 'BANDS'; grain.bands_direction = 'X'
    grain.inputs['Scale'].default_value = 1.2; grain.inputs['Distortion'].default_value = 6.0; grain.inputs['Detail'].default_value = 3
    nt.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.12
    nt.links.new(brick.outputs['Color'], mix.inputs['A']); nt.links.new(grain.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.55
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.3; bump.invert = True
    nt.links.new(brick.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

def rug_material():
    m, nt, b = node_mat('Rug')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
    scale = nt.nodes.new('ShaderNodeMapping'); scale.inputs['Scale'].default_value = (1 / RUG_R, 1 / RUG_R, 1 / RUG_R)
    nt.links.new(coord.outputs['Object'], scale.inputs['Vector'])
    nt.links.new(scale.outputs['Vector'], grad.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, (0.30, 0.22, 0.17, 1)
    e[1].position, e[1].color = 0.06, (0.46, 0.36, 0.28, 1)
    for pos, col in [(0.55, (0.50, 0.40, 0.31, 1)), (0.6, (0.40, 0.31, 0.24, 1)), (0.65, (0.50, 0.40, 0.31, 1)), (1.0, (0.56, 0.45, 0.35, 1))]:
        el = e.new(pos); el.color = col
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.95
    b.inputs['Sheen Weight'].default_value = 1.0
    b.inputs['Sheen Tint'].default_value = (1.0, 0.95, 0.88, 1)
    bump_chain(nt, b, [(180.0, 0.35, 2), (25.0, 0.15, 2)])
    return m

# ---------- 돔: 크고 각진 로우폴리 얼음 블록 ----------
def build_dome(mat):
    # 귀여운 이글루: 큰 블록을 적게 쌓고, 평평한 앞면 + 비스듬히 깎은 모서리로 각진 면이 보이게 한다.
    # 창 위아래(0.12, 0.62)는 줄 경계와 맞춘다.
    ROWS = [0, 0.12, 0.37, 0.62, 0.9, 1.17, 1.38]
    DEPTH, CHAMFER, WIDTH = 0.42, 0.38, 3.0
    rng = random.Random(5)
    verts, faces, cols = [], [], []

    def at(a, e, r):
        return three_to_blender(r * math.cos(e) * math.cos(a), r * math.sin(e), r * math.cos(e) * math.sin(a))

    def samples(length, c):
        # 가장자리를 0.3m 간격으로 촘촘히 나눠, 위아래 줄 블록의 이음선이 틈 없이 맞물리게 한다.
        n = max(2, math.ceil(length / 0.3))
        return sorted(set([0.0, c, 1 - c, 1.0] + [i / n for i in range(1, n)]))

    def block(a0, a1, e0, e1):
        em = (e0 + e1) / 2
        wlen = (a1 - a0) * DOME_R * max(0.05, math.cos(em)); hlen = (e1 - e0) * DOME_R
        cu, cv = min(0.3, CHAMFER / wlen), min(0.3, CHAMFER / hlen)
        us, vs = samples(wlen, cu), samples(hlen, cv)
        tone = rng.random()
        tilt_u, tilt_v = (rng.random() - 0.5) * 0.1, (rng.random() - 0.5) * 0.08
        c = (0.90 + tone * 0.12, 0.93 + tone * 0.08, 1.0)
        base = len(verts)
        for v in vs:
            for u in us:
                # 앞면은 블록마다 조금 기울어진 평면, 가장자리 CHAMFER 폭은 비스듬히 깎여 DEPTH만큼 들어간다.
                d = min(u * wlen, (1 - u) * wlen, v * hlen, (1 - v) * hlen)
                k = max(0.0, 1 - d / CHAMFER)
                face = DOME_R + tilt_u * (u - 0.5) + tilt_v * (v - 0.5)
                verts.append(at(a0 + (a1 - a0) * u, e0 + (e1 - e0) * v, face + (DOME_R + DEPTH - face) * k)); cols.append(c)
        for j in range(len(vs) - 1):
            for i in range(len(us) - 1):
                k = base + j * len(us) + i
                faces.append((k, k + 1, k + len(us) + 1, k + len(us)))

    for r in range(len(ROWS) - 1):
        e0, e1 = ROWS[r], ROWS[r + 1]
        em = (e0 + e1) / 2
        n = max(4, round(2 * math.pi * DOME_R * math.cos(em) / WIDTH))
        shift = (r % 2) * 0.5
        for i in range(n):
            block((i + shift) / n * 2 * math.pi, (i + 1 + shift) / n * 2 * math.pi, e0, e1)

    # 꼭대기 마개: 둘레를 깎은 각진 뚜껑
    e0 = ROWS[-1]
    SEGS = max(10, math.ceil(2 * math.pi * DOME_R * math.cos(e0) / 0.3))   # 아래 줄과 틈 없이 맞물리게 촘촘히
    ring_e = [e0, e0 + CHAMFER / DOME_R]
    base = len(verts)
    for j, e in enumerate(ring_e):
        for i in range(SEGS):
            verts.append(at(i / SEGS * 2 * math.pi, e, DOME_R + (DEPTH if j == 0 else 0))); cols.append((0.95, 0.97, 1.0))
    verts.append(at(0, math.pi / 2, DOME_R - 0.05)); cols.append((0.95, 0.97, 1.0))
    pole = len(verts) - 1
    for i in range(SEGS):
        a, b = base + i, base + (i + 1) % SEGS
        faces.append((a, b, b + SEGS, a + SEGS))
        faces.append((a + SEGS, b + SEGS, pole))

    # 창 자리: 벽돌을 그대로 쌓고 팔각 창 둘레의 면만 걷어 낸다(가장자리는 얼음 틀과 뒤 얼음 벽이 가린다).
    # 블록 뒤에 얼음 벽을 한 겹 더 둘러, 위쪽 큰 블록 사이 틈으로 바깥이 비치지 않게 한다(창 자리는 비움).
    AZ, EL = 160, 40
    base = len(verts)
    for j in range(EL + 1):
        e = j / EL * math.pi / 2
        for i in range(AZ):
            verts.append(at(i / AZ * 2 * math.pi, e, DOME_R + DEPTH + 0.04)); cols.append((0.80, 0.86, 0.95))
    for j in range(EL):
        for i in range(AZ):
            a0, e0 = (i + 0.5) / AZ * 2 * math.pi, (j + 0.5) / EL * math.pi / 2
            k, k2 = base + j * AZ + i, base + j * AZ + (i + 1) % AZ
            faces.append((k, k2, k2 + AZ, k + AZ))

    ob = mesh_object('IglooDome', verts, faces)
    me = ob.data
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols):
        attr.data[i].color = (*c, 1)
    # 모서리 홈이 각지게 보이도록 블록 경계는 날카롭게 둔다.
    me.materials.append(mat)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me); bm.free()
    # 로우폴리: 면마다 각지게 보이도록 평면 음영
    for p in me.polygons:
        p.use_smooth = False
    return ob

# ---------- 바닥: 눈 바닥 + 벽 밑 눈 둔덕 + 러그 ----------
def build_floor(rug, wood):
    bpy.ops.mesh.primitive_circle_add(vertices=160, radius=DOME_R + 0.4, fill_type='NGON')
    floor = bpy.context.active_object; floor.name = 'IglooFloor'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.poke()
    bpy.ops.mesh.subdivide(number_cuts=3)
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in floor.data.vertices:
        p = v.co
        v.co.z = 0.02 * noise.noise(Vector((p.x * 0.4, p.y * 0.4, 0)))
    floor.data.materials.append(wood)
    parts = [floor]

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=RUG_R, depth=0.02, location=(0, 0, 0.012))
    rugob = bpy.context.active_object
    for v in rugob.data.vertices:   # 가장자리를 들쭉날쭉하게 해 가죽 러그 느낌
        if v.co.xy.length > RUG_R * 0.9:
            k = 1 + (random.Random(int(v.co.x * 1000)).random() - 0.5) * 0.12
            v.co.x *= k; v.co.y *= k
    rugob.data.materials.append(rug)

    parts.append(rugob)
    for ob in parts[1:]:
        for p in ob.data.polygons: p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = floor
    bpy.ops.object.join()
    return floor

def build_bench(ice):
    """낮고 넓은 얼음 받침대: 모서리는 직각, 꼭짓점은 살짝 어긋나게, 윗면은 평평하게."""
    x, z = math.cos(BENCH_A) * BENCH_R, math.sin(BENCH_A) * BENCH_R
    bpy.ops.mesh.primitive_cube_add(size=1, location=three_to_blender(x, BENCH_H / 2, z))
    ob = bpy.context.active_object; ob.name = 'IceBench'
    ob.scale = (BENCH_D, BENCH_W, BENCH_H)                  # 지역 X = 벽 쪽(깊이), Y = 벽을 따라(가로)
    ob.rotation_euler = (0, 0, -BENCH_A)                   # three 각도 → Blender Z 회전(부호 반대)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    rng = random.Random(21)
    for v in ob.data.vertices:
        v.co += Vector(((rng.random() - 0.5) * 0.03, (rng.random() - 0.5) * 0.03, 0))   # 윗면은 평평하게(물건을 올릴 자리)
    ob.data.materials.append(ice)
    attr = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for d in attr.data: d.color = (0.98, 0.99, 1.0, 1)
    for p in ob.data.polygons: p.use_smooth = False
    return ob

def arch_frame(angle=None, base_e=None, height=None, upright=False):
    """아치 구멍의 기준점과 방향: 원점은 아래 가운데, x=벽을 따라 오른쪽, y=위, z=방 안쪽.
    기본값은 창. upright=True면 똑바로 세운다(바닥에서 시작하는 입구 굴)."""
    angle = WIN_A if angle is None else angle
    base_e = ARCH_BASE_E if base_e is None else base_e
    height = ARCH_B if height is None else height
    def r(e): return three_to_blender(math.cos(e) * math.cos(angle), math.sin(e), math.cos(e) * math.sin(angle)).normalized()
    # 창은 벽 기울기(가운데 높이)에 맞춰 눕혀, 위쪽 벽돌이 틀 앞으로 튀어나오지 않게 한다.
    mid = r(0.0) if upright else r(base_e + height / 2 / DOME_R)
    tangent = Vector((0, 0, 1)).cross(mid).normalized()
    up = mid.cross(tangent).normalized()
    return r(base_e) * DOME_R, tangent, up, -mid

def arch_outline(a, b, seg=24):
    return [(-a, 0.0)] + [(a * math.cos(math.pi - math.pi * i / seg), b * math.sin(math.pi * i / seg)) for i in range(seg + 1)] + [(a, 0.0)]

def arch_prism(name, outline, z0, z1, frame=None):
    """윤곽을 아치 방향으로 밀어낸 닫힌 기둥."""
    origin, tx, ty, tz = frame or arch_frame()
    P = lambda x, y, z: origin + tx * x + ty * y + tz * z
    n = len(outline)
    verts = [P(x, y, z0) for x, y in outline] + [P(x, y, z1) for x, y in outline]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh_object(name, verts, faces, smooth=False)

def boolean(ob, cutter, op='DIFFERENCE'):
    md = ob.modifiers.new('b', 'BOOLEAN'); md.object = cutter; md.operation = op
    md.solver = 'EXACT'; md.use_hole_tolerant = True
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='b')
    bpy.data.objects.remove(cutter)

def ice_part(ob, ice):
    if not ob.data.materials: ob.data.materials.append(ice)
    attr = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for d in attr.data: d.color = (0.97, 0.98, 1.0, 1)
    return ob

def cut_arch_window(dome, ice):
    """벽돌과 뒤 얼음 벽을 아치 모양으로 깔끔하게 잘라 내고, 잘린 면 안쪽에 얇은 얼음 테두리를 두른다."""
    cutter = arch_prism('ArchCutter', arch_outline(ARCH_A, ARCH_B), -1.2, 1.2)
    cutter.data.materials.append(ice)   # 잘린 면도 얼음 재질을 받게
    boolean(dome, cutter)
    outer = arch_prism('ArchRim', arch_outline(ARCH_A + ARCH_F, ARCH_B + ARCH_F), -0.6, 0.06)
    outer.data.materials.append(ice)
    inner = arch_prism('ArchRimHole', arch_outline(ARCH_A, ARCH_B), -1.0, 1.0)
    inner.data.materials.append(ice)
    boolean(outer, inner)
    return ice_part(outer, ice)

def door_outline(half, height, seg=16):
    """세워진 벽(아래 직선) 위에 반타원 지붕을 얹은 입구 윤곽(아래 중앙이 원점)."""
    side = height * 0.38
    top = height - side
    pts = [(-half, 0.0), (-half, side)]
    pts += [(half * math.cos(math.pi - math.pi * i / seg), side + top * math.sin(math.pi * i / seg)) for i in range(1, seg)]
    pts += [(half, side), (half, 0.0)]
    return pts

def build_entrance(dome, ice):
    """시작 시점 바로 뒤 벽에 크게 뚫린 입구: 둘레를 얼음 블록이 부채꼴로 감싸고, 바깥으로 짧은 굴이 이어진다."""
    frame = arch_frame(ENTRY_A, 0.0, ENTRY_B, upright=True)
    origin, tx, ty, tz = frame
    T = 0.6
    inner = door_outline(ENTRY_HALF, ENTRY_B)
    outer = door_outline(ENTRY_HALF + T, ENTRY_B + T)
    cutter = arch_prism('EntryCutter', door_outline(ENTRY_HALF + 0.05, ENTRY_B + 0.05), -4.0, 3.0, frame)
    cutter.data.materials.append(ice)
    boolean(dome, cutter)
    parts = []
    # 둘레 블록: 안쪽·바깥 윤곽 사이를 여러 조각으로 나누고, 조각 사이를 살짝 띄워 블록처럼 보이게 한다.
    P = lambda x, y, z: origin + tx * x + ty * y + tz * z
    n = len(inner)
    cuts = [0, 2, 4, 6, 8, 10, 12, 14, 16, n - 1]
    rng = random.Random(31)
    for k in range(len(cuts) - 1):
        i0, i1 = cuts[k], cuts[k + 1]
        ring = inner[i0:i1 + 1] + outer[i0:i1 + 1][::-1]
        # 조각 가운데 쪽으로 2cm씩 줄여 이음 틈을 만든다
        cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
        ring = [(cx + (x - cx) * 0.97, cy + (y - cy) * 0.97) for x, y in ring]
        depth = 1.5 + rng.random() * 0.15
        m = len(ring)
        verts = [P(x, y, -0.6) for x, y in ring] + [P(x, y, depth) for x, y in ring]
        faces = [tuple(range(m))[::-1], tuple(range(m, 2 * m))] + [(j, (j + 1) % m, m + (j + 1) % m, m + j) for j in range(m)]
        blk = mesh_object(f'EntryBlock{k}', verts, faces, smooth=False)
        blk.data.materials.append(ice)
        md = blk.modifiers.new('b', 'BEVEL'); md.width = 0.06; md.segments = 1
        bpy.context.view_layer.objects.active = blk; bpy.ops.object.modifier_apply(modifier='b')
        parts.append(ice_part(blk, ice))
    # 바깥으로 이어지는 굴과 굴 바닥
    shell = arch_prism('Tunnel', outer, -4.0, -0.6, frame); shell.data.materials.append(ice)
    hole = arch_prism('TunnelHole', inner, -5.0, 1.0, frame); hole.data.materials.append(ice)
    boolean(shell, hole)
    floor = arch_prism('TunnelFloor', [(-ENTRY_HALF - T, -0.12), (ENTRY_HALF + T, -0.12), (ENTRY_HALF + T, 0.0), (-ENTRY_HALF - T, 0.0)], -4.0, 0.0, frame)
    floor.data.materials.append(ice)
    return parts + [ice_part(shell, ice), ice_part(floor, ice)] + build_door(frame), frame

def build_door(frame):
    """입구를 막은 나무 문: 넓은 판자 4장(판자마다 색·두께가 조금 다르고 모서리를 깎음), 징이 박힌 쇠띠, 받침판 달린 고리 손잡이."""
    def wood_mat(name, tone):
        m, nt, b = node_mat(name)
        base = (0.40 * tone, 0.22 * tone, 0.11 * tone, 1)
        coord = nt.nodes.new('ShaderNodeTexCoord')
        # 세로로 길게 흐르는 나뭇결: 가로로는 촘촘하고 세로로는 길게 늘인 노이즈
        grain = nt.nodes.new('ShaderNodeTexNoise')
        grain.inputs['Scale'].default_value = 3.0; grain.inputs['Detail'].default_value = 6; grain.inputs['Roughness'].default_value = 0.6
        mapping = nt.nodes.new('ShaderNodeMapping'); mapping.inputs['Scale'].default_value = (9.0, 9.0, 0.35)
        nt.links.new(coord.outputs['Object'], mapping.inputs['Vector']); nt.links.new(mapping.outputs['Vector'], grain.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        # 결 대비를 낮게: 작은 면적에 굽힌 그림이 압축되면서 얼룩져 보이지 않게
        ramp.color_ramp.elements[0].color = (base[0] * 0.9, base[1] * 0.9, base[2] * 0.9, 1)
        ramp.color_ramp.elements[1].color = (base[0] * 1.08, base[1] * 1.06, base[2] * 1.05, 1)
        nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.75
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
        nt.links.new(grain.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        return m
    iron, _, ib = node_mat('DoorIron'); ib.inputs['Base Color'].default_value = (0.07, 0.07, 0.08, 1)
    ib.inputs['Metallic'].default_value = 0.85; ib.inputs['Roughness'].default_value = 0.4
    origin, tx, ty, tz = frame
    P = lambda x, y, z: origin + tx * x + ty * y + tz * z
    HALF, H = ENTRY_HALF + 0.04, ENTRY_B + 0.04
    Z0, Z1 = -0.66, -0.46   # 둘레 블록 바로 뒤에 끼운다
    rng = random.Random(7)
    parts = []
    def prism(name, pts, z0, z1, mat, bevel=0.0):
        m = len(pts)
        verts = [P(x, y, z0) for x, y in pts] + [P(x, y, z1) for x, y in pts]
        faces = [tuple(range(m))[::-1], tuple(range(m, 2 * m))] + [(j, (j + 1) % m, m + (j + 1) % m, m + j) for j in range(m)]
        ob = mesh_object(name, verts, faces, smooth=False); ob.data.materials.append(mat)
        if bevel:
            md = ob.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 2; md.limit_method = 'ANGLE'
            bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='b')
        return ob
    def top_at(x):
        side = H * 0.38; top = H - side
        return side + top * math.sqrt(max(0.0, 1 - (x / HALF) ** 2))
    PLANKS, GAP = 4, 0.035
    w = 2 * HALF / PLANKS
    for k in range(PLANKS):
        x0 = -HALF + k * w + GAP / 2; x1 = x0 + w - GAP
        xs = [x0 + (x1 - x0) * i / 8 for i in range(9)]
        pts = [(x0, 0.0), (x1, 0.0)] + [(x, top_at(x)) for x in reversed(xs)]
        parts.append(prism(f'DoorPlank{k}', pts, Z0 + rng.random() * 0.03, Z1 + rng.random() * 0.02, wood_mat(f'DoorWood{k}', 0.85 + rng.random() * 0.3), 0.03))
    # 판자 뒤에 어두운 나무 판을 한 장 대서, 판자 사이 틈으로 굴 안쪽 얼음이 비치지 않게 한다.
    back = [(-HALF, 0.0), (HALF, 0.0)] + [(x, top_at(x)) for x in [HALF - 2 * HALF * i / 32 for i in range(33)]]
    parts.append(prism('DoorBack', back, Z0 - 0.08, Z0 - 0.02, wood_mat('DoorBackWood', 0.35)))
    # 징이 박힌 가로 쇠띠 두 줄
    for y in (0.7, H * 0.6):
        parts.append(prism('DoorBand', [(-HALF + 0.05, y), (HALF - 0.05, y), (HALF - 0.05, y + 0.16), (-HALF + 0.05, y + 0.16)], Z1, Z1 + 0.035, iron, 0.01))
        for k in range(PLANKS):
            for dx in (0.25, 0.75):
                x = -HALF + (k + dx) * w
                bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=0.035, location=P(x, y + 0.08, Z1 + 0.04))
                rv = bpy.context.active_object; rv.scale = (1, 1, 0.6); rv.data.materials.append(iron); parts.append(rv)
    # 손잡이: 둥근 받침판 + 큰 고리
    hx, hy = HALF * 0.5, H * 0.4
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.11, depth=0.04, location=P(hx, hy, Z1 + 0.04))
    plate = bpy.context.active_object; plate.rotation_euler = tz.to_track_quat('Z', 'Y').to_euler(); plate.data.materials.append(iron)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.03, major_segments=20, minor_segments=8, location=P(hx, hy - 0.16, Z1 + 0.09))
    ring = bpy.context.active_object; ring.rotation_euler = tz.to_track_quat('Z', 'Y').to_euler(); ring.data.materials.append(iron)
    parts += [plate, ring]
    for ob in parts:
        attr = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for d in attr.data: d.color = (1, 1, 1, 1)
    return parts

# ---------- 빛 ----------
def build_lights():
    sc = bpy.context.scene
    world = bpy.data.worlds.new('Night'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.012, 0.025, 0.05, 1); bg.inputs['Strength'].default_value = 1.0

    to_window = Vector((-math.cos(WINDOW_PHI), 0, math.sin(WINDOW_PHI)))
    moon = three_to_blender(to_window.x * 150, 60, to_window.z * 150).normalized()
    sun = bpy.data.lights.new('Moon', 'SUN'); sun.energy = 1.5; sun.color = (0.68, 0.80, 1.0); sun.angle = math.radians(4)
    so = bpy.data.objects.new('Moon', sun); sc.collection.objects.link(so)
    so.rotation_euler = (-moon).to_track_quat('-Z', 'Y').to_euler()

    # 창으로 들어오는 하늘빛
    em = (WIN_LOW + WIN_HIGH) / 2
    wc = three_to_blender((DOME_R - 0.3) * math.cos(em) * math.cos(WIN_A), (DOME_R - 0.3) * math.sin(em), (DOME_R - 0.3) * math.cos(em) * math.sin(WIN_A))
    sky = bpy.data.lights.new('WindowSky', 'AREA'); sky.shape = 'RECTANGLE'; sky.size = 4.8; sky.size_y = 5.2
    sky.energy = 350; sky.color = (0.55, 0.70, 1.0)
    ko = bpy.data.objects.new('WindowSky', sky); sc.collection.objects.link(ko); ko.location = wc
    ko.rotation_euler = (Vector((0, 0, 3)) - wc).to_track_quat('-Z', 'Y').to_euler()

    # 참고 이미지처럼 방 안이 따뜻하게 밝도록 천장 아래에 넓고 은은한 주황빛을 둔다.
    warm = bpy.data.lights.new('WarmFill', 'POINT'); warm.energy = 250; warm.color = (1.0, 0.93, 0.86); warm.shadow_soft_size = 2.5
    wo = bpy.data.objects.new('WarmFill', warm); sc.collection.objects.link(wo); wo.location = (0, 0, 5.0)

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
    sc.cycles.samples = samples
    sc.cycles.max_bounces = 8
    sc.cycles.sample_clamp_indirect = 4
    sc.view_settings.view_transform = 'AgX'
    # 기본 AgX는 대비를 많이 눌러 뿌옇게 보이므로 대비를 높인 룩을 쓴다.
    for look in ('AgX - Medium High Contrast', 'AgX - Punchy', 'None'):
        try:
            sc.view_settings.look = look; break
        except TypeError:
            continue
    sc.view_settings.exposure = 0.1

def build_scene():
    reset()
    ice, rug = ice_material(), rug_material()
    dome = build_dome(ice)
    entry_parts, _ = build_entrance(dome, ice)
    parts = [cut_arch_window(dome, ice), build_bench(ice)] + entry_parts
    # 직접 만든 닫힌 물체들은 면이 바깥을 보게 바로잡는다(뒤집히면 벽 바깥 어둠을 받아 검게 구워진다).
    for ob in parts:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data); bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts + [dome]: ob.select_set(True)
    bpy.context.view_layer.objects.active = dome
    bpy.ops.object.join()
    floor = build_floor(rug, wood_material())
    build_lights()
    return dome, floor

def preview(path):
    setup_render(96)
    sc = bpy.context.scene
    sc.cycles.use_denoising = True
    cam = bpy.data.cameras.new('Cam'); cam.sensor_fit = 'VERTICAL'; cam.angle = math.radians(50)
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
    # room.js START와 같은 시작 시점
    sx, sy, sz, yaw, pitch = -5.69, 5.77, -2.88, -2.012, -0.33
    pos = three_to_blender(sx, sy, sz)
    fwd = three_to_blender(-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
    target = pos + fwd
    if len(ARGS) > 2 and ARGS[2] == 'entry':  # 입구를 바라보는 시점
        pos = three_to_blender(-math.cos(ENTRY_A) * 3, 3.0, -math.sin(ENTRY_A) * 3)
        target = three_to_blender(math.cos(ENTRY_A) * DOME_R, 2.4, math.sin(ENTRY_A) * DOME_R)
    if len(ARGS) > 2 and ARGS[2] == 'ceiling':  # 천장 이음새 확인
        pos, target = Vector((0, 0, 1.6)), Vector((2.0, 0.5, 9.0))
    if len(ARGS) > 2 and ARGS[2] == 'window':  # 창을 정면으로 보는 시점
        pos = three_to_blender(-math.cos(WIN_A) * 3.5, 2.4, -math.sin(WIN_A) * 3.5)
        target = three_to_blender(math.cos(WIN_A) * DOME_R, 2.8, math.sin(WIN_A) * DOME_R)
    if len(ARGS) > 2 and ARGS[2] == 'close':  # 벽 가까이에서 이음새를 확인하는 시점
        pos, target = three_to_blender(-2, 2.0, 1.0), three_to_blender(-7, 3.5, -2.5)
    co.location = pos
    co.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = 1280, 640
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def uv_unwrap(ob, margin):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')

def bake(ob, size, samples, out_png):
    setup_render(samples)
    sc = bpy.context.scene
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 12
    img = bpy.data.images.new(ob.name + 'Bake', size, size, float_buffer=True)
    for slot in ob.material_slots:
        if not slot.material:
            continue
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
    """구운 그림의 잡티를 OIDN으로 지운다. 합성 결과만 쓰도록 모든 물체를 렌더에서 숨긴다."""
    sc = bpy.context.scene
    hidden = [ob for ob in sc.objects if not ob.hide_render]
    for ob in hidden: ob.hide_render = True
    if not sc.camera:
        cam = bpy.data.objects.new('DenoiseCam', bpy.data.cameras.new('DenoiseCam'))
        sc.collection.objects.link(cam); sc.camera = cam
    sc.cycles.samples = 1
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.new('Denoise', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    src = ng.nodes.new('CompositorNodeImage'); src.image = bpy.data.images.load(exr)
    dn = ng.nodes.new('CompositorNodeDenoise')
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(src.outputs['Image'], dn.inputs['Image'])
    ng.links.new(dn.outputs['Image'], out.inputs[0])
    sc.compositing_node_group = ng
    bpy.ops.render.render()
    bpy.data.images['Render Result'].save_render(out_png, scene=sc)
    for ob in hidden: ob.hide_render = False
    return out_png

def main():
    dome, floor = build_scene()
    if MODE == 'preview':
        preview(ARGS[1])
        return
    tmp = ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'blender', 'out')
    os.makedirs(tmp, exist_ok=True)
    uv_unwrap(dome, 0.004); uv_unwrap(floor, 0.01)
    dome_png = bake(dome, 4096, int(os.environ.get('DOME_SAMPLES', 384)), os.path.join(tmp, 'dome.png'))
    floor_png = bake(floor, 2048, int(os.environ.get('FLOOR_SAMPLES', 512)), os.path.join(tmp, 'floor.png'))
    for ob in bpy.context.scene.objects: ob.select_set(ob.name in ('IglooDome', 'IglooFloor'))
    out = os.path.join(ROOT, 'assets', 'igloo-room.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_materials='NONE', export_attributes=False)
    # 그림은 GLB에 넣지 않고 KTX2로 따로 압축한다(blender/encode_textures.sh).
    print('EXPORTED', out)

main()
