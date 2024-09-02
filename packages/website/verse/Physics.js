import * as THREE from 'three'

import { extendThreePhysX } from './extras/extendThreePhysX'

import { System } from './System'
import { Layers } from './extras/Layers'

let version
let allocator
let errorCb
let foundation

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const defaultScale = new THREE.Vector3(1, 1, 1)

const _raycastHit = {
  actor: null,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: null,
}

const _sweepHit = {
  actor: null,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: null,
}

const _overlapHit = {
  actor: null,
}

const triggerResult = {
  tag: null,
}

// const collisionMatrix = {
//   // key = group
//   // value = mask for what the group can hit
//   player: ['environment', 'object'],
//   environment: ['player', 'environment', 'object'],
//   object: ['player', 'environment', 'object'],

//   // jet wont work without this because player and object hit
//   // player: ['environment'],
//   // environment: ['player', 'environment', 'object'],
//   // object: ['environment', 'object'],
// }

export class Physics extends System {
  constructor(world) {
    super(world)
  }

  async init() {
    await loadPhysX()
    extendThreePhysX()

    this.version = version
    this.allocator = allocator
    this.errorCb = errorCb
    this.foundation = foundation
    this.tolerances = new PHYSX.PxTolerancesScale()
    this.cookingParams = new PHYSX.PxCookingParams(this.tolerances)
    this.physics = PHYSX.CreatePhysics(this.version, this.foundation, this.tolerances)
    this.defaultMaterial = this.physics.createMaterial(0.2, 0.2, 0.2)

    this.contactsResult = new ContactsResult()
    const contactPoints = new PHYSX.PxArray_PxContactPairPoint(64)
    const simulationEventCallback = new PHYSX.PxSimulationEventCallbackImpl()
    simulationEventCallback.onContact = (pairHeader, pairs, count) => {
      pairHeader = PHYSX.wrapPointer(pairHeader, PHYSX.PxContactPairHeader)
      const handle0 = this.handles.get(pairHeader.get_actors(0)?.ptr)
      const handle1 = this.handles.get(pairHeader.get_actors(1)?.ptr)
      if (!handle0 || !handle1) return
      this.contactsResult.clear()
      for (let i = 0; i < count; i++) {
        const pair = PHYSX.NativeArrayHelpers.prototype.getContactPairAt(pairs, i)
        if (pair.events.isSet(PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_FOUND)) {
          const pxContactPoints = pair.extractContacts(contactPoints.begin(), 64)
          if (pxContactPoints > 0) {
            for (let j = 0; j < pxContactPoints; j++) {
              const contact = contactPoints.get(j)
              this.contactsResult.add(contact.position, contact.normal, contact.impulse)
            }
          }
          const result = this.contactsResult.get()
          if (!handle0.contactedHandles.has(handle1)) {
            result.entityId = handle1.entityId
            result.tag = handle1.tag
            handle0.onContactStart?.(result)
            handle0.contactedHandles.add(handle1)
          }
          if (!handle1.contactedHandles.has(handle0)) {
            result.entityId = handle0.entityId
            result.tag = handle0.tag
            handle1.onContactStart?.(result)
            handle1.contactedHandles.add(handle0)
          }
        } else if (pair.events.isSet(PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_LOST)) {
          const result = this.contactsResult.get()
          if (handle0.contactedHandles.has(handle1)) {
            result.tag = handle1.tag
            handle0.onContactEnd?.(result)
            handle0.contactedHandles.delete(handle1)
          }
          if (handle1.contactedHandles.has(handle0)) {
            result.tag = handle0.tag
            handle1.onContactEnd?.(result)
            handle1.contactedHandles.delete(handle0)
          }
        }
      }
    }
    simulationEventCallback.onTrigger = (pairs, count) => {
      pairs = PHYSX.wrapPointer(pairs, PHYSX.PxTriggerPair)
      for (let i = 0; i < count; i++) {
        const pair = PHYSX.NativeArrayHelpers.prototype.getTriggerPairAt(pairs, i)
        // ignore pairs if a shape was deleted.
        // this prevents an issue where onLeave can get called after rebuilding an object that had entered a trigger
        if (
          pair.flags.isSet(PHYSX.PxTriggerPairFlagEnum.eREMOVED_SHAPE_TRIGGER) ||
          pair.flags.isSet(PHYSX.PxTriggerPairFlagEnum.eREMOVED_SHAPE_OTHER)
        ) {
          continue
        }
        const triggerHandle = this.handles.get(pair.triggerShape.getActor().ptr)
        const otherHandle = this.handles.get(pair.otherShape.getActor().ptr)
        if (!triggerHandle || !otherHandle) continue
        triggerResult.tag = otherHandle.tag
        if (pair.status === PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_FOUND) {
          if (!otherHandle.triggeredHandles.has(triggerHandle)) {
            triggerHandle.onTriggerEnter?.(triggerResult)
            otherHandle.triggeredHandles.add(triggerHandle)
          }
        } else if (pair.status === PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_LOST) {
          if (otherHandle.triggeredHandles.has(triggerHandle)) {
            triggerHandle.onTriggerLeave?.(triggerResult)
            otherHandle.triggeredHandles.delete(triggerHandle)
          }
        }
      }
    }
    simulationEventCallback.onConstraintBreak = (...args) => {
      console.error('TODO: onContraintBreak', ...args)
    }

    const sceneDesc = new PHYSX.PxSceneDesc(this.tolerances)
    sceneDesc.gravity = new PHYSX.PxVec3(0, -9.81, 0)
    sceneDesc.cpuDispatcher = PHYSX.DefaultCpuDispatcherCreate(0)
    sceneDesc.filterShader = PHYSX.DefaultFilterShader()
    sceneDesc.flags.raise(PHYSX.PxSceneFlagEnum.eENABLE_CCD, true)
    sceneDesc.flags.raise(PHYSX.PxSceneFlagEnum.eENABLE_ACTIVE_ACTORS, true)
    sceneDesc.solverType = PHYSX.PxSolverTypeEnum.eTGS // recommened, default is PGS still
    sceneDesc.simulationEventCallback = simulationEventCallback
    sceneDesc.broadPhaseType = PHYSX.PxBroadPhaseTypeEnum.eGPU
    this.scene = this.physics.createScene(sceneDesc)

    this.handles = new Map()
    // this.tracking = new Map()
    this.active = new Set()

    this.raycastResult = new PHYSX.PxRaycastResult()
    this.sweepPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    this.sweepResult = new PHYSX.PxSweepResult()
    this.overlapPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    this.overlapResult = new PHYSX.PxOverlapResult()
    this.queryFilterData = new PHYSX.PxQueryFilterData()

    this._pv1 = new PHYSX.PxVec3()
    this._pv2 = new PHYSX.PxVec3()
    this.transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)

    this.setupControllerManager()
  }

  setupControllerManager() {
    this.controllerManager = PHYSX.PxTopLevelFunctions.prototype.CreateControllerManager(this.scene) // prettier-ignore
    this.controllerFilters = new PHYSX.PxControllerFilters()
    this.controllerFilters.mFilterData = new PHYSX.PxFilterData(Layers.player.group, Layers.player.mask, 0, 0) // prettier-ignore
    const filterCallback = new PHYSX.PxQueryFilterCallbackImpl()
    filterCallback.simplePreFilter = (filterDataPtr, shapePtr, actor) => {
      const filterData = PHYSX.wrapPointer(filterDataPtr, PHYSX.PxFilterData)
      const shape = PHYSX.wrapPointer(shapePtr, PHYSX.PxShape)
      const shapeFilterData = shape.getQueryFilterData()
      // if (0 == (filterData.word0 & shapeFilterData.word1) && 0 == (shapeFilterData.word0 & filterData.word1)) {
      //   return PHYSX.PxQueryHitType.eBLOCK
      //   return PHYSX.PxQueryHitType.eNONE
      // }
      if (filterData.word0 & shapeFilterData.word1 && shapeFilterData.word0 & filterData.word1) {
        return PHYSX.PxQueryHitType.eBLOCK
      }
      return PHYSX.PxQueryHitType.eNONE
    }
    this.controllerFilters.mFilterCallback = filterCallback
    const cctFilterCallback = new PHYSX.PxControllerFilterCallbackImpl()
    cctFilterCallback.filter = (aPtr, bPtr) => {
      // const a = PHYSX.wrapPointer(aPtr, PHYSX.PxCapsuleController)
      // const b = PHYSX.wrapPointer(bPtr, PHYSX.PxCapsuleController)
      return true // for now ALL cct's collide
    }
    this.controllerFilters.mCCTFilterCallback = cctFilterCallback
  }

  start() {
    // ground
    const size = 1000
    const geometry = new PHYSX.PxBoxGeometry(size / 2, 1 / 2, size / 2)
    const material = this.physics.createMaterial(0.6, 0.6, 0)
    const flags = new PHYSX.PxShapeFlags(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE) // prettier-ignore
    const shape = this.physics.createShape(geometry, material, true, flags)
    const layer = Layers.environment
    const filterData = new PHYSX.PxFilterData(layer.group, layer.mask, 0, 0) // prettier-ignore
    shape.setQueryFilterData(filterData)
    shape.setSimulationFilterData(filterData)
    const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    transform.p.y = -0.5
    const body = this.physics.createRigidStatic(transform)
    body.attachShape(shape)
    this.scene.addActor(body)
  }

  // track(actor, onPhysicsMovement) {
  //   const item = {
  //     actor,
  //     onPhysicsMovement,
  //     prev: {
  //       position: new THREE.Vector3(),
  //       quaternion: new THREE.Quaternion(),
  //     },
  //     next: {
  //       position: new THREE.Vector3(),
  //       quaternion: new THREE.Quaternion(),
  //     },
  //     curr: {
  //       position: new THREE.Vector3(),
  //       quaternion: new THREE.Quaternion(),
  //     },
  //   }
  //   const pose = actor.getGlobalPose()
  //   item.prev.position.copy(pose.p)
  //   item.prev.quaternion.copy(pose.q)
  //   item.next.position.copy(pose.p)
  //   item.next.quaternion.copy(pose.q)
  //   item.curr.position.copy(pose.p)
  //   item.curr.quaternion.copy(pose.q)
  //   this.tracking.set(actor.ptr, item)
  //   return () => {
  //     this.tracking.delete(actor.ptr)
  //   }
  // }

  addActor(actor, handle) {
    handle.actor = actor
    handle.contactedHandles = new Set()
    handle.triggeredHandles = new Set()
    if (handle.onInterpolate) {
      handle.interpolation = {
        prev: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
        next: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
        curr: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
      }
      const pose = actor.getGlobalPose()
      handle.interpolation.prev.position.copy(pose.p)
      handle.interpolation.prev.quaternion.copy(pose.q)
      handle.interpolation.next.position.copy(pose.p)
      handle.interpolation.next.quaternion.copy(pose.q)
      handle.interpolation.curr.position.copy(pose.p)
      handle.interpolation.curr.quaternion.copy(pose.q)
    }
    this.handles.set(actor.ptr, handle)
    this.scene.addActor(actor)
    return () => {
      // end any contacts
      if (handle.contactedHandles.size) {
        this.contactsResult.clear()
        const result = this.contactsResult.get()
        for (const otherHandle of handle.contactedHandles) {
          result.tag = handle.tag
          otherHandle.onContactEnd?.(result)
          otherHandle.contactedHandles.delete(handle)
        }
      }
      // end any triggers
      if (handle.triggeredHandles.size) {
        for (const triggerHandle of handle.triggeredHandles) {
          triggerResult.tag = handle.tag
          triggerHandle.onTriggerLeave?.(triggerResult)
        }
      }
      // remove from scene
      this.scene.removeActor(actor)
      // delete data
      this.handles.delete(actor.ptr)
    }
  }

  prepare(willStep) {
    if (willStep) {
      // if physics will step, clear active actors
      // so we can repopulate.
      this.active.clear()
    }
  }

  step(delta) {
    this.scene.simulate(delta)
    this.scene.fetchResults(true)
    const activeActors = PHYSX.SupportFunctions.prototype.PxScene_getActiveActors(this.scene)
    const size = activeActors.size()
    for (let i = 0; i < size; i++) {
      const actorPtr = activeActors.get(i).ptr
      const handle = this.handles.get(actorPtr)
      if (!handle) {
        // todo: addBot vrms do this
        // console.warn('active actor not found?', actorPtr)
        continue
      }
      const lerp = handle.interpolation
      lerp.prev.position.copy(lerp.next.position)
      lerp.prev.quaternion.copy(lerp.next.quaternion)
      const pose = handle.actor.getGlobalPose()
      lerp.next.position.copy(pose.p)
      lerp.next.quaternion.copy(pose.q)
      this.active.add(handle)
    }
  }

  interpolate(alpha) {
    for (const handle of this.active) {
      const lerp = handle.interpolation
      lerp.curr.position.lerpVectors(lerp.prev.position, lerp.next.position, alpha)
      lerp.curr.quaternion.slerpQuaternions(lerp.prev.quaternion, lerp.next.quaternion, alpha)
      handle.onInterpolate(lerp.curr.position, lerp.curr.quaternion)
    }
    // finalize any physics updates immediately
    // but don't listen to any loopback commits from those actor moves
    this.ignoreSetGlobalPose = true
    this.world.entities.clean()
    this.ignoreSetGlobalPose = false
  }

  // getInterpolatedTransform(actorPtr, vec3, quat) {
  //   const item = this.tracking.get(actorPtr)
  //   if (!item) return false
  //   vec3.copy(item.curr.position)
  //   quat.copy(item.curr.quaternion)
  //   return true
  // }

  setGlobalPose(actor, matrix) {
    if (this.ignoreSetGlobalPose) return
    matrix.toPxTransform(this.transform)
    actor.setGlobalPose(this.transform, true)
  }

  // lateUpdate() {
  //   // ...
  // }

  raycast(origin, direction, maxDistance, layerMask) {
    origin = origin.toPxVec3(this._pv1)
    direction = direction.toPxVec3(this._pv2)
    // this.queryFilterData.flags |= PHYSX.PxQueryFlagEnum.ePREFILTER | PHYSX.PxQueryFlagEnum.ePOSTFILTER // prettier-ignore
    this.queryFilterData.data.word0 = layerMask // what to hit, eg Layers.player.group | Layers.environment.group
    this.queryFilterData.data.word1 = 0
    const didHit = this.scene.raycast(
      origin,
      direction,
      maxDistance,
      this.raycastResult,
      PHYSX.PxHitFlagEnum.eNORMAL,
      this.queryFilterData
    )
    if (didHit) {
      const numHits = this.raycastResult.getNbAnyHits()
      let hit
      for (let n = 0; n < numHits; n++) {
        const nHit = this.raycastResult.getAnyHit(n)
        if (!hit || hit.distance > nHit.distance) {
          hit = nHit
        }
      }
      _raycastHit.actor = hit.actor
      _raycastHit.point.set(hit.position.x, hit.position.y, hit.position.z)
      _raycastHit.normal.set(hit.normal.x, hit.normal.y, hit.normal.z)
      _raycastHit.distance = hit.distance
      return _raycastHit
    }
    // TODO: this.raycastResult.destroy() on this.destroy()
  }

  sweep(geometry, origin, direction, maxDistance, layerMask) {
    origin.toPxVec3(this.sweepPose.p)
    direction = direction.toPxVec3(this._pv2)
    this.queryFilterData.data.word0 = layerMask
    this.queryFilterData.data.word1 = 0
    const didHit = this.scene.sweep(
      geometry,
      this.sweepPose,
      direction,
      maxDistance,
      this.sweepResult,
      PHYSX.PxHitFlagEnum.eDEFAULT,
      this.queryFilterData
    )
    if (didHit) {
      const numHits = this.sweepResult.getNbAnyHits()
      let hit
      for (let n = 0; n < numHits; n++) {
        const nHit = this.sweepResult.getAnyHit(n)
        if (!hit || hit.distance > nHit.distance) {
          hit = nHit
        }
      }
      _sweepHit.actor = hit.actor
      _sweepHit.point.set(hit.position.x, hit.position.y, hit.position.z)
      _sweepHit.normal.set(hit.normal.x, hit.normal.y, hit.normal.z)
      _sweepHit.distance = hit.distance
      return _sweepHit
    }
    // TODO: this.sweepResult.destroy() on this.destroy()
  }

  overlap(geometry, origin, layerMask) {
    origin.toPxVec3(this.overlapPose.p)
    this.queryFilterData.data.word0 = layerMask
    this.queryFilterData.data.word1 = 0
    const didHit = this.scene.overlap(geometry, this.overlapPose, this.overlapResult, this.queryFilterData)
    if (didHit) {
      // const hit = this.overlapResult.getAnyHit(0)
      _overlapHit.actor = hit.actor
      return _overlapHit
    }
    // TODO: this.overlapResult.destroy() on this.destroy()
  }
}

const scripts = new Map()
const loadScript = url => {
  let promise = scripts.get(url)
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.addEventListener('load', () => {
        resolve()
      })
      script.addEventListener('error', err => {
        console.error('Error loading the script:', url)
        reject()
      })
      document.head.appendChild(script)
    })
    scripts.set(url, promise)
  }
  return promise
}

const loadPhysX = async () => {
  if (!globalThis.PHYSX) {
    await loadScript('/static/physx-js-webidl.js')
    globalThis.PHYSX = await globalThis.PhysX()
    version = PHYSX.PHYSICS_VERSION
    allocator = new PHYSX.PxDefaultAllocator()
    errorCb = new PHYSX.PxDefaultErrorCallback()
    foundation = PHYSX.CreateFoundation(version, allocator, errorCb)
  }
}

class ContactsResult {
  constructor() {
    this.pool = []
    this.idx = 0
    this.result = {
      tag: null,
      contacts: [],
    }
  }

  clear() {
    this.result.contacts.length = 0
    this.idx = 0
  }

  add(position, normal, impulse) {
    if (!this.pool[this.idx]) {
      this.pool[this.idx] = {
        position: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        impulse: new THREE.Vector3(),
      }
    }
    const item = this.pool[this.idx]
    item.position.copy(position)
    item.normal.copy(normal)
    item.impulse.copy(impulse)
    this.result.contacts.push(item)
    this.idx++
  }

  get() {
    return this.result
  }
}
