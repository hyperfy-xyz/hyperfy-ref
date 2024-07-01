import * as THREE from 'three'

import { System } from './System'

import { generateMesh } from './libs/marching-cubes/mesh-generator'
import { generateNoiseMap } from './libs/marching-cubes/noise-map-generator'
import { createColliderFactory } from './extras/createColliderFactory'
import { editNoiseMapChunks } from './libs/marching-cubes/noise-map-editor'
import { getChunkKey } from './libs/marching-cubes/utils'
import { disposeNode } from './libs/marching-cubes/dispose-node'

export class Terrain extends System {
  constructor(world) {
    super(world)
    this.chunks = {}
    this.noiseLayers = [50, 25, 10]
    this.seed = 1
  }

  start() {
    const size = 10
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        console.time('terrain')
        const key = getChunkKey(x, z)
        const noiseMap = generateNoiseMap(
          x,
          0,
          z,
          this.noiseLayers,
          this.seed,
          false
        )
        const mesh = generateMesh(x, 0, z, { noiseMap }, true, false)
        this.world.graphics.scene.add(mesh)
        // console.log('terrain', mesh)
        console.log(
          'terrain tris:',
          mesh.geometry.attributes.position.count / 3
        )
        const matrix = mesh.matrixWorld
        // // collider
        const factory = createColliderFactory(this.world, mesh)
        const collider = factory.create(null, matrix)
        // // octree
        const sItem = {
          matrix,
          geometry: mesh.geometry,
          material: mesh.material,
          getEntity: () => {
            console.log('TODO: getEntity -> terrain')
            return null
          },
        }
        this.world.spatial.octree.insert(sItem)
        console.timeEnd('terrain')
        this.chunks[key] = {
          noiseMap,
          mesh,
          sItem,
          collider,
        }
      }
    }
  }

  paint(point, subtract) {
    console.time('paint')
    const editChunks = editNoiseMapChunks(
      this.chunks,
      point,
      subtract,
      this.noiseLayers,
      this.seed
    )
    for (const [x, z] of editChunks) {
      const key = getChunkKey(x, z)
      const chunk = this.chunks[key]

      this.world.spatial.octree.remove(chunk.sItem)
      disposeNode(chunk.mesh) // removes from scene too
      chunk.collider.destroy()

      const noiseMap = chunk.noiseMap
      const mesh = generateMesh(
        x,
        0,
        z,
        {
          noiseMap,
        },
        true,
        false
      )
      this.world.graphics.scene.add(mesh)
      chunk.mesh = mesh

      const matrix = mesh.matrixWorld

      const factory = createColliderFactory(this.world, mesh)
      const collider = factory.create(null, matrix)
      chunk.collider = collider

      const sItem = {
        matrix,
        geometry: mesh.geometry,
        material: mesh.material,
        getEntity: () => {
          console.log('TODO: getEntity -> terrain')
          return null
        },
      }
      this.world.spatial.octree.insert(sItem)
      chunk.sItem = sItem
    }
    console.timeEnd('paint')
  }
}
