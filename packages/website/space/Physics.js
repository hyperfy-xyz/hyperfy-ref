import { extendThreePhysX } from '@/utils/extendThreePhysX'

import { System } from './System'

let version
let allocator
let errorCb
let foundation

export class Physics extends System {
  constructor(space) {
    super(space)
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
    const tmpVec = new PHYSX.PxVec3(0, -9.81, 0)
    const sceneDesc = new PHYSX.PxSceneDesc(this.tolerances)
    sceneDesc.set_gravity(tmpVec)
    sceneDesc.set_cpuDispatcher(PHYSX.DefaultCpuDispatcherCreate(0))
    sceneDesc.set_filterShader(PHYSX.DefaultFilterShader())
    this.scene = this.physics.createScene(sceneDesc)
    this.bindings = new Set()
    this.controllerManager = PHYSX.PxTopLevelFunctions.prototype.CreateControllerManager(this.scene) // prettier-ignore
    this.controllerFilters = new PHYSX.PxControllerFilters()
    extendThreePhysX()
  }

  start() {
    // ground
    const geometry = new PHYSX.PxBoxGeometry(1000 / 2, 1 / 2, 1000 / 2)
    const material = this.physics.createMaterial(0.5, 0.5, 0.5)
    const flags = new PHYSX.PxShapeFlags(
      PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
        PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE |
        PHYSX.PxShapeFlagEnum.eVISUALIZATION
    )
    const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)
    const shape = this.physics.createShape(geometry, material, true, flags)
    shape.setSimulationFilterData(tmpFilterData)
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
