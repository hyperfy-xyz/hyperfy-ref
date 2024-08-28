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

    const simulationEventCallback = new PHYSX.PxSimulationEventCallbackImpl()
    simulationEventCallback.onContact = () => {} // TODO
    simulationEventCallback.onTrigger = (pairs, count) => {
      pairs = PHYSX.wrapPointer(pairs, PHYSX.PxTriggerPair)
      for (let i = 0; i < count; i++) {
        const pair = PHYSX.NativeArrayHelpers.prototype.getTriggerPairAt(pairs, i)
        // ignore pairs if a shape was deleted.
        // this prevents an issue where onLeave can get called after rebuilding an object that had entered a trigger
        if (
          pair.flags.isSet(PHYSX.PxTriggerPairFlagEnum.eREMOVED_SHAPE_TRIGGER)
          // pair.flags.isSet(PHYSX.PxTriggerPairFlagEnum.eREMOVED_SHAPE_OTHER)
        ) {
          continue
        }
        const node = pair.triggerShape.triggerNode
        const result = pair.otherShape.triggerResult
        if (!node || !node.mounted || !result) continue
        if (pair.status === PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_FOUND) {
          node.onEnter?.(result)
        } else if (pair.status === PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_LOST) {
          node.onLeave?.(result)
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

    this.tracking = new Map()
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

  track(actor, onPhysicsMovement) {
    const item = {
      actor,
      onPhysicsMovement,
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
    item.prev.position.copy(pose.p)
    item.prev.quaternion.copy(pose.q)
    item.next.position.copy(pose.p)
    item.next.quaternion.copy(pose.q)
    item.curr.position.copy(pose.p)
    item.curr.quaternion.copy(pose.q)
    this.tracking.set(actor.ptr, item)
    return () => {
      this.tracking.delete(actor.ptr)
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
      const item = this.tracking.get(actorPtr)
      if (!item) {
        // todo: addBot vrms do this
        // console.warn('active actor not found?', actorPtr)
        continue
      }
      item.prev.position.copy(item.next.position)
      item.prev.quaternion.copy(item.next.quaternion)
      const pose = item.actor.getGlobalPose()
      item.next.position.copy(pose.p)
      item.next.quaternion.copy(pose.q)
      this.active.add(item)
    }
  }

  interpolate(alpha) {
    for (const item of this.active) {
      item.curr.position.lerpVectors(item.prev.position, item.next.position, alpha)
      item.curr.quaternion.slerpQuaternions(item.prev.quaternion, item.next.quaternion, alpha)
      item.onPhysicsMovement?.(item.curr.position, item.curr.quaternion)
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
