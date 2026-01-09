/*
 * MatCap Texture Generator
 * Author: Claude Code
 *
 * Generates matcap textures from gradient configurations.
 * Used by the Material (MatCap) controls in the 3D Type Shaper tool.
 */

class MatCapGenerator {
    constructor(size = 256) {
        this.size = size;
        this.canvas = document.createElement('canvas');
        this.canvas.width = size;
        this.canvas.height = size;
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Generate matcap texture from gradient stops
     * @param {Array} stops - [{color: '#hex', position: 0-100}, ...]
     * @param {string} type - 'radial' or 'linear'
     * @param {number} lightPosition - 0-1, light angle offset (ignored in flat mode)
     * @param {boolean} centered - If true, use perfectly centered gradient (for flat/unlit mode)
     * @returns {THREE.CanvasTexture}
     */
    generate(stops, type = 'radial', lightPosition = 0.5, centered = false) {
        const { ctx, size } = this;
        const center = size / 2;
        const radius = size / 2;

        // Clear canvas
        ctx.clearRect(0, 0, size, size);

        // Sort stops by position
        const sortedStops = [...stops].sort((a, b) => a.position - b.position);

        if (type === 'radial') {
            let gradient;
            if (centered) {
                // Centered gradient - pure circular from center (matches Cinema 4D Ramp shader)
                gradient = ctx.createRadialGradient(
                    center, center, 0,
                    center, center, radius
                );
            } else {
                // Radial gradient from light source (offset from center) outward
                // Light position controls horizontal offset of the highlight
                const lightOffsetX = (lightPosition - 0.5) * radius * 0.8;
                const lightOffsetY = -radius * 0.3; // Light slightly from above

                gradient = ctx.createRadialGradient(
                    center + lightOffsetX, center + lightOffsetY, 0,
                    center, center, radius
                );
            }

            sortedStops.forEach(stop => {
                gradient.addColorStop(stop.position / 100, stop.color);
            });

            ctx.fillStyle = gradient;
        } else {
            // Linear gradient with angle controlled by light position
            const angle = centered ? Math.PI / 2 : lightPosition * Math.PI;
            const x1 = center + Math.cos(angle) * radius;
            const y1 = center + Math.sin(angle) * radius;
            const x2 = center - Math.cos(angle) * radius;
            const y2 = center - Math.sin(angle) * radius;

            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

            sortedStops.forEach(stop => {
                gradient.addColorStop(stop.position / 100, stop.color);
            });

            ctx.fillStyle = gradient;
        }

        // Draw circular matcap
        ctx.beginPath();
        ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
        ctx.fill();

        // Create a COPY of the canvas data for the texture
        // This is critical when generating multiple textures - each needs its own data
        const texCanvas = document.createElement('canvas');
        texCanvas.width = size;
        texCanvas.height = size;
        texCanvas.getContext('2d').drawImage(this.canvas, 0, 0);

        // Create Three.js texture from the copy
        const texture = new THREE.CanvasTexture(texCanvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Get preview canvas element for UI display
     * @returns {HTMLCanvasElement}
     */
    getPreviewCanvas() {
        return this.canvas;
    }
}

// Export to global scope
window.MatCapGenerator = MatCapGenerator;
