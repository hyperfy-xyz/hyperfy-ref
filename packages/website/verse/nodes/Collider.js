import { isBoolean, isNumber } from 'lodash-es'
import { Node } from './Node'
import { Layers } from '../extras/Layers'

const defaults = {
  type: 'box',
  width: 1,
  height: 1,
  depth: 1,
  radius: 0.5,
  geometry: null,
  trigger: false,
  tag: '',
  layer: 'environment',
  staticFriction: 0.6,
  dynamicFriction: 0.6,
  restitution: 0,
  onEnter: null,
  onLeave: null,
}

const types = ['box', 'sphere', 'custom']

const reservedTags = ['player']

export class Collider extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'collider'

    this.type = data.type || defaults.type
    this.width = isNumber(data.width) ? data.width : defaults.width
    this.height = isNumber(data.height) ? data.height : defaults.height
    this.depth = isNumber(data.depth) ? data.depth : defaults.depth
    this.radius = isNumber(data.radius) ? data.radius : defaults.radius
    this.geometry = data.geometry || defaults.geometry
    this.trigger = isBoolean(data.trigger) ? data.trigger : defaults.trigger
    this.tag = data.tag || defaults.tag
    this.layer = data.layer || defaults.layer
    this.staticFriction = isNumber(data.staticFriction) ? data.staticFriction : defaults.staticFriction
    this.dynamicFriction = isNumber(data.dynamicFriction) ? data.dynamicFriction : defaults.dynamicFriction
    this.restitution = isNumber(data.restitution) ? data.restitution : defaults.restitution
    this.onEnter = data.onEnter || defaults.onEnter
    this.onLeave = data.onLeave || defaults.onLeave
  }

  mount() {
    let geometry
    if (this.type === 'box') {
      geometry = new PHYSX.PxBoxGeometry(this.width / 2, this.height / 2, this.depth / 2)
    } else if (this.type === 'sphere') {
      geometry = new PHYSX.PxSphereGeometry(this.radius)
    } else if (this.type === 'custom') {
      geometry = this.geometry
    }
    const material = this.ctx.world.physics.physics.createMaterial(this.staticFriction, this.dynamicFriction, this.restitution) // prettier-ignore
    const flags = new PHYSX.PxShapeFlags()
    if (this.trigger) {
      flags.raise(PHYSX.PxShapeFlagEnum.eTRIGGER_SHAPE)
    } else {
      flags.raise(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE)
    }
    const layer = Layers[this.layer]
    const filterData = new PHYSX.PxFilterData(layer.group, layer.mask, 0, 0)
    this.shape = this.ctx.world.physics.physics.createShape(geometry, material, true, flags)
    this.shape.setQueryFilterData(filterData)
    this.shape.setSimulationFilterData(filterData)
    if (this.trigger) {
      this.shape.triggerNode = this
    } else {
      this.shape.triggerResult = { id: this.id, tag: this.tag }
    }
    this.parent?.addShape?.(this.shape)
    PHYSX.destroy(geometry)
    this.needsRebuild = false
  }

  commit(didMove) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove) {
      // ...
    }
  }

  unmount() {
    this.parent?.removeShape?.(this.shape)
    // this.shape.triggerNode = null
    // this.shape.triggerResult = null
    this.shape.release()
    this.shape = null
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.type = source.type
    this.width = source.width
    this.height = source.height
    this.depth = source.depth
    this.radius = source.radius
    this.geometry = source.geometry
    this.trigger = source.trigger
    this.tag = source.tag
    this.layer = source.layer
    this.staticFriction = source.staticFriction
    this.dynamicFriction = source.dynamicFriction
    this.restitution = source.restitution
    this.onEnter = source.onEnter
    this.onLeave = source.onLeave
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get type() {
          return self.type
        },
        set type(value) {
          if (!types.includes(value)) throw new Error(`[collider] invalid type: ${value}`)
          self.type = value
          self.needsRebuild = true
          self.setDirty()
        },
        get width() {
          return self.width
        },
        set width(value) {
          self.width = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get height() {
          return self.height
        },
        set height(value) {
          self.height = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get depth() {
          return self.depth
        },
        set depth(value) {
          self.depth = value
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setSize(width, height, depth) {
          self.width = width
          self.height = height
          self.depth = depth
          if (self.shape && self.type === 'box') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get radius() {
          return self.radius
        },
        set radius(value) {
          self.radius = value
          if (self.shape && self.type === 'sphere') {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get geometry() {
          return null // TODO: handle?
        },
        set geometry(value) {
          throw new Error('[collider] cannot set geometry')
        },
        get trigger() {
          return self.trigger
        },
        set trigger(value) {
          if (self.trigger === value) return
          self.trigger = value
          if (self.shape) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get tag() {
          return self.tag
        },
        set tag(value) {
          if (reservedTags.includes(value)) throw new Error('[collider] cannot use reserved tag:', value)
          self.tag = value || defaults.tag
        },
        get layer() {
          return self.layer
        },
        set layer(value) {
          self.layer = value
          if (self.shape) {
            // todo: we could just update the PxFilterData tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get staticFriction() {
          return self.staticFriction
        },
        set staticFriction(value) {
          self.staticFriction = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get dynamicFriction() {
          return self.dynamicFriction
        },
        set dynamicFriction(value) {
          self.dynamicFriction = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get restitution() {
          return self.restitution
        },
        set restitution(value) {
          self.restitution = value
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setMaterial(staticFriction, dynamicFriction, restitution) {
          self.staticFriction = staticFriction
          self.dynamicFriction = dynamicFriction
          self.restitution = restitution
          if (self.shape) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        set onEnter(value) {
          self.onEnter = value
        },
        set onLeave(value) {
          self.onLeave = value
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
}
