import { isBoolean } from 'lodash-es'

import { Node } from './Node'

const collisionTypes = ['static', 'kinematic', 'dynamic']

const defaults = {
  visible: true,
  collision: null,
  collisionLayer: 'environment',
}

export class Mesh extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'mesh'
    this.isMesh = true

    this.model = data.model

    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible

    // todo: we should validate all options because the old collision=true does weird shit now
    // its best to only set if valid
    this.collision = defaults.collision
    if (collisionTypes.includes(data.collision)) {
      this.collision = data.collision
    }
    this.collisionLayer = data.collisionLayer || defaults.collisionLayer

    this.mesh = null
    this.collider = null
  }

  mount() {
    if (this.model) {
      if (this.visible) {
        this.mesh = this.model.createMesh(this, this.matrixWorld)
      }
      if (this.collision) {
        this.collider = this.model.createCollider(this, this.matrixWorld, this.collision, this.collisionLayer)
      }
    }
  }

  commit(didTransform) {
    if (didTransform) {
      this.mesh?.move(this.matrixWorld)
      this.collider?.move(this.matrixWorld)
    }
  }

  unmount() {
    this.mesh?.destroy()
    this.collider?.destroy()
    this.mesh = null
    this.collider = null
  }

  setVisible(visible) {
    if (this.visible === visible) return
    this.visible = visible
    if (!this.mounted) return
    if (visible) {
      if (this.model) {
        this.mesh = this.model.createMesh(this, this.matrixWorld)
      }
    } else {
      this.mesh?.destroy()
      this.mesh = null
    }
  }

  setMode(mode) {
    if (mode === 'moving') {
      this.collider?.setActive(false)
    } else {
      this.collider?.setActive(true)
    }
  }

  getStats() {
    let triangles = 0
    if (this.model) {
      triangles = this.model.getTriangles()
    }
    return {
      triangles,
    }
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.model = source.model
    this.visible = source.visible
    this.collision = source.collision
    this.collisionLayer = source.collisionLayer
    return this
  }

  getProxy() {
    const self = this
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
        setVisible(visible) {
          self.setVisible(visible)
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
