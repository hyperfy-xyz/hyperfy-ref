# Bigger Work

- how are we gonna handle emotes for real? eg the plane having a custom sit emote scenario

# Little Work

- rename action node onComplete to onTrigger it looks much cleaner in a script

# TODO

- rename Input to Controls
- world.controls.bind()
- player controls.lookDelta -> input.lookDelta
- problem: script can't be trusted to supply camera values eg we accidentally used a quaternion=Vector3 and it went black
- cam.target can just be root values
- after flying when i move it it flickers back to start

# Input Contexts

- player registers an input context
  - uses lowest priority
  - ## defines values they will read and whether they will be captured when read
  - defines keys they want to read and whether they are captured
- player then reads from that context, eg ctx.getKeyDown()

# Next

- object scripts update
  - use a class, its feels nicer
  - uses ts + decorators for networked props, automatic rpc etc
- some objects act more like systems or are hidden by default
  - a key should be available for people with permission to locally toggle on/off
  - or at the very least you should be able to cmd+k > inspect > type to search objects by name (glb name by default but can be changed in inspector)

# ...

- shared Events enum using numbers
- use shorthand event data [event, data] instead of { event, data }
- rename entities to actors
- rename schemas to blueprints

# Color Matching

- blender color management exposure=0 is threejs toneMappingExposure=1

# Todo

- new model/script stuff
  - editing code should have a save/play/stop button
  - when you first edit it can stay running
  - but if you hit stop if stops :)

x new arch
x single vertically scaling server with api + worlds
x website that speaks to api

- hosting
  - fly.io tiny website ~$5/mo
  - fly.io perf-1 2GB-8GB ~$30-60/mo
  - R2 or Bunny storage
- ModelManager

  - models: [...Model]
  - Model
    - distances: [0, 50, 200] distances for each lod
    - meshes: [Mesh, Mesh, Mesh] meshes for each lod
    - batches: [Batch, Batch, Batch] batchs for each lod
    - item: [...Item]
  - Batch
    - distance the distance this lod kicks in
    - mesh: Mesh the mesh for this lod (when 1 active item)
    - iMesh: InstancedMesh? the instancedMesh for this lod (when >2 active items)
  - Item
    - batch the batch this item belongs to
    - idx the idx of the item in its batch
    - matrix world matrix of item

- when moving, don't instance so layers work and you can stack same-models
- fix dnd uploads for multiplayer etc
- edit window
  - change model file
  - toggle physics
  - toggle animation autoplay
  - toggle preload (load before spawn, defaults to false)
- consolidate on naming "actions" and "action wheel"
- remove create action? everything starts from drag and dropping a thing
- how can we allow drag and drop UX but still prevent people dropping dumb huge shit
- chat
  - world tab for local world chat
  - global tab for global chat (across all worlds) (NOTE: term global makes sense sense, globe=world)
  - console tab for script errors and stuff
    - gl-stats could be here etc
    - commands like `stats` show triangles, textures etc
    - commands to search, find, move, remove things etc
  - virtualized scroll window eg react-window but dynamic
- spawn
  - world settings could just have a "set current location as spawn"
- re-auth
  - support disconnect/connect without reloading
- vrm
  - set avatar + play motions + emotes
- voicechat
  - button near chat window tabs?
- backpack
  - ...
- forging
  - ...
- inspect window
  - model stats!
  - model preview + wireframe
  - nft link / proof
  - nft mint button + supply/price etc
- model not found VS crash
  - show different error model for "not found" or "crashed"
- lod suffix
  - example mesh names (all with same parent)
    - tree
    - tree_lod50
    - tree_lod100
  - when <50 meters away `tree` is used
  - when >=50 <100 `tree_lod50` is used
  - when >=100 `tree_lod100` is used
  - take scale into account
    - eg if scale 0.5,0.6,0.7
    - max is 0.7 (could also use avg)
    - 0.7 \* lod distance = real distance to swap lod
- control
  - cancel input on tab blur

## Cube Spin

```
const cube = object.get('Cube')

object.on('update', delta => {
  cube.rotation.y += 1 * delta
  cube.dirty()
})
```

## Mill (Blades Spinning)

```
const blades = object.get('MillBlades')

object.on('update', delta => {
  blades.rotation.y += 0.2 * delta
  blades.dirty()
})
```

## Tree Choppable

```jsx
const trunk = object.get('trunk')
const leaves = object.get('leaves')
const stump = object.get('stump')
const action = object.create({
  type: 'action',
  text: 'Chop',
  onComplete() {
    object.remove(trunk)
    object.remove(leaves)
    stump.setVisible(true)
    object.remove(action)
  },
})
action.position.y = 1
object.add(action)
```
