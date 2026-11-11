// 모닥불 옆의 A자 입간판 게시판. 메모 UI는 클릭하면 화면 가운데 홀로그램 카드로 연다.
// 짙은 원목 둥근 틀 + 푸른 기 도는 흰 판, 윗면에 눈이 소복이 쌓여 있다(높이 약 1.5m).
// 위치는 마을 배치가 끝난 뒤 place()로 정한다. 그 전에는 보이지도, 눌리지도 않는다.
export function addAnonymousBoardObject(THREE, scene, { heightAt, onOpen = () => {} }) {
  const root = new THREE.Group();
  root.visible = false;
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.82 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xe6f0fb, roughness: 0.95 });
  const R = 0.055;   // 틀 굵기(반지름)
  // 두 점 사이를 잇는 둥근 막대
  function bar(parent, a, b, material = wood, r = R) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, from.distanceTo(to), 4, 10), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const W = 0.92, TOP = 1.45, PANEL_LOW = 0.42;
  // 앞판: 뒤로 살짝 기울어진 틀(다리 겸용 기둥 두 개, 위·아래 가로대)과 판
  const front = new THREE.Group();
  front.rotation.x = -0.2;
  root.add(front);
  bar(front, [-W / 2, 0, 0], [-W / 2, TOP, 0]);
  bar(front, [W / 2, 0, 0], [W / 2, TOP, 0]);
  bar(front, [-W / 2, TOP, 0], [W / 2, TOP, 0]);
  bar(front, [-W / 2, PANEL_LOW, 0], [W / 2, PANEL_LOW, 0]);
  // 판 앞면: 메모지가 핀으로 꽂힌 게시판 그림과 작은 제목
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef3f8'; ctx.fillRect(0, 0, 512, 512);
  // 제목 띠
  ctx.fillStyle = '#2e3b48';
  ctx.beginPath(); ctx.roundRect(126, 34, 260, 62, 31); ctx.fill();
  ctx.fillStyle = '#eef3f8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px sans-serif'; ctx.fillText('익명 메모', 256, 66);
  // 비스듬히 꽂힌 메모지들: 종이, 그림자, 글줄, 핀
  const notes = [
    [140, 200, -0.12, '#ffe7a3', '#e0574f'], [330, 190, 0.1, '#c9ecdf', '#3c7bd9'],
    [190, 360, 0.08, '#ffd3d6', '#f0a43a'], [360, 350, -0.09, '#cfe3ff', '#e0574f']
  ];
  for (const [x, y, rot, paper, pin] of notes) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(46,59,72,.16)'; ctx.fillRect(-62, -52, 132, 118);
    ctx.fillStyle = paper; ctx.fillRect(-68, -58, 132, 118);
    ctx.strokeStyle = 'rgba(46,59,72,.32)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const [ly, lw] of [[-18, 84], [4, 96], [26, 62]]) { ctx.beginPath(); ctx.moveTo(-48, ly); ctx.lineTo(-48 + lw, ly); ctx.stroke(); }
    ctx.fillStyle = pin; ctx.beginPath(); ctx.arc(-2, -50, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-5, -53, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paperMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .9, emissive: 0xffead0, emissiveIntensity: .035 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, TOP - PANEL_LOW - 0.04, 0.04),
    [snow, snow, snow, snow, paperMaterial, snow]);
  panel.position.set(0, (TOP + PANEL_LOW) / 2, 0);
  panel.castShadow = true;
  front.add(panel);
  const hint=document.createElement('button'); hint.type='button'; hint.className='board-discover';
  hint.textContent='게시판 보기'; hint.setAttribute('aria-label','익명 게시판 열기'); hint.hidden=true;
  hint.onclick=onOpen; document.body.append(hint);
  let hintHovered=false, hoverAmount=0, lastTime=null, groundY=0, liftAmount=0, tiltAmount=0;
  hint.onpointerenter=()=>{hintHovered=true;}; hint.onpointerleave=()=>{hintHovered=false;};
  hint.onfocus=()=>{hintHovered=true;}; hint.onblur=()=>{hintHovered=false;};
  const projected=new THREE.Vector3();
  // 윗가로대에 소복이 쌓인 눈
  const cap = bar(front, [-W / 2 + 0.02, TOP + 0.06, 0], [W / 2 - 0.02, TOP + 0.06, 0], snow, 0.07);
  cap.scale.set(1.35, 1, 0.75);
  // 뒷다리: 꼭대기에서 뒤로 벌어진 두 기둥과 가운데 가로대
  const back = new THREE.Group();
  back.position.set(0, TOP * Math.cos(0.2), -TOP * Math.sin(0.2));
  back.rotation.x = 0.42;
  root.add(back);
  bar(back, [-W / 2 + 0.06, 0, -0.02], [-W / 2 + 0.06, -TOP, -0.02]);
  bar(back, [W / 2 - 0.06, 0, -0.02], [W / 2 - 0.06, -TOP, -0.02]);
  bar(back, [-W / 2 + 0.06, -TOP * 0.55, -0.02], [W / 2 - 0.06, -TOP * 0.55, -0.02]);

  scene.add(root);
  const targets = [];
  const point = (px, py, pz) => root.localToWorld(new THREE.Vector3(px, py, pz));
  return {
    root, targets,
    get placed() { return root.visible; },
    place(x, z, rotation = 0) {
      groundY=heightAt(x,z);
      root.position.set(x,groundY,z);
      root.rotation.y = rotation;
      root.visible = true;
      root.updateMatrixWorld(true);
      targets.length = 0;
      root.traverse(object => { if (object.isMesh) targets.push(object); });
    },
    update(time,camera,{active=false,hovered=false,reducedMotion=false,width=innerWidth,height=innerHeight}={}) {
      const dt=lastTime===null?0:Math.min(.05,Math.max(0,time-lastTime)); lastTime=time;
      const target=active&&(hovered||hintHovered)?1:0;
      hoverAmount+=(target-hoverAmount)*(reducedMotion?1:1-Math.exp(-dt*10));
      // 가끔 한 번만 가볍게 들썩여 사물 자체가 반응 가능한 대상임을 알려 준다.
      const cycle=time%5.8;
      const wave=active&&!reducedMotion&&cycle<1.8?Math.sin(cycle/1.8*Math.PI)**2*(1-hoverAmount):0;
      const blend=reducedMotion?1:1-Math.exp(-dt*9);
      liftAmount+=(wave*.075-liftAmount)*blend;
      tiltAmount+=(wave*Math.sin(cycle/1.8*Math.PI*2)*.055-tiltAmount)*blend;
      root.position.y=groundY+liftAmount; root.rotation.z=tiltAmount;
      paperMaterial.emissiveIntensity=.035+hoverAmount*.18;
      wood.emissive.setHex(0xffd6a0); wood.emissiveIntensity=hoverAmount*.07;
      hint.hidden=!active||!root.visible||(!hovered&&!hintHovered&&hoverAmount<.05);
      if(hint.hidden){hintHovered=false;return;}
      root.updateMatrixWorld(true); projected.copy(point(0,.16,.30)).project(camera);
      const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      hint.hidden=projected.z< -1||projected.z>1||x<55||x>width-55||y<16||y>height-42;
      if(!hint.hidden){hint.style.left=x+'px';hint.style.top=y+'px';hint.classList.toggle('is-visible',Boolean(hovered||hintHovered));}
    },
    focusTarget() { root.updateMatrixWorld(true); return point(0, 0.95, 0); },
    // 게시판과 모닥불이 함께 보이도록 조금 떨어진 정면 위에서 바라본다.
    focusPosition() { root.updateMatrixWorld(true); return point(0.8, 2.6, 5.6); }
  };
}
