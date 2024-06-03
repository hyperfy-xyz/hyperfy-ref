import * as THREE from 'three'

import { System } from './System'

const m1 = new THREE.Matrix4()

export class Instances extends System {
  constructor(world) {
    super(world)
    this.groups = new Map() // mesh -> group
  }

  add(mesh, worldMatrix) {
    let group = this.groups.get(mesh)
    if (!group) {
      group = new Group(this.world, mesh)
      this.groups.set(mesh, group)
    }
    return group.create(worldMatrix)
  }
}

class Group {
  constructor(world, mesh) {
    this.world = world
    this.mesh = mesh.clone()
    this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.mesh.instanceGroup = this
    this.iMesh = null
    this.instances = []
    this.count = 0
  }

  getNode(idx = 0) {
    return this.instances[idx]?.node
  }

  create(worldMatrix) {
    return new Instance(this, worldMatrix)
  }
}

class Instance {
  constructor(group, worldMatrix) {
    this.group = group
    this.group.count++
    this.idx = this.group.count - 1
    this.group.instances[this.idx] = this

    this.log('new instance idx', this.idx)
    if (this.group.iMesh) {
      this.log('adding one to iMesh')
      this.group.iMesh.setMatrixAt(this.idx, worldMatrix)
      this.group.iMesh.count++
      this.group.iMesh.instanceMatrix.needsUpdate = true
      this.group.iMesh.computeBoundingSphere()
      // this.group.iMesh.computeBoundingBox()
      return
    }
    if (this.group.count === 1) {
      this.log('adding one as regular mesh')
      this.group.world.graphics.scene.add(this.group.mesh)
      this.group.mesh.matrix.copy(worldMatrix)
    } else {
      this.log('adding second, converting to iMesh')
      this.group.iMesh = new THREE.InstancedMesh(
        this.group.mesh.geometry,
        this.group.mesh.material,
        10000
      )
      // TODO: dynamic increase max count
      this.group.iMesh.instanceGroup = this.group
      // this.group.iMesh.frustumCulled = false
      this.group.iMesh.castShadow = true
      this.group.iMesh.receiveShadow = true
      // this.group.iMesh.matrixAutoUpdate = false
      // this.group.iMesh.matrixWorldAutoUpdate = false
      this.group.iMesh.layers.mask = this.group.mesh.layers.mask
      this.group.iMesh.setMatrixAt(0, this.group.mesh.matrix)
      this.group.iMesh.setMatrixAt(1, worldMatrix)
      this.group.iMesh.count = 2
      this.group.iMesh.instanceMatrix.needsUpdate = true
      this.group.iMesh.computeBoundingSphere()
      // this.group.iMesh.computeBoundingBox()
      this.group.world.graphics.scene.remove(this.group.mesh)
      this.group.world.graphics.scene.add(this.group.iMesh)
    }
  }

  setNode(node) {
    this.node = node
  }

  setLayer(layer) {
    this.group.mesh.layers.set(layer)
    if (this.group.iMesh) {
      this.group.iMesh.layers.set(layer)
    }
  }

  move(worldMatrix) {
    if (this.group.iMesh) {
      this.group.iMesh.setMatrixAt(this.idx, worldMatrix)
      this.group.iMesh.instanceMatrix.needsUpdate = true
      this.group.iMesh.computeBoundingSphere()
      // this.group.iMesh.computeBoundingBox()
    } else {
      this.group.mesh.matrix.copy(worldMatrix)
    }
  }

  remove() {
    if (this.group.iMesh) {
      const last = this.group.instances[this.group.instances.length - 1]
      const isOnly = this.group.instances.length === 1
      const isLast = last === this
      if (isOnly) {
        // this is the only instance, reset the iMesh
        this.group.count = 0
        this.group.instances = []
        this.group.world.graphics.scene.remove(this.group.iMesh)
        this.group.iMesh.dispose()
        this.group.iMesh = null
      } else if (isLast) {
        // this is the last instance in the buffer, pop it off the end
        this.log('remove, iMesh last')
        this.group.count--
        this.group.instances.pop()
        this.group.iMesh.count--
        this.group.iMesh.instanceMatrix.needsUpdate = true
        this.group.iMesh.computeBoundingSphere()
        // this.group.iMesh.computeBoundingBox()
      } else {
        // there are other instances after this one in the buffer, swap it with the last one and pop it off the end
        this.log('remove, iMesh !last')
        this.group.iMesh.getMatrixAt(last.idx, m1)
        this.group.iMesh.setMatrixAt(this.idx, m1)
        last.idx = this.idx
        this.group.instances[this.idx] = last
        this.group.instances.pop()
        this.group.iMesh.count--
        this.group.iMesh.instanceMatrix.needsUpdate = true
        this.group.iMesh.computeBoundingSphere()
        // this.group.iMesh.computeBoundingBox()
        this.group.count--
      }
    } else {
      this.log('remove one and only mesh')
      this.group.count = 0
      this.group.instances = []
      this.group.world.graphics.scene.remove(this.group.mesh)
    }
  }

  log(...args) {
    // console.log(`[${this.group.mesh.name}]`, ...args)
  }
}
