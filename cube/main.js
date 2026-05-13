import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COLORS = {
    red: 0xff0000, orange: 0xffa500, white: 0xffffff,
    yellow: 0xffff00, blue: 0x0000ff, green: 0x00ff00,
    player: 0x000000, guide: 0x00f0ff
};

const FACE_MATERIALS = [
    new THREE.MeshPhongMaterial({ color: COLORS.green }),
    new THREE.MeshPhongMaterial({ color: COLORS.blue }),
    new THREE.MeshPhongMaterial({ color: COLORS.white }),
    new THREE.MeshPhongMaterial({ color: COLORS.yellow }),
    new THREE.MeshPhongMaterial({ color: COLORS.red }),
    new THREE.MeshPhongMaterial({ color: COLORS.orange })
];

let scene, renderer, mainCamera, controls;
let cubeGroup, player, armR;
const cubes = [];
const guides = [];

let gameState = 'INTRO'; // 'INTRO', 'SHUFFLING', 'PLAYING', 'FALLING', 'GAMEOVER', 'CLEAR'
let isMoving = false;
let isRotating = false;

// ジャンプ用変数
let jumpStartPos, jumpTargetPos, jumpStartTime;
const JUMP_DURATION = 350;
const JUMP_HEIGHT = 0.9;
let score = 0;

// スワイプ操作用変数
let dragHit = null;
let dragStartPos = null;

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdedede);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    mainCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    mainCamera.position.set(5, 5, 8);

    controls = new OrbitControls(mainCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 15;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(5, 10, 7);
    scene.add(light);

    createCube();
    createPlayer();
    setupEvents();
    animate();
}

function createCube() {
    cubeGroup = new THREE.Group();
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                if (x === 0 && y === 0 && z === 0) continue;
                const cube = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, 0.96), FACE_MATERIALS);
                cube.position.set(x, y, z);
                cubes.push(cube);
                cubeGroup.add(cube);
            }
        }
    }
    scene.add(cubeGroup);
}

// あばたー
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
    armL.position.set(-0.1, 0.6, 0); armL.rotation.z = 0.8;
    player.add(armL);

    armR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), mat);
    armR.position.set(0.1, 0.6, 0); armR.rotation.z = -0.8;
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

function setupEvents() {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.onclick = (e) => {
            e.stopPropagation();
            startGame();
        };
    }

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);

    // --- 確認用） ---
    window.addEventListener('keydown', (e) => {
        // クリアできなくてもCキー押すとエンディング見れます
        if (gameState === 'PLAYING' && e.key.toLowerCase() === 'c') {
            forceClear();
        }
    });
}

function onResize() {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame() {
    if (gameState === 'GAMEOVER' || gameState === 'CLEAR') {
        location.reload();
        return;
    }
    document.getElementById('ui-overlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    score = 0;
    document.getElementById('score').innerText = score;
    player.position.set(0, 1.48, 0);
    player.visible = true;

    shuffleCubeMoves(15); 
}

// --- スワイプとタップの判定 ---
function onPointerDown(event) {
    if (gameState !== 'PLAYING' || isMoving || isRotating) return;

    const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, mainCamera);
    const hits = ray.intersectObjects(cubes);

    if (hits.length > 0) {
        dragHit = hits[0];
        dragStartPos = { x: event.clientX, y: event.clientY };
        controls.enabled = false; 
    } else {
        dragHit = null; 
    }
}

function onPointerUp(event) {
    controls.enabled = true; 
    if (!dragHit) return;

    const dx = event.clientX - dragStartPos.x;
    const dy = event.clientY - dragStartPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
        executeJump(dragHit); 
    } else {
        executeSwipe(dragHit, dx, dy); 
    }
    dragHit = null;
}

// --- タップ：ジャンプ移動 ---
function executeJump(hit) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
    if (normal.y < 0.5) return; 

    const targetPos = hit.object.getWorldPosition(new THREE.Vector3());
    targetPos.y += 0.48;

    if (player.position.distanceTo(targetPos) < 2.5) {
        jumpStartPos = player.position.clone();
        jumpTargetPos = targetPos;
        jumpStartTime = performance.now();
        isMoving = true;
        guides.forEach(g => scene.remove(g));
        guides.length = 0;
    }
}

// --- スワイプ：層の回転 ---
function executeSwipe(hit, dx, dy) {
    const swipeDir = new THREE.Vector2(dx, -dy).normalize();
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
    
    let bestAxis = null;
    let bestDot = -1;
    let rotDir = 1;

    const axes = { 'x': new THREE.Vector3(1,0,0), 'y': new THREE.Vector3(0,1,0), 'z': new THREE.Vector3(0,0,1) };
    const p1 = hit.object.getWorldPosition(new THREE.Vector3());

    for (const [axisName, axisVec] of Object.entries(axes)) {
        if (Math.abs(axisVec.dot(normal)) > 0.5) continue; 
        
        const p2 = p1.clone().add(axisVec);
        const p1Screen = p1.clone().project(mainCamera);
        const p2Screen = p2.clone().project(mainCamera);
        const screenAxis = new THREE.Vector2(p2Screen.x - p1Screen.x, p2Screen.y - p1Screen.y).normalize();
        
        const dot = swipeDir.dot(screenAxis);
        if (Math.abs(dot) > bestDot) {
            bestDot = Math.abs(dot);
            bestAxis = axisName;
            rotDir = dot > 0 ? 1 : -1;
        }
    }

    if (bestAxis) {
        const layerVal = Math.round(hit.object.position[bestAxis]);
        rotateSlice(bestAxis, layerVal, rotDir * Math.PI / 2, 400);
    }
}

// --- 層の回転アニメーション ---
async function rotateSlice(axis, layerValue, rotAmount, duration) {
    isRotating = true;
    
    const slice = cubes.filter(c => Math.round(c.position[axis]) === Math.round(layerValue));
    const pivot = new THREE.Group();
    cubeGroup.add(pivot);
    slice.forEach(c => pivot.attach(c));

    const start = performance.now();
    await new Promise(resolve => {
        function r() {
            const t = Math.min((performance.now() - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            pivot.rotation[axis] = rotAmount * ease;
            if (t < 1) requestAnimationFrame(r);
            else resolve();
        }
        r();
    });

    pivot.updateMatrixWorld();
    slice.forEach(c => {
        cubeGroup.attach(c);
        c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
        c.rotation.set(
            Math.round(c.rotation.x / (Math.PI/2)) * (Math.PI/2),
            Math.round(c.rotation.y / (Math.PI/2)) * (Math.PI/2),
            Math.round(c.rotation.z / (Math.PI/2)) * (Math.PI/2)
        );
    });
    cubeGroup.remove(pivot);
    isRotating = false;

    if (gameState === 'PLAYING' && isCubeSolved()) {
        forceClear();
    }
}

// --- クリア処理（チート兼用） ---
function forceClear() {
    gameState = 'CLEAR';
    guides.forEach(g => scene.remove(g));
    guides.length = 0;
    
    document.getElementById('title').innerText = "PUZZLE CLEAR!!";
    document.getElementById('desc').innerHTML = "おめでとう！UFOが迎えに来ました！";
    document.getElementById('start-btn').innerText = "もう一度遊ぶ";
    document.getElementById('ui-overlay').classList.remove('hidden');
}


// --- シャッフル ---
async function shuffleCubeMoves(moves) {
    gameState = 'SHUFFLING';
    const axes = ['x', 'y', 'z'];
    const layers = [-1, 0, 1];
    for (let i = 0; i < moves; i++) {
        const axis = axes[Math.floor(Math.random() * axes.length)];
        const layer = layers[Math.floor(Math.random() * layers.length)];
        const rotAmount = (Math.random() > 0.5 ? 1 : -1) * Math.PI / 2;
        await rotateSlice(axis, layer, rotAmount, 100); 
    }
    gameState = 'PLAYING';
}

function updateGuides() {
    guides.forEach(g => scene.remove(g));
    guides.length = 0;
    if (gameState !== 'PLAYING' || isMoving || isRotating) return;

    cubes.forEach(cube => {
        const pos = cube.getWorldPosition(new THREE.Vector3());
        const dist = player.position.distanceTo(pos);
        if (dist > 0.7 && dist < 2.5 && pos.y < player.position.y) {
            const guide = new THREE.Mesh(
                new THREE.RingGeometry(0.18, 0.25, 32),
                new THREE.MeshBasicMaterial({ color: COLORS.guide, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
            );
            guide.rotation.x = -Math.PI / 2;
            guide.position.copy(pos);
            guide.position.y += 0.51;
            scene.add(guide);
            guides.push(guide);
        }
    });
}

function checkDead() {
    if (isMoving || gameState !== 'PLAYING') return;

    const origin = player.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(cubes);

    if (hits.length === 0 || hits[0].distance > 1.2) {
        gameState = 'FALLING';
    }
}

function isCubeSolved() {
    for (let c of cubes) {
        const rx = Math.abs(Math.round(c.rotation.x / (Math.PI/2)) % 4);
        const ry = Math.abs(Math.round(c.rotation.y / (Math.PI/2)) % 4);
        const rz = Math.abs(Math.round(c.rotation.z / (Math.PI/2)) % 4);
        if (rx !== 0 || ry !== 0 || rz !== 0) return false;
    }
    return true;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const time = performance.now() * 0.001;

    if (gameState === 'PLAYING') {
        if (isMoving) {
            const p = Math.min((performance.now() - jumpStartTime) / JUMP_DURATION, 1);
            player.position.lerpVectors(jumpStartPos, jumpTargetPos, p);
            player.position.y += Math.sin(p * Math.PI) * JUMP_HEIGHT;
            if (p >= 1) {
                player.position.copy(jumpTargetPos);
                isMoving = false;
                score++;
                document.getElementById('score').innerText = score;
            }
        } else {
            checkDead();
            updateGuides();
        }
    } 
    else if (gameState === 'FALLING') {
        player.position.y -= 0.15;
        player.rotation.x += 0.08;
        player.rotation.z += 0.05;
        if (player.position.y < -15) {
            gameState = 'GAMEOVER';
            document.getElementById('title').innerText = "GAME OVER";
            document.getElementById('desc').innerHTML = "宇宙の塵となってしまった...";
            document.getElementById('start-btn').innerText = "再起動";
            document.getElementById('ui-overlay').classList.remove('hidden');
        }
    } 
    else if (gameState === 'CLEAR') {
        // UFOみたいに上がっていく
        cubeGroup.position.y += 0.02;
        player.position.y += 0.02;
        // 手を振る
        armR.rotation.z = Math.sin(time * 15) * 0.5 - 1.0;
        armR.rotation.x = Math.sin(time * 15) * 0.5;
        // ちょっと全体が回る
        cubeGroup.rotation.y += 0.01;
        player.rotation.y += 0.01;
    }

    renderer.render(scene, mainCamera);
}