import * as THREE from './vendor/three.module.js';

// DOM Elements
const canvas3d = document.getElementById('canvas3d');
const scopeCanvas = document.getElementById('scopeCanvas');
const scopeCtx = scopeCanvas.getContext('2d');

const badgeNode = document.getElementById('badgeNode');
const badgeRec = document.getElementById('badgeRec');
const rateVal = document.getElementById('rateVal');
const jitterVal = document.getElementById('jitterVal');

const magTotal = document.getElementById('magTotal');
const valBx = document.getElementById('valBx');
const valBy = document.getElementById('valBy');
const valBz = document.getElementById('valBz');

const btnTare = document.getElementById('btnTare');
const btnNetMode = document.getElementById('btnNetMode');
const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const selHypothesis = document.getElementById('selHypothesis');
const txtExpId = document.getElementById('txtExpId');
const btnJarBeesAnalyze = document.getElementById('btnJarBeesAnalyze');

const statMean = document.getElementById('statMean');
const statStd = document.getElementById('statStd');
const statMax = document.getElementById('statMax');
const statSamples = document.getElementById('statSamples');

// State Variables
let ws = null;
let earthOffset = [0, 0, 0];
let isNetMode = false;
let isRecording = false;

let currentMag = [0, 0, 0];
let currentAcc = [0, 0, 9.8];
let currentGyro = [0, 0, 0];

let historyB = []; // For oscilloscope (max 200 samples)
let sessionSamples = []; // For stats during recording

// ----------------------------------------------------
// 1. THREE.JS 3D SCENE SETUP
// ----------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090d13, 0.025);

const camera = new THREE.PerspectiveCamera(45, canvas3d.clientWidth / canvas3d.clientHeight, 0.1, 100);
camera.position.set(0, 10, 16);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: true });
renderer.setSize(canvas3d.clientWidth, canvas3d.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0x58a6ff, 1.2);
dirLight.position.set(5, 12, 8);
scene.add(dirLight);

// Grid and Reference Plane
const gridHelper = new THREE.GridHelper(20, 20, 0x30363d, 0x161b22);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

// Compass Ring (Cardinal Axes)
const ringGeo = new THREE.RingGeometry(5.95, 6.05, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x30363d, side: THREE.DoubleSide });
const ringMesh = new THREE.Mesh(ringGeo, ringMat);
ringMesh.rotation.x = Math.PI / 2;
scene.add(ringMesh);

// Phone 3D Model Representation
const phoneGeo = new THREE.BoxGeometry(2.2, 0.25, 4.8);
const phoneMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    metalness: 0.8,
    roughness: 0.2,
    wireframe: false
});
const phoneMesh = new THREE.Mesh(phoneGeo, phoneMat);
scene.add(phoneMesh);

// Screen on Phone
const screenGeo = new THREE.PlaneGeometry(1.9, 4.3);
const screenMat = new THREE.MeshBasicMaterial({ color: 0x090d13 });
const screenMesh = new THREE.Mesh(screenGeo, screenMat);
screenMesh.rotation.x = -Math.PI / 2;
screenMesh.position.y = 0.13;
phoneMesh.add(screenMesh);

// 3D Magnetic Vector Arrow
const vectorDir = new THREE.Vector3(0, 1, 0);
const vectorOrigin = new THREE.Vector3(0, 0, 0);
const vectorLength = 4;
const vectorColor = 0x39d353;
const arrowHelper = new THREE.ArrowHelper(vectorDir, vectorOrigin, vectorLength, vectorColor, 0.8, 0.5);
scene.add(arrowHelper);

// Iso-Flux Bubble
const sphereGeo = new THREE.SphereGeometry(1, 32, 16);
const sphereMat = new THREE.MeshBasicMaterial({
    color: 0x39d353,
    wireframe: true,
    transparent: true,
    opacity: 0.15
});
const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphereMesh);

// Mouse Orbit Interaction
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

canvas3d.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => { isDragging = false; });

canvas3d.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    camera.position.x = camera.position.x * Math.cos(deltaX * 0.005) + camera.position.z * Math.sin(deltaX * 0.005);
    camera.position.z = camera.position.z * Math.cos(deltaX * 0.005) - camera.position.x * Math.sin(deltaX * 0.005);
    camera.position.y = Math.max(1, Math.min(25, camera.position.y + deltaY * 0.05));
    camera.lookAt(0, 0, 0);

    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('resize', () => {
    camera.aspect = canvas3d.clientWidth / canvas3d.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas3d.clientWidth, canvas3d.clientHeight);
});

// ----------------------------------------------------
// 2. WEBSOCKET TELEMETRY CLIENT
// ----------------------------------------------------
function initWebSocket() {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProto}//${loc.host}`);

    ws.onopen = () => {
        console.log('[Dashboard WS] Conectado con el servidor');
    };

    ws.onclose = () => {
        badgeNode.className = 'badge badge-node-off';
        badgeNode.innerHTML = '<span>●</span> MOTO G22: DESCONECTADO';
        setTimeout(initWebSocket, 2000);
    };

    ws.onmessage = (evt) => {
        try {
            const data = JSON.parse(evt.data);

            if (data.type === 'telemetry') {
                badgeNode.className = 'badge badge-node-on';
                badgeNode.innerHTML = '<span>●</span> MOTO G22: ONLINE';

                if (data.metrics) {
                    rateVal.innerText = data.metrics.effectiveFrequency.toFixed(1);
                    jitterVal.innerText = data.metrics.interSampleJitter.toFixed(1);
                }

                currentMag = data.mag || [0, 0, 0];
                currentAcc = data.acc || [0, 0, 9.8];
                currentGyro = data.gyro || [0, 0, 0];

                updateTelemetry(currentMag);
            }

            if (data.type === 'experiment_status') {
                if (data.status === 'RECORDING') {
                    isRecording = true;
                    badgeRec.style.display = 'flex';
                    btnRecord.style.display = 'none';
                    btnStop.style.display = 'flex';
                    sessionSamples = [];
                } else {
                    isRecording = false;
                    badgeRec.style.display = 'none';
                    btnRecord.style.display = 'flex';
                    btnStop.style.display = 'none';
                    computeFinalStats();
                }
            }
        } catch (e) {
            console.error('Error parseando WS:', e);
        }
    };
}

// ----------------------------------------------------
// 3. TELEMETRY UPDATE & 3D VECTOR MATH
// ----------------------------------------------------
function updateTelemetry(rawMag) {
    let bx = rawMag[0];
    let by = rawMag[1];
    let bz = rawMag[2];

    if (isNetMode) {
        bx -= earthOffset[0];
        by -= earthOffset[1];
        bz -= earthOffset[2];
    }

    const norm = Math.sqrt(bx*bx + by*by + bz*bz);

    // Update HUD
    magTotal.innerText = norm.toFixed(1);
    valBx.innerText = (bx >= 0 ? '+' : '') + bx.toFixed(1);
    valBy.innerText = (by >= 0 ? '+' : '') + by.toFixed(1);
    valBz.innerText = (bz >= 0 ? '+' : '') + bz.toFixed(1);

    // Update 3D Vector Arrow
    if (norm > 0.1) {
        const dir = new THREE.Vector3(bx, by, bz).normalize();
        arrowHelper.setDirection(dir);

        // Scale length proportionally (1 uT -> 0.08 units, clamped)
        const len = Math.max(0.5, Math.min(10.0, norm * 0.08));
        arrowHelper.setLength(len, Math.min(len * 0.3, 0.8), Math.min(len * 0.15, 0.4));

        // Color ramp based on intensity: Cyan -> Green -> Yellow -> Red
        let col = 0x39d353;
        if (norm > 80) col = 0xf85149;
        else if (norm > 45) col = 0xffa657;
        else if (norm > 20) col = 0x39d353;
        else col = 0x58a6ff;

        arrowHelper.setColor(col);
        sphereMat.color.setHex(col);

        // Iso-flux bubble scale
        const sphereScale = Math.max(0.5, Math.min(8.0, norm * 0.07));
        sphereMesh.scale.set(sphereScale, sphereScale, sphereScale);
    }

    // Oscilloscope sample push
    historyB.push({ bx, by, bz, norm });
    if (historyB.length > 250) historyB.shift();

    if (isRecording) {
        sessionSamples.push(norm);
        statSamples.innerText = sessionSamples.length;
    }
}

// Tare Ground Baseline
btnTare.addEventListener('click', () => {
    earthOffset = [...currentMag];
    isNetMode = true;
    btnNetMode.innerText = 'Modo: Campo Neto (Cero)';
    btnNetMode.classList.add('active');
});

btnNetMode.addEventListener('click', () => {
    isNetMode = !isNetMode;
    btnNetMode.innerText = isNetMode ? 'Modo: Campo Neto (Cero)' : 'Modo: Campo Total';
    if (isNetMode) btnNetMode.classList.add('active');
    else btnNetMode.classList.remove('active');
});

// ----------------------------------------------------
// 4. EXPERIMENT RECORDING CONTROLS
// ----------------------------------------------------
btnRecord.addEventListener('click', () => {
    const title = txtExpId.value || 'ensayo';
    const hypothesis = selHypothesis.options[selHypothesis.selectedIndex].text;

    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            type: 'start_experiment',
            title: title,
            hypothesis: hypothesis
        }));
    }
});

btnStop.addEventListener('click', () => {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'stop_experiment' }));
    }
});

function computeFinalStats() {
    if (sessionSamples.length === 0) return;
    const mean = sessionSamples.reduce((a, b) => a + b, 0) / sessionSamples.length;
    const variance = sessionSamples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sessionSamples.length;
    const std = Math.sqrt(variance);
    const maxVal = Math.max(...sessionSamples);

    statMean.innerText = `${mean.toFixed(1)} µT`;
    statStd.innerText = `${std.toFixed(2)} µT`;
    statMax.innerText = `${maxVal.toFixed(1)} µT`;
}

btnJarBeesAnalyze.addEventListener('click', () => {
    alert(`[JarBees Research Engine] Analizando último ensayo guardado...\n\nHipótesis evaluada: ${selHypothesis.value}\nCampo medio: ${statMean.innerText}\nVarianza: ${statStd.innerText}\n\nLos datos CSV están listos en 'scientific-lab/data/' para contrastar con las ecuaciones de Tesla.`);
});

// ----------------------------------------------------
// 5. 2D OSCILLOSCOPE RENDER LOOP
// ----------------------------------------------------
function renderScope() {
    const width = scopeCanvas.clientWidth;
    const height = scopeCanvas.clientHeight;
    if (scopeCanvas.width !== width || scopeCanvas.height !== height) {
        scopeCanvas.width = width;
        scopeCanvas.height = height;
    }

    scopeCtx.fillStyle = '#080c10';
    scopeCtx.fillRect(0, 0, width, height);

    // Center baseline
    scopeCtx.strokeStyle = '#21262d';
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, height / 2);
    scopeCtx.lineTo(width, height / 2);
    scopeCtx.stroke();

    if (historyB.length < 2) return;

    const channels = [
        { key: 'bx', color: '#f85149' },
        { key: 'by', color: '#3fb950' },
        { key: 'bz', color: '#58a6ff' },
        { key: 'norm', color: '#39d353', width: 2 }
    ];

    const maxScale = 100; // +- 100 uT range
    const stepX = width / 250;

    channels.forEach(ch => {
        scopeCtx.strokeStyle = ch.color;
        scopeCtx.lineWidth = ch.width || 1;
        scopeCtx.beginPath();

        historyB.forEach((pt, i) => {
            const x = i * stepX;
            const val = pt[ch.key];
            const y = (height / 2) - (val / maxScale) * (height / 2);
            if (i === 0) scopeCtx.moveTo(x, y);
            else scopeCtx.lineTo(x, y);
        });

        scopeCtx.stroke();
    });
}

// ----------------------------------------------------
// 6. MAIN ANIMATION LOOP
// ----------------------------------------------------
function animate() {
    requestAnimationFrame(animate);

    // Slowly orbit when not moving
    if (!isDragging) {
        ringMesh.rotation.z += 0.001;
    }

    renderer.render(scene, camera);
    renderScope();
}

// Initialize
initWebSocket();
animate();
