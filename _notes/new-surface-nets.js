// Claude ported this to javascript
// https://github.com/bonsairobo/fast-surface-nets-rs/blob/main/src/lib.rs
// From this article
// https://bonsairobo.medium.com/smooth-voxel-mapping-a-technical-deep-dive-on-real-time-surface-nets-and-texturing-ef06d0f8ca14
// It works with a boundary of 1
// And correctly avoids positive edges for seamless chunks
// But the normals are based on sdf gradients, which look blocky on some angles

import * as THREE from 'three';

const CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
];

const CUBE_CORNER_VECTORS = CUBE_CORNERS.map(corner => new THREE.Vector3(...corner));

const CUBE_EDGES = [
    [0b000, 0b001], [0b000, 0b010], [0b000, 0b100],
    [0b001, 0b011], [0b001, 0b101], [0b010, 0b011],
    [0b010, 0b110], [0b011, 0b111], [0b100, 0b101],
    [0b100, 0b110], [0b101, 0b111], [0b110, 0b111]
];

class SurfaceNetsBuffer {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.indices = [];
        this.surfacePoints = [];
        this.surfaceStrides = [];
        this.strideToIndex = [];
    }

    reset(arraySize) {
        this.positions = [];
        this.normals = [];
        this.indices = [];
        this.surfacePoints = [];
        this.surfaceStrides = [];
        this.strideToIndex = new Array(arraySize).fill(Number.MAX_SAFE_INTEGER);
    }
}

function surfaceNets(sdf, shape, min, max) {
    const output = new SurfaceNetsBuffer();
    output.reset(shape.linearize(max) + 1);

    estimateSurface(sdf, shape, min, max, output);
    makeAllQuads(sdf, shape, min, max, output);

    return {
        vertices: output.positions.flat(),
        indices: output.indices,
        normals: output.normals.flat()
    };
}

function estimateSurface(sdf, shape, min, max, output) {
    for (let z = min[2]; z < max[2]; z++) {
        for (let y = min[1]; y < max[1]; y++) {
            for (let x = min[0]; x < max[0]; x++) {
                const stride = shape.linearize([x, y, z]);
                const p = new THREE.Vector3(x, y, z);
                if (estimateSurfaceInCube(sdf, shape, p, stride, output)) {
                    output.strideToIndex[stride] = output.positions.length - 1;
                    output.surfacePoints.push([x, y, z]);
                    output.surfaceStrides.push(stride);
                } else {
                    output.strideToIndex[stride] = Number.MAX_SAFE_INTEGER;
                }
            }
        }
    }
}

function estimateSurfaceInCube(sdf, shape, p, minCornerStride, output) {
    let cornerDists = new Array(8);
    let numNegative = 0;

    for (let i = 0; i < 8; i++) {
        const cornerStride = minCornerStride + shape.linearize(CUBE_CORNERS[i]);
        const d = sdf[cornerStride];
        cornerDists[i] = d;
        if (d < 0) numNegative++;
    }

    if (numNegative === 0 || numNegative === 8) return false;

    const c = centroidOfEdgeIntersections(cornerDists);
    output.positions.push(p.clone().add(c).toArray());
    output.normals.push(sdfGradient(cornerDists, c).toArray());

    return true;
}

function centroidOfEdgeIntersections(dists) {
    let count = 0;
    const sum = new THREE.Vector3();

    for (const [corner1, corner2] of CUBE_EDGES) {
        const d1 = dists[corner1];
        const d2 = dists[corner2];
        if ((d1 < 0) !== (d2 < 0)) {
            count++;
            sum.add(estimateSurfaceEdgeIntersection(corner1, corner2, d1, d2));
        }
    }

    return sum.divideScalar(count);
}

function estimateSurfaceEdgeIntersection(corner1, corner2, value1, value2) {
    const interp1 = value1 / (value1 - value2);
    const interp2 = 1 - interp1;

    return new THREE.Vector3().addScaledVector(CUBE_CORNER_VECTORS[corner1], interp2)
        .addScaledVector(CUBE_CORNER_VECTORS[corner2], interp1);
}

function sdfGradient(dists, s) {
    const p00 = new THREE.Vector3(dists[0b001], dists[0b010], dists[0b100]);
    const n00 = new THREE.Vector3(dists[0b000], dists[0b000], dists[0b000]);

    const p10 = new THREE.Vector3(dists[0b101], dists[0b011], dists[0b110]);
    const n10 = new THREE.Vector3(dists[0b100], dists[0b001], dists[0b010]);

    const p01 = new THREE.Vector3(dists[0b011], dists[0b110], dists[0b101]);
    const n01 = new THREE.Vector3(dists[0b010], dists[0b100], dists[0b001]);

    const p11 = new THREE.Vector3(dists[0b111], dists[0b111], dists[0b111]);
    const n11 = new THREE.Vector3(dists[0b110], dists[0b101], dists[0b011]);

    const d00 = p00.sub(n00);
    const d10 = p10.sub(n10);
    const d01 = p01.sub(n01);
    const d11 = p11.sub(n11);

    const neg = new THREE.Vector3(1, 1, 1).sub(s);

    return new THREE.Vector3()
        .addScaledVector(d00, neg.y * neg.z)
        .addScaledVector(d10, neg.y * s.z)
        .addScaledVector(d01, s.y * neg.z)
        .addScaledVector(d11, s.y * s.z);
}

function makeAllQuads(sdf, shape, min, max, output) {
    const xyzStrides = [
        shape.linearize([1, 0, 0]),
        shape.linearize([0, 1, 0]),
        shape.linearize([0, 0, 1])
    ];

    for (let i = 0; i < output.surfacePoints.length; i++) {
        const [x, y, z] = output.surfacePoints[i];
        const pStride = output.surfaceStrides[i];

        if (y !== min[1] && z !== min[2] && x !== max[0] - 1) {
            maybeAddQuad(sdf, output, pStride, pStride + xyzStrides[0], xyzStrides[1], xyzStrides[2]);
        }
        if (x !== min[0] && z !== min[2] && y !== max[1] - 1) {
            maybeAddQuad(sdf, output, pStride, pStride + xyzStrides[1], xyzStrides[2], xyzStrides[0]);
        }
        if (x !== min[0] && y !== min[1] && z !== max[2] - 1) {
            maybeAddQuad(sdf, output, pStride, pStride + xyzStrides[2], xyzStrides[0], xyzStrides[1]);
        }
    }
}

function maybeAddQuad(sdf, output, p1, p2, axisBStride, axisCStride) {
    const d1 = sdf[p1];
    const d2 = sdf[p2];
    let negativeFace;

    if (d1 < 0 && d2 >= 0) negativeFace = false;
    else if (d1 >= 0 && d2 < 0) negativeFace = true;
    else return;

    const v1 = output.strideToIndex[p1];
    const v2 = output.strideToIndex[p1 - axisBStride];
    const v3 = output.strideToIndex[p1 - axisCStride];
    const v4 = output.strideToIndex[p1 - axisBStride - axisCStride];

    const pos1 = new THREE.Vector3().fromArray(output.positions[v1]);
    const pos2 = new THREE.Vector3().fromArray(output.positions[v2]);
    const pos3 = new THREE.Vector3().fromArray(output.positions[v3]);
    const pos4 = new THREE.Vector3().fromArray(output.positions[v4]);

    let quad;
    if (pos1.distanceToSquared(pos4) < pos2.distanceToSquared(pos3)) {
        quad = negativeFace ? [v1, v4, v2, v1, v3, v4] : [v1, v2, v4, v1, v4, v3];
    } else {
        quad = negativeFace ? [v2, v3, v4, v2, v1, v3] : [v2, v4, v3, v2, v3, v1];
    }

    output.indices.push(...quad);
}

// Shape class to mimic Rust's Shape trait
class Shape {
    constructor(dimensions) {
        this.dimensions = dimensions;
    }

    linearize(coord) {
        return coord[0] + this.dimensions[0] * (coord[1] + this.dimensions[1] * coord[2]);
    }
}

// Example usage
function createSurface(data, dims) {
    const shape = new Shape(dims);
    const min = [0, 0, 0];
    const max = [dims[0] - 1, dims[1] - 1, dims[2] - 1];
    
    return surfaceNets(data, shape, min, max);
}

// Export the main function
export { createSurface };