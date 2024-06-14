import { isBoolean } from 'lodash-es'

import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Mesh extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'mesh'
    this.isMesh = true
    this.model = data.model
    this.visible = isBoolean(data.visible) ? data.visible : true
    this.collision = isBoolean(data.collision) ? data.collision : false
    this.mesh = null
    this.collider = null
  }

  mount() {
    if (this.model) {
      if (this.visible) {
        this.mesh = this.model.createMesh(this, this.matrixWorld)
      }
      if (this.collision) {
        this.collider = this.model.createCollider(this, this.matrixWorld)
      }
    }
  }

  update() {
    this.mesh?.move(this.matrixWorld)
    this.collider?.move(this.matrixWorld)
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
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
