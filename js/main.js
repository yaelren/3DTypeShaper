/*
 * 3D Type Shaper - Main Logic (Three.js Version)
 * Converts text into letters made of 3D shapes (spheres, cubes, or custom GLB models)
 */

// ========== WAIT FOR THREE.JS TO LOAD ==========
let threeReady = false;
window.addEventListener('three-ready', () => {
    threeReady = true;
    init();
});

// Also check if Three.js is already available
if (window.THREE) {
    threeReady = true;
}

// ========== THREE.JS GLOBALS ==========
let scene, camera, renderer;
let instancedMesh = null;
let currentGeometry = null;
let currentMaterial = null;
let glbGeometry = null;
let dummy = null;
let cachedPoints = null;
let particlePositions = [];

// ========== STATE MANAGEMENT ==========
let textData = {
    text: '3D Type Shaper',
    fontFamily: 'Arial',
    fontSize: 200,
    lineHeight: 1.2,
    textOffsetX: 0,
    textOffsetY: 0,

    // Shape settings
    shapeType: 'sphere',  // 'sphere', 'cube', 'glb'
    shapeSize: 5,
    spacing: 1.0,

    // Material settings
    materialMode: 'matcap',  // 'matcap' or 'solid'
    shapeColor: '#4a90d9',

    // Animation
    isAnimating: false,
    animationSpeed: 1.0,
    animationTime: 0,

    // Hover effect
    hoverEffectEnabled: false,
    hoverRadius: 150,
    hoverIntensity: 2.0,
    mouseX: null,
    mouseY: null,

    // Auto mode settings
    interactionMode: 'mouse',
    autoPattern: 'infinity',
    autoSpeed: 1,
    autoSize: 5,
    autoDebug: false,
    autoTime: 0,

    // Canvas size tracking
    previousCanvasSize: { width: 0, height: 0 }
};

let animationFrameId = null;
let hoverAnimationFrameId = null;

// Random pattern state
let randomTarget = { x: 0, y: 0 };
let randomCurrent = { x: 0, y: 0 };
let randomLastTime = 0;
let randomInitialized = false;

// Trace pattern state
let traceIndex = 0;

// Matcap texture
let matcapTexture = null;

// ========== THREE.JS INITIALIZATION ==========
function init() {
    if (!window.THREE) {
        console.error('Three.js not loaded');
        return;
    }

    const THREE = window.THREE;
    const canvas = document.getElementById('chatooly-canvas');

    // Create scene
    scene = new THREE.Scene();

    // Create orthographic camera for 2D-like view
    const aspect = canvas.width / canvas.height;
    const frustumSize = canvas.height;
    camera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        2000
    );
    camera.position.z = 1000;

    // Create renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(canvas.width, canvas.height);
    renderer.setClearColor(0x000000, 0);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Initialize dummy object for matrix calculations
    dummy = new THREE.Object3D();

    // Create default matcap texture (gradient sphere look)
    createDefaultMatcap();

    // Setup event listeners
    setupEventListeners();

    // Initialize background manager
    initBackgroundManager();

    // Initial render
    rebuildParticleSystem();
}

// ========== MATCAP TEXTURE GENERATION ==========
function createDefaultMatcap() {
    const THREE = window.THREE;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Create radial gradient for matcap effect
    const gradient = ctx.createRadialGradient(
        size * 0.4, size * 0.35, 0,
        size * 0.5, size * 0.5, size * 0.5
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, '#aaccff');
    gradient.addColorStop(0.6, '#4488dd');
    gradient.addColorStop(1, '#112244');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    matcapTexture = new THREE.CanvasTexture(canvas);
    matcapTexture.needsUpdate = true;
}

// ========== BACKGROUND SYSTEM ==========
let backgroundTexture = null;

function initBackgroundManager() {
    const canvas = document.getElementById('chatooly-canvas');

    // Initialize background manager if available
    if (window.Chatooly && window.Chatooly.backgroundManager) {
        Chatooly.backgroundManager.init(canvas);
    }

    // Wire up background controls
    const transparentToggle = document.getElementById('transparent-bg');
    const bgColor = document.getElementById('bg-color');
    const bgImage = document.getElementById('bg-image');
    const clearBgImage = document.getElementById('clear-bg-image');
    const bgFit = document.getElementById('bg-fit');
    const bgColorGroup = document.getElementById('bg-color-group');

    if (transparentToggle) {
        transparentToggle.addEventListener('click', () => {
            const isPressed = transparentToggle.getAttribute('aria-pressed') === 'true';
            if (window.Chatooly && window.Chatooly.backgroundManager) {
                Chatooly.backgroundManager.setTransparent(isPressed);
            }
            if (bgColorGroup) {
                bgColorGroup.style.display = isPressed ? 'none' : 'block';
            }
            updateBackground();
        });
    }

    if (bgColor) {
        bgColor.addEventListener('input', (e) => {
            if (window.Chatooly && window.Chatooly.backgroundManager) {
                Chatooly.backgroundManager.setBackgroundColor(e.target.value);
            }
            updateBackground();
        });
    }

    if (bgImage) {
        bgImage.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && window.Chatooly && window.Chatooly.backgroundManager) {
                await Chatooly.backgroundManager.setBackgroundImage(file);
                if (clearBgImage) clearBgImage.style.display = 'block';
                const bgFitGroup = document.getElementById('bg-fit-group');
                if (bgFitGroup) bgFitGroup.style.display = 'block';
                updateBackground();
            }
        });
    }

    if (clearBgImage) {
        clearBgImage.addEventListener('click', () => {
            if (window.Chatooly && window.Chatooly.backgroundManager) {
                Chatooly.backgroundManager.clearBackgroundImage();
            }
            clearBgImage.style.display = 'none';
            const bgFitGroup = document.getElementById('bg-fit-group');
            if (bgFitGroup) bgFitGroup.style.display = 'none';
            if (bgImage) bgImage.value = '';
            updateBackground();
        });
    }

    if (bgFit) {
        bgFit.addEventListener('change', (e) => {
            if (window.Chatooly && window.Chatooly.backgroundManager) {
                Chatooly.backgroundManager.setFit(e.target.value);
            }
            updateBackground();
        });
    }

    // Initial background update
    updateBackground();
}

function updateBackground() {
    if (!renderer) return;

    const THREE = window.THREE;

    if (!window.Chatooly || !window.Chatooly.backgroundManager) {
        renderer.setClearColor(0xffffff, 1);
        return;
    }

    const bg = Chatooly.backgroundManager.getBackgroundState();

    if (bg.bgTransparent) {
        // Transparent background
        renderer.setClearAlpha(0);
        scene.background = null;
        if (backgroundTexture) {
            backgroundTexture.dispose();
            backgroundTexture = null;
        }
        render();
        return;
    }

    if (bg.bgImage && bg.bgImageURL) {
        // Background image
        if (backgroundTexture) {
            backgroundTexture.dispose();
            backgroundTexture = null;
        }

        const canvasWidth = renderer.domElement.width;
        const canvasHeight = renderer.domElement.height;
        const dims = Chatooly.backgroundManager.calculateImageDimensions(canvasWidth, canvasHeight);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const ctx = tempCanvas.getContext('2d');

        // Fill with bg color first
        ctx.fillStyle = bg.bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw image
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, dims.offsetX, dims.offsetY, dims.drawWidth, dims.drawHeight);
            backgroundTexture = new THREE.CanvasTexture(tempCanvas);
            backgroundTexture.needsUpdate = true;
            scene.background = backgroundTexture;

            const color = new THREE.Color(bg.bgColor);
            renderer.setClearColor(color, 1);
            renderer.setClearAlpha(1);
            render();
        };
        img.onerror = () => {
            const color = new THREE.Color(bg.bgColor);
            renderer.setClearColor(color, 1);
            renderer.setClearAlpha(1);
            scene.background = null;
            render();
        };
        img.src = bg.bgImageURL;
    } else {
        // Solid color background
        const color = new THREE.Color(bg.bgColor);
        renderer.setClearColor(color, 1);
        renderer.setClearAlpha(1);
        scene.background = null;

        if (backgroundTexture) {
            backgroundTexture.dispose();
            backgroundTexture = null;
        }
        render();
    }
}

// ========== TEXT TO 3D POINTS ==========
function getTextPoints(text, fontSize, spacing) {
    const THREE = window.THREE;
    const points = [];
    const canvas = document.getElementById('chatooly-canvas');

    // Create a temporary canvas to measure and draw text
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    // Set font
    tempCtx.font = `bold ${fontSize}px ${textData.fontFamily}, sans-serif`;
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    tempCtx.fillStyle = '#FFFFFF';

    // Split text into lines
    const lines = text.split('\n');
    const lineHeightPixels = fontSize * textData.lineHeight;

    // Calculate total text height for proper vertical centering
    const totalTextHeight = fontSize + (lines.length - 1) * lineHeightPixels;
    const offsetX = (textData.textOffsetX / 100) * canvas.width;
    const offsetY = (textData.textOffsetY / 100) * canvas.height;
    const startY = (canvas.height / 2) - (totalTextHeight / 2) + (fontSize / 2) + offsetY;
    const centerX = (canvas.width / 2) + offsetX;

    // Draw each line
    lines.forEach((line, index) => {
        const y = startY + (index * lineHeightPixels);
        tempCtx.fillText(line, centerX, y);
    });

    // Sample pixels from the filled text
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // Sample points based on spacing
    const step = spacing;

    // Scan the entire canvas for text pixels
    for (let y = 0; y < tempCanvas.height; y += step) {
        for (let x = 0; x < tempCanvas.width; x += step) {
            const px = Math.floor(x);
            const py = Math.floor(y);

            if (px >= 0 && px < tempCanvas.width && py >= 0 && py < tempCanvas.height) {
                const index = (py * tempCanvas.width + px) * 4;
                const alpha = data[index + 3];

                // If pixel is part of the text (alpha > 0)
                if (alpha > 128) {
                    // Convert canvas coords to 3D scene coords
                    // Center at origin, flip Y axis for 3D
                    points.push({
                        x: px - canvas.width / 2,
                        y: canvas.height / 2 - py,
                        z: 0
                    });
                }
            }
        }
    }

    return points;
}

// ========== GEOMETRY CREATION ==========
function createShapeGeometry(shapeType) {
    const THREE = window.THREE;

    switch (shapeType) {
        case 'sphere':
            return new THREE.SphereGeometry(0.5, 16, 16);
        case 'cube':
            return new THREE.BoxGeometry(1, 1, 1);
        case 'glb':
            return glbGeometry ? glbGeometry.clone() : new THREE.SphereGeometry(0.5, 16, 16);
        default:
            return new THREE.SphereGeometry(0.5, 16, 16);
    }
}

// ========== MATERIAL CREATION ==========
function createMaterial(mode, color) {
    const THREE = window.THREE;

    if (mode === 'matcap' && matcapTexture) {
        return new THREE.MeshMatcapMaterial({
            matcap: matcapTexture,
            color: new THREE.Color(color)
        });
    } else {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            metalness: 0.3,
            roughness: 0.7
        });
    }
}

// ========== PARTICLE SYSTEM ==========
function rebuildParticleSystem() {
    if (!scene || !window.THREE) return;

    const THREE = window.THREE;

    // Get text points
    cachedPoints = getTextPoints(
        textData.text,
        textData.fontSize,
        textData.shapeSize * textData.spacing
    );

    if (cachedPoints.length === 0) {
        // Clear existing mesh if no points
        if (instancedMesh) {
            scene.remove(instancedMesh);
            instancedMesh = null;
        }
        render();
        return;
    }

    // Remove existing mesh
    if (instancedMesh) {
        scene.remove(instancedMesh);
        if (instancedMesh.geometry) instancedMesh.geometry.dispose();
        if (instancedMesh.material) instancedMesh.material.dispose();
    }

    // Create new geometry and material
    currentGeometry = createShapeGeometry(textData.shapeType);
    currentMaterial = createMaterial(textData.materialMode, textData.shapeColor);

    // Create instanced mesh
    instancedMesh = new THREE.InstancedMesh(
        currentGeometry,
        currentMaterial,
        cachedPoints.length
    );
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Store particle positions
    particlePositions = cachedPoints.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z,
        baseScale: 1.0
    }));

    // Update and add to scene
    updateInstancedMesh();
    scene.add(instancedMesh);

    render();
}

function updateInstancedMesh(rotationAngle = 0) {
    if (!instancedMesh || !dummy || particlePositions.length === 0) return;

    const THREE = window.THREE;

    for (let i = 0; i < particlePositions.length; i++) {
        const p = particlePositions[i];

        // Calculate hover scale
        let scale = p.baseScale;
        if (textData.hoverEffectEnabled && textData.mouseX !== null) {
            scale *= getHoverScale3D(p.x, p.y);
        }

        // Set transform
        dummy.position.set(p.x, p.y, p.z);

        // Apply rotation with phase offset for variety
        const phase = (i * 0.1) % (Math.PI * 2);
        dummy.rotation.set(rotationAngle + phase, rotationAngle + phase, 0);

        dummy.scale.setScalar(textData.shapeSize * scale);
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
}

// ========== HOVER EFFECT ==========
function getHoverScale3D(pointX, pointY) {
    if (!textData.hoverEffectEnabled || textData.mouseX === null || textData.mouseY === null) {
        return 1.0;
    }

    const THREE = window.THREE;
    const canvas = document.getElementById('chatooly-canvas');

    // Convert 3D position to screen coordinates
    const vec = new THREE.Vector3(pointX, pointY, 0);
    vec.project(camera);

    const screenX = (vec.x + 1) / 2 * canvas.width;
    const screenY = (-vec.y + 1) / 2 * canvas.height;

    // Calculate distance to mouse
    const dx = screenX - textData.mouseX;
    const dy = screenY - textData.mouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= textData.hoverRadius) {
        return 1.0;
    }

    // Calculate scale factor
    const normalizedDistance = distance / textData.hoverRadius;
    let scale;

    if (textData.hoverIntensity >= 1.0) {
        scale = 1.0 + (textData.hoverIntensity - 1.0) * (1 - normalizedDistance);
    } else {
        const shrinkAmount = Math.abs(textData.hoverIntensity);
        const minScale = Math.max(0.1, 1.0 / (shrinkAmount + 1));
        scale = 1.0 - (1.0 - minScale) * (1 - normalizedDistance);
    }

    return Math.max(0.1, scale);
}

// ========== AUTO POSITION PATTERNS ==========
function getAutoPosition(time, pattern) {
    const canvas = document.getElementById('chatooly-canvas');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const speed = textData.autoSpeed * 0.0003;
    const t = time * speed;
    const sizeMultiplier = textData.autoSize * 0.1;

    let position = { x: centerX, y: centerY };

    switch (pattern) {
        case 'sine':
            position = {
                x: centerX + Math.sin(t) * (canvas.width * 0.35 * sizeMultiplier),
                y: centerY + Math.sin(t * 2) * (50 * sizeMultiplier)
            };
            break;

        case 'infinity':
            position = {
                x: centerX + Math.sin(t) * (canvas.width * 0.3 * sizeMultiplier),
                y: centerY + Math.sin(t * 2) * (canvas.height * 0.2 * sizeMultiplier)
            };
            break;

        case 'circle':
            position = {
                x: centerX + Math.cos(t) * (canvas.width * 0.3 * sizeMultiplier),
                y: centerY + Math.sin(t) * (canvas.height * 0.25 * sizeMultiplier)
            };
            break;

        case 'random':
            const rangeX = canvas.width * 0.4 * sizeMultiplier;
            const rangeY = canvas.height * 0.35 * sizeMultiplier;

            if (!randomInitialized) {
                randomCurrent.x = centerX;
                randomCurrent.y = centerY;
                randomTarget.x = centerX + (Math.random() * 2 - 1) * rangeX;
                randomTarget.y = centerY + (Math.random() * 2 - 1) * rangeY;
                randomInitialized = true;
            }

            const interval = 3000 / textData.autoSpeed;
            if (time - randomLastTime > interval) {
                randomTarget.x = centerX + (Math.random() * 2 - 1) * rangeX;
                randomTarget.y = centerY + (Math.random() * 2 - 1) * rangeY;
                randomLastTime = time;
            }

            const easeSpeed = 0.02 + (textData.autoSpeed * 0.008);
            randomCurrent.x += (randomTarget.x - randomCurrent.x) * easeSpeed;
            randomCurrent.y += (randomTarget.y - randomCurrent.y) * easeSpeed;

            position = {
                x: randomCurrent.x,
                y: randomCurrent.y
            };
            break;

        case 'trace':
            if (cachedPoints && cachedPoints.length > 0) {
                const pointsPerFrame = Math.max(1, Math.floor(textData.autoSpeed * 2));
                traceIndex = (traceIndex + pointsPerFrame) % cachedPoints.length;

                const point = cachedPoints[traceIndex];
                // Convert 3D coords back to screen coords
                position = {
                    x: point.x + canvas.width / 2,
                    y: canvas.height / 2 - point.y
                };
            }
            break;
    }

    return position;
}

// ========== GLB LOADING ==========
async function loadGLBModel(file) {
    return new Promise((resolve, reject) => {
        const THREE = window.THREE;
        const LoaderClass = window.GLTFLoader;

        if (!LoaderClass) {
            reject(new Error('GLTFLoader not available'));
            return;
        }

        const loader = new LoaderClass();
        const url = URL.createObjectURL(file);

        loader.load(
            url,
            (gltf) => {
                let mesh = null;
                gltf.scene.traverse((child) => {
                    if (child.isMesh && !mesh) {
                        mesh = child;
                    }
                });

                if (!mesh) {
                    URL.revokeObjectURL(url);
                    reject(new Error('No mesh found in GLB file'));
                    return;
                }

                glbGeometry = mesh.geometry.clone();

                // Normalize geometry
                glbGeometry.computeBoundingBox();
                glbGeometry.center();

                const box = glbGeometry.boundingBox;
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);

                if (maxDim > 0) {
                    const scale = 1 / maxDim;
                    glbGeometry.scale(scale, scale, scale);
                }

                URL.revokeObjectURL(url);

                // Rebuild particle system with new geometry
                rebuildParticleSystem();

                resolve(glbGeometry);
            },
            null,
            (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            }
        );
    });
}

function clearGLBModel() {
    glbGeometry = null;
    if (textData.shapeType === 'glb') {
        rebuildParticleSystem();
    }
}

// ========== RENDER ==========
function render(rotationAngle = 0) {
    if (!renderer || !scene || !camera) return;

    // Update instanced mesh
    updateInstancedMesh(rotationAngle);

    // Render scene
    renderer.render(scene, camera);
}

// ========== ANIMATION ==========
function animate() {
    if (!textData.isAnimating) {
        animationFrameId = null;
        return;
    }

    textData.animationTime += 0.016 * textData.animationSpeed;

    // Update auto position if in auto mode
    if (textData.hoverEffectEnabled && textData.interactionMode === 'auto') {
        textData.autoTime += 16;
        const autoPos = getAutoPosition(textData.autoTime, textData.autoPattern);
        textData.mouseX = autoPos.x;
        textData.mouseY = autoPos.y;
    }

    render(textData.animationTime);

    animationFrameId = requestAnimationFrame(animate);
}

function startAnimation() {
    if (!textData.isAnimating) {
        if (window.stopHoverRendering) {
            window.stopHoverRendering();
        }

        textData.isAnimating = true;
        textData.animationTime = 0;
        animate();
    }
}

function stopAnimation() {
    if (textData.isAnimating) {
        textData.isAnimating = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        render(0);

        if (textData.hoverEffectEnabled && window.startHoverRendering) {
            window.startHoverRendering();
        }
    }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    const canvas = document.getElementById('chatooly-canvas');

    // Text input
    document.getElementById('text-input').addEventListener('input', (e) => {
        textData.text = e.target.value || ' ';
        traceIndex = 0;
        rebuildParticleSystem();
    });

    // Font selector
    const fontSelector = document.getElementById('font-selector');
    if (fontSelector) {
        fontSelector.addEventListener('change', (e) => {
            textData.fontFamily = e.target.value;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Custom font upload
    const customFontInput = document.getElementById('custom-font-input');
    if (customFontInput) {
        customFontInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const fontDataUrl = event.target.result;
                const fontName = 'UploadedFont_' + Date.now();

                const newStyle = document.createElement('style');
                newStyle.textContent = `@font-face { font-family: '${fontName}'; src: url(${fontDataUrl}); }`;
                document.head.appendChild(newStyle);

                if (fontSelector) {
                    const option = document.createElement('option');
                    option.value = fontName;
                    option.textContent = file.name;
                    fontSelector.appendChild(option);
                    fontSelector.value = fontName;
                    textData.fontFamily = fontName;

                    try {
                        await document.fonts.load(`bold ${textData.fontSize}px ${fontName}`);
                    } catch (err) {
                        console.warn('Font load warning:', err);
                    }

                    traceIndex = 0;
                    rebuildParticleSystem();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Line height
    const lineHeightInput = document.getElementById('line-height');
    const lineHeightValue = document.getElementById('line-height-value');
    if (lineHeightInput) {
        lineHeightInput.addEventListener('input', (e) => {
            textData.lineHeight = parseFloat(e.target.value);
            if (lineHeightValue) lineHeightValue.textContent = textData.lineHeight.toFixed(1);
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Text position offsets
    const textOffsetXInput = document.getElementById('text-offset-x');
    const textOffsetXValue = document.getElementById('text-offset-x-value');
    if (textOffsetXInput) {
        textOffsetXInput.addEventListener('input', (e) => {
            textData.textOffsetX = parseInt(e.target.value);
            if (textOffsetXValue) textOffsetXValue.textContent = textData.textOffsetX;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    const textOffsetYInput = document.getElementById('text-offset-y');
    const textOffsetYValue = document.getElementById('text-offset-y-value');
    if (textOffsetYInput) {
        textOffsetYInput.addEventListener('input', (e) => {
            textData.textOffsetY = parseInt(e.target.value);
            if (textOffsetYValue) textOffsetYValue.textContent = textData.textOffsetY;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Shape type
    const shapeTypeSelect = document.getElementById('shape-type');
    const glbUploadGroup = document.getElementById('glb-upload-group');

    shapeTypeSelect.addEventListener('change', (e) => {
        textData.shapeType = e.target.value;

        // Show/hide GLB upload
        if (textData.shapeType === 'glb') {
            if (glbUploadGroup) glbUploadGroup.style.display = 'block';
        } else {
            if (glbUploadGroup) glbUploadGroup.style.display = 'none';
        }

        rebuildParticleSystem();
    });

    // Material mode
    const materialModeSelect = document.getElementById('material-mode');
    if (materialModeSelect) {
        materialModeSelect.addEventListener('change', (e) => {
            textData.materialMode = e.target.value;
            rebuildParticleSystem();
        });
    }

    // GLB upload
    const glbModelInput = document.getElementById('glb-model');
    const glbInfo = document.getElementById('glb-info');
    const glbNameEl = document.getElementById('glb-name');

    if (glbModelInput) {
        glbModelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                if (glbNameEl) glbNameEl.textContent = 'Loading...';
                if (glbInfo) glbInfo.style.display = 'block';

                await loadGLBModel(file);

                if (glbNameEl) glbNameEl.textContent = file.name;
            } catch (error) {
                alert('Failed to load GLB: ' + error.message);
                if (glbInfo) glbInfo.style.display = 'none';
                glbModelInput.value = '';
            }
        });
    }

    // Clear GLB
    const clearGlbBtn = document.getElementById('clear-glb');
    if (clearGlbBtn) {
        clearGlbBtn.addEventListener('click', () => {
            clearGLBModel();
            if (glbInfo) glbInfo.style.display = 'none';
            if (glbModelInput) glbModelInput.value = '';
        });
    }

    // Shape size
    const shapeSizeInput = document.getElementById('shape-size');
    const shapeSizeValue = document.getElementById('shape-size-value');
    if (shapeSizeInput) {
        shapeSizeInput.addEventListener('input', (e) => {
            textData.shapeSize = parseInt(e.target.value);
            if (shapeSizeValue) shapeSizeValue.textContent = textData.shapeSize;
            rebuildParticleSystem();
        });
    }

    // Spacing
    const spacingInput = document.getElementById('spacing');
    const spacingValue = document.getElementById('spacing-value');
    if (spacingInput) {
        spacingInput.addEventListener('input', (e) => {
            textData.spacing = parseFloat(e.target.value);
            if (spacingValue) spacingValue.textContent = textData.spacing.toFixed(1);
            rebuildParticleSystem();
        });
    }

    // Font size
    const fontSizeInput = document.getElementById('font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    if (fontSizeInput) {
        fontSizeInput.addEventListener('input', (e) => {
            textData.fontSize = parseInt(e.target.value);
            if (fontSizeValue) fontSizeValue.textContent = textData.fontSize;
            rebuildParticleSystem();
        });
    }

    // Shape color
    const shapeColorInput = document.getElementById('shape-color');
    if (shapeColorInput) {
        shapeColorInput.addEventListener('input', (e) => {
            textData.shapeColor = e.target.value;
            rebuildParticleSystem();
        });
    }

    // Animation toggle
    const animateToggle = document.getElementById('animate-shapes');
    const animationSpeedGroup = document.getElementById('animation-speed-group');
    if (animateToggle) {
        animateToggle.addEventListener('toggle-change', (e) => {
            if (e.detail.checked) {
                if (animationSpeedGroup) animationSpeedGroup.style.display = 'block';
                startAnimation();
            } else {
                if (animationSpeedGroup) animationSpeedGroup.style.display = 'none';
                stopAnimation();
            }
        });
    }

    // Animation speed
    const animationSpeedInput = document.getElementById('animation-speed');
    const animationSpeedValue = document.getElementById('animation-speed-value');
    if (animationSpeedInput) {
        animationSpeedInput.addEventListener('input', (e) => {
            textData.animationSpeed = parseFloat(e.target.value);
            if (animationSpeedValue) animationSpeedValue.textContent = textData.animationSpeed.toFixed(1);
        });
    }

    // Hover effect toggle
    const hoverEffectToggle = document.getElementById('hover-effect');
    const hoverControlsGroup = document.getElementById('hover-controls-group');

    if (hoverEffectToggle) {
        hoverEffectToggle.addEventListener('toggle-change', (e) => {
            textData.hoverEffectEnabled = e.detail.checked;

            if (textData.hoverEffectEnabled) {
                if (hoverControlsGroup) hoverControlsGroup.style.display = 'block';
                if (window.startHoverRendering) {
                    window.startHoverRendering();
                }
            } else {
                if (hoverControlsGroup) hoverControlsGroup.style.display = 'none';
                if (window.stopHoverRendering) {
                    window.stopHoverRendering();
                }
                textData.mouseX = null;
                textData.mouseY = null;
                render(textData.isAnimating ? textData.animationTime : 0);
            }
        });
    }

    // Interaction mode buttons
    const modeMouseBtn = document.getElementById('mode-mouse');
    const modeAutoBtn = document.getElementById('mode-auto');
    const autoModeControls = document.getElementById('auto-mode-controls');

    if (modeMouseBtn && modeAutoBtn) {
        modeMouseBtn.addEventListener('click', () => {
            textData.interactionMode = 'mouse';
            modeMouseBtn.classList.add('active');
            modeAutoBtn.classList.remove('active');
            if (autoModeControls) autoModeControls.style.display = 'none';
            textData.mouseX = null;
            textData.mouseY = null;
        });

        modeAutoBtn.addEventListener('click', () => {
            textData.interactionMode = 'auto';
            modeAutoBtn.classList.add('active');
            modeMouseBtn.classList.remove('active');
            if (autoModeControls) autoModeControls.style.display = 'block';
            textData.autoTime = 0;
            randomInitialized = false;
            traceIndex = 0;
        });
    }

    // Auto pattern
    const autoPatternSelect = document.getElementById('auto-pattern');
    if (autoPatternSelect) {
        autoPatternSelect.addEventListener('change', (e) => {
            textData.autoPattern = e.target.value;
            randomInitialized = false;
            traceIndex = 0;
        });
    }

    // Auto speed
    const autoSpeedInput = document.getElementById('auto-speed');
    const autoSpeedValue = document.getElementById('auto-speed-value');
    if (autoSpeedInput) {
        autoSpeedInput.addEventListener('input', (e) => {
            textData.autoSpeed = parseFloat(e.target.value);
            if (autoSpeedValue) autoSpeedValue.textContent = textData.autoSpeed.toFixed(1);
        });
    }

    // Auto size
    const autoSizeInput = document.getElementById('auto-size');
    const autoSizeValue = document.getElementById('auto-size-value');
    if (autoSizeInput) {
        autoSizeInput.addEventListener('input', (e) => {
            textData.autoSize = parseInt(e.target.value);
            if (autoSizeValue) autoSizeValue.textContent = textData.autoSize;
        });
    }

    // Auto debug toggle
    const autoDebugToggle = document.getElementById('auto-debug');
    if (autoDebugToggle) {
        autoDebugToggle.addEventListener('toggle-change', (e) => {
            textData.autoDebug = e.detail.checked;
        });
    }

    // Hover radius
    const hoverRadiusInput = document.getElementById('hover-radius');
    const hoverRadiusValue = document.getElementById('hover-radius-value');
    if (hoverRadiusInput) {
        hoverRadiusInput.addEventListener('input', (e) => {
            textData.hoverRadius = parseInt(e.target.value);
            if (hoverRadiusValue) hoverRadiusValue.textContent = textData.hoverRadius;
        });
    }

    // Hover intensity
    const hoverIntensityInput = document.getElementById('hover-intensity');
    const hoverIntensityValue = document.getElementById('hover-intensity-value');
    if (hoverIntensityInput) {
        hoverIntensityInput.addEventListener('input', (e) => {
            textData.hoverIntensity = parseFloat(e.target.value);
            if (hoverIntensityValue) hoverIntensityValue.textContent = textData.hoverIntensity.toFixed(1);
        });
    }

    // Mouse tracking for hover effect
    function updateMousePosition(e) {
        if (!textData.hoverEffectEnabled || textData.interactionMode !== 'mouse') return;

        const coords = window.Chatooly ?
            window.Chatooly.utils.mapMouseToCanvas(e, canvas) :
            fallbackMouseMapping(e);

        textData.mouseX = coords.x;
        textData.mouseY = coords.y;
    }

    function fallbackMouseMapping(e) {
        const rect = canvas.getBoundingClientRect();
        const displayX = e.clientX - rect.left;
        const displayY = e.clientY - rect.top;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: displayX * scaleX, y: displayY * scaleY };
    }

    canvas.addEventListener('mousemove', updateMousePosition);
    canvas.addEventListener('mouseleave', () => {
        if (textData.interactionMode === 'mouse') {
            textData.mouseX = null;
            textData.mouseY = null;
            if (textData.hoverEffectEnabled && !textData.isAnimating) {
                render();
            }
        }
    });

    // Hover rendering loop
    function startHoverRendering() {
        stopHoverRendering();

        if (textData.hoverEffectEnabled && !textData.isAnimating) {
            function hoverRenderLoop() {
                if (!textData.hoverEffectEnabled || textData.isAnimating) {
                    hoverAnimationFrameId = null;
                    return;
                }

                if (textData.interactionMode === 'auto') {
                    textData.autoTime += 16;
                    const autoPos = getAutoPosition(textData.autoTime, textData.autoPattern);
                    textData.mouseX = autoPos.x;
                    textData.mouseY = autoPos.y;
                }

                render();
                hoverAnimationFrameId = requestAnimationFrame(hoverRenderLoop);
            }
            hoverAnimationFrameId = requestAnimationFrame(hoverRenderLoop);
        }
    }

    function stopHoverRendering() {
        if (hoverAnimationFrameId) {
            cancelAnimationFrame(hoverAnimationFrameId);
            hoverAnimationFrameId = null;
        }
    }

    window.startHoverRendering = startHoverRendering;
    window.stopHoverRendering = stopHoverRendering;

    // Canvas resize handling
    document.addEventListener('chatooly:canvas-resized', (e) => {
        if (textData.text && textData.text.trim()) {
            const newWidth = e.detail.canvas.width;
            const newHeight = e.detail.canvas.height;

            // Update renderer and camera
            if (renderer) {
                renderer.setSize(newWidth, newHeight);
            }

            if (camera) {
                const aspect = newWidth / newHeight;
                const frustumSize = newHeight;
                camera.left = -frustumSize * aspect / 2;
                camera.right = frustumSize * aspect / 2;
                camera.top = frustumSize / 2;
                camera.bottom = -frustumSize / 2;
                camera.updateProjectionMatrix();
            }

            textData.previousCanvasSize = { width: newWidth, height: newHeight };
            rebuildParticleSystem();
        }
    });

    textData.previousCanvasSize = { width: canvas.width, height: canvas.height };
}

// ========== HIGH-RESOLUTION EXPORT ==========
window.renderHighResolution = function(targetCanvas, scale) {
    if (!textData.text || !textData.text.trim() || !renderer) {
        console.warn('No text to export or renderer not ready');
        return;
    }

    const canvas = document.getElementById('chatooly-canvas');
    const origWidth = canvas.width;
    const origHeight = canvas.height;

    // Set high-res size
    const scaledWidth = origWidth * scale;
    const scaledHeight = origHeight * scale;

    // Update renderer size
    renderer.setSize(scaledWidth, scaledHeight);

    // Update camera
    const aspect = scaledWidth / scaledHeight;
    const frustumSize = scaledHeight;
    camera.left = -frustumSize * aspect / 2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    // Rebuild particle system at high resolution
    rebuildParticleSystem();

    // Render
    render(textData.isAnimating ? textData.animationTime : 0);

    // Copy to target canvas
    targetCanvas.width = scaledWidth;
    targetCanvas.height = scaledHeight;
    const ctx = targetCanvas.getContext('2d');
    ctx.drawImage(renderer.domElement, 0, 0);

    // Restore original size
    renderer.setSize(origWidth, origHeight);

    camera.left = -origHeight * (origWidth / origHeight) / 2;
    camera.right = origHeight * (origWidth / origHeight) / 2;
    camera.top = origHeight / 2;
    camera.bottom = -origHeight / 2;
    camera.updateProjectionMatrix();

    rebuildParticleSystem();

    console.log(`High-res export completed at ${scale}x resolution`);
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    // If Three.js is already loaded, initialize
    if (threeReady) {
        init();
    }
});
