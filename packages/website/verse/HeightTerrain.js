import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'

import { System } from './System'
import { createColliderFactory } from './extras/createColliderFactory'
import { getRandomColorHex } from './extras/utils'

const v1 = new THREE.Vector3()

const debugColorsByLod = {
  1: 'red',
  2: 'orange',
  4: 'yellow',
  8: 'blue',
  16: 'green',
  32: 'white',
}

export class HeightTerrain extends System {
  constructor(world) {
    super(world)
    this.chunks = new Map()

    this.noise2D = createNoise2D(() => 0.1)
    this.noise3D = createNoise3D()

    this.scale = 128 // chunk size in meters
    this.res = 32 + 1 // vertices per chunk axis (x and z)

    this.viewDistance = 10 // number of chunks in each direction

    this.prevLocation = new THREE.Vector3(0, 0, 0)
    this.currLocation = new THREE.Vector3(0, 0, 0)

    this.checkRate = 1 / 2
    this.checkTime = 0

    this.queue = []
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
        chunk.build()
      }
    }
  }

  update(delta) {
    for (let i = 0; i < 20; i++) {
      const chunk = this.dequeue()
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

    // console.log('prev', this.prevLocation)
    // console.log('curr', this.currLocation)

    // console.time('checkLODs')

    let unbuilt = 0
    let rebuilt = 0
    let built = 0
    let created = 0

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
          this.removeFromQueue(chunk)
        }
      }
    }

    // create any missing chunks inside view distance
    // update lods levels (rebuild is in another pass below)
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const chunkX = this.currLocation.x + x
        const chunkZ = this.currLocation.z + z
        const id = `${chunkX},${chunkZ}`
        let chunk = this.chunks.get(id)
        if (chunk) {
          chunk.check()
        } else {
          chunk = new Chunk(this.world, chunkX, chunkZ)
          this.chunks.set(chunk.id, chunk)
        }
      }
    }

    // build or rebuild if needed
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const chunkX = this.currLocation.x + x
        const chunkZ = this.currLocation.z + z
        const id = `${chunkX},${chunkZ}`
        const chunk = this.chunks.get(id)
        this.enqueue(chunk) // queue to .build()
      }
    }

    // console.timeEnd('checkLODs')
  }

  enqueue(chunk) {
    const idx = this.queue.indexOf(chunk)
    if (idx !== -1) return
    this.queue.push(chunk)
  }

  dequeue() {
    return this.queue.pop()
  }

  removeFromQueue(chunk) {
    const idx = this.queue.indexOf(chunk)
    if (idx === -1) return
    this.queue.splice(idx, 1)
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
    this.data = new Float32Array(this.terrain.res * this.terrain.res)
    this.lod = this.calculateLOD()
    this.needsGenerate = true
    this.needsBuild = true
  }

  check() {
    const lod = this.calculateLOD()
    if (this.lod !== lod) {
      this.lod = lod
      this.needsBuild = true
    }
  }

  generate() {
    // console.time('generate')
    this.needsGenerate = false

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
    if (!this.needsBuild) return
    if (this.needsGenerate) this.generate()
    this.unbuild()
    this.needsBuild = false

    const res = this.terrain.res
    const scale = this.terrain.scale

    const lod = this.lod
    const lodRes = (this.terrain.res - 1) / lod + 1
    const lodScale = scale // this.terrain.scale * lod
    const vertScale = lodScale / (lodRes - 1)

    // console.log('res', res)
    // console.log('scale', scale)
    // console.log('lod', lod)
    // console.log('lodRes', lodRes)
    // console.log('lodScale', lodScale)
    // console.log('vertScale', vertScale)

    const geometry = new THREE.BufferGeometry()

    // create vertices
    const vertices = []
    const normals = []
    const uvs = []
    for (let z = 0; z < lodRes; z++) {
      for (let x = 0; x < lodRes; x++) {
        const dataX = x * lod
        const dataZ = z * lod
        const idx = dataZ * res + dataX
        const height = this.data[idx]
        vertices.push(x * vertScale, height, z * vertScale)
        normals.push(0, 1, 0)
        uvs.push(dataX / (scale - 1), dataZ / (scale - 1))
      }
    }

    // create faces (indices)
    const indices = []
    for (let z = 0; z < lodRes - 1; z++) {
      for (let x = 0; x < lodRes - 1; x++) {
        const a = z * lodRes + x
        const b = z * lodRes + x + 1
        const c = (z + 1) * lodRes + x
        const d = (z + 1) * lodRes + x + 1
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
    // material = new THREE.MeshStandardMaterial({
    //   // color: debugColorsByLod[this.lod],
    //   color: getRandomColorHex(),
    //   wireframe: true,
    // })

    // mesh
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.x = this.coords.x * scale
    this.mesh.position.z = this.coords.z * scale
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
    if (distance <= 1) return 1 // current and 8 neighbours
    if (distance <= 2) return 2
    if (distance <= 3) return 4
    if (distance <= 4) return 8
    if (distance <= 5) return 16
    return 32
  }

  checkLOD() {
    const lod = this.calculateLOD()
    if (this.lod !== lod) {
      this.lod = lod
      this.build()
      return true
    }
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
