# Architecture

## Client

The browser facing website @ supaverse.xyz

- Connects to turso
- Handles auth
- Serves land lists and stuff like that
- Has an admin interface

## Controller

- A simple node server
- Listens for websocket requests to land
  - If no servers are simulating land it gets one to set it up first
  - Replays the websocket request on that server

## Server

- One or more node servers that simulate lands
- Many different lands all run on a single server (its about concurrent users not lands)
- Listens for controller to simulate land
  - Creates land instance
  - Fetches all items on the land
  - Responds to say its ready
- Listens for websocket requests to land
  - Connect them to the land instance
- Runs land instances
  - ...

## Database

- Turso hosted in same region

## Storage

- R2 stores all assets as hashed filenames for immutability
- Could end up using Bunny.net for faster distribution

---

## Scaling

- Client likely won't need to scale but when it does we can scale horizontally easily
- Controller won't need to scale but if it does it should scale vertically as its easier to manage
- Servers can scale vertically for a long time but later we can support multiple with ease

---

## Costs

- Client is like $5/mo
- Controller is like $5/mo
- Server is like $30/mo and should handle 300-1000 concurrent users
- R2 is $30/mo for 2 TB
- Turso is like $9/mo
- Total = $79 to run a metaverse

---

## Thinking

- avatars
  - spawned by a client and continually sent updates to all other clients
  - interpolates transform
  - transitions motion
  - swaps vrm
  - plays emotes
  - when the client that spawned it leaves, the avatar does to
- items
  - created in the space by a client OR spawned into a space from clients inventory
  - create only succeeds if space allows client to build
  - spawn only succeeds if space allows client to build (permanent) or play (temporary)
  -

## Networking

- server sends initial snapshot of entities
- server continually sends targeted updates directly to entities
- client updates entities every tick

  - remote avatars interpolate pos/rot/motion
  - local avatars receive input and broadcast back to server
  - items transition edit mode, node changes, movement, scripts

- when you connect the server sends an initial snapshot
  - avatars
    - id: websocket client id number
    - vrm: url of the vrm
    - motion: walk, run, fly, jump etc
    - pos: the world position
    - rot: the Y world rotation
    - remote logic
      - handle add/modify/rm events from server
      - interpolate pos/rot/motion
    - local logic
      - send add/modify/rm events to server
      - snap post/rot based on input
      - interpolate motion
  - items
    - id: item uuid
    - nodes[]: hierarchy of nodes eg model, place, script, etc
    - pos: world position
    - rot: world rotation
    - editing: whether its in edit mode
    - remote logic
      - handle add/modify/rm events from server
      - interpolate pos/rot
      - when editing reset nodes and stop scripts
      - when not editing run sripts
    - local logic
      - send add/modify/rm events to server
      - snap post/rot
      - run scripts when not editing

## Entity

- id: client or server generated id eg {clientId}\_{++idCounter}
- authority: the clientId that has authority over an entity
- creator: the clientId that created it

## Ownership/Authority

- avatars
  - client spawns his own avatar entity
  - client is authority
  - client is creator
  - flag `CREATOR_DESPAWN` means when the creator disconnects the avatar despawns
  - flag `AUTHORITY_LOCK` means the server will never reassign authority based on client performance and nobody can take authority
- prototype

  - client spawns an entity in a space that allows them to create prototypes (they own the space or have permission)
  - client is authority
  - client is creator
  - client is editing
  - creator can add `OTHERS_EDIT` flag to allow other people to edit
    - if client edits they take authority too
  - creator can add
  - when owner disconnects the entity stays because it doesn't have an `OWNER_DESPAWN` flag
  - when someone edits the prototype they take authority

  - the server will change authority
  - (somehow) when someone edits the prototype they take authority
  - (somehow) server does not remove automatically

## Permissions

- avatars
  - each client is allowed to spawn one avatar in any space
  - they are the only one that can control it
  - it despawns when the client disconnects
- prototypes
  - clients can `right-click > create` prototypes when:
    - the space has no owner
    - they own the space
    - they have the create permission
  - clients can `right-click > edit` a prototype:

## Actions

- spawn an avatar
- edit an avatar (vrm etc)
- inspect an avatar (name, pfp, badges, ens, bio, owned-spaces, fave-spaces, (un)friend, current-space, dms)
  - name / .eth
  - pfp + verified nft?
  - vrm + verified nft?
- trade with an avatar
- (un)friend an avatar
- mute/unmute an avatar
- kick an avatar
- ban an avatar
- permission an avatar (toggle permissions)

- spawn a new prototype
- inspect a prototype
- edit a prototype
- move a prototype
- destroy a prototype

- spawn an item from inventory
- inspect an item
- move an item
- return an item

## Entity

- id
  - the networked id of the entity
  - if client creates an entity it is {clientId}\_{++ids}
  - if server create it is 0\_{++ids}
- position/quaternion
  - the transform of the entity
  - when inactive (editing or moving) nodes are relative to this transform
  - when active nodes are relative to this transform but in world space
- nodes[]
  - array of things
  - model, image, text, audio etc
- state{}
  - synced state of the entity
- tags[]
  - ???

## Connecting

- client connects to server
- server sends snapshot
- client preloads important entities
- client spawns avatar
  - id: {client}\_{++ids}
  - owner: clientId
  - authority: clientId
  - nodes[avatar,script]
  - state{userId,position,quaternion,motion,emote}
  - tags[despawn_with_owner,lock_authority]
    - despawn_with_owner: when the owner disconnects also despawn this entity
    - lock_authority: dont allow any authority changes
- client loads remaining entities

## Prototype

- right click > create
- client spawns prototype
  - id: {client}\_{++ids}
  - owner: client
  - authority: client
  - nodes[]
  - state{}
  - ## tags[]

========================================================================================================================

## P

## Unowned Spaces

When a new space is created, global permissions are set to:

- space
  - leader: no
  - meta: no
- prototype
  - create: yes
  - edit: yes
  - move: yes
  - destroy: yes
- item
  - spawn: yes
  - move: yes
  - return: yes
- avatar
  - voice: yes
  - mute: no
  - kick: no
  - ban: no

Since there is no owner, global permissions are perpetual for everyone

## Owned Space

When someone claims a space the global permissions are set to:

- space
  - leader: no (cannot be enabled globally)
  - meta: no (cannot be enabled globally)
- prototype
  - create: no
  - edit: no
  - move: no
  - destroy: no
- item
  - spawn: no
  - move: no
  - return: no
- avatar
  - voice: yes
  - mute: no
  - kick: no
  - ban: no

Since there is an owner, they can change global permissions and permissions for each avatar

## Permission Logic

- space
  - leader
    - gives you all permissions AND the ability to change global and per-avatar permissions
    - this can only be toggled by an owner at the user level
  - meta
    - allows you to change the space title and image
- prototype
  - create
    - allows you to spawn new prototypes
    - since it is your prototype you can also edit, move and destroy it
    - if this permission is taken away, existing prototypes that you created can no longer be edited, moved or destroyed by you
  - edit
    - allows you to edit other peoples prototypes
    - note that you can only edit when a prototype isn't being edited by someone else
  - move
    - allows you to move other peoples prototypes
    - note that you can only move when a prototype isn't being edited by someone else
  - destroy
    - allows you to destroy other peoples prototypes
    - note that you can only destroy when a prototype isn't being edited by someone else
- item
  - spawn
    - allows you to spawn items from your inventory
    - since it is yours you can also move and return it
    - if this permission is taken away, all of your spawned items are returned to you
  - move
    - allows you to move other peoples items
  - return
    - allows you to return other peoples items
- avatar
  - voice
    - allows you to use voice chat
  - mute
    - allows you to mute and unmute other avatars (but not people that can also mute)
  - kick
    - allows you to kick avatars from the space (but not people that can also kick)
  - ban
    - allows you to ban avatars from the space (but not people that can also ban)

## Action Logic

In addition to permissions, everyone can also do the following:

- prototype
  - inspect
    - see who created a prototype and when
- item
  - inspect
    - see who forged the item and when
- avatar
  - inspect
    - see name/ens, badges
  - trade
    - open a trade window to trade items

================

## Roles

Each space has an "Everyone" role that cannot be removed and is assigned to everyone that visits the space.
Each space also has an "Owner" role that cannot be removed and is given to the person that claims a space. It cannot be removed or given to anyone else.

## Unowned Spaces

Everyone

- space
  - meta: no
- prototype
  - create: yes
  - edit: yes
  - move: yes
  - destroy: yes
- item
  - spawn: yes
  - move: yes
  - return: yes
- avatar
  - mute: no
  - kick: no
  - ban: no

Since there is no owner, there are no other roles and these permissions are perpetual

## Owned Space

When someone claims a space, the owner is given the Owner role and the Everyone role is updated

Owner

- space
  - meta: yes
- prototype
  - create: yes
  - edit: yes
  - move: yes
  - destroy: yes
- item
  - spawn: yes
  - move: yes
  - return: yes
- avatar - mute: yes - kick: yes - ban: yes
  Everyone
- space
  - meta: no
- prototype
  - create: no
  - edit: no
  - move: no
  - destroy: no
- item
  - spawn: no
  - move: no
  - return: no
- avatar
  - mute: no
  - kick: no
  - ban: no
