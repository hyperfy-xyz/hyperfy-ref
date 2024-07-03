import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'


import { System } from './System'

import CustomShaderMaterial from './libs/three-custom-shader-material'
import { createSurface } from './libs/surface-nets/SurfaceNets'

import { createColliderFactory } from './extras/createColliderFactory'

const MODIFY_RATE = 1 / 30

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()

const center = new THREE.Vector3()
const nCenter = new THREE.Vector3()

// chunk grid size in # of voxels
const gridSize = new THREE.Vector3(16, 128, 16)

// chunk grid overlap (shared )
const gridBorder = 2

// chunk grid size inner (without border)
const gridSizeInner = new THREE.Vector3(
  gridSize.x - gridBorder * 2,
  gridSize.y,
  gridSize.z - gridBorder * 2
)

const neighbourDirections = [
  [-1, 0], [1, 0], [0, -1], [0, 1],  // Orthogonal
  [-1, -1], [1, 1], [-1, 1], [1, -1] // Diagonal
]

// factor to convert chunk grid size in voxels to meters
const scale = 1

const noise = createNoise3D(() => 10)

// TODO: have a utility size * scale vec3 for use instead of manually calculating everywhere

export class Terrain3 extends System {
  constructor(world) {
    super(world)
    this.chunks = new Map()
    this.modifyRate = 0
  }

  start() {
    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshStandardMaterial({
        color: 'white',
        opacity: 0.1,
        transparent: true,
      })
    )
    this.cursor.visible = false
    this.world.graphics.scene.add(this.cursor)

    // the voxel resolved to modify
    // todo: show normal direction
    {
      const size = 1 * scale
      const geometry = new THREE.BoxGeometry(size, size, size)
      const edges = new THREE.EdgesGeometry(geometry)
      const material = new THREE.LineBasicMaterial({ color: 'white' })
      this.point = new THREE.LineSegments(edges, material)
      this.world.graphics.scene.add(this.point)
    }

    console.time('generateChunks')
    const radius = 15
    for (let x = -radius / 2; x < radius / 2; x++) {
      for (let z = -radius / 2; z < radius / 2; z++) {
        const coords = new THREE.Vector3(x, 0, z)
        const chunk = new Chunk(world, coords)
        this.chunks.set(chunk.id, chunk)
      }
    }
    console.timeEnd('generateChunks')
  }

  update(delta) {
    const control = this.world.control
    const hit = control.hits[0]
    if (hit?.chunk && control.terrain.editing) {
      this.cursor.visible = true
      this.cursor.position.copy(hit.point)
      this.cursor.scale.setScalar(control.terrain.radius)
      if (control.pointer.down) {
        this.modifyRate += delta
        if (this.modifyRate > MODIFY_RATE) {
          this.modifyRate = 0
          console.log('hit', hit)
          // const center = new THREE.Vector3()
          //   .copy(hit.point)
          //   .add(
          //     new THREE.Vector3().copy(hit.normal).multiplyScalar(0.6 * scale)
          //   )
          hit.chunk.modify(
            hit.point,
            hit.normal,
            // center,
            Math.round(control.terrain.radius),
            control.pointer.rmb,
            true
          )
        }
      }
    } else {
      this.cursor.visible = false
    }
  }

  getChunkByCoords(x, y, z) {
    return this.chunks.get(`${x},${y},${z}`)
  }

  // modify(point, subtract) {
  //   const chunkSize = new THREE.Vector3(
  //     gridSize.x * scale,
  //     gridSize.y * scale,
  //     gridSize.z * scale
  //   )
  //   const chunkCoords = new THREE.Vector3(
  //     Math.floor(point.x / chunkSize.x),
  //     Math.floor(point.y / chunkSize.y),
  //     Math.floor(point.z / chunkSize.z)
  //   )
  //   // console.log('chunkCoords', chunkCoords)

  //   const chunkId = `${chunkCoords.x},${chunkCoords.y},${chunkCoords.z}`
  //   const chunk = this.chunks.get(chunkId)

  //   // cursor.position.copy(point)

  //   if (chunk) {
  //     // console.log('hit', chunk)
  //     // return
  //     const localPoint = new THREE.Vector3()
  //       .copy(point)
  //       .sub(
  //         new THREE.Vector3(
  //           chunkCoords.x * chunkSize.x * scale,
  //           chunkCoords.y * chunkSize.y * scale,
  //           chunkCoords.z * chunkSize.z * scale
  //         )
  //       )
  //       .divideScalar(scale)
  //     // const localPoint = new THREE.Vector3()
  //     //   .copy(point)
  //     //   .sub(chunk.mesh.position)
  //     //   .divide(new THREE.Vector3(scale, scale, scale))
  //     const radius = 2
  //     chunk.modify(localPoint, radius / scale, subtract)
  //   }
  // }
}

class Chunk {
  constructor(world, coords) {
    this.id = `${coords.x},${coords.y},${coords.z}`
    this.world = world
    this.coords = coords

    this.data = new Float32Array(gridSize.x * gridSize.y * gridSize.z)
    this.dims = [gridSize.x, gridSize.y, gridSize.z] // redundant cant we pass this to SurfaceNets as gridSize?

    this.populate()
    this.build()
  }

  populate() {
    

    console.time('populate');

    const noiseScale = 0.02;
    const heightScale = 20;
    const baseHeight = 2;

    const octaves = 4;
    const persistence = 0.5;
    const lacunarity = 2.0;

    const smoothStep = (min, max, value) => {
      const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return x * x * (3 - 2 * x);
    };

    const field = (worldX, y, worldZ) => {
      let noiseValue = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
    
      for (let i = 0; i < octaves; i++) {
        noiseValue += noise(
          worldX * noiseScale * frequency, 
          0,
          worldZ * noiseScale * frequency
        ) * amplitude;
    
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
    
      noiseValue /= maxValue;  // Normalize the noise value
    
      // Apply smooth step function to create more gradual transitions
      const smoothedNoise = smoothStep(-1, 1, noiseValue);
    
      const height = smoothedNoise * heightScale + baseHeight;
    
      // Return a signed distance field value
      return y - height;
    };

    let index = 0;
    for (let z = 0; z < gridSize.z; z++) {
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          // Calculate world coordinates
          const worldX = this.coords.x * (gridSize.x - gridBorder * 2) + x;
          const worldZ = this.coords.z * (gridSize.z - gridBorder * 2) + z;
          
          this.data[index++] = field(worldX, y, worldZ);
        }
      }
    }

    console.timeEnd('populate');


    // =====


    // // console.time('populate')

    // // // const resolution = 1 // TODO: factor to downsample number of voxels

    // const field = (x, y, z)  =>{
    //   // all solid inside
    //   // if (
    //   //   x <= 0 ||
    //   //   x >= gridSize.x - 1 ||
    //   //   y <= 0 ||
    //   //   y >= gridSize.y - 1 ||
    //   //   z <= 0 ||
    //   //   z >= gridSize.z - 1
    //   // ) {
    //   //   return 1 // Outer two layers (empty)
    //   // }
    //   // return -1 // Inner part (solid)

    //   // bottom 2 layers solid
    //   // if (y <= 1) {
    //   //   return -1 // Solid (bottom two layers)
    //   // }
    //   // return 1 // Empty (everything else)

    //   const globalX = this.coords.x * (gridSize.x - gridBorder * 2) + x
    //   if (y <= globalX || y<= 1) {
    //     return -1
    //   }
    //   return 1

    //   // const globalX = this.coords.x * (gridSize.x - gridBorder * 2) + x
    //   // if (globalX % 2 === 0) {
    //   //   if (y <= 1) {
    //   //     return -1
    //   //   }
    //   // } else {
    //   //   if (y <= 2) {
    //   //     return -1
    //   //   }
    //   // }
    //   // return 1

    //   // sphere in center
    //   const centerX = gridSize.x / 2
    //   const centerY = gridSize.y / 2
    //   const centerZ = gridSize.z / 2
    //   const radius = Math.min(gridSize.x, gridSize.y, gridSize.z) * 0.4
    //   return (
    //     Math.sqrt(
    //       (x - centerX) ** 2 + (y - centerY) ** 2 + (z - centerZ) ** 2
    //     ) - radius
    //   )
    // }

    // let index = 0
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       this.data[index++] = field(x, y, z)
    //     }
    //   }
    // }

    // console.timeEnd('populate')
  }

  build() {
    // cleanup previous
    if (this.mesh) {
      this.world.graphics.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
      this.world.spatial.octree.remove(this.sItem)
      this.sItem = null
      this.collider.destroy()
      this.collider = null
    }

    console.time('build')

    console.time('build:geometry')

    const surface = createSurface(this.data, this.dims, gridBorder)
    

    console.log('surface',surface)

    

    // manually constructing these arrays is way faster
    // see https://x.com/AshConnell/status/1806531542946304374

    const vertices = new Float32Array(surface.vertices.length)
    for (let i = 0; i < surface.vertices.length; i++) {
      vertices[i] = surface.vertices[i] * scale
    }

    const indices = new Uint32Array(surface.indices.length)
    for (let i = 0; i < surface.indices.length; i++) {
      indices[i] = surface.indices[i]
    }

    const normals = new Float32Array(surface.normals.length)
    for (let i = 0; i < surface.normals.length; i++) {
      normals[i] = surface.normals[i]
    }

    

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    // geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    // geometry.computeVertexNormals()
    geometry.computeBoundsTree()
    
    console.timeEnd('build:geometry')

    // const normals = geometry.getAttribute('normal').array

    // const tex1 = this.world.loader.texLoader.load('/static/day2-2k.jpg')
    // const material = new CustomShaderMaterial({
    //   baseMaterial: THREE.MeshPhysicalMaterial,
    //   vertexShader: `
    //     varying vec2 vUv;
    //     varying vec3 vPos;
    //     void main() {
    //       vUv = uv;
    //       // vPos = position;
    //       vec4 wPosition = modelMatrix * vec4(position, 1.0);
    //       vPos = wPosition.xyz;
    //       // vPos = worldPosition.xyz;
    //     }
    //   `,
    //   fragmentShader: `
    //     uniform sampler2D tex1;

    //     varying vec2 vUv;
    //     varying vec3 vPos;

    //     void main() {
    //       vec2 uv = vPos.xz * 0.5;
    //       vec4 result = texture2D(tex1, uv);
    //       csm_DiffuseColor *= result;
    //     }
    //   `,
    //   uniforms: {
    //     text1: { value: tex1 }
    //   }
    // })

    const material = new THREE.MeshStandardMaterial({
      // color: 'green',
      color: getRandomColorHex(),
      // side: THREE.DoubleSide,
      // wireframe: true,
      // flatShading: true,
      // map: this.world.loader.texLoader.load('/static/day2-2k.jpg')
    })
    const mesh = new THREE.Mesh(geometry, material)
    // mesh.scale.setScalar(scale)
    mesh.position.set(
      this.coords.x * gridSize.x * scale - this.coords.x * (gridBorder*2) * scale, // xz overlap
      this.coords.y * gridSize.y * scale,
      this.coords.z * gridSize.z * scale - this.coords.z * (gridBorder*2) * scale // xz overlap
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.updateMatrix()
    mesh.updateMatrixWorld(true)
    mesh.chunk = this
    this.world.graphics.scene.add(mesh)
    const sItem = {
      matrix: mesh.matrixWorld,
      geometry: mesh.geometry,
      material: mesh.material,
      getEntity: () => {
        console.log('TODO: getEntity -> terrain')
        return null
      },
      chunk: this,
    }

    console.time('build:octree')
    this.world.spatial.octree.insert(sItem)
    console.timeEnd('build:octree')
    console.time('build:collider1')
    const factory = createColliderFactory(this.world, mesh)
    console.timeEnd('build:collider1')
    console.time('build:collider2')
    const collider = factory.create(null, mesh.matrixWorld)
    console.timeEnd('build:collider2')

    this.mesh = mesh
    this.sItem = sItem
    this.collider = collider


    // normals visual
    // {
    //   const geometry = new THREE.BufferGeometry();
    //   const positions = [];
    //   for (let i = 0; i < vertices.length; i += 3) {
    //       positions.push(
    //           vertices[i], vertices[i+1], vertices[i+2],
    //           vertices[i] + normals[i] * scale,
    //           vertices[i+1] + normals[i+1] * scale,
    //           vertices[i+2] + normals[i+2] * scale
    //       );
    //   }  
    //   geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    //   const material = new THREE.LineBasicMaterial({ 
    //     // color: 'black' 
    //     color: getRandomColorHex(),
    //   });
    //   const lines = new THREE.LineSegments(geometry, material);
    //   lines.position.copy(mesh.position)
    //   this.world.graphics.scene.add(lines)
    // }

    // chunk outline
    // {
    //   const geometry = new THREE.BoxGeometry(
    //     gridSize.x * scale,
    //     gridSize.y * scale,
    //     gridSize.z * scale
    //   )
    //   geometry.translate(
    //     (gridSize.x * scale) / 2,
    //     (gridSize.y * scale) / 2,
    //     (gridSize.z * scale) / 2
    //   )
    //   const edges = new THREE.EdgesGeometry(geometry)
    //   const material = new THREE.LineBasicMaterial({ color: 'white' })
    //   const mesh = new THREE.LineSegments(edges, material)
    //   mesh.position.set(
    //     this.coords.x * gridSize.x * scale,
    //     this.coords.y * gridSize.y * scale,
    //     this.coords.z * gridSize.z * scale
    //   )
    //   this.world.graphics.scene.add(mesh)
    // }

    console.timeEnd('build')
  }

  modify(point, normal, radius, subtract, checkNeighbours) {
    // radius = 4
    radius = Math.round(radius)
    // radius /= scale

    // const cNormal = normalToCardinal(normal).multiplyScalar(0.5)
    // center
    //   .copy(point)
    //   .sub(this.mesh.position)
    //   .divideScalar(scale)
    //   .round()
    //   .add(cNormal)

    // const offset = 0.01 * scale // Small offset in world units
    // const offsetPoint = point.clone().addScaledVector(normal, offset)

    // const absX = Math.abs(normal.x)
    // const absY = Math.abs(normal.y)
    // const absZ = Math.abs(normal.z)
    // if (absX > absY && absX > absZ) {
    //   point.x += Math.sign(normal.x) * 1.1
    // } else if (absY > absX && absY > absZ) {
    //   point.y += Math.sign(normal.y) * 1.1
    // } else {
    //   point.z += Math.sign(normal.z) * 1.1
    // }

    center.copy(point).sub(this.mesh.position).divideScalar(scale).round()

    this.world.terrain3.point.position
      .copy(center)
      .multiplyScalar(scale)
      .add(this.mesh.position)

    console.log('center', center.toArray())

    this.modifyGrid(center, radius, subtract, checkNeighbours)
  }

  modifyGrid(center, radius, subtract, checkNeighbours) {
    // const maxDistance = radius * 0.75
    // for (let y = -radius; y <= radius; y++) {
    //   for (let z = -radius; z <= radius; z++) {
    //     for (let x = -radius; x <= radius; x++) {
    //       const distance = x * x + y * y + z * z
    //       if (distance < radius) {
    //         const coords = v1.set(x, y, z)
    //         if (this.isInGrid(coords)) {
    //           const power = constrain(1 - distance / maxDistance, 0, 1)
    //           const value = (subtract ? -4 : 4) * power
    //           const idx = x + y * this.dims[0] + z * this.dims[0] * this.dims[1]
    //           this.data[idx] += value
    //           // const power = map( d, 0, radius * 0.75, 1, 0, true );
    //           // this.addScaleValueToGrid( gridPosition.x, gridPosition.y, gridPosition.z, val * p );
    //           // this.saveGridPosition( gridPosition );
    //         }
    //       }
    //     }
    //   }
    // }

    let rebuild

    // const sign = subtract ? 0.1 : -0.1
    // const radiusSquared = radius * radius
    // for (let z = 0; z < this.dims[2]; z++) {
    //   for (let y = 0; y < this.dims[1]; y++) {
    //     for (let x = 0; x < this.dims[0]; x++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distanceSquared = dx * dx + dy * dy + dz * dz
    //       if (distanceSquared <= radiusSquared) {
    //         const idx = x + y * this.dims[0] + z * this.dims[0] * this.dims[1]
    //         const distance = Math.sqrt(distanceSquared)
    //         this.data[idx] += sign * (radius - distance)
    //         rebuild = true
    //       }
    //     }
    //   }
    // }

    const sign = subtract ? 1 : -1
    const radiusSquared = radius * radius
    console.log('radius',radius)
    for (
      // let z = 0; z < gridSize.z; z++
      let z = Math.max(0, center.z - radius);
      z <= Math.min(gridSize.z - 1, center.z + radius);
      z++
    ) {
      for (
        // let y = 0; y < gridSize.y; y++
        let y = Math.max(0, center.y - radius);
        y <= Math.min(gridSize.y - 1, center.y + radius);
        y++
      ) {
        for (
          // let x = 0; x < gridSize.x; x++
          let x = Math.max(0, center.x - radius);
          x <= Math.min(gridSize.x - 1, center.x + radius);
          x++
        ) {
          // Calculate the squared distance from the hit point
          const dx = x - center.x
          const dy = y - center.y
          const dz = z - center.z
          const distanceSquared = dx * dx + dy * dy + dz * dz

          // Check if the voxel is within the sphere of influence
          if (distanceSquared <= radiusSquared) {
            // Calculate the effect based on the distance (linear fade out)
            const intensity = 0.05
            const effect = sign * intensity * (1 - Math.sqrt(distanceSquared) / radius) // prettier-ignore
            // if (x === center.x && y === center.y && z === center.z) {
            //   console.log('effect', effect)
            //   console.log(x,y,z)
            // }

            // quadratic falloff
            // const intensity = 0.1
            // const effect = sign * intensity * (1 - distanceSquared / (radius * radius)) // prettier-ignore

            // const intensity = 1
            // const t = 1 - Math.sqrt(distanceSquared) / radius
            // const effect = sign * intensity * smoothstep(0, 1, t)

            // Calculate the effect based on distance (gradient)
            // const intensity = 1
            // const effect = sign * intensity * map(distanceSquared, 0, radius * 0.75, 1, 0, true) // prettier-ignore

            // const intensity = 0.1
            // const effect = sign * intensity * (1 - distanceSquared / radiusSquared) ** 2 // prettier-ignore

            // const accumulationRate = 0.1 // Adjust this to control speed of changes
            // this.data[idx] += effect * accumulationRate

            // Apply the effect to the solidity value
            const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x
            // if (x === center.x && y === center.y && z === center.z) {
            //   console.log(`Modifying voxel at (${x}, ${y}, ${z}):`, 
            // `Initial value: ${this.data[idx]}`,
            // `Effect: ${effect}`,
            // `Final value: ${this.data[idx] + effect}`);
            // }
            this.data[idx] += effect
            this.data[idx] = Math.min(1, Math.max(-1, this.data[idx] + effect))

            rebuild = true
          }
        }
      }
    }

    // for (let x = center.x - radius; x <= center.x + radius; x++) {
    //   for (let y = center.y - radius; y <= center.y + radius; y++) {
    //     for (let z = center.z - radius; z <= center.z + radius; z++) {
    //       const distSquared = x * x + y * y + z * z
    //       if (distSquared < radius) {
    //         console.log('h', x, y, z)
    //         if (this.isInGrid(v1.set(x, y, z))) {
    //           console.log('uo')
    //           const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //           //if not lower that 0 or height that this.terrain.gridSize, add value
    //           const val = 1 //0.0668 // 4 * delta guess
    //           const power = val * map(distSquared, 0, radius * 0.75, 1, 0, true)
    //           const oldValueScale = map(
    //             Math.abs(this.data[idx]),
    //             0,
    //             0.5,
    //             0.001,
    //             3
    //           )
    //           console.log('bef', this.data[idx])
    //           this.data[idx] = constrain(
    //             this.data[idx] + power * oldValueScale,
    //             -0.5,
    //             0.5
    //           )
    //           console.log('aft', this.data[idx])
    //         }
    //       }
    //     }
    //   }
    // }

    // const radiusSquared = radius * radius
    // const sign = subtract ? 1 : -1
    // for (
    //   let x = Math.max(0, center.x - radius);
    //   x < Math.min(gridSize.x, center.x + radius);
    //   x++
    // ) {
    //   for (
    //     let y = Math.max(0, center.y - radius);
    //     y < Math.min(gridSize.y, center.y + radius);
    //     y++
    //   ) {
    //     for (
    //       let z = Math.max(0, center.z - radius);
    //       z < Math.min(gridSize.z, center.z + radius);
    //       z++
    //     ) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distSquared = dx * dx + dy * dy + dz * dz

    //       if (distSquared < radiusSquared) {
    //         const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x
    //         const distance = Math.sqrt(distSquared)
    //         const val = -0.0668 // 4 * delta roughly
    //         const power = val * map(distance, 0, radius, 1, 0, true)

    //         console.log(
    //           'Modifying:',
    //           x,
    //           y,
    //           z,
    //           'Power:',
    //           power,
    //           'Before:',
    //           this.data[idx]
    //         )

    //         this.data[idx] = constrain(this.data[idx] + power, -0.5, 0.5)

    //         console.log('After:', this.data[idx])

    //         rebuild = true
    //       }
    //     }
    //   }
    // }

    // for (let y = center.y; y < center.y + 1; y++) {
    //   const idx = center.z * gridSize.y * gridSize.x + y * gridSize.x + center.x
    //   console.log('fo', this.data[idx])
    //   this.data[idx] = -1
    // }

    // const idx =
    //   center.z * gridSize.y * gridSize.x + center.y * gridSize.x + center.x
    // console.log('fo', this.data[idx])
    // this.data[idx] = -1

    // for (let x = 0; x < gridSize.x; x++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let z = 0; z < gridSize.z; z++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distSquared = dx * dx + dy * dy + dz * dz
    //       if (distSquared < radius) {
    //         console.log('h', x, y, z)
    //         const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //         //if not lower that 0 or height that this.terrain.gridSize, add value
    //         const val = -1 //0.0668 // 4 * delta guess
    //         const power = val * map(distSquared, 0, radius * 0.75, 1, 0, true)
    //         const oldValueScale = map(
    //           Math.abs(this.data[idx]),
    //           0,
    //           0.5,
    //           0.001,
    //           3
    //         )
    //         console.log('bef', this.data[idx])
    //         this.data[idx] = constrain(
    //           this.data[idx] + power * oldValueScale,
    //           -0.5,
    //           0.5
    //         )
    //         console.log('aft', this.data[idx])
    //       }
    //     }
    //   }
    // }

    // for (let x = center.x - 1; x <= center.x + 1; x++) {
    //   for (let y = center.y - 1; y <= center.y + 1; y++) {
    //     for (let z = center.z - 1; z <= center.z + 1; z++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    //       const intensity = 0.2
    //       const sign = -1
    //       const effect = sign * intensity * (1 - distance / radius) // prettier-ignore
    //       const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //       this.data[idx] += effect
    //       console.log(x, y, z, effect)
    //       // const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //       // this.data[idx] -= 0.1
    //     }
    //   }
    // }
    // const idx = center.z * gridSize.y * gridSize.x + center.y * gridSize.x + center.x // prettier-ignore
    // this.data[idx] = -1
    // console.log(this.id, this.data[idx])
    // rebuild = true

    if (rebuild) {
      this.build()
    }
    if (checkNeighbours) {
      this.modifyNeighbours(center, radius, subtract)
    }
  }

  modifyNeighbours(center, radius, subtract) {
    const terrain = this.world.terrain3

    // const chunkSize = gridSize.x - gridBorder * 2  // Assuming square chunks

    // for (const [dx, dz] of neighbourDirections) {
    //   const checkPoint = v1.set(
    //     center.x + dx * radius,
    //     center.y,
    //     center.z + dz * radius
    //   )
      
    //   if (checkPoint.x < gridBorder || checkPoint.x > chunkSize - gridBorder ||
    //       checkPoint.z < gridBorder || checkPoint.z > chunkSize - gridBorder) {
        
    //     const nCoords = v2.set(
    //       this.coords.x + dx,
    //       0,
    //       this.coords.z + dz
    //     )
        
    //     const nChunk = terrain.getChunkByCoords(
    //       nCoords.x,
    //       nCoords.y,
    //       nCoords.z
    //     )
        
    //     if (nChunk) {
    //       const nCenter = v3.copy(center).sub(
    //         nCoords.set(dx * chunkSize, 0, dz * chunkSize)
    //       )
    //       nChunk.modifyGrid(nCenter, radius, subtract, false)
    //     }
    //   }
    // }
    // return   

    // todo: this is checking all neighbours for now because the if checks are incorrect

    // x-axis
    // if (center.x <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }

    // z-axis
    // if (center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.z += gridSize.z - (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.z - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.z = nCenter.z - gridSize.z + (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }

    // diagonals
    // if (center.x < radius && center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - (gridBorder * 2)
      nCenter.z += gridSize.z - (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x < radius && gridSize.z - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + (gridBorder * 2)
      nCenter.z = nCenter.z - gridSize.z + (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (center.x < radius && gridSize.x - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - (gridBorder * 2)
      nCenter.z = nCenter.z - gridSize.z + (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x < radius && center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + (gridBorder * 2)
      nCenter.z += gridSize.z - (gridBorder * 2)
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
  }

  isInGrid(coords) {
    return (
      coords.x >= 0 &&
      coords.x < gridSize.x &&
      coords.y > 0 &&
      coords.y < gridSize.y - 1 &&
      coords.z >= 0 &&
      coords.z < gridSize.z
    )
  }
}

// function disposeNode(node) {
//   if (node.isMesh) {
//     node.removeFromParent()
//     if (node.geometry) {
//       node.geometry.dispose()
//     }
//     if (node.material) {
//       if (node.material.map) node.material.map.dispose()
//       if (node.material.lightMap) node.material.lightMap.dispose()
//       if (node.material.bumpMap) node.material.bumpMap.dispose()
//       if (node.material.normalMap) node.material.normalMap.dispose()
//       if (node.material.specularMap) node.material.specularMap.dispose()
//       if (node.material.envMap) node.material.envMap.dispose()
//       if (node.material.alphaMap) node.material.alphaMap.dispose()
//       if (node.material.aoMap) node.material.aoMap.dispose()
//       if (node.material.displacementMap) node.material.displacementMap.dispose()
//       if (node.material.emissiveMap) node.material.emissiveMap.dispose()
//       if (node.material.gradientMap) node.material.gradientMap.dispose()
//       if (node.material.metalnessMap) node.material.metalnessMap.dispose()
//       if (node.material.roughnessMap) node.material.roughnessMap.dispose()
//       node.material.dispose()
//     }
//   }
// }

function getRandomColorHex() {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

function constrain(n, low, high) {
  return Math.max(Math.min(n, high), low)
}

function map(n, start1, stop1, start2, stop2, withinBounds) {
  const newval = ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2
  if (!withinBounds) {
    return newval
  }
  if (start2 < stop2) {
    return constrain(newval, start2, stop2)
  } else {
    return constrain(newval, stop2, start2)
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const cNormal = new THREE.Vector3()
function normalToCardinal(normal) {
  const absX = Math.abs(normal.x)
  const absY = Math.abs(normal.y)
  const absZ = Math.abs(normal.z)

  if (absX > absY && absX > absZ) {
    // East or West
    return cNormal.set(Math.sign(normal.x), 0, 0)
  } else if (absY > absX && absY > absZ) {
    // Up or Down
    return cNormal.set(0, Math.sign(normal.y), 0)
  } else {
    // North or South
    return cNormal.set(0, 0, Math.sign(normal.z))
  }
}



