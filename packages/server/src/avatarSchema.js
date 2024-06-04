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
const walkSpeed = 5
const runSpeed = 20
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
    vrm = object.get('HumanLow') // TODO
    object.add(ctrl)
    ctrl.add(vrm)
  } else {
    base = object.create({
      type: 'group',
      name: 'base',
    })
    vrm = object.get('HumanLow') // TODO
    object.add(base)
    base.add(vrm)
  }
})

object.on('start', () => {
  const authority = object.isAuthority()
  if (authority) {
    ctrl.detach()
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
      control.camera.distance = control.look.zoom * ZOOM_DISTANCE
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
    const speed = control.run ? runSpeed : walkSpeed
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
      displacement.set(0, 0, move.z).multiplyScalar(speed * delta)
      displacement.applyQuaternion(vrm.quaternion)
    }
    // forward/back and strafe
    else {
      displacement.set(move.x, 0, move.z).multiplyScalar(speed * delta)
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

export const avatarSchema = {
  id: '$avatar',
  type: 'avatar',
  model: '/static/avatar.glb',
  modelType: 'glb',
  script: wrapRawCode(AVATAR_SCRIPT),
  scriptRaw: AVATAR_SCRIPT,
}

function wrapRawCode(code) {
  return `(function() {
return object => {
    ${code}
}
})()`
}