import * as THREE from 'three'

const DEFAULT_POSITION = [0, 0, 0]
const DEFAULT_QUATERNION = [0, 0, 0, 1]
const DEFAULT_SCALE = [1, 1, 1]

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

export class Node {
  constructor(entity, data) {
    this.entity = entity
    this.world = entity.world
    this.type = data.type
    this.name = data.name
    this.parent = null
    this.children = []
    this.position = new THREE.Vector3()
    this.rotation = new THREE.Euler()
    this.quaternion = new THREE.Quaternion()
    this.scale = new THREE.Vector3()
    this.rotation._onChange(() => {
      this.quaternion.setFromEuler(this.rotation, false)
    })
    this.quaternion._onChange(() => {
      this.rotation.setFromQuaternion(this.quaternion, undefined, false)
    })
    this.position.fromArray(data.position || DEFAULT_POSITION)
    this.quaternion.fromArray(data.quaternion || DEFAULT_QUATERNION)
    this.scale.fromArray(data.scale || DEFAULT_SCALE)
    this.matrix = new THREE.Matrix4()
    this.matrixWorld = new THREE.Matrix4()
    this.isDirty = true
    this.mounted = false
  }

  add(node) {
    if (node.parent) {
      node.parent.remove(node)
    }
    node.parent = this
    this.children.push(node)
    if (this.mounted) {
      node.project()
      node.traverse(node => {
        node.mounted = true
        node.mount()
      })
    }
    return this
  }

  remove(node) {
    const idx = this.children.indexOf(node)
    if (idx === -1) return
    node.traverse(node => {
      node.mounted = false
      node.unmount()
    })
    node.parent = null
    this.children.splice(idx, 1)
    return this
  }

  detach(node) {
    if (node) {
      const idx = this.children.indexOf(node)
      if (idx === -1) return
      this.project()
      node.parent = null
      this.children.splice(idx, 1)
      node.matrix.copy(node.matrixWorld)
      node.matrix.decompose(node.position, node.quaternion, node.scale)
      node.project()
      node.update()
    } else {
      this.parent?.detach(this)
    }
  }

  dirty() {
    // TODO:
    this.isDirty = true
    this.world.entities.dirtyNodes.push(this)
  }

  apply() {
    if (!this.isDirty) return
    let curr = this
    let highestDirty = null
    while (curr.parent !== null) {
      if (curr.isDirty) {
        highestDirty = curr
      }
      curr = curr.parent
    }
    if (curr.isDirty) {
      highestDirty = curr
    }
    highestDirty.project()
    highestDirty.traverse(node => {
      node.update()
    })
  }

  mount() {
    // ...
  }

  update() {
    // ...
  }

  unmount() {
    // ...
  }

  project() {
    if (this.isDirty) {
      this.matrix.compose(this.position, this.quaternion, this.scale)
      this.isDirty = false
    }
    if (!this.parent) {
      this.matrixWorld.copy(this.matrix)
    } else {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)
    }
    const children = this.children
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].project()
    }
  }

  traverse(callback) {
    callback(this)
    const children = this.children
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback)
    }
  }

  setMode(mode) {
    // ...
  }

  getWorldPosition(vec3 = _v1) {
    this.matrixWorld.decompose(vec3, _q1, _v2)
    return vec3
  }

  getStats() {
    return null
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      const proxy = {
        name: self.name,
        position: self.position,
        rotation: self.rotation,
        quaternion: self.quaternion,
        dirty() {
          self.dirty()
        },
        add(pNode) {
          const node = self.entity.nodes.get(pNode.name)
          self.add(node)
          return this
        },
        remove(pNode) {
          const node = self.entity.nodes.get(pNode.name)
          self.remove(node)
          return this
        },
        getParent() {
          return self.parent?.getProxy()
        },
        detach(node) {
          self.detach(node)
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
