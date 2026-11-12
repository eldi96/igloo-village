import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createBearNavigation, clearsCharacters } from "./bear-navigation.js?v=traffic1";

// 뼈마다 다른 로컬 축을 모델의 좌우 축에 맞춰 기본 자세에서 회전한다.
function bindLimbs(body) {
  const joints = [];
  for (const [id, role] of [[7,'hip'],[12,'hip'],[6,'knee'],[11,'knee'],
    [5,'foot'],[10,'foot'],[18,'wing'],[22,'wing'],[17,'tip'],[21,'tip']]) {
    const bone = body.getObjectByName('Bone_'+String(id).padStart(3,'0'));
    const side = Math.sign(bone.getWorldPosition(new THREE.Vector3()).x);
    const inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axis = new THREE.Vector3(1,0,0).applyQuaternion(inverse);
    joints.push({bone,role,side,axis,rest:bone.quaternion.clone()});
  }
  const rotation = new THREE.Quaternion();
  return (phase, stride, fall) => {
    const swing = Math.sin(phase);
    const lift = Math.cos(phase);
    const tip = Math.sin(phase-.35);
    for (const {bone,role,side,axis,rest} of joints) {
      const step = swing*side*stride;
      const rise = Math.max(0,lift*side)*stride;
      let angle;
      switch (role) {
        case 'hip': angle = -.43*step-.16*fall; break;
        case 'knee': angle = .35*rise+.22*fall; break;
        case 'foot': angle = .30*step-.24*rise; break;
        case 'wing': angle = .24*step-.55*fall; break;
        case 'tip': angle = .09*tip*side*stride-.12*fall; break;
      }
      bone.quaternion.copy(rest).multiply(rotation.setFromAxisAngle(axis,angle));
    }
  };
}

export async function addPenguins(scene, hub, heightAt, obstacles, bearPosition, onDoorPenguinReady, penguinBodies, santaPosition) {
  const { scene: model } = await new GLTFLoader().loadAsync('./assets/penguin.glb');
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material.map) return;
    const material = mesh.material;
    material.map.anisotropy = 4;
    material.roughness = .96;
    // 색 차이가 작은 이웃만 섞어 털 얼룩은 누그러뜨리고 눈·부리 경계는 살린다.
    material.onBeforeCompile = shader => {
      const sample = THREE.ShaderChunk.map_fragment.replace(
        'texture2D( map, vMapUv )', 'texture2D( map, vMapUv, 0.6 )');
      const texel = new THREE.Vector2(1/material.map.image.width, 1/material.map.image.height);
      shader.uniforms.penguinTexel = { value: texel };
      shader.fragmentShader = 'uniform vec2 penguinTexel;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>', sample.replace('#ifdef DECODE_VIDEO_TEXTURE', `
          vec3 centerColor = sampledDiffuseColor.rgb;
          vec3 sumColor = centerColor * 2.0;
          float totalWeight = 2.0;
          for (int i = 0; i < 4; i++) {
            vec2 offset = i < 2 ? vec2(i == 0 ? -1.0 : 1.0, 0.0) : vec2(0.0, i == 2 ? -1.0 : 1.0);
            vec3 neighbor = texture2D(map, vMapUv + offset * penguinTexel, 0.6).rgb;
            float weight = 1.0 - smoothstep(0.04, 0.24, distance(neighbor, centerColor));
            sumColor += weight * neighbor;
            totalWeight += weight;
          }
          sampledDiffuseColor.rgb = sumColor / totalWeight;
          #ifdef DECODE_VIDEO_TEXTURE`));
    };
  });
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const origin = box.getCenter(new THREE.Vector3());
  origin.y = box.min.y;
  const modelHeight = box.max.y-box.min.y;
  const doorPenguin = new THREE.Group();
  model.traverse(part => {
    if (!part.isMesh) return;
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.matrix.copy(part.matrixWorld);
    mesh.matrix.elements[12] -= origin.x;
    mesh.matrix.elements[13] -= origin.y;
    mesh.matrix.elements[14] -= origin.z;
    mesh.matrixAutoUpdate = false;
    doorPenguin.add(mesh);
  });
  doorPenguin.scale.setScalar(.78 / modelHeight);
  doorPenguin.visible = false;
  scene.add(doorPenguin);
  const doorBodyPosition = {x:0,z:0,r:.55};
  onDoorPenguinReady?.(home => {
    doorPenguin.visible = Boolean(home);
    const index = penguinBodies.indexOf(doorBodyPosition);
    if (index >= 0) penguinBodies.splice(index,1);
    if (!home) return;
    const x = home.doorX + 1.15 * Math.cos(home.yaw);
    const z = home.doorZ - 1.15 * Math.sin(home.yaw);
    doorPenguin.position.set(x, heightAt(x, z), z);
    Object.assign(doorBodyPosition,{x,z});
    penguinBodies.push(doorBodyPosition);
    doorPenguin.rotation.y = home.yaw;
  });
  const bounds = { minX:hub.x-13, maxX:hub.x+13, minZ:hub.z-12, maxZ:hub.z+12 };
  const nearbyObstacles = obstacles.filter(o =>
    o.x+o.r+2 >= bounds.minX && o.x-o.r-2 <= bounds.maxX &&
    o.z+o.r+2 >= bounds.minZ && o.z-o.r-2 <= bounds.maxZ);
  const nav = createBearNavigation({ obstacles:nearbyObstacles, heightAt, bounds, radius:1, step:.55 });
  const followingDistance = 1.6;
  const shores = Array.from({length:24}, (_,i)=>{
    const angle=i*Math.PI/12, radius=i%2 ? 9.2 : 7.6;
    return nav.nearestPoint({x:hub.x+radius*Math.cos(angle),z:hub.z+radius*Math.sin(angle)});
  }).filter(Boolean);
  if (!shores.length) return;
  let trail=[{...shores[0],d:0}], end=0;
  function at(distance, points=trail){
    let i=0, upper=points.length;
    while(i<upper){
      const mid=(i+upper)>>>1;
      if(points[mid].d<distance)i=mid+1;
      else upper=mid;
    }
    if(i===points.length)return points[i-1];
    if(i===0)return points[0];
    const a=points[i-1], b=points[i], t=(distance-a.d)/(b.d-a.d);
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  }
  function nextWalk(blockers=[]){
    const origin=trail[trail.length-1];
    const choices=shores.map(goal=>({goal,rank:Math.random()})).sort((a,b)=>a.rank-b.rank);
    for(const {goal} of choices){
      if(Math.hypot(goal.x-origin.x,goal.z-origin.z)<4)continue;
      const path=nav.findPath(origin,goal, blockers.length ? (a,b)=>clearsCharacters(a,b,blockers,.72) : undefined);
      if(path.length<2)continue;
      const candidate=trail.slice();
      let distance=end;
      for(let i=1;i<path.length;i++){
        distance+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);
        candidate.push({...path[i],d:distance});
      }
      let safe=true;
      for(let d=Math.max(end,followingDistance);d<=distance+.04;d+=.04){
        const mom=at(Math.min(d,distance),candidate), baby=at(Math.min(d,distance)-followingDistance,candidate);
        if(Math.hypot(mom.x-baby.x,mom.z-baby.z)<1.05){safe=false;break;}
      }
      if(!safe)continue;
      trail=candidate;end=distance;return true;
    }
    return false;
  }
  if(!nextWalk())return;
  const family = [.98,.58].map((height,i)=>{
    const body=clone(model), root=new THREE.Group();
    body.updateMatrixWorld(true);
    body.position.sub(origin);
    const pivot=new THREE.Group();
    pivot.add(body); pivot.scale.setScalar(height/modelHeight);
    root.add(pivot); scene.add(root);
    const collider = {...at(followingDistance*(1-i)), r:i ? .48 : .72};
    penguinBodies.push(collider);
    return {collider,pose:bindLimbs(body),root,pivot,height,offset:-i*followingDistance,phase:i*1.8,fall:-1,armed:true};
  });
  let progress=followingDistance, speed=0, walking=true, timer=5;
  let blockedTime=0;
  function reverseWalk(){
    // 좁은 길에서는 앞뒤 순서를 바꿔 두 몸이 서로를 통과하지 않고 되돌아간다.
    const oldProgress=progress;
    const head={...at(progress),d:progress};
    trail=[...trail.filter(point=>point.d<progress),head].reverse()
      .map(point=>({...point,d:oldProgress-point.d}));
    end=trail[trail.length-1].d;
    progress=followingDistance;
    for(const p of family)p.offset=-followingDistance-p.offset;
  }
  return function update(dt) {
    dt=Math.min(dt,.08);
    timer-=dt;
    if(timer<=0){walking=!walking;timer=walking?5+Math.random()*5:1.4+Math.random()*1.8;}
    const santa = santaPosition();
    const blockers = santa ? [{x:santa.x,z:santa.z,r:.84}] : [];
    if(progress>=end && walking){
      if(nextWalk(blockers)){
        while(trail.length>2 && trail[1].d<progress-followingDistance-3)trail.shift();
      }else{
        reverseWalk();
      }
      walking=false;timer=1.5+Math.random()*1.5;
    }
    const clearAhead = advance => family.every(p => clearsCharacters(p.collider,
      at(Math.min(end,progress+advance)+p.offset), blockers, p.collider.r));
    const yielding = blockers.length && !clearAhead(.45);
    blockedTime=yielding && walking ? blockedTime+dt : 0;
    if(blockedTime>1.2){
      const oldTrail=trail, oldEnd=end;
      const head={...at(progress),d:progress};
      trail=[...trail.filter(point=>point.d<progress),head];
      end=progress;
      if(!nextWalk(blockers)){
        if(progress-trail[0].d>followingDistance+.5)reverseWalk();
        else {trail=oldTrail;end=oldEnd;}
      }
      blockedTime=0;
    }
    const resting=family.some(p=>p.fall>=0);
    speed=resting?0:THREE.MathUtils.damp(speed,walking && !yielding?Math.min(.83,Math.sqrt(Math.max(0,end-progress)*2)):0,5,dt);
    if (clearAhead(speed*dt)) progress=Math.min(end,progress+speed*dt);
    else speed=0;
    const bear=bearPosition();
    for(const p of family){
      const d=progress+p.offset;
      const {x,z}=at(d);
      const ahead=at(Math.min(end,d+.18));
      Object.assign(p.collider,{x,z});
      p.root.position.set(x,heightAt(x,z),z);
      const gap=bear?Math.hypot(x-bear.x,z-bear.z):Infinity;
      if(gap>5 && p.fall<0)p.armed=true;
      if(gap<3.6 && p.armed){p.armed=false;p.fall=0;p.bearing=Math.atan2(bear.x-x,bear.z-z);}
      const yaw=p.fall>=0?p.bearing:(d>=end ? p.root.rotation.y : Math.atan2(ahead.x-x,ahead.z-z));
      const delta=yaw-p.root.rotation.y;
      p.root.rotation.y+=Math.atan2(Math.sin(delta),Math.cos(delta))*(1-Math.exp(-9*dt));
      if(p.fall>=0){
        p.fall+=dt;
        const tilt=THREE.MathUtils.smoothstep(p.fall,.3,1)*(1-THREE.MathUtils.smoothstep(p.fall,2.5,4.2));
        p.pose(p.phase,0,tilt);
        p.pivot.rotation.set(-1.15*tilt,0,0);
        p.pivot.position.y=.11*p.height*tilt;
        if(p.fall>=4.2)p.fall=-1;
      }else{
        p.phase+=speed*dt*13/p.height;
        p.pose(p.phase,speed,0);
        p.pivot.rotation.z=.105*speed*Math.sin(p.phase);
        p.pivot.position.y=.035*speed*Math.abs(Math.sin(p.phase));
      }
    }

  };
}
