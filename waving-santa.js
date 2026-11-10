import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function addWavingSanta(scene, spot, heightAt, camera) {
  const {scene: model, animations} = await new GLTFLoader().loadAsync('./assets/SantaGrandpa-wave.glb');
  const wave = THREE.AnimationClip.findByName(animations, 'Wave_One_Hand');
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const material = mesh.material;
    material.roughnessMap = null;
    material.roughness = .94;
    material.metalness = 0;
    material.emissiveMap = material.map;
    material.emissive.setHex(0xffffff);
    material.emissiveIntensity = .11;
    material.map.anisotropy = 4;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, 0.65 )'));
    };
    // 벨트와 코트 앞판이 팔다리를 따라 접히지 않게 몸통 중앙만 골반에 연결한다.
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const hips = mesh.skeleton.bones.findIndex(b => /Hips$/.test(b.name));
    if (hips < 0) return;
    for (let i = 0; i < position.count; i++) {
      const x = Math.abs(position.getX(i)), y = position.getY(i);
      const blend = .8 * (1 - THREE.MathUtils.smoothstep(x, .16, .27))
        * THREE.MathUtils.smoothstep(y, .48, .62) * (1 - THREE.MathUtils.smoothstep(y, .87, 1.02));
      if (!blend) continue;
      const weights = new Map([[hips, blend]]);
      for (let k = 0; k < 4; k++) {
        const bone = skinIndex.getComponent(i, k);
        weights.set(bone, (weights.get(bone) || 0) + (1 - blend) * skinWeight.getComponent(i, k));
      }
      const top = [...weights].sort((a,b) => b[1] - a[1]).slice(0,4);
      const sum = top.reduce((total, pair) => total + pair[1], 0);
      for (let k = 0; k < 4; k++) {
        skinIndex.setComponent(i, k, top[k]?.[0] ?? 0);
        skinWeight.setComponent(i, k, (top[k]?.[1] ?? 0) / sum);
      }
    }
  });
  model.updateMatrixWorld(true);
  // 인사 궤적 전체에서 쇄골을 같은 거리만큼 올리고 양옆으로 조금 펼친다.
  for (const track of wave.tracks) {
    if (!/Shoulder\.position$/.test(track.name)) continue;
    const bone = model.getObjectByName(track.name.split('.')[0]);
    if (!bone) continue;
    const origin = bone.parent.localToWorld(new THREE.Vector3());
    const shift = bone.parent.worldToLocal(origin.add(new THREE.Vector3(
      track.name.includes('Left') ? .022 : -.022, .045, 0)));
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] += shift.x;
      track.values[i+1] += shift.y;
      track.values[i+2] += shift.z;
    }
  }
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(wave).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  const root = new THREE.Group();
  root.name = 'waving-santa';
  root.scale.setScalar(1.88 / (bounds.max.y - bounds.min.y));
  root.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
  root.add(model);
  scene.add(root);
  function facing() {
    return Math.atan2(camera.position.x - spot.x, camera.position.z - spot.z);
  }
  root.rotation.y = facing();
  return dt => {
    mixer.update(dt);
    const angle = facing() - root.rotation.y;
    root.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-3 * dt));
  };
}
