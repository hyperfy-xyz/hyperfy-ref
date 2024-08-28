import * as THREE from 'three'
import { isNumber, isBoolean } from 'lodash-es'

import { Node } from './Node'

const defaults = {
  text: 'Interact',
  distance: 3,
  duration: 0.5,
  onStart: () => {},
  onTrigger: () => {},
  onCancel: () => {},
}

export class Action extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'action'

    this.text = data.text || defaults.text
    this.distance = isNumber(data.distance) ? data.distance : defaults.distance
    this.duration = isNumber(data.duration) ? data.duration : defaults.duration
    this.onStart = data.onStart || defaults.onStart
    this.onTrigger = data.onTrigger || defaults.onTrigger
    this.onCancel = data.onCancel || defaults.onCancel

    this.worldPos = new THREE.Vector3()
    this.progress = 0
  }

  mount() {
    this.ctx.world.actions.register(this)
    this.worldPos.setFromMatrixPosition(this.matrixWorld)
  }

  commit(didMove) {
    if (didMove) {
      this.worldPos.setFromMatrixPosition(this.matrixWorld)
    }
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
    this.onTrigger = source.onTrigger
    this.onCancel = source.onCancel
    return this
  }

  getProxy() {
    var self = this
    if (!this.proxy) {
      const proxy = {
        get text() {
          return self.text
        },
        set text(value) {
          self.text = value
        },
        get distance() {
          return self.distance
        },
        set distance(value) {
          self.distance = value
        },
        get duration() {
          return self.duration
        },
        set duration(value) {
          self.duration = value
        },
        get onStart() {
          return self.onStart
        },
        set onStart(value) {
          self.onStart = value
        },
        get onTrigger() {
          return self.onTrigger
        },
        set onTrigger(value) {
          self.onTrigger = value
        },
        get onCancel() {
          return self.onCancel
        },
        set onCancel(value) {
          self.onCancel = value
        },
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
