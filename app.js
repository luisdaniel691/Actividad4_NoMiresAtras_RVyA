import * as THREE from 'three';

// NO MIRES ATRÁS — videojuego de horror AR sin marcadores.
// La escena AR usa WebXR hit-test en dispositivos compatibles. Si no está disponible,
// el juego arranca en modo simulación 3D para probar las mecánicas.

const $ = (id) => document.getElementById(id);
const ui = {
  menuScreen: $('menuScreen'), instructions: $('instructionsScreen'), scan: $('scanScreen'), hud: $('gameHud'),
  pause: $('pauseScreen'), gameOver: $('gameOverScreen'), levelBanner: $('levelBanner'),
  start: $('startButton'), instructionsBtn: $('instructionsButton'), back: $('backButton'),
  startFromInstructions: $('startFromInstructions'), place: $('placeArenaButton'), simulation: $('simulationButton'),
  modeLabel: $('modeLabel'), scanTitle: $('scanTitle'), scanDescription: $('scanDescription'), scanStatus: $('scanStatus'),
  levelCaption: $('hudLevelCaption'), levelName: $('hudLevelName'), timer: $('timerValue'), timeProgress: $('timeProgress'),
  keys: $('keyCount'), weapon: $('weaponStatus'), ammo: $('ammoCount'), pauseBtn: $('pauseButton'), resume: $('resumeButton'), quit: $('quitButton'),
  fire: $('fireButton'), pickup: $('pickupButton'), fireSubtext: $('fireSubtext'), hint: $('interactionHint'), toast: $('gameToast'),
  movement: $('movementPad'), modeNotice: $('modeNotice'), flash: $('screenFlash'),
  result: $('gameOverScreen'), resultSymbol: $('resultSymbol'), resultKicker: $('resultKicker'), resultTitle: $('resultTitle'),
  resultDescription: $('resultDescription'), resultKeys: $('resultKeys'), resultLevel: $('resultLevel'), retry: $('retryButton'), menuButton: $('menuButton'),
  bannerSmall: $('bannerSmall'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub')
};

const LEVELS = {
  1: { name: 'EL PRIMER RASTRO', duration: 75, speed: 0.24, startZ: -1.95, ammoPacks: 3, roundsPerPack: 2, monsterCount: 1, keys: 3, banner: 'No apartes la mirada.' },
  2: { name: 'ALGO SE DESPIERTA', duration: 65, speed: 0.36, startZ: -1.85, ammoPacks: 2, roundsPerPack: 2, monsterCount: 1, keys: 3, banner: 'El silencio ya no es una ventaja.' },
  3: { name: 'NO HAY ESCAPE', duration: 55, speed: 0.52, startZ: -1.72, ammoPacks: 1, roundsPerPack: 2, monsterCount: 1, keys: 3, banner: 'Quedan pocas balas. Y menos tiempo.' },
  4: { name: 'DOS DIRECCIONES', duration: 36, speed: 2.65, startZ: -1.8, ammoPacks: 0, roundsPerPack: 0, monsterCount: 2, keys: 3, banner: 'Esto no termina aquí.' }
};
// Las llaves rodean al jugador: hay que girar para encontrarlas, pero quedan
// dentro del perímetro rojo y a distancias alcanzables desde el centro.
const LEVEL_KEYS = {
  1: [[-0.92, 0.58, -0.82], [1.28, 0.58, -0.18], [-0.38, 0.58, 1.38]],
  2: [[1.12, 0.58, -0.72], [-1.34, 0.58, -0.08], [0.54, 0.58, 1.30]],
  3: [[-1.28, 0.58, -0.38], [1.28, 0.58, 0.48], [-0.48, 0.58, 1.48]],
  4: [[-0.92, 0.58, -0.82], [1.28, 0.58, -0.18], [-0.38, 0.58, 1.38]]
};

let renderer, scene, camera, reticle, arenaRoot, arenaDecor, simulationFloor, accentLight, goldLight;
let mode = 'menu'; // menu | ar | sim
let gameState = 'menu'; // menu | scanning | playing | paused | ended
let activeSession = null;
let hitTestSource = null;
let cameraFallbackStream = null;
let cameraFallbackActive = false;
let launchInProgress = false;
let viewerSpace = null;
let placedArena = false;
let currentLevel = 1;
let remainingTime = LEVELS[1].duration;
let collectedKeys = 0;
let hasWeapon = false;
let ammo = 0;
let monsters = [];
let collectibles = [];
let raycaster = new THREE.Raycaster();
let pointerNdc = new THREE.Vector2(0, 0);
let lastFrameTime = 0;
let toastTimeout = null;
let bannerTimeout = null;
let growlCooldown = 0;
let dragStart = null;
let dragMoved = false;
let viewYaw = 0;
let viewPitch = 0;
let endTeaserTimer = null;

const audioFiles = {
  ambience: './assets/audio/ambience_loop.wav',
  key: './assets/audio/pickup_key.wav',
  item: './assets/audio/pickup_item.wav',
  gunshot: './assets/audio/gunshot.wav',
  growl: './assets/audio/monster_growl.wav',
  level: './assets/audio/level_up.wav',
  gameover: './assets/audio/game_over.wav',
  empty: './assets/audio/empty_click.wav'
};
const audio = {};

function initAudio() {
  if (audio.ambience) return;
  for (const [key, url] of Object.entries(audioFiles)) {
    const a = new Audio(url);
    a.preload = key === 'ambience' ? 'auto' : 'metadata';
    a.volume = key === 'ambience' ? 0.3 : 0.7;
    if (key === 'ambience') a.loop = true;
    audio[key] = a;
  }
}
function startAmbience() {
  initAudio();
  const p = audio.ambience?.play();
  if (p?.catch) p.catch(() => {});
}
function stopAmbience() {
  if (!audio.ambience) return;
  audio.ambience.pause();
  try { audio.ambience.currentTime = 0; } catch (_) {}
}
function stopCameraFallback() {
  const video = $('cameraFallback');
  if (cameraFallbackStream) {
    cameraFallbackStream.getTracks().forEach(track => track.stop());
    cameraFallbackStream = null;
  }
  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.remove('active');
  }
  cameraFallbackActive = false;
}
function playSound(key, volume = 1) {
  initAudio();
  const a = audio[key];
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
    a.volume = Math.min(1, (key === 'ambience' ? 0.3 : 0.7) * volume);
    const p = a.play();
    if (p?.catch) p.catch(() => {});
  } catch (_) { /* El juego sigue aunque el navegador bloquee audio. */ }
}

function initThree() {
  if (renderer) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, 0.05, 70);
  camera.position.set(0, 1.62, 0);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.domElement.style.background = 'transparent';
  renderer.domElement.style.opacity = '1';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.setAttribute('aria-label', 'Vista del juego 3D y realidad aumentada');
  $('gameRoot').appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xd6d8df, 0x251b22, 2.1);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xe2e4ff, 2.5);
  moonLight.position.set(-3, 7, 4);
  scene.add(moonLight);
  accentLight = new THREE.PointLight(0xfa2628, 10, 9, 2);
  accentLight.position.set(0, 2.1, -2.5);
  accentLight.userData.isAccent = true;
  accentLight.visible = false;
  scene.add(accentLight);
  goldLight = new THREE.PointLight(0xe7ba69, 4, 6, 2);
  goldLight.position.set(2, 1.6, -1.5);
  goldLight.visible = false;
  scene.add(goldLight);

  arenaRoot = new THREE.Group();
  arenaRoot.name = 'Arena anclada al plano detectado';
  arenaDecor = new THREE.Group();
  arenaRoot.add(arenaDecor);

  const reticleGeo = new THREE.TorusGeometry(0.32, 0.012, 6, 40);
  // El hit-test orienta el eje +Y hacia la normal de la superficie;
  // se rota la geometría (no la pose) para que el aro quede apoyado en el suelo.
  reticleGeo.rotateX(Math.PI / 2);
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0xe4be72, transparent: true, opacity: 0.95 });
  reticle = new THREE.Mesh(reticleGeo, reticleMat);
  reticle.rotation.set(0, 0, 0);
  reticle.visible = false;
  reticle.matrixAutoUpdate = true;
  scene.add(reticle);

  renderer.setAnimationLoop(renderFrame);
  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown, { passive: false });
  renderer.domElement.addEventListener('pointermove', onCanvasPointerMove, { passive: false });
  renderer.domElement.addEventListener('pointerup', onCanvasPointerUp, { passive: false });
  window.addEventListener('resize', resizeRenderer);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
}

function showOnly(which) {
  [ui.menuScreen, ui.instructions, ui.scan, ui.pause, ui.gameOver].forEach(s => s.classList.add('hidden'));
  ui.hud.classList.add('hidden');
  if (which) which.classList.remove('hidden');
}
function showHUD() {
  ui.scan.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
  ui.menuScreen.classList.add('hidden');
  ui.instructions.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.hud.classList.toggle('ar-mode', mode === 'ar');
  ui.modeNotice.classList.toggle('hidden', mode !== 'sim');
  ui.movement.classList.toggle('hidden', mode === 'ar');
  ui.hint.textContent = mode === 'ar' ? 'Toca el objeto o céntralo y pulsa RECOGER' : (cameraFallbackActive ? 'Toca un objeto o usa RECOGER · cámara simulada' : 'Mira el objeto y pulsa RECOGER');
}

async function launchGame() {
  if (launchInProgress) return;
  launchInProgress = true;
  ui.start.disabled = true;
  ui.startFromInstructions.disabled = true;
  initThree();
  initAudio();
  startAmbience();
  ui.levelBanner.classList.add('hidden');
  ui.menuScreen.classList.add('hidden');
  ui.instructions.classList.add('hidden');

  // Primero intentamos RA real. Si el dispositivo no la puede componer correctamente,
  // mostramos una vista de cámara en vivo con simulación en lugar de una pantalla negra.
  try {
    await startARSession();
  } catch (error) {
    console.info('WebXR AR no disponible; se intentará la cámara en vivo.', error?.message || error);
    if (activeSession) {
      const failedSession = activeSession;
      activeSession = null;
      failedSession.removeEventListener('end', onXRSessionEnd);
      try { await failedSession.end(); } catch (_) {}
    }
    hitTestSource = null;
    viewerSpace = null;
    try {
      await startCameraSimulation(true);
    } catch (cameraError) {
      console.warn('No fue posible abrir la cámara de respaldo.', cameraError?.message || cameraError);
      stopCameraFallback();
      startSimulation(true, false);
    }
  } finally {
    launchInProgress = false;
    ui.start.disabled = false;
    ui.startFromInstructions.disabled = false;
  }
}

async function startARSession() {
  if (!navigator.xr?.requestSession) throw new Error('Este navegador no expone WebXR.');
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['local'],
    optionalFeatures: ['hit-test', 'dom-overlay', 'anchors'],
    domOverlay: { root: $('uiRoot') }
  });
  activeSession = session;
  // Algunos entornos no ofrecen composición transparente. En ese caso usamos la
  // cámara de respaldo, en vez de presentar una escena negra que oculte el entorno.
  if (session.environmentBlendMode === 'opaque') {
    activeSession = null;
    try { await session.end(); } catch (_) {}
    throw new Error('La sesión AR no ofrece composición transparente.');
  }

  mode = 'ar';
  gameState = 'scanning';
  cameraFallbackActive = false;
  $('cameraFallback').classList.remove('active');
  scene.background = null;
  scene.fog = null;
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  removeSimulationFloor();
  ui.modeLabel.textContent = 'RA SIN MARCADORES';
  ui.scanTitle.innerHTML = 'BUSCANDO<br>SUPERFICIE';
  ui.scanDescription.textContent = 'Apunta al suelo y mueve el teléfono lentamente. Si el aro no aparece, puedes colocar la arena de forma aproximada con el botón.';
  ui.scanStatus.textContent = 'MUEVE EL TELÉFONO LENTAMENTE';
  ui.place.disabled = false;
  ui.place.textContent = 'COLOCAR ARENA';
  ui.simulation.classList.remove('hidden');
  showOnly(ui.scan);
  ui.hud.classList.add('hidden');
  reticle.visible = false;
  placedArena = false;

  await renderer.xr.setSession(session);
  viewerSpace = await session.requestReferenceSpace('viewer');
  try {
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  } catch (error) {
    hitTestSource = null;
    ui.scanStatus.textContent = 'DETECCIÓN NO DISPONIBLE · PUEDES COLOCAR LA ARENA';
    ui.scanDescription.textContent = 'Este navegador inició RA, pero no ofrece detección automática de superficies. Toca “Colocar arena” para usar una ubicación aproximada.';
  }
  session.addEventListener('select', onXRSelect);
  session.addEventListener('end', onXRSessionEnd, { once: true });
}

async function startCameraSimulation(showNotice = true) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara no está disponible en este navegador.');
  stopCameraFallback();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });
  cameraFallbackStream = stream;
  const video = $('cameraFallback');
  video.srcObject = stream;
  video.classList.add('active');
  await video.play();
  startSimulation(showNotice, true);
}

function onXRSessionEnd() {
  hitTestSource = null;
  viewerSpace = null;
  const hadGameplay = gameState !== 'menu';
  activeSession = null;
  if (hadGameplay) goToMenu(false);
}

function startSimulation(showNotice = false, useCameraFallback = false) {
  initThree();
  mode = 'sim';
  activeSession = null;
  hitTestSource = null;
  viewerSpace = null;
  cameraFallbackActive = Boolean(useCameraFallback);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  if (cameraFallbackActive) {
    // La cámara de vídeo queda detrás del canvas; los objetos 3D se dibujan con alfa.
    scene.background = null;
    scene.fog = null;
    removeSimulationFloor();
  } else {
    scene.background = new THREE.Color(0x07080d);
    scene.fog = new THREE.Fog(0x07080d, 13, 36);
    createSimulationFloor();
    stopCameraFallback();
  }
  camera.position.set(0, 1.62, 0);
  camera.rotation.set(0, 0, 0);
  viewYaw = 0;
  viewPitch = 0;
  reticle.visible = false;
  placedArena = true;
  arenaRoot.position.set(0, 0, 0);
  arenaRoot.quaternion.identity();
  if (!arenaRoot.parent) scene.add(arenaRoot);
  ui.modeNotice.classList.toggle('hidden', !(showNotice || cameraFallbackActive));
  if (cameraFallbackActive) {
    ui.modeNotice.textContent = 'CÁMARA EN VIVO · SIMULACIÓN SIN ANCLAJE AR';
  } else if (showNotice) {
    ui.modeNotice.textContent = 'MODO SIMULACIÓN · ESTE NAVEGADOR NO DISPONE DE RA WEBXR';
  } else {
    ui.modeNotice.textContent = 'MODO SIMULACIÓN · SIN CÁMARA AR';
  }
  setupLevel(1);
  showHUD();
  showBanner(1);
}

function createSimulationFloor() {
  removeSimulationFloor();
  const grid = new THREE.GridHelper(44, 44, 0x5b252c, 0x302329);
  grid.position.y = -0.015;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.94, metalness: 0.04, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  simulationFloor = new THREE.Group();
  simulationFloor.add(grid, floor);
  scene.add(simulationFloor);
}
function removeSimulationFloor() {
  if (!simulationFloor) return;
  simulationFloor.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
      else node.material.dispose();
    }
  });
  scene.remove(simulationFloor);
  simulationFloor = null;
}

function onXRSelect() {
  if (gameState === 'scanning') {
    placeArenaAtReticle();
  }
}
function placeArenaAtReticle() {
  if (mode !== 'ar' || gameState !== 'scanning') return;

  // IMPORTANTE: el círculo se centra bajo el jugador, no en el punto al que
  // está apuntando la cámara. El hit-test se usa para conocer la altura del piso.
  // Así el jugador comienza dentro del círculo y la arena permanece anclada al mundo.
  const xrCamera = renderer.xr.getCamera(camera);
  const viewerPosition = new THREE.Vector3();
  const viewerQuaternion = new THREE.Quaternion();
  xrCamera.getWorldPosition(viewerPosition);
  xrCamera.getWorldQuaternion(viewerQuaternion);

  const floorY = reticle.visible ? reticle.position.y : viewerPosition.y - 1.62;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerQuaternion);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  arenaRoot.position.set(viewerPosition.x, floorY, viewerPosition.z);
  const yaw = Math.atan2(-forward.x, -forward.z);
  arenaRoot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  if (!reticle.visible) {
    ui.scanStatus.textContent = 'ARENA CENTRADA EN TU POSICIÓN · COLOCACIÓN APROXIMADA';
  }
  if (!arenaRoot.parent) scene.add(arenaRoot);
  placedArena = true;
  reticle.visible = false;
  setupLevel(1);
  showHUD();
  ui.modeNotice.classList.add('hidden');
  showBanner(1);
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[group.children.length - 1];
    group.remove(child);
    child.traverse?.(node => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material.dispose();
      }
    });
  }
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.55, metalness: options.metalness ?? 0.1, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 0, transparent: options.transparent ?? false, opacity: options.opacity ?? 1 });
}
function addMesh(parent, geometry, mat, x, y, z, scale = null) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}
function makeKey() {
  const g = new THREE.Group();
  const gold = material(0xffcf67, { metalness: 0.7, roughness: 0.28, emissive: 0x7c3b00, emissiveIntensity: 0.8 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 22), gold);
  ring.position.set(0.04, 0.10, 0.02);
  g.add(ring);
  const shaft = addMesh(g, new THREE.CylinderGeometry(0.027, 0.027, 0.25, 9), gold, 0.04, -0.035, 0.02);
  shaft.rotation.z = Math.PI / 2;
  addMesh(g, new THREE.BoxGeometry(0.085, 0.07, 0.065), gold, 0.17, -0.09, 0.02);
  addMesh(g, new THREE.BoxGeometry(0.06, 0.11, 0.055), gold, -0.025, -0.13, 0.02);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.009, 5, 36), new THREE.MeshBasicMaterial({ color: 0xffc95d, transparent: true, opacity: 0.72 }));
  halo.position.z = -0.04;
  g.add(halo);
  const hitArea = addMesh(g, new THREE.SphereGeometry(0.48, 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0);
  hitArea.userData.pickArea = true;
  g.userData.collectibleType = 'key';
  g.userData.collected = false;
  g.userData.animationOffset = Math.random() * Math.PI * 2;
  return g;
}
function makePistol() {
  const g = new THREE.Group();
  const gunMetal = material(0x293039, { metalness: 0.72, roughness: 0.26, emissive: 0x131e28, emissiveIntensity: 0.6 });
  const redLine = material(0xeb3934, { metalness: 0.2, emissive: 0x8f1512, emissiveIntensity: 0.55 });
  addMesh(g, new THREE.BoxGeometry(0.43, 0.12, 0.16), gunMetal, 0.0, 0.04, 0.0);
  addMesh(g, new THREE.BoxGeometry(0.27, 0.065, 0.13), material(0x59616b, { metalness: 0.8 }), -0.06, 0.12, 0.0);
  addMesh(g, new THREE.BoxGeometry(0.14, 0.23, 0.12), gunMetal, -0.03, -0.105, 0.005).rotation.z = -0.24;
  addMesh(g, new THREE.BoxGeometry(0.13, 0.035, 0.025), redLine, 0.08, 0.135, 0.065);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.009, 5, 36), new THREE.MeshBasicMaterial({ color: 0xe7ecf1, transparent: true, opacity: 0.65 }));
  halo.position.z = -0.05;
  g.add(halo);
  addMesh(g, new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0).userData.pickArea = true;
  g.userData.collectibleType = 'weapon';
  g.userData.collected = false;
  g.userData.animationOffset = Math.random() * Math.PI * 2;
  return g;
}
function makeAmmoBox() {
  const g = new THREE.Group();
  const boxMat = material(0x4b251e, { metalness: 0.2, roughness: 0.62, emissive: 0x3b0b08, emissiveIntensity: 0.25 });
  const brass = material(0xf2c06b, { metalness: 0.78, roughness: 0.24 });
  addMesh(g, new THREE.BoxGeometry(0.33, 0.22, 0.23), boxMat, 0, 0, 0);
  addMesh(g, new THREE.BoxGeometry(0.35, 0.035, 0.25), brass, 0, 0.11, 0);
  for (let i = 0; i < 3; i++) {
    const bullet = addMesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), brass, -0.09 + i * 0.09, 0.17, 0.015);
    bullet.rotation.z = Math.PI / 2;
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.009, 5, 32), new THREE.MeshBasicMaterial({ color: 0xff735d, transparent: true, opacity: 0.66 }));
  halo.position.z = -0.05;
  g.add(halo);
  addMesh(g, new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0).userData.pickArea = true;
  g.userData.collectibleType = 'ammo';
  g.userData.collected = false;
  g.userData.animationOffset = Math.random() * Math.PI * 2;
  return g;
}

function makeClown(variant = 0) {
  const g = new THREE.Group();
  g.userData.isMonster = true;
  g.userData.variant = variant;
  const suitMat = material(variant === 0 ? 0x25252f : 0x30171c, { roughness: 0.64, emissive: variant === 0 ? 0x170507 : 0x350307, emissiveIntensity: 0.38 });
  const suitStripe = material(variant === 0 ? 0x9f1f25 : 0x8a1c3b, { metalness: 0.16, emissive: 0x4f080e, emissiveIntensity: 0.7 });
  const skinMat = material(variant === 0 ? 0xd7c9bb : 0xbfc7cc, { roughness: 0.88 });
  const dark = material(0x07080b, { roughness: 0.3 });
  const red = material(0xe82a32, { roughness: 0.35, emissive: 0xb90015, emissiveIntensity: 1.55 });
  const teeth = material(0xf5e7d4, { roughness: 0.72 });
  const head = addMesh(g, new THREE.SphereGeometry(0.37, 18, 14), skinMat, 0, 1.35, 0, [1, 1.08, 0.75]);
  head.userData.monsterPart = 'head';
  // Cuello y ropa.
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.13, 0.2, 10), suitMat, 0, 0.98, 0);
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.35, 0.82, 11), suitMat, 0, 0.62, 0);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 8, 18), teeth);
  collar.position.set(0, 0.96, 0.04);
  g.add(collar);
  const stripe = addMesh(g, new THREE.BoxGeometry(0.105, 0.62, 0.025), suitStripe, 0, 0.58, 0.31);
  stripe.rotation.z = 0.09;
  // Brazos, guantes y piernas.
  for (const sign of [-1, 1]) {
    const arm = addMesh(g, new THREE.CylinderGeometry(0.075, 0.085, 0.62, 8), suitMat, sign * 0.39, 0.65, 0.01);
    arm.rotation.z = sign * -0.42;
    const hand = addMesh(g, new THREE.SphereGeometry(0.095, 9, 8), skinMat, sign * 0.54, 0.34, 0.02);
    const leg = addMesh(g, new THREE.CylinderGeometry(0.09, 0.105, 0.4, 8), suitMat, sign * 0.16, 0.17, 0);
    leg.rotation.z = sign * 0.09;
    addMesh(g, new THREE.BoxGeometry(0.2, 0.10, 0.31), dark, sign * 0.17, 0.045, 0.08);
  }
  // Cabello de payaso y maquillaje facial mirando hacia +Z.
  addMesh(g, new THREE.SphereGeometry(0.17, 10, 10), suitStripe, -0.34, 1.48, 0.00, [1, 1.0, 0.9]);
  addMesh(g, new THREE.SphereGeometry(0.17, 10, 10), suitStripe, 0.34, 1.48, 0.00, [1, 1.0, 0.9]);
  addMesh(g, new THREE.ConeGeometry(0.17, 0.24, 9), variant === 0 ? red : suitStripe, 0, 1.74, 0.0);
  for (const sign of [-1, 1]) {
    addMesh(g, new THREE.SphereGeometry(0.105, 12, 10), dark, sign * 0.135, 1.41, 0.276, [1.15, 0.82, 0.46]);
    const eye = addMesh(g, new THREE.SphereGeometry(0.046, 10, 8), red, sign * 0.135, 1.412, 0.311, [1, 1, 0.45]);
    eye.material.emissiveIntensity = 2.0;
    addMesh(g, new THREE.SphereGeometry(0.07, 9, 8), red, sign * 0.08, 1.25, 0.275, [1.2, 1.4, 0.5]);
  }
  addMesh(g, new THREE.SphereGeometry(0.085, 12, 10), red, 0, 1.29, 0.32, [0.9, 1.15, 0.82]);
  // Boca curva abierta y dientes.
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 22, Math.PI), red);
  mouth.position.set(0, 1.12, 0.276);
  mouth.rotation.z = Math.PI;
  mouth.scale.set(1.1, 0.8, 0.42);
  g.add(mouth);
  addMesh(g, new THREE.BoxGeometry(0.25, 0.045, 0.035), teeth, 0, 1.095, 0.302);
  for (const x of [-0.075, 0, 0.075]) addMesh(g, new THREE.BoxGeometry(0.022, 0.052, 0.018), dark, x, 1.095, 0.325);
  // Contorno flotante rojo: ayuda a percibir la amenaza en cámara.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.012, 5, 28), new THREE.MeshBasicMaterial({ color: variant === 0 ? 0xe92b31 : 0xd73e78, transparent: true, opacity: 0.52 }));
  halo.position.set(0, 1.15, -0.06);
  halo.scale.set(0.88, 1.1, 0.5);
  g.add(halo);
  g.userData.head = head;
  g.userData.arms = g.children.filter(c => c.geometry && c.geometry.type === 'CylinderGeometry').slice(1, 3);
  g.userData.halo = halo;
  return g;
}

function addCollectible(group, position) {
  group.position.set(position[0], position[1], position[2]);
  const itemType = group.userData.collectibleType;
  group.scale.setScalar(itemType === 'weapon' ? 1.75 : itemType === 'ammo' ? 1.45 : 1.35);
  group.userData.baseY = position[1];
  arenaRoot.add(group);
  collectibles.push(group);
  return group;
}

function createArenaDecor() {
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.012, 5, 80), new THREE.MeshBasicMaterial({ color: 0x8f272c, transparent: true, opacity: mode === 'ar' ? 0.48 : 0.62 }));
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.025;
  arenaDecor.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.006, 4, 80), new THREE.MeshBasicMaterial({ color: 0xd0a05c, transparent: true, opacity: 0.34 }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.028;
  arenaDecor.add(ring2);
  const sigils = new THREE.Group();
  const sigilMat = new THREE.MeshBasicMaterial({ color: 0x9a4240, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.008, 0.025), sigilMat);
    mark.position.set(Math.cos(a) * 2.35, 0.03, Math.sin(a) * 2.35);
    mark.rotation.y = -a;
    sigils.add(mark);
  }
  arenaDecor.add(sigils);
}

function setupLevel(level) {
  currentLevel = level;
  const config = LEVELS[level];
  gameState = 'playing';
  remainingTime = config.duration;
  collectedKeys = 0;
  hasWeapon = false;
  ammo = 0;
  growlCooldown = 3.2;
  clearTimeout(endTeaserTimer);
  clearGroup(arenaRoot);
  arenaDecor = new THREE.Group();
  arenaRoot.add(arenaDecor);
  collectibles = [];
  monsters = [];
  createArenaDecor();

  const keyPositions = LEVEL_KEYS[level];
  keyPositions.forEach(pos => addCollectible(makeKey(), pos));

  if (level !== 4) {
    addCollectible(makePistol(), [0.42, 0.28, -0.88 - (level === 3 ? 0.18 : 0)]);
    const ammoPositions = [
      [-1.55, 0.25, -0.05],
      [1.30, 0.25, 0.92],
      [-0.22, 0.25, 1.72]
    ];
    for (let i = 0; i < config.ammoPacks; i++) addCollectible(makeAmmoBox(), ammoPositions[i]);
  }

  if (level < 4) {
    const monster = makeClown(0);
    monster.position.set(0.0, 0, config.startZ);
    monster.userData.speed = config.speed;
    monster.userData.lastShotAt = 0;
    arenaRoot.add(monster);
    monsters.push(monster);
  } else {
    const left = makeClown(1);
    left.scale.setScalar(1.03);
    left.position.set(-1.88, 0, -0.22);
    left.userData.speed = config.speed;
    left.userData.lastShotAt = 0;
    arenaRoot.add(left);
    monsters.push(left);
    const right = makeClown(0);
    right.scale.setScalar(1.08);
    right.position.set(1.52, 0, 1.12);
    right.userData.speed = config.speed * 1.07;
    right.userData.lastShotAt = 0;
    arenaRoot.add(right);
    monsters.push(right);
    // El cuarto nivel es un avance narrativo, no un nivel diseñado para ganarse.
    endTeaserTimer = window.setTimeout(() => {
      if (gameState === 'playing' && currentLevel === 4) finishTeaser();
    }, 34000);
  }

  updateHUD();
  showHUD();
  ui.hint.textContent = mode === 'ar' ? 'Toca el objeto o céntralo y pulsa RECOGER' : (cameraFallbackActive ? 'Toca un objeto o usa RECOGER · cámara simulada' : 'Usa las flechas para moverte; pulsa RECOGER mirando el objeto');
  ui.fireSubtext.textContent = level === 4 ? 'SIN MUNICIÓN · CORRE' : 'ARMA NO ENCONTRADA';
}

function showBanner(level) {
  const config = LEVELS[level];
  ui.bannerSmall.textContent = level === 4 ? 'ADELANTO · PARTE II' : `NIVEL ${String(level).padStart(2, '0')}`;
  ui.bannerTitle.textContent = config.name;
  ui.bannerSub.textContent = level === 4 ? 'Dos siluetas. Ningún lugar seguro.' : config.banner;
  ui.levelBanner.classList.remove('hidden');
  clearTimeout(bannerTimeout);
  bannerTimeout = window.setTimeout(() => ui.levelBanner.classList.add('hidden'), level === 4 ? 2400 : 1900);
  if (level > 1) playSound('level', 0.9);
}

function updateHUD() {
  const cfg = LEVELS[currentLevel];
  ui.levelCaption.textContent = currentLevel === 4 ? 'ADELANTO · PARTE II' : `NIVEL ${String(currentLevel).padStart(2, '0')}`;
  ui.levelName.textContent = cfg.name;
  ui.keys.textContent = `${collectedKeys}/3`;
  ui.weapon.textContent = hasWeapon ? 'SÍ' : 'NO';
  ui.ammo.textContent = String(ammo);
  ui.timer.textContent = formatTime(remainingTime);
  ui.timeProgress.style.width = `${Math.max(0, remainingTime / cfg.duration) * 100}%`;
  ui.timeProgress.style.background = remainingTime < 12 ? '#ff3b31' : 'linear-gradient(90deg, #ef352f, #efad70)';
  ui.fireSubtext.textContent = hasWeapon ? (ammo > 0 ? `${ammo} BALAS · APUNTA AL MONSTRUO` : 'SIN MUNICIÓN') : 'ARMA NO ENCONTRADA';
  ui.fire.disabled = !hasWeapon || ammo < 1 || currentLevel === 4;
  if (currentLevel === 4) ui.fireSubtext.textContent = 'SIN MUNICIÓN · CORRE';
}
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function toast(message, duration = 1700) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => ui.toast.classList.remove('show'), duration);
}
function flashScreen() {
  ui.flash.classList.remove('flash');
  // Fuerza el reinicio de la animación CSS para disparos repetidos.
  void ui.flash.offsetWidth;
  ui.flash.classList.add('flash');
}

function findCollectibleRoot(object) {
  let node = object;
  while (node) {
    if (node.userData?.collectibleType && !node.userData.collected) return node;
    node = node.parent;
  }
  return null;
}
function getPickCameras() {
  if (renderer?.xr?.isPresenting) {
    const xrCamera = renderer.xr.getCamera(camera);
    if (xrCamera.cameras?.length) return xrCamera.cameras;
    return [xrCamera];
  }
  return [camera];
}
function nearestCollectibleToPoint(ndc = new THREE.Vector2(0, 0), maxRadius = 0.48) {
  if (!renderer || !camera) return null;
  const views = getPickCameras();
  views.forEach(view => view.updateMatrixWorld(true));
  const candidates = collectibles.filter(o => !o.userData.collected && o.visible);
  let chosen = null;
  let best = Infinity;
  for (const item of candidates) {
    const world = item.getWorldPosition(new THREE.Vector3());
    let screenBest = Infinity;
    let inView = false;
    for (const view of views) {
      const projected = world.clone().project(view);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.08 || Math.abs(projected.y) > 1.08) continue;
      inView = true;
      const d = Math.hypot(projected.x - ndc.x, projected.y - ndc.y);
      screenBest = Math.min(screenBest, d);
    }
    if (!inView || screenBest > maxRadius) continue;
    // Favor the closest screen-space target; its enlarged invisible hit sphere makes taps forgiving.
    if (screenBest < best) { best = screenBest; chosen = item; }
  }
  return chosen;
}
function nearestCollectibleInView() {
  // Selection is centered on the crosshair. A larger radius makes the mobile control usable.
  return nearestCollectibleToPoint(new THREE.Vector2(0, 0), 0.55);
}
function handleCanvasTap(clientX, clientY) {
  if (gameState === 'scanning') {
    placeArenaAtReticle();
    return;
  }
  if (gameState !== 'playing' || !renderer || !camera) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  const hits = [];
  // Exact raycasting is fast in simulation and helps select the precise object touched.
  // WebXR mobile views can have per-eye cameras, so a projected-screen fallback follows it.
  const pickCamera = getPickCameras()[0];
  camera.updateMatrixWorld(true);
  pickCamera.updateMatrixWorld(true);
  raycaster.setFromCamera(pointerNdc, pickCamera);
  hits.push(...raycaster.intersectObjects(collectibles.filter(o => !o.userData.collected && o.visible), true));
  for (const hit of hits) {
    const root = findCollectibleRoot(hit.object);
    if (root) { collectItem(root); return; }
  }
  const candidate = nearestCollectibleToPoint(pointerNdc, 0.58);
  if (candidate) { collectItem(candidate); return; }
  if (Math.abs(pointerNdc.x) < 0.22 && Math.abs(pointerNdc.y) < 0.24) {
    const centerCandidate = nearestCollectibleInView();
    if (centerCandidate) { collectItem(centerCandidate); return; }
  }
  toast('Apunta cerca del objeto brillante y pulsa RECOGER.');
}
function collectFromCrosshair() {
  if (gameState !== 'playing') return;
  const item = nearestCollectibleInView();
  if (!item) {
    toast('Centra la llave, pistola o munición en el círculo.');
    return;
  }
  collectItem(item);
}
function collectItem(item) {
  if (!item || item.userData.collected || gameState !== 'playing') return;
  item.userData.collected = true;
  item.visible = false;
  const type = item.userData.collectibleType;
  if (type === 'key') {
    collectedKeys = Math.min(3, collectedKeys + 1);
    playSound('key');
    toast(`LLAVE ENCONTRADA · ${collectedKeys}/3`, 1400);
    if (navigator.vibrate) navigator.vibrate(35);
    updateHUD();
    if (collectedKeys === 3) {
      gameState = 'transitioning';
      if (currentLevel === 4) {
        toast('LAS LLAVES ESTÁN EN TUS MANOS… PERO ELLOS TAMBIÉN.', 900);
        window.setTimeout(finishTeaser, 650);
      } else {
        toast('TRES LLAVES · ABRIENDO EL SIGUIENTE NIVEL', 900);
        window.setTimeout(() => {
          if (gameState !== 'transitioning') return;
          if (currentLevel < 3) {
            setupLevel(currentLevel + 1);
            showBanner(currentLevel);
          } else {
            setupLevel(4);
            showBanner(4);
          }
        }, 900);
      }
    }
  } else if (type === 'weapon') {
    hasWeapon = true;
    playSound('item');
    toast('PISTOLA ENCONTRADA · BUSCA MUNICIÓN');
    if (navigator.vibrate) navigator.vibrate([25, 35, 25]);
    updateHUD();
  } else if (type === 'ammo') {
    const gain = LEVELS[currentLevel].roundsPerPack;
    ammo += gain;
    playSound('item');
    toast(`MUNICIÓN +${gain} · ${ammo} BALAS`);
    if (navigator.vibrate) navigator.vibrate(24);
    updateHUD();
  }
}

function playerPositionLocal() {
  const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
  const world = new THREE.Vector3();
  activeCamera.getWorldPosition(world);
  return arenaRoot.worldToLocal(world);
}
function monsterIsSeen(monster) {
  if (!monster.visible) return false;
  const viewCamera = renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
  viewCamera.updateMatrixWorld(true);
  const point = monster.localToWorld(new THREE.Vector3(0, 1.42, 0));
  const cameras = renderer.xr.isPresenting && viewCamera.cameras?.length ? viewCamera.cameras : [viewCamera];
  for (const c of cameras) {
    c.updateMatrixWorld(true);
    const projected = point.clone().project(c);
    const inFrustum = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.92;
    if (inFrustum) return true;
  }
  return false;
}
function monsterDistanceToPlayerLocal(monster, playerLocal) {
  return Math.hypot(monster.position.x - playerLocal.x, monster.position.z - playerLocal.z);
}
function updateMonsters(delta) {
  const playerLocal = playerPositionLocal();
  let anyUnseen = false;
  for (const monster of monsters) {
    if (!monster.visible) continue;
    const seen = monsterIsSeen(monster);
    monster.userData.seen = seen;
    if (seen) {
      // Regla principal: si la cámara lo mantiene en cuadro, no avanza ni se anima.
      continue;
    }
    anyUnseen = true;
    const dx = playerLocal.x - monster.position.x;
    const dz = playerLocal.z - monster.position.z;
    const distance = Math.hypot(dx, dz) || 0.001;
    monster.position.x += (dx / distance) * monster.userData.speed * delta;
    monster.position.z += (dz / distance) * monster.userData.speed * delta;
    // Animación de acecho solo mientras no está a la vista.
    const t = performance.now() / 1000;
    if (monster.userData.head) monster.userData.head.rotation.z = Math.sin(t * 5 + monster.userData.variant) * 0.075;
    if (monster.userData.halo) monster.userData.halo.material.opacity = 0.36 + (Math.sin(t * 7) + 1) * 0.12;
    if (monster.userData.arms?.length) {
      monster.userData.arms.forEach((arm, i) => { arm.rotation.z += Math.sin(t * 5 + i * Math.PI) * delta * 0.16; });
    }
    const distanceToPlayer = monsterDistanceToPlayerLocal(monster, playerLocal);
    if (distanceToPlayer < 1.02) {
      loseGame('monster');
      return;
    }
  }
  growlCooldown -= delta;
  if (anyUnseen && growlCooldown <= 0) {
    playSound('growl', currentLevel === 4 ? 0.95 : 0.62);
    growlCooldown = currentLevel === 4 ? 3.6 : 8.5;
  }
}

function shoot() {
  if (gameState !== 'playing') return;
  if (!hasWeapon) {
    playSound('empty', 0.45);
    toast('PRIMERO ENCUENTRA LA PISTOLA.');
    return;
  }
  if (ammo <= 0) {
    playSound('empty', 0.5);
    toast('SIN MUNICIÓN. BUSCA UNA CAJA.');
    return;
  }
  if (currentLevel === 4) {
    toast('NO HAY MUNICIÓN PARA LA PARTE II.');
    return;
  }
  const visibleTargets = monsters.filter(m => m.visible && monsterIsSeen(m));
  if (!visibleTargets.length) {
    toast('NO LO VES. APUNTA A SU ROSTRO.');
    return;
  }
  const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
  const playerWorld = activeCamera.getWorldPosition(new THREE.Vector3());
  visibleTargets.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(playerWorld) - b.getWorldPosition(new THREE.Vector3()).distanceTo(playerWorld));
  const target = visibleTargets[0];
  ammo = Math.max(0, ammo - 1);
  playSound('gunshot');
  flashScreen();
  if (navigator.vibrate) navigator.vibrate(75);

  const playerLocal = playerPositionLocal();
  let dx = target.position.x - playerLocal.x;
  let dz = target.position.z - playerLocal.z;
  const d = Math.hypot(dx, dz) || 1;
  target.position.x += (dx / d) * 1.75;
  target.position.z += (dz / d) * 1.75;
  target.userData.lastShotAt = performance.now();
  toast('IMPACTO · EL MONSTRUO RETROCEDE', 1200);
  updateHUD();
}

function updateCollectibles(timeSeconds) {
  for (const item of collectibles) {
    if (item.userData.collected || !item.visible) continue;
    const offset = item.userData.animationOffset || 0;
    if (item.userData.collectibleType === 'key') {
      item.rotation.y = Math.sin(timeSeconds * 0.82 + offset) * 0.35;
      item.position.y = (item.userData.baseY ?? item.position.y) + Math.sin(timeSeconds * 1.8 + offset) * 0.035;
    } else {
      item.rotation.y = Math.sin(timeSeconds * 0.72 + offset) * 0.23;
      item.position.y = (item.userData.baseY ?? item.position.y) + Math.sin(timeSeconds * 1.5 + offset) * 0.018;
    }
  }
}

function renderFrame(time, frame) {
  if (!renderer || !scene || !camera) return;
  const seconds = time / 1000;
  const delta = lastFrameTime ? Math.min(0.05, (time - lastFrameTime) / 1000) : 0;
  lastFrameTime = time;

  if (mode === 'ar' && gameState === 'scanning' && frame && hitTestSource) {
    const results = frame.getHitTestResults(hitTestSource);
    if (results.length) {
      const xrReferenceSpace = renderer.xr.getReferenceSpace();
      const pose = xrReferenceSpace ? results[0].getPose(xrReferenceSpace) : null;
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
        reticle.visible = true;
        ui.place.disabled = false;
        ui.scanStatus.textContent = 'SUPERFICIE DETECTADA · TOCA PARA ANCLAR';
        ui.scanDescription.textContent = 'Se detectó una superficie. Toca “Colocar arena” para anclar aquí la arena y sus objetos.';
      }
    } else {
      reticle.visible = false;
      ui.place.disabled = false;
      ui.scanStatus.textContent = 'SIN SUPERFICIE · PUEDES COLOCAR APROXIMADAMENTE';
    }
  }

  if (mode === 'sim' && gameState === 'playing') {
    // El modo simulación coloca al jugador en el centro de la arena; permite mirar alrededor mediante arrastre.
    camera.rotation.order = 'YXZ';
    camera.rotation.y = viewYaw;
    camera.rotation.x = viewPitch;
  }

  if (gameState === 'playing') {
    remainingTime -= delta;
    updateCollectibles(seconds);
    updateMonsters(delta);
    updateHUD();
    if (gameState === 'playing' && remainingTime <= 0) {
      if (currentLevel === 4) finishTeaser();
      else loseGame('time');
    }
  }

  if (renderer.xr.isPresenting && reticle.visible) reticle.rotation.y += delta * 0.55;
  if (accentLight && goldLight) {
    accentLight.visible = placedArena;
    goldLight.visible = placedArena;
    if (placedArena && arenaRoot.parent) {
      accentLight.position.copy(arenaRoot.localToWorld(new THREE.Vector3(0, 2.1, -2.5)));
      goldLight.position.copy(arenaRoot.localToWorld(new THREE.Vector3(2, 1.6, -1.5)));
    }
  }
  renderer.render(scene, camera);
}

function onCanvasPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (mode === 'sim' && gameState === 'playing') {
    dragStart = { x: event.clientX, y: event.clientY, yaw: viewYaw, pitch: viewPitch, pointerId: event.pointerId };
    dragMoved = false;
    try { (event.currentTarget?.setPointerCapture ? event.currentTarget : renderer.domElement).setPointerCapture(event.pointerId); } catch (_) {}
  } else {
    dragStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    dragMoved = false;
  }
}
function onCanvasPointerMove(event) {
  if (!dragStart || dragStart.pointerId !== event.pointerId) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  if (Math.abs(dx) + Math.abs(dy) > 8) dragMoved = true;
  if (mode === 'sim' && gameState === 'playing' && dragMoved) {
    viewYaw = dragStart.yaw - dx * 0.006;
    viewPitch = THREE.MathUtils.clamp(dragStart.pitch - dy * 0.0045, -0.48, 0.48);
  }
}
function onCanvasPointerUp(event) {
  if (!dragStart || dragStart.pointerId !== event.pointerId) return;
  if (!dragMoved) handleCanvasTap(event.clientX, event.clientY);
  dragStart = null;
}

function moveSimulation(direction) {
  if (mode !== 'sim' || gameState !== 'playing') return;
  const step = 0.42;
  const forward = new THREE.Vector3(-Math.sin(viewYaw), 0, -Math.cos(viewYaw));
  const right = new THREE.Vector3(Math.cos(viewYaw), 0, -Math.sin(viewYaw));
  const movement = new THREE.Vector3();
  if (direction === 'forward') movement.copy(forward);
  if (direction === 'back') movement.copy(forward).negate();
  if (direction === 'left') movement.copy(right).negate();
  if (direction === 'right') movement.copy(right);
  camera.position.add(movement.multiplyScalar(step));
  camera.position.y = 1.62;
  if (navigator.vibrate) navigator.vibrate(12);
}

function loseGame(reason) {
  if (gameState !== 'playing') return;
  gameState = 'ended';
  clearTimeout(endTeaserTimer);
  playSound('gameover');
  ui.result.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  ui.levelBanner.classList.add('hidden');
  ui.resultSymbol.textContent = '✕';
  ui.resultKicker.textContent = currentLevel === 4 ? 'ADELANTO · PARTE II' : 'FIN DE LA PARTIDA';
  ui.resultTitle.innerHTML = currentLevel === 4 ? 'LA PARTE II<br><em>TE ESPERA</em>' : 'TE HA<br><em>ALCANZADO</em>';
  if (reason === 'time') {
    ui.resultTitle.innerHTML = 'SE AGOTÓ<br><em>EL TIEMPO</em>';
    ui.resultDescription.textContent = 'No encontraste las tres llaves antes de que terminara la cuenta regresiva.';
  } else if (currentLevel === 4) {
    ui.resultDescription.textContent = 'Dos amenazas, dos direcciones. Esto solo fue un vistazo a lo que viene.';
  } else {
    ui.resultDescription.textContent = 'Apartaste la mirada demasiado tiempo. El monstruo ya está demasiado cerca.';
  }
  ui.resultKeys.textContent = `${collectedKeys}/3`;
  ui.resultLevel.textContent = String(currentLevel).padStart(2, '0');
}
function finishTeaser() {
  if (!['playing', 'transitioning'].includes(gameState) || currentLevel !== 4) return;
  gameState = 'ended';
  clearTimeout(endTeaserTimer);
  playSound('gameover');
  ui.gameOver.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  ui.levelBanner.classList.add('hidden');
  ui.resultSymbol.textContent = 'Ⅱ';
  ui.resultKicker.textContent = 'FIN DEL ADELANTO';
  ui.resultTitle.innerHTML = 'CONTINUARÁ<br><em>EN PARTE II</em>';
  ui.resultDescription.textContent = 'Has visto solo el comienzo. Dos monstruos ya conocen tu rastro.';
  ui.resultKeys.textContent = `${collectedKeys}/3`;
  ui.resultLevel.textContent = '04';
}

function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  lastFrameTime = 0;
}
function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  ui.pause.classList.remove('hidden');
  ui.hud.classList.add('hidden');
}
async function goToMenu(endXR = true) {
  gameState = 'menu';
  mode = 'menu';
  placedArena = false;
  clearTimeout(endTeaserTimer);
  ui.levelBanner.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
  ui.scan.classList.add('hidden');
  ui.instructions.classList.add('hidden');
  ui.menuScreen.classList.remove('hidden');
  stopAmbience();
  stopCameraFallback();
  if (reticle) reticle.visible = false;
  if (endXR && activeSession) {
    const session = activeSession;
    activeSession = null;
    session.removeEventListener('end', onXRSessionEnd);
    try { await session.end(); } catch (_) {}
  }
}
function retryGame() {
  ui.gameOver.classList.add('hidden');
  if (mode === 'ar' && placedArena && activeSession) {
    setupLevel(1);
    showHUD();
    showBanner(1);
  } else if (cameraFallbackActive && cameraFallbackStream) {
    startSimulation(true, true);
  } else {
    startSimulation(false, false);
  }
}

ui.start.addEventListener('click', launchGame);
ui.startFromInstructions.addEventListener('click', launchGame);
ui.instructionsBtn.addEventListener('click', () => showOnly(ui.instructions));
ui.back.addEventListener('click', () => showOnly(ui.menuScreen));
ui.place.addEventListener('click', placeArenaAtReticle);
ui.simulation.addEventListener('click', async () => {
  if (activeSession) {
    const session = activeSession;
    activeSession = null;
    session.removeEventListener('end', onXRSessionEnd);
    try { await session.end(); } catch (_) {}
  }
  stopCameraFallback();
  startSimulation(false, false);
});
ui.pauseBtn.addEventListener('click', pauseGame);
ui.resume.addEventListener('click', resumeGame);
ui.quit.addEventListener('click', () => goToMenu(true));
ui.fire.addEventListener('click', shoot);
ui.pickup.addEventListener('click', collectFromCrosshair);
// In immersive WebXR the DOM overlay can receive touches instead of the WebGL canvas.
// Route blank-area taps from the overlay to the same picker so mobile AR remains playable.
const uiRoot = $('uiRoot');
function isHudControlTarget(target) {
  return Boolean(target?.closest?.('button, .hud-top, .hud-objectives, .hud-bottom, .level-banner, .game-toast, .screen-flash'));
}
uiRoot.addEventListener('pointerdown', event => {
  if (!['playing', 'scanning'].includes(gameState) || isHudControlTarget(event.target)) return;
  onCanvasPointerDown(event);
}, { passive: false });
uiRoot.addEventListener('pointermove', event => {
  if (dragStart) onCanvasPointerMove(event);
}, { passive: false });
uiRoot.addEventListener('pointerup', event => {
  if (dragStart) onCanvasPointerUp(event);
}, { passive: false });
uiRoot.addEventListener('pointercancel', () => { dragStart = null; dragMoved = false; }, { passive: true });
ui.retry.addEventListener('click', retryGame);
ui.menuButton.addEventListener('click', () => goToMenu(true));
ui.movement.querySelectorAll('[data-move]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    moveSimulation(button.dataset.move);
  });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState === 'playing') pauseGame();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && gameState === 'playing') pauseGame();
  if (mode === 'sim' && gameState === 'playing') {
    const map = { ArrowUp: 'forward', w: 'forward', ArrowDown: 'back', s: 'back', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    if (map[event.key]) moveSimulation(map[event.key]);
    if (event.code === 'Space') shoot();
  }
});

// Inicialización ligera: el menú aparece primero; Three.js se crea al iniciar.
