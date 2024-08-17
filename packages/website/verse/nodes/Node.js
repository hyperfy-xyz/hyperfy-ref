import * as THREE from 'three'

import { Vector3Enhanced } from '../extras/Vector3Enhanced'

const DEFAULT_POSITION = [0, 0, 0]
const DEFAULT_QUATERNION = [0, 0, 0, 1]
const DEFAULT_SCALE = [1, 1, 1]

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _m3 = new THREE.Matrix4()

const defaultScale = new THREE.Vector3(1, 1, 1)

let nodeIds = -1

export class Node {
  constructor(data = {}) {
    this.id = data.id || ++nodeIds
    this.type = 'node'
    this.parent = null
    this.children = []
    this.ctx = null
    this.position = new Vector3Enhanced()
    this.position.fromArray(data.position || DEFAULT_POSITION)
    this.quaternion = new THREE.Quaternion()
    this.quaternion.fromArray(data.quaternion || DEFAULT_QUATERNION)
    this.rotation = new THREE.Euler().setFromQuaternion(this.quaternion)
    this.scale = new THREE.Vector3()
    this.scale.fromArray(data.scale || DEFAULT_SCALE)
    this.matrix = new THREE.Matrix4()
    this.matrixWorld = new THREE.Matrix4()
    this.position._onChange(() => {
      this.setTransformed()
    })
    this.rotation._onChange(() => {
      this.quaternion.setFromEuler(this.rotation, false)
      this.setTransformed()
    })
    this.quaternion._onChange(() => {
      this.rotation.setFromQuaternion(this.quaternion, undefined, false)
      this.setTransformed()
    })
    // this.scale._onChange?
    this.isDirty = false
    this.isTransformed = true
    this.mounted = false
  }

  setContext(ctx) {
    this.traverse(node => {
      node.ctx = ctx
    })
  }

  activate() {
    this.traverse(node => {
      if (node.mounted) return
      node.updateTransform()
      node.mounted = true
      node.mount()
    })
  }

  deactivate() {
    this.traverse(node => {
      if (!node.mounted) return
      node.unmount()
      node.mounted = false
    })
  }

  add(node) {
    if (node.parent) {
      node.parent.remove(node)
    }
    node.parent = this
    this.children.push(node)
    node.setContext(this.ctx)
    if (this.mounted) {
      node.activate()
    }
    return this
  }

  remove(node) {
    const idx = this.children.indexOf(node)
    if (idx === -1) return
    node.deactivate()
    node.parent = null
    this.children.splice(idx, 1)
    return this
  }

  // detach(node) {
  //   if (node) {
  //     const idx = this.children.indexOf(node)
  //     if (idx === -1) return
  //     this.project()
  //     node.parent = null
  //     this.children.splice(idx, 1)
  //     node.matrix.copy(node.matrixWorld)
  //     node.matrix.decompose(node.position, node.quaternion, node.scale)
  //     node.project()
  //     node.update()
  //   } else {
  //     this.parent?.detach(this)
  //   }
  // }

  setTransformed() {
    // - ensure this is marked as transformed
    // - ensure this and all descendants are dirty
    // - ensure only this node is tracked dirty
    if (this.isTransformed) return
    this.traverse(node => {
      if (node === this) {
        node.isTransformed = true
        node.setDirty()
      } else if (node.isDirty) {
        // if we come across an already dirty node we must ensure its not tracked
        // as we will clean it via this one
        this.ctx.world.entities.dirtyNodes.delete(node)
      } else {
        node.isDirty = true
      }
    })
  }

  setDirty() {
    // if we haven't mounted no track
    if (!this.mounted) return
    // if already dirty, either this or a parent is being tracked so we're good
    if (this.isDirty) return
    this.isDirty = true
    this.ctx.world.entities.dirtyNodes.add(this)
  }

  clean() {
    if (!this.isDirty) return
    let didTransform
    this.traverse(node => {
      if (node.isTransformed) {
        didTransform = true
      }
      if (didTransform) {
        node.updateTransform()
      }
      node.commit(didTransform)
      node.isDirty = false
    })
  }

  mount() {
    // called when transforms are ready and this thing should be added to the scene
  }

  commit(didTransform) {
    // called when dirty (either transform changed or node-specific)
    // if the transform changed it should be moved in the same (this.matrixWorld)
  }

  unmount() {
    // called when this thing should be removed from scene
  }

  setMode(mode) {
    // called when object changes mode, eg to disable physics when moving
  }

  updateTransform() {
    if (this.isTransformed) {
      this.matrix.compose(this.position, this.quaternion, this.scale)
      this.isTransformed = false
    }
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)
    } else {
      this.matrixWorld.copy(this.matrix)
    }
    // const children = this.children
    // for (let i = 0, l = children.length; i < l; i++) {
    //   children[i].project()
    // }
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
    this.id = source.id
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

  onPhysicsMovement = (position, quaternion) => {
    if (this.parent) {
      _m1.compose(position, quaternion, defaultScale)
      _m2.copy(this.parent.matrixWorld).invert()
      _m3.multiplyMatrices(_m2, _m1)
      _m3.decompose(this.position, this.quaternion, this.scale)
      // this.matrix.copy(_m3)
      // this.matrixWorld.copy(_m1)
    } else {
      this.position.copy(position)
      this.quaternion.copy(quaternion)
      // this.matrix.compose(this.position, this.quaternion, this.scale)
      // this.matrixWorld.copy(this.matrix)
    }
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
        get id() {
          return self.id
        },
        set id(value) {
          throw new Error('Setting ID not currently supported')
        },
        get position() {
          return self.position
        },
        set position(value) {
          throw new Error('Cannot modify node position')
        },
        get quaternion() {
          return self.quaternion
        },
        set quaternion(value) {
          throw new Error('Cannot modify node quaternion')
        },
        get rotation() {
          return self.rotation
        },
        set rotation(value) {
          throw new Error('Cannot modify node position')
        },
        get parent() {
          return self.parent?.getProxy()
        },
        set parent(value) {
          throw new Error('Cannot set parent directly')
        },
        add(pNode) {
          if (!self.ctx.entity) {
            return console.error('node has no ctx.entity')
          }
          const node = self.ctx.entity.nodes.get(pNode.id)
          self.add(node)
          return this
        },
        remove(pNode) {
          if (!self.ctx.entity) {
            return console.error('node has no ctx.entity')
          }
          const node = self.ctx.entity.nodes.get(pNode.id)
          self.remove(node)
          return this
        },
        // detach(node) {
        //   self.detach(node)
        // },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
