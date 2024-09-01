/**
 * Flow:
 *
 * - ui update()
 *   - if worker pending, accumulate delta and try next time, stop here
 *   - send 'update' msg to worker, transferring next buffers and delta (included accumulated previous deltas)
 *   - mark worker as pending
 * - ui on worker msg
 *   - remove currently rendered buffers, mark as 'next' (see above)
 *   - insert received buffers into geometry to be rendered
 *   - mark worker as not pending
 *
 * This allows the UI to update constantly.
 * If the worker is faster than 60 fps thats fine.
 * If the worker is slow as fuck then that's also fine, but the particles will visually skip frames without affecting performance
 */

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    Vector3.prototype.isVector3 = true

    this.x = x
    this.y = y
    this.z = z
  }

  set(x, y, z) {
    if (z === undefined) z = this.z // sprite.scale.set(x,y)

    this.x = x
    this.y = y
    this.z = z

    return this
  }

  setScalar(scalar) {
    this.x = scalar
    this.y = scalar
    this.z = scalar

    return this
  }

  setX(x) {
    this.x = x

    return this
  }

  setY(y) {
    this.y = y

    return this
  }

  setZ(z) {
    this.z = z

    return this
  }

  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value
        break
      case 1:
        this.y = value
        break
      case 2:
        this.z = value
        break
      default:
        throw new Error('index is out of range: ' + index)
    }

    return this
  }

  getComponent(index) {
    switch (index) {
      case 0:
        return this.x
      case 1:
        return this.y
      case 2:
        return this.z
      default:
        throw new Error('index is out of range: ' + index)
    }
  }

  clone() {
    return new this.constructor(this.x, this.y, this.z)
  }

  copy(v) {
    this.x = v.x
    this.y = v.y
    this.z = v.z

    return this
  }

  add(v) {
    this.x += v.x
    this.y += v.y
    this.z += v.z

    return this
  }

  addScalar(s) {
    this.x += s
    this.y += s
    this.z += s

    return this
  }

  addVectors(a, b) {
    this.x = a.x + b.x
    this.y = a.y + b.y
    this.z = a.z + b.z

    return this
  }

  addScaledVector(v, s) {
    this.x += v.x * s
    this.y += v.y * s
    this.z += v.z * s

    return this
  }

  sub(v) {
    this.x -= v.x
    this.y -= v.y
    this.z -= v.z

    return this
  }

  subScalar(s) {
    this.x -= s
    this.y -= s
    this.z -= s

    return this
  }

  subVectors(a, b) {
    this.x = a.x - b.x
    this.y = a.y - b.y
    this.z = a.z - b.z

    return this
  }

  multiply(v) {
    this.x *= v.x
    this.y *= v.y
    this.z *= v.z

    return this
  }

  multiplyScalar(scalar) {
    this.x *= scalar
    this.y *= scalar
    this.z *= scalar

    return this
  }

  multiplyVectors(a, b) {
    this.x = a.x * b.x
    this.y = a.y * b.y
    this.z = a.z * b.z

    return this
  }

  applyEuler(euler) {
    return this.applyQuaternion(_quaternion.setFromEuler(euler))
  }

  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle))
  }

  applyMatrix3(m) {
    const x = this.x,
      y = this.y,
      z = this.z
    const e = m.elements

    this.x = e[0] * x + e[3] * y + e[6] * z
    this.y = e[1] * x + e[4] * y + e[7] * z
    this.z = e[2] * x + e[5] * y + e[8] * z

    return this
  }

  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize()
  }

  applyMatrix4(m) {
    const x = this.x,
      y = this.y,
      z = this.z
    const e = m.elements

    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])

    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w

    return this
  }

  applyQuaternion(q) {
    const x = this.x,
      y = this.y,
      z = this.z
    const qx = q.x,
      qy = q.y,
      qz = q.z,
      qw = q.w

    // calculate quat * vector

    const ix = qw * x + qy * z - qz * y
    const iy = qw * y + qz * x - qx * z
    const iz = qw * z + qx * y - qy * x
    const iw = -qx * x - qy * y - qz * z

    // calculate result * inverse quat

    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx

    return this
  }

  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
  }

  unproject(camera) {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld)
  }

  transformDirection(m) {
    // input: THREE.Matrix4 affine matrix
    // vector interpreted as a direction

    const x = this.x,
      y = this.y,
      z = this.z
    const e = m.elements

    this.x = e[0] * x + e[4] * y + e[8] * z
    this.y = e[1] * x + e[5] * y + e[9] * z
    this.z = e[2] * x + e[6] * y + e[10] * z

    return this.normalize()
  }

  divide(v) {
    this.x /= v.x
    this.y /= v.y
    this.z /= v.z

    return this
  }

  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar)
  }

  min(v) {
    this.x = Math.min(this.x, v.x)
    this.y = Math.min(this.y, v.y)
    this.z = Math.min(this.z, v.z)

    return this
  }

  max(v) {
    this.x = Math.max(this.x, v.x)
    this.y = Math.max(this.y, v.y)
    this.z = Math.max(this.z, v.z)

    return this
  }

  clamp(min, max) {
    // assumes min < max, componentwise

    this.x = Math.max(min.x, Math.min(max.x, this.x))
    this.y = Math.max(min.y, Math.min(max.y, this.y))
    this.z = Math.max(min.z, Math.min(max.z, this.z))

    return this
  }

  clampScalar(minVal, maxVal) {
    this.x = Math.max(minVal, Math.min(maxVal, this.x))
    this.y = Math.max(minVal, Math.min(maxVal, this.y))
    this.z = Math.max(minVal, Math.min(maxVal, this.z))

    return this
  }

  clampLength(min, max) {
    const length = this.length()

    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)))
  }

  floor() {
    this.x = Math.floor(this.x)
    this.y = Math.floor(this.y)
    this.z = Math.floor(this.z)

    return this
  }

  ceil() {
    this.x = Math.ceil(this.x)
    this.y = Math.ceil(this.y)
    this.z = Math.ceil(this.z)

    return this
  }

  round() {
    this.x = Math.round(this.x)
    this.y = Math.round(this.y)
    this.z = Math.round(this.z)

    return this
  }

  roundToZero() {
    this.x = Math.trunc(this.x)
    this.y = Math.trunc(this.y)
    this.z = Math.trunc(this.z)

    return this
  }

  negate() {
    this.x = -this.x
    this.y = -this.y
    this.z = -this.z

    return this
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z
  }

  // TODO lengthSquared?

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
  }

  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z)
  }

  normalize() {
    return this.divideScalar(this.length() || 1)
  }

  setLength(length) {
    return this.normalize().multiplyScalar(length)
  }

  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha
    this.y += (v.y - this.y) * alpha
    this.z += (v.z - this.z) * alpha

    return this
  }

  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha
    this.y = v1.y + (v2.y - v1.y) * alpha
    this.z = v1.z + (v2.z - v1.z) * alpha

    return this
  }

  cross(v) {
    return this.crossVectors(this, v)
  }

  crossVectors(a, b) {
    const ax = a.x,
      ay = a.y,
      az = a.z
    const bx = b.x,
      by = b.y,
      bz = b.z

    this.x = ay * bz - az * by
    this.y = az * bx - ax * bz
    this.z = ax * by - ay * bx

    return this
  }

  projectOnVector(v) {
    const denominator = v.lengthSq()

    if (denominator === 0) return this.set(0, 0, 0)

    const scalar = v.dot(this) / denominator

    return this.copy(v).multiplyScalar(scalar)
  }

  projectOnPlane(planeNormal) {
    _vector.copy(this).projectOnVector(planeNormal)

    return this.sub(_vector)
  }

  reflect(normal) {
    // reflect incident vector off plane orthogonal to normal
    // normal is assumed to have unit length

    return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)))
  }

  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq())

    if (denominator === 0) return Math.PI / 2

    const theta = this.dot(v) / denominator

    // clamp, to handle numerical problems

    return Math.acos(clamp(theta, -1, 1))
  }

  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v))
  }

  distanceToSquared(v) {
    const dx = this.x - v.x,
      dy = this.y - v.y,
      dz = this.z - v.z

    return dx * dx + dy * dy + dz * dz
  }

  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z)
  }

  setFromSpherical(s) {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta)
  }

  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius

    this.x = sinPhiRadius * Math.sin(theta)
    this.y = Math.cos(phi) * radius
    this.z = sinPhiRadius * Math.cos(theta)

    return this
  }

  setFromCylindrical(c) {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y)
  }

  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Math.sin(theta)
    this.y = y
    this.z = radius * Math.cos(theta)

    return this
  }

  setFromMatrixPosition(m) {
    const e = m.elements

    this.x = e[12]
    this.y = e[13]
    this.z = e[14]

    return this
  }

  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length()
    const sy = this.setFromMatrixColumn(m, 1).length()
    const sz = this.setFromMatrixColumn(m, 2).length()

    this.x = sx
    this.y = sy
    this.z = sz

    return this
  }

  setFromMatrixColumn(m, index) {
    return this.fromArray(m.elements, index * 4)
  }

  setFromMatrix3Column(m, index) {
    return this.fromArray(m.elements, index * 3)
  }

  setFromEuler(e) {
    this.x = e._x
    this.y = e._y
    this.z = e._z

    return this
  }

  setFromColor(c) {
    this.x = c.r
    this.y = c.g
    this.z = c.b

    return this
  }

  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z
  }

  fromArray(array, offset = 0) {
    this.x = array[offset]
    this.y = array[offset + 1]
    this.z = array[offset + 2]

    return this
  }

  toArray(array = [], offset = 0) {
    array[offset] = this.x
    array[offset + 1] = this.y
    array[offset + 2] = this.z

    return array
  }

  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index)
    this.y = attribute.getY(index)
    this.z = attribute.getZ(index)

    return this
  }

  random() {
    this.x = Math.random()
    this.y = Math.random()
    this.z = Math.random()

    return this
  }

  randomDirection() {
    // Derived from https://mathworld.wolfram.com/SpherePointPicking.html

    const u = (Math.random() - 0.5) * 2
    const t = Math.random() * Math.PI * 2
    const f = Math.sqrt(1 - u ** 2)

    this.x = f * Math.cos(t)
    this.y = f * Math.sin(t)
    this.z = u

    return this
  }

  *[Symbol.iterator]() {
    yield this.x
    yield this.y
    yield this.z
  }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.isQuaternion = true

    this._x = x
    this._y = y
    this._z = z
    this._w = w
  }

  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
    // fuzz-free, array-based Quaternion SLERP operation

    let x0 = src0[srcOffset0 + 0],
      y0 = src0[srcOffset0 + 1],
      z0 = src0[srcOffset0 + 2],
      w0 = src0[srcOffset0 + 3]

    const x1 = src1[srcOffset1 + 0],
      y1 = src1[srcOffset1 + 1],
      z1 = src1[srcOffset1 + 2],
      w1 = src1[srcOffset1 + 3]

    if (t === 0) {
      dst[dstOffset + 0] = x0
      dst[dstOffset + 1] = y0
      dst[dstOffset + 2] = z0
      dst[dstOffset + 3] = w0
      return
    }

    if (t === 1) {
      dst[dstOffset + 0] = x1
      dst[dstOffset + 1] = y1
      dst[dstOffset + 2] = z1
      dst[dstOffset + 3] = w1
      return
    }

    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let s = 1 - t
      const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1,
        dir = cos >= 0 ? 1 : -1,
        sqrSin = 1 - cos * cos

      // Skip the Slerp for tiny steps to avoid numeric problems:
      if (sqrSin > Number.EPSILON) {
        const sin = Math.sqrt(sqrSin),
          len = Math.atan2(sin, cos * dir)

        s = Math.sin(s * len) / sin
        t = Math.sin(t * len) / sin
      }

      const tDir = t * dir

      x0 = x0 * s + x1 * tDir
      y0 = y0 * s + y1 * tDir
      z0 = z0 * s + z1 * tDir
      w0 = w0 * s + w1 * tDir

      // Normalize in case we just did a lerp:
      if (s === 1 - t) {
        const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0)

        x0 *= f
        y0 *= f
        z0 *= f
        w0 *= f
      }
    }

    dst[dstOffset] = x0
    dst[dstOffset + 1] = y0
    dst[dstOffset + 2] = z0
    dst[dstOffset + 3] = w0
  }

  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0]
    const y0 = src0[srcOffset0 + 1]
    const z0 = src0[srcOffset0 + 2]
    const w0 = src0[srcOffset0 + 3]

    const x1 = src1[srcOffset1]
    const y1 = src1[srcOffset1 + 1]
    const z1 = src1[srcOffset1 + 2]
    const w1 = src1[srcOffset1 + 3]

    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1

    return dst
  }

  get x() {
    return this._x
  }

  set x(value) {
    this._x = value
    this._onChangeCallback()
  }

  get y() {
    return this._y
  }

  set y(value) {
    this._y = value
    this._onChangeCallback()
  }

  get z() {
    return this._z
  }

  set z(value) {
    this._z = value
    this._onChangeCallback()
  }

  get w() {
    return this._w
  }

  set w(value) {
    this._w = value
    this._onChangeCallback()
  }

  set(x, y, z, w) {
    this._x = x
    this._y = y
    this._z = z
    this._w = w

    this._onChangeCallback()

    return this
  }

  clone() {
    return new this.constructor(this._x, this._y, this._z, this._w)
  }

  copy(quaternion) {
    this._x = quaternion.x
    this._y = quaternion.y
    this._z = quaternion.z
    this._w = quaternion.w

    this._onChangeCallback()

    return this
  }

  setFromEuler(euler, update) {
    const x = euler._x,
      y = euler._y,
      z = euler._z,
      order = euler._order

    // http://www.mathworks.com/matlabcentral/fileexchange/
    // 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
    //	content/SpinCalc.m

    const cos = Math.cos
    const sin = Math.sin

    const c1 = cos(x / 2)
    const c2 = cos(y / 2)
    const c3 = cos(z / 2)

    const s1 = sin(x / 2)
    const s2 = sin(y / 2)
    const s3 = sin(z / 2)

    switch (order) {
      case 'XYZ':
        this._x = s1 * c2 * c3 + c1 * s2 * s3
        this._y = c1 * s2 * c3 - s1 * c2 * s3
        this._z = c1 * c2 * s3 + s1 * s2 * c3
        this._w = c1 * c2 * c3 - s1 * s2 * s3
        break

      case 'YXZ':
        this._x = s1 * c2 * c3 + c1 * s2 * s3
        this._y = c1 * s2 * c3 - s1 * c2 * s3
        this._z = c1 * c2 * s3 - s1 * s2 * c3
        this._w = c1 * c2 * c3 + s1 * s2 * s3
        break

      case 'ZXY':
        this._x = s1 * c2 * c3 - c1 * s2 * s3
        this._y = c1 * s2 * c3 + s1 * c2 * s3
        this._z = c1 * c2 * s3 + s1 * s2 * c3
        this._w = c1 * c2 * c3 - s1 * s2 * s3
        break

      case 'ZYX':
        this._x = s1 * c2 * c3 - c1 * s2 * s3
        this._y = c1 * s2 * c3 + s1 * c2 * s3
        this._z = c1 * c2 * s3 - s1 * s2 * c3
        this._w = c1 * c2 * c3 + s1 * s2 * s3
        break

      case 'YZX':
        this._x = s1 * c2 * c3 + c1 * s2 * s3
        this._y = c1 * s2 * c3 + s1 * c2 * s3
        this._z = c1 * c2 * s3 - s1 * s2 * c3
        this._w = c1 * c2 * c3 - s1 * s2 * s3
        break

      case 'XZY':
        this._x = s1 * c2 * c3 - c1 * s2 * s3
        this._y = c1 * s2 * c3 - s1 * c2 * s3
        this._z = c1 * c2 * s3 + s1 * s2 * c3
        this._w = c1 * c2 * c3 + s1 * s2 * s3
        break

      default:
        console.warn('THREE.Quaternion: .setFromEuler() encountered an unknown order: ' + order)
    }

    if (update !== false) this._onChangeCallback()

    return this
  }

  setFromAxisAngle(axis, angle) {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm

    // assumes axis is normalized

    const halfAngle = angle / 2,
      s = Math.sin(halfAngle)

    this._x = axis.x * s
    this._y = axis.y * s
    this._z = axis.z * s
    this._w = Math.cos(halfAngle)

    this._onChangeCallback()

    return this
  }

  setFromRotationMatrix(m) {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm

    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    const te = m.elements,
      m11 = te[0],
      m12 = te[4],
      m13 = te[8],
      m21 = te[1],
      m22 = te[5],
      m23 = te[9],
      m31 = te[2],
      m32 = te[6],
      m33 = te[10],
      trace = m11 + m22 + m33

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0)

      this._w = 0.25 / s
      this._x = (m32 - m23) * s
      this._y = (m13 - m31) * s
      this._z = (m21 - m12) * s
    } else if (m11 > m22 && m11 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33)

      this._w = (m32 - m23) / s
      this._x = 0.25 * s
      this._y = (m12 + m21) / s
      this._z = (m13 + m31) / s
    } else if (m22 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33)

      this._w = (m13 - m31) / s
      this._x = (m12 + m21) / s
      this._y = 0.25 * s
      this._z = (m23 + m32) / s
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22)

      this._w = (m21 - m12) / s
      this._x = (m13 + m31) / s
      this._y = (m23 + m32) / s
      this._z = 0.25 * s
    }

    this._onChangeCallback()

    return this
  }

  setFromUnitVectors(vFrom, vTo) {
    // assumes direction vectors vFrom and vTo are normalized

    let r = vFrom.dot(vTo) + 1

    if (r < Number.EPSILON) {
      // vFrom and vTo point in opposite directions

      r = 0

      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y
        this._y = vFrom.x
        this._z = 0
        this._w = r
      } else {
        this._x = 0
        this._y = -vFrom.z
        this._z = vFrom.y
        this._w = r
      }
    } else {
      // crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector3

      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x
      this._w = r
    }

    return this.normalize()
  }

  angleTo(q) {
    return 2 * Math.acos(Math.abs(MathUtils.clamp(this.dot(q), -1, 1)))
  }

  rotateTowards(q, step) {
    const angle = this.angleTo(q)

    if (angle === 0) return this

    const t = Math.min(1, step / angle)

    this.slerp(q, t)

    return this
  }

  identity() {
    return this.set(0, 0, 0, 1)
  }

  invert() {
    // quaternion is assumed to have unit length

    return this.conjugate()
  }

  conjugate() {
    this._x *= -1
    this._y *= -1
    this._z *= -1

    this._onChangeCallback()

    return this
  }

  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w
  }

  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w
  }

  length() {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w)
  }

  normalize() {
    let l = this.length()

    if (l === 0) {
      this._x = 0
      this._y = 0
      this._z = 0
      this._w = 1
    } else {
      l = 1 / l

      this._x = this._x * l
      this._y = this._y * l
      this._z = this._z * l
      this._w = this._w * l
    }

    this._onChangeCallback()

    return this
  }

  multiply(q) {
    return this.multiplyQuaternions(this, q)
  }

  premultiply(q) {
    return this.multiplyQuaternions(q, this)
  }

  multiplyQuaternions(a, b) {
    // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm

    const qax = a._x,
      qay = a._y,
      qaz = a._z,
      qaw = a._w
    const qbx = b._x,
      qby = b._y,
      qbz = b._z,
      qbw = b._w

    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz

    this._onChangeCallback()

    return this
  }

  slerp(qb, t) {
    if (t === 0) return this
    if (t === 1) return this.copy(qb)

    const x = this._x,
      y = this._y,
      z = this._z,
      w = this._w

    // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z

    if (cosHalfTheta < 0) {
      this._w = -qb._w
      this._x = -qb._x
      this._y = -qb._y
      this._z = -qb._z

      cosHalfTheta = -cosHalfTheta
    } else {
      this.copy(qb)
    }

    if (cosHalfTheta >= 1.0) {
      this._w = w
      this._x = x
      this._y = y
      this._z = z

      return this
    }

    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta

    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t
      this._w = s * w + t * this._w
      this._x = s * x + t * this._x
      this._y = s * y + t * this._y
      this._z = s * z + t * this._z

      this.normalize()
      this._onChangeCallback()

      return this
    }

    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta)
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta)
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
      ratioB = Math.sin(t * halfTheta) / sinHalfTheta

    this._w = w * ratioA + this._w * ratioB
    this._x = x * ratioA + this._x * ratioB
    this._y = y * ratioA + this._y * ratioB
    this._z = z * ratioA + this._z * ratioB

    this._onChangeCallback()

    return this
  }

  slerpQuaternions(qa, qb, t) {
    return this.copy(qa).slerp(qb, t)
  }

  random() {
    // Derived from http://planning.cs.uiuc.edu/node198.html
    // Note, this source uses w, x, y, z ordering,
    // so we swap the order below.

    const u1 = Math.random()
    const sqrt1u1 = Math.sqrt(1 - u1)
    const sqrtu1 = Math.sqrt(u1)

    const u2 = 2 * Math.PI * Math.random()

    const u3 = 2 * Math.PI * Math.random()

    return this.set(sqrt1u1 * Math.cos(u2), sqrtu1 * Math.sin(u3), sqrtu1 * Math.cos(u3), sqrt1u1 * Math.sin(u2))
  }

  equals(quaternion) {
    return (
      quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w
    )
  }

  fromArray(array, offset = 0) {
    this._x = array[offset]
    this._y = array[offset + 1]
    this._z = array[offset + 2]
    this._w = array[offset + 3]

    this._onChangeCallback()

    return this
  }

  toArray(array = [], offset = 0) {
    array[offset] = this._x
    array[offset + 1] = this._y
    array[offset + 2] = this._z
    array[offset + 3] = this._w

    return array
  }

  fromBufferAttribute(attribute, index) {
    this._x = attribute.getX(index)
    this._y = attribute.getY(index)
    this._z = attribute.getZ(index)
    this._w = attribute.getW(index)

    return this
  }

  toJSON() {
    return this.toArray()
  }

  _onChange(callback) {
    this._onChangeCallback = callback

    return this
  }

  _onChangeCallback() {}

  *[Symbol.iterator]() {
    yield this._x
    yield this._y
    yield this._z
    yield this._w
  }
}

class Matrix4 {
  constructor(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    Matrix4.prototype.isMatrix4 = true

    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    if (n11 !== undefined) {
      this.set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44)
    }
  }

  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements

    te[0] = n11
    te[4] = n12
    te[8] = n13
    te[12] = n14
    te[1] = n21
    te[5] = n22
    te[9] = n23
    te[13] = n24
    te[2] = n31
    te[6] = n32
    te[10] = n33
    te[14] = n34
    te[3] = n41
    te[7] = n42
    te[11] = n43
    te[15] = n44

    return this
  }

  identity() {
    this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)

    return this
  }

  clone() {
    return new Matrix4().fromArray(this.elements)
  }

  copy(m) {
    const te = this.elements
    const me = m.elements

    te[0] = me[0]
    te[1] = me[1]
    te[2] = me[2]
    te[3] = me[3]
    te[4] = me[4]
    te[5] = me[5]
    te[6] = me[6]
    te[7] = me[7]
    te[8] = me[8]
    te[9] = me[9]
    te[10] = me[10]
    te[11] = me[11]
    te[12] = me[12]
    te[13] = me[13]
    te[14] = me[14]
    te[15] = me[15]

    return this
  }

  copyPosition(m) {
    const te = this.elements,
      me = m.elements

    te[12] = me[12]
    te[13] = me[13]
    te[14] = me[14]

    return this
  }

  setFromMatrix3(m) {
    const me = m.elements

    this.set(me[0], me[3], me[6], 0, me[1], me[4], me[7], 0, me[2], me[5], me[8], 0, 0, 0, 0, 1)

    return this
  }

  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrixColumn(this, 0)
    yAxis.setFromMatrixColumn(this, 1)
    zAxis.setFromMatrixColumn(this, 2)

    return this
  }

  makeBasis(xAxis, yAxis, zAxis) {
    this.set(xAxis.x, yAxis.x, zAxis.x, 0, xAxis.y, yAxis.y, zAxis.y, 0, xAxis.z, yAxis.z, zAxis.z, 0, 0, 0, 0, 1)

    return this
  }

  extractRotation(m) {
    // this method does not support reflection matrices

    const te = this.elements
    const me = m.elements

    const scaleX = 1 / _v1.setFromMatrixColumn(m, 0).length()
    const scaleY = 1 / _v1.setFromMatrixColumn(m, 1).length()
    const scaleZ = 1 / _v1.setFromMatrixColumn(m, 2).length()

    te[0] = me[0] * scaleX
    te[1] = me[1] * scaleX
    te[2] = me[2] * scaleX
    te[3] = 0

    te[4] = me[4] * scaleY
    te[5] = me[5] * scaleY
    te[6] = me[6] * scaleY
    te[7] = 0

    te[8] = me[8] * scaleZ
    te[9] = me[9] * scaleZ
    te[10] = me[10] * scaleZ
    te[11] = 0

    te[12] = 0
    te[13] = 0
    te[14] = 0
    te[15] = 1

    return this
  }

  makeRotationFromEuler(euler) {
    const te = this.elements

    const x = euler.x,
      y = euler.y,
      z = euler.z
    const a = Math.cos(x),
      b = Math.sin(x)
    const c = Math.cos(y),
      d = Math.sin(y)
    const e = Math.cos(z),
      f = Math.sin(z)

    if (euler.order === 'XYZ') {
      const ae = a * e,
        af = a * f,
        be = b * e,
        bf = b * f

      te[0] = c * e
      te[4] = -c * f
      te[8] = d

      te[1] = af + be * d
      te[5] = ae - bf * d
      te[9] = -b * c

      te[2] = bf - ae * d
      te[6] = be + af * d
      te[10] = a * c
    } else if (euler.order === 'YXZ') {
      const ce = c * e,
        cf = c * f,
        de = d * e,
        df = d * f

      te[0] = ce + df * b
      te[4] = de * b - cf
      te[8] = a * d

      te[1] = a * f
      te[5] = a * e
      te[9] = -b

      te[2] = cf * b - de
      te[6] = df + ce * b
      te[10] = a * c
    } else if (euler.order === 'ZXY') {
      const ce = c * e,
        cf = c * f,
        de = d * e,
        df = d * f

      te[0] = ce - df * b
      te[4] = -a * f
      te[8] = de + cf * b

      te[1] = cf + de * b
      te[5] = a * e
      te[9] = df - ce * b

      te[2] = -a * d
      te[6] = b
      te[10] = a * c
    } else if (euler.order === 'ZYX') {
      const ae = a * e,
        af = a * f,
        be = b * e,
        bf = b * f

      te[0] = c * e
      te[4] = be * d - af
      te[8] = ae * d + bf

      te[1] = c * f
      te[5] = bf * d + ae
      te[9] = af * d - be

      te[2] = -d
      te[6] = b * c
      te[10] = a * c
    } else if (euler.order === 'YZX') {
      const ac = a * c,
        ad = a * d,
        bc = b * c,
        bd = b * d

      te[0] = c * e
      te[4] = bd - ac * f
      te[8] = bc * f + ad

      te[1] = f
      te[5] = a * e
      te[9] = -b * e

      te[2] = -d * e
      te[6] = ad * f + bc
      te[10] = ac - bd * f
    } else if (euler.order === 'XZY') {
      const ac = a * c,
        ad = a * d,
        bc = b * c,
        bd = b * d

      te[0] = c * e
      te[4] = -f
      te[8] = d * e

      te[1] = ac * f + bd
      te[5] = a * e
      te[9] = ad * f - bc

      te[2] = bc * f - ad
      te[6] = b * e
      te[10] = bd * f + ac
    }

    // bottom row
    te[3] = 0
    te[7] = 0
    te[11] = 0

    // last column
    te[12] = 0
    te[13] = 0
    te[14] = 0
    te[15] = 1

    return this
  }

  makeRotationFromQuaternion(q) {
    return this.compose(_zero, q, _one)
  }

  lookAt(eye, target, up) {
    const te = this.elements

    _z.subVectors(eye, target)

    if (_z.lengthSq() === 0) {
      // eye and target are in the same position

      _z.z = 1
    }

    _z.normalize()
    _x.crossVectors(up, _z)

    if (_x.lengthSq() === 0) {
      // up and z are parallel

      if (Math.abs(up.z) === 1) {
        _z.x += 0.0001
      } else {
        _z.z += 0.0001
      }

      _z.normalize()
      _x.crossVectors(up, _z)
    }

    _x.normalize()
    _y.crossVectors(_z, _x)

    te[0] = _x.x
    te[4] = _y.x
    te[8] = _z.x
    te[1] = _x.y
    te[5] = _y.y
    te[9] = _z.y
    te[2] = _x.z
    te[6] = _y.z
    te[10] = _z.z

    return this
  }

  multiply(m) {
    return this.multiplyMatrices(this, m)
  }

  premultiply(m) {
    return this.multiplyMatrices(m, this)
  }

  multiplyMatrices(a, b) {
    const ae = a.elements
    const be = b.elements
    const te = this.elements

    const a11 = ae[0],
      a12 = ae[4],
      a13 = ae[8],
      a14 = ae[12]
    const a21 = ae[1],
      a22 = ae[5],
      a23 = ae[9],
      a24 = ae[13]
    const a31 = ae[2],
      a32 = ae[6],
      a33 = ae[10],
      a34 = ae[14]
    const a41 = ae[3],
      a42 = ae[7],
      a43 = ae[11],
      a44 = ae[15]

    const b11 = be[0],
      b12 = be[4],
      b13 = be[8],
      b14 = be[12]
    const b21 = be[1],
      b22 = be[5],
      b23 = be[9],
      b24 = be[13]
    const b31 = be[2],
      b32 = be[6],
      b33 = be[10],
      b34 = be[14]
    const b41 = be[3],
      b42 = be[7],
      b43 = be[11],
      b44 = be[15]

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44

    return this
  }

  multiplyScalar(s) {
    const te = this.elements

    te[0] *= s
    te[4] *= s
    te[8] *= s
    te[12] *= s
    te[1] *= s
    te[5] *= s
    te[9] *= s
    te[13] *= s
    te[2] *= s
    te[6] *= s
    te[10] *= s
    te[14] *= s
    te[3] *= s
    te[7] *= s
    te[11] *= s
    te[15] *= s

    return this
  }

  determinant() {
    const te = this.elements

    const n11 = te[0],
      n12 = te[4],
      n13 = te[8],
      n14 = te[12]
    const n21 = te[1],
      n22 = te[5],
      n23 = te[9],
      n24 = te[13]
    const n31 = te[2],
      n32 = te[6],
      n33 = te[10],
      n34 = te[14]
    const n41 = te[3],
      n42 = te[7],
      n43 = te[11],
      n44 = te[15]

    //TODO: make this more efficient
    //( based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm )

    return (
      n41 *
        (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
      n42 *
        (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
      n43 *
        (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
      n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
    )
  }

  transpose() {
    const te = this.elements
    let tmp

    tmp = te[1]
    te[1] = te[4]
    te[4] = tmp
    tmp = te[2]
    te[2] = te[8]
    te[8] = tmp
    tmp = te[6]
    te[6] = te[9]
    te[9] = tmp

    tmp = te[3]
    te[3] = te[12]
    te[12] = tmp
    tmp = te[7]
    te[7] = te[13]
    te[13] = tmp
    tmp = te[11]
    te[11] = te[14]
    te[14] = tmp

    return this
  }

  setPosition(x, y, z) {
    const te = this.elements

    if (x.isVector3) {
      te[12] = x.x
      te[13] = x.y
      te[14] = x.z
    } else {
      te[12] = x
      te[13] = y
      te[14] = z
    }

    return this
  }

  invert() {
    // based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
    const te = this.elements,
      n11 = te[0],
      n21 = te[1],
      n31 = te[2],
      n41 = te[3],
      n12 = te[4],
      n22 = te[5],
      n32 = te[6],
      n42 = te[7],
      n13 = te[8],
      n23 = te[9],
      n33 = te[10],
      n43 = te[11],
      n14 = te[12],
      n24 = te[13],
      n34 = te[14],
      n44 = te[15],
      t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44,
      t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44,
      t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44,
      t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14

    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

    const detInv = 1 / det

    te[0] = t11 * detInv
    te[1] =
      (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) *
      detInv
    te[2] =
      (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) *
      detInv
    te[3] =
      (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) *
      detInv

    te[4] = t12 * detInv
    te[5] =
      (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) *
      detInv
    te[6] =
      (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) *
      detInv
    te[7] =
      (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) *
      detInv

    te[8] = t13 * detInv
    te[9] =
      (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) *
      detInv
    te[10] =
      (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) *
      detInv
    te[11] =
      (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) *
      detInv

    te[12] = t14 * detInv
    te[13] =
      (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) *
      detInv
    te[14] =
      (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) *
      detInv
    te[15] =
      (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) *
      detInv

    return this
  }

  scale(v) {
    const te = this.elements
    const x = v.x,
      y = v.y,
      z = v.z

    te[0] *= x
    te[4] *= y
    te[8] *= z
    te[1] *= x
    te[5] *= y
    te[9] *= z
    te[2] *= x
    te[6] *= y
    te[10] *= z
    te[3] *= x
    te[7] *= y
    te[11] *= z

    return this
  }

  getMaxScaleOnAxis() {
    const te = this.elements

    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2]
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6]
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10]

    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq))
  }

  makeTranslation(x, y, z) {
    if (x.isVector3) {
      this.set(1, 0, 0, x.x, 0, 1, 0, x.y, 0, 0, 1, x.z, 0, 0, 0, 1)
    } else {
      this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1)
    }

    return this
  }

  makeRotationX(theta) {
    const c = Math.cos(theta),
      s = Math.sin(theta)

    this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1)

    return this
  }

  makeRotationY(theta) {
    const c = Math.cos(theta),
      s = Math.sin(theta)

    this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1)

    return this
  }

  makeRotationZ(theta) {
    const c = Math.cos(theta),
      s = Math.sin(theta)

    this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)

    return this
  }

  makeRotationAxis(axis, angle) {
    // Based on http://www.gamedev.net/reference/articles/article1199.asp

    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const t = 1 - c
    const x = axis.x,
      y = axis.y,
      z = axis.z
    const tx = t * x,
      ty = t * y

    this.set(
      tx * x + c,
      tx * y - s * z,
      tx * z + s * y,
      0,
      tx * y + s * z,
      ty * y + c,
      ty * z - s * x,
      0,
      tx * z - s * y,
      ty * z + s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1
    )

    return this
  }

  makeScale(x, y, z) {
    this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1)

    return this
  }

  makeShear(xy, xz, yx, yz, zx, zy) {
    this.set(1, yx, zx, 0, xy, 1, zy, 0, xz, yz, 1, 0, 0, 0, 0, 1)

    return this
  }

  compose(position, quaternion, scale) {
    const te = this.elements

    const x = quaternion._x,
      y = quaternion._y,
      z = quaternion._z,
      w = quaternion._w
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2

    const sx = scale.x,
      sy = scale.y,
      sz = scale.z

    te[0] = (1 - (yy + zz)) * sx
    te[1] = (xy + wz) * sx
    te[2] = (xz - wy) * sx
    te[3] = 0

    te[4] = (xy - wz) * sy
    te[5] = (1 - (xx + zz)) * sy
    te[6] = (yz + wx) * sy
    te[7] = 0

    te[8] = (xz + wy) * sz
    te[9] = (yz - wx) * sz
    te[10] = (1 - (xx + yy)) * sz
    te[11] = 0

    te[12] = position.x
    te[13] = position.y
    te[14] = position.z
    te[15] = 1

    return this
  }

  decompose(position, quaternion, scale) {
    const te = this.elements

    let sx = _v1.set(te[0], te[1], te[2]).length()
    const sy = _v1.set(te[4], te[5], te[6]).length()
    const sz = _v1.set(te[8], te[9], te[10]).length()

    // if determine is negative, we need to invert one scale
    const det = this.determinant()
    if (det < 0) sx = -sx

    position.x = te[12]
    position.y = te[13]
    position.z = te[14]

    // scale the rotation part
    _m1.copy(this)

    const invSX = 1 / sx
    const invSY = 1 / sy
    const invSZ = 1 / sz

    _m1.elements[0] *= invSX
    _m1.elements[1] *= invSX
    _m1.elements[2] *= invSX

    _m1.elements[4] *= invSY
    _m1.elements[5] *= invSY
    _m1.elements[6] *= invSY

    _m1.elements[8] *= invSZ
    _m1.elements[9] *= invSZ
    _m1.elements[10] *= invSZ

    quaternion.setFromRotationMatrix(_m1)

    scale.x = sx
    scale.y = sy
    scale.z = sz

    return this
  }

  makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem) {
    const te = this.elements
    const x = (2 * near) / (right - left)
    const y = (2 * near) / (top - bottom)

    const a = (right + left) / (right - left)
    const b = (top + bottom) / (top - bottom)

    let c, d

    if (coordinateSystem === WebGLCoordinateSystem) {
      c = -(far + near) / (far - near)
      d = (-2 * far * near) / (far - near)
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      c = -far / (far - near)
      d = (-far * near) / (far - near)
    } else {
      throw new Error('THREE.Matrix4.makePerspective(): Invalid coordinate system: ' + coordinateSystem)
    }

    te[0] = x
    te[4] = 0
    te[8] = a
    te[12] = 0
    te[1] = 0
    te[5] = y
    te[9] = b
    te[13] = 0
    te[2] = 0
    te[6] = 0
    te[10] = c
    te[14] = d
    te[3] = 0
    te[7] = 0
    te[11] = -1
    te[15] = 0

    return this
  }

  makeOrthographic(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem) {
    const te = this.elements
    const w = 1.0 / (right - left)
    const h = 1.0 / (top - bottom)
    const p = 1.0 / (far - near)

    const x = (right + left) * w
    const y = (top + bottom) * h

    let z, zInv

    if (coordinateSystem === WebGLCoordinateSystem) {
      z = (far + near) * p
      zInv = -2 * p
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      z = near * p
      zInv = -1 * p
    } else {
      throw new Error('THREE.Matrix4.makeOrthographic(): Invalid coordinate system: ' + coordinateSystem)
    }

    te[0] = 2 * w
    te[4] = 0
    te[8] = 0
    te[12] = -x
    te[1] = 0
    te[5] = 2 * h
    te[9] = 0
    te[13] = -y
    te[2] = 0
    te[6] = 0
    te[10] = zInv
    te[14] = -z
    te[3] = 0
    te[7] = 0
    te[11] = 0
    te[15] = 1

    return this
  }

  equals(matrix) {
    const te = this.elements
    const me = matrix.elements

    for (let i = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false
    }

    return true
  }

  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset]
    }

    return this
  }

  toArray(array = [], offset = 0) {
    const te = this.elements

    array[offset] = te[0]
    array[offset + 1] = te[1]
    array[offset + 2] = te[2]
    array[offset + 3] = te[3]

    array[offset + 4] = te[4]
    array[offset + 5] = te[5]
    array[offset + 6] = te[6]
    array[offset + 7] = te[7]

    array[offset + 8] = te[8]
    array[offset + 9] = te[9]
    array[offset + 10] = te[10]
    array[offset + 11] = te[11]

    array[offset + 12] = te[12]
    array[offset + 13] = te[13]
    array[offset + 14] = te[14]
    array[offset + 15] = te[15]

    return array
  }
}

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const FORWARD = new Vector3(0, 0, 1)
const RIGHT = new Vector3(1, 0, 0)
const UP = new Vector3(0, 1, 0)

const _v1 = /*@__PURE__*/ new Vector3()
const _m1 = /*@__PURE__*/ new Matrix4()
const _zero = /*@__PURE__*/ new Vector3(0, 0, 0)
const _one = /*@__PURE__*/ new Vector3(1, 1, 1)
const _x = /*@__PURE__*/ new Vector3()
const _y = /*@__PURE__*/ new Vector3()
const _z = /*@__PURE__*/ new Vector3()
const _vector = new Vector3()
const _quaternion = new Quaternion()

const v0 = new Vector3()
const v1 = new Vector3()
const v2 = new Vector3()
const v3 = new Vector3()
const v4 = new Vector3()
const v5 = new Vector3()
const v6 = new Vector3()
const v7 = new Vector3()
const q0 = new Quaternion()
const q1 = new Quaternion()
const q2 = new Quaternion()
const q3 = new Quaternion()
const q4 = new Quaternion()
const q5 = new Quaternion()
const q6 = new Quaternion()
const q7 = new Quaternion()
const m1 = new Matrix4()

const systemsById = {}

let debug = false

function num(min, max, dp = 0) {
  const randomValue = Math.random() * (max - min) + min
  return parseFloat(randomValue.toFixed(dp))
}

function dot(a1, a2, b1, b2) {
  return a1 * b1 + a2 * b2
}

// matches our glsl prng(vec2)
function prng(x, y) {
  const val = dot(x, y, 12.9898, 78.233)
  return (((Math.sin(val) * 43758.5453) % 1) + 1) % 1 // Ensure it's always positive
}

class System {
  constructor({
    id,
    duration,
    loop,
    prewarm,
    delay,
    rate,
    maxParticles,
    seed,
    lifeType,
    lifeConstant,
    lifeCurve,
    speedType,
    speedConstant,
    speedCurve,
    shapeType,
    shapeRadius,
    shapeThickness,
    shapeArc,
    shapeAngle,
    shapeRandomizeDir,
    worldSpace,
    velocityLifetime,
    velocityLinear,
    velocityLinearWorld,
    velocityOrbital,
    velocityOrbitalOffset,
    velocityOrbitalRadial,
    dataWidth,
  }) {
    this.id = id
    this.duration = duration
    this.loop = loop
    this.prewarm = prewarm
    this.delay = delay
    this.rate = rate
    this.maxParticles = maxParticles
    this.seed = seed
    this.nextId = 0
    this.dataWidth = dataWidth

    this.lifeType = lifeType
    if (this.lifeType === 'constant') {
      this.life = new ValueConstant(lifeConstant)
    } else if (this.lifeType === 'linear-curve' || this.lifeType === 'random-curve') {
      this.life = new ValueCurve(lifeCurve)
    }
    this.maxLife = this.life.getMax(this.dataWidth)

    this.speedType = speedType
    if (this.speedType === 'constant') {
      this.speed = new ValueConstant(speedConstant)
    } else if (this.speedType === 'linear-curve' || this.speedType === 'random-curve') {
      this.speed = new ValueCurve(speedCurve)
    }

    const Shape = Shapes[shapeType]
    this.shape = new Shape({
      radius: shapeRadius,
      thickness: shapeThickness,
      arc: shapeArc,
      angle: shapeAngle,
      randomizeDir: shapeRandomizeDir,
    })

    this.worldSpace = worldSpace
    this.velocityLifetime = velocityLifetime
    this.velocityLinear = velocityLinear
    this.velocityLinearWorld = velocityLinearWorld
    this.velocityOrbital = velocityOrbital
    this.velocityOrbitalOffset = velocityOrbitalOffset
    this.velocityOrbitalRadial = velocityOrbitalRadial

    this.particles = []
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push(new Particle(i))
    }

    this.elapsed = 0
    this.delayTime = this.delay || 0
    this.newParticles = 0
    this.emitting = false
  }

  play() {
    this.emitting = true
  }

  pause() {
    this.emitting = false
  }

  stop({ seed }) {
    this.delayTime = this.delay || 0
    this.elapsed = 0
    this.nextId = 0
    this.seed = seed
    this.emitting = false
    this.prewarming = false
    this.prewarmed = false
    for (const particle of this.particles) {
      particle.age = 0
      particle.life = 0
    }
  }

  emitCustom({ worldPosition, amount }) {
    worldPosition = v1.fromArray(worldPosition)

    const startAlpha = 0

    for (let i = 0; i < amount; i++) {
      const particle = this.particles.find(p => p.age >= p.life)
      if (!particle) break

      particle.id = prng(this.nextId++, this.seed)
      particle.age = 0
      particle.life = this.life.get(this.lifeType === 'random-curve' ? prng(particle.id, 0.734) : startAlpha) // prettier-ignore
      particle.startAlpha = startAlpha
      this.shape.init(particle)
      particle.position.add(worldPosition)
      // if (this.worldSpace) {
      //   particle.position.applyMatrix4(worldMatrix)
      //   particle.direction.applyQuaternion(worldQuaternion)
      // }
      if (this.velocityLifetime) {
        particle.velocity.fromArray(this.velocityLinear)
      }
      particle.speed = this.speed.get(this.speedType === 'random-curve' ? prng(particle.id, 0.142) : startAlpha)
      particle.distance = Infinity
      particle.startPosition.copy(particle.position)
      particle.finalPosition.set(0, 0, 0)
    }
  }

  emit({ amount, startAlpha, worldMatrix, worldQuaternion }) {
    // worldMatrix = m1.fromArray(worldMatrix)
    // worldQuaternion = q1.fromArray(worldQuaternion)

    if (debug) console.time('emit')

    for (let i = 0; i < amount; i++) {
      const particle = this.particles.find(p => p.age >= p.life)
      if (!particle) break

      particle.id = prng(this.nextId++, this.seed)
      particle.age = 0
      particle.life = this.life.get(this.lifeType === 'random-curve' ? prng(particle.id, 0.734) : startAlpha) // prettier-ignore
      particle.startAlpha = startAlpha
      this.shape.init(particle)
      if (this.worldSpace) {
        particle.position.applyMatrix4(worldMatrix)
        particle.direction.applyQuaternion(worldQuaternion)
      }
      if (this.velocityLifetime) {
        particle.velocity.fromArray(this.velocityLinear)
      }
      particle.speed = this.speed.get(this.speedType === 'random-curve' ? prng(particle.id, 0.142) : startAlpha)
      particle.distance = Infinity
      particle.startPosition.copy(particle.position)
      particle.finalPosition.set(0, 0, 0)
    }

    if (debug) console.timeEnd('emit')
  }

  update({
    delta,
    worldMatrix,
    worldQuaternion,
    camPosition,
    sort,
    aPosition,
    aStartAlpha,
    aLifeAlpha,
    aMaxLifeAlpha,
    aID,
  }) {
    if (this.emitting && this.loop && this.prewarm && !this.prewarming && !this.prewarmed) {
      if (debug) console.time('prewarm')
      this.prewarming = true
      for (let i = 0; i < this.duration * 60; i++) {
        this.update({
          delta: 1 / 60,
          worldMatrix,
          worldQuaternion,
          camPosition,
          sort,
          aPosition,
          aStartAlpha,
          aLifeAlpha,
          aMaxLifeAlpha,
          aID,
        })
      }
      this.prewarming = false
      this.prewarmed = true
      if (debug) console.timeEnd('prewarm')
    }

    if (debug && !this.prewarming) console.time('update')

    worldMatrix = m1.fromArray(worldMatrix)
    worldQuaternion = q0.fromArray(worldQuaternion)
    camPosition = v0.fromArray(camPosition)

    let emitting = this.emitting
    if (emitting && this.delayTime >= 0) {
      this.delayTime -= delta
      emitting = false
    }
    if (emitting) {
      this.elapsed += delta
      this.newParticles += delta * this.rate
      const amount = Math.floor(this.newParticles)
      if (amount > 0) {
        const startAlpha = this.elapsed / this.duration
        this.emit({ amount, startAlpha, worldMatrix, worldQuaternion })
        this.newParticles -= amount
      }
    }

    let n = 0
    for (const particle of this.particles) {
      // age
      particle.age += delta

      // check still alive
      if (particle.age >= particle.life) continue

      // direction + speed
      const initDisplacement = v1.copy(particle.direction).multiplyScalar(particle.speed * delta) // prettier-ignore
      particle.position.add(initDisplacement)

      // velocity over lifetime
      if (this.velocityLifetime) {
        // linear velocity
        const linearDisplacement = v2.copy(particle.velocity).multiplyScalar(delta) // prettier-ignore
        if (!this.velocityLinearWorld) {
          linearDisplacement.applyQuaternion(worldQuaternion)
        }
        particle.position.add(linearDisplacement)
        // orbital velocity
        const orbits = this.velocityOrbital[0] || this.velocityOrbital[1] || this.velocityOrbital[2] // prettier-ignore
        if (orbits) {
          const orbitCenter = v3.fromArray(this.velocityOrbitalOffset) // todo: orbital offset field
          if (this.worldSpace) {
            orbitCenter.applyMatrix4(worldMatrix)
          }
          const startPosition = v4.copy(particle.position)
          const directionToParticle = v5.copy(startPosition).sub(orbitCenter) // prettier-ignore
          const orbitDistance = directionToParticle.length()
          directionToParticle.normalize()
          const quaternionX = q1.setFromAxisAngle(RIGHT, this.velocityOrbital[0] * delta) // prettier-ignore
          const quaternionY = q2.setFromAxisAngle(UP, this.velocityOrbital[1] * delta) // prettier-ignore
          const quaternionZ = q3.setFromAxisAngle(FORWARD, this.velocityOrbital[2] * delta) // prettier-ignore
          const combinedQuaternion = q4.multiplyQuaternions(quaternionX, quaternionY).multiply(quaternionZ) // prettier-ignore
          directionToParticle.applyQuaternion(combinedQuaternion)
          const radialOffset = v6.copy(directionToParticle).multiplyScalar(this.velocityOrbitalRadial * delta) // prettier-ignore
          const newParticlePosition = directionToParticle.multiplyScalar(orbitDistance).add(orbitCenter).add(radialOffset) // prettier-ignore
          const orbitalDisplacement = newParticlePosition.sub(startPosition)
          particle.position.add(orbitalDisplacement)
        }
      }

      // final position + worldToLocal if needed
      particle.finalPosition.copy(particle.position)
      if (!this.worldSpace) {
        particle.finalPosition.applyMatrix4(worldMatrix)
      }

      // distance
      particle.distance = particle.finalPosition.distanceToSquared(camPosition) // prettier-ignore
      n++
    }

    if (this.elapsed >= this.duration) {
      this.elapsed = 0
      if (!this.loop) {
        this.pause()
      }
    }

    // don't update buffers and respond yet
    if (this.prewarming) return

    if (sort) {
      this.particles.sort((a, b) => b.distance - a.distance)
    }

    n = 0
    for (const particle of this.particles) {
      if (particle.age >= particle.life) continue
      aPosition[n * 3 + 0] = particle.finalPosition.x
      aPosition[n * 3 + 1] = particle.finalPosition.y
      aPosition[n * 3 + 2] = particle.finalPosition.z
      aStartAlpha[n * 1 + 0] = particle.startAlpha
      aLifeAlpha[n * 1 + 0] = particle.age / particle.life
      aMaxLifeAlpha[n * 1 + 0] = particle.age / this.maxLife
      aID[n * 1 + 0] = particle.id
      n++
    }

    self.postMessage(
      {
        systemId: this.id,
        op: 'update',
        n,
        aPosition,
        aStartAlpha,
        aLifeAlpha,
        aMaxLifeAlpha,
        aID,
      },
      [aPosition.buffer, aStartAlpha.buffer, aLifeAlpha.buffer, aMaxLifeAlpha.buffer, aID.buffer]
    )

    if (debug && !this.prewarming) console.timeEnd('update')
  }

  destroy() {
    this.particles = null
  }
}

class Particle {
  constructor(id) {
    this.id = id
    this.age = 0
    this.life = 0
    this.position = new Vector3()
    this.direction = new Vector3()
    this.velocity = new Vector3()
    this.speed = 1
    this.size = 1
    this.distance = 0
    this.startPosition = new Vector3()
    this.finalPosition = new Vector3() // rendered position
  }
}

self.onmessage = msg => {
  msg = msg.data
  switch (msg.op) {
    case 'create':
      const system = new System(msg)
      systemsById[msg.id] = system
      break
    case 'play':
      systemsById[msg.systemId]?.play()
      break
    case 'pause':
      systemsById[msg.systemId]?.pause()
      break
    case 'stop':
      systemsById[msg.systemId]?.stop(msg)
      break
    case 'update':
      systemsById[msg.systemId]?.update(msg)
      break
    case 'emitCustom':
      systemsById[msg.systemId]?.emitCustom(msg)
      break
    case 'destroy':
      systemsById[msg.systemId]?.destroy()
      systemsById[msg.systemId] = null
      break
    case 'debug':
      debug = msg.enabled
      break
  }
  // console.log('[worker]', msg)
  // self.postMessage(result);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function lerp(x, y, t) {
  return (1 - t) * x + t * y
}

class ValueConstant {
  constructor(constant) {
    this.constant = constant
  }
  get(alpha) {
    return this.constant
  }
  getMax(samples) {
    return this.constant
  }
}

class ValueCurve {
  constructor(str) {
    this.curve = new Curve().deserialize(str)
  }
  get(alpha) {
    return this.curve.evaluate(alpha)
  }
  getMax(samples) {
    let max = -Infinity
    for (let i = 0; i < samples; i++) {
      const alpha = i / samples
      const value = this.get(alpha)
      if (max < value) max = value
    }
    return max
  }
}

// =====
// Curve
// =====

let nextId = 0

const arr1 = []

class Curve {
  constructor() {
    this.keyframes = []
    this.nextId = 0
  }

  deserialize(data) {
    if (!data) return this
    this.keyframes = data.split('|').map(kData => {
      return new Keyframe().deserialize(kData)
    })
    this.sort()
    return this
  }

  serialize() {
    return this.keyframes
      .map(keyframe => {
        return keyframe.serialize()
      })
      .join('|')
  }

  add(opts) {
    const keyframe = new Keyframe().set(opts)
    const foundIndex = this.keyframes.findIndex(k => k.time === keyframe.time)
    // if (foundIndex === 0) return console.warn('cant replace first keyframe')
    // if (foundIndex === this.keyframes.length -1) return console.warn('cant replace end keyframe') // prettier-ignore
    if (foundIndex === -1) {
      this.keyframes.push(keyframe)
    } else {
      this.keyframes[foundIndex] = keyframe
    }
    this.sort()
    return this
  }

  remove(keyframeId) {
    const idx = this.keyframes.findIndex(keyframe => keyframe.id === keyframeId)
    if (idx !== -1) this.keyframes.splice(idx, 1)
  }

  removeAtTime(time) {
    const idx = this.keyframes.findIndex(keyframe => keyframe.time === time)
    if (idx !== -1) this.keyframes.splice(idx, 1)
  }

  getClosest(t) {
    t = Math.max(0, Math.min(1, t))
    let lo = -1
    let hi = this.keyframes.length
    while (hi - lo > 1) {
      let mid = Math.round((lo + hi) / 2)
      if (this.keyframes[mid].time <= t) lo = mid
      else hi = mid
    }
    if (this.keyframes[lo].time === t) hi = lo
    if (lo === hi) {
      if (lo === 0) hi++
      else lo--
    }
    arr1[0] = lo
    arr1[1] = hi
    return arr1
  }

  evaluate(time) {
    if (time <= this.keyframes[0].time) {
      return this.keyframes[0].value
    }

    if (time >= this.keyframes[this.keyframes.length - 1].time) {
      return this.keyframes[this.keyframes.length - 1].value
    }

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      // prettier-ignore
      if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) { 
        const t = (time - this.keyframes[i].time) / (this.keyframes[i + 1].time - this.keyframes[i].time) // prettier-ignore
        const p0 = this.keyframes[i].value;
        const p1 = this.keyframes[i + 1].value;
        const m0 = this.keyframes[i].outTangent * (this.keyframes[i + 1].time - this.keyframes[i].time) // prettier-ignore
        const m1 = this.keyframes[i + 1].inTangent * (this.keyframes[i + 1].time - this.keyframes[i].time) // prettier-ignore
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
      }
    }
  }

  ogEvaluate(t) {
    return this.hermite(t, this.keyframes).y
  }

  hermite(t, keyframes) {
    const n = keyframes.length

    const [lo, hi] = this.getClosest(t)

    var i0 = lo
    var i1 = i0 + 1

    if (i0 > n - 1) throw new Error('Out of bounds')
    if (i0 === n - 1) i1 = i0

    var scale = keyframes[i1].time - keyframes[i0].time

    t = (t - keyframes[i0].time) / scale

    var t2 = t * t
    var it = 1 - t
    var it2 = it * it
    var tt = 2 * t
    var h00 = (1 + tt) * it2
    var h10 = t * it2
    var h01 = t2 * (3 - tt)
    var h11 = t2 * (t - 1)

    const x =
      h00 * keyframes[i0].time +
      h10 * keyframes[i0].outTangent * scale +
      h01 * keyframes[i1].time +
      h11 * keyframes[i1].inTangent * scale

    const y =
      h00 * keyframes[i0].value +
      h10 * keyframes[i0].outTangent * scale +
      h01 * keyframes[i1].value +
      h11 * keyframes[i1].inTangent * scale

    return { x, y }
  }

  sort() {
    this.keyframes.sort((a, b) => a.time - b.time)
    this.firstKeyframe = this.keyframes[0]
    this.lastKeyframe = this.keyframes[this.keyframes.length - 1]
  }

  move(keyframe, time, value, boundFirstLast) {
    const keyIndex = this.keyframes.indexOf(keyframe)

    if (keyIndex <= 0 || keyIndex >= this.keyframes.length - 1) {
      if (!boundFirstLast) {
        keyframe.value = value
      }
      return
    }
    keyframe.value = value
    keyframe.time = Math.max(0.001, Math.min(time, 0.999))

    this.sort()
  }

  copy() {
    return new Curve(
      this.keyframes.map(keyframe => {
        return new Keyframe({ ...keyframe })
      })
    )
  }
}

class Keyframe {
  constructor() {
    this.id = nextId++
    this.time = 0
    this.value = 0
    this.inTangent = 0
    this.outTangent = 0
    this.inMagnitude = -0.1
    this.outMagnitude = 0.1
  }

  set({ time, value, inTangent, outTangent }) {
    this.time = clamp(time, 0, 1)
    this.value = value || 0
    this.inTangent = inTangent || 0
    this.outTangent = outTangent || 0
    return this
  }

  deserialize(data) {
    const [time, value, inTangent, outTangent] = data.split(',')
    this.time = parseFloat(time) || 0
    this.value = parseFloat(value) || 0
    this.inTangent = parseFloat(inTangent) || 0
    this.outTangent = parseFloat(outTangent) || 0
    this.id = nextId++
    this.inMagnitude = -0.1
    this.outMagnitude = 0.1
    return this
  }

  serialize() {
    return [
      numToString(this.time),
      numToString(this.value),
      numToString(this.inTangent),
      numToString(this.outTangent),
    ].join(',')
  }

  getHandles() {
    return { in: this.getInHandle(), out: this.getOutHandle() }
  }

  getInHandle() {
    return {
      x: this.time + this.inMagnitude,
      y: this.value + this.inMagnitude * this.inTangent,
    }
  }

  getOutHandle() {
    return {
      x: this.time + this.outMagnitude,
      y: this.value + this.outMagnitude * this.outTangent,
    }
  }

  setTangentsFromHandles(tangents) {
    this.setInTangentFromHandle(tangents.in.x, tangents.in.y)
    this.setOutTangentFromHandle(tangents.out.x, tangents.out.y)
  }

  setInTangentFromHandle(x, y) {
    if (x >= this.time) return
    this.inMagnitude = x - this.time
    this.inTangent = (y - this.value) / this.inMagnitude
  }

  setOutTangentFromHandle(x, y) {
    if (x <= this.time) return
    this.outMagnitude = x - this.time
    this.outTangent = (y - this.value) / this.outMagnitude
  }
}

function numToString(num) {
  if (Number.isInteger(num)) return num.toString()
  return num.toFixed(3)
}

class ShapeCone {
  constructor({ radius, thickness, arc, angle, randomizeDir }) {
    this.radius = radius
    this.thickness = thickness
    this.arc = arc * DEG2RAD
    this.angle = angle * DEG2RAD
    this.randomizeDir = randomizeDir
    if (this.radius === 0) this.radius = 0.001
  }

  init(particle) {
    // Randomly select a distance from the center, adjusted for a more uniform distribution
    const innerRadius = this.radius * (1 - this.thickness)
    const randomDistance = innerRadius + Math.sqrt(prng(particle.id, 0.128)) * this.radius * this.thickness // prettier-ignore
    // Start angle is assumed to be 0, but you can adjust this if needed
    const startAngle = 0
    // Random angle to determine the position on the circle, restricted by the arc value
    const randomAngle = startAngle + prng(particle.id, 0.417) * this.arc
    // Calculate the position using polar coordinates
    particle.position.x = randomDistance * Math.cos(randomAngle)
    particle.position.y = 0
    particle.position.z = randomDistance * Math.sin(randomAngle)
    // Calculate the direction based on the position
    const normalizedDistance = randomDistance / this.radius // This will be between 0 and 1
    const particleAngle = this.angle * normalizedDistance // Particle's upward angle based on distance from center
    particle.direction.x = Math.sin(particleAngle) * Math.cos(randomAngle)
    particle.direction.y = Math.cos(particleAngle)
    particle.direction.z = Math.sin(particleAngle) * Math.sin(randomAngle)
    if (this.randomizeDir) {
      this.applyRandomDirection(particle)
    }
  }

  applyRandomDirection(particle) {
    // this code is different to Circle and Cone as its constrainted by angle

    const randomAngleOffset = (prng(particle.id, 0.158) - 0.5) * this.angle // Random angle offset within the cone's angle
    const randomTilt = (prng(particle.id, 0.811) - 0.5) * this.angle // Random tilt within the cone's angle

    // Rotate the direction using spherical coordinates to introduce randomization
    const theta = Math.acos(particle.direction.y) + randomTilt
    const phi = Math.atan2(particle.direction.z, particle.direction.x) + randomAngleOffset // prettier-ignore

    const x = Math.sin(theta) * Math.cos(phi)
    const y = Math.cos(theta)
    const z = Math.sin(theta) * Math.sin(phi)

    const shapeDirection = v1.copy(particle.direction)
    const randomizedDirection = v2.set(x, y, z)
    particle.direction.lerpVectors(shapeDirection, randomizedDirection, this.randomizeDir) // prettier-ignore
  }
}

class ShapeSphere {
  constructor({ radius, thickness, arc, randomizeDir }) {
    this.radius = radius
    this.thickness = thickness
    this.arc = arc * DEG2RAD
    this.randomizeDir = randomizeDir
    if (this.radius === 0) this.radius = 0.001
  }

  //   init(particle) {
  //     const u = prng(particle.id, 0.144)
  //     const v = prng(particle.id, 0.643)
  //     const rand = lerp(1 - this.thickness, 1, prng(particle.id, 0.122))
  //     const theta = u * this.arc
  //     const phi = Math.acos(2.0 * v - 1.0)
  //     const sinTheta = Math.sin(theta)
  //     const cosTheta = Math.cos(theta)
  //     const sinPhi = Math.sin(phi)
  //     const cosPhi = Math.cos(phi)
  //     particle.position.x = sinPhi * cosTheta * this.radius * rand
  //     particle.position.y = sinPhi * sinTheta * this.radius * rand
  //     particle.position.z = cosPhi * this.radius * rand
  //     particle.direction.copy(particle.position).normalize()
  //     if (this.randomizeDir) {
  //       this.applyRandomDirection(particle)
  //     }
  //   }

  // distributes evenly with less clustering in the middle
  init(particle) {
    const u = prng(particle.id, 0.144)
    const v = prng(particle.id, 0.643)

    const theta = 2 * Math.PI * u // azimuthal angle
    const phi = Math.acos(1 - 2 * v) // polar angle
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)

    // Use the cube root to distribute particles uniformly throughout the volume.
    const cubicRand = prng(particle.id, 0.122)
    const rand = 1 - this.thickness + this.thickness * Math.cbrt(cubicRand)

    particle.position.x = sinPhi * cosTheta * this.radius * rand
    particle.position.y = sinPhi * sinTheta * this.radius * rand
    particle.position.z = cosPhi * this.radius * rand

    particle.direction.copy(particle.position).normalize()
    if (this.randomizeDir) {
      this.applyRandomDirection(particle)
    }
  }

  applyRandomDirection(particle) {
    // this code is the same for Circle and Sphere. Cone is unique in that randomization is constrained by angle.
    const shapeDirection = v1.copy(particle.direction).normalize()

    // generate a random direction on a unit sphere.
    const phi = prng(particle.id, 0.123) * Math.PI * 2
    const costheta = prng(particle.id, 0.321) * 2 - 1
    const theta = Math.acos(costheta)
    const x = Math.sin(theta) * Math.cos(phi)
    const y = Math.sin(theta) * Math.sin(phi)
    const z = Math.cos(theta)
    const randomDirection = v2.set(x, y, z)

    // blend
    particle.direction.lerpVectors(shapeDirection, randomDirection, this.randomizeDir)
  }
}

class ShapeCircle {
  constructor({ radius, thickness, arc, randomizeDir }) {
    this.radius = radius
    this.thickness = thickness
    this.arc = arc * DEG2RAD
    this.randomizeDir = randomizeDir
    if (this.radius === 0) this.radius = 0.001
  }

  init(particle) {
    const u = prng(particle.id, 0.144)
    const r = lerp(1 - this.thickness, 1, prng(particle.id, 0.643))
    const theta = u * this.arc
    particle.position.x = Math.cos(theta) * this.radius * r
    particle.position.z = Math.sin(theta) * this.radius * r
    particle.position.y = 0
    particle.direction.copy(particle.position).normalize()
    if (this.randomizeDir) {
      this.applyRandomDirection(particle)
    }
  }

  applyRandomDirection(particle) {
    // this code is the same for Circle and Sphere. Cone is unique in that randomization is constrained by angle.
    const shapeDirection = v1.copy(particle.direction).normalize()

    // generate a random direction on a unit sphere.
    const phi = prng(particle.id, 0.123) * Math.PI * 2
    const costheta = prng(particle.id, 0.321) * 2 - 1
    const theta = Math.acos(costheta)
    const x = Math.sin(theta) * Math.cos(phi)
    const y = Math.sin(theta) * Math.sin(phi)
    const z = Math.cos(theta)
    const randomDirection = v2.set(x, y, z)

    // blend
    particle.direction.lerpVectors(shapeDirection, randomDirection, this.randomizeDir)
  }
}

const Shapes = {
  cone: ShapeCone,
  sphere: ShapeSphere,
  circle: ShapeCircle,
}
