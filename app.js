/* ============================================================
   HALFTONE MACHINE — Application Logic V2
   ============================================================ */

const state = {
    sourceImage: null,
    fileName: '',
    previewData: null,
    previewWidth: 0,
    previewHeight: 0,
    params: {
        threshold: 0,
        dotSize: 12,
        dotShape: 0, // 0: circle, 1: square, 2: diamond, 3: wave
        angle: 45,
        spacing: 10,
        noise: 0,
        scale: 100,
        colorMode: 'classic',
        color1: 0,
        color2: 200,
    },
};

const canvas = document.getElementById('halftoneCanvas');
const ctx = canvas.getContext('2d');
const canvasFrame = document.getElementById('canvasFrame');
const uploadOverlay = document.getElementById('uploadOverlay');
const fileInput = document.getElementById('fileInput');

const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d');

// Mini Canvas for Animation
const animCanvas = document.getElementById('animCanvas');
const animCtx = animCanvas ? animCanvas.getContext('2d') : null;

function init() {
    setupCanvas();
    setupEventListeners();
    updateColorControlsVisibility();
    if (animCanvas) {
        setupAnimCanvas();
        startGenerativeAnimation();
    }
}

function setupAnimCanvas() {
    const rect = animCanvas.parentElement.getBoundingClientRect();
    animCanvas.width = rect.width;
    animCanvas.height = rect.height;
}

function setupCanvas() {
    const rect = canvasFrame.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setupEventListeners() {
    // Upload
    uploadOverlay.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag & Drop
    canvasFrame.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadOverlay.style.background = 'rgba(229, 0, 0, 0.2)';
    });
    canvasFrame.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadOverlay.style.background = '';
    });
    canvasFrame.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadOverlay.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file);
    });

    // Sliders
    const sliderIds = ['threshold', 'dotSize', 'angle', 'spacing', 'noise', 'scale', 'color1', 'color2'];
    sliderIds.forEach(id => {
        const slider = document.getElementById(id);
        if (!slider) return;
        slider.addEventListener('input', () => {
            state.params[id] = parseFloat(slider.value);
            requestRender();
        });
    });

    // Radio Pill Buttons (Color Mode & Dot Shape)
    document.querySelectorAll('input[name="colorMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if(e.target.checked) {
                state.params.colorMode = e.target.value;
                updateColorControlsVisibility();
                requestRender();
            }
        });
    });

    document.querySelectorAll('input[name="dotShape"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if(e.target.checked) {
                state.params.dotShape = parseInt(e.target.value);
                requestRender();
            }
        });
    });

    // Resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            setupCanvas();
            if (animCanvas) setupAnimCanvas();
            if (state.sourceImage) {
                processImage(state.sourceImage);
                requestRender();
            }
        }, 200);
    });

    // Bottom Action Buttons
    document.getElementById('btnUpload').addEventListener('click', () => fileInput.click());
    document.getElementById('btnExport').addEventListener('click', exportPNG);
    document.getElementById('btnRecord').addEventListener('click', toggleRecording);

    // Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            exportPNG();
        }
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) loadImage(file);
}

function loadImage(file) {
    state.fileName = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.sourceImage = img;
            processImage(img);
            uploadOverlay.classList.add('hidden');
            requestRender();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function processImage(img) {
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    const ratio = Math.min(canvasW / imgW, canvasH / imgH);
    const w = Math.floor(imgW * ratio);
    const h = Math.floor(imgH * ratio);

    offCanvas.width = w;
    offCanvas.height = h;
    offCtx.drawImage(img, 0, 0, w, h);

    state.previewData = offCtx.getImageData(0, 0, w, h);
    state.previewWidth = w;
    state.previewHeight = h;
}

let renderRAF = null;
function requestRender() {
    if (renderRAF) return;
    renderRAF = requestAnimationFrame(() => {
        render();
        renderRAF = null;
    });
}

function render() {
    if (!state.previewData) return;

    const {
        threshold, dotSize, dotShape, angle,
        spacing, noise, scale, colorMode, color1, color2
    } = state.params;

    const w = canvas.width;
    const h = canvas.height;
    const srcW = state.previewWidth;
    const srcH = state.previewHeight;
    const srcData = state.previewData.data;

    const ox = Math.floor((w - srcW) / 2);
    const oy = Math.floor((h - srcH) / 2);

    let dotColor, bgColor;
    const isInvert = colorMode === 'invert';

    switch (colorMode) {
        case 'classic': dotColor = '#000000'; bgColor = '#ffffff'; break;
        case 'invert': dotColor = '#ffffff'; bgColor = '#000000'; break;
        case 'duotone': dotColor = `hsl(${color1}, 85%, 40%)`; bgColor = `hsl(${color2}, 55%, 88%)`; break;
        case 'mono': dotColor = `hsl(${color1}, 80%, 28%)`; bgColor = `hsl(${color1}, 20%, 92%)`; break;
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const angleRad = angle * Math.PI / 180;
    const scaleFactor = scale / 100;
    const maxRadius = dotSize * scaleFactor;
    const effectiveSpacing = Math.max(2, spacing);
    const noiseAmount = noise / 100;
    const thresholdVal = threshold * 2.55;

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const diagonal = Math.sqrt(w * w + h * h);
    const numCols = Math.ceil(diagonal / effectiveSpacing) + 2;
    const numRows = Math.ceil(diagonal / effectiveSpacing) + 2;
    const halfCols = Math.ceil(numCols / 2);
    const halfRows = Math.ceil(numRows / 2);
    const centerX = w / 2;
    const centerY = h / 2;

    ctx.fillStyle = dotColor;
    ctx.strokeStyle = dotColor;

    // SHAPE 3: WAVE (NEW ALGORITHM)
    if (dotShape === 3) {
        // Draw waves across rows
        for (let row = -halfRows; row < halfRows; row++) {
            const gy = row * effectiveSpacing;
            
            // Draw variable thickness wave using overlapping circles
            ctx.beginPath();
            for (let col = -halfCols * effectiveSpacing; col < halfCols * effectiveSpacing; col += 2) {
                const gx = col;
                
                // Sine wave math
                const waveOffset = Math.sin(gx * 0.05) * (effectiveSpacing * 0.4);
                const finalGy = gy + waveOffset;

                const cx = gx * cos - finalGy * sin + centerX;
                const cy = gx * sin + finalGy * cos + centerY;

                if (cx < -maxRadius || cx > w + maxRadius || cy < -maxRadius || cy > h + maxRadius) continue;

                const sx = Math.floor(cx - ox);
                const sy = Math.floor(cy - oy);
                if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;

                const idx = (sy * srcW + sx) * 4;
                const brightness = srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114;

                if (isInvert ? brightness < thresholdVal : brightness > 255 - thresholdVal) continue;

                let radius = isInvert ? (brightness / 255) * maxRadius : ((255 - brightness) / 255) * maxRadius;
                if (noiseAmount > 0) radius *= 1 + (stableRandom(col, row) - 0.5) * noiseAmount * 2;

                if (radius < 0.4) continue;

                ctx.moveTo(cx + radius, cy);
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        return;
    }

    // SHAPES 0, 1, 2 (Circle, Square, Diamond)
    if (dotShape === 0) ctx.beginPath();

    for (let row = -halfRows; row < halfRows; row++) {
        for (let col = -halfCols; col < halfCols; col++) {
            const gx = col * effectiveSpacing;
            const gy = row * effectiveSpacing;

            const cx = gx * cos - gy * sin + centerX;
            const cy = gx * sin + gy * cos + centerY;

            if (cx < -maxRadius || cx > w + maxRadius || cy < -maxRadius || cy > h + maxRadius) continue;

            const sx = Math.floor(cx - ox);
            const sy = Math.floor(cy - oy);
            if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;

            const idx = (sy * srcW + sx) * 4;
            const brightness = srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114;

            if (isInvert ? brightness < thresholdVal : brightness > 255 - thresholdVal) continue;

            let radius = isInvert ? (brightness / 255) * maxRadius : ((255 - brightness) / 255) * maxRadius;
            if (noiseAmount > 0) radius *= 1 + (stableRandom(col, row) - 0.5) * noiseAmount * 2;

            if (radius < 0.4) continue;

            if (dotShape === 0) {
                ctx.moveTo(cx + radius, cy);
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            } else {
                drawShape(ctx, cx, cy, radius, dotShape, angleRad);
            }
        }
    }
    
    if (dotShape === 0) ctx.fill();
}

function drawShape(ctx, x, y, radius, shape, angle) {
    switch (shape) {
        case 1: // Square
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
            ctx.restore();
            break;
        case 2: // Diamond
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, -radius * 1.2);
            ctx.lineTo(radius * 1.2, 0);
            ctx.lineTo(0, radius * 1.2);
            ctx.lineTo(-radius * 1.2, 0);
            ctx.fill();
            ctx.restore();
            break;
    }
}

function stableRandom(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function updateColorControlsVisibility() {
    const mode = state.params.colorMode;
    const c1 = document.getElementById('color1Group');
    const c2 = document.getElementById('color2Group');

    if (mode === 'classic' || mode === 'invert') {
        c1.classList.add('disabled');
        c2.classList.add('disabled');
    } else if (mode === 'mono') {
        c1.classList.remove('disabled');
        c2.classList.add('disabled');
    } else {
        c1.classList.remove('disabled');
        c2.classList.remove('disabled');
    }
}

function exportPNG() {
    if (!state.sourceImage && !state.previewData) return;
    const link = document.createElement('a');
    link.download = `${state.fileName || 'halftone'}-export.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// ============================================================
// VIDEO RECORDING
// ============================================================
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

function toggleRecording() {
    const btn = document.getElementById('btnRecord');
    
    if (!isRecording) {
        // Start Recording
        try {
            // Get stream from canvas (30 fps)
            const stream = canvas.captureStream(30);
            
            // Choose video format
            const options = { mimeType: 'video/webm; codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            recordedChunks = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${state.fileName || 'halftone'}-record.webm`;
                link.click();
                URL.revokeObjectURL(url);
            };
            
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
            
        } catch (err) {
            console.error("Recording not supported or failed:", err);
            alert("Video recording is not supported in this browser.");
        }
    } else {
        // Stop Recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        btn.classList.remove('recording');
    }
}

// ============================================================
// CRT PIXEL ANIMATION ENGINE
// ============================================================
const PIXEL_SIZE = 4; // Each "pixel" is 4x4 real pixels
let currentScene = 0;
let animTime = 0;
let sceneData = {};

// GIF playback state
let gifMode = false;
let gifFrames = [];
let gifCurrentFrame = 0;
let gifFrameTicks = 0;
let gifElement = null; // legacy
const gifOffCanvas = document.createElement('canvas');
const gifOffCtx = gifOffCanvas.getContext('2d');

function nextScene() {
    gifMode = false;
    gifFrames = [];
    currentScene = Math.floor(Math.random() * 8);
    animTime = 0;
    sceneData = {};
    initScene();
}

async function loadGifToAnim(file) {
    if (!('ImageDecoder' in window)) {
        alert("Seu navegador não suporta a decodificação nativa de GIFs (ImageDecoder). Tente usar o Google Chrome ou Edge mais recentes.");
        return;
    }
    
    try {
        const decoder = new ImageDecoder({ data: file.stream(), type: 'image/gif' });
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        
        gifFrames = [];
        gifCurrentFrame = 0;
        gifFrameTicks = 0;
        gifMode = true; // start playing immediately
        
        // Decode all frames into memory
        for (let i = 0; i < track.frameCount; i++) {
            const result = await decoder.decode({ frameIndex: i });
            gifFrames.push(result.image); // stores the VideoFrame
        }
    } catch (e) {
        console.error("Failed to decode GIF", e);
    }
}

function initScene() {
    if (!animCanvas) return;
    const cols = Math.floor(animCanvas.width / PIXEL_SIZE);
    const rows = Math.floor(animCanvas.height / PIXEL_SIZE);

    switch (currentScene) {
        case 0: // Matrix Rain
            sceneData.drops = [];
            for (let i = 0; i < cols; i++) {
                sceneData.drops.push({
                    y: Math.random() * rows * -1,
                    speed: Math.random() * 1.5 + 0.5,
                    len: Math.floor(Math.random() * 10) + 4
                });
            }
            break;
        case 1: // Game of Life
            sceneData.grid = [];
            for (let i = 0; i < cols * rows; i++) {
                sceneData.grid.push(Math.random() > 0.7 ? 1 : 0);
            }
            sceneData.tick = 0;
            break;
        case 2: // Plasma
            break;
        case 3: // Bouncing Lines
            sceneData.lines = [];
            for (let i = 0; i < 6; i++) {
                sceneData.lines.push({
                    y: Math.random() * rows,
                    dy: (Math.random() - 0.5) * 2,
                    thick: Math.floor(Math.random() * 3) + 1
                });
            }
            break;
        case 4: // Expanding Circles
            sceneData.circles = [];
            for (let i = 0; i < 5; i++) {
                sceneData.circles.push({
                    cx: Math.floor(Math.random() * cols),
                    cy: Math.floor(Math.random() * rows),
                    r: 0, maxR: Math.random() * 30 + 10,
                    speed: Math.random() * 0.5 + 0.2
                });
            }
            break;
        case 5: // Static Noise TV
            break;
        case 6: // Snake / Worm
            sceneData.worms = [];
            for (let i = 0; i < 4; i++) {
                const trail = [];
                let wx = Math.floor(Math.random() * cols);
                let wy = Math.floor(Math.random() * rows);
                for (let t = 0; t < 20; t++) trail.push({x: wx, y: wy});
                sceneData.worms.push({ trail, dx: 1, dy: 0 });
            }
            break;
        case 7: // Sine Wave Stack
            sceneData.waveCount = Math.floor(Math.random() * 5) + 3;
            sceneData.waveFreqs = [];
            for (let i = 0; i < sceneData.waveCount; i++) {
                sceneData.waveFreqs.push(Math.random() * 0.15 + 0.03);
            }
            break;
    }
}

function drawPixel(x, y, brightness) {
    // brightness 0–1, rendered as green CRT shades
    const g = Math.floor(brightness * 255);
    animCtx.fillStyle = `rgb(${Math.floor(g*0.15)}, ${g}, ${Math.floor(g*0.1)})`;
    animCtx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
}

function startGenerativeAnimation() {
    if (!animCanvas || !animCtx) return;

    animCanvas.style.cursor = 'pointer';
    animCanvas.addEventListener('click', nextScene);

    // Drag & Drop GIF onto animation area
    animCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    animCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'image/gif' || file.type.startsWith('image/'))) {
            loadGifToAnim(file);
        }
    });

    initScene();

    function animLoop() {
        const w = animCanvas.width;
        const h = animCanvas.height;
        const cols = Math.floor(w / PIXEL_SIZE);
        const rows = Math.floor(h / PIXEL_SIZE);

        // CRT black background
        animCtx.fillStyle = '#020a02';
        animCtx.fillRect(0, 0, w, h);

        animTime += 1;

        if (gifMode && gifFrames.length > 0) {
            renderGifCRT(cols, rows);
        } else {
            switch (currentScene) {
                case 0: renderMatrixRain(cols, rows); break;
                case 1: renderGameOfLife(cols, rows); break;
                case 2: renderPlasma(cols, rows); break;
                case 3: renderBouncingLines(cols, rows); break;
                case 4: renderExpandingCircles(cols, rows); break;
                case 5: renderStaticNoise(cols, rows); break;
                case 6: renderWorms(cols, rows); break;
                case 7: renderSineWaves(cols, rows); break;
            }
        }

        // Scanlines overlay
        animCtx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < h; y += 2) {
            animCtx.fillRect(0, y, w, 1);
        }

        requestAnimationFrame(animLoop);
    }

    animLoop();
}

// --- SCENE 0: Matrix Rain ---
function renderMatrixRain(cols, rows) {
    const drops = sceneData.drops;
    if (!drops) return;
    for (let i = 0; i < cols; i++) {
        const d = drops[i];
        d.y += d.speed;
        if (d.y > rows + d.len) {
            d.y = -d.len;
            d.speed = Math.random() * 1.5 + 0.5;
        }
        for (let t = 0; t < d.len; t++) {
            const py = Math.floor(d.y - t);
            if (py >= 0 && py < rows) {
                const brightness = t === 0 ? 1.0 : (1 - t / d.len) * 0.7;
                drawPixel(i, py, brightness);
            }
        }
    }
}

// --- SCENE 1: Game of Life ---
function renderGameOfLife(cols, rows) {
    const grid = sceneData.grid;
    if (!grid) return;
    sceneData.tick++;

    // Evolve every 6 frames
    if (sceneData.tick % 6 === 0) {
        const next = new Array(cols * rows).fill(0);
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                let neighbors = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = (x + dx + cols) % cols;
                        const ny = (y + dy + rows) % rows;
                        neighbors += grid[ny * cols + nx];
                    }
                }
                const idx = y * cols + x;
                if (grid[idx] === 1) {
                    next[idx] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
                } else {
                    next[idx] = (neighbors === 3) ? 1 : 0;
                }
            }
        }
        sceneData.grid = next;
    }

    const g = sceneData.grid;
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (g[y * cols + x]) drawPixel(x, y, 0.85);
        }
    }
}

// --- SCENE 2: Plasma ---
function renderPlasma(cols, rows) {
    const t = animTime * 0.04;
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            const v1 = Math.sin(x * 0.15 + t);
            const v2 = Math.sin(y * 0.12 + t * 0.7);
            const v3 = Math.sin((x + y) * 0.1 + t * 0.5);
            const v4 = Math.sin(Math.sqrt(x*x + y*y) * 0.1 - t);
            const v = (v1 + v2 + v3 + v4 + 4) / 8;
            if (v > 0.25) drawPixel(x, y, v);
        }
    }
}

// --- SCENE 3: Bouncing Lines ---
function renderBouncingLines(cols, rows) {
    const lines = sceneData.lines;
    if (!lines) return;
    for (const line of lines) {
        line.y += line.dy;
        if (line.y <= 0 || line.y >= rows - 1) line.dy *= -1;
        for (let x = 0; x < cols; x++) {
            const wave = Math.sin(x * 0.08 + animTime * 0.05) * 3;
            for (let t = 0; t < line.thick; t++) {
                const py = Math.floor(line.y + wave + t);
                if (py >= 0 && py < rows) drawPixel(x, py, 0.9);
            }
        }
    }
}

// --- SCENE 4: Expanding Circles ---
function renderExpandingCircles(cols, rows) {
    const circles = sceneData.circles;
    if (!circles) return;
    for (const c of circles) {
        c.r += c.speed;
        if (c.r > c.maxR) {
            c.r = 0;
            c.cx = Math.floor(Math.random() * cols);
            c.cy = Math.floor(Math.random() * rows);
            c.maxR = Math.random() * 30 + 10;
        }
        // Draw ring
        const rInt = Math.floor(c.r);
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                const dist = Math.sqrt((x - c.cx) ** 2 + (y - c.cy) ** 2);
                if (Math.abs(dist - rInt) < 1.2) {
                    drawPixel(x, y, 1 - c.r / c.maxR);
                }
            }
        }
    }
}

// --- SCENE 5: Static Noise (TV) ---
function renderStaticNoise(cols, rows) {
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (Math.random() > 0.55) {
                drawPixel(x, y, Math.random() * 0.8);
            }
        }
    }
}

// --- SCENE 6: Worms ---
function renderWorms(cols, rows) {
    const worms = sceneData.worms;
    if (!worms) return;
    for (const worm of worms) {
        // Random turn
        if (Math.random() < 0.15) {
            const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
            const d = dirs[Math.floor(Math.random() * 4)];
            worm.dx = d.dx; worm.dy = d.dy;
        }
        const head = worm.trail[0];
        const nx = (head.x + worm.dx + cols) % cols;
        const ny = (head.y + worm.dy + rows) % rows;
        worm.trail.unshift({x: nx, y: ny});
        if (worm.trail.length > 25) worm.trail.pop();

        for (let i = 0; i < worm.trail.length; i++) {
            const p = worm.trail[i];
            drawPixel(p.x, p.y, 1 - i / worm.trail.length);
        }
    }
}

// --- SCENE 7: Sine Waves ---
function renderSineWaves(cols, rows) {
    const wc = sceneData.waveCount || 3;
    const freqs = sceneData.waveFreqs || [0.05, 0.08, 0.12];
    const t = animTime * 0.04;
    const mid = rows / 2;
    for (let w = 0; w < wc; w++) {
        const amp = (rows * 0.3) / wc;
        const offset = (w - wc / 2) * (rows / (wc + 1));
        for (let x = 0; x < cols; x++) {
            const y = Math.floor(mid + offset + Math.sin(x * freqs[w] + t + w * 2) * amp);
            if (y >= 0 && y < rows) drawPixel(x, y, 0.9 - w * 0.1);
            if (y + 1 >= 0 && y + 1 < rows) drawPixel(x, y + 1, 0.4);
        }
    }
}

// --- GIF as CRT Pixels ---
function renderGifCRT(cols, rows) {
    if (!gifFrames || gifFrames.length === 0) return;

    gifFrameTicks++;
    if (gifFrameTicks > 3) { // Control playback speed (update every 4 frames)
        gifFrameTicks = 0;
        gifCurrentFrame = (gifCurrentFrame + 1) % gifFrames.length;
    }
    
    const frame = gifFrames[gifCurrentFrame];

    // Draw current GIF frame into offscreen canvas at low res
    gifOffCanvas.width = cols;
    gifOffCanvas.height = rows;
    gifOffCtx.drawImage(frame, 0, 0, cols, rows);

    let data;
    try {
        data = gifOffCtx.getImageData(0, 0, cols, rows).data;
    } catch(e) {
        return; // CORS or tainting
    }

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            const idx = (y * cols + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a < 30) continue;

            // Convert to luminance
            const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            if (luma < 0.05) continue;

            drawPixel(x, y, luma);
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
