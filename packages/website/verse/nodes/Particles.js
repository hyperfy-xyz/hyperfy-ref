import * as THREE from 'three'

import { Node } from './Node'

import { Curve } from '../extras/Curve'
import CustomShaderMaterial from '../libs/three-custom-shader-material'
import { Gradient } from '../extras/Gradient'
import { isBoolean, isNumber } from 'lodash-es'

/**
 * TODO *
 *
 * - support custom emit, eg particlesRef.current.emit({ position, direction, ...etc })
 *
 * - tiles: 2x2|4x4|8x8, start frame constant/curve, lifetime curve
 * - velocity over lifetime: linear xyz+local|world, orbital xyz
 * - burst: time, count, cycles, interval (just one burst)
 * - noise
 * - scale option?
 *
 */

/**
 * Hyperfy Import Todos
 *
 * - didn't bring over this.object3d, do we really need this?
 * - hyperfy uses this.camera and stuff how do we apply here?
 * - unregisterUpdate: cant our system just iterate over particles?
 * - this.textureSrc, here we should just be able to reference a texture inside our glb
 */

const DEG2RAD = THREE.MathUtils.DEG2RAD
const FORWARD = new THREE.Vector3(0, 0, 1)
const DEFAULT_TEXTURE = '/static/particle-2.png'

const look = new THREE.Object3D()

const dummy = new THREE.Object3D()
dummy.rotation.order = 'YXZ'

const v1 = new THREE.Vector3()
const arr1 = []
const arr2 = []
const arr3 = []

const defaults = {
  name: 'particles',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  // Config
  autoPlay: false,
  duration: 5,
  loop: true,
  prewarm: false,
  delay: 0,
  lifeType: 'constant',
  lifeConstant: 5,
  lifeCurve: '0,5,0,0|1,5,0,0',
  speedType: 'constant',
  speedConstant: 1,
  speedCurve: '0,1,0,0|1,1,0,0',
  sizeType: 'constant',
  sizeConstant: 1,
  sizeCurve: '0,1,0,0|1,1,0,0',
  rotationType: 'constant',
  rotationConstant: 0,
  rotationCurve: '0,0,0,0|1,0,0,0',
  colorType: 'constant',
  colorConstant: '#ffffffff',
  colorGradient: 'a,0,1|a,1,1|c,0,1,1,1|c,1,1,1,1',
  timeScale: 1,
  maxParticles: 1000,
  autoRandomSeed: true,
  customSeed: '0',
  // Emission
  rate: 10,
  // Shape
  shapeType: 'cone',
  shapeRadius: 1,
  shapeThickness: 1,
  shapeArc: 360,
  shapeAngle: 25,
  shapeRandomizeDir: 0,
  // Size over lifetime
  sizeLifetime: false,
  sizeLifetimeCurve: '0,1,0,0|1,1,0,0',
  // Rotation over lifetime
  rotationLifetime: false,
  rotationLifetimeCurve: '0,0,0,0|1,0,0,0',
  // Color over lifetime
  colorLifetime: false,
  colorLifetimeGradient: 'a,0,1|a,1,1|c,0,1,1,1|c,1,1,1,1',
  // Velocity over lifetime
  velocityLifetime: false,
  velocityLinear: [0, 0, 0],
  velocityLinearWorld: false,
  velocityOrbital: [0, 0, 0],
  velocityOrbitalOffset: [0, 0, 0],
  velocityOrbitalRadial: 0,
  // Particle
  billboard: 'full',
  worldSpace: true,
  textureSrc: null,
  lit: true,
  additive: false,

  onReady: null,
}

export class Particles extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'particles'

    // Config
    this.autoPlay = isBoolean(data.autoPlay) ? data.autoPlay : defaults.autoPlay
    this.duration = isNumber(data.duration) ? data.duration : defaults.duration
    this.loop = isBoolean(data.loop) ? data.loop : defaults.loop
    this.prewarm = isBoolean(data.prewarm) ? data.prewarm : defaults.prewarm
    this.delay = isNumber(data.delay) ? data.delay : defaults.delay
    this.lifeType = data.lifeType || defaults.lifeType
    this.lifeConstant = isNumber(data.lifeConstant) ? data.lifeConstant : defaults.lifeConstant
    this.lifeCurve = new Curve().deserialize(data.lifeCurve || defaults.lifeCurve)
    this.speedType = data.speedType || defaults.speedType
    this.speedConstant = isNumber(data.speedConstant) ? data.speedConstant : defaults.speedConstant
    this.speedCurve = new Curve().deserialize(data.speedCurve || defaults.speedCurve)
    this.sizeType = data.sizeType || defaults.sizeType
    this.sizeConstant = isNumber(data.sizeConstant) ? data.sizeConstant : defaults.sizeConstant
    this.sizeCurve = new Curve().deserialize(data.sizeCurve || defaults.sizeCurve)
    this.rotationType = data.rotationType || defaults.rotationType
    this.rotationConstant = isNumber(data.rotationConstant) ? data.rotationConstant : defaults.rotationConstant
    this.rotationCurve = new Curve().deserialize(data.rotationCurve || defaults.rotationCurve)
    this.colorType = data.colorType || defaults.colorType
    this.colorConstant = new THREE.Color().setRGBAHex(data.colorConstant || defaults.colorConstant)
    this.colorGradient = new Gradient().deserialize(data.colorGradient || defaults.colorGradient)
    this.timeScale = isNumber(data.timeScale) ? data.timeScale : defaults.timeScale
    this.maxParticles = isNumber(data.maxParticles) ? data.maxParticles : defaults.maxParticles
    this.autoRandomSeed = isBoolean(data.autoRandomSeed) ? data.autoRandomSeed : defaults.autoRandomSeed
    this.customSeed = stringToSeed(data.customSeed || defaults.customSeed)
    // Emission
    this.rate = isNumber(data.rate) ? data.rate : defaults.rate
    // Shape
    this.shapeType = data.shapeType || defaults.shapeType
    this.shapeRadius = isNumber(data.shapeRadius) ? data.shapeRadius : defaults.shapeRadius
    this.shapeThickness = isNumber(data.shapeThickness) ? data.shapeThickness : defaults.shapeThickness
    this.shapeArc = isNumber(data.shapeArc) ? data.shapeArc : defaults.shapeArc
    this.shapeAngle = isNumber(data.shapeAngle) ? data.shapeAngle : defaults.shapeAngle
    this.shapeRandomizeDir = isNumber(data.shapeRandomizeDir) ? data.shapeRandomizeDir : defaults.shapeRandomizeDir
    // Size over lifetime
    this.sizeLifetime = isBoolean(data.sizeLifetime) ? data.sizeLifetime : defaults.sizeLifetime
    this.sizeLifetimeCurve = new Curve().deserialize(data.sizeLifetimeCurve || defaults.sizeLifetimeCurve)
    // Rotation over lifetime
    this.rotationLifetime = isBoolean(data.rotationLifetime) ? data.rotationLifetime : defaults.rotationLifetime
    this.rotationLifetimeCurve = new Curve().deserialize(data.rotationLifetimeCurve || defaults.rotationLifetimeCurve)
    // Color over lifetime
    this.colorLifetime = isBoolean(data.colorLifetime) ? data.colorLifetime : defaults.colorLifetime
    this.colorLifetimeGradient = new Gradient().deserialize(data.colorLifetimeGradient || defaults.colorLifetimeGradient) // prettier-ignore
    // Velocity over lifetime
    this.velocityLifetime = isBoolean(data.velocityLifetime) ? data.velocityLifetime : defaults.velocityLifetime
    this.velocityLinear = data.velocityLinear || defaults.velocityLinear
    this.velocityLinearWorld = isBoolean(data.velocityLinearWorld) ? data.velocityLinearWorld : defaults.velocityLinearWorld // prettier-ignore
    this.velocityOrbital = data.velocityOrbital || defaults.velocityOrbital
    this.velocityOrbitalOffset = data.velocityOrbitalOffset || defaults.velocityOrbitalOffset
    this.velocityOrbitalRadial = isNumber(data.velocityOrbitalRadial) ? data.velocityOrbitalRadial : defaults.velocityOrbitalRadial // prettier-ignore
    // Particle
    this.billboard = data.billboard || defaults.billboard
    this.worldSpace = isBoolean(data.worldSpace) ? data.worldSpace : defaults.worldSpace
    this.textureSrc = data.textureSrc || defaults.textureSrc
    this.lit = isBoolean(data.lit) ? data.lit : defaults.lit
    this.additive = isBoolean(data.additive) ? data.additive : defaults.additive

    this.onReady = data.onReady || defaults.onReady

    this.camPosition = new THREE.Vector3()
    this.camQuaternion = new THREE.Quaternion()
    this.worldPosition = new THREE.Vector3()
    this.worldQuaternion = new THREE.Quaternion()

    this.aPosition = null
    this.aStartAlpha = null
    this.aLifeAlpha = null
    this.aMaxLifeAlpha = null
    this.aID = null
    this.mesh
    this.uniforms = null

    this.n = 0
  }

  mount() {
    this.build()
  }

  commit(didMove) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove) {
      // ...
    }
  }

  unmount() {
    this.clear()
  }

  clear() {
    if (this.mesh) {
      // this.unregisterUpdate?.()
      this.system.destroy()
      this.system = null
      this.ctx.world.graphics.scene.remove(this.mesh)
      this.mesh.material.dispose()
      this.mesh.geometry.dispose()
      this.aPosition = null
      this.aStartAlpha = null
      this.aLifeAlpha = null
      this.aMaxLifeAlpha = null
      this.aID = null
      this.mesh = null
      this.uniforms = null
    }
  }

  async build() {
    const texture = new THREE.Texture()
    // texture.encoding = THREE.sRGBEncoding
    this.ctx.world.loader.loadTexture(this.textureSrc || DEFAULT_TEXTURE).then(t => {
      texture.image = t.image
      texture.needsUpdate = true
    })

    this.clear()

    const s = performance.now()

    const maxParticles = this.maxParticles

    const plane = new THREE.PlaneGeometry(1, 1, 1, 1)
    const geometry = new THREE.InstancedBufferGeometry().copy(plane)

    // aPosition: the world position of the particle
    const position = new Float32Array(maxParticles * 3)
    this.aPosition = new THREE.InstancedBufferAttribute(position, 3)
    this.aPosition.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aPosition', this.aPosition)

    // aStartAlpha: the (0-1) percentage of when a particle spawned, in relation to its cycle duration
    // formula: elapsed / duration
    const startAlpha = new Float32Array(maxParticles)
    this.aStartAlpha = new THREE.InstancedBufferAttribute(startAlpha, 1)
    this.aStartAlpha.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aStartAlpha', this.aStartAlpha)

    // aLifeAlpha: the (0-1) percentage of how far through each particles life it is
    // formula: age / life
    const lifeAlpha = new Float32Array(maxParticles)
    this.aLifeAlpha = new THREE.InstancedBufferAttribute(lifeAlpha, 1)
    this.aLifeAlpha.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aLifeAlpha', this.aLifeAlpha)

    // aMaxLifeAlpha: the percentage (0-1) life of a particle, based on the maximum possible life a particle could have.
    // formula: age / maxPossibleLife
    // this is used for rotation over lifetime as that is a velocity
    const maxLifeAlpha = new Float32Array(maxParticles)
    this.aMaxLifeAlpha = new THREE.InstancedBufferAttribute(maxLifeAlpha, 1)
    this.aMaxLifeAlpha.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aMaxLifeAlpha', this.aMaxLifeAlpha)

    // aID: unique id for each particle, used for PRNG random size/rotation/color etc
    const aID = new Float32Array(maxParticles)
    this.aID = new THREE.InstancedBufferAttribute(aID, 1)
    this.aID.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aID', this.aID)

    // curve and gradient data texture
    // --------
    // row0: size by start alpha
    // row1: rotation by start alpha
    // row2: color by start alpha
    // row3: size by lifetime
    // row4: rotation by lifetime (max possible lifetime, not individual)
    // row5: color by lifetime
    this.dataWidth = 1024
    this.dataHeight = 6 // 1 row
    this.dataArray = new Float32Array(this.dataWidth * this.dataHeight * 4) // 4 for RGBA
    this.data = new THREE.DataTexture(this.dataArray, this.dataWidth, this.dataHeight, THREE.RGBAFormat, THREE.FloatType) // prettier-ignore
    this.data.minFilter = THREE.NearestFilter // THREE.LinearFilter
    this.data.magFilter = THREE.NearestFilter // THREE.LinearFilter
    // this.data.needsUpdate = true // needed?

    const material = new CustomShaderMaterial({
      baseMaterial: this.lit ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial,
      // prettier-ignore
      vertexShader: `
        attribute vec3 aPosition;
        attribute float aStartAlpha;
        attribute float aLifeAlpha;
        attribute float aMaxLifeAlpha;
        attribute float aID;

        uniform vec4 uOrientation;
        uniform sampler2D uData;

        varying vec2 vUv;
        varying vec4 vColor;

        vec3 applyQuaternion(vec3 pos, vec4 quat) {
          vec3 qv = vec3(quat.x, quat.y, quat.z);
          vec3 t = 2.0 * cross(qv, pos);
          return pos + quat.w * t + cross(qv, t);
        }

        // usage: prng(vec2(x,y) * float seed)
        // see: https://gist.github.com/hb3p8/13f6d8c856e9b02ea369
        float prng(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float texelWidth = ${toFloat(1 / this.dataWidth)};
        float texelHeight = ${toFloat(1 / this.dataHeight)};
        float dataWidth = ${toFloat(this.dataWidth)};
        float dataHeight = ${toFloat(this.dataWidth)};
        vec4 getDataCoords(float row, float column) {
          return texture2D(uData, vec2(column * texelWidth + float(texelWidth * 0.5), row * texelHeight + float(texelHeight * 0.5) ));
        }
        vec4 getDataAlphaMix(float row, float alpha) {
          float position = alpha * dataWidth;
          float lowerPixel = floor(position);
          float upperPixel = lowerPixel + 1.0;
          float fractional = position - lowerPixel;
          vec4 lowerValue = texture(uData, vec2(lowerPixel * texelWidth, row * texelHeight + float(texelHeight * 0.5)));
          vec4 upperValue = texture(uData, vec2(upperPixel * texelWidth, row * texelHeight + float(texelHeight * 0.5)));
          return mix(lowerValue, upperValue, fractional);
        }

        #ifdef START_SIZE_CONSTANT
          float getStartSize(float startAlpha) {
            return ${toFloat(this.sizeConstant)};
          }
        #endif
        #ifdef START_SIZE_LINEAR_CURVE
          float getStartSize(float startAlpha) {
            return getDataAlphaMix(0.0, startAlpha).r;
          }
        #endif
        #ifdef START_SIZE_RANDOM_CURVE
          float getStartSize(float ignored) {
            float alpha = prng(vec2(aID, 0.137));
            return getDataAlphaMix(0.0, alpha).r;
          }
        #endif

        #ifdef START_ROTATION_CONSTANT
          float getStartRotation(float alpha) {
            return -${toFloat(this.rotationConstant)} * PI / 180.0;
          }
        #endif
        #ifdef START_ROTATION_LINEAR_CURVE
          float getStartRotation(float startAlpha) {
            return -getDataAlphaMix(1.0, startAlpha).r * PI / 180.0;
          }
        #endif
        #ifdef START_ROTATION_RANDOM_CURVE
          float getStartRotation(float ignored) {
            float alpha = prng(vec2(aID, 0.137));
            return -getDataAlphaMix(1.0, alpha).r * PI / 180.0;
          }
        #endif

        #ifdef START_COLOR_CONSTANT
          vec4 getStartColor(float startAlpha) {
            return vec4(${toFloat(this.colorConstant.r)}, ${toFloat(this.colorConstant.g)}, ${toFloat(this.colorConstant.b)}, ${toFloat(this.colorConstant.a)});
          }
        #endif
        #ifdef START_COLOR_LINEAR_GRADIENT
          vec4 getStartColor(float startAlpha) {
            return getDataAlphaMix(2.0, startAlpha);
          }
        #endif
        #ifdef START_COLOR_RANDOM_GRADIENT
          vec4 getStartColor(float ignored) {
            float alpha = prng(vec2(aID, 0.137));
            return getDataAlphaMix(2.0, alpha);
          }
        #endif

        #ifdef SIZE_OVER_LIFETIME
          float getSizeOverLifetime(float lifeAlpha) {
            return getDataAlphaMix(3.0, lifeAlpha).r;
          }
        #endif
        #ifdef ROTATION_OVER_LIFETIME
          float getRotationOverLifetime(float maxLifeAlpha) {
            // clockwise + deg2rad
            return -getDataAlphaMix(4.0, maxLifeAlpha).r * PI / 180.0;
          }
        #endif
        #ifdef COLOR_OVER_LIFETIME
          vec4 getColorOverLifetime(float lifeAlpha) {
            return getDataAlphaMix(5.0, lifeAlpha);
          }
        #endif

        vec4 sRGBToLinear(vec4 srgb) {
					vec4 linear;
					linear.r = pow(srgb.r, 2.2);
					linear.g = pow(srgb.g, 2.2);
					linear.b = pow(srgb.b, 2.2);
					linear.a = srgb.a;
					return linear;
				}

        void main() {
            vUv = uv;

            // color
            vec4 newColor = getStartColor(aStartAlpha);
            #ifdef COLOR_OVER_LIFETIME
              newColor *= getColorOverLifetime(aLifeAlpha);
            #endif
            vColor = newColor;

            vec3 newPosition = position;
            
            // rotation
            float rotation = getStartRotation(aStartAlpha);
            #ifdef ROTATION_OVER_LIFETIME
              rotation += getRotationOverLifetime(aMaxLifeAlpha);
            #endif
            float cosRot = cos(rotation);
            float sinRot = sin(rotation);
            newPosition = vec3(
                newPosition.x * cosRot - newPosition.y * sinRot,
                newPosition.x * sinRot + newPosition.y * cosRot,
                newPosition.z
            );

            // billboard
            newPosition = applyQuaternion(newPosition, uOrientation);
            
            // size
            float size = getStartSize(aStartAlpha);
            #ifdef SIZE_OVER_LIFETIME
              size *= getSizeOverLifetime(aLifeAlpha);
            #endif
            newPosition *= size;

            // position
            newPosition += aPosition;

            csm_Position = newPosition;
            // csm_PositionRaw = projectionMatrix * viewMatrix * modelMatrix * vec4(newPosition, 1.0);
        }   
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec2 vUv;
        varying vec4 vColor;

        void main() {
          vec4 texColor = texture(uTex, vUv);
          csm_DiffuseColor = texColor * vColor;
        }
      `,
      uniforms: {
        uOrientation: {
          value: new THREE.Quaternion(),
        },
        uTex: {
          value: texture,
        },
        uData: {
          value: this.data,
        },
        uSeed: {
          value: this.seed,
        },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    })
    if (this.lit) {
      material.roughness = 1
      material.metalness = 0
    }
    if (this.additive) {
      material.blending = THREE.AdditiveBlending
    }
    if (!material.defines) material.defines = {}
    if (this.sizeType === 'constant') material.defines['START_SIZE_CONSTANT'] = '' // prettier-ignore
    if (this.sizeType === 'linear-curve') material.defines['START_SIZE_LINEAR_CURVE'] = '' // prettier-ignore
    if (this.sizeType === 'random-curve') material.defines['START_SIZE_RANDOM_CURVE'] = '' // prettier-ignore
    if (this.colorType === 'constant') material.defines['START_COLOR_CONSTANT'] = '' // prettier-ignore
    if (this.colorType === 'linear-gradient') material.defines['START_COLOR_LINEAR_GRADIENT'] = '' // prettier-ignore
    if (this.colorType === 'random-gradient') material.defines['START_COLOR_RANDOM_GRADIENT'] = '' // prettier-ignore
    if (this.rotationType === 'constant') material.defines['START_ROTATION_CONSTANT'] = '' // prettier-ignore
    if (this.rotationType === 'linear-curve') material.defines['START_ROTATION_LINEAR_CURVE'] = '' // prettier-ignore
    if (this.rotationType === 'random-curve') material.defines['START_ROTATION_RANDOM_CURVE'] = '' // prettier-ignore
    if (this.sizeLifetime) material.defines['SIZE_OVER_LIFETIME'] = '' // prettier-ignore
    if (this.rotationLifetime) material.defines['ROTATION_OVER_LIFETIME'] = '' // prettier-ignore
    if (this.colorLifetime) material.defines['COLOR_OVER_LIFETIME'] = '' // prettier-ignore

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    // this.mesh.layers.set(GraphicsLayers.COSMETIC)
    this.ctx.world.graphics.scene.add(this.mesh)
    this.uniforms = material.uniforms

    // const Shape = Shapes[this.shapeType]
    // this.shape = new Shape({
    //   radius: this.shapeRadius,
    //   thickness: this.shapeThickness,
    //   arc: this.shapeArc,
    //   angle: this.shapeAngle,
    // })

    // TODO: this is only needed in the worker but we still need .maxLife here
    // so it has to stay?
    if (this.lifeType === 'constant') {
      this.life = new ValueConstant(this.lifeConstant)
    } else if (this.lifeType === 'linear-curve' || this.lifeType === 'random-curve') {
      this.life = new ValueCurve(this.lifeCurve)
    }
    this.maxLife = this.life.getMax(this.dataWidth)

    // if (this.speedType === 'constant') {
    //   this.speed = new ValueConstant(this.speedConstant)
    // } else if (
    //   this.speedType === 'linear-curve' ||
    //   this.speedType === 'random-curve'
    // ) {
    //   this.speed = new ValueCurve(this.speedCurve)
    // }

    if (this.sizeType === 'linear-curve' || this.sizeType === 'random-curve') {
      const row = this.dataWidth * 0 * 4 // row 0
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const value = this.sizeCurve.evaluate(alpha)
        this.dataArray[row + (i * 4 + 0)] = value
      }
      this.data.needsUpdate = true
    }

    if (this.rotationType === 'linear-curve' || this.rotationType === 'random-curve') {
      const row = this.dataWidth * 1 * 4 // row 1
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const value = this.rotationCurve.evaluate(alpha)
        this.dataArray[row + (i * 4 + 0)] = value
      }
      this.data.needsUpdate = true
    }

    if (this.colorType === 'linear-gradient' || this.colorType === 'random-gradient') {
      const row = this.dataWidth * 2 * 4 // row 2
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const value = this.colorGradient.evaluate(alpha)
        this.dataArray[row + (i * 4 + 0)] = value.r
        this.dataArray[row + (i * 4 + 1)] = value.g
        this.dataArray[row + (i * 4 + 2)] = value.b
        this.dataArray[row + (i * 4 + 3)] = value.a
      }
      this.data.needsUpdate = true
    }

    if (this.sizeLifetime) {
      const row = this.dataWidth * 3 * 4 // row 3
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const value = this.sizeLifetimeCurve.evaluate(alpha)
        this.dataArray[row + (i * 4 + 0)] = value
      }
      this.data.needsUpdate = true
    }

    if (this.rotationLifetime) {
      let accum = 0
      const row = this.dataWidth * 4 * 4 // row 4
      const delta = (1 / this.dataWidth) * this.maxLife
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const rotation = this.rotationLifetimeCurve.evaluate(alpha)
        accum += rotation * delta
        this.dataArray[row + (i * 4 + 0)] = accum
      }
      this.data.needsUpdate = true
    }

    if (this.colorLifetime) {
      const row = this.dataWidth * 5 * 4 // row 5
      for (let i = 0; i < this.dataWidth; i++) {
        const alpha = i / this.dataWidth
        const value = this.colorLifetimeGradient.evaluate(alpha)
        this.dataArray[row + (i * 4 + 0)] = value.r
        this.dataArray[row + (i * 4 + 1)] = value.g
        this.dataArray[row + (i * 4 + 2)] = value.b
        this.dataArray[row + (i * 4 + 3)] = value.a
      }
      this.data.needsUpdate = true
    }

    this.seed = this.autoRandomSeed ? Math.random() : this.customSeed
    this.uniforms.uSeed.value = this.seed

    // ping-pong buffers
    this.next = {
      aPosition: new Float32Array(maxParticles * 3),
      aStartAlpha: new Float32Array(maxParticles * 1),
      aLifeAlpha: new Float32Array(maxParticles * 1),
      aMaxLifeAlpha: new Float32Array(maxParticles * 1),
      aID: new Float32Array(maxParticles * 1),
    }

    this.system = this.ctx.world.particles.createSystem(this, {
      duration: this.duration,
      loop: this.loop,
      prewarm: this.prewarm,
      delay: this.delay,
      rate: this.rate,
      maxParticles: this.maxParticles,
      seed: this.seed,
      lifeType: this.lifeType,
      lifeConstant: this.lifeConstant,
      lifeCurve: this.lifeCurve.data,
      speedType: this.speedType,
      speedConstant: this.speedConstant,
      speedCurve: this.speedCurve.data,
      shapeType: this.shapeType,
      shapeRadius: this.shapeRadius,
      shapeThickness: this.shapeThickness,
      shapeArc: this.shapeArc,
      shapeAngle: this.shapeAngle,
      shapeRandomizeDir: this.shapeRandomizeDir,
      worldSpace: this.worldSpace,
      velocityLifetime: this.velocityLifetime,
      velocityLinear: this.velocityLinear,
      velocityLinearWorld: this.velocityLinearWorld,
      velocityOrbital: this.velocityOrbital,
      velocityOrbitalOffset: this.velocityOrbitalOffset,
      velocityOrbitalRadial: this.velocityOrbitalRadial,
      dataWidth: this.dataWidth,
    })
    this.system.skippedDelta = 0
    this.system.pending = false
    this.system.onMessage = msg => {
      if (msg.op === 'update') {
        // console.log(msg.aPosition)
        const n = msg.n
        this.next.aPosition = this.aPosition.array
        this.next.aStartAlpha = this.aStartAlpha.array
        this.next.aLifeAlpha = this.aLifeAlpha.array
        this.next.aMaxLifeAlpha = this.aMaxLifeAlpha.array
        this.next.aID = this.aID.array

        this.aPosition.array = msg.aPosition
        this.aPosition.updateRange.count = n * 3
        this.aPosition.needsUpdate = true
        this.aStartAlpha.array = msg.aStartAlpha
        this.aStartAlpha.updateRange.count = n * 1
        this.aStartAlpha.needsUpdate = true
        this.aLifeAlpha.array = msg.aLifeAlpha
        this.aLifeAlpha.updateRange.count = n * 1
        this.aLifeAlpha.needsUpdate = true
        this.aMaxLifeAlpha.array = msg.aMaxLifeAlpha
        this.aMaxLifeAlpha.updateRange.count = n * 1
        this.aMaxLifeAlpha.needsUpdate = true
        this.aID.array = msg.aID
        this.aID.updateRange.count = n * 1
        this.aID.needsUpdate = true

        this.mesh.geometry.instanceCount = n
        this.system.pending = false
      }
    }

    this.delayTime = this.delay || 0
    this.elapsed = 0
    if (this.autoPlay) {
      this.play()
    }

    // this.unregisterUpdate = this.engine.hooks.registerUpdate(this.update)

    this.onReady?.()

    console.log('[particles] build in', performance.now() - s)
  }

  update = delta => {
    // if (!this.engine.particles.active) return
    // const s = performance.now()

    delta = delta * this.timeScale

    // prevent huge jumps when switching tabs
    // if (delta > 0.1) delta = 0.1

    const uniforms = this.uniforms

    this.matrixWorld.decompose(this.worldPosition, this.worldQuaternion, v1)

    // this.object3d.updateWorldMatrix(true, false)
    // this.object3d.matrixWorld.decompose(this.worldPosition, this.worldQuaternion, v1) // prettier-ignore
    const camera = this.ctx.world.graphics.camera
    camera.matrixWorld.decompose(this.camPosition, this.camQuaternion, v1)
    // this.camera.updateMatrixWorld(true, false)
    // this.camera.matrixWorld.decompose(this.camPosition, this.camQuaternion, v1)

    // ensure each particle system is drawn back-to-front
    const distance = this.camPosition.distanceTo(this.worldPosition)
    this.mesh.renderOrder = -distance

    // billboard
    if (this.billboard === 'full') {
      look.quaternion.copy(this.camQuaternion)
    } else if (this.billboard === 'vertical') {
      const camForward = v1.copy(FORWARD).applyQuaternion(this.camQuaternion)
      camForward.y = 0
      camForward.normalize()
      look.quaternion.setFromUnitVectors(FORWARD, camForward)
    } else if (this.billboard === 'horizontal') {
      look.rotation.set(-90 * DEG2RAD, 0, 0)
    }
    uniforms.uOrientation.value.copy(look.quaternion)

    // update
    if (this.system.pending) {
      this.system.skippedDelta += delta
    } else {
      delta += this.system.skippedDelta
      this.system.skippedDelta = 0
      const worldMatrix = this.matrixWorld.toArray(arr1)
      const worldQuaternion = this.worldQuaternion.toArray(arr2)
      const camPosition = this.camPosition.toArray(arr3)
      const sort = !this.additive
      const aPosition = this.next.aPosition
      const aStartAlpha = this.next.aStartAlpha
      const aLifeAlpha = this.next.aLifeAlpha
      const aMaxLifeAlpha = this.next.aMaxLifeAlpha
      const aID = this.next.aID
      this.system.pending = true
      this.system.send(
        {
          op: 'update',
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
        },
        [aPosition.buffer, aStartAlpha.buffer, aLifeAlpha.buffer, aMaxLifeAlpha.buffer, aID.buffer]
      )
    }
  }

  play() {
    this.system.send({ op: 'play' })
  }

  pause() {
    this.system.send({ op: 'pause' })
  }

  restart() {
    this.stop()
    this.play()
  }

  stop() {
    this.seed = this.autoRandomSeed ? Math.random() : this.customSeed
    this.uniforms.uSeed.value = this.seed
    this.system.send({ op: 'stop', seed: this.seed })
  }

  emitCustom(worldPosition, amount) {
    worldPosition = worldPosition.toArray()
    this.system.send({
      op: 'emitCustom',
      worldPosition,
      amount,
    })
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    // Config
    this.autoPlay = source.autoPlay
    this.duration = source.duration
    this.loop = source.loop
    this.prewarm = source.prewarm
    this.delay = source.delay
    this.lifeType = source.lifeType
    this.lifeConstant = source.lifeConstant
    this.lifeCurve = source.lifeCurve
    this.speedType = source.speedType
    this.speedConstant = source.speedConstant
    this.speedCurve = source.speedCurve
    this.sizeType = source.sizeType
    this.sizeConstant = source.sizeConstant
    this.sizeCurve = source.sizeCurve
    this.rotationType = source.rotationType
    this.rotationConstant = source.rotationConstant
    this.rotationCurve = source.rotationCurve
    this.colorType = source.colorType
    this.colorConstant = source.colorConstant
    this.colorGradient = source.colorGradient
    this.timeScale = source.timeScale
    this.maxParticles = source.maxParticles
    this.autoRandomSeed = source.autoRandomSeed
    this.customSeed = source.customSeed
    // Emission
    this.rate = source.rate
    // Shape
    this.shapeType = source.shapeType
    this.shapeRadius = source.shapeRadius
    this.shapeThickness = source.shapeThickness
    this.shapeArc = source.shapeArc
    this.shapeAngle = source.shapeAngle
    this.shapeRandomizeDir = source.shapeRandomizeDir
    // Size over lifetime
    this.sizeLifetime = source.sizeLifetime
    this.sizeLifetimeCurve = source.sizeLifetimeCurve
    // Rotation over lifetime
    this.rotationLifetime = source.rotationLifetime
    this.rotationLifetimeCurve = source.rotationLifetimeCurve
    // Color over lifetime
    this.colorLifetime = source.colorLifetime
    this.colorLifetimeGradient = source.colorLifetimeGradient
    // Velocity over lifetime
    this.velocityLifetime = source.velocityLifetime
    this.velocityLinear = source.velocityLinear
    this.velocityLinearWorld = source.velocityLinearWorld
    this.velocityOrbital = source.velocityOrbital
    this.velocityOrbitalOffset = source.velocityOrbitalOffset
    this.velocityOrbitalRadial = source.velocityOrbitalRadial
    // Particle
    this.billboard = source.billboard
    this.worldSpace = source.worldSpace
    this.textureSrc = source.textureSrc
    this.lit = source.lit
    this.additive = source.additive

    this.onReady = source.onReady
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        // Config
        get autoPlay() {
          return self.autoPlay
        },
        set autoPlay(value) {
          self.autoPlay = value
          self.needsRebuild = true
          self.setDirty()
        },
        get duration() {
          return self.duration
        },
        set duration(value) {
          self.duration = value
          self.needsRebuild = true
          self.setDirty()
        },
        get loop() {
          return self.loop
        },
        set loop(value) {
          self.loop = value
          self.needsRebuild = true
          self.setDirty()
        },
        get prewarm() {
          return self.prewarm
        },
        set prewarm(value) {
          self.prewarm = value
          self.needsRebuild = true
          self.setDirty()
        },
        get delay() {
          return self.delay
        },
        set delay(value) {
          self.delay = value
          self.needsRebuild = true
          self.setDirty()
        },
        get lifeType() {
          return self.lifeType
        },
        set lifeType(value) {
          self.lifeType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get lifeConstant() {
          return self.lifeConstant
        },
        set lifeConstant(value) {
          self.lifeConstant = value
          self.needsRebuild = true
          self.setDirty()
        },
        get lifeCurve() {
          return self.lifeCurve
        },
        set lifeCurve(value) {
          self.lifeCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        get speedType() {
          return self.speedType
        },
        set speedType(value) {
          self.speedType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get speedConstant() {
          return self.speedConstant
        },
        set speedConstant(value) {
          self.speedConstant = value
          self.needsRebuild = true
          self.setDirty()
        },
        get speedCurve() {
          return self.speedCurve
        },
        set speedCurve(value) {
          self.speedCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        get sizeType() {
          return self.sizeType
        },
        set sizeType(value) {
          self.sizeType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get sizeConstant() {
          return self.sizeConstant
        },
        set sizeConstant(value) {
          self.sizeConstant = value
          self.needsRebuild = true
          self.setDirty()
        },
        get sizeCurve() {
          return self.sizeCurve
        },
        set sizeCurve(value) {
          self.sizeCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        get rotationType() {
          return self.rotationType
        },
        set rotationType(value) {
          self.rotationType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get rotationConstant() {
          return self.rotationConstant
        },
        set rotationConstant(value) {
          self.rotationConstant = value
          self.needsRebuild = true
          self.setDirty()
        },
        get rotationCurve() {
          return self.rotationCurve
        },
        set rotationCurve(value) {
          self.rotationCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        get colorType() {
          return self.colorType
        },
        set colorType(value) {
          self.colorType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get colorConstant() {
          return self.colorConstant
        },
        set colorConstant(value) {
          self.colorConstant = value
          self.needsRebuild = true
          self.setDirty()
        },
        get colorGeadient() {
          return self.colorGeadient
        },
        set colorGeadient(value) {
          self.colorGeadient = value
          self.needsRebuild = true
          self.setDirty()
        },
        get colorGradient() {
          return self.colorGradient
        },
        set colorGradient(value) {
          self.colorGradient = value
          self.needsRebuild = true
          self.setDirty()
        },
        get timeScale() {
          return self.timeScale
        },
        set timeScale(value) {
          self.timeScale = value
          self.needsRebuild = true
          self.setDirty()
        },
        get maxParticles() {
          return self.maxParticles
        },
        set maxParticles(value) {
          self.maxParticles = value
          self.needsRebuild = true
          self.setDirty()
        },
        get autoRandomSeed() {
          return self.autoRandomSeed
        },
        set autoRandomSeed(value) {
          self.autoRandomSeed = value
          self.needsRebuild = true
          self.setDirty()
        },
        get customSeed() {
          return self.customSeed
        },
        set customSeed(value) {
          self.customSeed = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Emission
        get rate() {
          return self.rate
        },
        set rate(value) {
          self.rate = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Shape
        get shapeType() {
          return self.shapeType
        },
        set shapeType(value) {
          self.shapeType = value
          self.needsRebuild = true
          self.setDirty()
        },
        get shapeRadius() {
          return self.shapeRadius
        },
        set shapeRadius(value) {
          self.shapeRadius = value
          self.needsRebuild = true
          self.setDirty()
        },
        get shapeThickness() {
          return self.shapeThickness
        },
        set shapeThickness(value) {
          self.shapeThickness = value
          self.needsRebuild = true
          self.setDirty()
        },
        get shapeArc() {
          return self.shapeArc
        },
        set shapeArc(value) {
          self.shapeArc = value
          self.needsRebuild = true
          self.setDirty()
        },
        get shapeAngle() {
          return self.shapeAngle
        },
        set shapeAngle(value) {
          self.shapeAngle = value
          self.needsRebuild = true
          self.setDirty()
        },
        get shapeRandomizeDir() {
          return self.shapeRandomizeDir
        },
        set shapeRandomizeDir(value) {
          self.shapeRandomizeDir = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Size over lifetime
        get sizeLifetime() {
          return self.sizeLifetime
        },
        set sizeLifetime(value) {
          self.sizeLifetime = value
          self.needsRebuild = true
          self.setDirty()
        },
        get sizeLifetimeCurve() {
          return self.sizeLifetimeCurve
        },
        set sizeLifetimeCurve(value) {
          self.sizeLifetimeCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Rotation over lifetime
        get rotationLifetime() {
          return self.rotationLifetime
        },
        set rotationLifetime(value) {
          self.rotationLifetime = value
          self.needsRebuild = true
          self.setDirty()
        },
        get rotationLifetimeCurve() {
          return self.rotationLifetimeCurve
        },
        set rotationLifetimeCurve(value) {
          self.rotationLifetimeCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Color over lifetime
        get colorLifetime() {
          return self.colorLifetime
        },
        set colorLifetime(value) {
          self.colorLifetime = value
          self.needsRebuild = true
          self.setDirty()
        },
        get colorLifetimeCurve() {
          return self.colorLifetimeCurve
        },
        set colorLifetimeCurve(value) {
          self.colorLifetimeCurve = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Velocity over lifetime
        get velocityLifetime() {
          return self.velocityLifetime
        },
        set velocityLifetime(value) {
          self.velocityLifetime = value
          self.needsRebuild = true
          self.setDirty()
        },
        get velocityLinear() {
          return self.velocityLinear
        },
        set velocityLinear(value) {
          self.velocityLinear = value
          self.needsRebuild = true
          self.setDirty()
        },
        get velocityLinearWorld() {
          return self.velocityLinearWorld
        },
        set velocityLinearWorld(value) {
          self.velocityLinearWorld = value
          self.needsRebuild = true
          self.setDirty()
        },
        get velocityOrbital() {
          return self.velocityOrbital
        },
        set velocityOrbital(value) {
          self.velocityOrbital = value
          self.needsRebuild = true
          self.setDirty()
        },
        get velocityOrbitalOffset() {
          return self.velocityOrbitalOffset
        },
        set velocityOrbitalOffset(value) {
          self.velocityOrbitalOffset = value
          self.needsRebuild = true
          self.setDirty()
        },
        get velocityOrbitalRadial() {
          return self.velocityOrbitalRadial
        },
        set velocityOrbitalRadial(value) {
          self.velocityOrbitalRadial = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Particle
        get billboard() {
          return self.billboard
        },
        set billboard(value) {
          self.billboard = value
          self.needsRebuild = true
          self.setDirty()
        },
        get worldSpace() {
          return self.worldSpace
        },
        set worldSpace(value) {
          self.worldSpace = value
          self.needsRebuild = true
          self.setDirty()
        },
        get textureSrc() {
          return self.textureSrc
        },
        set textureSrc(value) {
          self.textureSrc = value
          self.needsRebuild = true
          self.setDirty()
        },
        get lit() {
          return self.lit
        },
        set lit(value) {
          self.lit = value
          self.needsRebuild = true
          self.setDirty()
        },
        get additive() {
          return self.additive
        },
        set additive(value) {
          self.additive = value
          self.needsRebuild = true
          self.setDirty()
        },
        // Methods
        play() {
          self.play()
        },
        pause() {
          self.pause()
        },
        stop() {
          self.stop()
        },
        emit(worldPosition, amount) {
          self.emitCustom(worldPosition, amount)
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
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
  constructor(curve) {
    this.curve = curve
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

function toFloat(value) {
  const str = value.toString()
  return str.includes('.') ? str : str + '.0'
}

// matches our glsl prng(vec2)
// function dot(a1, a2, b1, b2) {
//   return a1 * b1 + a2 * b2
// }
// function prng(x, y) {
//   const val = dot(x, y, 12.9898, 78.233)
//   return (((Math.sin(val) * 43758.5453) % 1) + 1) % 1 // Ensure it's always positive
// }

function stringToSeed(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32-bit integer
  }
  return hash
}
