import * as THREE from 'three'

import { System } from './System'
import { createColliderFactory } from './extras/createColliderFactory'
import { isNumber } from 'lodash-es'

export class Composites extends System {
  constructor(world) {
    super(world)
    this.composites = new Map() // id -> Composite
    this.defaultMaterial = this.createMaterial()
  }

  insert({ geometry, material, castShadow, receiveShadow, node, matrix }) {
    const id = `${geometry.uuid}/${material.uuid}/${castShadow}/${receiveShadow}`
    if (!this.composites.has(id)) {
      const model = new Model(this.world, geometry, material, castShadow, receiveShadow)
      this.composites.set(id, model)
    }
    return this.composites.get(id).create(node, matrix)
  }

  update(delta) {
    // clean if dirty
    this.composites.forEach(composite => composite.clean())
  }

  createMaterial(options = {}) {
    const self = this
    const material = {}
    let internal
    if (options.internal) {
      internal = options.internal
    } else if (options.unlit) {
      internal = new THREE.MeshBasicMaterial({
        color: options.color || 'white',
      })
    } else {
      internal = new THREE.MeshStandardMaterial({
        color: options.color || 'white',
        metalness: isNumber(options.metalness) ? options.metalness : 0,
        roughness: isNumber(options.roughness) ? options.roughness : 1,
      })
    }
    const proxy = {
      id: internal.uuid,
      clone() {
        return self.createMaterial(options).proxy
      },
      get _ref() {
        if (world._allowMaterial) return material
      },
    }
    material.internal = internal
    material.proxy = proxy
    return material
  }
}

class Model {
  constructor(world, geometry, material, castShadow, receiveShadow) {
    this.world = world
    this.geometry = geometry
    this.material = material
    this.castShadow = castShadow
    this.receiveShadow = receiveShadow

    if (!this.geometry.boundsTree) this.geometry.computeBoundsTree()
    this.material.shadowSide = THREE.BackSide // fix csm shadow banding

    // this.mesh = mesh.clone()
    // this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    // // this.mesh.geometry.computeBoundingBox() // spatial octree
    // // this.mesh.geometry.computeBoundingSphere() // spatial octree
    // this.mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
    // this.mesh.castShadow = true
    // this.mesh.receiveShadow = true
    // this.mesh.matrixAutoUpdate = false
    // this.mesh.matrixWorldAutoUpdate = false

    this.iMesh = new THREE.InstancedMesh(this.geometry, this.material, 10)
    // this.iMesh.name = this.mesh.name
    this.iMesh.castShadow = this.castShadow
    this.iMesh.receiveShadow = this.receiveShadow
    this.iMesh.matrixAutoUpdate = false
    this.iMesh.matrixWorldAutoUpdate = false
    this.iMesh.frustumCulled = false
    this.iMesh.getEntity = this.getEntity.bind(this)
    this.items = [] // { matrix, node }
    this.dirty = true
  }

  create(node, matrix) {
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
      geometry: this.geometry,
      material: this.material,
      getEntity: () => this.items[item.idx]?.node.ctx.entity,
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
    console.warn('TODO: remove if you dont ever see this')
    return this.items[instanceId]?.node.ctx.entity
  }

  // createCollider(node, matrix, collision, collisionLayer) {
  //   if (!this.colliders) {
  //     this.colliders = createColliderFactory(this.world, this.mesh)
  //   }
  //   return this.colliders.create(node, matrix, collision, collisionLayer)
  // }

  getTriangles() {
    const geometry = this.geometry
    if (geometry.index !== null) {
      return geometry.index.count / 3
    } else {
      return geometry.attributes.position.count / 3
    }
  }
}
