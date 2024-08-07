import * as THREE from 'three'

import { extendThreePhysX } from './extras/extendThreePhysX'

import { System } from './System'

let version
let allocator
let errorCb
let foundation

const _v1 = new THREE.Vector3()

const _hitResult = {
  point: new THREE.Vector3(),
  distance: null,
}

const collisionMatrix = {
  // key = group
  // value = mask for what the group can hit
  player: ['environment'],
  environment: ['player', 'environment'],
}

export class Physics extends System {
  constructor(world) {
    super(world)
  }

  async init() {
    await loadPhysX()
    this.version = version
    this.allocator = allocator
    this.errorCb = errorCb
    this.foundation = foundation
    this.tolerances = new PHYSX.PxTolerancesScale()
    this.cookingParams = new PHYSX.PxCookingParams(this.tolerances)
    this.physics = PHYSX.CreatePhysics(
      this.version,
      this.foundation,
      this.tolerances
    )
    this.defaultMaterial = this.physics.createMaterial(0.2, 0.2, 0.2)
    this.groups = {}
    this.masks = {}
    this.setupCollisionMatrix()
    const tmpVec = new PHYSX.PxVec3(0, -9.81, 0)
    const sceneDesc = new PHYSX.PxSceneDesc(this.tolerances)
    sceneDesc.gravity = tmpVec
    sceneDesc.cpuDispatcher = PHYSX.DefaultCpuDispatcherCreate(0)
    sceneDesc.filterShader = PHYSX.DefaultFilterShader()
    this.scene = this.physics.createScene(sceneDesc)
    this.bindings = new Set()
    this.controllerManager = PHYSX.PxTopLevelFunctions.prototype.CreateControllerManager(this.scene) // prettier-ignore
    this.controllerFilters = new PHYSX.PxControllerFilters()
    this.controllerFilters.mFilterData = new PHYSX.PxFilterData(this.groups.player, this.masks.player, 0, 0) // prettier-ignore
    const filterCallback = new PHYSX.PxQueryFilterCallbackImpl()
    filterCallback.simplePreFilter = (filterDataPtr, shapePtr, actor) => {
      const filterData = PHYSX.wrapPointer(filterDataPtr, PHYSX.PxFilterData)
      const shape = PHYSX.wrapPointer(shapePtr, PHYSX.PxShape)
      const shapeFilterData = shape.getQueryFilterData()
      if (
        filterData.word0 & shapeFilterData.word1 &&
        shapeFilterData.word0 & filterData.word1
      ) {
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
    this.rayBuffer = new PHYSX.PxRaycastBuffer10()
    this.queryFilterData = new PHYSX.PxQueryFilterData()
    extendThreePhysX()
    this._pv1 = new PHYSX.PxVec3()
    this._pv2 = new PHYSX.PxVec3()
  }

  setupCollisionMatrix() {
    // groups
    let n = 0
    for (const name in collisionMatrix) {
      this.groups[name] = 1 << n
      n++
    }
    // masks
    for (const name in collisionMatrix) {
      this.masks[name] = collisionMatrix[name].reduce((acc, name2) => {
        return acc | this.groups[name2]
      }, 0)
    }
  }

  start() {
    // ground
    const size = 1000
    const geometry = new PHYSX.PxBoxGeometry(size / 2, 1 / 2, size / 2)
    const material = this.physics.createMaterial(0.5, 0.5, 0.5)
    const flags = new PHYSX.PxShapeFlags(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE | PHYSX.PxShapeFlagEnum.eVISUALIZATION) // prettier-ignore
    const shape = this.physics.createShape(geometry, material, true, flags)
    const filterData = new PHYSX.PxFilterData(this.groups.environment, this.masks.environment, 0, 0) // prettier-ignore
    shape.setSimulationFilterData(filterData)
    shape.setQueryFilterData(filterData)
    const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    transform.p.y = -0.5
    const body = this.physics.createRigidStatic(transform)
    body.attachShape(shape)
    this.scene.addActor(body)
  }

  bind(body, node) {
    const binding = { body, node }
    this.bindings.add(binding)
    return () => {
      this.bindings.delete(binding)
    }
  }

  fixedUpdate(delta) {
    this.scene.simulate(delta)
    this.scene.fetchResults(true)
    for (const binding of this.bindings) {
      if (binding.body.isSleeping()) continue
      const pose = binding.body.getGlobalPose()
      binding.node.position.copy(pose.p)
      binding.node.quaternion.copy(pose.q)
      binding.node.dirty()
    }
  }

  raycast(origin, direction, maxDistance, ignoreGroups) {
    origin = origin.toPxVec3(this._pv1)
    direction = direction.toPxVec3(this._pv2)
    // this.queryFilterData.flags |= PHYSX.PxQueryFlagEnum.ePREFILTER | PHYSX.PxQueryFlagEnum.ePOSTFILTER // prettier-ignore
    this.queryFilterData.data.word0 = ~ignoreGroups
    this.queryFilterData.data.word1 = 0
    const didHit = this.scene.raycast(
      origin,
      direction,
      maxDistance,
      this.rayBuffer,
      PHYSX.PxHitFlagEnum.eDEFAULT,
      this.queryFilterData
    )
    if (didHit) {
      const hit = this.rayBuffer.getAnyHit(0)
      _hitResult.point.set(hit.position.x, hit.position.y, hit.position.z)
      _hitResult.distance = hit.distance
      return _hitResult
    }
    // TODO: this.rayBuffer.destroy() on this.destroy()
  }

  sweep(geometry, origin, direction, maxDistance, ignoreGroups) {
    if (!this.sweepPose) {
      // TODO: setup once above
      this.sweepPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    }
    origin.toPxVec3(this.sweepPose.p)
    direction = direction.toPxVec3(this._pv2)
    // this.queryFilterData.flags |= PHYSX.PxQueryFlagEnum.ePREFILTER | PHYSX.PxQueryFlagEnum.ePOSTFILTER // prettier-ignore
    this.queryFilterData.data.word0 = ~ignoreGroups
    this.queryFilterData.data.word1 = 0
    const didHit = this.scene.sweep(
      geometry,
      this.sweepPose,
      direction,
      maxDistance,
      this.rayBuffer,
      PHYSX.PxHitFlagEnum.eDEFAULT,
      this.queryFilterData
    )
    if (didHit) {
      const hit = this.rayBuffer.getAnyHit(0)
      _hitResult.point.set(hit.position.x, hit.position.y, hit.position.z)
      _hitResult.distance = hit.distance
      return _hitResult
    }
    // TODO: this.rayBuffer.destroy() on this.destroy()
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
