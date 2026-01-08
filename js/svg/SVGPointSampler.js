/**
 * SVGPointSampler.js
 * Parse SVG files and sample points along paths
 * Uses native browser SVG APIs for accurate path sampling
 */

class SVGShapeParser {
    constructor() {
        this.supportedElements = ['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'line'];
    }

    /**
     * Parse SVG file and extract all drawable paths
     * @param {File|string} input - SVG file or string
     * @returns {Promise<{paths: Array, viewBox: Object}>}
     */
    async parse(input) {
        const svgString = input instanceof File
            ? await input.text()
            : input;

        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');

        // Check for parsing errors
        const parserError = svgDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Invalid SVG: ' + parserError.textContent);
        }

        const svgElement = svgDoc.querySelector('svg');
        if (!svgElement) {
            throw new Error('No SVG element found');
        }

        return this.extractPaths(svgElement);
    }

    /**
     * Extract all paths from SVG, converting shapes to paths
     */
    extractPaths(svgElement) {
        const paths = [];
        const viewBox = this.parseViewBox(svgElement);

        // Process all supported elements
        this.supportedElements.forEach(tagName => {
            svgElement.querySelectorAll(tagName).forEach(element => {
                const pathData = this.elementToPath(element);
                if (pathData) {
                    paths.push({
                        d: pathData,
                        transform: this.getComputedTransform(element),
                        fill: element.getAttribute('fill') !== 'none',
                        stroke: element.getAttribute('stroke') !== 'none'
                    });
                }
            });
        });

        return { paths, viewBox };
    }

    /**
     * Convert any SVG shape element to path d attribute
     */
    elementToPath(element) {
        const tag = element.tagName.toLowerCase();

        switch (tag) {
            case 'path':
                return element.getAttribute('d');

            case 'rect':
                return this.rectToPath(element);

            case 'circle':
                return this.circleToPath(element);

            case 'ellipse':
                return this.ellipseToPath(element);

            case 'polygon':
            case 'polyline':
                return this.polygonToPath(element, tag === 'polygon');

            case 'line':
                return this.lineToPath(element);

            default:
                return null;
        }
    }

    rectToPath(rect) {
        const x = parseFloat(rect.getAttribute('x')) || 0;
        const y = parseFloat(rect.getAttribute('y')) || 0;
        const w = parseFloat(rect.getAttribute('width'));
        const h = parseFloat(rect.getAttribute('height'));
        const rx = parseFloat(rect.getAttribute('rx')) || 0;
        const ry = parseFloat(rect.getAttribute('ry')) || rx;

        if (rx === 0 && ry === 0) {
            return `M${x},${y} L${x+w},${y} L${x+w},${y+h} L${x},${y+h} Z`;
        }
        // Rounded rect path
        return `M${x+rx},${y} L${x+w-rx},${y} Q${x+w},${y} ${x+w},${y+ry} L${x+w},${y+h-ry} Q${x+w},${y+h} ${x+w-rx},${y+h} L${x+rx},${y+h} Q${x},${y+h} ${x},${y+h-ry} L${x},${y+ry} Q${x},${y} ${x+rx},${y} Z`;
    }

    circleToPath(circle) {
        const cx = parseFloat(circle.getAttribute('cx')) || 0;
        const cy = parseFloat(circle.getAttribute('cy')) || 0;
        const r = parseFloat(circle.getAttribute('r'));

        // Circle as two arcs
        return `M${cx-r},${cy} A${r},${r} 0 1,0 ${cx+r},${cy} A${r},${r} 0 1,0 ${cx-r},${cy}`;
    }

    ellipseToPath(ellipse) {
        const cx = parseFloat(ellipse.getAttribute('cx')) || 0;
        const cy = parseFloat(ellipse.getAttribute('cy')) || 0;
        const rx = parseFloat(ellipse.getAttribute('rx'));
        const ry = parseFloat(ellipse.getAttribute('ry'));

        return `M${cx-rx},${cy} A${rx},${ry} 0 1,0 ${cx+rx},${cy} A${rx},${ry} 0 1,0 ${cx-rx},${cy}`;
    }

    polygonToPath(element, close = true) {
        const pointsAttr = element.getAttribute('points');
        if (!pointsAttr) return null;

        const points = pointsAttr.trim().split(/[\s,]+/);
        if (points.length < 4) return null;

        let d = `M${points[0]},${points[1]}`;
        for (let i = 2; i < points.length; i += 2) {
            if (points[i] !== undefined && points[i + 1] !== undefined) {
                d += ` L${points[i]},${points[i+1]}`;
            }
        }
        return close ? d + ' Z' : d;
    }

    lineToPath(line) {
        const x1 = parseFloat(line.getAttribute('x1')) || 0;
        const y1 = parseFloat(line.getAttribute('y1')) || 0;
        const x2 = parseFloat(line.getAttribute('x2')) || 0;
        const y2 = parseFloat(line.getAttribute('y2')) || 0;
        return `M${x1},${y1} L${x2},${y2}`;
    }

    parseViewBox(svg) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
            const [minX, minY, width, height] = viewBox.split(/[\s,]+/).map(Number);
            return { minX, minY, width, height };
        }
        return {
            minX: 0,
            minY: 0,
            width: parseFloat(svg.getAttribute('width')) || 100,
            height: parseFloat(svg.getAttribute('height')) || 100
        };
    }

    getComputedTransform(element) {
        // Walk up the tree to accumulate transforms
        let transforms = [];
        let current = element;

        while (current && current.tagName !== 'svg') {
            const transform = current.getAttribute('transform');
            if (transform) {
                transforms.unshift(transform);
            }
            current = current.parentElement;
        }

        return transforms.join(' ');
    }
}

class SVGPointSampler {
    constructor() {
        this.tempSvg = null;
    }

    /**
     * Create temporary SVG element for native path operations
     */
    createTempSVG() {
        if (!this.tempSvg) {
            this.tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.tempSvg.style.position = 'absolute';
            this.tempSvg.style.visibility = 'hidden';
            this.tempSvg.style.pointerEvents = 'none';
            this.tempSvg.style.width = '1000px';
            this.tempSvg.style.height = '1000px';
            document.body.appendChild(this.tempSvg);
        }
        return this.tempSvg;
    }

    /**
     * Sample points along a single path
     * @param {string} pathD - Path d attribute
     * @param {string} transform - Optional transform string
     * @param {number} spacing - Distance between samples
     * @returns {Array<{x: number, y: number}>}
     */
    samplePath(pathD, transform, spacing) {
        const svg = this.createTempSVG();
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', pathD);

        if (transform) {
            pathEl.setAttribute('transform', transform);
        }

        svg.appendChild(pathEl);

        const points = [];
        const totalLength = pathEl.getTotalLength();

        // Sample at regular intervals
        for (let dist = 0; dist <= totalLength; dist += spacing) {
            const point = pathEl.getPointAtLength(dist);
            points.push({ x: point.x, y: point.y });
        }

        // Always include the end point
        if (totalLength % spacing !== 0) {
            const endPoint = pathEl.getPointAtLength(totalLength);
            points.push({ x: endPoint.x, y: endPoint.y });
        }

        svg.removeChild(pathEl);
        return points;
    }

    /**
     * Sample fill points inside a closed path
     */
    sampleFill(pathD, transform, spacing) {
        const svg = this.createTempSVG();
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', pathD);

        if (transform) {
            pathEl.setAttribute('transform', transform);
        }

        svg.appendChild(pathEl);

        const bbox = pathEl.getBBox();
        const points = [];

        // Grid sampling with honeycomb offset
        let rowIndex = 0;
        for (let y = bbox.y; y <= bbox.y + bbox.height; y += spacing) {
            const xOffset = (rowIndex % 2) * (spacing / 2);
            for (let x = bbox.x + xOffset; x <= bbox.x + bbox.width; x += spacing) {
                const svgPoint = svg.createSVGPoint();
                svgPoint.x = x;
                svgPoint.y = y;

                if (pathEl.isPointInFill(svgPoint)) {
                    points.push({ x, y });
                }
            }
            rowIndex++;
        }

        svg.removeChild(pathEl);
        return points;
    }

    /**
     * Sample points from all paths in SVG data
     */
    sampleAllPaths(svgData, spacing, options = {}) {
        const {
            includeOutline = true,
            includeFill = false,
            mergeOverlapping = true
        } = options;

        let allPoints = [];

        svgData.paths.forEach(pathInfo => {
            // Sample outline points
            if (includeOutline) {
                const outlinePoints = this.samplePath(
                    pathInfo.d,
                    pathInfo.transform,
                    spacing
                );
                allPoints.push(...outlinePoints);
            }

            // Sample fill points for closed paths
            if (includeFill) {
                const fillPoints = this.sampleFill(
                    pathInfo.d,
                    pathInfo.transform,
                    spacing
                );
                allPoints.push(...fillPoints);
            }
        });

        // Remove overlapping points
        if (mergeOverlapping && allPoints.length > 0) {
            allPoints = this.removeOverlapping(allPoints, spacing / 2);
        }

        return allPoints;
    }

    /**
     * Remove points that are too close together
     */
    removeOverlapping(points, minDistance) {
        const result = [];
        const minDistSq = minDistance * minDistance;

        points.forEach(point => {
            let tooClose = false;
            for (let existing of result) {
                const dx = point.x - existing.x;
                const dy = point.y - existing.y;
                if (dx * dx + dy * dy < minDistSq) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                result.push(point);
            }
        });

        return result;
    }

    cleanup() {
        if (this.tempSvg && this.tempSvg.parentNode) {
            this.tempSvg.parentNode.removeChild(this.tempSvg);
            this.tempSvg = null;
        }
    }
}

class SVGCoordinateNormalizer {
    /**
     * Normalize SVG points to canvas coordinate system
     * @param {Array} points - Array of {x, y} from SVG
     * @param {Object} svgViewBox - {minX, minY, width, height}
     * @param {Object} canvasSize - {width, height}
     * @param {Object} options - Normalization options
     */
    static normalize(points, svgViewBox, canvasSize, options = {}) {
        const {
            fitMode = 'contain',
            padding = 0.1,
            offsetX = 0,
            offsetY = 0
        } = options;

        if (points.length === 0) return [];

        // Calculate effective canvas area (with padding)
        const effectiveWidth = canvasSize.width * (1 - padding * 2);
        const effectiveHeight = canvasSize.height * (1 - padding * 2);

        // Calculate scale based on fit mode
        let scaleX, scaleY;
        switch (fitMode) {
            case 'contain':
                const containScale = Math.min(
                    effectiveWidth / svgViewBox.width,
                    effectiveHeight / svgViewBox.height
                );
                scaleX = scaleY = containScale;
                break;
            case 'cover':
                const coverScale = Math.max(
                    effectiveWidth / svgViewBox.width,
                    effectiveHeight / svgViewBox.height
                );
                scaleX = scaleY = coverScale;
                break;
            case 'stretch':
                scaleX = effectiveWidth / svgViewBox.width;
                scaleY = effectiveHeight / svgViewBox.height;
                break;
            default:
                scaleX = scaleY = 1;
        }

        // SVG center in SVG coordinates
        const svgCenterX = svgViewBox.minX + svgViewBox.width / 2;
        const svgCenterY = svgViewBox.minY + svgViewBox.height / 2;

        // Apply offset (percentage of canvas)
        const offsetPxX = (offsetX / 100) * canvasSize.width;
        const offsetPxY = (offsetY / 100) * canvasSize.height;

        // Transform each point
        return points.map(point => {
            // Center and scale
            let x = (point.x - svgCenterX) * scaleX;
            let y = (point.y - svgCenterY) * scaleY;

            // Flip Y axis (SVG Y increases downward, 3D Y increases upward)
            y = -y;

            // Apply offset
            x += offsetPxX;
            y += offsetPxY;

            return { x, y, z: 0 };
        });
    }
}

// Export for use in main.js
if (typeof window !== 'undefined') {
    window.SVGShapeParser = SVGShapeParser;
    window.SVGPointSampler = SVGPointSampler;
    window.SVGCoordinateNormalizer = SVGCoordinateNormalizer;
}
