import bpy, bmesh, sys, json, math
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source=args[0]
# 시작 장면의 기본 큐브와 조명은 에셋에 포함하지 않는다.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
scene=bpy.context.scene
# glTF 가져오기가 뼈대 표시용으로 만든 메시를 결과에 섞지 않는다.
meshes=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
scene.frame_set(scene.frame_start)
for obj in meshes:
 print('BEAR_MESH',obj.name,'vertices',len(obj.data.vertices),'polygons',len(obj.data.polygons),'groups',len(obj.vertex_groups),'modifiers',[(m.name,m.type) for m in obj.modifiers])
print('BEAR_ACTIONS',[(a.name,list(a.frame_range)) for a in bpy.data.actions])
print('BEAR_OBJECTS',[(o.name,o.type,list(o.scale)) for o in scene.objects if o.type!='MESH'][:5])
depsgraph=bpy.context.evaluated_depsgraph_get()
points=[obj.matrix_world @ v.co for obj in meshes for v in obj.evaluated_get(depsgraph).data.vertices]
print('BEAR_BOUNDS', [min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)])
for arm in (o for o in scene.objects if o.type=='ARMATURE'):
 print('BEAR_BONES',[(b.name,list(arm.matrix_world @ b.head)) for b in arm.pose.bones if 'head' in b.name.lower() or 'hip' in b.name.lower()])
if len(args)<2: sys.exit(0)
out=args[1]
before=sum(len(o.data.polygons) for o in meshes)
for obj in meshes:
 bpy.context.view_layer.objects.active=obj
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 armatures=[m for m in obj.modifiers if m.type=='ARMATURE']
 for m in armatures:m.show_viewport=False
 # 꼬리 끝 뼈가 엉덩이와 뒷다리까지 당기지 않도록 잘못 퍼진 가중치를 정리한다.
 armature=armatures[0].object
 broken_groups={g.index for g in obj.vertex_groups if g.name in {'tail','tailstart','tail1','tail2','tail3'}}
 candidates=[]
 for name in ['Hips','backleg','backleg0','backleg1','backleg2','R_backleg','R_backleg0','R_backleg1','R_backleg2']:
  bone=armature.data.bones.get(name)
  group=obj.vertex_groups.get(name)
  if bone and group:
   start=armature.matrix_world@bone.head_local
   end=armature.matrix_world@(bone.children[0].head_local if bone.children else bone.tail_local)
   candidates.append((group,start,end))
 repaired=0
 for vertex in obj.data.vertices:
  weights={g.group:g.weight for g in vertex.groups}
  lost=sum(w for i,w in weights.items() if i in broken_groups)
  if lost<0.00001:continue
  p=obj.matrix_world@vertex.co
  distances=[]
  for group,start,end in candidates:
   delta=end-start;t=max(0,min(1,(p-start).dot(delta)/(delta.length_squared or 1)))
   distances.append(((p-start-delta*t).length,group))
  nearest=sorted(distances,key=lambda item:item[0])[:2]
  if p.z>55:nearest=[(0,obj.vertex_groups['Hips'])]
  factors=[1/(distance+3)**3 for distance,group in nearest];denominator=sum(factors)
  for (distance,group),factor in zip(nearest,factors):
   group.add([vertex.index],weights.get(group.index,0)+lost*factor/denominator,'REPLACE')
  for index in broken_groups:
   if index in weights:obj.vertex_groups[index].remove([vertex.index])
  repaired+=1
 # 꼬리 부착면과 엉덩이 위쪽은 같은 골반을 따라가도록 연속적으로 연결한다.
 for vertex in obj.data.vertices:
  p=obj.matrix_world@vertex.co
  blend=max(0,min(1,(p.y-28)/20))*max(0,min(1,(p.z-34)/20))
  if blend<=0:continue
  for influence in list(vertex.groups):
   obj.vertex_groups[influence.group].add([vertex.index],influence.weight*(1-blend),'REPLACE')
  hips=obj.vertex_groups['Hips']
  old=next((g.weight for g in vertex.groups if g.group==hips.index),0)
  hips.add([vertex.index],old+blend,'REPLACE')
 print('BEAR_TAIL_WEIGHTS_REPAIRED',repaired)
 # UV 경계는 면별로 유지하되 같은 위치의 정점은 먼저 연결해 몸통의 틈을 막는다.
 bm=bmesh.new();bm.from_mesh(obj.data)
 extent=max(max(v.co[i] for v in bm.verts)-min(v.co[i] for v in bm.verts) for i in range(3))
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=extent*0.00001)
 bm.to_mesh(obj.data);bm.free();obj.data.update()
 inverse=obj.matrix_world.inverted()
 points=[obj.matrix_world@v.co for v in obj.data.vertices]
 floor=min(p.z for p in points);height=max(p.z for p in points)-floor
 armature=armatures[0].object
 foot_groups={g.index:armature.matrix_world@armature.data.bones[g.name].head_local
  for g in obj.vertex_groups if 'leg2' in g.name and g.name in armature.data.bones}
 smooth_group=obj.vertex_groups.new(name='Rear surface polish')
 foot_vertices=0
 for vertex,p in zip(obj.data.vertices,points):
  # 발가락 쪽을 짧게, 발바닥은 넓고 낮게 만든다. 발목 위는 점진적으로 연결한다.
  influences=[(w.weight,foot_groups[w.group]) for w in vertex.groups if w.group in foot_groups]
  if influences and p.z<floor+height*0.24:
   weight,ankle=max(influences,key=lambda item:item[0])
   vertical=max(0,min(1,(floor+height*0.24-p.z)/(height*0.10)))
   blend=min(1,weight*1.6)*vertical
   p.x=ankle.x+(p.x-ankle.x)*(1+0.10*blend)
   if p.y<ankle.y:p.y=ankle.y+(p.y-ankle.y)*(1-0.27*blend)
   p.z=floor+(p.z-floor)*(1-0.46*blend)
   vertex.co=inverse@p;foot_vertices+=1
  # 엉덩이의 작은 굴곡만 완만하게 다듬고 꼬리와 다리는 유지한다.
  rear=max(0,min(1,(p.y-18)/28))
  torso=max(0,min(1,(p.z-floor-height*0.33)/(height*0.22)))
  if rear*torso>0.001:smooth_group.add([vertex.index],rear*torso,'REPLACE')
 smooth=obj.modifiers.new(name='Smooth rear silhouette',type='SMOOTH')
 smooth.factor=0.28;smooth.iterations=5;smooth.vertex_group=smooth_group.name
 bpy.ops.object.modifier_move_to_index(modifier=smooth.name,index=0)
 bpy.ops.object.modifier_apply(modifier=smooth.name)
 print('BEAR_PAW_RESHAPE',foot_vertices)
 mod=obj.modifiers.new(name='Web silhouette reduction',type='DECIMATE');mod.ratio=0.36;mod.use_collapse_triangulate=True
 bpy.ops.object.modifier_move_to_index(modifier=mod.name,index=0)
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for m in armatures:m.show_viewport=True
 for polygon in obj.data.polygons:polygon.use_smooth=True
# 원본 4K 이미지를 유지해 엉덩이와 발의 텍스처 해상도를 보존한다.
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_yup=True,export_skins=True,export_animations=True,export_force_sampling=True,export_frame_range=False,export_apply=False)
print('BEAR_OPTIMIZED',json.dumps({'before':before,'after':sum(len(o.data.polygons) for o in meshes),'output':out}))



