const FORWARD = new Vector3(0, 0, -1)
const BACKWARD = new Vector3(0, 0, 1)
const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const LEFT = new Vector3(-1, 0, 0)
const RIGHT = new Vector3(1, 0, 0)

const LOOK_SPEED = 0.1
const ZOOM_SPEED = 2
const MIN_ZOOM = 6
const MAX_ZOOM = 100

const THROTTLE_INCREMENT = 100
const MAX_THRUST = 0.1

const _v1 = new Vector3()
const _v2 = new Vector3()
const _q1 = new Quaternion()

const networkPos = object.createNetworkProp(new Vector3())
const networkQua = object.createNetworkProp(new Quaternion())

const input = {
  lookActive: false,
  lookDelta: new Vector3(),
  zoomDelta: 0,
  accelerate: false,
  yawLeft: false,
  yawRight: false,
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
}

function clearDownInput() {
  input.accelerate = false
  input.pitchUp = false
  input.pitchDown = false
  input.rollLeft = false
  input.rollRight = false
  input.yawLeft = false
  input.yawRight = false
}

// variables
let control
let throttle = 0
let isAuthority = object.isAuthority()

// create physics body
const body = object.create({
  id: 'body',
  type: 'box',
  size: [7, 1.1, 7],
  physics: isAuthority ? 'dynamic' : 'kinematic',
  visible: false,
})
body.position.copy(object.position)
body.position.y += 1
body.rotation.copy(object.rotation)

// add seat
const seat = object.create({
  id: 'seat',
  type: 'group',
})
seat.position.z = -0.6
seat.position.y = -0.4
body.add(seat)

// move fighter to child of body so it follows
const fighter = object.get('Fighter')
fighter.position.y -= 1.5 / 2
body.add(fighter)

// create enter action
const action = object.create({
  id: 'action',
  type: 'action',
  text: 'Enter',
  onTrigger: () => enter(),
})
action.position.y = 2
action.position.z = -1
fighter.add(action)

// add body to world space
world.add(body)

function enter() {
  // take authority if needed
  if (!isAuthority) {
    object.takeAuthority()
    body.setDynamic()
    isAuthority = true
  }
  // hide enter action
  fighter.remove(action)
  // take control
  control = object.control({
    btnDown: code => {
      switch (code) {
        case 'MouseRight':
          control.lockPointer()
          input.lookActive = true
          break
        case 'Space':
          input.accelerate = true
          break
        case 'KeyW':
          input.pitchUp = true
          break
        case 'KeyS':
          input.pitchDown = true
          break
        case 'KeyA':
          input.rollLeft = true
          break
        case 'KeyD':
          input.rollRight = true
          break
        case 'KeyQ':
          input.yawLeft = true
          break
        case 'KeyE':
          input.yawRight = true
          break
        case 'KeyF':
          control.release()
          break
      }
      return true
    },
    btnUp: code => {
      switch (code) {
        case 'MouseRight':
          control.unlockPointer()
          input.lookActive = false
          break
        case 'Space':
          input.accelerate = false
          break
        case 'KeyW':
          input.pitchUp = false
          break
        case 'KeyS':
          input.pitchDown = false
          break
        case 'KeyA':
          input.rollLeft = false
          break
        case 'KeyD':
          input.rollRight = false
          break
        case 'KeyQ':
          input.yawLeft = false
          break
        case 'KeyE':
          input.yawRight = false
          break
      }
      return true
    },
    pointer: info => {
      if (input.lookActive) {
        input.lookDelta.add(info.delta)
      }
    },
    zoom: delta => {
      input.zoomDelta += delta
    },
    blur() {
      clearDownInput()
      control.unlockPointer()
    },
    release: () => {
      clearDownInput()
      leave()
    },
  })
  // activate camera
  control.camera.active = true
  // anchor ourselves
  control.setPlayerAnchor(seat, 'sit')
}

function fixedUpdate(delta) {
  const newAuthority = object.isAuthority()
  if (isAuthority !== newAuthority) {
    isAuthority = newAuthority
    if (isAuthority) {
      body.setDynamic()
    } else {
      body.setKinematic()
    }
  }
  if (isAuthority) {
    if (control) {
      // thrust
      _v1.copy(FORWARD).multiplyScalar(MAX_THRUST * throttle)
      _v1.applyQuaternion(body.quaternion)
      body.addForce(_v1)

      // yaw
      let yaw = 0
      if (input.yawLeft) yaw += 1
      if (input.yawRight) yaw -= 1
      _v1.copy(UP).multiplyScalar(yaw * 5)
      _v1.applyQuaternion(body.quaternion)
      body.addTorque(_v1)

      // pitch
      let pitch = 0
      if (input.pitchUp) pitch += 1
      if (input.pitchDown) pitch -= 1
      _v1.copy(RIGHT).multiplyScalar(pitch * 5)
      _v1.applyQuaternion(body.quaternion)
      body.addTorque(_v1)

      // roll
      let roll = 0
      if (input.rollLeft) roll -= 1
      if (input.rollRight) roll += 1
      _v1.copy(FORWARD).multiplyScalar(roll * 5)
      _v1.applyQuaternion(body.quaternion)
      body.addTorque(_v1)

      // align velocity with forward direction
      const currVelocity = body.getLinearVelocity()
      const fwdDirection = _v1.copy(FORWARD).applyQuaternion(body.quaternion)
      const projVelocity = fwdDirection.multiplyScalar(currVelocity.dot(fwdDirection)) // prettier-ignore
      const velocityCorrection = _v2.subVectors(projVelocity, currVelocity)

      // apply correction force (adjust the multiplier to control how quickly the plane aligns with its direction)
      const correctionMultiplier = 5 // You may need to adjust this value
      body.addForce(velocityCorrection.multiplyScalar(correctionMultiplier))

      // upward lift
      const lift = 0.5
      const magnitude = body.getLinearVelocity().length()
      _v1.copy(UP).multiplyScalar(magnitude * lift)
      _v1.applyQuaternion(body.quaternion)
      body.addForce(_v1)

      // apply angular damping
      const angularDamping = 0.95 // how quickly rolling stops
      const angularVelocity = body.getAngularVelocity()
      body.setAngularVelocity(angularVelocity.multiplyScalar(angularDamping))
    }
  } else {
    // ...
  }
}

function update(delta) {
  if (isAuthority) {
    if (control) {
      if (input.accelerate) {
        throttle += THROTTLE_INCREMENT * delta
      } else {
        throttle -= THROTTLE_INCREMENT * delta
      }
      throttle = clamp(throttle, 0, 100)
    }
  } else {
    // ...
  }
}

function lateUpdate(delta) {
  if (isAuthority) {
    if (control) {
      control.camera.position.copy(body.position)
      control.camera.position.y += 2
      if (input.lookActive) {
        control.camera.rotation.y += -input.lookDelta.x * LOOK_SPEED * delta
        control.camera.rotation.x += -input.lookDelta.y * LOOK_SPEED * delta
        control.camera.rotation.reorder('YXZ')
        input.lookDelta.set(0, 0, 0)
      } else {
        control.camera.quaternion.copy(body.quaternion)
      }
      control.camera.zoom += -input.zoomDelta * ZOOM_SPEED * delta
      control.camera.zoom = clamp(control.camera.zoom, MIN_ZOOM, MAX_ZOOM)
      input.zoomDelta = 0
    }
    // quantize and network transforms
    _v1.copy(body.position)
    _v1.x = parseFloat(_v1.x.toFixed(4))
    _v1.y = parseFloat(_v1.y.toFixed(4))
    _v1.z = parseFloat(_v1.z.toFixed(4))
    networkPos.value.copy(_v1)
    _q1.copy(body.quaternion)
    _q1.x = parseFloat(_q1.x.toFixed(4))
    _q1.y = parseFloat(_q1.y.toFixed(4))
    _q1.z = parseFloat(_q1.z.toFixed(4))
    _q1.w = parseFloat(_q1.w.toFixed(4))
    networkQua.value.copy(_q1)
  } else {
    body.position.lerp(networkPos.value, 6 * delta)
    body.quaternion.slerp(networkQua.value, 6 * delta)
    body.dirty()
  }
}

function leave() {
  fighter.add(action)
  control = null
}

object.on('fixedUpdate', fixedUpdate)
object.on('update', update)
object.on('lateUpdate', lateUpdate)
