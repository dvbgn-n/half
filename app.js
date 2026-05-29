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
// GENERATIVE ANIMATION LOOP
// ============================================================
let animConfig = {
    color: '#E50000',
    spacing: 16,
    speed: 0.03,
    sizeMultX: 0.1,
    sizeMultY: 0.1,
    sizeTimeMult: 0.5,
    morphSpeed: 0.8,
    jitterX: 2,
    jitterY: 2,
    jitterSpeed: 2
};

function randomizeAnim() {
    const colors = ['#E50000', '#ffffff', '#aaaaaa', '#ff3333'];
    animConfig.color = colors[Math.floor(Math.random() * colors.length)];
    animConfig.spacing = Math.floor(Math.random() * 16) + 8; // 8 to 24
    animConfig.speed = (Math.random() * 0.04) + 0.01;
    animConfig.sizeMultX = Math.random() * 0.3;
    animConfig.sizeMultY = Math.random() * 0.3;
    animConfig.sizeTimeMult = Math.random();
    animConfig.morphSpeed = Math.random() * 2;
    animConfig.jitterX = Math.random() * 4;
    animConfig.jitterY = Math.random() * 4;
    animConfig.jitterSpeed = Math.random() * 3 + 1;
}

function startGenerativeAnimation() {
    let time = 0;
    
    // Make canvas clickable
    if (animCanvas) {
        animCanvas.style.cursor = 'pointer';
        animCanvas.addEventListener('click', randomizeAnim);
    }
    
    function animLoop() {
        if (!animCtx) return;
        
        const w = animCanvas.width;
        const h = animCanvas.height;
        
        // Clear background with slight fade for trails
        animCtx.fillStyle = 'rgba(10, 10, 10, 0.4)';
        animCtx.fillRect(0, 0, w, h);
        
        const spacing = animConfig.spacing;
        const cols = Math.ceil(w / spacing);
        const rows = Math.ceil(h / spacing);
        
        time += animConfig.speed;
        
        animCtx.fillStyle = animConfig.color;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = i * spacing + spacing / 2;
                const y = j * spacing + spacing / 2;
                
                const distToCenter = Math.sqrt(Math.pow(x - w/2, 2) + Math.pow(y - h/2, 2));
                
                // Size oscillates based on config
                const sizePhase = Math.sin(time + i * animConfig.sizeMultX + j * animConfig.sizeMultY) * Math.cos(time * animConfig.sizeTimeMult + distToCenter * 0.01);
                const maxSize = spacing * 0.9;
                let currentSize = Math.abs(sizePhase) * maxSize;
                
                if (currentSize < 1) continue;
                
                // Morphing shape
                const morphPhase = (Math.sin(time * animConfig.morphSpeed + distToCenter * 0.02) + 1) / 2;
                const radius = (currentSize / 2) * morphPhase;
                
                // Movement jitter
                const offsetX = Math.sin(time * animConfig.jitterSpeed + j * 0.5) * animConfig.jitterX;
                const offsetY = Math.cos(time * animConfig.jitterSpeed + i * 0.5) * animConfig.jitterY;
                
                animCtx.beginPath();
                animCtx.roundRect(x - currentSize/2 + offsetX, y - currentSize/2 + offsetY, currentSize, currentSize, radius);
                animCtx.fill();
            }
        }
        
        requestAnimationFrame(animLoop);
    }
    
    animLoop();
}

document.addEventListener('DOMContentLoaded', init);
