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
    this.groups = {
      PLAYER: 1 << 0,
      ENVIRONMENT: 1 << 2,
    }
    this.collisionMatrix = {
      [this.groups.PLAYER]: 0, // this.groups.ENVIRONMENT,
      [this.groups.ENVIRONMENT]: 0, // this.groups.PLAYER, // use pipe for extras
    }
    const tmpVec = new PHYSX.PxVec3(0, -9.81, 0)
    const sceneDesc = new PHYSX.PxSceneDesc(this.tolerances)
    sceneDesc.set_gravity(tmpVec)
    sceneDesc.set_cpuDispatcher(PHYSX.DefaultCpuDispatcherCreate(0))
    sceneDesc.set_filterShader(
      /*PHYSX.DefaultFilterShader()*/ this.filterShader
    )
    this.scene = this.physics.createScene(sceneDesc)
    this.bindings = new Set()
    const self = this
    // class MyControllerFilterCallback extends PHYSX.PxControllerFilterCallbackImpl {
    //   constructor() {
    //     super()
    //   }

    //   filter(controller, other) {
    //     console.log('HEY IT WORKS')
    //     // Implement your custom filtering logic here
    //     // Return true if the controller should interact with 'other', false otherwise

    //     // Example: Allow interaction with all other controllers
    //     return true
    //   }
    // }
    this.controllerManager = PHYSX.PxTopLevelFunctions.prototype.CreateControllerManager(this.scene) // prettier-ignore
    // this.controllerFilterCallback = new MyControllerFilterCallback()
    this.controllerFilters = new PHYSX.PxControllerFilters()
    class Foo extends PHYSX.PxControllerFilterCallbackImpl {
      constructor() {
        super()
      }
      filter(controller, other) {
        console.log('FOOO')
        return true
      }
    }
    // this.controllerFilters.mCCTFilterCallback = new Foo()
    this.controllerFilters.mCCTFilterCallback =
      PHYSX.PxControllerFilterCallbackImpl({
        filter(a, b) {
          console.log('hi')
          return true
        },
      })
    // this.controllerManager.setControllerFilterCallback(
    //   new PHYSX.PxControllerFilterCallbackImpl({
    //     filter() {
    //       console.log('HEY!!')
    //       return true
    //     },
    //   })
    // )

    // this.rayHit = new PHYSX.PxRaycastHit()
    // this.rayResult = new PHYSX.PxRaycastResult()
    this.rayBuffer = new PHYSX.PxRaycastBuffer10()
    // this.rayHitBuffer = new PHYSX.PxRaycastBuffer10() // Buffer to store multiple hits
    this.queryFilterData = new PHYSX.PxQueryFilterData()
    extendThreePhysX()

    // this.controllerQueryFilterCallback = {
    //   prefilter: this.filterShader,
    //   postFilter: null,
    // }

    this._pv1 = new PHYSX.PxVec3()
    this._pv2 = new PHYSX.PxVec3()
  }

  start() {
    // ground
    const size = 1000
    const geometry = new PHYSX.PxBoxGeometry(size / 2, 1 / 2, size / 2)
    const material = this.physics.createMaterial(0.5, 0.5, 0.5)
    const flags = new PHYSX.PxShapeFlags(
      PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
        PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE |
        PHYSX.PxShapeFlagEnum.eVISUALIZATION
    )
    const shape = this.physics.createShape(geometry, material, true, flags)
    shape.setSimulationFilterData(
      new PHYSX.PxFilterData(this.groups.ENVIRONMENT, 0, 0, 0)
    )
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

  raycast(origin, direction, maxDistance, layerMask) {
    origin = origin.toPxVec3(this._pv1)
    direction = direction.toPxVec3(this._pv2)
    const didHit = this.scene.raycast(
      origin,
      direction,
      maxDistance,
      this.rayBuffer
      // PHYSX.PxHitFlags.eDEFAULT
      // this.queryFilterData
    )
    const hit = this.rayBuffer.getAnyHit(0)
    if (hit) {
      _hitResult.point.set(hit.position.x, hit.position.y, hit.position.z)
      _hitResult.distance = hit.distance
      return _hitResult
    }
    // TODO: this.rayBuffer.destroy() on this.destroy()
  }

  filterShader(attributes0, filterData0, attributes1, filterData1) {
    console.log('hiyo')
    const group0 = filterData0.word0
    const group1 = filterData1.word0
    if (this.collisionMatrix[group0] & group1) {
      return PHYSX.PxFilterFlag.eDEFAULT
    }
    return PHYSX.PxFilterFlag.eSUPPRESS
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
