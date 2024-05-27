import { System } from './System'
import { Entity } from './Entity'

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
          code: AVATAR_SCRIPT,
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
    console.log('upsertSchema', existing)
    if (existing) {
      this.instances.forEach(entity => {
        if (entity.schema.id === schema.id) {
          console.log('RESPAWN', schema)
          entity.checkMode(true) // force respawn
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
(function() {
  return entity => {
    const PUSH_RATE = 1 / 5 // 5Hz (times per second)
    const ZOOM_DISTANCE = 10 // 10m
    const ZOOM_SPEED = 6

    const o1 = new Object3D()
    const v1 = new Vector3()
    const v2 = new Vector3()
    const e1 = new Euler()
    const e2 = new Euler()
    const e3 = new Euler()
    const q1 = new Quaternion()
    const q2 = new Quaternion()
    const q3 = new Quaternion()

    return class Script {
      init() {        
        const authority = entity.isAuthority()
        if (authority) {
          this.jumpHeight = 1.5
          this.turnSpeed = 3
          this.moveSpeed = 5
          this.displacement = new Vector3(0, 0, 0)
          this.gravity = 20 // 9.81
          this.isJumping = false
          this.isGrounded = false
          this.velocity = new Vector3()
          this.hasControl = false
          this.lastPush = 0          
          this.ctrl = entity.create({
            type: 'controller',
            name: 'ctrl',
            radius: 0.4,
            height: 1,
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            color: 'red',
            position: [0, 1.8 / 2 , 0]
          })
          this.face = entity.create({
            type: 'box',
            name: 'face',
            size: [0.3,0.1,0.1],
            color: 'red',
            position: [0, 1, -0.5]
          })
          entity.add(this.ctrl)
          this.ctrl.add(this.vrm)
          this.vrm.add(this.face)

        } else {
          this.base = entity.create({
            type: 'group',
            name: 'base',
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            color: 'red',
            position: [0, 1.8 / 2 , 0]
          })
          this.face = entity.create({
            type: 'box',
            name: 'face',
            size: [0.3,0.1,0.1],
            color: 'red',
            position: [0, 1, -0.5]
          })
          entity.add(this.base)
          this.base.add(this.vrm)
          this.vrm.add(this.face)
        }
      }
      start() {
        if (entity.isAuthority()) {
          entity.requestControl()
          const control = entity.getControl()
          if (control) {
            // we can spawn facing any direction, so we need to
            // - rotate the ctrl back to zero (its always on zero)
            // - rotate the vrm by this amount instead
            // - apply the rotation to the camera
            this.vrm.rotation.y = this.ctrl.rotation.y
            this.ctrl.rotation.y = 0
            control.camera.rotation.y = this.vrm.rotation.y
            this.vrm.dirty()
            this.ctrl.dirty()
          }
        } else {
          const state = entity.getState()
          if (is(state.px)) this.base.position.x = state.px
          if (is(state.py)) this.base.position.y = state.py
          if (is(state.pz)) this.base.position.z = state.pz
          if (is(state.qx)) this.base.quaternion.x = state.qx
          if (is(state.qy)) this.base.quaternion.y = state.qy
          if (is(state.qz)) this.base.quaternion.z = state.qz
          if (is(state.qw)) this.base.quaternion.w = state.qw
          this.remotePosition = new Vector3Lerp(this.base.position, PUSH_RATE)
          this.remoteQuaternion = new QuaternionLerp(this.base.quaternion, PUSH_RATE)
          this.base.dirty()
        }
      }
      update(delta) {
        const authority = entity.isAuthority()
        if (authority) {
          const control = entity.getControl()
          this.displacement.set(0, 0, 0)
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
            this.vrm.rotation.y -= move.x * this.turnSpeed * delta
          }
          // forward/back displacement only (eg turning not strafing)
          if ((fp && !active) || (!fp && !active) || (!fp && active && !locked)) {
            this.displacement.set(0, 0, move.z).multiplyScalar(this.moveSpeed * delta)
            this.displacement.applyQuaternion(this.vrm.quaternion)
          }
          // forward/back and strafe
          else {
            this.displacement.set(move.x, 0, move.z).multiplyScalar(this.moveSpeed * delta)
            e1.copy(this.vrm.rotation)
            e1.x = 0
            e1.z = 0
            q1.setFromEuler(e1)
            this.displacement.applyQuaternion(q1)
          }
          if (this.isGrounded) {
            this.velocity.y = -this.gravity * delta
          } else {
            this.velocity.y -= this.gravity * delta
          }
          if (control?.jump && this.isGrounded) {
            this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
          }
          this.displacement.y = this.velocity.y * delta
          this.ctrl.move(this.displacement)
          this.isGrounded = this.ctrl.isGrounded()
          this.isCeiling = this.ctrl.isCeiling()
          if (this.isCeiling && this.velocity.y > 0) {
            this.velocity.y = -this.gravity * delta
          }
          const camTurn = !active
          if (camTurn) {
            // move camera based on AD
            control.camera.rotation.y -= move.x * this.turnSpeed * delta
          }
          const camAdjust = !active && moving
          if (camAdjust) {
            // slerp camera behind vrm if its not already
            control.camera.rotation.y = lerpAngle(control.camera.rotation.y, this.vrm.rotation.y, 3 * delta)
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
            control.camera.position.copy(this.ctrl.position)
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
            this.vrm.rotation.y = control.camera.rotation.y // TODO: camera rotation.y changes later so its one frame behind
          }
          // Hide VRM in first person
          // console.log(this.vrm.getParent())
          if (control && !control.look.zoom && this.vrm.getParent()) {
            console.log('hide')
            this.ctrl.remove(this.vrm)
          }
          if (control && control.look.zoom && !this.vrm.getParent()) {
            console.log('show')
            this.ctrl.add(this.vrm)
          }
          this.ctrl.dirty()
          this.vrm.dirty()
          this.lastPush += delta
          if (this.lastPush > PUSH_RATE) {
            const state = entity.getState()
            state.px = this.ctrl.position.x
            state.py = this.ctrl.position.y
            state.pz = this.ctrl.position.z
            state.qx = this.vrm.quaternion.x
            state.qy = this.vrm.quaternion.y
            state.qz = this.vrm.quaternion.z
            state.qw = this.vrm.quaternion.w
            this.lastPush = 0
          }
        } else {
          const changes = entity.getStateChanges()
          if (changes) {
            if (changes.px || changes.py || changes.pz) {
              v1.copy(this.remotePosition.current)
              if (is(changes.px)) v1.x = changes.px
              if (is(changes.py)) v1.y = changes.py
              if (is(changes.pz)) v1.z = changes.pz
              this.remotePosition.push(v1)
            }
            if (changes.qx || changes.qy || changes.qz || changes.qw) {
              q1.copy(this.remoteQuaternion.current)
              if (is(changes.qx)) q1.x = changes.qx
              if (is(changes.qy)) q1.y = changes.qy
              if (is(changes.qz)) q1.z = changes.qz
              if (is(changes.qw)) q1.w = changes.qw
              this.remoteQuaternion.push(q1)
            }            
          }
          this.remotePosition.update(delta)
          this.remoteQuaternion.update(delta)
          this.base.dirty()
        }
      }
    }

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
  
  }
})()
`
