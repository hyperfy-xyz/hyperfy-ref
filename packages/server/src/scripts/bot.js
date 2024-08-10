function wrapRawCode(code) {
  return `(function() {
return object => {
    ${code}
}
})()`
}

const js = String.raw

export const botScriptRaw = js`
  const v1 = new Vector3()
  const q1 = new Quaternion()

  const actions = [
    {
      emote: 'avatar@idle.glb',
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'avatar@walk.glb',
      dir: true,
      move: true,
    },
    {
      emote: 'stretch.glb',
      time: 3,
    },
    {
      emote: 'wave.glb',
      time: 2,
    },
    {
      emote: 'sit.glb',
    },
    {
      emote: 'kneel.glb',
    },
    {
      emote: 'dance.glb',
    },
    {
      emote: 'dance2.glb',
    },
    {
      emote: 'clap.glb',
    },
    {
      emote: 'cheer.glb',
    },
    {
      emote: 'lotus.glb',
    },
  ]
  
  const GRAVITY = 9.81

  let action 
  let direction = new Vector3()

  const ctrl = object.create({
    type: 'controller',
    name: 'ctrl',
    radius: 0.4,
    height: 1,
  })
  object.add(ctrl)
  
  const vrm = object.get('vrm')
  vrm.rotation.reorder('YXZ')
  ctrl.add(vrm)

  function setNextAction(forceQuat) {
    const act = actions[num(0, actions.length - 1)]
    action = { ...act }
    if (!action.time) {
      action.time = num(1, 3, 2)
    }
    if (forceQuat) {
      direction.set(0, 0, -1).applyQuaternion(forceQuat)
      vrm.quaternion.copy(forceQuat)
    } else if (action.dir) {
      const rotation = num(0, 360) * DEG2RAD
      vrm.rotation.set(0, rotation, 0, 'YXZ')
      direction.set(0, 0, -1).applyQuaternion(vrm.quaternion)
    }
  }


  object.on('mount', () => {
    ctrl.detach()
    vrm.quaternion.copy(ctrl.quaternion)
    ctrl.quaternion.set(0, 0, 0, 1)
    setNextAction(vrm.quaternion) // start in vrm direction
    ctrl.dirty()
    vrm.dirty()
  })

  object.on('update', delta => {
    vrm.setEmote(action.emote)
    const displacement = v1.set(0, 0, 0)
    if (action.move) {
      displacement.copy(direction).multiplyScalar(delta * 2)
    }
    displacement.y -= GRAVITY * delta
    ctrl.move(displacement)
    action.time -= delta
    if (action.time <= 0) {
      setNextAction()
    }
    ctrl.dirty()
    vrm.dirty()
  })
`

export const botScriptCompiled = wrapRawCode(botScriptRaw)
