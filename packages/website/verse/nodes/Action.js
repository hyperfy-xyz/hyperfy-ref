import * as THREE from 'three'
import { isNumber, isBoolean } from 'lodash-es'

import { Node } from './Node'

const defaults = {
  text: 'Interact',
  distance: 3,
  duration: 0.5,
  onStart: () => {},
  onComplete: () => {},
  onCancel: () => {},
}

export class Action extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'action'
    this.isAction = true
    this.text = data.text || defaults.text
    this.distance = isNumber(data.distance) ? data.distance : defaults.distance
    this.duration = isNumber(data.duration) ? data.duration : defaults.duration
    this.onStart = data.onStart || defaults.onStart
    this.onComplete = data.onComplete || defaults.onComplete
    this.onCancel = data.onCancel || defaults.onCancel
    this.worldPos = new THREE.Vector3()
    this.progress = 0
  }

  mount() {
    this.ctx.world.actions.register(this)
    this.worldPos.setFromMatrixPosition(this.matrixWorld)
  }

  update() {
    this.worldPos.setFromMatrixPosition(this.matrixWorld)
  }

  unmount() {
    this.ctx.world.actions.unregister(this)
  }

  setMode(mode) {
    if (mode === 'moving') {
      // this.layer = Layers.MOVING
    } else {
      // this.layer = Layers.DEFAULT
    }
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.text = source.text
    this.distance = source.distance
    this.duration = source.duration
    this.onStart = source.onStart
    this.onComplete = source.onComplete
    this.onCancel = source.onCancel
    return this
  }

  getProxy() {
    var self = this
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
