import { System } from './System'
import { Entity } from './Entity'

import { wrapRawCode } from '@/utils/wrapRawCode'

export class Entities extends System {
  constructor(space) {
    super(space)
    this.schemas = new Map()
    this.instances = new Map()
    this.dirtyNodes = []
    this.activeEntities = new Set()
  }

  init() {
    // register the globally shared avatar schema
    this.upsertSchema({
      id: '$avatar',
      type: 'avatar',
      nodes: [
        {
          type: 'script',
          name: 'avatar',
          raw: AVATAR_SCRIPT,
          code: wrapRawCode(AVATAR_SCRIPT),
        },
      ],
    })
  }

  upsertSchema(schema) {
    let existing = this.schemas.get(schema.id)
    if (existing) {
      for (const key in schema) {
        existing[key] = schema[key]
      }
    } else {
      this.schemas.set(schema.id, schema)
    }
    if (existing) {
      this.instances.forEach(entity => {
        if (entity.schema.id === schema.id) {
          // force respawn
          entity.checkMode(true)
        }
      })
    }
    return schema
  }

  upsertSchemaLocal(schema) {
    this.upsertSchema(schema)
    this.space.network.pushSchema(schema)
    return schema
  }

  getSchema(id) {
    return this.schemas.get(id)
  }

  addInstance(data) {
    const entity = new Entity(this.space, data)
    this.instances.set(entity.id, entity)
    return entity
  }

  addInstanceLocal(data) {
    const entity = this.addInstance(data)
    this.space.network.pushEntityUpdate(data.id, update => {
      update.add = data
    })
    return entity
  }

  getInstance(id) {
    return this.instances.get(id)
  }

  removeInstance(id) {
    const entity = this.instances.get(id)
    this.space.panels.onEntityRemoved(entity)
    entity.destroy() // todo: cleanup
    this.instances.delete(id)
  }

  removeInstanceLocal(id) {
    this.removeInstance(id)
    this.space.network.pushEntityUpdate(id, update => {
      update.remove = true
    })
  }

  countInstancesBySchema(id) {
    let n = 0
    this.instances.forEach(entity => {
      if (entity.schema.id === id) n++
    })
    return n
  }

  incActive(entity) {
    if (!entity._activeCount) {
      entity._activeCount = 0
    }
    entity._activeCount++
    this.activeEntities.add(entity)
  }

  decActive(entity, force) {
    entity._activeCount--
    if (force) entity._activeCount = 0
    if (entity._activeCount <= 0) {
      this.activeEntities.delete(entity)
    }
  }

  update(delta) {
    while (this.dirtyNodes.length) {
      this.dirtyNodes.pop().apply()
    }
    for (const entity of this.activeEntities) {
      entity.update(delta)
    }
  }

  fixedUpdate(delta) {
    for (const entity of this.activeEntities) {
      entity.fixedUpdate(delta)
    }
  }

  lateUpdate(delta) {
    for (const entity of this.activeEntities) {
      entity.lateUpdate(delta)
    }
  }

  log(...args) {
    console.log('[items]', ...args)
  }
}

const AVATAR_SCRIPT = `
const o1 = new Object3D()
const v1 = new Vector3()
const v2 = new Vector3()
const e1 = new Euler()
const e2 = new Euler()
const e3 = new Euler()
const q1 = new Quaternion()
const q2 = new Quaternion()
const q3 = new Quaternion()

const PUSH_RATE = 1 / 5 // 5Hz (times per second)
const ZOOM_DISTANCE = 10 // 10m
const ZOOM_SPEED = 6

const jumpHeight = 1.5
const turnSpeed = 3
const moveSpeed = 5
const displacement = new Vector3(0, 0, 0)
const gravity = 20 // 9.81

let isJumping = false
let isGrounded = false
let isCeiling = false
let velocity = new Vector3()
let hasControl = false
let lastPush = 0

let base
let ctrl
let vrm
let face

let remotePosition
let remoteQuaternion

object.on('setup', () => {
  const authority = object.isAuthority()
  if (authority) {
    ctrl = object.create({
      type: 'controller',
      name: 'ctrl',
      radius: 0.4,
      height: 1,
    })
    vrm = object.create({
      type: 'box',
      name: 'vrm',
      size: [1, 1.8, 1],
      color: 'red',
      position: [0, 1.8 / 2 , 0]
    })
    face = object.create({
      type: 'box',
      name: 'face',
      size: [0.3,0.1,0.1],
      color: 'red',
      position: [0, 1, -0.5]
    })
    object.add(ctrl)
    ctrl.add(vrm)
    vrm.add(face)
  } else {
    base = object.create({
      type: 'group',
      name: 'base',
    })
    vrm = object.create({
      type: 'box',
      name: 'vrm',
      size: [1, 1.8, 1],
      color: 'red',
      position: [0, 1.8 / 2 , 0]
    })
    face = object.create({
      type: 'box',
      name: 'face',
      size: [0.3,0.1,0.1],
      color: 'red',
      position: [0, 1, -0.5]
    })
    object.add(base)
    base.add(vrm)
    vrm.add(face)
  }
})

object.on('start', () => {
  console.log('START-1')
  if (object.isAuthority()) {
    object.requestControl()
    const control = object.getControl()
    if (control) {
      // we can spawn facing any direction, so we need to
      // - rotate the ctrl back to zero (its always on zero)
      // - rotate the vrm by this amount instead
      // - apply the rotation to the camera
      vrm.rotation.y = ctrl.rotation.y
      ctrl.rotation.y = 0
      control.camera.rotation.y = vrm.rotation.y
      vrm.dirty()
      ctrl.dirty()
    }
  } else {
    const state = object.getState()
    if (is(state.px)) base.position.x = state.px
    if (is(state.py)) base.position.y = state.py
    if (is(state.pz)) base.position.z = state.pz
    if (is(state.qx)) base.quaternion.x = state.qx
    if (is(state.qy)) base.quaternion.y = state.qy
    if (is(state.qz)) base.quaternion.z = state.qz
    if (is(state.qw)) base.quaternion.w = state.qw
    remotePosition = new Vector3Lerp(base.position, PUSH_RATE)
    remoteQuaternion = new QuaternionLerp(base.quaternion, PUSH_RATE)
    base.dirty()
  }
  
})

object.on('update', delta => {
  const authority = object.isAuthority()
  if (authority) {
    const control = object.getControl()
    displacement.set(0, 0, 0)
    // movement is either:
    // a) no mouse down = WS forward/back relative to vrm direction + AD to turn left/right + camera constantly tries to stay behind
    // b) left mouse down = WS forward/back relative to vrm direction + AD to turn left/right
    // c) right mouse down = WS forward/back relative to camera direction + AD strafe left/right
    const fp = control && control.look.zoom === 0
    const active = control && control.look.active
    const locked = control.look.locked
    const advance = control.look.advance
    const move = v1.copy(control.move)
    if (advance) move.z = -1
    const moving = move.x || move.z
    const looking = control.look.rotation.x || control.look.rotation.y
    const a = control && !control.look.active
    const b = control && control.look.active && !control.look.locked
    const c = control && control.look.active && control.look.locked 
    // AD swivel left and right?
    if (!active || (active && !locked)) {
      vrm.rotation.y -= move.x * turnSpeed * delta
    }
    // forward/back displacement only (eg turning not strafing)
    if ((fp && !active) || (!fp && !active) || (!fp && active && !locked)) {
      displacement.set(0, 0, move.z).multiplyScalar(moveSpeed * delta)
      displacement.applyQuaternion(vrm.quaternion)
    }
    // forward/back and strafe
    else {
      displacement.set(move.x, 0, move.z).multiplyScalar(moveSpeed * delta)
      e1.copy(vrm.rotation)
      e1.x = 0
      e1.z = 0
      q1.setFromEuler(e1)
      displacement.applyQuaternion(q1)
    }
    if (isGrounded) {
      velocity.y = -gravity * delta
    } else {
      velocity.y -= gravity * delta
    }
    if (control?.jump && isGrounded) {
      velocity.y = Math.sqrt(2 * gravity * jumpHeight)
    }
    displacement.y = velocity.y * delta
    ctrl.move(displacement)
    isGrounded = ctrl.isGrounded()
    isCeiling = ctrl.isCeiling()
    if (isCeiling && velocity.y > 0) {
      velocity.y = -gravity * delta
    }
    const camTurn = !active
    if (camTurn) {
      // move camera based on AD
      control.camera.rotation.y -= move.x * turnSpeed * delta
    }
    const camAdjust = !active && moving
    if (camAdjust) {
      // slerp camera behind vrm if its not already
      control.camera.rotation.y = lerpAngle(control.camera.rotation.y, vrm.rotation.y, 3 * delta)
      // camera too high? slerp down to 20 deg
      if (control.camera.rotation.x * RAD2DEG < -20) {
        control.camera.rotation.x = lerpAngle(control.camera.rotation.x, -20 * DEG2RAD, 3 * delta)
      }
      // camera too low? slerp back to 0
      if (control.camera.rotation.x * RAD2DEG > 0) {
        control.camera.rotation.x = lerpAngle(control.camera.rotation.x, 0 * DEG2RAD, 6 * delta)
      }
    }
    if (control) {
      control.camera.position.copy(ctrl.position)
      control.camera.position.y += 1.8

      const from = control.camera.distance
      const to = control.look.zoom * ZOOM_DISTANCE
      const alpha = ZOOM_SPEED * delta
      control.camera.distance += (to - from) * alpha // Vector3.lerp unit

      control.camera.rotation.y += control.look.rotation.y
      control.camera.rotation.x += control.look.rotation.x
      control.look.rotation.set(0, 0, 0) // reset
    }
    // VRM always face camera direction?
    if (fp || (locked && (moving || looking))) {
      vrm.rotation.y = control.camera.rotation.y // TODO: camera rotation.y changes later so its one frame behind
    }
    // Hide VRM in first person
    // console.log(vrm.getParent())
    if (control && !control.look.zoom && vrm.getParent()) {
      ctrl.remove(vrm)
    }
    if (control && control.look.zoom && !vrm.getParent()) {
      ctrl.add(vrm)
    }
    ctrl.dirty()
    vrm.dirty()
    lastPush += delta
    if (lastPush > PUSH_RATE) {
      const state = object.getState()
      state.px = ctrl.position.x
      state.py = ctrl.position.y
      state.pz = ctrl.position.z
      state.qx = vrm.quaternion.x
      state.qy = vrm.quaternion.y
      state.qz = vrm.quaternion.z
      state.qw = vrm.quaternion.w
      lastPush = 0
    }
  } else {
    const changes = object.getStateChanges()
    if (changes) {
      if (changes.px || changes.py || changes.pz) {
        v1.copy(remotePosition.current)
        if (is(changes.px)) v1.x = changes.px
        if (is(changes.py)) v1.y = changes.py
        if (is(changes.pz)) v1.z = changes.pz
        remotePosition.push(v1)
      }
      if (changes.qx || changes.qy || changes.qz || changes.qw) {
        q1.copy(remoteQuaternion.current)
        if (is(changes.qx)) q1.x = changes.qx
        if (is(changes.qy)) q1.y = changes.qy
        if (is(changes.qz)) q1.z = changes.qz
        if (is(changes.qw)) q1.w = changes.qw
        remoteQuaternion.push(q1)
      }            
    }
    remotePosition.update(delta)
    remoteQuaternion.update(delta)
    base.dirty()
  }
})

function lerpAngle(startAngle, endAngle, t) {  
  let difference = (endAngle - startAngle) % (2 * Math.PI);
  if (difference > Math.PI) difference -= 2 * Math.PI;
  if (difference < -Math.PI) difference += 2 * Math.PI;  
  let interpolatedAngle = startAngle + difference * t;
  return interpolatedAngle;
}

function is(value) {
  return value !== undefined
}
`
