import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBearNavigation } from './bear-navigation.js';

export async function addSanta(scene,{fireSpot,heightAt,height,obstacles,bearPosition}) {
  if (!fireSpot) return;
  const {scene:model,animations}=await new GLTFLoader().loadAsync(new URL('./assets/SantaGirl.glb?v=idle15-v1',import.meta.url).href);
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.roughnessMap = null; material.roughness = .94;
      material.emissiveMap = material.map; material.emissive.setHex(0xffffff); material.emissiveIntensity = .11;
      material.metalness = 0;
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
      mesh.localToWorld(mesh.getVertexPosition(i,p));
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
  const walk=mixer.clipAction(THREE.AnimationClip.findByName(animations,'Walking')),run=mixer.clipAction(THREE.AnimationClip.findByName(animations,'Running'));
  walk.play();run.play();run.setEffectiveWeight(0);
  const idle = mixer.clipAction(THREE.AnimationClip.findByName(animations,'Idle_15'));
  idle.play(); idle.setEffectiveWeight(1); walk.setEffectiveWeight(0);
  const root=new THREE.Group();root.name='village-santa';root.scale.setScalar(height/size.y);
  model.position.add(new THREE.Vector3(-center.x,-box.min.y,-center.z));root.add(model);
  const f=fireSpot,nav=createBearNavigation({obstacles,heightAt,radius:.48,step:.45,bounds:{minX:f.x-8,maxX:f.x+8,minZ:f.z-8,maxZ:f.z+8}});
  const stops=Array.from({length:16},(_,i)=>nav.nearestPoint({x:f.x+4.3*Math.cos(i*Math.PI/8),z:f.z+4.3*Math.sin(i*Math.PI/8)})).filter(Boolean);
  if(!stops.length)return;
  let pos={...stops[0]},index=0,path=[],pause=.6,alarm=0,cooldown=0,speed=0,weight=0,moving=0;
  root.position.set(pos.x,heightAt(pos.x,pos.z),pos.z);scene.add(root);
  return {update(dt){
    dt=Math.min(dt,.08);cooldown-=dt;alarm-=dt;pause-=dt;
    const b=bearPosition(),dist=q=>Math.hypot(q.x-b.x,q.z-b.z);
    if(b&&dist(pos)<3.6&&cooldown<=0){
      const choices=stops.slice().sort((a,c)=>dist(c)-dist(a));
      for(const goal of choices){const escape=nav.findPath(pos,goal).slice(1);if(escape.length&&dist(escape[0])>dist(pos)){path=escape;alarm=3.3;pause=.22;cooldown=5;break;}}
    }
    if(!path.length&&pause<=0){index=(index+2)%stops.length;path=nav.findPath(pos,stops[index]).slice(1);if(!path.length)pause=.25;}
    const fleeing=alarm>0;
    speed=THREE.MathUtils.damp(speed,path.length&&pause<=0?(fleeing?2.5:.83):0,8,dt);
    if(path.length&&pause<=0){const q=path[0],x=q.x-pos.x,z=q.z-pos.z,d=Math.hypot(x,z),step=Math.min(d,speed*dt);
      if(d>.0001){pos.x+=x/d*step;pos.z+=z/d*step;const delta=Math.atan2(x,z)-root.rotation.y;root.rotation.y+=Math.atan2(Math.sin(delta),Math.cos(delta))*Math.min(1,dt*10);}
      if(d<=step+.0001){path.shift();if(!path.length)pause=1.3+Math.random()*1.6;}
    }
    root.position.set(pos.x,heightAt(pos.x,pos.z)+(alarm>3.08?.12*Math.sin(Math.PI*(3.3-alarm)/.22):0),pos.z);
    moving=THREE.MathUtils.damp(moving,path.length&&pause<=0?1:0,9,dt);
    weight=THREE.MathUtils.damp(weight,fleeing?1:0,9,dt);
    idle.setEffectiveWeight(1-moving);run.setEffectiveWeight(weight*moving);walk.setEffectiveWeight((1-weight)*moving);
    const gaitRate=Math.min(1.3,speed/(fleeing?2.5:.83));
    walk.setEffectiveTimeScale(gaitRate);run.setEffectiveTimeScale(gaitRate);
    mixer.update(dt);
  }};
}
