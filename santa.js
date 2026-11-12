import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBearNavigation, clearsCharacters } from "./bear-navigation.js?v=traffic1";

export async function addSanta(scene,{fireSpot,lakesideHome,heightAt,height,obstacles,bearPosition,penguinBodies}) {
  if (!fireSpot) return;
  const {scene:model,animations}=await new GLTFLoader().loadAsync(new URL('./assets/SantaGirl.glb?v=idle15-v1',import.meta.url).href);
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.roughnessMap = null; material.roughness = .94;
      material.emissiveMap = material.map; material.emissive.setHex(0xffffff); material.emissiveIntensity = .11;
      material.metalnessMap = null; material.metalness = 0;
      if (material.normalScale) material.normalScale.multiplyScalar(.35);
      if (material.map) {
        material.map.magFilter = THREE.LinearFilter;
        material.map.minFilter = THREE.LinearMipmapLinearFilter;
        material.map.generateMipmaps = true;
        material.map.anisotropy = 4;
        material.map.needsUpdate = true;
        // 밉맵을 살짝 부드럽게 골라 원본의 거친 색 얼룩을 완화한다.
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
            THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, 0.65 )'));
        };
        material.customProgramCacheKey = () => 'santa-soft-map-1';
      }
    }
  });
  const box=new THREE.Box3().setFromObject(model,true), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  // 허리띠 높이의 몸통과 옷만 골반을 더 강하게 따르도록 부드럽게 연결한다.
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const bones=mesh.skeleton.bones, hips=bones.findIndex(b=>/Hips$/i.test(b.name));
    if(hips<0)return;
    const waist=bones[hips].getWorldPosition(new THREE.Vector3()), p=new THREE.Vector3();
    const {skinIndex:ids,skinWeight:ws}=mesh.geometry.attributes;
    for(let i=0;i<ws.count;i++){
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
      const blend=.87*(1-THREE.MathUtils.smoothstep(Math.abs(p.y-waist.y)/size.y,.025,.105));
      if(!blend)continue;
      const weights=new Map();let arm=0;
      for(let k=0;k<4;k++){const j=ids.getComponent(i,k),w=ws.getComponent(i,k);weights.set(j,(weights.get(j)||0)+w);if(/Arm|Hand|Finger|Thumb|Index|Middle|Ring|Pinky/i.test(bones[j]?.name))arm+=w;}
      if(arm>.12)continue;
      for(const [j,w] of weights)weights.set(j,w*(1-blend));
      weights.set(hips,(weights.get(hips)||0)+blend);
      const a=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=a.reduce((v,t)=>v+t[1],0);
      for(let k=0;k<4;k++){ids.setComponent(i,k,a[k]?.[0]??0);ws.setComponent(i,k,(a[k]?.[1]??0)/sum);}
    }
    mesh.receiveShadow=true;
  });
  const mixer=new THREE.AnimationMixer(model);
  for(const clip of animations.filter(clip => clip.name !== 'Idle_15'))for(const t of clip.tracks)if(/Hips\.position$/i.test(t.name))for(let i=3;i<t.values.length;i+=3){t.values[i]=t.values[0];t.values[i+2]=t.values[2];}
  const fallClip=THREE.AnimationClip.parse(await new THREE.FileLoader().setResponseType('json').loadAsync(new URL('./assets/santa-fall.json',import.meta.url).href));
  const fall=mixer.clipAction(fallClip);
  fall.setLoop(THREE.LoopOnce,1); fall.clampWhenFinished=true;
  const walk=mixer.clipAction(THREE.AnimationClip.findByName(animations,'Walking'));
  const idle=mixer.clipAction(THREE.AnimationClip.findByName(animations,'Idle_15'));
  idle.play(); walk.play().setEffectiveWeight(0);
  const root=new THREE.Group();root.name='village-santa';root.scale.setScalar(height/size.y);
  model.position.add(new THREE.Vector3(-center.x,-box.min.y,-center.z));root.add(model);
  const f=fireSpot;
  const targets=Array.from({length:8},(_,i)=>{
    const angle=i*Math.PI/4, radius=5.25+.55*Math.sin(2*angle);
    return {x:f.x+radius*Math.cos(angle),z:f.z+radius*Math.sin(angle)};
  });
  if(lakesideHome){
    const home=lakesideHome;
    const approach=Math.atan2(f.z-home.z,f.x-home.x);
    const loop=Array.from({length:8},(_,i)=>{
      const angle=approach+i*Math.PI/4;
      const radius=home.radius+3;
      return {x:home.x+radius*Math.cos(angle),z:home.z+radius*Math.sin(angle)};
    });
    targets.splice(5,0,...loop,loop[0]);
  }
  const xs=targets.map(p=>p.x), zs=targets.map(p=>p.z);
  const bounds={minX:Math.min(...xs)-3,maxX:Math.max(...xs)+3,
    minZ:Math.min(...zs)-3,maxZ:Math.max(...zs)+3};
  const localObstacles=obstacles.filter(o =>
    o.x+o.r+1>=bounds.minX && o.x-o.r-1<=bounds.maxX &&
    o.z+o.r+1>=bounds.minZ && o.z-o.r-1<=bounds.maxZ);
  const nav=createBearNavigation({obstacles:localObstacles,heightAt,radius:.48,step:.45,bounds});
  const stops=targets.map(p=>nav.nearestPoint(p)).filter(Boolean);
  const routes=new Map();
  if(!stops.length)return;
  let pos={...stops[0]},index=0,path=[],pause=.6,reaction=-1,armed=true,speed=0,moving=0;
  let turnFrom=0, turnDuration=0, turnAngle=0;
  root.position.set(pos.x,heightAt(pos.x,pos.z),pos.z);scene.add(root);
  let replanIn=0;
  const clearOfPenguins=(a,b)=>clearsCharacters(a,b,penguinBodies,.84);
  return {position:root.position,update(dt){
    dt=Math.min(dt,.08);
    const b=bearPosition(),distance=b?Math.hypot(pos.x-b.x,pos.z-b.z):Infinity;
    if(reaction<0 && distance>5.5)armed=true;
    if(reaction<0 && armed && distance<3.6){
      armed=false;reaction=0;speed=0;
      turnFrom=root.rotation.y;
      const bearing=distance>.001 ? Math.atan2(b.x-pos.x,b.z-pos.z) : turnFrom;
      turnAngle=Math.atan2(Math.sin(bearing-turnFrom),Math.cos(bearing-turnFrom));
      turnDuration=.12+.45*Math.abs(turnAngle)/Math.PI;
      fall.reset().play();fall.paused=true;
    }
    if(reaction>=0){
      reaction+=dt;
      const turn=THREE.MathUtils.smoothstep(reaction,0,turnDuration);
      root.rotation.y=turnFrom+turnAngle*turn;
      const fallTime=Math.max(0,reaction-turnDuration);
      const down=fallClip.duration, riseStart=down+.85, riseDuration=2.8;
      const rise=THREE.MathUtils.smoothstep(fallTime,riseStart,riseStart+riseDuration);
      fall.time=Math.min(fallTime,down)*(1-rise);
      const w=THREE.MathUtils.smoothstep(fallTime,0,.22)*(1-THREE.MathUtils.smoothstep(rise,.78,1));
      fall.setEffectiveWeight(w);
      moving*=Math.exp(-8*dt);
      walk.setEffectiveWeight((1-w)*moving); idle.setEffectiveWeight((1-w)*(1-moving));
      mixer.update(dt);
      if(rise===1){fall.stop();reaction=-1;pause=.25;moving=0;}
      return;
    }
    pause-=dt;
    if(!path.length && pause<=0){
      const next=(index+1)%stops.length;
      const key=pos.x+","+pos.z+":"+next;
      let leg=routes.get(key);
      if(!leg){
        leg=nav.findPath(pos,stops[next]).slice(1);
        if(leg.length)routes.set(key,leg);
      }
      path=leg.slice();
      index=next;
      if(!path.length)pause=.25;
    }
    replanIn-=dt;
    if(path.length && replanIn<=0){
      const q=path[0], t=Math.min(1,1.5/(Math.hypot(q.x-pos.x,q.z-pos.z)||1));
      if(!clearOfPenguins(pos,{x:pos.x+(q.x-pos.x)*t,z:pos.z+(q.z-pos.z)*t})){
        const detour=nav.findPath(pos,stops[index],clearOfPenguins).slice(1);
        if(detour.length)path=detour;
        else {path=[];pause=.35;}
        replanIn=.5;
      }
    }
    let targetSpeed=0;
    if(path.length && pause<=0){
      const q=path[0], x=q.x-pos.x, z=q.z-pos.z, d=Math.hypot(x,z);
      const delta=Math.atan2(x,z)-root.rotation.y;
      const turn=Math.atan2(Math.sin(delta),Math.cos(delta));
      if(d>.0001)root.rotation.y+=turn*(1-Math.exp(-8*dt));
      const braking=path.length===1 ? Math.min(1,Math.sqrt(d/.55)) : 1;
      targetSpeed=.83*braking*(.55+.45*Math.max(0,Math.cos(turn)));
      speed=THREE.MathUtils.damp(speed,targetSpeed,7,dt);
      const step=Math.min(d,speed*dt);
      const next={x:pos.x+x/(d||1)*step,z:pos.z+z/(d||1)*step};
      if(!clearOfPenguins(pos,next)){speed=0;}
      else {
      if(d>.0001){pos.x+=x/d*step;pos.z+=z/d*step;}
      if(d<=step+.0001){pos.x=q.x;pos.z=q.z;path.shift();if(!path.length)pause=1.3+Math.random()*1.6;}
      }
    }else{
      speed=THREE.MathUtils.damp(speed,0,8,dt);
    }
    root.position.set(pos.x,heightAt(pos.x,pos.z),pos.z);
    moving=THREE.MathUtils.damp(moving,speed>.025?1:0,9,dt);
    idle.setEffectiveWeight(1-moving);walk.setEffectiveWeight(moving);
    walk.setEffectiveTimeScale(Math.min(1.3,speed/.83));
    mixer.update(dt);
  }};
}
