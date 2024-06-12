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
let cube

object.on('setup', () => {
  cube = object.get('cube')
})

object.on('update', delta => {
  cube.rotation.y += 1 * delta
  cube.dirty()
})
```

## Mill (Blades Spinning)

```
let blades

object.on('setup', () => {
  blades = object.get('MillBlades')
})

object.on('update', delta => {
  blades.rotation.y += 0.2 * delta
  blades.dirty()
})
```
