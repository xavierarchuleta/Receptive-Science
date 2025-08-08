// app.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/loaders/GLTFLoader.js';

// ---------- Simple data service ----------
const dataService = {
  async loadMolecules(){
    // For prototype, load local JSON. Replace with PubChem API calls if desired.
    const res = await fetch('./molecules.json');
    return res.json();
  },
  getSimulatedEffects(molecule, receptor){
    // IMPORTANT: This is purely simulated. Do NOT use for real-world dosing or safety decisions.
    // We'll compute a mock "activation" number taking affinity into account and some randomness.
    constAffinity = (molecule.targets?.find(t=>t.receptor===receptor)?.affinity) || 0.05;
    const activation = Math.min(1, constAffinity * (0.8 + Math.random()*0.6));
    // mock brainwave deltas
    const brainwave = {
      delta: Math.max(0, 0.1 + (activation*0.1)*Math.random()),
      theta: Math.max(0, 0.1 + (activation*0.08)*Math.random()),
      alpha: Math.max(0, 0.2 + (activation*0.12)*Math.random()),
      beta: Math.max(0, 0.15 + (activation*0.09)*Math.random())
    };
    const mood = activation > 0.4 ? "elevated" : "neutral";
    const safety = molecule.safety || "yellow";
    return {activation, brainwave, mood, safety, receptor};
  }
};

// ---------- UI helpers ----------
const q = sel => document.querySelector(sel);
const qi = sel => document.querySelectorAll(sel);

let molecules = [];
(async function init(){
  molecules = await dataService.loadMolecules();
  initMoleculeList(molecules);
  initThreeScene();
  initBrainChart();
  setupUI();
  initVisionSimulator();
  initAmbientAudio();
})();

// ---------- Molecule list + drag logic ----------
function initMoleculeList(mols){
  const list = q('#moleculeList');
  list.innerHTML = '';
  mols.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'molecule';
    el.draggable = true;
    el.dataset.id = m.id;
    el.innerHTML = `<div class="dot" style="background:${m.color}">${m.name[0]}</div>
      <div><strong>${m.name}</strong><div style="color:var(--muted);font-size:12px">${m.formula}</div></div>`;
    el.addEventListener('dragstart', (ev)=> {
      ev.dataTransfer.setData('text/molecule-id', m.id);
    });
    list.appendChild(el);
  });
}

// ---------- Three.js 3D Lab Scene ----------
let renderer, scene, camera, controls;
let beakers = [];
function initThreeScene(){
  const canvas = q('#threeCanvas');
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0d);

  camera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(0, 6, 12);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0,2,0);
  controls.update();

  // subtle environment light
  const amb = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(amb);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5,10,2);
  scene.add(dir);

  // floor / bench
  const plane = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.6, 10),
    new THREE.MeshStandardMaterial({color:0x111217, roughness:0.6})
  );
  plane.position.set(0,-0.3,0);
  scene.add(plane);

  // make a few simple beakers (placeholders)
  for(let i=0;i<3;i++){
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.9,1.6,32), new THREE.MeshPhysicalMaterial({
      color:0x22333f, transparent:true, opacity:0.18, roughness:0.1, metalness:0
    }));
    glass.position.set(-4 + i*4, 0.8, 0);
    scene.add(glass);

    // liquid as a colored sphere truncated
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.65,0.6,32), new THREE.MeshStandardMaterial({
      color:0x66c2ff, transparent:true, opacity:0.85
    }));
    liquid.position.copy(glass.position);
    liquid.position.y = 0.55;
    scene.add(liquid);

    beakers.push({glass, liquid, position:glass.position.clone(), contents:[]});
  }

  // holographic brain (simple sphere group for prototype)
  const brainGroup = new THREE.Group();
  const gMat = new THREE.MeshStandardMaterial({color:0x66bbff, emissive:0x3a9ef0, transparent:true, opacity:0.14});
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.8,32,32), gMat);
  brainGroup.add(s);
  brainGroup.position.set(7,1.6,-1);
  scene.add(brainGroup);
  brainGroup.name = 'holographicBrain';
  animate();
  window.addEventListener('resize', onResize);
  setupDropOnBeakers();
}

function animate(){
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
  // subtle pulsing
  const brain = scene.getObjectByName('holographicBrain');
  if (brain) brain.rotation.y += 0.002;
}

function onResize(){
  const canvas = q('#threeCanvas');
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}

// ---------- Drag / drop onto beakers ----------
function setupDropOnBeakers(){
  const canvas = q('#threeCanvas');
  canvas.addEventListener('dragover', ev => ev.preventDefault());
  canvas.addEventListener('drop', async ev => {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/molecule-id');
    if(!id) return;
    const mol = molecules.find(m=>m.id===id);
    if(!mol) return;
    // pick nearest beaker based on drop x
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width * 2 - 1;
    // find index by x mapping
    const idx = Math.min(Math.max(Math.round((x+1)*1.5),0), beakers.length-1);
    addMoleculeToBeaker(mol, beakers[idx]);
  });
}

function addMoleculeToBeaker(mol, beaker){
  beaker.contents.push(mol);
  // update visual liquid color (blend)
  const color = new THREE.Color(beaker.liquid.material.color);
  const add = new THREE.Color(mol.color || '#66c2ff');
  color.lerp(add, 0.2);
  beaker.liquid.material.color.copy(color);

  // create floating molecular model placeholder
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18,2), new THREE.MeshStandardMaterial({
    color: mol.color || '#f2f2f2', emissive: mol.color || '#303030'
  }));
  const pos = beaker.position.clone();
  pos.y += 1.6 + (beaker.contents.length * 0.2);
  sphere.position.copy(pos);
  scene.add(sphere);

  // add small animation
  const t0 = performance.now();
  const animateFloat = () => {
    const t = (performance.now()-t0)/600;
    sphere.position.y = pos.y + Math.sin(t)*0.08;
    sphere.rotation.y += 0.01;
    if (sphere.parent) requestAnimationFrame(animateFloat);
  };
  animateFloat();

  updateSummary();
}

// ---------- Brain receptor connection (simple prototyping) ----------
function initBrainChart(){
  const ctx = q('#brainwaveChart').getContext('2d');
  window.brainChart = new Chart(ctx, {
    type:'line',
    data:{
      labels:['t0','t1','t2','t3'],
      datasets:[
        {label:'Delta', data:[0.12,0.14,0.11,0.1], borderWidth:1},
        {label:'Theta', data:[0.08,0.09,0.13,0.1], borderWidth:1},
        {label:'Alpha', data:[0.2,0.19,0.21,0.18], borderWidth:1},
        {label:'Beta', data:[0.15,0.16,0.14,0.13], borderWidth:1}
      ]
    },
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#cfd8e3'}}}, scales:{x:{ticks:{color:'#cfd8e3'}}, y:{ticks:{color:'#cfd8e3'}}}}
  });
}

// A simple UI to drag a beaker's contents onto brain
function setupUI(){
  q('#libraryBtn').addEventListener('click', ()=>{ q('#leftPanel').classList.toggle('open'); });
  q('#brainBtn').addEventListener('click', ()=>{ q('#rightPanel').classList.toggle('open'); });
  q('#visionBtn').addEventListener('click', ()=>{ q('#visionModal').classList.remove('hidden'); });

  // make beakers clickable to "connect" to receptor
  renderer.domElement.addEventListener('dblclick', ev=>{
    // raycast to the sphere objects (molecules)
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ( (ev.clientX - rect.left) / rect.width ) * 2 - 1;
    mouse.y = - ( (ev.clientY - rect.top) / rect.height ) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length){
      // pick first that is small molecule placeholder
      const hit = intersects.find(i=>i.object.geometry && i.object.geometry.type.includes('Icosahedron'));
      if(hit){
        // find which molecule by color — demo only
        const colorHex = `#${hit.object.material.color.getHexString()}`;
        const mol = molecules.find(m=>m.color && (m.color.toLowerCase()===colorHex.toLowerCase()));
        if(mol){
          showReceptorDialog(mol);
        }
      }
    }
  });

  // "connect" from UI: pick a molecule and receptor (for prototype)
  function showReceptorDialog(mol){
    const receptor = prompt(`Drag onto receptor — pick one:\n1) 5-HT2A\n2) D2\n3) GABA-A\n(enter name or number)`, '5-HT2A');
    if(!receptor) return;
    const name = receptor === '1' ? '5-HT2A' : receptor === '2' ? 'D2' : receptor === '3' ? 'GABA-A' : receptor;
    const sim = dataService.getSimulatedEffects(mol, name);
    displayConnectionResult(mol, sim);
  }
}

function displayConnectionResult(mol, sim){
  q('#connectionInfo').innerHTML = `<strong>${mol.name}</strong> → <em>${sim.receptor}</em>
    <div>Predicted activation: ${(sim.activation*100).toFixed(1)}%</div>
    <div>Predicted mood: ${sim.mood}</div>
    <div>Safety flag: ${sim.safety}</div>`;

  // animate brain pulsing (increase hologram emissive)
  const brain = scene.getObjectByName('holographicBrain');
  if(brain){
    const target = new THREE.Color(sim.safety==='red' ? 0xff6b6b : sim.safety==='yellow' ? 0xffd36b : 0x79f2b2);
    brain.traverse(n=>{
      if(n.material && n.material.emissive){
        n.material.emissive.set(target);
        n.material.opacity = 0.25 + sim.activation*0.6;
      }
    });
  }

  // update chart with simulated brainwave (shift left)
  const ds = window.brainChart.data.datasets;
  ds[0].data.push(sim.brainwave.delta); ds[0].data.shift();
  ds[1].data.push(sim.brainwave.theta); ds[1].data.shift();
  ds[2].data.push(sim.brainwave.alpha); ds[2].data.shift();
  ds[3].data.push(sim.brainwave.beta); ds[3].data.shift();
  window.brainChart.update();

  // update data output
  q('#summaryText').textContent = `When ${mol.name} engages ${sim.receptor}, the model predicts ${Math.round(sim.activation*100)}% receptor activation and a ${sim.mood} mood bias.`;
  const warn = q('#warnings'); warn.innerHTML = '';
  if(sim.safety==='red') warn.innerHTML += `<li style="color:#ff9a9a">High-risk simulation — treat as hazardous in real life</li>`;
  if(sim.safety==='yellow') warn.innerHTML += `<li style="color:#ffd36b">Unknown/experimental properties — treat with caution</li>`;
  warn.innerHTML += `<li style="color:#98a0b3;font-size:12px">References: simulated — replace with real literature queries for research use.</li>`;
}

// ---------- Summary + save/load (localStorage) ----------
function updateSummary(){
  const total = beakers.reduce((acc,b)=>acc + b.contents.length, 0);
  q('#summaryText').textContent = `${total} molecule(s) placed on bench. Double-click a floating molecule to connect it to a receptor.`;
}

// ---------- Vision Simulator ----------
function initVisionSimulator(){
  const close = q('#closeVision');
  close.addEventListener('click', ()=> q('#visionModal').classList.add('hidden'));
  const canvas = q('#visionCanvas');
  const ctx = canvas.getContext('2d');

  // simple animated scene for vision: moving shapes with color shifts and trails
  let t = 0;
  function render(){
    t += 0.02;
    // base background
    ctx.fillStyle = '#051014';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // sliders
    const color = Number(q('#v_color').value)/100;
    const trails = Number(q('#v_trails').value)/100;
    const blur = Number(q('#v_blur').value)/100;

    // draw moving pattern
    for(let i=0;i<6;i++){
      const x = (canvas.width*0.5) + Math.sin(t*(1+i*0.4)+i) * (80 + i*10);
      const y = (canvas.height*0.5) + Math.cos(t*(1+i*0.33)-i) * (40 + i*8);
      ctx.beginPath();
      const r = 28 + i*6 + Math.sin(t*1.2+i)*6;
      // color shift
      const hue = (i*40 + t*10 + color*180) % 360;
      ctx.fillStyle = `hsla(${hue},70%,55%,${0.12 + (trails*0.6)})`;
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();
    }

    // overlay patterns
    if(blur>0.05){
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${0.02*blur})`;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    requestAnimationFrame(render);
  }
  render();

  // audio: adjust based on slider
  q('#v_audio').addEventListener('input', (e)=>{
    const v = Number(e.target.value)/100;
    Tone.getContext().rawContext.sampleRate; // noop to ensure Tone loaded
    // map to volume of ambient synth
    if(window._ambientSynth) window._ambientSynth.set({volume: -24 + v*24});
  });
}

// ---------- Ambient audio with Tone.js ----------
async function initAmbientAudio(){
  await Tone.start();
  const synth = new Tone.Synth({oscillator:{type:'sine'}}).toDestination();
  synth.volume.value = -24;
  // long slow notes for ambient background
  const loop = new Tone.Loop(time => {
    synth.triggerAttackRelease("C3", "2n", time);
  }, "2m").start(0);
  Tone.Transport.start();
  window._ambientSynth = synth;
}
