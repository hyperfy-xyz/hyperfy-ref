import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import * as math from 'mathjs'

import { System } from './System'

const CHUNK_SIZE = 64

export class Terrain2 extends System {
  constructor(world) {
    super(world)
  }

  start() {
    const chunkRange = 2 // Generate a 2x2 grid of chunks
    for (let x = 0; x < chunkRange; x++) {
      for (let z = 0; z < chunkRange; z++) {
        const chunk = new WavesChunk(x, 0, z)
        const mesh = generateSurfaceNetsMesh(
          chunk.values,
          chunk.shape,
          chunk.min,
          chunk.max
        )

        // Position the mesh based on chunk coordinates
        mesh.position.set(x * CHUNK_SIZE, 0, z * CHUNK_SIZE)

        console.log('tmesh', mesh)
        this.world.graphics.scene.add(mesh)
      }
    }
  }
}

class SphereChunk {
  constructor() {
    this.size = 18
    this.shape = new Shape([this.size, this.size, this.size])
    this.min = [0, 0, 0]
    this.max = [this.size - 1, this.size - 1, this.size - 1]
    this.values = new Float32Array(this.size * this.size * this.size)
    const radius = 15
    const centerX = this.size / 2
    const centerY = this.size / 2
    const centerZ = this.size / 2
    for (let z = 0; z < this.size; z++) {
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const index = x + y * this.size + z * this.size * this.size
          this.values[index] = this.sample(
            x,
            y,
            z,
            radius,
            centerX,
            centerY,
            centerZ
          )
        }
      }
    }
  }

  sample(x, y, z, radius, centerX, centerY, centerZ) {
    const dx = x - centerX
    const dy = y - centerY
    const dz = z - centerZ
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius
  }
}

const seed = Math.random()
const noise = createNoise3D(() => seed)

class WavesChunk {
  constructor(chunkX, chunkY, chunkZ) {
    this.chunkX = chunkX
    this.chunkY = chunkY
    this.chunkZ = chunkZ
    this.size = CHUNK_SIZE
    this.shape = new Shape([this.size, this.size, this.size])
    this.min = [0, 0, 0]
    this.max = [this.size - 1, this.size - 1, this.size - 1]
    this.values = new Float32Array(this.size * this.size * this.size)

    // Create a new noise function

    for (let z = 0; z < this.size; z++) {
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const index = x + y * this.size + z * this.size * this.size
          this.values[index] = this.sample(x, y, z)
        }
      }
    }
  }

  sample(x, y, z) {
    // Adjust coordinates based on chunk position
    const worldX = x + this.chunkX * CHUNK_SIZE
    const worldY = y + this.chunkY * CHUNK_SIZE
    const worldZ = z + this.chunkZ * CHUNK_SIZE

    // Scale factors to adjust the frequency of the noise
    const scale = 0.02
    const amplitude = 12

    // Base height of the terrain
    const baseHeight = 32

    // Use simplex noise to generate the height
    const noiseValue = noise(worldX * scale, worldZ * scale, 0)
    const height = baseHeight + amplitude * noiseValue

    // The SDF value is the difference between the worldY coordinate and the calculated height
    return worldY - height
  }
}

// ... (keep the rest of the code unchanged)

// Based on https://github.com/bonsairobo/fast-surface-nets-rs/blob/main/src/lib.rs
// See: https://bonsairobo.medium.com/smooth-voxel-mapping-a-technical-deep-dive-on-real-time-surface-nets-and-texturing-ef06d0f8ca14
// See https://github.com/bonsairobo/fast-surface-nets-rs/tree/main

const NULL_VERTEX = -1

const CUBE_CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
]

const CUBE_EDGES = [
  [0b000, 0b001],
  [0b000, 0b010],
  [0b000, 0b100],
  [0b001, 0b011],
  [0b001, 0b101],
  [0b010, 0b011],
  [0b010, 0b110],
  [0b011, 0b111],
  [0b100, 0b101],
  [0b100, 0b110],
  [0b101, 0b111],
  [0b110, 0b111],
]

class SurfaceNetsBuffer {
  constructor() {
    this.positions = []
    this.normals = []
    this.indices = []
    this.surfacePoints = []
    this.surfaceStrides = []
    this.strideToIndex = []
  }

  reset(arraySize) {
    this.positions.length = 0
    this.normals.length = 0
    this.indices.length = 0
    this.surfacePoints.length = 0
    this.surfaceStrides.length = 0
    this.strideToIndex = new Array(arraySize).fill(NULL_VERTEX)
  }
}

function surfaceNets(sdf, shape, min, max, output) {
  output.reset(sdf.length)
  estimateSurface(sdf, shape, min, max, output)
  makeAllQuads(sdf, shape, min, max, output)
}

function estimateSurface(
  sdf,
  shape,
  [minx, miny, minz],
  [maxx, maxy, maxz],
  output
) {
  for (let z = minz; z < maxz; z++) {
    for (let y = miny; y < maxy; y++) {
      for (let x = minx; x < maxx; x++) {
        const stride = shape.linearize([x, y, z])
        const p = new THREE.Vector3(x, y, z)
        if (estimateSurfaceInCube(sdf, shape, p, stride, output)) {
          output.strideToIndex[stride] = output.positions.length - 1
          output.surfacePoints.push([x, y, z])
          output.surfaceStrides.push(stride)
        } else {
          output.strideToIndex[stride] = NULL_VERTEX
        }
      }
    }
  }
}

function estimateSurfaceInCube(sdf, shape, p, minCornerStride, output) {
  let cornerDists = new Array(8)
  let numNegative = 0

  for (let i = 0; i < 8; i++) {
    const cornerStride = minCornerStride + shape.linearize(CUBE_CORNERS[i])
    const d = sdf[cornerStride]
    cornerDists[i] = d
    if (d < 0) numNegative++
  }

  if (numNegative === 0 || numNegative === 8) return false

  const c = centroidOfEdgeIntersections(cornerDists)
  output.positions.push([p.x + c.x, p.y + c.y, p.z + c.z])
  output.normals.push(sdfGradient(cornerDists, c).toArray())

  return true
}

function centroidOfEdgeIntersections(dists) {
  let count = 0
  let sum = new THREE.Vector3()
  for (const [corner1, corner2] of CUBE_EDGES) {
    const d1 = dists[corner1]
    const d2 = dists[corner2]
    if (d1 < 0 !== d2 < 0) {
      count++
      sum.add(estimateSurfaceEdgeIntersection(corner1, corner2, d1, d2))
    }
  }
  return sum.divideScalar(count)
}

function estimateSurfaceEdgeIntersection(corner1, corner2, value1, value2) {
  const interp1 = value1 / (value1 - value2)
  const interp2 = 1 - interp1
  const v1 = new THREE.Vector3().fromArray(CUBE_CORNERS[corner1])
  const v2 = new THREE.Vector3().fromArray(CUBE_CORNERS[corner2])
  return v1.multiplyScalar(interp2).add(v2.multiplyScalar(interp1))
}

function sdfGradient(dists, s) {
  // Implementation of sdf gradient calculation
  // This is a simplified version and might need refinement
  const gradient = new THREE.Vector3()
  for (let i = 0; i < 3; i++) {
    const d1 = dists[1 << i] - dists[0]
    const d2 = dists[7] - dists[7 - (1 << i)]
    gradient.setComponent(
      i,
      d1 * (1 - s.getComponent(i)) + d2 * s.getComponent(i)
    )
  }
  return gradient
}

function makeAllQuads(
  sdf,
  shape,
  [minx, miny, minz],
  [maxx, maxy, maxz],
  output
) {
  const xyzStrides = [
    shape.linearize([1, 0, 0]),
    shape.linearize([0, 1, 0]),
    shape.linearize([0, 0, 1]),
  ]

  for (let i = 0; i < output.surfacePoints.length; i++) {
    const [x, y, z] = output.surfacePoints[i]
    const pStride = output.surfaceStrides[i]

    if (y !== miny && z !== minz && x !== maxx - 1) {
      maybeAddQuad(
        sdf,
        output,
        pStride,
        pStride + xyzStrides[0],
        xyzStrides[1],
        xyzStrides[2]
      )
    }
    if (x !== minx && z !== minz && y !== maxy - 1) {
      maybeAddQuad(
        sdf,
        output,
        pStride,
        pStride + xyzStrides[1],
        xyzStrides[2],
        xyzStrides[0]
      )
    }
    if (x !== minx && y !== miny && z !== maxz - 1) {
      maybeAddQuad(
        sdf,
        output,
        pStride,
        pStride + xyzStrides[2],
        xyzStrides[0],
        xyzStrides[1]
      )
    }
  }
}

function maybeAddQuad(sdf, output, p1, p2, axisBStride, axisCStride) {
  const d1 = sdf[p1]
  const d2 = sdf[p2]
  let negativeFace

  if (d1 < 0 && d2 >= 0) negativeFace = false
  else if (d1 >= 0 && d2 < 0) negativeFace = true
  else return // No face

  const v1 = output.strideToIndex[p1]
  const v2 = output.strideToIndex[p1 - axisBStride]
  const v3 = output.strideToIndex[p1 - axisCStride]
  const v4 = output.strideToIndex[p1 - axisBStride - axisCStride]

  const pos1 = new THREE.Vector3().fromArray(output.positions[v1])
  const pos2 = new THREE.Vector3().fromArray(output.positions[v2])
  const pos3 = new THREE.Vector3().fromArray(output.positions[v3])
  const pos4 = new THREE.Vector3().fromArray(output.positions[v4])

  let quad
  if (pos1.distanceToSquared(pos4) < pos2.distanceToSquared(pos3)) {
    quad = negativeFace ? [v1, v4, v2, v1, v3, v4] : [v1, v2, v4, v1, v4, v3]
  } else {
    quad = negativeFace ? [v2, v3, v4, v2, v1, v3] : [v2, v4, v3, v2, v3, v1]
  }
  output.indices.push(...quad)
}

export function generateSurfaceNetsMesh(sdf, shape, min, max) {
  const buffer = new SurfaceNetsBuffer()
  surfaceNets(sdf, shape, min, max, buffer)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(buffer.positions.flat(), 3)
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(buffer.normals.flat(), 3)
  )
  geometry.setIndex(buffer.indices)

  const material = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
  })
  return new THREE.Mesh(geometry, material)
}

// Example shape class (you might need to adjust this based on your specific needs)
class Shape {
  constructor(dimensions) {
    this.dimensions = dimensions
  }

  linearize([x, y, z]) {
    return (
      x + y * this.dimensions[0] + z * this.dimensions[0] * this.dimensions[1]
    )
  }
}

// Usage example:
// const sdf = [...]; // Your signed distance field
// const shape = new Shape([32, 32, 32]);
// const min = [0, 0, 0];
// const max = [31, 31, 31];
// const mesh = generateSurfaceNetsMesh(sdf, shape, min, max);
// scene.add(mesh);
