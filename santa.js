import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function addSanta(scene, { fireSpot, heightAt, height = 1.5 }) {
  if (!fireSpot) return;
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/SantaGirl.glb', import.meta.url).href);
  const model = gltf.scene;
  // 원본 대기 모션을 반복하고 재질과 텍스처를 유지한다.
  let mixer = null;
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle_15') || gltf.animations[0];
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.update(0);
  }
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = height / size.y;
  const santa = new THREE.Group();
  santa.name = 'village-santa';
  santa.scale.setScalar(scale);
  model.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
  santa.add(model);
  // 모닥불 오른편, 불과 겹치지 않고 호수 앞쪽 길을 비켜 선다.
  const x = fireSpot.x + 1.65, z = fireSpot.z - 0.15;
  santa.position.set(x, heightAt(x, z) - 0.015, z);
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(santa);
  return { update(dt) { if (mixer) mixer.update(dt); } };
}
