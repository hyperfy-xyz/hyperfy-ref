import * as THREE from 'three'
import { System } from './System'

const v1 = new THREE.Vector3()

const BATCH_SIZE = 1000

export class Models extends System {
  constructor(world) {
    super(world)
    this.scene = null
    this.camera = null
    this.models = new Set()
    this.items = [] // { model, lod, idx, matrix }
    this.cursor = 0
  }

  start() {
    this.scene = this.world.graphics.scene
    this.camera = this.world.graphics.cameraRig
  }

  create(lods) {
    // lods = [...{ mesh, maxDistance }]
    const model = new Model(this, lods)
    this.models.add(model)
    return model
  }

  update() {
    // check if lods need to switch (batched over multiple frames)
    const size = Math.min(this.items.length, BATCH_SIZE)
    for (let i = 0; i < size; i++) {
      const idx = (this.cursor + i) % this.items.length
      const item = this.items[idx]
      if (!item) continue
      item.lod.check(item)
    }
    if (size) {
      this.cursor = (this.cursor + size) % this.items.length
    }

    // model dirty checks
    for (const model of this.models) {
      for (const lod of model.lods) {
        lod.clean()
      }
    }
  }
}

class Model {
  constructor(manager, lods) {
    this.manager = manager
    this.lods = lods.map(lod => new LOD(this, lod.mesh, lod.maxDistance)) // todo: ensure lods are ordered maxDistance ascending
    this.items = []
  }

  findLod(distance) {
    return this.lods.find(lod => distance <= lod.maxDistance)
  }

  add(node, matrix) {
    const cameraPos = this.manager.camera.position
    const itemPos = v1.set(matrix.elements[12], matrix.elements[13], matrix.elements[14]) // prettier-ignore
    const distance = cameraPos.distanceTo(itemPos)
    const lod = this.findLod(distance)
    const item = {
      node,
      model: this,
      lod: null,
      idx: null,
      matrix: matrix.clone(),
    }
    lod.add(item)
    this.manager.items.push(item)
    return item
  }

  move(item, matrix) {
    item.lod.move(item, matrix)
  }

  remove(item) {
    item.lod.remove(item)
    const idx = this.manager.items.indexOf(item)
    this.manager.items.splice(idx, 1)
  }
}

class LOD {
  constructor(model, mesh, maxDistance) {
    this.model = model
    this.mesh = mesh.clone()
    this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.maxDistance = maxDistance
    this.iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 10)
    this.iMesh.name = this.mesh.name
    this.iMesh.castShadow = true
    this.iMesh.receiveShadow = true
    this.iMesh._lod = this
    this.items = []
  }

  add(item) {
    if (item.lod) {
      item.lod.remove(item)
    }
    item.lod = this
    item.idx = this.items.length
    this.items.push(item)
    this.iMesh.setMatrixAt(item.idx, item.matrix) // silently fails if too small, gets increased in clean()
    this.dirty = true
  }

  move(item, matrix) {
    item.matrix.copy(matrix)
    this.iMesh.setMatrixAt(item.idx, matrix)
    this.dirty = true
  }

  remove(item) {
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

  check(item) {
    const cameraPos = this.model.manager.camera.position
    const itemPos = v1.set(item.matrix.elements[12], item.matrix.elements[13], item.matrix.elements[14]) // prettier-ignore
    const distance = cameraPos.distanceTo(itemPos)
    const lod = item.model.findLod(distance)
    if (lod !== this) {
      lod.add(item) // switch lod!
    }
  }

  clean() {
    if (!this.dirty) return
    const max = this.iMesh.instanceMatrix.array.length / 16
    const count = this.items.length
    if (max < this.items.length) {
      // console.log('increase', this.mesh.name, 'from', max, 'to', count + 100)
      const oldIMesh = this.iMesh
      this.model.manager.scene.remove(oldIMesh)
      this.iMesh = new THREE.InstancedMesh(
        this.mesh.geometry,
        this.mesh.material,
        count + 100
      )
      // this.iMesh.instanceMatrix.array.set(oldIMesh.instanceMatrix.array)
      // console.time('fill', count)
      for (const item of this.items) {
        this.iMesh.setMatrixAt(item.idx, item.matrix)
      }
      // console.timeEnd('fill')
      this.iMesh.name = this.mesh.name
      this.iMesh.castShadow = true
      this.iMesh.receiveShadow = true
      this.iMesh._lod = this
    }
    this.iMesh.count = count
    if (this.iMesh.parent && !count) {
      this.model.manager.scene.remove(this.iMesh)
      this.dirty = false
      return
    }
    if (!this.iMesh.parent && count) {
      this.model.manager.scene.add(this.iMesh)
    }
    this.iMesh.instanceMatrix.needsUpdate = true
    this.iMesh.computeBoundingSphere()
    this.dirty = false
  }

  getNode(idx) {
    return this.items[idx]?.node
  }
}
