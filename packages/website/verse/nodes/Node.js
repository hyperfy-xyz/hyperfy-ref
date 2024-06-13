import * as THREE from 'three'

const DEFAULT_POSITION = [0, 0, 0]
const DEFAULT_QUATERNION = [0, 0, 0, 1]
const DEFAULT_SCALE = [1, 1, 1]

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

export class Node {
  constructor(data = {}) {
    this.entity = null
    this.type = 'node'
    this.name = data.name || ''
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

  bind(entity) {
    this.project()
    this.traverse(node => {
      node.entity = entity
      node.mounted = true
      node.mount()
    })
  }

  unbind() {
    this.traverse(node => {
      if (!node.mounted) return
      node.unmount()
      node.mounted = false
      node.entity = null
    })
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
        node.entity = this.entity
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
    this.isDirty = true
    this.entity.world.entities.dirtyNodes.push(this)
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
    // called when transforms are ready and this thing should be added to the scene
  }

  update() {
    // called when transforms change and this thing should be updated in the scene
  }

  unmount() {
    // called when this thing should be removed from scene
  }

  setMode(mode) {
    // called when object changes mode, eg to disable physics when moving
  }

  project() {
    if (this.isDirty) {
      this.matrix.compose(this.position, this.quaternion, this.scale)
      this.isDirty = false
    }
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)
    } else {
      this.matrixWorld.copy(this.matrix)
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

  clone(recursive) {
    return new this.constructor().copy(this, recursive)
  }

  copy(source, recursive) {
    this.name = source.name
    this.position.copy(source.position)
    this.quaternion.copy(source.quaternion)
    this.scale.copy(source.scale)
    if (recursive) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i]
        this.add(child.clone(recursive))
      }
    }
    return this
  }

  // todo: getWorldQuaternion etc
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
