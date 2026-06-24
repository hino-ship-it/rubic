import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* =========================================================
   CONFIG
========================================================= */
const PLAYER_STAND_OFFSET = 0.62;
const JUMP_DURATION       = 350;
const JUMP_HEIGHT         = 0.9;
const SHUFFLE_COUNT       = 15;
const AUTO_WALK_INTERVAL  = 2.0;
const EXPECTED_CUBE_COUNT = 26;
const IS_MOBILE           = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const TAP_DISTANCE        = IS_MOBILE ? 30 : 10;
const START_GRID          = { x: 0, y: 1, z: 0 };
const COLORS              = { player: 0x000000, guide: 0x00f0ff };

const FACE_MATERIALS = [
  new THREE.MeshPhongMaterial({ color: 0x00ff00 }), // +x
  new THREE.MeshPhongMaterial({ color: 0x0000ff }), // -x
  new THREE.MeshPhongMaterial({ color: 0xffffff }), // +y
  new THREE.MeshPhongMaterial({ color: 0xffff00 }), // -y
  new THREE.MeshPhongMaterial({ color: 0xff0000 }), // +z
  new THREE.MeshPhongMaterial({ color: 0xffa500 }), // -z
];

/* =========================================================
   GRID CORE
   Three.jsのpositionではなく、このgridだけをゲームの正とする
========================================================= */
const grid = new Map();

function key(x, y, z) { return `${x},${y},${z}`; }
function getAllCubes()  { return Array.from(grid.values()); }
function getCubeByMesh(mesh) { return getAllCubes().find(cube => cube.mesh === mesh); }

function assertCubeCount() {
  const count = getAllCubes().length;
  if (count !== EXPECTED_CUBE_COUNT) {
    console.warn('cube count error:', count);
  }
}

/* =========================================================
   CUBE CLASS
========================================================= */
class Cube {
  constructor(mesh, x, y, z) {
    this.mesh        = mesh;
    this.x           = x;
    this.y           = y;
    this.z           = z;
    this.startX      = x;
    this.startY      = y;
    this.startZ      = z;
    this.orientation = new THREE.Quaternion();
    grid.set(key(x, y, z), this);
  }

  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.quaternion.copy(this.orientation);
  }
}

/* =========================================================
   THREE SETUP
========================================================= */
let scene;
let camera;
let renderer;
let controls;
let cubeGroup;
let player;
let armR;

let gameState   = 'INTRO'; // INTRO / SHUFFLING / PLAYING / FALLING / GAMEOVER / CLEAR
let isMoving    = false;
let isRotating  = false;
let jumpStartPos  = null;
let jumpTargetPos = null;
let jumpStartTime = 0;
let dragHit     = null;
let dragStart   = null;
let moveTimer   = 0;
let lastFrameTime = performance.now();

const guides = [];

init();

/* =========================================================
   INIT
========================================================= */
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdedede);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(5, 5, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  renderer.domElement.style.touchAction = 'none';
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = IS_MOBILE ? 0.05 : 0.08;
  controls.enablePan     = false;
  controls.minDistance   = 4;
  controls.maxDistance   = 15;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(5, 10, 7);
  scene.add(light);

  createCube();
  createPlayer();
  setupEvents();
  animate();
}

/* =========================================================
   CREATE CUBE
========================================================= */
function createCube() {
  cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.96, 0.96),
          FACE_MATERIALS
        );
        const cube = new Cube(mesh, x, y, z);
        cube.syncMesh();
        cubeGroup.add(mesh);
      }
    }
  }

  assertCubeCount();
}

/* =========================================================
   CREATE PLAYER
========================================================= */
function createPlayer() {
  player = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.player });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), mat);
  head.position.y = 0.75;
  player.add(head);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), mat);
  body.position.y = 0.5;
  player.add(body);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), mat);
  armL.position.set(-0.1, 0.6, 0);
  armL.rotation.z = 0.8;
  player.add(armL);

  armR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), mat);
  armR.position.set(0.1, 0.6, 0);
  armR.rotation.z = -0.8;
  player.add(armR);

  const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.35);

  const legGroupL = new THREE.Group();
  const legL = new THREE.Mesh(legGeo, mat);
  legL.position.y = -0.175;
  legGroupL.add(legL);
  legGroupL.position.set(0, 0.3, 0);
  legGroupL.rotation.z = 0.3;
  player.add(legGroupL);

  const legGroupR = new THREE.Group();
  const legR = new THREE.Mesh(legGeo, mat);
  legR.position.y = -0.175;
  legGroupR.add(legR);
  legGroupR.position.set(0, 0.3, 0);
  legGroupR.rotation.z = -0.3;
  player.add(legGroupR);

  player.position.set(0, 15, 0);
  player.visible = false;
  scene.add(player);
}

/* =========================================================
   EVENTS
========================================================= */
function setupEvents() {
  const startBtn = document.getElementById('start-btn');
  if (!startBtn) {
    console.error("start-btn が見つかりません。HTMLに id='start-btn' のボタンがあるか確認してください。");
  } else {
    startBtn.addEventListener('click', event => {
      event.stopPropagation();
      startGame();
    });
  }

  window.addEventListener('resize',       onResize);
  window.addEventListener('pointerdown',  onPointerDown);
  window.addEventListener('pointerup',    onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', event => {
    if (gameState === 'PLAYING' && event.key.toLowerCase() === 'c') {
      forceClear();
    }
  });
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function onPointerCancel() {
  controls.enabled = true;
  dragHit   = null;
  dragStart = null;
}

/* =========================================================
   START GAME
========================================================= */
async function startGame() {
  if (gameState === 'GAMEOVER' || gameState === 'CLEAR') {
    location.reload();
    return;
  }
  if (gameState !== 'INTRO') return;

  const overlay = document.getElementById('ui-overlay');
  if (overlay) overlay.classList.add('hidden');

  const hud = document.getElementById('hud');
  if (hud) hud.classList.remove('hidden');

  clearGuides();
  player.visible = false;
  player.position.set(0, 15, 0);
  player.rotation.set(0, 0, 0);
  moveTimer = 0;

  await shuffleCubeMoves(SHUFFLE_COUNT);
  placePlayerOnStartCube();
  gameState = 'PLAYING';

  console.log('player position:', player.position.toArray());
  console.log('player visible:', player.visible);
}

/* =========================================================
   PLAYER POSITION
========================================================= */
function placePlayerOnStartCube() {
  const cube = grid.get(key(START_GRID.x, START_GRID.y, START_GRID.z));
  if (!cube) {
    console.error('開始位置のキューブがありません。');
    return;
  }
  player.position.set(cube.x, cube.y + PLAYER_STAND_OFFSET, cube.z);
  player.rotation.set(0, 0, 0);
  player.visible = true;
}

function getPlayerGrid() {
  return {
    x: Math.round(player.position.x),
    y: Math.round(player.position.y - PLAYER_STAND_OFFSET),
    z: Math.round(player.position.z),
  };
}

function hasSupport(x, y, z) {
  return grid.has(key(x, y, z));
}

/* =========================================================
   GRID ROTATION HELPERS
========================================================= */
function getSlice(axis, value) {
  const result = [];
  for (const cube of grid.values()) {
    if (cube[axis] === value) result.push(cube);
  }
  return result;
}

function rotatePoint(x, y, z, axis, dir) {
  if (axis === 'x') {
    return dir > 0 ? { x, y: -z, z: y } : { x, y: z, z: -y };
  }
  if (axis === 'y') {
    return dir > 0 ? { x: z, y, z: -x } : { x: -z, y, z: x };
  }
  if (axis === 'z') {
    return dir > 0 ? { x: -y, y: x, z } : { x: y, y: -x, z };
  }
  return { x, y, z };
}

function getAxisVector(axis) {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

/* =========================================================
   ROTATION LOGIC
   Mapを壊さないように、一括で移動先計算→古いgrid削除→新grid登録
========================================================= */
function rotateLogic(slice, axis, dir) {
  const moves = [];
  const deltaQuaternion = new THREE.Quaternion().setFromAxisAngle(
    getAxisVector(axis),
    dir * Math.PI / 2
  );

  for (const cube of slice) {
    const next = rotatePoint(cube.x, cube.y, cube.z, axis, dir);
    moves.push({ cube, x: next.x, y: next.y, z: next.z });
  }

  for (const cube of slice) {
    grid.delete(key(cube.x, cube.y, cube.z));
  }

  for (const move of moves) {
    const cube = move.cube;
    cube.x = move.x;
    cube.y = move.y;
    cube.z = move.z;
    cube.orientation.premultiply(deltaQuaternion);
    cube.orientation.normalize();
    grid.set(key(cube.x, cube.y, cube.z), cube);
  }
}

/* =========================================================
   ROTATION ANIMATION
========================================================= */
async function animateSlice(slice, axis, dir, duration = 180) {
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  for (const cube of slice) pivot.attach(cube.mesh);

  const start = performance.now();
  return new Promise(resolve => {
    function loop() {
      const t    = Math.min((performance.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      pivot.rotation.set(0, 0, 0);
      pivot.rotation[axis] = dir * Math.PI / 2 * ease;

      if (t < 1) {
        requestAnimationFrame(loop);
        return;
      }

      pivot.updateMatrixWorld();
      for (const cube of slice) cubeGroup.attach(cube.mesh);
      cubeGroup.remove(pivot);
      resolve();
    }
    loop();
  });
}

async function rotateSliceSafe(axis, value, dir, duration = 180) {
  if (isRotating) return;

  const playerGridBefore      = getPlayerGrid();
  const playerOnRotatingLayer = gameState === 'PLAYING' && playerGridBefore[axis] === value;

  isRotating = true;
  clearGuides();

  const slice = getSlice(axis, value);
  if (slice.length === 0) {
    console.warn('slice が空です:', axis, value);
    isRotating = false;
    return;
  }

  await animateSlice(slice, axis, dir, duration);
  rotateLogic(slice, axis, dir);
  for (const cube of slice) cube.syncMesh();

  if (gameState === 'PLAYING' && playerOnRotatingLayer) {
    if (axis === 'y') {
      followPlayerFromGrid(playerGridBefore, axis, dir);
    } else {
      gameState = 'FALLING';
      clearGuides();
    }
  }

  isRotating = false;
  assertCubeCount();

  if (gameState === 'PLAYING' && isCubeSolved()) forceClear();
}

function followPlayerFromGrid(playerGrid, axis, dir) {
  const next = rotatePoint(playerGrid.x, playerGrid.y, playerGrid.z, axis, dir);
  player.position.set(next.x, next.y + PLAYER_STAND_OFFSET, next.z);
}

/* =========================================================
   SHUFFLE
========================================================= */
async function shuffleCubeMoves(count) {
  gameState = 'SHUFFLING';
  const axes   = ['x', 'y', 'z'];
  const layers = [-1, 0, 1];

  for (let i = 0; i < count; i++) {
    const axis  = axes[Math.floor(Math.random() * axes.length)];
    const layer = layers[Math.floor(Math.random() * layers.length)];
    const dir   = Math.random() > 0.5 ? 1 : -1;
    await rotateSliceSafe(axis, layer, dir, 80);
  }
}

/* =========================================================
   INPUT
========================================================= */
function onPointerDown(event) {
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const mouse = new THREE.Vector2(
    (event.clientX / innerWidth)  *  2 - 1,
    -(event.clientY / innerHeight) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, camera);

  const hits = ray.intersectObjects(getAllCubes().map(cube => cube.mesh));
  if (hits.length > 0) {
    dragHit   = hits[0];
    dragStart = { x: event.clientX, y: event.clientY };
    controls.enabled = false;
  } else {
    dragHit   = null;
    dragStart = null;
  }
}

function onPointerUp(event) {
  controls.enabled = true;
  if (!dragHit || !dragStart) return;

  const dx       = event.clientX - dragStart.x;
  const dy       = event.clientY - dragStart.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < TAP_DISTANCE) {
    executeJump(dragHit);
  } else {
    executeSwipe(dragHit, dx, dy);
  }

  dragHit   = null;
  dragStart = null;
}

/* =========================================================
   JUMP
========================================================= */
function executeJump(hit) {
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const cube = getCubeByMesh(hit.object);
  if (!cube) return;

  const normal = hit.face.normal
    .clone()
    .transformDirection(hit.object.matrixWorld)
    .round();

  if (normal.y < 0.5) return;

  const target = new THREE.Vector3(cube.x, cube.y + PLAYER_STAND_OFFSET, cube.z);

  if (player.position.distanceTo(target) < 2.5) {
    jumpStartPos  = player.position.clone();
    jumpTargetPos = target;
    jumpStartTime = performance.now();
    isMoving      = true;
    moveTimer     = 0;
    clearGuides();
  }
}

function updateJump() {
  const progress = Math.min(
    (performance.now() - jumpStartTime) / JUMP_DURATION,
    1
  );

  player.position.lerpVectors(jumpStartPos, jumpTargetPos, progress);
  player.position.y += Math.sin(progress * Math.PI) * JUMP_HEIGHT;

  if (progress >= 1) {
    player.position.copy(jumpTargetPos);
    player.position.x = Math.round(player.position.x);
    player.position.z = Math.round(player.position.z);
    player.position.y = Math.round(player.position.y * 100) / 100;
    isMoving = false;
  }
}

/* =========================================================
   AUTO WALK
========================================================= */
function autoWalkPlayer() {
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const playerGrid = getPlayerGrid();
  const candidates = [];

  for (const cube of grid.values()) {
    const dx       = cube.x - playerGrid.x;
    const dy       = cube.y - playerGrid.y;
    const dz       = cube.z - playerGrid.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 0.7 && distance < 1.1 && Math.abs(dy) < 0.1) {
      candidates.push(cube);
    }
  }

  if (candidates.length === 0) return;

  const targetCube = candidates[Math.floor(Math.random() * candidates.length)];
  jumpStartPos  = player.position.clone();
  jumpTargetPos = new THREE.Vector3(
    targetCube.x,
    targetCube.y + PLAYER_STAND_OFFSET,
    targetCube.z
  );
  jumpStartTime = performance.now();
  isMoving      = true;
  moveTimer     = 0;
  clearGuides();
}

/* =========================================================
   SWIPE
========================================================= */
function executeSwipe(hit, dx, dy) {
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const cube = getCubeByMesh(hit.object);
  if (!cube) return;

  const normal = hit.face.normal
    .clone()
    .transformDirection(hit.object.matrixWorld)
    .round();

  const horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;
  let axis, dir;

  if (Math.abs(normal.y) > 0.5) {
    if (horizontal) {
      axis = 'z'; dir = dx > 0 ? 1 : -1;
    } else {
      axis = 'x'; dir = dy > 0 ? -1 : 1;
    }
  } else if (Math.abs(normal.z) > 0.5) {
    if (horizontal) {
      axis = 'y'; dir = normal.z > 0 ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1);
    } else {
      axis = 'x'; dir = normal.z > 0 ? (dy > 0 ? 1 : -1) : (dy > 0 ? -1 : 1);
    }
  } else {
    if (horizontal) {
      axis = 'y'; dir = normal.x > 0 ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1);
    } else {
      axis = 'z'; dir = normal.x > 0 ? (dy > 0 ? -1 : 1) : (dy > 0 ? 1 : -1);
    }
  }

  rotateSliceSafe(axis, cube[axis], dir);
}

/* =========================================================
   GUIDES
========================================================= */
function clearGuides() {
  for (const guide of guides) scene.remove(guide);
  guides.length = 0;
}

function updateGuides() {
  clearGuides();
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const playerGrid = getPlayerGrid();
  const current    = player.position.clone();

  for (const cube of grid.values()) {
    const pos      = new THREE.Vector3(cube.x, cube.y + PLAYER_STAND_OFFSET, cube.z);
    const distance = current.distanceTo(pos);

    if (distance > 0.7 && distance < 2.5 && cube.y <= playerGrid.y) {
      const guide = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.25, 32),
        new THREE.MeshBasicMaterial({
          color: COLORS.guide,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        })
      );
      guide.rotation.x = -Math.PI / 2;
      guide.position.set(cube.x, cube.y + 0.51, cube.z);
      scene.add(guide);
      guides.push(guide);
    }
  }
}

/* =========================================================
   DEAD CHECK
========================================================= */
function checkDead() {
  if (gameState !== 'PLAYING') return;
  if (isMoving || isRotating) return;

  const playerGrid = getPlayerGrid();
  if (!hasSupport(playerGrid.x, playerGrid.y, playerGrid.z)) {
    gameState = 'FALLING';
    clearGuides();
  }
}

/* =========================================================
   CLEAR / GAME OVER
========================================================= */
function forceClear() {
  gameState = 'CLEAR';
  clearGuides();

  const title   = document.getElementById('title');
  const desc    = document.getElementById('desc');
  const btn     = document.getElementById('start-btn');
  const overlay = document.getElementById('ui-overlay');

  if (title)   title.innerText   = 'PUZZLE CLEAR!!';
  if (desc)    desc.innerHTML    = 'おめでとう！これで故郷に帰れます！';
  if (btn)     btn.innerText     = 'もう一度遊ぶ';
  if (overlay) overlay.classList.remove('hidden');
}

function gameOver() {
  gameState = 'GAMEOVER';
  clearGuides();

  const title   = document.getElementById('title');
  const desc    = document.getElementById('desc');
  const btn     = document.getElementById('start-btn');
  const overlay = document.getElementById('ui-overlay');

  if (title)   title.innerText   = 'GAME OVER';
  if (desc)    desc.innerHTML    = '宇宙の塵となってしまった...';
  if (btn)     btn.innerText     = '再起動';
  if (overlay) overlay.classList.remove('hidden');
}

/* =========================================================
   SOLVED CHECK
========================================================= */
function isCubeSolved() {
  const identity = new THREE.Quaternion();
  for (const cube of grid.values()) {
    if (cube.x !== cube.startX) return false;
    if (cube.y !== cube.startY) return false;
    if (cube.z !== cube.startZ) return false;
    if (cube.orientation.angleTo(identity) > 0.01) return false;
  }
  return true;
}

/* =========================================================
   ANIMATE
========================================================= */
function animate() {
  requestAnimationFrame(animate);

  const now   = performance.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  controls.update();

  const time = now * 0.001;

  if (gameState === 'PLAYING') {
    if (!isMoving && !isRotating) {
      moveTimer += delta;
      if (moveTimer >= AUTO_WALK_INTERVAL) {
        moveTimer = 0;
        autoWalkPlayer();
      }
    }

    if (isMoving) {
      updateJump();
    } else {
      checkDead();
      updateGuides();
    }
  }

  if (gameState === 'FALLING') {
    player.position.y -= 0.15;
    player.rotation.x += 0.08;
    player.rotation.z += 0.05;
    if (player.position.y < -15) gameOver();
  }

  if (gameState === 'CLEAR') {
    cubeGroup.position.y += 0.02;
    player.position.y    += 0.02;
    if (armR) {
      armR.rotation.z = Math.sin(time * 15) * 0.5 - 1.0;
      armR.rotation.x = Math.sin(time * 15) * 0.5;
    }
    cubeGroup.rotation.y += 0.01;
    player.rotation.y    += 0.01;
  }

  renderer.render(scene, camera);
}