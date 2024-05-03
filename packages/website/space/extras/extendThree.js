import * as THREE from 'three'

export function extendThree() {
  if (!PHYSX) throw new Error('PHYSX not initialised')
  if (THREE.Vector3.prototype.fromPxVec3) return

  const _pxVec3 = new PHYSX.PxVec3()
  const _pxExtVec3 = new PHYSX.PxExtendedVec3()

  THREE.Vector3.prototype.fromPxVec3 = function (pxVec3) {
    this.x = pxVec3.x
    this.y = pxVec3.y
    this.z = pxVec3.z
    return this
  }

  THREE.Vector3.prototype.toPxVec3 = function (pxVec3 = _pxVec3) {
    pxVec3.x = this.x
    pxVec3.y = this.y
    pxVec3.z = this.z
    return pxVec3
  }

  THREE.Vector3.prototype.toPxExtVec3 = function (pxExtVec3 = _pxExtVec3) {
    pxExtVec3.x = this.x
    pxExtVec3.y = this.y
    pxExtVec3.z = this.z
    return pxExtVec3
  }
}
