/**
 * ParametricShapes.js
 * Generates points for predefined shapes: circle, square, triangle, star, heart, hexagon
 * Supports both outline and fill modes
 */

class ParametricShapes {
    /**
     * Generate points for a shape
     * @param {string} shapeType - Type of shape
     * @param {number} size - Size in pixels
     * @param {number} spacing - Point spacing
     * @param {string} fillMode - 'outline' or 'fill'
     * @param {Object} canvasSize - {width, height}
     * @returns {Array<{x, y, z}>} Points in canvas coordinate system
     */
    static getShapePoints(shapeType, size, spacing, fillMode, canvasSize) {
        let points = [];

        switch (shapeType) {
            case 'circle':
                points = fillMode === 'fill'
                    ? this.circleFill(size, spacing)
                    : this.circleOutline(size, spacing);
                break;
            case 'square':
                points = fillMode === 'fill'
                    ? this.squareFill(size, spacing)
                    : this.squareOutline(size, spacing);
                break;
            case 'triangle':
                points = fillMode === 'fill'
                    ? this.triangleFill(size, spacing)
                    : this.triangleOutline(size, spacing);
                break;
            case 'star':
                points = fillMode === 'fill'
                    ? this.starFill(size, spacing)
                    : this.starOutline(size, spacing);
                break;
            case 'heart':
                points = fillMode === 'fill'
                    ? this.heartFill(size, spacing)
                    : this.heartOutline(size, spacing);
                break;
            case 'hexagon':
                points = fillMode === 'fill'
                    ? this.hexagonFill(size, spacing)
                    : this.hexagonOutline(size, spacing);
                break;
            default:
                points = this.circleOutline(size, spacing);
        }

        // Points are generated centered at origin, add z=0
        return points.map(p => ({ x: p.x, y: p.y, z: 0 }));
    }

    // ============ CIRCLE ============
    static circleOutline(radius, spacing) {
        const points = [];
        const circumference = 2 * Math.PI * radius;
        const numPoints = Math.max(16, Math.floor(circumference / spacing));

        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            points.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }
        return points;
    }

    static circleFill(radius, spacing) {
        const points = [];
        // Grid-based fill with honeycomb offset
        let rowIndex = 0;
        for (let y = -radius; y <= radius; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = -radius + xOffset; x <= radius; x += spacing) {
                if (x * x + y * y <= radius * radius) {
                    points.push({ x, y });
                }
            }
            rowIndex++;
        }
        return points;
    }

    // ============ SQUARE ============
    static squareOutline(size, spacing) {
        const points = [];
        const half = size / 2;

        // Top edge
        for (let x = -half; x <= half; x += spacing) {
            points.push({ x, y: half });
        }
        // Right edge
        for (let y = half; y >= -half; y -= spacing) {
            points.push({ x: half, y });
        }
        // Bottom edge
        for (let x = half; x >= -half; x -= spacing) {
            points.push({ x, y: -half });
        }
        // Left edge
        for (let y = -half; y <= half; y += spacing) {
            points.push({ x: -half, y });
        }
        return points;
    }

    static squareFill(size, spacing) {
        const points = [];
        const half = size / 2;

        let rowIndex = 0;
        for (let y = -half; y <= half; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = -half + xOffset; x <= half; x += spacing) {
                points.push({ x, y });
            }
            rowIndex++;
        }
        return points;
    }

    // ============ TRIANGLE (Equilateral) ============
    static triangleOutline(size, spacing) {
        const points = [];
        const height = size * Math.sqrt(3) / 2;

        // Vertices
        const top = { x: 0, y: height * 2/3 };
        const bottomLeft = { x: -size / 2, y: -height / 3 };
        const bottomRight = { x: size / 2, y: -height / 3 };

        // Edge: top to bottom-right
        this.addLinePoints(points, top, bottomRight, spacing);
        // Edge: bottom-right to bottom-left
        this.addLinePoints(points, bottomRight, bottomLeft, spacing);
        // Edge: bottom-left to top
        this.addLinePoints(points, bottomLeft, top, spacing);

        return points;
    }

    static triangleFill(size, spacing) {
        const points = [];
        const height = size * Math.sqrt(3) / 2;
        const topY = height * 2/3;
        const bottomY = -height / 3;

        let rowIndex = 0;
        for (let y = bottomY; y <= topY; y += spacing) {
            // Calculate triangle width at this y level
            const progress = (y - bottomY) / (topY - bottomY);
            const halfWidth = (size / 2) * (1 - progress);
            const xOffset = (rowIndex % 2) * (spacing / 2);

            for (let x = -halfWidth + xOffset; x <= halfWidth; x += spacing) {
                points.push({ x, y });
            }
            rowIndex++;
        }
        return points;
    }

    // ============ STAR (5-pointed) ============
    static starOutline(size, spacing) {
        const points = [];
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.38; // Golden ratio approximation

        const starPoints = [];
        for (let i = 0; i < 10; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i / 10) * 2 * Math.PI - Math.PI / 2; // Start from top
            starPoints.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }

        // Draw lines between consecutive points
        for (let i = 0; i < starPoints.length; i++) {
            const start = starPoints[i];
            const end = starPoints[(i + 1) % starPoints.length];
            this.addLinePoints(points, start, end, spacing);
        }

        return points;
    }

    static starFill(size, spacing) {
        const points = [];
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.38;

        // Get star vertices
        const starVertices = [];
        for (let i = 0; i < 10; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
            starVertices.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }

        // Grid-based fill with point-in-polygon test
        let rowIndex = 0;
        for (let y = -outerRadius; y <= outerRadius; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = -outerRadius + xOffset; x <= outerRadius; x += spacing) {
                if (this.pointInPolygon(x, y, starVertices)) {
                    points.push({ x, y });
                }
            }
            rowIndex++;
        }
        return points;
    }

    // ============ HEART ============
    static heartOutline(size, spacing) {
        const points = [];
        const scale = size / 32; // Normalize parametric range
        const numPoints = Math.max(50, Math.floor(size * 2 / spacing));

        for (let i = 0; i < numPoints; i++) {
            const t = (i / numPoints) * 2 * Math.PI;
            // Heart parametric equations
            const x = 16 * Math.pow(Math.sin(t), 3) * scale;
            const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;
            points.push({ x, y });
        }
        return points;
    }

    static heartFill(size, spacing) {
        const points = [];
        const scale = size / 32;

        // Get heart outline for bounds
        const outlinePoints = this.heartOutline(size, spacing / 2);
        const bounds = this.getBounds(outlinePoints);

        // Grid-based fill
        let rowIndex = 0;
        for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = bounds.minX + xOffset; x <= bounds.maxX; x += spacing) {
                if (this.pointInHeart(x, y, scale)) {
                    points.push({ x, y });
                }
            }
            rowIndex++;
        }
        return points;
    }

    static pointInHeart(x, y, scale) {
        // Implicit heart equation: (x^2 + y^2 - 1)^3 - x^2*y^3 <= 0
        const nx = x / (scale * 16);
        const ny = y / (scale * 14);
        const term = nx * nx + ny * ny - 1;
        return Math.pow(term, 3) - nx * nx * Math.pow(ny, 3) <= 0;
    }

    // ============ HEXAGON ============
    static hexagonOutline(size, spacing) {
        const points = [];
        const radius = size / 2;

        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * 2 * Math.PI + Math.PI / 6; // Flat-topped
            vertices.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }

        for (let i = 0; i < 6; i++) {
            this.addLinePoints(points, vertices[i], vertices[(i + 1) % 6], spacing);
        }

        return points;
    }

    static hexagonFill(size, spacing) {
        const points = [];
        const radius = size / 2;

        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * 2 * Math.PI + Math.PI / 6;
            vertices.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }

        let rowIndex = 0;
        for (let y = -radius; y <= radius; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = -radius + xOffset; x <= radius; x += spacing) {
                if (this.pointInPolygon(x, y, vertices)) {
                    points.push({ x, y });
                }
            }
            rowIndex++;
        }
        return points;
    }

    // ============ HELPERS ============
    static addLinePoints(points, start, end, spacing) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const numPoints = Math.max(2, Math.floor(distance / spacing));

        for (let i = 0; i < numPoints; i++) {
            const t = i / numPoints;
            points.push({
                x: start.x + dx * t,
                y: start.y + dy * t
            });
        }
    }

    static pointInPolygon(x, y, vertices) {
        // Ray casting algorithm
        let inside = false;
        const n = vertices.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    static getBounds(points) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        return { minX, minY, maxX, maxY };
    }
}

// Export for use in main.js
if (typeof window !== 'undefined') {
    window.ParametricShapes = ParametricShapes;
}
