/* Enzo 3D Car Game (Three.js) - single-file game logic */

const canvas = document.getElementById("c");

// UI
const menuEl = document.getElementById("menu");
const creditsEl = document.getElementById("credits");
const startBtn = document.getElementById("startBtn");
const creditsBtn = document.getElementById("creditsBtn");
const backBtn = document.getElementById("backBtn");
const nightBtn = document.getElementById("nightBtn");

const coinCountEl = document.getElementById("coinCount");
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");

// Mobile controls
const mobileControls = document.getElementById("mobileControls");
const mobileState = { left:false, right:false, up:false, down:false };

let running = false;
let night = false;

// Three.js basics
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fd5ff, 20, 140);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 300);
camera.position.set(0, 6.5, 14); // behind + above like your screenshot

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(-20, 25, 10);
sun.castShadow = false;
scene.add(sun);

// World groups
const world = new THREE.Group();
scene.add(world);

const roadGroup = new THREE.Group();
const decoGroup = new THREE.Group();
const coinGroup = new THREE.Group();
world.add(roadGroup, decoGroup, coinGroup);

// Materials (simple, clean, no copied assets)
const matRoad = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness:0.9, metalness:0.0 });
const matLine = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness:0.6 });
const matGrass = new THREE.MeshStandardMaterial({ color: 0x1ea64a, roughness:1.0 });
const matSideStripe = new THREE.MeshStandardMaterial({ color: 0xff7a18, roughness:0.8 });
const matBuilding = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness:0.85 });
const matBuilding2 = new THREE.MeshStandardMaterial({ color: 0x7f8ea3, roughness:0.85 });
const matTreeTrunk = new THREE.MeshStandardMaterial({ color: 0x7b4a2a, roughness:0.95 });
const matTreeTop = new THREE.MeshStandardMaterial({ color: 0x21c55d, roughness:0.9 });
const matCoin = new THREE.MeshStandardMaterial({ color: 0xffd54a, roughness:0.25, metalness:0.6 });

// Player car
const car = new THREE.Group();
world.add(car);

const carBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.7, 3.0),
  new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness:0.55, metalness:0.2 })
);
carBody.position.y = 0.7;
car.add(carBody);

const carCab = new THREE.Mesh(
  new THREE.BoxGeometry(1.3, 0.6, 1.4),
  new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness:0.45, metalness:0.25 })
);
carCab.position.set(0, 1.1, -0.1);
car.add(carCab);

function wheel(x,z){
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.28, 16),
    new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness:0.9 })
  );
  w.rotation.z = Math.PI/2;
  w.position.set(x, 0.35, z);
  return w;
}
car.add(wheel(-0.75,  1.1));
car.add(wheel( 0.75,  1.1));
car.add(wheel(-0.75, -1.1));
car.add(wheel( 0.75, -1.1));

const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.18,0.12), new THREE.MeshStandardMaterial({color:0xff3333, emissive:0x220000}));
tailL.position.set(-0.55, 0.7, -1.52);
const tailR = tailL.clone();
tailR.position.x = 0.55;
car.add(tailL, tailR);

// Road / environment generation (endless loop segments)
const SEG_LEN = 20;
const SEG_COUNT = 10;
const ROAD_W = 7.2;
const GRASS_W = 12;

const segments = [];
for(let i=0;i<SEG_COUNT;i++){
  const seg = makeSegment(i);
  seg.position.z = -i*SEG_LEN;
  roadGroup.add(seg);
  segments.push(seg);
}

// Coins list
let coins = []; // { mesh, z, laneX }
const lanes = [-2.2, 0, 2.2];

// Game state
let carX = 0;
let targetX = 0;
let speed = 0;       // world speed
let baseSpeed = 18;  // increases slowly
let score = 0;
let coinCount = 0;

const keys = { left:false, right:false, up:false, down:false };

function setNightMode(on){
  night = on;
  if(night){
    scene.fog.color.setHex(0x0b1020);
    hemi.intensity = 0.55;
    sun.intensity = 0.45;
    renderer.setClearColor(0x050812, 1);
    nightBtn.textContent = "Day Mode";
  } else {
    scene.fog.color.setHex(0x9fd5ff);
    hemi.intensity = 1.1;
    sun.intensity = 1.0;
    renderer.setClearColor(0x000000, 0);
    nightBtn.textContent = "Night Mode";
  }
}

nightBtn.addEventListener("click", () => setNightMode(!night));

// Menu buttons
startBtn.addEventListener("click", () => {
  menuEl.classList.add("hidden");
  creditsEl.classList.add("hidden");
  resetGame();
  running = true;
});
creditsBtn.addEventListener("click", () => {
  creditsEl.classList.remove("hidden");
  menuEl.classList.add("hidden");
});
backBtn.addEventListener("click", () => {
  creditsEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
});

// Controls
addEventListener("keydown", (e) => {
  if(e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if(e.code === "ArrowRight"|| e.code === "KeyD") keys.right = true;
  if(e.code === "ArrowUp"   || e.code === "KeyW") keys.up = true;
  if(e.code === "ArrowDown" || e.code === "KeyS") keys.down = true;

  if(!running && (e.code === "Enter" || e.code === "Space")){
    // quick start
    menuEl.classList.add("hidden");
    resetGame();
    running = true;
  }
});
addEventListener("keyup", (e) => {
  if(e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if(e.code === "ArrowRight"|| e.code === "KeyD") keys.right = false;
  if(e.code === "ArrowUp"   || e.code === "KeyW") keys.up = false;
  if(e.code === "ArrowDown" || e.code === "KeyS") keys.down = false;
});

function bindMobileBtn(btn){
  const act = btn.dataset.act;
  const down = () => { mobileState[act] = true; };
  const up = () => { mobileState[act] = false; };

  btn.addEventListener("pointerdown", (e)=>{ e.preventDefault(); down(); });
  btn.addEventListener("pointerup", (e)=>{ e.preventDefault(); up(); });
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
}
document.querySelectorAll(".mBtn").forEach(bindMobileBtn);

function resetGame(){
  carX = 0; targetX = 0;
  speed = 0;
  baseSpeed = 18;
  score = 0;
  coinCount = 0;
  coinCountEl.textContent = "0";
  scoreEl.textContent = "0";
  speedEl.textContent = "0";

  // clear old coins
  coins.forEach(c => coinGroup.remove(c.mesh));
  coins = [];
  // add some starting coins
  for(let i=0;i<18;i++) spawnCoin(-30 - i*12);
}

// Segment factory
function makeSegment(i){
  const g = new THREE.Group();

  // Road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, SEG_LEN), matRoad);
  road.rotation.x = -Math.PI/2;
  road.position.y = 0;
  road.position.z = -SEG_LEN/2;
  g.add(road);

  // Center lane line dashes
  for(let k=0;k<6;k++){
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.0), matLine);
    dash.position.set(0, 0.02, -1.5 - k*3.1);
    g.add(dash);
  }

  // Side grass
  const grassL = new THREE.Mesh(new THREE.PlaneGeometry(GRASS_W, SEG_LEN), matGrass);
  grassL.rotation.x = -Math.PI/2;
  grassL.position.set(-(ROAD_W/2 + GRASS_W/2), 0.001, -SEG_LEN/2);
  g.add(grassL);

  const grassR = grassL.clone();
  grassR.position.x = (ROAD_W/2 + GRASS_W/2);
  g.add(grassR);

  // Side stripe (orange)
  const stripeGeo = new THREE.BoxGeometry(0.25, 0.02, SEG_LEN);
  const stripeL = new THREE.Mesh(stripeGeo, matSideStripe);
  stripeL.position.set(-(ROAD_W/2 + 0.12), 0.03, -SEG_LEN/2);
  g.add(stripeL);

  const stripeR = stripeL.clone();
  stripeR.position.x = (ROAD_W/2 + 0.12);
  g.add(stripeR);

  // Decorations per segment: buildings + trees
  addBuildingsAndTrees(g, i);

  return g;
}

function addBuildingsAndTrees(seg, i){
  const zBase = -SEG_LEN/2;

  // Buildings (both sides)
  const bCount = 5;
  for(let n=0;n<bCount;n++){
    const h = 3 + Math.random()*10;
    const w = 2.8 + Math.random()*3.8;
    const d = 2.8 + Math.random()*3.8;
    const mat = Math.random() < 0.5 ? matBuilding : matBuilding2;

    const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    b.position.set(-(ROAD_W/2 + 7 + Math.random()*7), h/2, zBase + (Math.random()*SEG_LEN - SEG_LEN/2));
    seg.add(b);

    const b2 = b.clone();
    b2.position.x = (ROAD_W/2 + 7 + Math.random()*7);
    seg.add(b2);
  }

  // Trees rows
  const tCount = 7;
  for(let n=0;n<tCount;n++){
    const z = zBase + (Math.random()*SEG_LEN - SEG_LEN/2);
    seg.add(makeTree(-(ROAD_W/2 + 3.0 + Math.random()*2.0), z));
    seg.add(makeTree((ROAD_W/2 + 3.0 + Math.random()*2.0), z));
  }
}

function makeTree(x,z){
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,1.4,10), matTreeTrunk);
  trunk.position.set(0, 0.7, 0);
  t.add(trunk);

  const top = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 16), matTreeTop);
  top.position.set(0, 1.7, 0);
  t.add(top);

  t.position.set(x, 0, z);
  return t;
}

// Coins
function spawnCoin(z){
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.18, 16, 24), matCoin);
  ring.rotation.x = Math.PI/2;
  ring.position.set(lanes[(Math.random()*lanes.length)|0], 0.9, z);
  coinGroup.add(ring);

  coins.push({ mesh:ring, z, laneX: ring.position.x });
}

function updateCoins(dt, dz){
  // move coins toward camera (world moves forward)
  for(let i=coins.length-1;i>=0;i--){
    const c = coins[i];
    c.mesh.position.z += dz;
    c.mesh.rotation.z += dt * 3.5;

    // collect check (simple box distance)
    const dx = c.mesh.position.x - carX;
    const dzc = c.mesh.position.z - car.position.z; // car z ~ 0
    const dist = Math.hypot(dx, dzc);
    if(dist < 1.1){
      coinCount++;
      coinCountEl.textContent = String(coinCount);
      coinGroup.remove(c.mesh);
      coins.splice(i,1);
      continue;
    }

    // if passed camera, remove
    if(c.mesh.position.z > 18){
      coinGroup.remove(c.mesh);
      coins.splice(i,1);
    }
  }

  // keep enough coins ahead
  while(coins.length < 18){
    const farZ = -120 - Math.random()*140;
    spawnCoin(farZ);
  }
}

// Resize
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
});

// Animation loop
let last = performance.now();
car.position.z = 0;

function tick(now){
  const dt = Math.min(0.033, (now - last)/1000);
  last = now;

  // Input merge
  const left = keys.left || mobileState.left;
  const right = keys.right || mobileState.right;
  const up = keys.up || mobileState.up;
  const down = keys.down || mobileState.down;

  if(running){
    // accelerate / brake
    const accel = up ? 26 : 0;
    const brake = down ? 34 : 0;

    baseSpeed += dt * 0.25; // slowly ramps over time
    const targetSpeed = baseSpeed + accel - brake;
    speed += (targetSpeed - speed) * (dt * 2.2);
    speed = Math.max(6, Math.min(60, speed));

    // steering
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    targetX += steer * dt * 7.0;
    targetX = Math.max(-2.6, Math.min(2.6, targetX));
    carX += (targetX - carX) * (dt * 8.5);

    car.position.x = carX;
    car.rotation.y = -carX * 0.08;     // subtle drift feel
    car.rotation.z = -steer * 0.08;

    // Move segments forward (endless)
    const dz = speed * dt;
    for(const seg of segments){
      seg.position.z += dz;
      if(seg.position.z > SEG_LEN){
        // recycle to front
        seg.position.z -= SEG_LEN * SEG_COUNT;
      }
    }

    // Update coins and score
    updateCoins(dt, dz);
    score += dz * 0.7;
    scoreEl.textContent = String(Math.floor(score));
    speedEl.textContent = String(Math.floor(speed * 3.2)); // approx km/h feel

    // Camera follows (locked behind angle)
    const camTarget = new THREE.Vector3(carX * 0.25, 1.2, -2);
    camera.lookAt(camTarget);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

setNightMode(false);
requestAnimationFrame(tick);
