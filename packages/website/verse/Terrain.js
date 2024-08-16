import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'

import { System } from './System'

import CustomShaderMaterial from './libs/three-custom-shader-material'

import { createSurface } from './extras/SurfaceNets'
import { createColliderFactory } from './extras/createColliderFactory'
import { clamp } from './extras/utils'
import { Layers } from './extras/Layers'

const MODIFY_RATE = 1 / 30

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()

const center = new THREE.Vector3()
const nCenter = new THREE.Vector3()

// chunk grid size in # of voxels
const gridSize = new THREE.Vector3(16, 64, 16)

// chunk grid overlap (shared )
const gridBorder = 2

// chunk grid size inner (without border)
const gridSizeInner = new THREE.Vector3(
  gridSize.x - gridBorder * 2,
  gridSize.y - gridBorder * 2,
  gridSize.z - gridBorder * 2
)

const neighbourDirections = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1], // Orthogonal
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1], // Diagonal
]

// factor to convert chunk grid size in voxels to meters
const scale = 2

// TODO: have a utility size * scale vec3 for use instead of manually calculating everywhere

export class Terrain extends System {
  constructor(world) {
    super(world)
    this.chunks = new Map()
    this.modifyRate = 0
    this.editing = false
    this.seed(0.1)
  }

  start() {
    const layer1Map = this.world.loader.texLoader.load('/static/terrain/Grass1.png')
    layer1Map.wrapS = THREE.RepeatWrapping
    layer1Map.wrapT = THREE.RepeatWrapping
    layer1Map.colorSpace = THREE.SRGBColorSpace
    const layer2Map = this.world.loader.texLoader.load('/static/terrain/Sand3.png')
    layer2Map.wrapS = THREE.RepeatWrapping
    layer2Map.wrapT = THREE.RepeatWrapping
    layer2Map.colorSpace = THREE.SRGBColorSpace
    const layer3Map = this.world.loader.texLoader.load('/static/terrain/Cliffs2_1.png')
    layer3Map.wrapS = THREE.RepeatWrapping
    layer3Map.wrapT = THREE.RepeatWrapping
    layer3Map.colorSpace = THREE.SRGBColorSpace
    const noiseTexture = this.world.loader.texLoader.load('/static/terrain/noise.png')
    // const noiseTexture = generateNoiseTexture()
    noiseTexture.wrapS = THREE.RepeatWrapping
    noiseTexture.wrapT = THREE.RepeatWrapping
    this.material = new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhysicalMaterial,
      vertexShader: `
        attribute vec3 col;

        varying vec3 vPos;
        varying vec3 vNorm;
        varying vec3 vCol;

        void main() {
          // vPos = position;
          vNorm = normalize(normal);

          vec4 wPosition = modelMatrix * vec4(position, 1.0);
          vPos = wPosition.xyz;
          // vPos = worldPosition.xyz;

          vCol = col;
        }
      `,
      // fragmentShader: `
      //   // original
      //   uniform sampler2D layer1Map;
      //   uniform float layer1Scale;
      //   uniform sampler2D layer2Map;
      //   uniform float layer2Scale;
      //   uniform sampler2D layer3Map;
      //   uniform float layer3Scale;

      //   varying vec3 vPos;
      //   varying vec3 vNorm;
      //   varying vec3 vCol;

      //   vec4 textureTriplanar(sampler2D tex, float scale, vec3 normal, vec3 position) {
      //     vec2 uv_x = position.yz * scale;
      //     vec2 uv_y = position.xz * scale;
      //     vec2 uv_z = position.xy * scale;
      //     vec4 xProjection = texture2D(tex, uv_x);
      //     vec4 yProjection = texture2D(tex, uv_y);
      //     vec4 zProjection = texture2D(tex, uv_z);
      //     vec3 weight = abs(normal);
      //     weight = pow(weight, vec3(4.0)); // bias towards the major axis
      //     weight = weight / (weight.x + weight.y + weight.z);
      //     return xProjection * weight.x + yProjection * weight.y + zProjection * weight.z;
      //   }

      //   void main() {
      //     vec4 result = vec4(0, 0, 0, 1.0);
      //     // result += textureTriplanar(layer1Map, layer1Scale, vNorm, vPos);
      //     result += vCol.r * textureTriplanar(layer1Map, layer1Scale, vNorm, vPos);
      //     result += vCol.g * textureTriplanar(layer2Map, layer2Scale, vNorm, vPos);
      //     result += vCol.b * textureTriplanar(layer3Map, layer3Scale, vNorm, vPos);
      //     // result += vCol.b * textureTriplanar(layer2Map, layer2Scale, vNorm, vPos);
      //     // result += (1.0 - vCol.a) * textureTriplanar(layer2Map, layer2Scale, vNorm, vPos);
      //     csm_DiffuseColor *= result;
      //   }
      // `,
      fragmentShader: `
        // NoTile best performance so far
        // https://www.shadertoy.com/view/WdVGWG
        // https://claude.ai/chat/1911bc24-c928-4060-a05e-6a68f329c5a9

        uniform sampler2D layer1Map;
        uniform float layer1Scale;
        uniform sampler2D layer2Map;
        uniform float layer2Scale;
        uniform sampler2D layer3Map;
        uniform float layer3Scale;
        uniform sampler2D noiseTexture; // For smooth noise


        varying vec3 vPos;
        varying vec3 vNorm;
        varying vec3 vCol;

        const float layersCount = 5.0;
        const float pi = 3.141592;

        struct InterpNodes2 {
            vec2 seeds;
            vec2 weights;
        };

        InterpNodes2 GetNoiseInterpNodes(float smoothNoise) {
            vec2 globalPhases = vec2(smoothNoise * 0.5) + vec2(0.5, 0.0);
            vec2 phases = fract(globalPhases);
            vec2 seeds = floor(globalPhases) * 2.0 + vec2(0.0, 1.0);
            vec2 weights = min(phases, vec2(1.0) - phases) * 2.0;
            return InterpNodes2(seeds, weights);
        }

        vec3 hash33(vec3 p) {
            p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
                      dot(p,vec3(269.5,183.3,246.1)),
                      dot(p,vec3(113.5,271.9,124.6)));
            return fract(sin(p)*43758.5453123);
        }

        vec4 GetTextureSample(sampler2D tex, vec2 pos, float freq, float seed) {
            vec3 hash = hash33(vec3(seed, 0.0, 0.0));
            float ang = hash.x * 2.0 * pi;
            mat2 rotation = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
            
            vec2 uv = rotation * pos * freq + hash.yz;
            return texture2D(tex, uv);
        }

        // vec4 textureTriplanar(sampler2D tex, float scale, vec3 normal, vec3 position) {
        //   vec2 uv_x = position.yz * scale;
        //   vec2 uv_y = position.xz * scale;
        //   vec2 uv_z = position.xy * scale;
        //   vec4 xProjection = texture2D(tex, uv_x);
        //   vec4 yProjection = texture2D(tex, uv_y);
        //   vec4 zProjection = texture2D(tex, uv_z);
        //   vec3 weight = abs(normal);
        //   weight = pow(weight, vec3(4.0)); // bias towards the major axis
        //   weight = weight / (weight.x + weight.y + weight.z);
        //   return xProjection * weight.x + yProjection * weight.y + zProjection * weight.z;
        // }   
        
        vec4 textureTriplanarVaried(sampler2D tex, float scale, vec3 normal, vec3 position) {
            vec2 uv_x = position.yz * scale;
            vec2 uv_y = position.xz * scale;
            vec2 uv_z = position.xy * scale;
            
            float smoothNoise = texture2D(noiseTexture, position.xz * 0.002).r;
            InterpNodes2 interpNodes = GetNoiseInterpNodes(smoothNoise * layersCount);
            
            vec4 xProjection = vec4(0.0);
            vec4 yProjection = vec4(0.0);
            vec4 zProjection = vec4(0.0);
            
            for(int i = 0; i < 2; i++) {
                float weight = interpNodes.weights[i];
                xProjection += GetTextureSample(tex, uv_x, 1.0, interpNodes.seeds[i]) * weight;
                yProjection += GetTextureSample(tex, uv_y, 1.0, interpNodes.seeds[i]) * weight;
                zProjection += GetTextureSample(tex, uv_z, 1.0, interpNodes.seeds[i]) * weight;
            }
            
            vec3 blendWeight = abs(normal);
            blendWeight = pow(blendWeight, vec3(4.0)); // bias towards the major axis
            blendWeight = blendWeight / (blendWeight.x + blendWeight.y + blendWeight.z);
            
            return xProjection * blendWeight.x + yProjection * blendWeight.y + zProjection * blendWeight.z;
        }

        void main() {
          vec4 result = vec4(0, 0, 0, 1.0);
          // result += textureTriplanarVaried(layer1Map, layer1Scale, vNorm, vPos);
          result += vCol.r * textureTriplanarVaried(layer1Map, layer1Scale, vNorm, vPos);
          result += vCol.g * textureTriplanarVaried(layer2Map, layer2Scale, vNorm, vPos);
          result += vCol.b * textureTriplanarVaried(layer3Map, layer3Scale, vNorm, vPos);
          // result += vCol.b * textureTriplanarVaried(layer2Map, layer2Scale, vNorm, vPos);
          // result += (1.0 - vCol.a) * textureTriplanarVaried(layer2Map, layer2Scale, vNorm, vPos);
          csm_DiffuseColor *= result;
        }
      `,

      // fragmentShader: `
      //   uniform sampler2D layer1Map;
      //   uniform float layer1Scale;
      //   uniform sampler2D layer2Map;
      //   uniform float layer2Scale;
      //   uniform sampler2D layer3Map;
      //   uniform float layer3Scale;
      //   uniform sampler2D noiseTexture;

      //   varying vec3 vPos;
      //   varying vec3 vNorm;
      //   varying vec3 vCol;

      //   #define BLEND_WIDTH 0.4

      //   // vec4 getNoiseVec4(vec2 p) {
      //   //   return texture2D(noiseTexture, p);
      //   // }

      //   vec4 hash4(vec2 p) {
      //       return fract(sin(vec4(1.0+dot(p,vec2(37.0,17.0)),
      //                             2.0+dot(p,vec2(11.0,47.0)),
      //                             3.0+dot(p,vec2(41.0,29.0)),
      //                             4.0+dot(p,vec2(23.0,31.0))))*103.);
      //   }

      //   vec4 textureNoTile_3weights(sampler2D samp, in vec2 uv) {
      //     vec2 iuv = floor(uv);
      //     vec2 fuv = fract(uv);
      //     vec2 ddx = dFdx(uv);
      //     vec2 ddy = dFdy(uv);
      //     vec4 res = vec4(0.0);
      //     int sampleCnt = 0;

      //     float w3 = (fuv.x+fuv.y) - 1.;
      //     vec2 iuv3 = iuv;
      //     if(w3 < 0.) {
      //         w3 = -w3;
      //     } else {
      //         iuv3 += 1.;
      //     }
      //     w3 = smoothstep(BLEND_WIDTH, 1.-BLEND_WIDTH, w3);

      //     if(w3 <= 0.999) {
      //         float w12 = dot(fuv,vec2(.5,-.5)) + .5;
      //         w12 = smoothstep(1.125*BLEND_WIDTH, 1.-1.125*BLEND_WIDTH, w12);

      //         vec4 ofa = getNoiseVec4(iuv + vec2(1.0,0.0));
      //         vec4 ofb = getNoiseVec4(iuv + vec2(0.0,1.0));

      //         ofa.zw = sign(ofa.zw-0.5);
      //         ofb.zw = sign(ofb.zw-0.5);

      //         vec2 uva = uv*ofa.zw + ofa.xy; vec2 ddxa = ddx*ofa.zw; vec2 ddya = ddy*ofa.zw;
      //         vec2 uvb = uv*ofb.zw + ofb.xy; vec2 ddxb = ddx*ofb.zw; vec2 ddyb = ddy*ofb.zw;

      //         if(w12 >= 0.001) res += w12 * textureGrad(samp, uva, ddxa, ddya), sampleCnt++;
      //         if(w12 <= 0.999) res += (1.-w12) * textureGrad(samp, uvb, ddxb, ddyb), sampleCnt++;
      //     }

      //     if(w3 >= 0.001) {
      //         vec4 ofc = getNoiseVec4(iuv3);
      //         ofc.zw = sign(ofc.zw-0.5);
      //         vec2 uvc = uv*ofc.zw + ofc.xy; vec2 ddxc = ddx*ofc.zw; vec2 ddyc = ddy*ofc.zw;
      //         res = mix(res, textureGrad(samp, uvc, ddxc, ddyc), w3);
      //         sampleCnt++;
      //     }

      //     return res;
      //   }

      //   vec4 textureTriplanarNoTile(sampler2D tex, float scale, vec3 normal, vec3 position) {
      //     vec2 uv_x = position.yz * scale;
      //     vec2 uv_y = position.xz * scale;
      //     vec2 uv_z = position.xy * scale;
      //     vec4 xProjection = textureNoTile_3weights(tex, uv_x);
      //     vec4 yProjection = textureNoTile_3weights(tex, uv_y);
      //     vec4 zProjection = textureNoTile_3weights(tex, uv_z);
      //     vec3 weight = abs(normal);
      //     weight = pow(weight, vec3(4.0)); // bias towards the major axis
      //     weight = weight / (weight.x + weight.y + weight.z);
      //     return xProjection * weight.x + yProjection * weight.y + zProjection * weight.z;
      //   }

      //   void main() {
      //     vec4 result = vec4(0, 0, 0, 1.0);
      //     // result += textureTriplanarNoTile(layer1Map, layer1Scale, vNorm, vPos);
      //     result += vCol.r * textureTriplanarNoTile(layer1Map, layer1Scale, vNorm, vPos);
      //     result += vCol.g * textureTriplanarNoTile(layer2Map, layer2Scale, vNorm, vPos);
      //     result += vCol.b * textureTriplanarNoTile(layer3Map, layer3Scale, vNorm, vPos);
      //     // result += vCol.b * textureTriplanarNoTile(layer2Map, layer2Scale, vNorm, vPos);
      //     // result += (1.0 - vCol.a) * textureTriplanarNoTile(layer2Map, layer2Scale, vNorm, vPos);
      //     csm_DiffuseColor *= result;
      //   }
      // `,
      // fragmentShader: `
      //   // initial no-tile implementation, but heavy GPU usage
      //   uniform sampler2D layer1Map;
      //   uniform float layer1Scale;
      //   uniform sampler2D layer2Map;
      //   uniform float layer2Scale;
      //   uniform sampler2D layer3Map;
      //   uniform float layer3Scale;

      //   varying vec3 vPos;
      //   varying vec3 vNorm;
      //   varying vec3 vCol;

      //   // Hash function for generating per-tile transforms
      //   vec4 hash4(vec2 p) {
      //       return fract(sin(vec4(1.0+dot(p,vec2(37.0,17.0)),
      //                             2.0+dot(p,vec2(11.0,47.0)),
      //                             3.0+dot(p,vec2(41.0,29.0)),
      //                             4.0+dot(p,vec2(23.0,31.0))))*103.0);
      //   }

      //   // Modified textureNoTile function
      //   vec4 textureNoTile(sampler2D samp, in vec2 uv) {
      //       vec2 iuv = floor(uv);
      //       vec2 fuv = fract(uv);

      //       // Generate per-tile transform
      //       vec4 ofa = hash4(iuv + vec2(0.0,0.0));
      //       vec4 ofb = hash4(iuv + vec2(1.0,0.0));
      //       vec4 ofc = hash4(iuv + vec2(0.0,1.0));
      //       vec4 ofd = hash4(iuv + vec2(1.0,1.0));

      //       vec2 ddx = dFdx(uv);
      //       vec2 ddy = dFdy(uv);

      //       // Transform per-tile uvs
      //       ofa.zw = sign(ofa.zw-0.5);
      //       ofb.zw = sign(ofb.zw-0.5);
      //       ofc.zw = sign(ofc.zw-0.5);
      //       ofd.zw = sign(ofd.zw-0.5);

      //       // uv's, and derivatives (for correct mipmapping)
      //       vec2 uva = uv*ofa.zw + ofa.xy; vec2 ddxa = ddx*ofa.zw; vec2 ddya = ddy*ofa.zw;
      //       vec2 uvb = uv*ofb.zw + ofb.xy; vec2 ddxb = ddx*ofb.zw; vec2 ddyb = ddy*ofb.zw;
      //       vec2 uvc = uv*ofc.zw + ofc.xy; vec2 ddxc = ddx*ofc.zw; vec2 ddyc = ddy*ofc.zw;
      //       vec2 uvd = uv*ofd.zw + ofd.xy; vec2 ddxd = ddx*ofd.zw; vec2 ddyd = ddy*ofd.zw;

      //       // Fetch and blend
      //       vec2 b = smoothstep(0.25,0.75,fuv);

      //       return mix(mix(textureGrad(samp, uva, ddxa, ddya),
      //                     textureGrad(samp, uvb, ddxb, ddyb), b.x),
      //                 mix(textureGrad(samp, uvc, ddxc, ddyc),
      //                     textureGrad(samp, uvd, ddxd, ddyd), b.x), b.y);
      //   }

      //   // Modified textureTriplanar function
      //   vec4 textureTriplanarNoTile(sampler2D tex, float scale, vec3 normal, vec3 position) {
      //       vec2 uv_x = position.yz * scale;
      //       vec2 uv_y = position.xz * scale;
      //       vec2 uv_z = position.xy * scale;

      //       vec4 xProjection = textureNoTile(tex, uv_x);
      //       vec4 yProjection = textureNoTile(tex, uv_y);
      //       vec4 zProjection = textureNoTile(tex, uv_z);

      //       vec3 weight = abs(normal);
      //       weight = pow(weight, vec3(4.0)); // bias towards the major axis
      //       weight = weight / (weight.x + weight.y + weight.z);

      //       return xProjection * weight.x + yProjection * weight.y + zProjection * weight.z;
      //   }

      //   void main() {
      //       vec4 result = vec4(0, 0, 0, 1.0);
      //       result += vCol.r * textureTriplanarNoTile(layer1Map, layer1Scale, vNorm, vPos);
      //       result += vCol.g * textureTriplanarNoTile(layer2Map, layer2Scale, vNorm, vPos);
      //       result += vCol.b * textureTriplanarNoTile(layer3Map, layer3Scale, vNorm, vPos);
      //       csm_DiffuseColor *= result;
      //   }
      // `,
      uniforms: {
        layer1Map: { value: layer1Map },
        layer1Scale: { value: 0.4 },
        layer2Map: { value: layer2Map },
        layer2Scale: { value: 0.4 },
        layer3Map: { value: layer3Map },
        layer3Scale: { value: 0.1 },
        noiseTexture: { value: noiseTexture },
      },
      roughness: 1,
      metallic: 0,
    })

    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshStandardMaterial({
        color: 'white',
        opacity: 0.1,
        transparent: true,
      })
    )
    this.cursor.visible = false
    this.world.graphics.scene.add(this.cursor)

    // the voxel resolved to modify
    // todo: show normal direction
    {
      const size = 1 * scale
      const geometry = new THREE.BoxGeometry(size, size, size)
      const edges = new THREE.EdgesGeometry(geometry)
      const material = new THREE.LineBasicMaterial({ color: 'white' })
      this.point = new THREE.LineSegments(edges, material)
      // this.world.graphics.scene.add(this.point)
    }

    // huge: 70 radius, 2 scale, increase island size to 600
    this.radius = 8 // must be even num.
    this.bounds = new THREE.Box3()
    const foo = (this.radius / 2) * (gridSize.x - gridBorder * 2)
    this.bounds.min.set(-foo, 0, -foo)
    this.bounds.max.set(foo, gridSize.y - gridBorder * 2, foo)
    for (let x = -this.radius; x < this.radius; x++) {
      for (let z = -this.radius; z < this.radius; z++) {
        const coords = new THREE.Vector3(x, 0, z)
        const chunk = new Chunk(world, coords)
        this.chunks.set(chunk.id, chunk)
      }
    }
    const total = this.radius * this.radius
    console.log('terrain chunks:', total)
    console.time('terrain:generate')
    this.chunks.forEach(chunk => chunk.generate())
    console.timeEnd('terrain:generate')
    console.time('terrain:build')
    this.chunks.forEach(chunk => chunk.build())
    console.timeEnd('terrain:build')

    this.control = this.world.input.bind({
      priority: 100,
      btnDown: code => {
        if (code === 'KeyF') {
          this.editing = !this.editing
          return true
        }
        if (code === 'MouseLeft') {
          this.isModifyKeyDown = true
          return true
        }
      },
      btnUp: code => {
        if (code === 'MouseLeft') {
          this.isModifyKeyDown = false
          return true
        }
      },
    })
  }

  seed(value) {
    this.noise2D = createNoise2D(() => value)
    this.noise3D = createNoise3D(() => value)
  }

  update(delta) {
    const hit = this.world.environment.hits[0]
    if (this.editing && hit?.chunk) {
      this.cursor.visible = true
      this.cursor.position.copy(hit.point)
      const radius = 3 // todo: listen to wheel changes // was control.terrian.radius
      // this was in old Control.onWheel(e)
      // const TERRAIN_RADIUS_SPEED = 0.001
      // const TERRAIN_RADIUS_MIN = 0.5
      // const TERRAIN_RADIUS_MAX = 6
      // this.terrain.radius += TERRAIN_RADIUS_SPEED * e.deltaY
      // this.terrain.radius = clamp(
      //   this.terrain.radius,
      //   TERRAIN_RADIUS_MIN,
      //   TERRAIN_RADIUS_MAX
      // )
      this.cursor.scale.setScalar(radius)
      if (this.isModifyKeyDown) {
        this.modifyRate += delta
        if (this.modifyRate > MODIFY_RATE) {
          this.modifyRate = 0
          console.log('hit', hit)
          // const center = new THREE.Vector3()
          //   .copy(hit.point)
          //   .add(
          //     new THREE.Vector3().copy(hit.normal).multiplyScalar(0.6 * scale)
          //   )
          const subtract = false // was rmb
          hit.chunk.modify(
            hit.point,
            hit.normal,
            // center,
            Math.round(radius),
            subtract,
            true
          )
        }
      }
    } else {
      this.cursor.visible = false
    }
  }

  getChunkByCoords(x, y, z) {
    return this.chunks.get(`${x},${y},${z}`)
  }

  // modify(point, subtract) {
  //   const chunkSize = new THREE.Vector3(
  //     gridSize.x * scale,
  //     gridSize.y * scale,
  //     gridSize.z * scale
  //   )
  //   const chunkCoords = new THREE.Vector3(
  //     Math.floor(point.x / chunkSize.x),
  //     Math.floor(point.y / chunkSize.y),
  //     Math.floor(point.z / chunkSize.z)
  //   )
  //   // console.log('chunkCoords', chunkCoords)

  //   const chunkId = `${chunkCoords.x},${chunkCoords.y},${chunkCoords.z}`
  //   const chunk = this.chunks.get(chunkId)

  //   // cursor.position.copy(point)

  //   if (chunk) {
  //     // console.log('hit', chunk)
  //     // return
  //     const localPoint = new THREE.Vector3()
  //       .copy(point)
  //       .sub(
  //         new THREE.Vector3(
  //           chunkCoords.x * chunkSize.x * scale,
  //           chunkCoords.y * chunkSize.y * scale,
  //           chunkCoords.z * chunkSize.z * scale
  //         )
  //       )
  //       .divideScalar(scale)
  //     // const localPoint = new THREE.Vector3()
  //     //   .copy(point)
  //     //   .sub(chunk.mesh.position)
  //     //   .divide(new THREE.Vector3(scale, scale, scale))
  //     const radius = 2
  //     chunk.modify(localPoint, radius / scale, subtract)
  //   }
  // }

  destroy() {
    this.control?.release()
    this.control = null
  }
}

let foo = 0

class Chunk {
  constructor(world, coords) {
    this.id = `${coords.x},${coords.y},${coords.z}`
    this.world = world
    this.coords = coords

    this.data = new Float32Array(gridSize.x * gridSize.y * gridSize.z)
    this.dims = [gridSize.x, gridSize.y, gridSize.z] // redundant cant we pass this to SurfaceNets as gridSize?
    this.colors = new Float32Array(gridSize.x * gridSize.y * gridSize.z * 3)
  }

  generate() {
    const noise2D = this.world.terrain.noise2D
    const noise3D = this.world.terrain.noise3D
    const bounds = this.world.terrain.bounds
    const centerX = (bounds.min.x + bounds.max.x) / 2
    const centerZ = (bounds.min.z + bounds.max.z) / 2

    function smoothstep(min, max, value) {
      const x = Math.max(0, Math.min(1, (value - min) / (max - min)))
      return x * x * (3 - 2 * x)
    }

    // === island surrounded by water ===

    let idx = -1
    for (let z = 0; z < gridSize.z; z++) {
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          idx++
          const w = v1.set(
            this.coords.x * gridSizeInner.x + x,
            this.coords.y * gridSizeInner.y + y,
            this.coords.z * gridSizeInner.z + z
          )

          const radius = 70
          const seaLevel = 16
          const maxHeight = 24

          const dx = w.x - centerX
          const dz = w.z - centerZ
          const distToCenter = Math.sqrt(dx * dx + dz * dz)

          const radialFalloff = Math.max(0, 1 - distToCenter / radius)

          // regular height
          const heightAmp = maxHeight - seaLevel
          const heightNoiseScale = 0.02
          let heightNoise = noise2D(w.x * heightNoiseScale, w.z * heightNoiseScale)
          heightNoise = sinToAlpha(heightNoise)

          // const baseHeight = seaLevel + heightNoise * (maxHeight - seaLevel);
          let height = seaLevel + heightNoise * heightAmp // + (hillNoise * hillAmp);

          height = height * radialFalloff
          // const islandHeight = baseHeight * radialFalloff;

          // const surfaceNoiseScale = 1
          // const surfaceNoise = noise2D(w.x * surfaceNoiseScale, w.z * surfaceNoiseScale);
          // const surfaceOffset = surfaceNoise * 5 * radialFalloff; // Reduce noise at island edges

          // const finalHeight = islandHeight + surfaceOffset;

          // // const terrainDensity = (finalHeight - w.y) / 10; // Adjust divisor for smoother or sharper transitions

          // const height = (finalHeight - w.y)

          const surfaceDistance = height - w.y
          const smoothStrength = 0.3
          let density = smoothstep(smoothStrength * seaLevel, -smoothStrength * seaLevel, surfaceDistance)
          density = alphaToSin(density)

          // const surfaceDistance = height - w.y;
          // const smoothStrength = 0.3
          // let density = smoothstep(smoothStrength * seaLevel, -smoothStrength * seaLevel, height);
          // density = alphaToSin(density)

          // // noise for hill locations
          // const hillLocationNoiseScale = 0.02
          // let hillLocationNoise = noise2D(w.x * hillLocationNoiseScale, w.z * hillLocationNoiseScale)
          // hillLocationNoise = sinToAlpha(hillLocationNoise)

          // // hills
          // const hillAmp = 5
          // const hillNoiseScale = 0.1
          // let hillNoise = noise2D(w.x * hillNoiseScale, w.z * hillNoiseScale)
          // hillNoise = sinToAlpha(hillNoise)

          // // modulate hills with their locations
          // const hillThreshold = 0.7
          // const hillIntensity = Math.max(0, (hillLocationNoise - hillThreshold) / (1 - hillThreshold)) // 0 to 1 inside threshold
          // hillNoise *= hillIntensity

          // // final surface height
          // const surfaceHeight = baseY + (surfaceNoise * surfaceAmp)
          // let height = baseY + (surfaceNoise * surfaceAmp) + (hillNoise * hillAmp);

          // // smooth density
          // const surfaceDistance = height - w.y;
          // const smoothStrength = 0.3
          // let density = smoothstep(smoothStrength * baseY, -smoothStrength * baseY, surfaceDistance);
          // density = alphaToSin(density)

          // 0 shows weird color, maybe we can fix in shader?
          if (density === 0) density = -0.001

          this.data[idx] = density
          this.colors[idx * 3 + 0] = 1
          this.colors[idx * 3 + 1] = 0
          this.colors[idx * 3 + 2] = 0
          if (w.y < height - 3) {
            this.colors[idx * 3 + 0] = 0
            this.colors[idx * 3 + 1] = 1
            this.colors[idx * 3 + 2] = 0
          }
        }
      }
    }

    // === simple ground ===

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++;
    //       const w = v1.set(
    //         this.coords.x * gridSizeInner.x + x,
    //         this.coords.y * gridSizeInner.y + y,
    //         this.coords.z * gridSizeInner.z + z
    //       );

    //       const baseY = 20

    //       // flat-ish surface
    //       const surfaceAmp = 2
    //       const surfaceNoiseScale = 0.01
    //       let surfaceNoise = noise2D(w.x * surfaceNoiseScale, w.z * surfaceNoiseScale)
    //       surfaceNoise = sinToAlpha(surfaceNoise)

    //       // noise for hill locations
    //       const hillLocationNoiseScale = 0.02
    //       let hillLocationNoise = noise2D(w.x * hillLocationNoiseScale, w.z * hillLocationNoiseScale)
    //       hillLocationNoise = sinToAlpha(hillLocationNoise)

    //       // hills
    //       const hillAmp = 16
    //       const hillNoiseScale = 0.1
    //       let hillNoise = noise2D(w.x * hillNoiseScale, w.z * hillNoiseScale)
    //       hillNoise = sinToAlpha(hillNoise)

    //       // modulate hills with their locations
    //       const hillThreshold = 0.7
    //       const hillIntensity = Math.max(0, (hillLocationNoise - hillThreshold) / (1 - hillThreshold)) // 0 to 1 inside threshold
    //       hillNoise *= hillIntensity

    //       // const surfaceHeight = baseY + (surfaceNoise * surfaceAmp)
    //       let height = baseY + (surfaceNoise * surfaceAmp) + (hillNoise * hillAmp);

    //       const surfaceDistance = height - w.y;
    //       const smoothStrength = 0.3
    //       let density = smoothstep(smoothStrength * baseY, -smoothStrength * baseY, surfaceDistance);
    //       density = alphaToSin(density)

    //       // 0 shows weird color, maybe we can fix in shader?
    //       if (density === 0) density = -0.001

    //       this.data[idx] = density
    //       this.colors[idx * 3 + 0] = 1;
    //       this.colors[idx * 3 + 1] = 0;
    //       this.colors[idx * 3 + 2] = 0;
    //       if (w.y < height - 3) {
    //         this.colors[idx * 3 + 0] = 0;
    //         this.colors[idx * 3 + 1] = 1;
    //         this.colors[idx * 3 + 2] = 0;
    //       }

    //     }
    //   }
    // }

    // === floating island v1 ===
    // recommended: radius=16 scale=1

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++;
    //       const w = v1.set(
    //         this.coords.x * gridSizeInner.x + x,
    //         this.coords.y * gridSizeInner.y + y,
    //         this.coords.z * gridSizeInner.z + z
    //       );

    //       const dx = w.x - centerX;
    //       const dz = w.z - centerZ;
    //       const distToCenter = Math.sqrt(dx * dx + dz * dz);

    //       const terrainHeight = 80

    //       // slightly skewed surface
    //       const surfaceAmp = 4
    //       const surfaceNoiseScale = 0.02
    //       let surfaceNoise = noise2D(w.x * surfaceNoiseScale, w.z * surfaceNoiseScale)
    //       surfaceNoise = sinToAlpha(surfaceNoise)

    //       // noise for hill locations
    //       const hillLocationNoiseScale = 0.02
    //       let hillLocationNoise = noise2D(w.x * hillLocationNoiseScale, w.z * hillLocationNoiseScale)
    //       hillLocationNoise = sinToAlpha(hillLocationNoise)

    //       // hills
    //       const hillAmp = 8
    //       const hillNoiseScale = 0.1
    //       let hillNoise = noise2D(w.x * hillNoiseScale, w.z * hillNoiseScale)
    //       hillNoise = sinToAlpha(hillNoise)

    //       // modulate hills with their locations
    //       const hillThreshold = 0.7
    //       const hillIntensity = Math.max(0, (hillLocationNoise - hillThreshold) / (1 - hillThreshold)) // 0 to 1 inside threshold
    //       hillNoise *= hillIntensity

    //       // final surface height
    //       const surfaceHeight = terrainHeight + (surfaceNoise * surfaceAmp)
    //       let height = terrainHeight + (surfaceNoise * surfaceAmp) + (hillNoise * hillAmp);

    //       // smooth density
    //       const surfaceDistance = height - w.y;
    //       const smoothStrength = 0.3
    //       let smoothHeight = smoothstep(smoothStrength * terrainHeight, -smoothStrength * terrainHeight, surfaceDistance);
    //       smoothHeight = alphaToSin(smoothHeight)

    //       // island edge + smoothing
    //       // const edgeRadius = 80
    //       // const edgeTransition = 5
    //       // const edgeFactor = smoothstep(edgeRadius - edgeTransition, edgeRadius, distToCenter);
    //       // smoothHeight = smoothHeight * (1 - edgeFactor) + edgeFactor;

    //       // wavy edge radius
    //       const edgeNoiseScale = 0.03
    //       let edgeNoise = noise2D(w.x * edgeNoiseScale, w.z * edgeNoiseScale)
    //       edgeNoise = sinToAlpha(edgeNoise)

    //       // modulate edge radius
    //       const edgeRadius = 80
    //       const edgeAmp = 10
    //       const modulatedEdgeRadius = edgeRadius + (edgeNoise - 0.5) * 2 * edgeAmp

    //       // island edge + smoothing
    //       const edgeTransition = 5
    //       const edgeFactor = smoothstep(modulatedEdgeRadius - edgeTransition, modulatedEdgeRadius, distToCenter);
    //       smoothHeight = smoothHeight * (1 - edgeFactor) + edgeFactor;

    //       let density = smoothHeight

    //       const crust = 3
    //       if (w.y < surfaceHeight - crust) {
    //         const underNoiseScale = 0.01
    //         let underNoise = noise2D(w.x * underNoiseScale, w.z * underNoiseScale)
    //         underNoise = sinToAlpha(underNoise)
    //         underNoise = 1 - underNoise

    //         const pointNoiseScale = 0.1
    //         let pointNoise = noise2D(w.x * pointNoiseScale, w.z * pointNoiseScale)
    //         pointNoise = sinToAlpha(pointNoise)
    //         pointNoise = 1 - pointNoise

    //         // const maxDistance = Math.sqrt(edgeRadius * edgeRadius) - 10;
    //         // const normalizedDistance = distToCenter / maxDistance;
    //         const normalizedDistance = distToCenter / modulatedEdgeRadius;

    //         const underAmpMin = 1
    //         const underAmpMax = 60
    //         const underAmp = underAmpMax - (underAmpMax - underAmpMin) * normalizedDistance;
    //         // const underAmp = smoothstep(underAmpMin, underAmpMax, distToCenter)

    //         const pointAmpMin = 10
    //         const pointAmpMax = 20
    //         const pointAmp = pointAmpMax - (pointAmpMax - pointAmpMin) * normalizedDistance;
    //         // const pointAmp = smoothstep(pointAmpMin, pointAmpMax, distToCenter)

    //         let height2 = surfaceHeight - w.y - (underNoise * underAmp) - (pointNoise * pointAmp)

    //         density = height2 * (1 - edgeFactor) + edgeFactor;
    //       }

    //       // 0 shows weird color, maybe we can fix in shader?
    //       if (density === 0) density = -0.001

    //       this.data[idx] = density
    //       this.colors[idx * 2 + 0] = 1;
    //       this.colors[idx * 2 + 1] = 0;
    //       if (w.y < height - 2) {
    //         this.colors[idx * 2 + 0] = 0;
    //         this.colors[idx * 2 + 1] = 1;
    //       }
    //     }
    //   }
    // }

    // === 1 ===

    // const baseIslandRadius = 60;
    // const offsetNoiseScale = 2;
    // const offsetMax = 20;

    // const heightNoiseScale = 0.02;
    // const surfaceHeight = 50
    // const surfaceOffsetMax = 10
    // const smoothingFactor = 0.02

    // const baseNoiseScale = 0.05

    // function smoothstep(min, max, value) {
    //   const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    //   return x * x * (3 - 2 * x);
    // }

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++;
    //       const w = v1.set(
    //         this.coords.x * gridSizeInner.x + x,
    //         this.coords.y * gridSizeInner.y + y,
    //         this.coords.z * gridSizeInner.z + z
    //       );

    //       const dx = w.x - centerX;
    //       const dz = w.z - centerZ;
    //       const distToCenter = Math.sqrt(dx * dx + dz * dz);
    //       const angle = Math.atan2(dz, dx);

    //       const edgeNoise = noise2D(Math.cos(angle) * offsetNoiseScale, Math.sin(angle) * offsetNoiseScale, 0);
    //       const edgeOffset = remapNoise(edgeNoise, 0, offsetMax)
    //       const islandRadius = baseIslandRadius + edgeOffset

    //       const heightNoise = noise2D(w.x * heightNoiseScale, w.z * heightNoiseScale)
    //       let height = remapNoise(heightNoise, 0, surfaceOffsetMax)
    //       // const ratioToEdge = distToCenter / islandRadius
    //       // height = (1 - ratioToEdge) * height + surfaceHeight
    //       height = height + surfaceHeight

    //       const baseNoise = noise2D(w.x * baseNoiseScale, w.z * baseNoiseScale)
    //       let base = remapNoise(baseNoise, 0, 20)
    //       // const ratioToEdge = distToCenter / islandRadius
    //       // base = height - 2 - (1 - ratioToEdge) * base
    //       base = height - 2 - base

    //       // const edgeTransition = smoothstep(islandRadius - 10, islandRadius, distToCenter);

    //       // const shapeNoise = noise2D(distToCenter * 0.1, distToCenter * 0.1)
    //       // const shapeNoise = noise2D(w.x * 1, w.z * 1)
    //       // const shape = 1 - remapNoise(shapeNoise, 0, 1)

    //       const shapeNoiseScale = 0.1; // Adjust this value to change the noise frequency
    //       const shapeInfluence = 10;
    //       const shapeNoise = noise2D(w.x * shapeNoiseScale, w.z * shapeNoiseScale);
    //       const shape = remapNoise(shapeNoise, -shapeInfluence, shapeInfluence);

    //       if (distToCenter < islandRadius) {

    //         const terrainValue = smoothstep(base, height, y);
    // const edgeTransition = smoothstep(islandRadius - 10, islandRadius, distToCenter);
    // const shapeTransition = smoothstep(-1, 1, shape + (height - y) / (height - base));

    //     const finalValue = (1 - terrainValue) * (1 - edgeTransition) * shapeTransition;

    //     this.data[idx] = finalValue * 2 - 1
    //         // const detailNoise = noise3D(w.x * 0.1, w.y * 0.1, w.z * 0.1);
    //         // const terrainValue = smoothstep(base, height, y + detailNoise * 5);
    //         // const finalValue = 1 - (1 - terrainValue) * (1 - edgeTransition);
    //         // this.data[idx] = finalValue * 2 - 1; // Map 0-1 to -1 to 1

    //         // const terrainValue = Math.max(0, Math.min(1, (height - y) / (height - base)))
    //         // this.data[idx] = terrainValue * 2 - 1; // Map 0-1 to -1 to 1

    //         // this.data[idx] = -1
    //         // this.data[idx] = -shape

    //         const grass = y > height - 2 ? 1 : 0
    //         this.colors[idx * 2 + 0] = grass;
    //         this.colors[idx * 2 + 1] = 1- grass;
    //       } else {
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 0;
    //         this.colors[idx * 2 + 1] = 1;
    //       }
    //     }
    //   }
    // }

    // const scale = 0.05
    // const amplitude = 10;
    // const midLevel = 10;
    // const minLevel = 5;
    // const maxLevel = 15

    // const bounds = this.world.terrain.bounds
    // const centerX = (bounds.min.x + bounds.max.x) / 2;
    // const centerZ = (bounds.min.z + bounds.max.z) / 2;
    // const maxRadius = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2;

    // function islandShape(x, z) {
    //   const dx = x - centerX;
    //   const dz = z - centerZ;
    //   const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

    //   // Normalize distance to be between 0 and 1
    //   const normalizedDistance = distanceFromCenter / maxRadius;

    //   // Use noise to create an irregular edge
    //   const edgeNoise = noise(x * 0.01, z * 0.01, 0) * 0.3 + 0.7;

    //   // Combine distance and noise
    //   return normalizedDistance < edgeNoise;
    // }

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++;
    //       const wX = this.coords.x * (gridSize.x - gridBorder * 2) + x;
    //       const wY = y;
    //       const wZ = this.coords.z * (gridSize.z - gridBorder * 2) + z;

    //       const isLand = islandShape(wX, wZ);

    //       // TODO: swap this isEdge check to actually use noise and figure out if the XZ distance to center should be the edge of a randomly generated top down shape for the island
    //       // const isEdge = (wX < bounds.min.x + 10 || wX >= bounds.max.x - 10 || wZ < bounds.min.z + 10 || wZ >= bounds.max.z - 10)
    //       if (!isLand) {
    //         // Air
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 1;
    //         continue
    //       }

    //       const value = noise(wX * scale, wZ * scale, 0)
    //       const surfaceOffset = value * amplitude;
    //       const groundHeight = Math.max(minLevel, Math.min(maxLevel, midLevel + surfaceOffset));
    //       const height = wY - groundHeight;

    //       if (height < 0) {
    //         this.data[idx] = -1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 0;
    //       } else {
    //         // Air
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 1;
    //       }
    //     }
    //   }
    // }

    // const noiseScale = 0.01;
    // const shapeNoiseScale = 0.02;
    // const heightScale = 5;
    // const baseHeight = 5;
    // const islandRadius = Math.min(this.world.terrain.bounds.max.x, this.world.terrain.bounds.max.z) * 0.7;

    // const centerX = (this.world.terrain.bounds.max.x + this.world.terrain.bounds.min.x) / 2;
    // const centerZ = (this.world.terrain.bounds.max.z + this.world.terrain.bounds.min.z) / 2;

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++;
    //       const wX = this.coords.x * (gridSize.x - gridBorder * 2) + x;
    //       const wY = y;
    //       const wZ = this.coords.z * (gridSize.z - gridBorder * 2) + z;

    //       // Calculate distance from center of the entire volume
    //       const dx = wX - centerX;
    //       const dz = wZ - centerZ;
    //       const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

    //       // Generate noise-based island shape
    //       const shapeNoise = noise(wX * shapeNoiseScale, wZ * shapeNoiseScale, 0);
    //       const shapeThreshold = 0.01;
    //       const islandShape = Math.max(0, (shapeNoise - shapeThreshold) / (1 - shapeThreshold));

    //       // Combine distance and noise for island factor
    //       const islandFactor = Math.max(0, islandShape - distanceFromCenter / islandRadius);

    //       // Generate island height
    //       const heightNoise = noise(wX * noiseScale, wZ * noiseScale, 0);
    //       const islandHeight = baseHeight + heightNoise * heightScale * islandFactor;

    //       if (wY < islandHeight && islandFactor > 0) {
    //         // Inside the island
    //         this.data[idx] = -1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 0;
    //       } else {
    //         // Air
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 1;
    //       }
    //     }
    //   }
    // }

    // const surfaceY = 6
    // const noiseScale = 0.01
    // const threshold = 0.1
    // const bufferSize = 4
    // const bounds = this.world.terrain.bounds

    // let idx = -1;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       idx++
    //       const wX = this.coords.x * (gridSize.x - gridBorder * 2) + x;
    //       const wY = y;
    //       const wZ = this.coords.z * (gridSize.z - gridBorder * 2) + z;

    //       const isInBuffer = wX < bounds.min.x + bufferSize || wX >= bounds.max.x - bufferSize ||
    //                         //  wY < bounds.min.y + bufferSize || wY >= bounds.max.y - bufferSize ||
    //                          wZ < bounds.min.z + bufferSize || wZ >= bounds.max.z - bufferSize

    //       if (isInBuffer) {
    //         // air
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 1;
    //         continue
    //       }

    //       const noiseValue = noise(wX * noiseScale, wZ * noiseScale, 0);
    //       const isIsland = noiseValue > threshold;

    //       if (y <= surfaceY && isIsland) {
    //         // Solid part of the floating island
    //         this.data[idx] = -1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 0;
    //       } else {
    //         // Air
    //         this.data[idx] = 1;
    //         this.colors[idx * 2 + 0] = 1;
    //         this.colors[idx * 2 + 1] = 1;
    //       }
    //     }
    //   }
    // }

    // return

    // console.time('generate');

    // const noiseScale = 0.02;
    // const heightScale = 20;
    // const baseHeight = 2;

    // const octaves = 4;
    // const persistence = 0.5;
    // const lacunarity = 2.0;

    // const smoothStep = (min, max, value) => {
    //   const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    //   return x * x * (3 - 2 * x);
    // };

    // const field = (worldX, y, worldZ) => {
    //   let noiseValue = 0;
    //   let amplitude = 1;
    //   let frequency = 1;
    //   let maxValue = 0;

    //   for (let i = 0; i < octaves; i++) {
    //     noiseValue += noise(
    //       worldX * noiseScale * frequency,
    //       0,
    //       worldZ * noiseScale * frequency
    //     ) * amplitude;

    //     maxValue += amplitude;
    //     amplitude *= persistence;
    //     frequency *= lacunarity;
    //   }

    //   noiseValue /= maxValue;  // Normalize the noise value

    //   // Apply smooth step function to create more gradual transitions
    //   const smoothedNoise = smoothStep(-1, 1, noiseValue);

    //   const height = smoothedNoise * heightScale + baseHeight;

    //   // Return a signed distance field value
    //   return y - height;
    // };

    // let index = 0;
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       // Calculate world coordinates
    //       const worldX = this.coords.x * (gridSize.x - gridBorder * 2) + x;
    //       const worldZ = this.coords.z * (gridSize.z - gridBorder * 2) + z;

    //       const idx = index++

    //       this.data[idx] = field(worldX, y, worldZ);

    //       if (this.data[idx] < 0) {
    //         this.colors[idx * 2 + 0] = 1
    //         this.colors[idx * 2 + 1] = 0
    //       } else {
    //         this.colors[idx * 2 + 0] = 1
    //         this.colors[idx * 2 + 1] = 0
    //       }

    //       const isUnderground = this.data[idx] < -1.5;
    //       if (isUnderground) {
    //         this.colors[idx * 2 + 0] = 0
    //         this.colors[idx * 2 + 1] = 1
    //       } else {
    //         this.colors[idx * 2 + 0] = 1
    //         this.colors[idx * 2 + 1] = 0
    //       }

    //       // const val = Math.random()
    //       // this.colors[idx * 2 + 0] = val
    //       // this.colors[idx * 2 + 1] = 1 - val

    //       // this.colors[idx * 3 + 0] = Math.random()
    //       // this.colors[idx * 3 + 1] = Math.random()
    //       // this.colors[idx * 3 + 2] = Math.random()
    //       // this.colors[idx * 3 + 3] = Math.random()
    //     }
    //   }
    // }

    // console.timeEnd('generate');

    // =====

    // // console.time('generate')

    // // // const resolution = 1 // TODO: factor to downsample number of voxels

    // const field = (x, y, z)  =>{
    //   // all solid inside
    //   // if (
    //   //   x <= 0 ||
    //   //   x >= gridSize.x - 1 ||
    //   //   y <= 0 ||
    //   //   y >= gridSize.y - 1 ||
    //   //   z <= 0 ||
    //   //   z >= gridSize.z - 1
    //   // ) {
    //   //   return 1 // Outer two layers (empty)
    //   // }
    //   // return -1 // Inner part (solid)

    //   // bottom 2 layers solid
    //   // if (y <= 1) {
    //   //   return -1 // Solid (bottom two layers)
    //   // }
    //   // return 1 // Empty (everything else)

    //   const globalX = this.coords.x * (gridSize.x - gridBorder * 2) + x
    //   if (y <= globalX || y<= 1) {
    //     return -1
    //   }
    //   return 1

    //   // const globalX = this.coords.x * (gridSize.x - gridBorder * 2) + x
    //   // if (globalX % 2 === 0) {
    //   //   if (y <= 1) {
    //   //     return -1
    //   //   }
    //   // } else {
    //   //   if (y <= 2) {
    //   //     return -1
    //   //   }
    //   // }
    //   // return 1

    //   // sphere in center
    //   const centerX = gridSize.x / 2
    //   const centerY = gridSize.y / 2
    //   const centerZ = gridSize.z / 2
    //   const radius = Math.min(gridSize.x, gridSize.y, gridSize.z) * 0.4
    //   return (
    //     Math.sqrt(
    //       (x - centerX) ** 2 + (y - centerY) ** 2 + (z - centerZ) ** 2
    //     ) - radius
    //   )
    // }

    // let index = 0
    // for (let z = 0; z < gridSize.z; z++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let x = 0; x < gridSize.x; x++) {
    //       this.data[index++] = field(x, y, z)
    //     }
    //   }
    // }

    // console.timeEnd('generate')
  }

  build() {
    // cleanup previous
    if (this.mesh) {
      this.world.graphics.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      if (this.mesh.material !== this.world.terrain.material) {
        this.mesh.material.dispose()
      }
      this.mesh = null
      this.world.spatial.octree.remove(this.sItem)
      this.sItem = null
      this.collider.destroy()
      this.collider = null
      this.colliderFactory.destroy()
      this.colliderFactory = null
    }

    console.time('chunk')
    console.time('chunk:geometry')

    const surface = createSurface(this.data, this.dims, this.colors, 3)
    // console.log('surface',surface)

    if (!surface.indices.length) {
      console.timeEnd('chunk')
      console.timeEnd('chunk:geometry')
      return
    }

    // manually constructing these arrays is way faster
    // see https://x.com/AshConnell/status/1806531542946304374

    const vertices = new Float32Array(surface.vertices.length)
    for (let i = 0; i < surface.vertices.length; i++) {
      vertices[i] = surface.vertices[i] * scale
    }

    const indices = new Uint32Array(surface.indices.length)
    for (let i = 0; i < surface.indices.length; i++) {
      indices[i] = surface.indices[i]
    }

    const normals = new Float32Array(surface.normals.length)
    for (let i = 0; i < surface.normals.length; i++) {
      normals[i] = surface.normals[i]
    }

    const colors = new Float32Array(surface.colors.length)
    for (let i = 0; i < surface.colors.length; i++) {
      colors[i] = surface.colors[i]
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    // geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('col', new THREE.BufferAttribute(colors, 3))
    // geometry.computeVertexNormals()
    geometry.computeBoundsTree()

    console.timeEnd('chunk:geometry')

    // const normals = geometry.getAttribute('normal').array

    const material = this.world.terrain.material
    // const material = new THREE.MeshStandardMaterial({
    //   // color: 'green',
    //   color: getRandomColorHex(),
    //   // side: THREE.DoubleSide,
    //   // wireframe: true,
    //   // flatShading: true,
    //   // map: this.world.loader.texLoader.load('/static/day2-2k.jpg')
    // })
    const mesh = new THREE.Mesh(geometry, material)
    // mesh.scale.setScalar(scale)
    mesh.position.set(
      this.coords.x * gridSize.x * scale - this.coords.x * (gridBorder * 2) * scale, // xz overlap
      this.coords.y * gridSize.y * scale,
      this.coords.z * gridSize.z * scale - this.coords.z * (gridBorder * 2) * scale // xz overlap
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.updateMatrix()
    mesh.updateMatrixWorld(true)
    mesh.chunk = this
    this.world.graphics.scene.add(mesh)
    const sItem = {
      matrix: mesh.matrixWorld,
      geometry: mesh.geometry,
      material: mesh.material,
      getEntity: () => {
        console.log('TODO: getEntity -> terrain')
        return null
      },
      chunk: this,
    }

    console.time('chunk:octree')
    this.world.spatial.octree.insert(sItem)
    console.timeEnd('chunk:octree')
    console.time('chunk:collider1')
    const colliderFactory = createColliderFactory(this.world, mesh)
    console.timeEnd('chunk:collider1')
    console.time('chunk:collider2')
    const collider = colliderFactory.create(null, mesh.matrixWorld, 'static', Layers.environment)
    console.timeEnd('chunk:collider2')

    this.mesh = mesh
    this.sItem = sItem
    this.collider = collider
    this.colliderFactory = colliderFactory

    // normals visual
    // {
    //   const geometry = new THREE.BufferGeometry();
    //   const positions = [];
    //   for (let i = 0; i < vertices.length; i += 3) {
    //       positions.push(
    //           vertices[i], vertices[i+1], vertices[i+2],
    //           vertices[i] + normals[i] * scale,
    //           vertices[i+1] + normals[i+1] * scale,
    //           vertices[i+2] + normals[i+2] * scale
    //       );
    //   }
    //   geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    //   const material = new THREE.LineBasicMaterial({
    //     // color: 'black'
    //     color: getRandomColorHex(),
    //   });
    //   const lines = new THREE.LineSegments(geometry, material);
    //   lines.position.copy(mesh.position)
    //   this.world.graphics.scene.add(lines)
    // }

    // chunk outline
    // {
    //   const geometry = new THREE.BoxGeometry(
    //     gridSize.x * scale,
    //     gridSize.y * scale,
    //     gridSize.z * scale
    //   )
    //   geometry.translate(
    //     (gridSize.x * scale) / 2,
    //     (gridSize.y * scale) / 2,
    //     (gridSize.z * scale) / 2
    //   )
    //   const edges = new THREE.EdgesGeometry(geometry)
    //   const material = new THREE.LineBasicMaterial({ color: 'white' })
    //   const mesh = new THREE.LineSegments(edges, material)
    //   mesh.position.set(
    //     this.coords.x * gridSize.x * scale,
    //     this.coords.y * gridSize.y * scale,
    //     this.coords.z * gridSize.z * scale
    //   )
    //   this.world.graphics.scene.add(mesh)
    // }

    console.timeEnd('chunk')
  }

  modify(point, normal, radius, subtract, checkNeighbours) {
    // radius = 4
    radius = Math.round(radius)
    // radius /= scale

    // const cNormal = normalToCardinal(normal).multiplyScalar(0.5)
    // center
    //   .copy(point)
    //   .sub(this.mesh.position)
    //   .divideScalar(scale)
    //   .round()
    //   .add(cNormal)

    // const offset = 0.01 * scale // Small offset in world units
    // const offsetPoint = point.clone().addScaledVector(normal, offset)

    // const absX = Math.abs(normal.x)
    // const absY = Math.abs(normal.y)
    // const absZ = Math.abs(normal.z)
    // if (absX > absY && absX > absZ) {
    //   point.x += Math.sign(normal.x) * 1.1
    // } else if (absY > absX && absY > absZ) {
    //   point.y += Math.sign(normal.y) * 1.1
    // } else {
    //   point.z += Math.sign(normal.z) * 1.1
    // }

    center.copy(point).sub(this.mesh.position).divideScalar(scale).round()

    this.world.terrain.point.position.copy(center).multiplyScalar(scale).add(this.mesh.position)

    console.log('center', center.toArray())

    this.modifyGrid(center, radius, subtract, checkNeighbours)
  }

  modifyGrid(center, radius, subtract, checkNeighbours) {
    // const maxDistance = radius * 0.75
    // for (let y = -radius; y <= radius; y++) {
    //   for (let z = -radius; z <= radius; z++) {
    //     for (let x = -radius; x <= radius; x++) {
    //       const distance = x * x + y * y + z * z
    //       if (distance < radius) {
    //         const coords = v1.set(x, y, z)
    //         if (this.isInGrid(coords)) {
    //           const power = constrain(1 - distance / maxDistance, 0, 1)
    //           const value = (subtract ? -4 : 4) * power
    //           const idx = x + y * this.dims[0] + z * this.dims[0] * this.dims[1]
    //           this.data[idx] += value
    //           // const power = map( d, 0, radius * 0.75, 1, 0, true );
    //           // this.addScaleValueToGrid( gridPosition.x, gridPosition.y, gridPosition.z, val * p );
    //           // this.saveGridPosition( gridPosition );
    //         }
    //       }
    //     }
    //   }
    // }

    let rebuild

    // const sign = subtract ? 0.1 : -0.1
    // const radiusSquared = radius * radius
    // for (let z = 0; z < this.dims[2]; z++) {
    //   for (let y = 0; y < this.dims[1]; y++) {
    //     for (let x = 0; x < this.dims[0]; x++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distanceSquared = dx * dx + dy * dy + dz * dz
    //       if (distanceSquared <= radiusSquared) {
    //         const idx = x + y * this.dims[0] + z * this.dims[0] * this.dims[1]
    //         const distance = Math.sqrt(distanceSquared)
    //         this.data[idx] += sign * (radius - distance)
    //         rebuild = true
    //       }
    //     }
    //   }
    // }

    const sign = subtract ? 1 : -1
    const radiusSquared = radius * radius
    console.log('radius', radius)
    for (
      // let z = 0; z < gridSize.z; z++
      let z = Math.max(0, center.z - radius);
      z <= Math.min(gridSize.z - 1, center.z + radius);
      z++
    ) {
      for (
        // let y = 0; y < gridSize.y; y++
        let y = Math.max(0, center.y - radius);
        y <= Math.min(gridSize.y - 1, center.y + radius);
        y++
      ) {
        for (
          // let x = 0; x < gridSize.x; x++
          let x = Math.max(0, center.x - radius);
          x <= Math.min(gridSize.x - 1, center.x + radius);
          x++
        ) {
          // Calculate the squared distance from the hit point
          const dx = x - center.x
          const dy = y - center.y
          const dz = z - center.z
          const distanceSquared = dx * dx + dy * dy + dz * dz

          // Check if the voxel is within the sphere of influence
          if (distanceSquared <= radiusSquared) {
            // Calculate the effect based on the distance (linear fade out)
            const intensity = 0.05
            const effect = sign * intensity * (1 - Math.sqrt(distanceSquared) / radius) // prettier-ignore
            // if (x === center.x && y === center.y && z === center.z) {
            //   console.log('effect', effect)
            //   console.log(x,y,z)
            // }

            // quadratic falloff
            // const intensity = 0.1
            // const effect = sign * intensity * (1 - distanceSquared / (radius * radius)) // prettier-ignore

            // const intensity = 1
            // const t = 1 - Math.sqrt(distanceSquared) / radius
            // const effect = sign * intensity * smoothstep(0, 1, t)

            // Calculate the effect based on distance (gradient)
            // const intensity = 1
            // const effect = sign * intensity * map(distanceSquared, 0, radius * 0.75, 1, 0, true) // prettier-ignore

            // const intensity = 0.1
            // const effect = sign * intensity * (1 - distanceSquared / radiusSquared) ** 2 // prettier-ignore

            // const accumulationRate = 0.1 // Adjust this to control speed of changes
            // this.data[idx] += effect * accumulationRate

            // Apply the effect to the solidity value
            const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x
            // if (x === center.x && y === center.y && z === center.z) {
            //   console.log(`Modifying voxel at (${x}, ${y}, ${z}):`,
            // `Initial value: ${this.data[idx]}`,
            // `Effect: ${effect}`,
            // `Final value: ${this.data[idx] + effect}`);
            // }

            this.data[idx] += effect
            this.data[idx] = Math.min(1, Math.max(-1, this.data[idx] + effect))

            // this.colors[idx * 3 + 0] += subtract ? -0.1 : 0.1
            // this.colors[idx * 3 + 0] = clamp(this.colors[idx * 3 + 0], 0, 1)
            // this.colors[idx * 3 + 1] += subtract ? 0.1 : -0.1
            // this.colors[idx * 3 + 1] = clamp(this.colors[idx * 3 + 1], 0, 1)
            // this.colors[idx * 3 + 2] += subtract ? 0.1 : -0.1
            // this.colors[idx * 3 + 2] = clamp(this.colors[idx * 3 + 2], 0, 1)

            rebuild = true
          }
        }
      }
    }

    // for (let x = center.x - radius; x <= center.x + radius; x++) {
    //   for (let y = center.y - radius; y <= center.y + radius; y++) {
    //     for (let z = center.z - radius; z <= center.z + radius; z++) {
    //       const distSquared = x * x + y * y + z * z
    //       if (distSquared < radius) {
    //         console.log('h', x, y, z)
    //         if (this.isInGrid(v1.set(x, y, z))) {
    //           console.log('uo')
    //           const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //           //if not lower that 0 or height that this.terrain.gridSize, add value
    //           const val = 1 //0.0668 // 4 * delta guess
    //           const power = val * map(distSquared, 0, radius * 0.75, 1, 0, true)
    //           const oldValueScale = map(
    //             Math.abs(this.data[idx]),
    //             0,
    //             0.5,
    //             0.001,
    //             3
    //           )
    //           console.log('bef', this.data[idx])
    //           this.data[idx] = constrain(
    //             this.data[idx] + power * oldValueScale,
    //             -0.5,
    //             0.5
    //           )
    //           console.log('aft', this.data[idx])
    //         }
    //       }
    //     }
    //   }
    // }

    // const radiusSquared = radius * radius
    // const sign = subtract ? 1 : -1
    // for (
    //   let x = Math.max(0, center.x - radius);
    //   x < Math.min(gridSize.x, center.x + radius);
    //   x++
    // ) {
    //   for (
    //     let y = Math.max(0, center.y - radius);
    //     y < Math.min(gridSize.y, center.y + radius);
    //     y++
    //   ) {
    //     for (
    //       let z = Math.max(0, center.z - radius);
    //       z < Math.min(gridSize.z, center.z + radius);
    //       z++
    //     ) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distSquared = dx * dx + dy * dy + dz * dz

    //       if (distSquared < radiusSquared) {
    //         const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x
    //         const distance = Math.sqrt(distSquared)
    //         const val = -0.0668 // 4 * delta roughly
    //         const power = val * map(distance, 0, radius, 1, 0, true)

    //         console.log(
    //           'Modifying:',
    //           x,
    //           y,
    //           z,
    //           'Power:',
    //           power,
    //           'Before:',
    //           this.data[idx]
    //         )

    //         this.data[idx] = constrain(this.data[idx] + power, -0.5, 0.5)

    //         console.log('After:', this.data[idx])

    //         rebuild = true
    //       }
    //     }
    //   }
    // }

    // for (let y = center.y; y < center.y + 1; y++) {
    //   const idx = center.z * gridSize.y * gridSize.x + y * gridSize.x + center.x
    //   console.log('fo', this.data[idx])
    //   this.data[idx] = -1
    // }

    // const idx =
    //   center.z * gridSize.y * gridSize.x + center.y * gridSize.x + center.x
    // console.log('fo', this.data[idx])
    // this.data[idx] = -1

    // for (let x = 0; x < gridSize.x; x++) {
    //   for (let y = 0; y < gridSize.y; y++) {
    //     for (let z = 0; z < gridSize.z; z++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distSquared = dx * dx + dy * dy + dz * dz
    //       if (distSquared < radius) {
    //         console.log('h', x, y, z)
    //         const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //         //if not lower that 0 or height that this.terrain.gridSize, add value
    //         const val = -1 //0.0668 // 4 * delta guess
    //         const power = val * map(distSquared, 0, radius * 0.75, 1, 0, true)
    //         const oldValueScale = map(
    //           Math.abs(this.data[idx]),
    //           0,
    //           0.5,
    //           0.001,
    //           3
    //         )
    //         console.log('bef', this.data[idx])
    //         this.data[idx] = constrain(
    //           this.data[idx] + power * oldValueScale,
    //           -0.5,
    //           0.5
    //         )
    //         console.log('aft', this.data[idx])
    //       }
    //     }
    //   }
    // }

    // for (let x = center.x - 1; x <= center.x + 1; x++) {
    //   for (let y = center.y - 1; y <= center.y + 1; y++) {
    //     for (let z = center.z - 1; z <= center.z + 1; z++) {
    //       const dx = x - center.x
    //       const dy = y - center.y
    //       const dz = z - center.z
    //       const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    //       const intensity = 0.2
    //       const sign = -1
    //       const effect = sign * intensity * (1 - distance / radius) // prettier-ignore
    //       const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //       this.data[idx] += effect
    //       console.log(x, y, z, effect)
    //       // const idx = z * gridSize.y * gridSize.x + y * gridSize.x + x // prettier-ignore
    //       // this.data[idx] -= 0.1
    //     }
    //   }
    // }
    // const idx = center.z * gridSize.y * gridSize.x + center.y * gridSize.x + center.x // prettier-ignore
    // this.data[idx] = -1
    // console.log(this.id, this.data[idx])
    // rebuild = true

    if (rebuild) {
      this.build()
    }
    if (checkNeighbours) {
      this.modifyNeighbours(center, radius, subtract)
    }
  }

  modifyNeighbours(center, radius, subtract) {
    const terrain = this.world.terrain

    // const chunkSize = gridSize.x - gridBorder * 2  // Assuming square chunks

    // for (const [dx, dz] of neighbourDirections) {
    //   const checkPoint = v1.set(
    //     center.x + dx * radius,
    //     center.y,
    //     center.z + dz * radius
    //   )

    //   if (checkPoint.x < gridBorder || checkPoint.x > chunkSize - gridBorder ||
    //       checkPoint.z < gridBorder || checkPoint.z > chunkSize - gridBorder) {

    //     const nCoords = v2.set(
    //       this.coords.x + dx,
    //       0,
    //       this.coords.z + dz
    //     )

    //     const nChunk = terrain.getChunkByCoords(
    //       nCoords.x,
    //       nCoords.y,
    //       nCoords.z
    //     )

    //     if (nChunk) {
    //       const nCenter = v3.copy(center).sub(
    //         nCoords.set(dx * chunkSize, 0, dz * chunkSize)
    //       )
    //       nChunk.modifyGrid(nCenter, radius, subtract, false)
    //     }
    //   }
    // }
    // return

    // todo: this is checking all neighbours for now because the if checks are incorrect

    // x-axis
    // if (center.x <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }

    // z-axis
    // if (center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.z += gridSize.z - gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.z - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.z = nCenter.z - gridSize.z + gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }

    // diagonals
    // if (center.x < radius && center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - gridBorder * 2
      nCenter.z += gridSize.z - gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x < radius && gridSize.z - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + gridBorder * 2
      nCenter.z = nCenter.z - gridSize.z + gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (center.x < radius && gridSize.x - center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x - 1, 0, this.coords.z + 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x += gridSize.x - gridBorder * 2
      nCenter.z = nCenter.z - gridSize.z + gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
    // if (gridSize.x - center.x < radius && center.z <= radius) {
    if (true) {
      const nChunk = terrain.getChunkByCoords(this.coords.x + 1, 0, this.coords.z - 1) // prettier-ignore
      nCenter.copy(center)
      nCenter.x = nCenter.x - gridSize.x + gridBorder * 2
      nCenter.z += gridSize.z - gridBorder * 2
      nChunk?.modifyGrid(nCenter, radius, subtract, false)
    }
  }

  isInGrid(coords) {
    return (
      coords.x >= 0 &&
      coords.x < gridSize.x &&
      coords.y > 0 &&
      coords.y < gridSize.y - 1 &&
      coords.z >= 0 &&
      coords.z < gridSize.z
    )
  }
}

// function disposeNode(node) {
//   if (node.isMesh) {
//     node.removeFromParent()
//     if (node.geometry) {
//       node.geometry.dispose()
//     }
//     if (node.material) {
//       if (node.material.map) node.material.map.dispose()
//       if (node.material.lightMap) node.material.lightMap.dispose()
//       if (node.material.bumpMap) node.material.bumpMap.dispose()
//       if (node.material.normalMap) node.material.normalMap.dispose()
//       if (node.material.specularMap) node.material.specularMap.dispose()
//       if (node.material.envMap) node.material.envMap.dispose()
//       if (node.material.alphaMap) node.material.alphaMap.dispose()
//       if (node.material.aoMap) node.material.aoMap.dispose()
//       if (node.material.displacementMap) node.material.displacementMap.dispose()
//       if (node.material.emissiveMap) node.material.emissiveMap.dispose()
//       if (node.material.gradientMap) node.material.gradientMap.dispose()
//       if (node.material.metalnessMap) node.material.metalnessMap.dispose()
//       if (node.material.roughnessMap) node.material.roughnessMap.dispose()
//       node.material.dispose()
//     }
//   }
// }

function getRandomColorHex() {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

function constrain(n, low, high) {
  return Math.max(Math.min(n, high), low)
}

function map(n, start1, stop1, start2, stop2, withinBounds) {
  const newval = ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2
  if (!withinBounds) {
    return newval
  }
  if (start2 < stop2) {
    return constrain(newval, start2, stop2)
  } else {
    return constrain(newval, stop2, start2)
  }
}

// function smoothstep(edge0, edge1, x) {
//   const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
//   return t * t * (3 - 2 * t)
// }

const cNormal = new THREE.Vector3()
function normalToCardinal(normal) {
  const absX = Math.abs(normal.x)
  const absY = Math.abs(normal.y)
  const absZ = Math.abs(normal.z)

  if (absX > absY && absX > absZ) {
    // East or West
    return cNormal.set(Math.sign(normal.x), 0, 0)
  } else if (absY > absX && absY > absZ) {
    // Up or Down
    return cNormal.set(0, Math.sign(normal.y), 0)
  } else {
    // North or South
    return cNormal.set(0, 0, Math.sign(normal.z))
  }
}

function remap(value, min, max) {
  return min + (max - min) * value
}

function remapNoise(value, min, max) {
  return min + ((max - min) * (value + 1)) / 2
}

function alphaToSin(value) {
  return value * 2 - 1 // map (0, 1) to (-1, 1)
}

function sinToAlpha(value) {
  return value / 2 + 0.5 // map (-1, 1) to (0, 1)
}

// function generateNoiseTexture(width = 4096, height = 4096) {
//   const canvas = document.createElement('canvas');
//   canvas.width = width;
//   canvas.height = height;
//   const ctx = canvas.getContext('2d');

//   const imageData = ctx.createImageData(width, height);
//   const data = imageData.data;

//   for (let i = 0; i < data.length; i += 4) {
//     const value = Math.random() * 255;
//     data[i] = value;     // R
//     data[i + 1] = value; // G
//     data[i + 2] = value; // B
//     data[i + 3] = 255;   // A
//   }

//   ctx.putImageData(imageData, 0, 0);

//   const texture = new THREE.CanvasTexture(canvas);
//   texture.wrapS = THREE.RepeatWrapping;
//   texture.wrapT = THREE.RepeatWrapping;
//   texture.minFilter = THREE.LinearMipmapLinearFilter;
//   texture.magFilter = THREE.LinearFilter;

//   return texture;
// }

function generateNoiseTexture(width = 512, height = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4

      // Generate tileable noise using smoothed noise function
      const value = tileableNoise(x / width, y / height) * 255

      data[i] = value // R
      data[i + 1] = value // G
      data[i + 2] = value // B
      data[i + 3] = 255 // A
    }
  }

  ctx.putImageData(imageData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter

  return texture
}

function tileableNoise(x, y) {
  const n = 8 // Number of intervals
  const fx = Math.floor(x * n)
  const fy = Math.floor(y * n)
  const dx = x * n - fx
  const dy = y * n - fy

  const rx0 = fx / n
  const rx1 = (fx + 1) / n
  const ry0 = fy / n
  const ry1 = (fy + 1) / n

  const c00 = smoothNoise(rx0, ry0)
  const c10 = smoothNoise(rx1, ry0)
  const c01 = smoothNoise(rx0, ry1)
  const c11 = smoothNoise(rx1, ry1)

  const nx0 = lerp(c00, c10, smoothStep(dx))
  const nx1 = lerp(c01, c11, smoothStep(dx))

  return lerp(nx0, nx1, smoothStep(dy))
}

function smoothNoise(x, y) {
  const corners = (noise(x - 1, y - 1) + noise(x + 1, y - 1) + noise(x - 1, y + 1) + noise(x + 1, y + 1)) / 16
  const sides = (noise(x - 1, y) + noise(x + 1, y) + noise(x, y - 1) + noise(x, y + 1)) / 8
  const center = noise(x, y) / 4
  return corners + sides + center
}

function noise(x, y) {
  const n = x + y * 57
  return (Math.sin(n * 21942.21) * 43758.5453) % 1
}

function lerp(a, b, t) {
  return a + t * (b - a)
}

function smoothStep(t) {
  return t * t * (3 - 2 * t)
}
