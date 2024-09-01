import { isBoolean } from 'lodash-es'

import { System } from './System'

let ids = -1

export class Particles extends System {
  constructor(world) {
    super(world)
    this.worker = null
    this.systems = new Map() // id -> System
  }

  init() {
    this.worker = new Worker('/static/particles.js')
    this.worker.onmessage = this.onMessage
    this.worker.onerror = this.onError
  }

  update(delta) {
    this.systems.forEach(system => {
      system.node.update(delta)
    })
    // for (const system of this.systems) {
    // }
  }

  onMessage = msg => {
    msg = msg.data
    this.systems.get(msg.systemId)?.onMessage(msg)
  }

  onError = err => {
    console.error('[particles]', err)
  }

  createSystem(node, options) {
    const id = ++ids
    const system = {
      id,
      node,
      onMessage: null,
      send: (msg, transfers) => {
        msg.systemId = id
        this.worker.postMessage(msg, transfers)
      },
      destroy: () => {
        this.systems.delete(id)
        this.worker.postMessage({ op: 'destroy', systemId: id })
      },
    }
    this.systems.set(id, system)
    this.worker.postMessage({ op: 'create', id, ...options })
    return system
  }

  debug(enabled) {
    enabled = isBoolean(enabled) ? enabled : !this.isDebugging
    if (this.isDebugging === enabled) return
    this.worker.postMessage({ op: 'debug', enabled })
    this.isDebugging = enabled
  }

  destroy() {
    console.error('[particles] todo: destroy')
  }
}
