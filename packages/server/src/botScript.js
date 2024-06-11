function wrapRawCode(code) {
  return `(function() {
return object => {
    ${code}
}
})()`
}

export const botScriptRaw = `
  const v1 = new Vector3()
  const e1 = new Euler()
  const q1 = new Quaternion()

  const emotes = [
    'avatar@idle.glb',
    'avatar@walk.glb',
    'cheer.glb',
    'clap.glb',
    'dance.glb',
    'dance2.glb',
    'kneel.glb',
    'lotus.glb',
    'pray.glb',
    'sit.glb',
    'stretch.glb',
    'wave.glb',
  ]

  let ctrl
  let vrm
  let emote
  let direction = new Vector3()
  let directionTime = 0
  let directionMax = 0

  object.on('setup', () => {
    ctrl = object.create({
      type: 'controller',
      name: 'ctrl',
      radius: 0.4,
      height: 1,
    })
    object.add(ctrl)
    vrm = object.get('vrm')
    ctrl.add(vrm)
  })

  object.on('start', () => {
    ctrl.detach()
    ctrl.quaternion.set(0, 0, 0, 1)
    emote = 'avatar@walk.glb' // emotes[num(0, emotes.length-1)]
  })

  object.on('update', delta => {
    vrm.setEmote(emote)
    directionTime += delta
    if (directionTime >= directionMax) {
      directionTime = 0
      directionMax = num(1, 4, 2)
      const rotation = num(0, 360) * DEG2RAD
      vrm.rotation.set(0, rotation, 0, 'YXZ')
      direction.set(0, 0, -1).applyQuaternion(vrm.quaternion)
    }
    const move = v1.copy(direction).multiplyScalar(delta * 2)
    ctrl.move(move)
    ctrl.dirty()
    vrm.dirty()
  })
`

export const botScriptCompiled = wrapRawCode(botScriptRaw)
