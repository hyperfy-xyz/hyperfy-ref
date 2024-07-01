import * as THREE from 'three'

import { System } from './System'
import { isBoolean } from 'lodash-es'
import { createColliderFactory } from './extras/createColliderFactory'

export class Models extends System {
  constructor(world) {
    super(world)
    this.models = new Map() // id -> Model
  }

  register(mesh) {
    const id = mesh.geometry.uuid + '/' + mesh.material.uuid
    if (this.models.has(id)) {
      return this.models.get(id)
    }
    const model = new Model(this.world, mesh)
    this.models.set(id, model)
    return model
  }

  update(delta) {
    // model clean if dirty
    this.models.forEach(model => model.clean())
  }
}

class Model {
  constructor(world, mesh) {
    this.world = world
    this.mesh = mesh.clone()
    this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    // this.mesh.geometry.computeBoundingBox() // spatial octree
    // this.mesh.geometry.computeBoundingSphere() // spatial octree
    this.mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 10)
    this.iMesh.name = this.mesh.name
    this.iMesh.castShadow = true
    this.iMesh.receiveShadow = true
    this.iMesh.matrixAutoUpdate = false
    this.iMesh.matrixWorldAutoUpdate = false
    this.iMesh.frustumCulled = false
    this.iMesh.getEntity = this.getEntity.bind(this)
    this.items = [] // { node, matrix }
    this.dirty = true
  }

  createMesh(node, matrix) {
    const item = {
      idx: this.items.length,
      node,
      matrix,
      // octree
    }
    this.items.push(item)
    this.iMesh.setMatrixAt(item.idx, item.matrix) // silently fails if too small, gets increased in clean()
    this.dirty = true
    const sItem = {
      matrix,
      geometry: this.mesh.geometry,
      material: this.mesh.material,
      getEntity: () => this.items[item.idx]?.node.entity,
    }
    this.world.spatial.octree.insert(sItem)
    return {
      move: matrix => {
        this.move(item, matrix)
        this.world.spatial.octree.move(sItem)
      },
      destroy: () => {
        this.destroy(item)
        this.world.spatial.octree.remove(sItem)
      },
    }
  }

  move(item, matrix) {
    item.matrix.copy(matrix)
    this.iMesh.setMatrixAt(item.idx, matrix)
    this.dirty = true
  }

  destroy(item) {
    const last = this.items[this.items.length - 1]
    const isOnly = this.items.length === 1
    const isLast = item === last
    if (isOnly) {
      this.items = []
      this.dirty = true
    } else if (isLast) {
      // this is the last instance in the buffer, pop it off the end
      this.items.pop()
      this.dirty = true
    } else {
      // there are other instances after this one in the buffer, swap it with the last one and pop it off the end
      this.iMesh.setMatrixAt(item.idx, last.matrix)
      last.idx = item.idx
      this.items[item.idx] = last
      this.items.pop()
      this.dirty = true
    }
  }

  clean() {
    if (!this.dirty) return
    const size = this.iMesh.instanceMatrix.array.length / 16
    const count = this.items.length
    if (size < this.items.length) {
      const newSize = count + 100
      // console.log('increase', this.mesh.name, 'from', size, 'to', newSize)
      this.iMesh.resize(newSize)
      for (let i = size; i < count; i++) {
        this.iMesh.setMatrixAt(i, this.items[i].matrix)
      }
    }
    this.iMesh.count = count
    if (this.iMesh.parent && !count) {
      this.world.graphics.scene.remove(this.iMesh)
      this.dirty = false
      return
    }
    if (!this.iMesh.parent && count) {
      this.world.graphics.scene.add(this.iMesh)
    }
    this.iMesh.instanceMatrix.needsUpdate = true
    // this.iMesh.computeBoundingSphere()
    this.dirty = false
  }

  getEntity(instanceId) {
    return this.items[instanceId]?.node.entity
  }

  createCollider(node, matrix) {
    if (!this.colliders) {
      this.colliders = createColliderFactory(this.world, this.mesh)
    }
    return this.colliders.create(node, matrix)
  }

  getTriangles() {
    const geometry = this.mesh.geometry
    if (geometry.index !== null) {
      return geometry.index.count / 3
    } else {
      return geometry.attributes.position.count / 3
    }
  }
}
