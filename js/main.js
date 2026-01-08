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
    // Source mode settings
    sourceMode: 'text',              // 'text' | 'shape' | 'svg'
    // Predefined shapes
    spawnShapeType: 'circle',        // 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'hexagon'
    spawnShapeSize: 200,             // Size in pixels (50-500)
    shapeFillMode: 'outline',        // 'outline' | 'fill'
    // SVG settings
    svgData: null,                   // Parsed SVG data object
    svgFileName: null,               // Original filename
    svgSampleMode: 'outline',        // 'outline' | 'fill' | 'both'
    svgFitMode: 'contain',           // 'contain' | 'cover' | 'stretch'

    // Text settings
    text: '3D Type Shaper',
    fontFamily: 'Arial',
    fontSize: 200,
    leading: 1.2,           // Renamed from lineHeight
    letterSpacing: 0,       // Kerning in pixels (-10 to 50)
    textAlign: 'center',    // 'left', 'center', 'right'
    textOffsetX: 0,
    textOffsetY: 0,

    // 3D Shape settings (the objects that spawn at each point)
    shapeType: 'sphere',  // 'sphere', 'cube', 'glb'
    shapeSize: 5,
    spacing: 1.0,

    // Material settings
    materialType: 'solid',  // 'solid', 'matcapUpload', 'gradient'
    materialMode: 'matcap',  // legacy: 'matcap' or 'solid'
    shapeColor: '#4a90d9',

    // Gradient shader settings (from 3D Trail)
    gradientSets: [{
        name: 'Gradient 1',
        stops: [
            { color: '#ff6b6b', position: 0 },
            { color: '#4ecdc4', position: 50 },
            { color: '#45b7d1', position: 100 }
        ],
        type: 'radial'  // 'radial' or 'linear'
    }],
    activeGradientIndex: 0,
    lightPosition: 0.5,
    lightIntensity: 1.0,
    lightColor: '#ffffff',
    rimEnabled: true,
    rimColor: '#ffffff',
    rimIntensity: 0.5,
    shaderMode: 'reflective',  // 'reflective' or 'toon'

    // Facing behavior (for GLB models)
    facingMode: 'billboard',  // 'billboard', 'random', 'fixed'
    fixedAngleX: 0,
    fixedAngleY: 0,
    fixedAngleZ: 0,

    // Animation (unified for all shapes)
    animationType: 'none',  // 'none', 'rotate', 'tumble', 'lookAtMouse'
    rotateSpeed: 1.0,
    rotationAxis: { x: 0, y: 1, z: 0 },  // Direction vector for rotation
    tumbleAmount: 5,  // 1-10, controls intensity of tumble
    tumbleSpeed: 1.0,

    // Animation
    isAnimating: false,
    animationSpeed: 1.0,
    animationTime: 0,

    // Hover effects (stackable system)
    hoverEffects: {
        enabled: false,
        radius: 150,
        // Magnification effect
        magnification: {
            enabled: true,
            intensity: 2.0,       // Scale multiplier (0.5 - 3.0)
        },
        // Rotation effect
        rotation: {
            enabled: false,
            mode: 'continuous',   // 'continuous' | 'target'
            speed: 2.0,           // For continuous mode
            targetAngle: { x: 0, y: 180, z: 0 },  // For target mode (degrees)
            axis: { x: 0, y: 1, z: 0 },
        },
        // Material crossfade effect
        materialCrossfade: {
            enabled: false,
            hoverMatcap: null,         // Matcap texture (if uploaded)
            fallbackColor: '#ffffff',  // Color picker fallback
            transitionDuration: 0.3,   // Seconds to crossfade
        }
    },
    // Legacy hover properties (for backwards compatibility)
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

// Custom uploaded matcap texture
let uploadedMatcapTexture = null;

// MatCap generator instance
let matcapGenerator = null;

// Gradient material
let gradientMaterial = null;

// Per-particle rotation data (for facing behavior and animation)
let particleRotations = [];

// GLB animation frame ID
let glbAnimationFrameId = null;

// Clock for delta time
let clock = null;

// Mouse world position (for lookAtMouse)
let mouseWorldPos = null;

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

    // Initialize clock for delta time
    clock = new THREE.Clock();

    // Initialize mouse world position
    mouseWorldPos = new THREE.Vector3();

    // Create default matcap texture (gradient sphere look)
    createDefaultMatcap();

    // Initialize MatCap generator for gradient materials
    if (window.MatCapGenerator) {
        matcapGenerator = new MatCapGenerator(256);
    }

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
    tempCtx.textBaseline = 'middle';
    tempCtx.fillStyle = '#FFFFFF';

    // Apply letter spacing (kerning) if supported
    if (textData.letterSpacing !== 0) {
        tempCtx.letterSpacing = `${textData.letterSpacing}px`;
    }

    // Split text into lines
    const lines = text.split('\n');
    const leadingPixels = fontSize * textData.leading;

    // Measure all line widths for alignment
    const lineWidths = lines.map(line => tempCtx.measureText(line).width);
    const maxLineWidth = Math.max(...lineWidths);

    // Calculate total text height for proper vertical centering
    const totalTextHeight = fontSize + (lines.length - 1) * leadingPixels;
    const offsetX = (textData.textOffsetX / 100) * canvas.width;
    const offsetY = (textData.textOffsetY / 100) * canvas.height;
    const startY = (canvas.height / 2) - (totalTextHeight / 2) + (fontSize / 2) + offsetY;
    const baseCenterX = (canvas.width / 2) + offsetX;

    // Draw each line with alignment
    lines.forEach((line, index) => {
        const y = startY + (index * leadingPixels);
        const lineWidth = lineWidths[index];

        // Calculate X position based on alignment
        let lineX;
        switch (textData.textAlign) {
            case 'left':
                // Left edge of all lines aligned, starting from center minus half max width
                tempCtx.textAlign = 'left';
                lineX = baseCenterX - (maxLineWidth / 2);
                break;
            case 'right':
                // Right edge of all lines aligned
                tempCtx.textAlign = 'right';
                lineX = baseCenterX + (maxLineWidth / 2);
                break;
            case 'center':
            default:
                // Center each line individually (original behavior)
                tempCtx.textAlign = 'center';
                lineX = baseCenterX;
                break;
        }

        tempCtx.fillText(line, lineX, y);
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

// ========== SVG SHAPE POINTS ==========
function getSVGShapePoints(spacing, canvasSize) {
    if (!textData.svgData || !window.SVGPointSampler || !window.SVGCoordinateNormalizer) {
        return [];
    }

    const sampler = new SVGPointSampler();

    try {
        // Sample points based on mode
        const rawPoints = sampler.sampleAllPaths(textData.svgData, spacing, {
            includeOutline: textData.svgSampleMode !== 'fill',
            includeFill: textData.svgSampleMode !== 'outline',
            mergeOverlapping: true
        });

        // Normalize to canvas coordinates
        const normalizedPoints = SVGCoordinateNormalizer.normalize(
            rawPoints,
            textData.svgData.viewBox,
            canvasSize,
            {
                fitMode: textData.svgFitMode,
                padding: 0.1,
                offsetX: textData.textOffsetX,
                offsetY: textData.textOffsetY
            }
        );

        // Apply point limit for performance
        const maxPoints = 10000;
        if (normalizedPoints.length > maxPoints) {
            console.warn(`SVG has ${normalizedPoints.length} points, limiting to ${maxPoints}`);
            // Keep every Nth point
            const step = Math.ceil(normalizedPoints.length / maxPoints);
            return normalizedPoints.filter((_, i) => i % step === 0);
        }

        return normalizedPoints;
    } finally {
        sampler.cleanup();
    }
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

    // Use new material type system
    switch (textData.materialType) {
        case 'solid':
            return new THREE.MeshStandardMaterial({
                color: new THREE.Color(color),
                metalness: 0.3,
                roughness: 0.7
            });

        case 'matcapUpload':
            if (uploadedMatcapTexture) {
                return new THREE.MeshMatcapMaterial({
                    matcap: uploadedMatcapTexture
                });
            }
            // Fallback to solid if no texture uploaded
            return new THREE.MeshStandardMaterial({
                color: new THREE.Color(color),
                metalness: 0.3,
                roughness: 0.7
            });

        case 'gradient':
            return createGradientMaterial();

        default:
            // Legacy support
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
}

// ========== GRADIENT SHADER MATERIAL ==========
function createGradientMaterial() {
    const THREE = window.THREE;

    if (!matcapGenerator) {
        // Fallback if generator not available
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(textData.shapeColor),
            metalness: 0.3,
            roughness: 0.7
        });
    }

    const currentGradient = textData.gradientSets[textData.activeGradientIndex] || textData.gradientSets[0];

    // Generate matcap texture from gradient
    const texture = matcapGenerator.generate(
        currentGradient.stops,
        currentGradient.type,
        textData.lightPosition
    );

    const material = new THREE.MeshMatcapMaterial({
        matcap: texture,
        side: THREE.DoubleSide,
        flatShading: textData.shaderMode === 'toon'
    });

    // Extend with rim light via onBeforeCompile
    material.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = { value: new THREE.Color(textData.rimColor) };
        shader.uniforms.rimIntensity = { value: textData.rimEnabled ? textData.rimIntensity : 0 };
        shader.uniforms.lightColor = { value: new THREE.Color(textData.lightColor) };
        shader.uniforms.lightIntensity = { value: textData.lightIntensity };
        shader.uniforms.toonMode = { value: textData.shaderMode === 'toon' ? 1 : 0 };

        // Inject uniforms after #include <common>
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform vec3 rimColor;
            uniform float rimIntensity;
            uniform vec3 lightColor;
            uniform float lightIntensity;
            uniform int toonMode;`
        );

        // Add rim light + toon effect before opaque_fragment
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `// Apply light color and intensity
            outgoingLight *= lightColor * lightIntensity;

            // Toon posterization
            if (toonMode == 1) {
                outgoingLight = floor(outgoingLight * 4.0) / 4.0;
            }

            // Rim light (Fresnel effect)
            vec3 rimViewDir = normalize(vViewPosition);
            float rimFactor = 1.0 - max(0.0, dot(normal, rimViewDir));
            rimFactor = pow(rimFactor, 2.0);
            outgoingLight += rimColor * rimFactor * rimIntensity;

            #include <opaque_fragment>`
        );

        // Store reference for uniform updates
        material.userData.shader = shader;
    };

    gradientMaterial = material;
    return material;
}

// ========== UPDATE GRADIENT MATERIAL ==========
function updateGradientMaterial() {
    if (textData.materialType !== 'gradient' || !gradientMaterial || !matcapGenerator) return;

    const THREE = window.THREE;
    const currentGradient = textData.gradientSets[textData.activeGradientIndex] || textData.gradientSets[0];

    // Regenerate matcap texture
    const texture = matcapGenerator.generate(
        currentGradient.stops,
        currentGradient.type,
        textData.lightPosition
    );

    // Update material
    if (gradientMaterial.matcap) {
        gradientMaterial.matcap.dispose();
    }
    gradientMaterial.matcap = texture;
    gradientMaterial.flatShading = textData.shaderMode === 'toon';
    gradientMaterial.needsUpdate = true;

    // Update uniforms if shader compiled
    if (gradientMaterial.userData.shader) {
        const uniforms = gradientMaterial.userData.shader.uniforms;
        uniforms.rimColor.value.set(textData.rimColor);
        uniforms.rimIntensity.value = textData.rimEnabled ? textData.rimIntensity : 0;
        uniforms.lightColor.value.set(textData.lightColor);
        uniforms.lightIntensity.value = textData.lightIntensity;
        uniforms.toonMode.value = textData.shaderMode === 'toon' ? 1 : 0;
    }

    render();
}

// ========== CUSTOM MATCAP UPLOAD HANDLER ==========
function handleMatcapUpload(file) {
    const THREE = window.THREE;

    const reader = new FileReader();
    reader.onload = (event) => {
        const image = new Image();
        image.onload = () => {
            // Dispose old texture
            if (uploadedMatcapTexture) {
                uploadedMatcapTexture.dispose();
            }

            // Create new texture
            uploadedMatcapTexture = new THREE.Texture(image);
            uploadedMatcapTexture.needsUpdate = true;

            // Rebuild if matcapUpload is active
            if (textData.materialType === 'matcapUpload') {
                rebuildParticleSystem();
            }
        };
        image.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// ========== GENERATE MATCAP PREVIEW ==========
function generateMatcapPreview(stops, type) {
    if (!matcapGenerator) return null;

    // Generate texture and return the canvas for preview
    matcapGenerator.generate(stops, type, textData.lightPosition);
    return matcapGenerator.getPreviewCanvas();
}

// ========== PARTICLE SYSTEM ==========
function rebuildParticleSystem() {
    if (!scene || !window.THREE) return;

    const THREE = window.THREE;
    const canvas = document.getElementById('chatooly-canvas');
    const canvasSize = { width: canvas.width, height: canvas.height };
    const spacing = textData.shapeSize * textData.spacing;

    // Get points based on source mode
    switch (textData.sourceMode) {
        case 'shape':
            // Use parametric shapes
            if (window.ParametricShapes) {
                cachedPoints = ParametricShapes.getShapePoints(
                    textData.spawnShapeType,
                    textData.spawnShapeSize,
                    spacing,
                    textData.shapeFillMode,
                    canvasSize
                );
            } else {
                console.warn('ParametricShapes not loaded');
                cachedPoints = [];
            }
            break;

        case 'svg':
            // Use uploaded SVG
            if (textData.svgData && window.SVGPointSampler) {
                cachedPoints = getSVGShapePoints(spacing, canvasSize);
            } else {
                cachedPoints = [];
            }
            break;

        case 'text':
        default:
            // Use text (original behavior)
            cachedPoints = getTextPoints(
                textData.text,
                textData.fontSize,
                spacing
            );
            break;
    }

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

    // Initialize instance colors for material crossfade effect
    const colors = new Float32Array(cachedPoints.length * 3);
    const baseColor = new THREE.Color(textData.shapeColor);
    for (let i = 0; i < cachedPoints.length; i++) {
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;
    }
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // Store particle positions and initialize rotations
    particlePositions = cachedPoints.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z,
        baseScale: 1.0
    }));

    // Initialize per-particle rotation data (for facing/animation)
    particleRotations = cachedPoints.map(() => {
        const rot = {
            x: 0,
            y: 0,
            z: 0,
            // Angular velocity for tumble animation (tumbleAmount controls intensity)
            angularVelocityX: (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5,
            angularVelocityY: (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5,
            angularVelocityZ: (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5,
            // Accumulated spin offset
            spinOffsetX: 0,
            spinOffsetY: 0,
            spinOffsetZ: 0
        };

        // Set initial rotation based on facing mode (only for GLB)
        if (textData.shapeType === 'glb') {
            switch (textData.facingMode) {
                case 'random':
                    rot.x = Math.random() * Math.PI * 2;
                    rot.y = Math.random() * Math.PI * 2;
                    rot.z = Math.random() * Math.PI * 2;
                    break;
                case 'fixed':
                    rot.x = THREE.MathUtils.degToRad(textData.fixedAngleX);
                    rot.y = THREE.MathUtils.degToRad(textData.fixedAngleY);
                    rot.z = THREE.MathUtils.degToRad(textData.fixedAngleZ);
                    break;
                case 'billboard':
                default:
                    // Will be calculated per-frame
                    break;
            }
        }

        return rot;
    });

    // Update and add to scene
    updateInstancedMesh();
    scene.add(instancedMesh);

    // Start animation if needed (for any shape type)
    if (textData.animationType !== 'none') {
        startShapeAnimation();
    }

    render();
}

// Reusable color objects for crossfade (avoid creating in loop)
let _baseColor = null;
let _hoverColor = null;
let _blendedColor = null;

function updateInstancedMesh(rotationAngle = 0, deltaTime = 0) {
    if (!instancedMesh || !dummy || particlePositions.length === 0) return;

    const THREE = window.THREE;
    const isGLB = textData.shapeType === 'glb';
    const DEG2RAD = Math.PI / 180;

    // Initialize reusable color objects if needed
    if (!_baseColor) _baseColor = new THREE.Color();
    if (!_hoverColor) _hoverColor = new THREE.Color();
    if (!_blendedColor) _blendedColor = new THREE.Color();

    // Check if crossfade is active
    const crossfadeActive = textData.hoverEffects.enabled &&
                           textData.hoverEffects.materialCrossfade.enabled &&
                           instancedMesh.instanceColor;

    // Pre-compute colors for crossfade
    if (crossfadeActive) {
        _baseColor.set(textData.shapeColor);
        _hoverColor.set(textData.hoverEffects.materialCrossfade.fallbackColor);
    }

    for (let i = 0; i < particlePositions.length; i++) {
        const p = particlePositions[i];
        const rot = particleRotations[i] || { x: 0, y: 0, z: 0, spinOffsetX: 0, spinOffsetY: 0, spinOffsetZ: 0, hoverRotX: 0, hoverRotY: 0, hoverRotZ: 0 };

        // Calculate hover scale (for magnification effect)
        let scale = p.baseScale;
        const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
        if (hoverEnabled && textData.mouseX !== null) {
            scale *= getHoverScale3D(p.x, p.y);
        }

        // Set position
        dummy.position.set(p.x, p.y, p.z);

        // Apply rotation based on animation type (works for all shapes now)
        let finalRotX = rot.x;
        let finalRotY = rot.y;
        let finalRotZ = rot.z;

        // Apply facing mode for GLB only
        if (isGLB && textData.facingMode === 'billboard') {
            finalRotX = 0;
            finalRotY = 0;
            finalRotZ = 0;
        }

        // Apply animation offsets based on animation type
        if (textData.animationType === 'rotate') {
            finalRotX += rot.spinOffsetX;
            finalRotY += rot.spinOffsetY;
            finalRotZ += rot.spinOffsetZ;
        } else if (textData.animationType === 'tumble') {
            finalRotX += rot.spinOffsetX;
            finalRotY += rot.spinOffsetY;
            finalRotZ += rot.spinOffsetZ;
        } else if (textData.animationType === 'lookAtMouse') {
            // Apply look-at-mouse rotation (calculated elsewhere)
            finalRotX = rot.x;
            finalRotY = rot.y;
            finalRotZ = rot.z;
        }

        // Apply hover rotation effect (stackable)
        if (textData.hoverEffects.enabled && textData.hoverEffects.rotation.enabled) {
            const hoverProgress = getHoverProgress(p.x, p.y);
            if (hoverProgress > 0) {
                const rotEffect = textData.hoverEffects.rotation;

                if (rotEffect.mode === 'continuous') {
                    // Continuous spin while hovering - accumulate rotation over time
                    if (!rot.hoverRotX) rot.hoverRotX = 0;
                    if (!rot.hoverRotY) rot.hoverRotY = 0;
                    if (!rot.hoverRotZ) rot.hoverRotZ = 0;

                    rot.hoverRotX += rotEffect.axis.x * rotEffect.speed * deltaTime * hoverProgress;
                    rot.hoverRotY += rotEffect.axis.y * rotEffect.speed * deltaTime * hoverProgress;
                    rot.hoverRotZ += rotEffect.axis.z * rotEffect.speed * deltaTime * hoverProgress;

                    finalRotX += rot.hoverRotX;
                    finalRotY += rot.hoverRotY;
                    finalRotZ += rot.hoverRotZ;
                } else if (rotEffect.mode === 'target') {
                    // Rotate towards target angle based on hover progress
                    finalRotX += rotEffect.targetAngle.x * DEG2RAD * hoverProgress;
                    finalRotY += rotEffect.targetAngle.y * DEG2RAD * hoverProgress;
                    finalRotZ += rotEffect.targetAngle.z * DEG2RAD * hoverProgress;
                }
            }
        }

        dummy.rotation.set(finalRotX, finalRotY, finalRotZ);
        dummy.scale.setScalar(textData.shapeSize * scale);
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(i, dummy.matrix);

        // Apply material crossfade effect (color blending)
        if (crossfadeActive) {
            const hoverProgress = getHoverProgress(p.x, p.y);

            // Lerp between base and hover color based on progress
            _blendedColor.copy(_baseColor).lerp(_hoverColor, hoverProgress);

            // Set the instance color
            instancedMesh.instanceColor.setXYZ(i, _blendedColor.r, _blendedColor.g, _blendedColor.b);
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;

    // Update instance colors if crossfade is active
    if (crossfadeActive) {
        instancedMesh.instanceColor.needsUpdate = true;
    }
}

// ========== SHAPE ANIMATION SYSTEM ==========
function startShapeAnimation() {
    stopShapeAnimation();

    if (textData.animationType === 'none') return;

    function shapeAnimationLoop() {
        if (textData.animationType === 'none') {
            glbAnimationFrameId = null;
            return;
        }

        const delta = clock ? clock.getDelta() : 0.016;

        // Update per-particle animation
        for (let i = 0; i < particleRotations.length; i++) {
            const rot = particleRotations[i];

            switch (textData.animationType) {
                case 'rotate':
                    // Multi-axis rotation based on direction vector
                    rot.spinOffsetX += textData.rotationAxis.x * textData.rotateSpeed * delta;
                    rot.spinOffsetY += textData.rotationAxis.y * textData.rotateSpeed * delta;
                    rot.spinOffsetZ += textData.rotationAxis.z * textData.rotateSpeed * delta;
                    break;

                case 'tumble':
                    // Random tumbling on all axes
                    rot.spinOffsetX += rot.angularVelocityX * delta;
                    rot.spinOffsetY += rot.angularVelocityY * delta;
                    rot.spinOffsetZ += rot.angularVelocityZ * delta;
                    break;

                case 'lookAtMouse':
                    // Look at mouse with pitch/yaw
                    updateLookAtMouse(i, rot, delta);
                    break;
            }
        }

        updateInstancedMesh(0, delta);
        renderer.render(scene, camera);

        glbAnimationFrameId = requestAnimationFrame(shapeAnimationLoop);
    }

    // Reset clock
    if (clock) clock.getDelta();

    glbAnimationFrameId = requestAnimationFrame(shapeAnimationLoop);
}

function stopShapeAnimation() {
    if (glbAnimationFrameId) {
        cancelAnimationFrame(glbAnimationFrameId);
        glbAnimationFrameId = null;
    }
}

// Legacy aliases for compatibility
function startGLBAnimation() { startShapeAnimation(); }
function stopGLBAnimation() { stopShapeAnimation(); }

function updateLookAtMouse(index, rot, delta) {
    if (!mouseWorldPos || textData.mouseX === null || textData.mouseY === null) return;

    const THREE = window.THREE;
    const canvas = document.getElementById('chatooly-canvas');
    const p = particlePositions[index];

    // Convert mouse screen position to world coordinates
    const mouseNDC = new THREE.Vector3(
        (textData.mouseX / canvas.width) * 2 - 1,
        -(textData.mouseY / canvas.height) * 2 + 1,
        0
    );
    mouseNDC.unproject(camera);
    mouseWorldPos.set(mouseNDC.x, mouseNDC.y, 0);

    // Calculate direction to mouse
    const toMouse = new THREE.Vector3(
        mouseWorldPos.x - p.x,
        mouseWorldPos.y - p.y,
        0
    );

    const distance = toMouse.length();
    if (distance < 0.01) return;

    toMouse.normalize();

    // Calculate target rotations (pitch/yaw like 3D Trail)
    // Yaw (Y-axis rotation) - horizontal tracking
    const targetRotY = Math.atan2(toMouse.x, 0.5) * 1.2;
    // Pitch (X-axis rotation) - vertical tracking
    const targetRotX = Math.atan2(-toMouse.y, 1) * 0.8;
    // Roll (Z-axis rotation) - slight tilt based on horizontal offset
    const targetRotZ = toMouse.x * 0.2;

    // Clamp to prevent extreme angles
    const maxAngleY = Math.PI / 2.5;  // ~72 degrees
    const maxAngleX = Math.PI / 4;    // 45 degrees
    const maxRoll = Math.PI / 10;     // 18 degrees

    const clampedRotX = Math.max(-maxAngleX, Math.min(maxAngleX, targetRotX));
    const clampedRotY = Math.max(-maxAngleY, Math.min(maxAngleY, targetRotY));
    const clampedRotZ = Math.max(-maxRoll, Math.min(maxRoll, targetRotZ));

    // Smooth lag factor
    const lagFactor = 0.1;
    rot.x += (clampedRotX - rot.x) * lagFactor;
    rot.y += (clampedRotY - rot.y) * lagFactor;
    rot.z += (clampedRotZ - rot.z) * lagFactor;
}

// ========== HOVER EFFECT ==========
function getHoverScale3D(pointX, pointY) {
    // Check both old and new hover state for backwards compatibility
    const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
    if (!hoverEnabled || textData.mouseX === null || textData.mouseY === null) {
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

    // Use new hover system radius if enabled, otherwise legacy
    const radius = textData.hoverEffects.enabled ? textData.hoverEffects.radius : textData.hoverRadius;

    if (distance >= radius) {
        return 1.0;
    }

    // Check if magnification effect is enabled
    const magnificationEnabled = textData.hoverEffects.enabled
        ? textData.hoverEffects.magnification.enabled
        : true;

    if (!magnificationEnabled) {
        return 1.0;
    }

    // Calculate scale factor
    const normalizedDistance = distance / radius;
    let scale;

    // Use new intensity if new system enabled, otherwise legacy
    const intensity = textData.hoverEffects.enabled
        ? textData.hoverEffects.magnification.intensity
        : textData.hoverIntensity;

    if (intensity >= 1.0) {
        scale = 1.0 + (intensity - 1.0) * (1 - normalizedDistance);
    } else {
        const shrinkAmount = Math.abs(intensity);
        const minScale = Math.max(0.1, 1.0 / (shrinkAmount + 1));
        scale = 1.0 - (1.0 - minScale) * (1 - normalizedDistance);
    }

    return Math.max(0.1, scale);
}

/**
 * Calculate hover progress (0-1) for a point
 * Used for rotation and material crossfade effects
 */
function getHoverProgress(pointX, pointY) {
    const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
    if (!hoverEnabled || textData.mouseX === null || textData.mouseY === null) {
        return 0;
    }

    const THREE = window.THREE;
    const canvas = document.getElementById('chatooly-canvas');

    const vec = new THREE.Vector3(pointX, pointY, 0);
    vec.project(camera);

    const screenX = (vec.x + 1) / 2 * canvas.width;
    const screenY = (-vec.y + 1) / 2 * canvas.height;

    const dx = screenX - textData.mouseX;
    const dy = screenY - textData.mouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const radius = textData.hoverEffects.enabled ? textData.hoverEffects.radius : textData.hoverRadius;

    if (distance >= radius) {
        return 0;
    }

    return 1 - (distance / radius);
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

// ========== CLEAR CANVAS ==========
function clearCanvas() {
    // Stop any running animations
    stopAnimation();
    stopGLBAnimation();
    if (window.stopHoverRendering) {
        window.stopHoverRendering();
    }

    // Remove instanced mesh from scene
    if (instancedMesh) {
        scene.remove(instancedMesh);
        if (instancedMesh.geometry) instancedMesh.geometry.dispose();
        if (instancedMesh.material) instancedMesh.material.dispose();
        instancedMesh = null;
    }

    // Clear cached data
    cachedPoints = null;
    particlePositions = [];
    particleRotations = [];

    // Reset text input
    textData.text = '';
    const textInput = document.getElementById('text-input');
    if (textInput) {
        textInput.value = '';
    }

    // Reset trace index
    traceIndex = 0;

    // Render empty scene
    render();
}

// ========== RENDER ==========
function render(rotationAngle = 0, deltaTime = 0.016) {
    if (!renderer || !scene || !camera) return;

    // Update instanced mesh with deltaTime for hover rotation effects
    updateInstancedMesh(rotationAngle, deltaTime);

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

// ========== GRADIENT CONTROLS HELPER FUNCTIONS ==========
function setupGradientControls() {
    const container = document.getElementById('gradient-stops-container');
    if (!container) return;

    // Set up listeners for each gradient stop
    const gradientStops = container.querySelectorAll('.gradient-stop');
    gradientStops.forEach((stopEl, index) => {
        const colorInput = stopEl.querySelector('.gradient-stop-color');
        const positionInput = stopEl.querySelector('.gradient-stop-position');
        const valueSpan = stopEl.querySelector('.gradient-stop-value');

        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                const currentGradient = textData.gradientSets[textData.activeGradientIndex];
                if (currentGradient && currentGradient.stops[index]) {
                    currentGradient.stops[index].color = e.target.value;
                }
                updateGradientPreview();
                if (textData.materialType === 'gradient') {
                    updateGradientMaterial();
                }
            });
        }

        if (positionInput) {
            positionInput.addEventListener('input', (e) => {
                const currentGradient = textData.gradientSets[textData.activeGradientIndex];
                if (currentGradient && currentGradient.stops[index]) {
                    currentGradient.stops[index].position = parseInt(e.target.value);
                }
                if (valueSpan) valueSpan.textContent = e.target.value + '%';
                updateGradientPreview();
                if (textData.materialType === 'gradient') {
                    updateGradientMaterial();
                }
            });
        }
    });
}

function updateGradientPreview() {
    const previewCanvas = document.getElementById('gradient-preview');
    if (!previewCanvas || !matcapGenerator) return;

    const currentGradient = textData.gradientSets[textData.activeGradientIndex];
    if (!currentGradient) return;

    // Generate the matcap texture
    matcapGenerator.generate(
        currentGradient.stops,
        currentGradient.type,
        textData.lightPosition
    );

    // Draw preview
    const sourceCanvas = matcapGenerator.getPreviewCanvas();
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, 80, 80);

    // Draw as circular preview
    ctx.save();
    ctx.beginPath();
    ctx.arc(40, 40, 39, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(sourceCanvas, 0, 0, 80, 80);
    ctx.restore();
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    const canvas = document.getElementById('chatooly-canvas');

    // ========== SOURCE MODE CONTROLS ==========
    const sourceModeSelect = document.getElementById('source-mode');
    const shapeSourceControls = document.getElementById('shape-source-controls');
    const svgSourceControls = document.getElementById('svg-source-controls');
    const textSection = document.querySelector('[data-section="text"]');

    if (sourceModeSelect) {
        sourceModeSelect.addEventListener('change', (e) => {
            textData.sourceMode = e.target.value;

            // Show/hide relevant controls
            if (shapeSourceControls) shapeSourceControls.style.display = textData.sourceMode === 'shape' ? 'block' : 'none';
            if (svgSourceControls) svgSourceControls.style.display = textData.sourceMode === 'svg' ? 'block' : 'none';
            if (textSection) textSection.style.display = textData.sourceMode === 'text' ? 'block' : 'none';

            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Shape type selector
    const spawnShapeTypeSelect = document.getElementById('spawn-shape-type');
    if (spawnShapeTypeSelect) {
        spawnShapeTypeSelect.addEventListener('change', (e) => {
            textData.spawnShapeType = e.target.value;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Shape size slider
    const spawnShapeSizeInput = document.getElementById('spawn-shape-size');
    const spawnShapeSizeValue = document.getElementById('spawn-shape-size-value');
    if (spawnShapeSizeInput) {
        spawnShapeSizeInput.addEventListener('input', (e) => {
            textData.spawnShapeSize = parseInt(e.target.value);
            if (spawnShapeSizeValue) spawnShapeSizeValue.textContent = textData.spawnShapeSize;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Fill mode buttons
    const fillModeOutline = document.getElementById('fill-mode-outline');
    const fillModeFill = document.getElementById('fill-mode-fill');
    if (fillModeOutline && fillModeFill) {
        fillModeOutline.addEventListener('click', () => {
            textData.shapeFillMode = 'outline';
            fillModeOutline.classList.add('active');
            fillModeFill.classList.remove('active');
            traceIndex = 0;
            rebuildParticleSystem();
        });
        fillModeFill.addEventListener('click', () => {
            textData.shapeFillMode = 'fill';
            fillModeFill.classList.add('active');
            fillModeOutline.classList.remove('active');
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // SVG upload
    const svgUploadInput = document.getElementById('svg-upload');
    const svgInfo = document.getElementById('svg-info');
    const svgName = document.getElementById('svg-name');
    const clearSvgBtn = document.getElementById('clear-svg');

    if (svgUploadInput) {
        svgUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const parser = new SVGShapeParser();
                textData.svgData = await parser.parse(file);
                textData.svgFileName = file.name;

                if (svgInfo) svgInfo.style.display = 'block';
                if (svgName) svgName.textContent = file.name;

                traceIndex = 0;
                rebuildParticleSystem();
            } catch (err) {
                console.error('SVG parsing error:', err);
                alert('Error parsing SVG: ' + err.message);
            }
        });
    }

    if (clearSvgBtn) {
        clearSvgBtn.addEventListener('click', () => {
            textData.svgData = null;
            textData.svgFileName = null;
            if (svgInfo) svgInfo.style.display = 'none';
            if (svgUploadInput) svgUploadInput.value = '';
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // SVG sample mode
    const svgSampleModeSelect = document.getElementById('svg-sample-mode');
    if (svgSampleModeSelect) {
        svgSampleModeSelect.addEventListener('change', (e) => {
            textData.svgSampleMode = e.target.value;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // SVG fit mode
    const svgFitModeSelect = document.getElementById('svg-fit-mode');
    if (svgFitModeSelect) {
        svgFitModeSelect.addEventListener('change', (e) => {
            textData.svgFitMode = e.target.value;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // ========== TEXT INPUT ==========
    // Text input
    document.getElementById('text-input').addEventListener('input', (e) => {
        textData.text = e.target.value || ' ';
        traceIndex = 0;
        rebuildParticleSystem();
    });

    // Font selector
    const fontSelector = document.getElementById('font-selector');
    const customFontInput = document.getElementById('custom-font-input');
    let previousFontValue = 'Arial';  // Track previous selection

    if (fontSelector) {
        fontSelector.addEventListener('change', (e) => {
            if (e.target.value === 'upload-custom') {
                // Trigger file input when "Upload Custom Font..." is selected
                if (customFontInput) {
                    customFontInput.click();
                }
                // Reset to previous value (will be updated after upload)
                fontSelector.value = previousFontValue;
            } else {
                previousFontValue = e.target.value;
                textData.fontFamily = e.target.value;
                traceIndex = 0;
                rebuildParticleSystem();
            }
        });
    }

    // Custom font upload
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
                    // Insert new option before the "Upload Custom Font..." option
                    const uploadOption = fontSelector.querySelector('option[value="upload-custom"]');
                    const option = document.createElement('option');
                    option.value = fontName;
                    option.textContent = file.name;
                    fontSelector.insertBefore(option, uploadOption);
                    fontSelector.value = fontName;
                    previousFontValue = fontName;
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

    // Leading (renamed from Line Height)
    const leadingInput = document.getElementById('leading');
    const leadingValue = document.getElementById('leading-value');
    if (leadingInput) {
        leadingInput.addEventListener('input', (e) => {
            textData.leading = parseFloat(e.target.value);
            if (leadingValue) leadingValue.textContent = textData.leading.toFixed(1);
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Letter Spacing (Kerning)
    const letterSpacingInput = document.getElementById('letter-spacing');
    const letterSpacingValue = document.getElementById('letter-spacing-value');
    if (letterSpacingInput) {
        letterSpacingInput.addEventListener('input', (e) => {
            textData.letterSpacing = parseInt(e.target.value);
            if (letterSpacingValue) letterSpacingValue.textContent = textData.letterSpacing;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    }

    // Text Alignment
    const textAlignButtons = document.querySelectorAll('.text-align-btn');
    textAlignButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            textAlignButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            textData.textAlign = btn.dataset.align;
            traceIndex = 0;
            rebuildParticleSystem();
        });
    });

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
    const glbFacingGroup = document.getElementById('glb-facing-group');

    shapeTypeSelect.addEventListener('change', (e) => {
        textData.shapeType = e.target.value;
        const isGLB = textData.shapeType === 'glb';

        // Show/hide GLB-specific controls (within 3D SHAPES section)
        if (glbUploadGroup) glbUploadGroup.style.display = isGLB ? 'block' : 'none';
        if (glbFacingGroup) glbFacingGroup.style.display = isGLB ? 'block' : 'none';

        rebuildParticleSystem();
    });

    // Material type (new)
    const materialTypeSelect = document.getElementById('material-type');
    const shapeColorGroup = document.getElementById('shape-color-group');
    const matcapUploadGroupEl = document.getElementById('matcap-upload-group');
    const gradientControlsGroup = document.getElementById('gradient-controls-group');

    if (materialTypeSelect) {
        materialTypeSelect.addEventListener('change', (e) => {
            textData.materialType = e.target.value;

            // Show/hide appropriate controls
            if (shapeColorGroup) shapeColorGroup.style.display = textData.materialType === 'solid' ? 'block' : 'none';
            if (matcapUploadGroupEl) matcapUploadGroupEl.style.display = textData.materialType === 'matcapUpload' ? 'block' : 'none';
            if (gradientControlsGroup) gradientControlsGroup.style.display = textData.materialType === 'gradient' ? 'block' : 'none';

            // Update gradient preview if switching to gradient
            if (textData.materialType === 'gradient') {
                updateGradientPreview();
            }

            rebuildParticleSystem();
        });
    }

    // Custom matcap upload
    const matcapUploadInput = document.getElementById('matcap-upload');
    const matcapPreviewContainer = document.getElementById('matcap-preview-container');
    const matcapPreviewCanvas = document.getElementById('matcap-preview');

    if (matcapUploadInput) {
        matcapUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            handleMatcapUpload(file);

            // Show preview
            if (matcapPreviewContainer && matcapPreviewCanvas) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const ctx = matcapPreviewCanvas.getContext('2d');
                        ctx.clearRect(0, 0, 80, 80);
                        ctx.beginPath();
                        ctx.arc(40, 40, 39, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(img, 0, 0, 80, 80);
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
                matcapPreviewContainer.style.display = 'block';
            }
        });
    }

    // Gradient controls
    setupGradientControls();

    // Shader mode
    const shaderModeSelect = document.getElementById('shader-mode');
    if (shaderModeSelect) {
        shaderModeSelect.addEventListener('change', (e) => {
            textData.shaderMode = e.target.value;
            if (textData.materialType === 'gradient') {
                rebuildParticleSystem();
            }
        });
    }

    // Gradient type
    const gradientTypeSelect = document.getElementById('gradient-type');
    if (gradientTypeSelect) {
        gradientTypeSelect.addEventListener('change', (e) => {
            const currentGradient = textData.gradientSets[textData.activeGradientIndex];
            if (currentGradient) {
                currentGradient.type = e.target.value;
            }
            updateGradientPreview();
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Light position
    const lightPositionInput = document.getElementById('light-position');
    const lightPositionValue = document.getElementById('light-position-value');
    if (lightPositionInput) {
        lightPositionInput.addEventListener('input', (e) => {
            textData.lightPosition = parseFloat(e.target.value);
            if (lightPositionValue) lightPositionValue.textContent = textData.lightPosition.toFixed(2);
            updateGradientPreview();
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Light intensity
    const lightIntensityInput = document.getElementById('light-intensity');
    const lightIntensityValue = document.getElementById('light-intensity-value');
    if (lightIntensityInput) {
        lightIntensityInput.addEventListener('input', (e) => {
            textData.lightIntensity = parseFloat(e.target.value);
            if (lightIntensityValue) lightIntensityValue.textContent = textData.lightIntensity.toFixed(1);
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Light color
    const lightColorInput = document.getElementById('light-color');
    if (lightColorInput) {
        lightColorInput.addEventListener('input', (e) => {
            textData.lightColor = e.target.value;
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Rim light toggle
    const rimEnabledToggle = document.getElementById('rim-enabled');
    const rimControlsGroup = document.getElementById('rim-controls-group');
    if (rimEnabledToggle) {
        rimEnabledToggle.addEventListener('toggle-change', (e) => {
            textData.rimEnabled = e.detail.checked;
            if (rimControlsGroup) rimControlsGroup.style.display = textData.rimEnabled ? 'block' : 'none';
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Rim color
    const rimColorInput = document.getElementById('rim-color');
    if (rimColorInput) {
        rimColorInput.addEventListener('input', (e) => {
            textData.rimColor = e.target.value;
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // Rim intensity
    const rimIntensityInput = document.getElementById('rim-intensity');
    const rimIntensityValue = document.getElementById('rim-intensity-value');
    if (rimIntensityInput) {
        rimIntensityInput.addEventListener('input', (e) => {
            textData.rimIntensity = parseFloat(e.target.value);
            if (rimIntensityValue) rimIntensityValue.textContent = textData.rimIntensity.toFixed(1);
            if (textData.materialType === 'gradient') {
                updateGradientMaterial();
            }
        });
    }

    // ========== GLB FACING CONTROLS ==========
    const facingModeSelect = document.getElementById('facing-mode');
    const fixedAngleControls = document.getElementById('fixed-angle-controls');

    if (facingModeSelect) {
        facingModeSelect.addEventListener('change', (e) => {
            textData.facingMode = e.target.value;
            if (fixedAngleControls) {
                fixedAngleControls.style.display = textData.facingMode === 'fixed' ? 'block' : 'none';
            }
            rebuildParticleSystem();
        });
    }

    // Fixed angle X
    const angleXInput = document.getElementById('angle-x');
    const angleXValue = document.getElementById('angle-x-value');
    if (angleXInput) {
        angleXInput.addEventListener('input', (e) => {
            textData.fixedAngleX = parseInt(e.target.value);
            if (angleXValue) angleXValue.textContent = textData.fixedAngleX;
            if (textData.facingMode === 'fixed') {
                rebuildParticleSystem();
            }
        });
    }

    // Fixed angle Y
    const angleYInput = document.getElementById('angle-y');
    const angleYValue = document.getElementById('angle-y-value');
    if (angleYInput) {
        angleYInput.addEventListener('input', (e) => {
            textData.fixedAngleY = parseInt(e.target.value);
            if (angleYValue) angleYValue.textContent = textData.fixedAngleY;
            if (textData.facingMode === 'fixed') {
                rebuildParticleSystem();
            }
        });
    }

    // Fixed angle Z
    const angleZInput = document.getElementById('angle-z');
    const angleZValue = document.getElementById('angle-z-value');
    if (angleZInput) {
        angleZInput.addEventListener('input', (e) => {
            textData.fixedAngleZ = parseInt(e.target.value);
            if (angleZValue) angleZValue.textContent = textData.fixedAngleZ;
            if (textData.facingMode === 'fixed') {
                rebuildParticleSystem();
            }
        });
    }

    // ========== ANIMATION CONTROLS (Unified for all shapes) ==========
    const animationTypeSelect = document.getElementById('animation-type');
    const rotateSpeedGroup = document.getElementById('rotate-speed-group');
    const tumbleControlsGroup = document.getElementById('tumble-controls-group');

    if (animationTypeSelect) {
        animationTypeSelect.addEventListener('change', (e) => {
            textData.animationType = e.target.value;

            // Show/hide animation-specific controls
            if (rotateSpeedGroup) rotateSpeedGroup.style.display = textData.animationType === 'rotate' ? 'block' : 'none';
            if (tumbleControlsGroup) tumbleControlsGroup.style.display = textData.animationType === 'tumble' ? 'block' : 'none';

            // Start or stop animation
            if (textData.animationType !== 'none') {
                startShapeAnimation();
            } else {
                stopShapeAnimation();
            }
        });
    }

    // Rotate speed
    const rotateSpeedInput = document.getElementById('rotate-speed');
    const rotateSpeedValue = document.getElementById('rotate-speed-value');
    if (rotateSpeedInput) {
        rotateSpeedInput.addEventListener('input', (e) => {
            textData.rotateSpeed = parseFloat(e.target.value);
            if (rotateSpeedValue) rotateSpeedValue.textContent = textData.rotateSpeed.toFixed(1);
        });
    }

    // Rotation axis controls
    const rotationAxisXInput = document.getElementById('rotation-axis-x');
    const rotationAxisXValue = document.getElementById('rotation-axis-x-value');
    if (rotationAxisXInput) {
        rotationAxisXInput.addEventListener('input', (e) => {
            textData.rotationAxis.x = parseFloat(e.target.value);
            if (rotationAxisXValue) rotationAxisXValue.textContent = textData.rotationAxis.x.toFixed(1);
        });
    }

    const rotationAxisYInput = document.getElementById('rotation-axis-y');
    const rotationAxisYValue = document.getElementById('rotation-axis-y-value');
    if (rotationAxisYInput) {
        rotationAxisYInput.addEventListener('input', (e) => {
            textData.rotationAxis.y = parseFloat(e.target.value);
            if (rotationAxisYValue) rotationAxisYValue.textContent = textData.rotationAxis.y.toFixed(1);
        });
    }

    const rotationAxisZInput = document.getElementById('rotation-axis-z');
    const rotationAxisZValue = document.getElementById('rotation-axis-z-value');
    if (rotationAxisZInput) {
        rotationAxisZInput.addEventListener('input', (e) => {
            textData.rotationAxis.z = parseFloat(e.target.value);
            if (rotationAxisZValue) rotationAxisZValue.textContent = textData.rotationAxis.z.toFixed(1);
        });
    }

    // Tumble amount
    const tumbleAmountInput = document.getElementById('tumble-amount');
    const tumbleAmountValue = document.getElementById('tumble-amount-value');
    if (tumbleAmountInput) {
        tumbleAmountInput.addEventListener('input', (e) => {
            textData.tumbleAmount = parseInt(e.target.value);
            if (tumbleAmountValue) tumbleAmountValue.textContent = textData.tumbleAmount;
            // Regenerate angular velocities with new amount
            if (textData.animationType === 'tumble') {
                for (let i = 0; i < particleRotations.length; i++) {
                    const rot = particleRotations[i];
                    rot.angularVelocityX = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                    rot.angularVelocityY = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                    rot.angularVelocityZ = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                }
            }
        });
    }

    // Tumble speed
    const tumbleSpeedInput = document.getElementById('tumble-speed');
    const tumbleSpeedValue = document.getElementById('tumble-speed-value');
    if (tumbleSpeedInput) {
        tumbleSpeedInput.addEventListener('input', (e) => {
            textData.tumbleSpeed = parseFloat(e.target.value);
            if (tumbleSpeedValue) tumbleSpeedValue.textContent = textData.tumbleSpeed.toFixed(1);
            // Regenerate angular velocities with new speed
            if (textData.animationType === 'tumble') {
                for (let i = 0; i < particleRotations.length; i++) {
                    const rot = particleRotations[i];
                    rot.angularVelocityX = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                    rot.angularVelocityY = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                    rot.angularVelocityZ = (Math.random() - 0.5) * textData.tumbleAmount * textData.tumbleSpeed * 0.5;
                }
            }
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

    // Hover effect toggle (master toggle)
    const hoverEffectToggle = document.getElementById('hover-effect');
    const hoverControlsGroup = document.getElementById('hover-controls-group');

    if (hoverEffectToggle) {
        hoverEffectToggle.addEventListener('toggle-change', (e) => {
            textData.hoverEffectEnabled = e.detail.checked;
            textData.hoverEffects.enabled = e.detail.checked;

            if (textData.hoverEffects.enabled) {
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

    // Hover radius (shared across all effects)
    const hoverRadiusInput = document.getElementById('hover-radius');
    const hoverRadiusValue = document.getElementById('hover-radius-value');
    if (hoverRadiusInput) {
        hoverRadiusInput.addEventListener('input', (e) => {
            textData.hoverRadius = parseInt(e.target.value);
            textData.hoverEffects.radius = parseInt(e.target.value);
            if (hoverRadiusValue) hoverRadiusValue.textContent = textData.hoverRadius;
        });
    }

    // Hover intensity (magnification intensity)
    const hoverIntensityInput = document.getElementById('hover-intensity');
    const hoverIntensityValue = document.getElementById('hover-intensity-value');
    if (hoverIntensityInput) {
        hoverIntensityInput.addEventListener('input', (e) => {
            textData.hoverIntensity = parseFloat(e.target.value);
            textData.hoverEffects.magnification.intensity = parseFloat(e.target.value);
            if (hoverIntensityValue) hoverIntensityValue.textContent = textData.hoverIntensity.toFixed(1);
        });
    }

    // ===== STACKABLE HOVER EFFECTS =====

    // Magnification toggle
    const magnificationToggle = document.getElementById('hover-magnification-toggle');
    const magnificationControls = document.getElementById('hover-magnification-controls');
    if (magnificationToggle) {
        magnificationToggle.addEventListener('toggle-change', (e) => {
            textData.hoverEffects.magnification.enabled = e.detail.checked;
            if (magnificationControls) {
                magnificationControls.style.display = e.detail.checked ? 'block' : 'none';
            }
        });
    }

    // Rotation toggle
    const rotationToggle = document.getElementById('hover-rotation-toggle');
    const rotationControls = document.getElementById('hover-rotation-controls');
    if (rotationToggle) {
        rotationToggle.addEventListener('toggle-change', (e) => {
            textData.hoverEffects.rotation.enabled = e.detail.checked;
            if (rotationControls) {
                rotationControls.style.display = e.detail.checked ? 'block' : 'none';
            }
        });
    }

    // Rotation mode buttons (continuous vs target)
    const rotContinuousBtn = document.getElementById('hover-rot-continuous');
    const rotTargetBtn = document.getElementById('hover-rot-target');
    const rotContinuousControls = document.getElementById('hover-rot-continuous-controls');
    const rotTargetControls = document.getElementById('hover-rot-target-controls');

    if (rotContinuousBtn && rotTargetBtn) {
        rotContinuousBtn.addEventListener('click', () => {
            textData.hoverEffects.rotation.mode = 'continuous';
            rotContinuousBtn.classList.add('active');
            rotTargetBtn.classList.remove('active');
            if (rotContinuousControls) rotContinuousControls.style.display = 'block';
            if (rotTargetControls) rotTargetControls.style.display = 'none';
        });

        rotTargetBtn.addEventListener('click', () => {
            textData.hoverEffects.rotation.mode = 'target';
            rotTargetBtn.classList.add('active');
            rotContinuousBtn.classList.remove('active');
            if (rotTargetControls) rotTargetControls.style.display = 'block';
            if (rotContinuousControls) rotContinuousControls.style.display = 'none';
        });
    }

    // Rotation speed (continuous mode)
    const rotSpeedInput = document.getElementById('hover-rot-speed');
    const rotSpeedValue = document.getElementById('hover-rot-speed-value');
    if (rotSpeedInput) {
        rotSpeedInput.addEventListener('input', (e) => {
            textData.hoverEffects.rotation.speed = parseFloat(e.target.value);
            if (rotSpeedValue) rotSpeedValue.textContent = textData.hoverEffects.rotation.speed.toFixed(1);
        });
    }

    // Rotation axis (continuous mode)
    ['x', 'y', 'z'].forEach(axis => {
        const input = document.getElementById(`hover-rot-axis-${axis}`);
        const valueEl = document.getElementById(`hover-rot-axis-${axis}-value`);
        if (input) {
            input.addEventListener('input', (e) => {
                textData.hoverEffects.rotation.axis[axis] = parseFloat(e.target.value);
                if (valueEl) valueEl.textContent = parseFloat(e.target.value).toFixed(1);
            });
        }
    });

    // Target angles (target mode)
    ['x', 'y', 'z'].forEach(axis => {
        const input = document.getElementById(`hover-rot-target-${axis}`);
        const valueEl = document.getElementById(`hover-rot-target-${axis}-value`);
        if (input) {
            input.addEventListener('input', (e) => {
                textData.hoverEffects.rotation.targetAngle[axis] = parseInt(e.target.value);
                if (valueEl) valueEl.textContent = e.target.value + '°';
            });
        }
    });

    // Material Crossfade toggle
    const crossfadeToggle = document.getElementById('hover-crossfade-toggle');
    const crossfadeControls = document.getElementById('hover-crossfade-controls');
    if (crossfadeToggle) {
        crossfadeToggle.addEventListener('toggle-change', (e) => {
            textData.hoverEffects.materialCrossfade.enabled = e.detail.checked;
            if (crossfadeControls) {
                crossfadeControls.style.display = e.detail.checked ? 'block' : 'none';
            }
        });
    }

    // Hover matcap upload
    const hoverMatcapUpload = document.getElementById('hover-matcap-upload');
    const hoverMatcapPreview = document.getElementById('hover-matcap-preview');
    const hoverMatcapInfo = document.getElementById('hover-matcap-info');
    const hoverMatcapName = document.getElementById('hover-matcap-name');
    const hoverMatcapUploadArea = document.getElementById('hover-matcap-upload-area');
    const clearHoverMatcap = document.getElementById('clear-hover-matcap');

    if (hoverMatcapUpload) {
        hoverMatcapUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const THREE = window.THREE;
                        const texture = new THREE.Texture(img);
                        texture.needsUpdate = true;
                        textData.hoverEffects.materialCrossfade.hoverMatcap = texture;
                        if (hoverMatcapPreview) {
                            hoverMatcapPreview.src = event.target.result;
                            hoverMatcapPreview.style.display = 'block';
                        }
                        if (hoverMatcapInfo) hoverMatcapInfo.style.display = 'block';
                        if (hoverMatcapName) hoverMatcapName.textContent = file.name;
                        if (hoverMatcapUploadArea) hoverMatcapUploadArea.style.display = 'none';
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Clear hover matcap
    if (clearHoverMatcap) {
        clearHoverMatcap.addEventListener('click', () => {
            textData.hoverEffects.materialCrossfade.hoverMatcap = null;
            if (hoverMatcapInfo) hoverMatcapInfo.style.display = 'none';
            if (hoverMatcapPreview) {
                hoverMatcapPreview.src = '';
                hoverMatcapPreview.style.display = 'none';
            }
            if (hoverMatcapUploadArea) hoverMatcapUploadArea.style.display = 'block';
            if (hoverMatcapUpload) hoverMatcapUpload.value = '';
        });
    }

    // Fallback color picker
    const fallbackColorInput = document.getElementById('hover-fallback-color');
    if (fallbackColorInput) {
        fallbackColorInput.addEventListener('input', (e) => {
            textData.hoverEffects.materialCrossfade.fallbackColor = e.target.value;
        });
    }

    // Crossfade duration
    const crossfadeDurationInput = document.getElementById('hover-crossfade-duration');
    const crossfadeDurationValue = document.getElementById('hover-crossfade-duration-value');
    if (crossfadeDurationInput) {
        crossfadeDurationInput.addEventListener('input', (e) => {
            textData.hoverEffects.materialCrossfade.transitionDuration = parseFloat(e.target.value);
            if (crossfadeDurationValue) crossfadeDurationValue.textContent = e.target.value + 's';
        });
    }

    // Mouse tracking for hover effect AND look at mouse animation
    function needsMouseTracking() {
        // Track mouse if hover effect is enabled (in mouse mode) OR if animation is lookAtMouse
        const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
        return (hoverEnabled && textData.interactionMode === 'mouse') ||
               textData.animationType === 'lookAtMouse';
    }

    function updateMousePosition(e) {
        if (!needsMouseTracking()) return;

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
        // Only clear mouse position if in mouse mode for hover effect
        // (lookAtMouse should keep tracking even on leave for smooth behavior)
        if (textData.interactionMode === 'mouse' && textData.animationType !== 'lookAtMouse') {
            textData.mouseX = null;
            textData.mouseY = null;
            const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
            if (hoverEnabled && !textData.isAnimating) {
                render();
            }
        }
    });

    // Hover rendering loop
    let hoverLastTime = 0;
    function startHoverRendering() {
        stopHoverRendering();

        const hoverEnabled = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
        if (hoverEnabled && !textData.isAnimating) {
            hoverLastTime = performance.now();

            function hoverRenderLoop() {
                const hoverActive = textData.hoverEffectEnabled || textData.hoverEffects.enabled;
                if (!hoverActive || textData.isAnimating) {
                    hoverAnimationFrameId = null;
                    return;
                }

                const now = performance.now();
                const deltaTime = (now - hoverLastTime) / 1000;
                hoverLastTime = now;

                if (textData.interactionMode === 'auto') {
                    textData.autoTime += 16;
                    const autoPos = getAutoPosition(textData.autoTime, textData.autoPattern);
                    textData.mouseX = autoPos.x;
                    textData.mouseY = autoPos.y;
                }

                render(0, deltaTime);
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

    // Clear canvas button
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            clearCanvas();
        });
    }
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
