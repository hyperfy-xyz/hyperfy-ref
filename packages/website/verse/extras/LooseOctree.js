import { isBoolean } from 'lodash-es'
import * as THREE from 'three'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _intersectionPoint = new THREE.Vector3()
const _intersects = []
const _mesh = new THREE.Mesh()

const _sphere = new THREE.Sphere()
const _ray = new THREE.Ray()

const _sphere2 = new THREE.Sphere()

const _inverseMatrix = new THREE.Matrix4()
const _tempSphere = new THREE.Sphere()
const _tempRay = new THREE.Ray()

// https://anteru.net/blog/2008/loose-octrees/

export class LooseOctree {
  constructor({ scene, center, size }) {
    this.scene = scene
    this.root = new LooseOctreeNode(this, null, center, size)
    this.helper = null
  }

  insert(item) {
    if (!item.sphere) item.sphere = new THREE.Sphere()
    if (!item.geometry.boundingSphere) item.geometry.computeBoundingSphere()
    item.sphere.copy(item.geometry.boundingSphere).applyMatrix4(item.matrix)
    let added = this.root.insert(item)
    if (!added) {
      while (!this.root.canContain(item)) {
        this.expand()
      }
      added = this.root.insert(item)
    }
    return added
  }

  move(item) {
    if (!item._node) {
      // console.error('octree item move called but there is no _node')
      return
    }
    // update bounding sphere
    item.sphere.copy(item.geometry.boundingSphere).applyMatrix4(item.matrix)
    // if it still fits inside its current node that's cool
    if (item._node.canContain(item)) {
      return
    }
    // if it doesn't fit, re-insert it into its new node
    const prevNode = item._node
    this.remove(item)
    const added = this.insert(item)
    if (!added) {
      console.error(
        'octree item moved but was not re-added. did it move outside octree bounds?'
      )
    }
    // check if we can collapse the previous node
    prevNode.checkCollapse()
  }

  remove(item) {
    item._node.remove(item)
  }

  expand() {
    console.log('expand')
    // when we expand we do it twice so that it expands in both directions.
    // first goes positive, second goes back negative
    let prevRoot
    let size
    let center

    prevRoot = this.root
    size = prevRoot.size * 2
    center = new THREE.Vector3(
      prevRoot.center.x + prevRoot.size,
      prevRoot.center.y + prevRoot.size,
      prevRoot.center.z + prevRoot.size
    )
    const first = new LooseOctreeNode(this, null, center, size)
    first.subdivide()
    first.children[0].destroy()
    first.children[0] = prevRoot
    prevRoot.parent = first
    this.root = first
    this.root.count = prevRoot.count

    prevRoot = this.root
    size = prevRoot.size * 2
    center = new THREE.Vector3(
      prevRoot.center.x - prevRoot.size,
      prevRoot.center.y - prevRoot.size,
      prevRoot.center.z - prevRoot.size
    )
    const second = new LooseOctreeNode(this, null, center, size)
    second.subdivide()
    second.children[7].destroy()
    second.children[7] = prevRoot
    prevRoot.parent = second
    this.root = second
    this.root.count = prevRoot.count
  }

  raycast(raycaster, intersects = []) {
    this.root.raycast(raycaster, intersects)
    intersects.sort(sortAscending)
    // console.log('octree.raycast', intersects)
    return intersects
  }

  spherecast(origin, direction, radius, far = Infinity, intersects = []) {
    _sphere.set(origin, radius)
    _ray.set(origin, direction)
    this.root.spherecast(_sphere, _ray, far, intersects)
    intersects.sort(sortAscending)
    return intersects
  }

  toggleHelper(enabled) {
    enabled = isBoolean(enabled) ? enabled : !this.helper
    if (enabled && !this.helper) {
      this.helper = createHelper(this)
      this.helper.init()
    }
    if (!enabled && this.helper) {
      this.helper.destroy()
      this.helper = null
    }
  }

  getDepth() {
    return this.root.getDepth()
  }

  getCount() {
    return this.root.getCount()
  }
}

class LooseOctreeNode {
  constructor(octree, parent, center, size) {
    this.octree = octree
    this.parent = parent
    this.center = center
    this.size = size
    this.inner = new THREE.Box3(
      new THREE.Vector3(center.x - size, center.y - size, center.z - size),
      new THREE.Vector3(center.x + size, center.y + size, center.z + size)
    )
    this.outer = new THREE.Box3(
      new THREE.Vector3(center.x - size * 2, center.y - size * 2, center.z - size * 2), // prettier-ignore
      new THREE.Vector3(center.x + size * 2, center.y + size * 2, center.z + size * 2) // prettier-ignore
    )
    this.items = []
    this.count = 0
    this.children = []
    this.mountHelper()
  }

  insert(item) {
    if (!this.canContain(item)) {
      return false
    }
    if (this.size / 2 < item.sphere.radius) {
      this.items.push(item)
      item._node = this
      this.inc(1)
      return true
    }
    if (!this.children.length) {
      this.subdivide()
    }
    for (const child of this.children) {
      if (child.insert(item)) {
        return true
      }
    }
    // this should never happen
    console.error('octree insert fail')
    // this.items.push(item)
    // item._node = this
    // return true
  }

  remove(item) {
    const idx = this.items.indexOf(item)
    this.items.splice(idx, 1)
    item._node = null
    this.dec(1)
  }

  inc(amount) {
    let node = this
    while (node) {
      node.count += amount
      node = node.parent
    }
  }

  dec(amount) {
    let node = this
    while (node) {
      node.count -= amount
      node = node.parent
    }
  }

  canContain(item) {
    return (
      this.size >= item.sphere.radius &&
      this.inner.containsPoint(item.sphere.center)
    )
  }

  checkCollapse() {
    // a node can collapse if it has children to collapse AND has no items in any descendants
    let match
    let node = this
    while (node) {
      if (node.count) break
      if (node.children.length) match = node
      node = node.parent
    }
    match?.collapse()
  }

  collapse() {
    for (const child of this.children) {
      child.collapse()
      child.destroy()
    }
    this.children = []
  }

  subdivide() {
    if (this.children.length) return // Ensure we don't subdivide twice
    const halfSize = this.size / 2
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const center = new THREE.Vector3(
            this.center.x + halfSize * (2 * x - 1),
            this.center.y + halfSize * (2 * y - 1),
            this.center.z + halfSize * (2 * z - 1)
          )
          const child = new LooseOctreeNode(this.octree, this, center, halfSize)
          this.children.push(child)
        }
      }
    }
  }

  raycast(raycaster, intersects) {
    if (!raycaster.ray.intersectsBox(this.outer)) {
      return intersects
    }
    for (const item of this.items) {
      if (raycaster.ray.intersectsSphere(item.sphere)) {
        _mesh.geometry = item.geometry
        _mesh.material = item.material
        _mesh.matrixWorld = item.matrix
        _mesh.raycast(raycaster, _intersects)
        for (let i = 0, l = _intersects.length; i < l; i++) {
          const intersect = _intersects[i]
          intersect.getEntity = item.getEntity
          intersect.chunk = item.chunk
          intersects.push(intersect)
        }
        _intersects.length = 0
      }
    }
    for (const child of this.children) {
      child.raycast(raycaster, intersects)
    }
    return intersects
  }

  spherecast(sphere, ray, far, intersects) {
    const nodeSphereRadius = Math.sqrt(3) * this.size
    const nodeSphere = _sphere2.set(this.center, nodeSphereRadius)
    if (!ray.intersectsSphere(nodeSphere)) {
      return intersects
    }
    for (const item of this.items) {
      if (item.info?.tag === 'ground') continue
      const combinedItemSphere = _sphere2.set(item.sphere.center, item.sphere.radius + sphere.radius) // prettier-ignore
      if (ray.intersectSphere(combinedItemSphere, _v1)) {
        // temp: this seems to work fine but the commented code below acts more like a regular raycast
        // const intersect = {
        //   distance: ray.origin.distanceTo(_v1),
        //   point: _v1.clone(),
        //   info: item.info,
        // }
        // intersects.push(intersect)

        _mesh.geometry = item.geometry
        _mesh.material = item.material
        _mesh.matrixWorld = item.matrix

        _inverseMatrix.copy(item.matrix).invert()
        const localSphere = _tempSphere
          .copy(sphere)
          .applyMatrix4(_inverseMatrix)
        const localRay = _tempRay.copy(ray).applyMatrix4(_inverseMatrix)

        console.log('Local sphere:', {
          center: localSphere.center.toArray(),
          radius: localSphere.radius,
        })
        console.log('Local ray:', {
          origin: localRay.origin.toArray(),
          direction: localRay.direction.toArray(),
        })

        const position = item.geometry.attributes.position
        const index = item.geometry.index

        for (let i = 0; i < index.count; i += 3) {
          _v1.fromBufferAttribute(position, index.getX(i))
          _v2.fromBufferAttribute(position, index.getY(i))
          _v3.fromBufferAttribute(position, index.getZ(i))

          console.log('Triangle vertices:', {
            v1: _v1.toArray(),
            v2: _v2.toArray(),
            v3: _v3.toArray(),
          })

          const intersectionPoint = new THREE.Vector3()
          const distance = rayIntersectsSphereTriangle(
            localRay,
            localSphere,
            _v1,
            _v2,
            _v3,
            intersectionPoint
          )

          console.log('Ray intersection result:', {
            distance,
            intersectionPoint: intersectionPoint.toArray(),
          })

          if (distance !== null && distance < far) {
            const worldIntersectionPoint = intersectionPoint.applyMatrix4(
              item.matrix
            )
            const worldDistance = worldIntersectionPoint.distanceTo(ray.origin)

            const intersect = {
              distance: worldDistance,
              point: worldIntersectionPoint,
              info: item.info,
            }
            intersects.push(intersect)
            console.log('Intersection found:', intersect)
          }
        }

        // _mesh.geometry = item.geometry
        // _mesh.material = item.material
        // _mesh.matrixWorld = item.matrix

        // // get sphere and ray in mesh local coordinates
        // _inverseMatrix.copy(item.matrix).invert()
        // _tempSphere.copy(sphere).applyMatrix4(_inverseMatrix)
        // _tempRay.copy(ray).applyMatrix4(_inverseMatrix)

        // const position = item.geometry.attributes.position
        // const index = item.geometry.index

        // let closestIntersection = null
        // let closestDistance = Infinity

        // for (let i = 0; i < index.count; i += 3) {
        //   _v1.fromBufferAttribute(position, index.getX(i))
        //   _v2.fromBufferAttribute(position, index.getY(i))
        //   _v3.fromBufferAttribute(position, index.getZ(i))

        //   // Calculate normal using original vertices
        //   const normal = _v1
        //     .clone()
        //     .sub(_v2)
        //     .cross(_v3.clone().sub(_v2))
        //     .normalize()

        //   // Create new vectors for the expanded triangle
        //   const e1 = _v1.clone().addScaledVector(normal, sphere.radius)
        //   const e2 = _v2.clone().addScaledVector(normal, sphere.radius)
        //   const e3 = _v3.clone().addScaledVector(normal, sphere.radius)

        //   // Check for ray intersection with the expanded triangle
        //   if (
        //     _tempRay.intersectTriangle(e1, e2, e3, false, _intersectionPoint)
        //   ) {
        //     const localDistance = _intersectionPoint.distanceTo(_tempRay.origin)
        //     if (localDistance < closestDistance) {
        //       closestDistance = localDistance
        //       closestIntersection = _intersectionPoint.clone()
        //     }
        //   }
        // }

        // if (closestIntersection) {
        //   const worldIntersectionPoint = closestIntersection.applyMatrix4(
        //     item.matrix
        //   )
        //   const worldDistance = worldIntersectionPoint.distanceTo(ray.origin)

        //   if (worldDistance < far) {
        //     const intersect = {
        //       distance: worldDistance,
        //       point: worldIntersectionPoint,
        //       info: item.info,
        //     }
        //     intersects.push(intersect)
        //   }
        // }
      }
    }
    for (const child of this.children) {
      child.spherecast(sphere, ray, far, intersects)
    }
    return intersects
  }

  getDepth() {
    if (this.children.length === 0) {
      return 1
    }
    return 1 + Math.max(...this.children.map(child => child.getDepth()))
  }

  getCount() {
    let count = 1
    for (const child of this.children) {
      count += child.getCount()
    }
    return count
  }

  mountHelper() {
    this.octree.helper?.insert(this)
  }

  unmountHelper() {
    this.octree.helper?.remove(this)
  }

  destroy() {
    this.unmountHelper()
  }
}

function sortAscending(a, b) {
  return a.distance - b.distance
}

// function getRandomHexColor() {
//   // Generate a random integer between 0 and 0xFFFFFF (16777215 in decimal)
//   const randomInt = Math.floor(Math.random() * 16777216);
//   // Convert the integer to a hexadecimal string and pad with leading zeros if necessary
//   const hexColor = randomInt.toString(16).padStart(6, '0');
//   // Prefix with '#' to form a valid hex color code
//   return '#' + hexColor;
// }

function createHelper(octree) {
  const boxes = new THREE.BoxGeometry(1, 1, 1)
  const edges = new THREE.EdgesGeometry(boxes)
  const geometry = new THREE.InstancedBufferGeometry().copy(edges)
  const iMatrix = new THREE.InstancedBufferAttribute(
    new Float32Array(1000000 * 16),
    16
  )
  iMatrix.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('iMatrix', iMatrix)
  const offset = new THREE.InstancedBufferAttribute(
    new Float32Array(100000 * 3),
    3
  )
  geometry.setAttribute('offset', offset)
  const scale = new THREE.InstancedBufferAttribute(
    new Float32Array(100000 * 3),
    3
  )
  geometry.setAttribute('scale', scale)
  geometry.instanceCount = 0
  const material = new THREE.LineBasicMaterial({
    color: 'red',
    onBeforeCompile: shader => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        attribute mat4 iMatrix;
        #include <common>
        `
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        transformed = (iMatrix * vec4(position, 1.0)).xyz;
        `
      )
    },
  })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.frustumCulled = false
  const items = []
  function insert(node) {
    const idx = mesh.geometry.instanceCount
    mesh.geometry.instanceCount++
    const position = _v1.copy(node.center)
    const quaternion = _q1.set(0, 0, 0, 1)
    const scale = _v2.setScalar(node.size * 2)
    const matrix = new THREE.Matrix4().compose(position, quaternion, scale)
    iMatrix.set(matrix.elements, idx * 16)
    iMatrix.needsUpdate = true
    node._helperItem = { idx, matrix }
    items.push(node._helperItem)
    // console.log('add', items.length)
  }
  function remove(node) {
    const item = node._helperItem
    const last = items[items.length - 1]
    const isOnly = items.length === 1
    const isLast = item === last
    if (isOnly) {
      items.length = 0
      mesh.geometry.instanceCount = 0
    } else if (isLast) {
      items.pop()
      mesh.geometry.instanceCount--
    } else {
      if (!last) {
        console.log(
          'wtf',
          item,
          items.indexOf(item),
          last,
          items.length,
          // items[items.length - 1]
          mesh.geometry.instanceCount,
          items
        )
        throw new Error('wtf')
      }
      iMatrix.set(last.matrix.elements, item.idx * 16)
      last.idx = item.idx
      items[item.idx] = last
      items.pop()
      mesh.geometry.instanceCount--
    }
    iMatrix.needsUpdate = true
  }
  function traverse(node, callback) {
    callback(node)
    for (const child of node.children) {
      traverse(child, callback)
    }
  }
  function destroy() {
    octree.scene.remove(mesh)
  }
  function init() {
    traverse(octree.root, node => {
      node.mountHelper()
    })
  }
  octree.scene.add(mesh)
  return {
    init,
    insert,
    remove,
    destroy,
  }
}

function rayIntersectsSphereTriangle(ray, sphere, a, b, c, target) {
  // First, check if the ray intersects the sphere
  const sphereIntersection = new THREE.Vector3()
  const intersectsSphere = ray.intersectSphere(sphere, sphereIntersection)

  if (!intersectsSphere) {
    console.log('Ray does not intersect sphere')
    return null
  }

  // Calculate the triangle normal
  const edge1 = _v1.subVectors(b, a)
  const edge2 = _v2.subVectors(c, a)
  const normal = _v3.crossVectors(edge1, edge2).normalize()

  // Calculate the distance from the ray origin to the triangle plane
  const denom = normal.dot(ray.direction)

  if (Math.abs(denom) < 1e-6) {
    console.log('Ray is parallel to triangle plane')
    return null
  }

  const t = normal.dot(_v1.subVectors(a, ray.origin)) / denom

  if (t < 0) {
    console.log('Triangle is behind the ray')
    return null
  }

  const intersectionPoint = ray.at(t, new THREE.Vector3())
  console.log('Ray-plane intersection point:', intersectionPoint.toArray())

  // Check if the intersection point is inside the triangle
  const inTriangle = pointInTriangle(intersectionPoint, a, b, c)
  console.log('Intersection point in triangle:', inTriangle)

  if (
    inTriangle &&
    intersectionPoint.distanceTo(sphere.center) <= sphere.radius
  ) {
    target.copy(intersectionPoint)
    return t
  }

  // If not in triangle, check edges
  const edges = [
    [a, b],
    [b, c],
    [c, a],
  ]
  for (const [v1, v2] of edges) {
    const closestPoint = closestPointOnLineSegment(v1, v2, intersectionPoint)
    if (
      closestPoint.distanceTo(sphere.center) <= sphere.radius // &&
      // closestPoint.distanceTo(ray.origin) <= far
    ) {
      target.copy(closestPoint)
      return closestPoint.distanceTo(ray.origin)
    }
  }

  console.log('No intersection found')
  return null
}

function pointInTriangle(p, a, b, c) {
  const v0 = c.clone().sub(a)
  const v1 = b.clone().sub(a)
  const v2 = p.clone().sub(a)

  const dot00 = v0.dot(v0)
  const dot01 = v0.dot(v1)
  const dot02 = v0.dot(v2)
  const dot11 = v1.dot(v1)
  const dot12 = v1.dot(v2)

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01)
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom

  return u >= 0 && v >= 0 && u + v <= 1
}

function closestPointOnLineSegment(a, b, p) {
  const ab = b.clone().sub(a)
  let t = p.clone().sub(a).dot(ab) / ab.dot(ab)
  t = Math.max(0, Math.min(1, t))
  return a.clone().add(ab.multiplyScalar(t))
}

// function checkTriangleSphereIntersection(sphere, v1, v2, v3, ray) {
//   // This function needs to consider the sphere's radius while checking for intersection
//   const faceNormal = new THREE.Vector3()
//     .crossVectors(v2.clone().sub(v1), v3.clone().sub(v1))
//     .normalize()
//   const expandedV1 = v1.clone().add(faceNormal.multiplyScalar(sphere.radius))
//   const expandedV2 = v2.clone().add(faceNormal.multiplyScalar(sphere.radius))
//   const expandedV3 = v3.clone().add(faceNormal.multiplyScalar(sphere.radius))

//   const triangle = new THREE.Triangle(expandedV1, expandedV2, expandedV3)
//   const target = new THREE.Vector3()

//   if (ray.intersectTriangle(expandedV1, expandedV2, expandedV3, true, target)) {
//     // Calculate the distance from the ray origin to the intersection point
//     const distance = ray.origin.distanceTo(target)
//     if (distance <= sphere.radius) {
//       return {
//         point: target,
//         distance: distance,
//         normal: triangle.getNormal(new THREE.Vector3()),
//         face: { a: expandedV1, b: expandedV2, c: expandedV3 },
//       }
//     }
//   }

//   return null
// }

// function spherecast(item, mesh, ray, sphere, intersects) {
//   const _inverseMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert()
//   const _localRay = ray.clone().applyMatrix4(_inverseMatrix)
//   const _localSphere = sphere.clone().applyMatrix4(_inverseMatrix)

//   const geometry = mesh.geometry
//   const positionAttribute = geometry.attributes.position
//   const index = geometry.index

//   if (index) {
//     for (let i = 0; i < index.count; i += 3) {
//       const a = index.getX(i)
//       const b = index.getX(i + 1)
//       const c = index.getX(i + 2)

//       const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, a)
//       const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, b)
//       const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, c)

//       const intersection = checkTriangleSphereIntersection(
//         _localSphere,
//         v1,
//         v2,
//         v3,
//         _localRay
//       )

//       if (intersection) {
//         console.log('WOOO')
//         intersects.push({
//           point: intersection.point.applyMatrix4(mesh.matrixWorld),
//           distance: intersection.distance,
//           face: intersection.face,
//           normal: intersection.normal,
//           object: mesh,
//           info: item.info,
//         })
//       }
//     }
//   } else {
//     console.log('BOO')
//   }

//   return intersects
// }

// // function checkTriangleSphereIntersection(sphere, v1, v2, v3, ray, target) {
// //   // First, check if the ray intersects the triangle
// //   const intersection = ray.intersectTriangle(v1, v2, v3, false, target)
// //   if (intersection) {
// //     // If the ray intersects the triangle, check if this point is within the sphere's path
// //     const distanceAlongRay = intersection.sub(ray.origin).dot(ray.direction)
// //     if (distanceAlongRay >= 0 && distanceAlongRay <= sphere.radius) {
// //       return true
// //     }
// //   }

// //   // If no intersection, check if the sphere intersects the triangle at its closest approach
// //   const planeNormal = new THREE.Vector3()
// //     .crossVectors(_v1.subVectors(v2, v1), _v2.subVectors(v3, v1))
// //     .normalize()

// //   const planeConstant = planeNormal.dot(v1)
// //   const rayDirectionDotNormal = ray.direction.dot(planeNormal)

// //   if (Math.abs(rayDirectionDotNormal) < 1e-6) {
// //     // Ray is parallel to the triangle plane
// //     return false
// //   }

// //   const t =
// //     (planeConstant - ray.origin.dot(planeNormal)) / rayDirectionDotNormal
// //   const closestPoint = ray.at(t, new THREE.Vector3())

// //   const closestPointToTriangle = new THREE.Vector3()
// //   new THREE.Triangle(v1, v2, v3).closestPointToPoint(
// //     closestPoint,
// //     closestPointToTriangle
// //   )

// //   if (closestPoint.distanceTo(closestPointToTriangle) <= sphere.radius) {
// //     target.copy(closestPointToTriangle)
// //     return true
// //   }

// //   return false
// // }

// // function checkTriangleSphereIntersection(sphere, v1, v2, v3, ray, target) {
// //   // Check if the sphere intersects with the triangle
// //   const closestPoint = new THREE.Vector3()
// //   const triangle = new THREE.Triangle(v1, v2, v3)
// //   triangle.closestPointToPoint(sphere.center, closestPoint)

// //   if (
// //     closestPoint.distanceToSquared(sphere.center) <=
// //     sphere.radius * sphere.radius
// //   ) {
// //     // The sphere intersects with the triangle
// //     // Now check if the ray intersects with the triangle
// //     const intersectionPoint = ray.intersectTriangle(v1, v2, v3, false, target)
// //     if (intersectionPoint) {
// //       // Check if the intersection point is within the sphere
// //       if (
// //         intersectionPoint.distanceToSquared(sphere.center) <=
// //         sphere.radius * sphere.radius
// //       ) {
// //         return true
// //       }
// //     }
// //   }

// //   return false
// // }

// // function triangleSphereIntersect(sphere, v0, v1, v2, ray, target) {
// //   // Check if the sphere intersects with the triangle
// //   const closestPoint = new THREE.Vector3()
// //   const triangle = new THREE.Triangle(v0, v1, v2)
// //   triangle.closestPointToPoint(sphere.center, closestPoint)

// //   if (
// //     closestPoint.distanceToSquared(sphere.center) <=
// //     sphere.radius * sphere.radius
// //   ) {
// //     // The sphere intersects with the triangle
// //     // Now check if the ray intersects with the triangle
// //     const backfaceCulling = false // Set to true if you want to cull backfaces
// //     return ray.intersectTriangle(v0, v1, v2, backfaceCulling, target)
// //   }

// //   return false
// // }

// // ===== Repurposed Mesh.raycast/_computeIntersections for spheres

// // function _computeIntersectionsSphere(mesh, raycaster, intersects, sphere) {
// //   const geometry = mesh.geometry
// //   const material = mesh.material
// //   const matrixWorld = mesh.matrixWorld

// //   if (material === undefined) return

// //   // Temporary variables
// //   const _inverseMatrix = new THREE.Matrix4()
// //   const _ray = new THREE.Ray()
// //   const _sphere = new THREE.Sphere()
// //   const _sphereHitAt = new THREE.Vector3()

// //   // Convert sphere to local space of mesh
// //   _inverseMatrix.copy(matrixWorld).invert()
// //   _sphere.copy(sphere).applyMatrix4(_inverseMatrix)
// //   _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix)

// //   const index = geometry.index
// //   const position = geometry.attributes.position
// //   const uv = geometry.attributes.uv
// //   const uv1 = geometry.attributes.uv1
// //   const normal = geometry.attributes.normal
// //   const groups = geometry.groups
// //   const drawRange = geometry.drawRange

// //   if (index !== null) {
// //     // Indexed buffer geometry
// //     const start = Math.max(0, drawRange.start)
// //     const end = Math.min(index.count, drawRange.start + drawRange.count)

// //     for (let i = start, il = end; i < il; i += 3) {
// //       const a = index.getX(i)
// //       const b = index.getX(i + 1)
// //       const c = index.getX(i + 2)

// //       const intersection = checkGeometryIntersection(
// //         mesh,
// //         material,
// //         _ray,
// //         _sphere,
// //         uv,
// //         uv1,
// //         normal,
// //         a,
// //         b,
// //         c
// //       )

// //       if (intersection) {
// //         intersection.faceIndex = Math.floor(i / 3)
// //         applyMatrix4ToIntersection(intersection, matrixWorld)
// //         intersects.push(intersection)
// //         break
// //       }
// //     }
// //   } else if (position !== undefined) {
// //     // Non-indexed buffer geometry
// //     const start = Math.max(0, drawRange.start)
// //     const end = Math.min(position.count, drawRange.start + drawRange.count)

// //     for (let i = start, il = end; i < il; i += 3) {
// //       const a = i
// //       const b = i + 1
// //       const c = i + 2

// //       const intersection = checkGeometryIntersection(
// //         mesh,
// //         material,
// //         _ray,
// //         _sphere,
// //         uv,
// //         uv1,
// //         normal,
// //         a,
// //         b,
// //         c
// //       )

// //       if (intersection) {
// //         intersection.faceIndex = Math.floor(i / 3)
// //         applyMatrix4ToIntersection(intersection, matrixWorld)
// //         intersects.push(intersection)
// //         break
// //       }
// //     }
// //   }
// // }

// // function checkGeometryIntersection(
// //   object,
// //   material,
// //   ray,
// //   sphere,
// //   uv,
// //   uv1,
// //   normal,
// //   a,
// //   b,
// //   c
// // ) {
// //   const _vA = new THREE.Vector3()
// //   const _vB = new THREE.Vector3()
// //   const _vC = new THREE.Vector3()
// //   const _intersectionPoint = new THREE.Vector3()

// //   object.getVertexPosition(a, _vA)
// //   object.getVertexPosition(b, _vB)
// //   object.getVertexPosition(c, _vC)

// //   const intersection = checkTriangleSphereIntersection(
// //     sphere,
// //     _vA,
// //     _vB,
// //     _vC,
// //     ray,
// //     _intersectionPoint
// //   )

// //   if (intersection) {
// //     const face = {
// //       a: a,
// //       b: b,
// //       c: c,
// //       normal: new THREE.Vector3(),
// //       materialIndex: 0,
// //     }

// //     THREE.Triangle.getNormal(_vA, _vB, _vC, face.normal)

// //     return {
// //       point: _intersectionPoint.clone(),
// //       face: face,
// //       faceIndex: null, // Will be set later
// //     }
// //   }

// //   return null
// // }

// // function checkTriangleSphereIntersection(sphere, v1, v2, v3, ray, target) {
// //   // First, check if the ray intersects the triangle
// //   const intersection = ray.intersectTriangle(v1, v2, v3, false, target)
// //   if (intersection) {
// //     // If the ray intersects the triangle, check if this point is within the sphere
// //     if (intersection.distanceTo(sphere.center) <= sphere.radius) {
// //       return true
// //     }
// //   }

// //   // If no intersection, check if the sphere intersects the triangle
// //   const closestPoint = new THREE.Vector3()
// //   const triangle = new THREE.Triangle(v1, v2, v3)
// //   triangle.closestPointToPoint(sphere.center, closestPoint)

// //   if (closestPoint.distanceTo(sphere.center) <= sphere.radius) {
// //     target.copy(closestPoint)
// //     return true
// //   }

// //   return false
// // }

// // function applyMatrix4ToIntersection(intersection, matrix) {
// //   intersection.point.applyMatrix4(matrix)
// //   intersection.face.normal.applyMatrix4(matrix).normalize()
// // }
