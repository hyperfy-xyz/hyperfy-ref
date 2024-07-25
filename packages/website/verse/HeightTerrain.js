import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'

import { System } from './System'
import { createColliderFactory } from './extras/createColliderFactory'
import { getRandomColorHex } from './extras/utils'

const v1 = new THREE.Vector3()

const debugColorsByLod = {
  0: 'red',
  1: 'orange',
  2: 'yellow',
  3: 'blue',
  4: 'green',
  5: 'white',
}

export class HeightTerrain extends System {
  constructor(world) {
    super(world)
    this.chunks = new Map()

    this.noise2D = createNoise2D(() => 0.1)
    this.noise3D = createNoise3D()

    this.scale = 128 // chunk size in meters
    this.res = 32 + 1 // vertices per chunk axis (x and z)

    this.viewDistance = 15 // number of chunks in each direction

    this.prevLocation = new THREE.Vector3(0, 0, 0)
    this.currLocation = new THREE.Vector3(0, 0, 0)

    this.checkRate = 1 / 2
    this.checkTime = 0

    this.buildQueue = []
  }

  async start() {
    // create material
    const texture = await this.world.loader.loadTEX('/static/terrain/Grass1.png') // prettier-ignore
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(32, 32)
    this.material = new THREE.MeshStandardMaterial({
      // wireframe: true,
      roughness: 1,
      metalness: 0,
      map: texture,
    })

    // generate chunks
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const chunk = new Chunk(this.world, x, z)
        this.chunks.set(chunk.id, chunk)
      }
    }
    // build them
    this.chunks.forEach(chunk => chunk.build())
  }

  update(delta) {
    for (let i = 0; i < 20; i++) {
      const chunk = this.dequeueBuild()
      if (!chunk) break
      chunk.build()
    }

    this.checkTime += delta
    if (this.checkTime > this.checkRate) {
      this.check()
      this.checkTime = 0
    }
  }

  check() {
    // check if our location changed (coords of the chunk we are on)
    const position = this.world.graphics.cameraRig.position
    const x = Math.floor(position.x / this.scale)
    const z = Math.floor(position.z / this.scale)
    const currLocation = v1.set(x, 0, z)
    if (currLocation.equals(this.currLocation)) {
      return
    }
    this.prevLocation.copy(this.currLocation)
    this.currLocation.copy(currLocation)

    // location changed so clear the build queue
    this.buildQueue.length = 0

    // console.log('prev', this.prevLocation)
    // console.log('curr', this.currLocation)

    // console.time('check')

    // unbuild chunks outside view distance
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const chunkX = this.prevLocation.x + x
        const chunkZ = this.prevLocation.z + z
        const id = `${chunkX},${chunkZ}`
        const chunk = this.chunks.get(id)
        if (!chunk) continue
        const dist = chunk.distanceTo(this.currLocation)
        if (dist > this.viewDistance) {
          chunk.unbuild()
        }
      }
    }

    // update lod levels inside view distance
    // create any missing chunks
    // and queue them up for a build
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const chunkX = this.currLocation.x + x
        const chunkZ = this.currLocation.z + z
        const id = `${chunkX},${chunkZ}`
        let chunk = this.chunks.get(id)
        if (chunk) {
          chunk.checkLOD()
        } else {
          chunk = new Chunk(this.world, chunkX, chunkZ)
          this.chunks.set(chunk.id, chunk)
        }
        this.enqueueBuild(chunk)
      }
    }

    // console.timeEnd('check')
  }

  enqueueBuild(chunk) {
    const idx = this.buildQueue.indexOf(chunk)
    if (idx !== -1) return
    this.buildQueue.push(chunk)
  }

  dequeueBuild() {
    return this.buildQueue.pop()
  }

  getChunkByWorldPosition(position) {
    const x = Math.floor(position.x / this.scale)
    const z = Math.floor(position.z / this.scale)
    const id = `${x},${z}`
    return this.chunks.get(id)
  }

  getTriangleCount() {
    let count = 0
    this.chunks.forEach(chunk => {
      if (chunk.mesh) {
        const geometry = chunk.mesh.geometry
        if (geometry.index !== null) {
          count += geometry.index.count / 3
        } else {
          count += geometry.attributes.position.count / 3
        }
      }
    })
    return count
  }
}

class Chunk {
  constructor(world, x, z) {
    this.world = world
    this.terrain = world.terrain
    this.id = `${x},${z}`
    this.coords = new THREE.Vector3(x, 0, z)
    this.data = null
    this.lod = this.calculateLOD()
  }

  generate() {
    // console.time('generate')

    this.data = new Float32Array(this.terrain.res * this.terrain.res)

    const res = this.terrain.res
    const scale = this.terrain.scale
    const noise2D = this.terrain.noise2D

    let idx = -1
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        idx++

        // world coords
        // normalized coordinates so that lower res uses similar coords
        const normalizedX = x / (res - 1)
        const normalizedZ = z / (res - 1)
        const w = v1.set((this.coords.x + normalizedX) * scale, 0, (this.coords.z + normalizedZ) * scale) // prettier-ignore
        // const w = v1.set(this.coords.x * (res - 1) + x, 0, this.coords.z * (res - 1) + z) // prettier-ignore

        // surface
        const surfaceAmp = 20
        const surfaceNoiseScale = 0.002
        let surfaceNoise = noise2D(w.x * surfaceNoiseScale, w.z * surfaceNoiseScale) // prettier-ignore
        surfaceNoise = sinToAlpha(surfaceNoise)

        // hill zones
        const hillZoneNoiseScale = 0.002
        let hillZoneNoise = noise2D(w.x * hillZoneNoiseScale, w.z * hillZoneNoiseScale) // prettier-ignore
        hillZoneNoise = sinToAlpha(hillZoneNoise)

        // hills
        const hillAmp = 80
        const hillNoiseScale = 0.02
        let hillNoise = noise2D(w.x * hillNoiseScale, w.z * hillNoiseScale)
        hillNoise = sinToAlpha(hillNoise)

        // modulate hills inside their zones
        const hillThreshold = 0.7
        // 0 to 1 inside threshold
        const hillIntensity = Math.max(0, (hillZoneNoise - hillThreshold) / (1 - hillThreshold)) // prettier-ignore
        hillNoise *= hillIntensity

        let height = surfaceNoise * surfaceAmp + hillNoise * hillAmp

        this.data[idx] = height
      }
    }

    // console.timeEnd('generate')
  }

  build() {
    if (!this.data) this.generate()
    this.unbuild()

    const fullRes = this.terrain.res
    const fullScale = this.terrain.scale

    const lod = this.lod
    const divisor = Math.pow(2, lod) // 2^LOD
    const res = (this.terrain.res - 1) / divisor + 1
    const vertScale = fullScale / (res - 1)

    const geometry = new THREE.BufferGeometry()

    // create vertices
    const vertices = []
    const normals = []
    const uvs = []
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const dataX = x * divisor
        const dataZ = z * divisor
        const idx = dataZ * fullRes + dataX
        let height = this.data[idx]

        // when neighbours transition to lower resolution
        // we need to adjust the transititory vertices to be the average
        // which makes them seamless.
        if (x === 0) {
          const nChunkId = `${this.coords.x - 1},${this.coords.z}`
          const nChunk = this.world.terrain.chunks.get(nChunkId)
          if (nChunk && nChunk.lod > this.lod) {
            const fract = z % 2
            if (fract !== 0) {
              const h1 = this.data[(dataZ - divisor) * fullRes + dataX]
              const h2 = this.data[(dataZ + divisor) * fullRes + dataX]
              height = (h1 + h2) / 2
            }
          }
        }
        if (x === res - 1) {
          const nChunkId = `${this.coords.x + 1},${this.coords.z}`
          const nChunk = this.world.terrain.chunks.get(nChunkId)
          if (nChunk && nChunk.lod > this.lod) {
            const fract = z % 2
            if (fract !== 0) {
              // height += 10
              const h1 = this.data[(dataZ - divisor) * fullRes + dataX]
              const h2 = this.data[(dataZ + divisor) * fullRes + dataX]
              height = (h1 + h2) / 2
            }
          }
        }
        if (z === 0) {
          const nChunkId = `${this.coords.x},${this.coords.z - 1}`
          const nChunk = this.world.terrain.chunks.get(nChunkId)
          if (nChunk && nChunk.lod > this.lod) {
            const fract = x % 2
            if (fract !== 0) {
              const h1 = this.data[dataZ * fullRes + (dataX - divisor)]
              const h2 = this.data[dataZ * fullRes + (dataX + divisor)]
              height = (h1 + h2) / 2
            }
          }
        }
        if (z === res - 1) {
          const nChunkId = `${this.coords.x},${this.coords.z + 1}`
          const nChunk = this.world.terrain.chunks.get(nChunkId)
          if (nChunk && nChunk.lod > this.lod) {
            const fract = x % 2
            if (fract !== 0) {
              const h1 = this.data[dataZ * fullRes + (dataX - divisor)]
              const h2 = this.data[dataZ * fullRes + (dataX + divisor)]
              height = (h1 + h2) / 2
            }
          }
        }

        vertices.push(x * vertScale, height, z * vertScale)
        normals.push(0, 1, 0)
        uvs.push(dataX / (fullScale - 1), dataZ / (fullScale - 1))
      }
    }

    // create faces (indices)
    const indices = []
    for (let z = 0; z < res - 1; z++) {
      for (let x = 0; x < res - 1; x++) {
        const a = z * res + x
        const b = z * res + x + 1
        const c = (z + 1) * res + x
        const d = (z + 1) * res + x + 1
        indices.push(a, c, b)
        indices.push(b, c, d)
      }
    }

    const position = new THREE.Float32BufferAttribute(vertices, 3)
    geometry.setAttribute('position', position)
    const normal = new THREE.Float32BufferAttribute(normals, 3)
    geometry.setAttribute('normal', normal)
    const uv = new THREE.Float32BufferAttribute(uvs, 2)
    geometry.setAttribute('uv', uv)
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    let material = this.terrain.material

    // debug material
    material = new THREE.MeshStandardMaterial({
      color: debugColorsByLod[this.lod],
      // color: getRandomColorHex(),
      // wireframe: true,
    })

    // mesh
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.x = this.coords.x * fullScale
    this.mesh.position.z = this.coords.z * fullScale
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.mesh.matrixWorld.compose(
      this.mesh.position,
      this.mesh.quaternion,
      this.mesh.scale
    )
    this.world.graphics.scene.add(this.mesh)

    // octree
    // this.sItem = {
    //   matrix: this.mesh.matrixWorld,
    //   geometry: this.mesh.geometry,
    //   material: this.mesh.material,
    //   getEntity: () => {
    //     console.log('TODO: getEntity -> terrain')
    //     return null
    //   },
    //   chunk: this,
    // }
    // this.world.spatial.octree.insert(this.sItem)

    // collider
    this.colliderFactory = createColliderFactory(this.world, this.mesh)
    this.collider = this.colliderFactory.create(null, this.mesh.matrixWorld)
  }

  unbuild() {
    if (this.mesh) {
      this.needsBuild = true
      // mesh
      this.world.graphics.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      if (this.mesh.material !== this.world.terrain.material) {
        this.mesh.material.dispose() // debug material probably
      }
      this.mesh = null
      // octree
      // this.world.spatial.octree.remove(this.sItem)
      // this.sItem = null
      // collider
      this.collider.destroy()
      this.collider = null
      this.colliderFactory.destroy()
      this.colliderFactory = null
    }
  }

  distanceTo(location) {
    const distX = Math.abs(location.x - this.coords.x)
    const distZ = Math.abs(location.z - this.coords.z)
    const distance = Math.max(distX, distZ) // chessboard (chebyshev) distance
    return distance
  }

  calculateLOD() {
    const distance = this.distanceTo(this.world.terrain.currLocation)
    if (distance <= 1) return 0 // current and 8 neighbours
    if (distance <= 4) return 1
    if (distance <= 8) return 2
    if (distance <= 16) return 3
    if (distance <= 32) return 4
    return 5
  }

  checkLOD() {
    const lod = this.calculateLOD()
    if (this.lod !== lod) {
      this.lod = lod
      return true
    }
    return false
  }
}

function smoothstep(min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return x * x * (3 - 2 * x)
}

function alphaToSin(value) {
  return value * 2 - 1 // map (0, 1) to (-1, 1)
}

function sinToAlpha(value) {
  return value / 2 + 0.5 // map (-1, 1) to (0, 1)
}
