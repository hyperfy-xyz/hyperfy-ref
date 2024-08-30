import CustomShaderMaterial from '../libs/three-custom-shader-material'

import { createNode } from './createNode'

const groupTypes = ['Scene', 'Group', 'Object3D']

export function glbToNodes(glb, world) {
  const nodes = new Map()
  function registerNode(data) {
    const node = createNode(data)
    if (nodes.has(node.id)) {
      console.error('node with id already exists:', node.id)
      return
    }
    nodes.set(node.id, node)
    return node
  }
  const materials = {}
  function getMaterial(threeMaterial) {
    if (!materials[threeMaterial.uuid]) {
      materials[threeMaterial.uuid] = world.composites.createMaterial({ internal: threeMaterial })
    }
    return materials[threeMaterial.uuid]
  }

  function parse(object3ds, parentNode) {
    for (const object3d of object3ds) {
      const props = object3d.userData || {}
      // LOD (custom node)
      if (props.node === 'lod') {
        const node = registerNode({
          id: object3d.name,
          name: 'lod',
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      // RigidBody (custom node)
      else if (props.node === 'rigidbody') {
        const node = registerNode({
          id: object3d.name,
          name: 'rigidbody',
          type: props.type,
          mass: props.mass,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      // Collider (custom node)
      else if (props.node === 'collider') {
        console.error('TODO: glbToNodes collider for box/sphere in blender?')
        console.log(object3d)
        const node = registerNode({
          id: object3d.name,
          name: 'collider',
          type: 'custom',
          geometry: object3d.geometry,
          convex: props.convex,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      // Mesh
      else if (object3d.type === 'Mesh') {
        // wind effect
        if (props.wind) {
          addWind(object3d, world)
        }
        const material = getMaterial(object3d.material)
        const node = registerNode({
          id: object3d.name,
          name: 'mesh',
          type: 'custom',
          geometry: object3d.geometry,
          material,
          visible: props.visible,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        if (parentNode.name === 'lod' && props.maxDistance) {
          parentNode.insert(node, props.maxDistance)
        } else {
          parentNode.add(node)
        }
        parse(object3d.children, node)
      }
      // SkinnedMesh
      else if (object3d.type === 'SkinnedMesh') {
        // TODO
      }
      // Object3D / Group / Scene
      else if (groupTypes.includes(object3d.type)) {
        const node = registerNode({
          id: object3d.name,
          name: 'group',
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
    }
  }
  const root = registerNode({
    id: '$root',
    name: 'group',
  })
  // parseTerrain(glb)
  parse(glb.scene.children, root)
  console.log('$root', root)
  return root
}

function addWind(mesh, world) {
  const uniforms = world.wind.uniforms
  mesh.material.onBeforeCompile = shader => {
    shader.uniforms.time = uniforms.time
    shader.uniforms.strength = uniforms.strength
    shader.uniforms.direction = uniforms.direction
    shader.uniforms.speed = uniforms.speed
    shader.uniforms.noiseScale = uniforms.noiseScale
    shader.uniforms.ampScale = uniforms.ampScale
    shader.uniforms.freqMultiplier = uniforms.freqMultiplier

    const height = mesh.geometry.boundingBox.max.y * mesh.scale.y

    shader.uniforms.height = { value: height } // prettier-ignore
    shader.uniforms.stiffness = { value: 0 }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      uniform float time;
      uniform float strength;
      uniform vec3 direction;
      uniform float speed;
      uniform float noiseScale;
      uniform float ampScale;
      uniform float freqMultiplier;
      
      uniform float height;
      uniform float stiffness;

      ${snoise}

      #include <common>
      `
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      vec4 worldPos = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        worldPos = instanceMatrix * worldPos;
      #endif
      worldPos = modelMatrix * worldPos;

      float heightFactor = position.y / height;
      float noiseFactor = snoise(worldPos.xyz * noiseScale + time * speed);
      vec3 displacement = sin(time * freqMultiplier + worldPos.xyz) * noiseFactor * ampScale * heightFactor * (1.0 - stiffness);
      transformed += strength * displacement * direction;
      `
    )
  }
}

const snoise = `
  //	Simplex 3D Noise 
  //	by Ian McEwan, Stefan Gustavson (https://github.com/stegu/webgl-noise)
  //
  vec4 permute(vec4 x){
    return mod(((x*34.0)+1.0)*x, 289.0);
  }
  vec4 taylorInvSqrt(vec4 r){ 
    return 1.79284291400159 - 0.85373472095314 * r; 
  }

  float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0. + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
      i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients
  // ( N*N points uniformly over a square, mapped onto an octahedron.)
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
  }
`

// const terrainLayerNames = ['layer1', 'layer2', 'layer3', 'layer4', 'splat']
// function parseTerrain(glb) {
//   let terrain
//   glb.scene.traverse(node => {
//     if (node.isMesh && node.userData.terrain) {
//       terrain = node
//     }
//   })
//   if (!terrain) return
//   console.log('terrain', terrain)
//   // console.log(glb.scene)
//   // fix stupid vertex color attribute (see: https://github.com/KhronosGroup/glTF-Blender-IO/pull/2017#issuecomment-2045046638)
//   let hasVertexColors
//   if (terrain.geometry.hasAttribute('_color')) {
//     terrain.geometry.setAttribute('color', terrain.geometry.attributes._color)
//     terrain.geometry.deleteAttribute('_color')
//     hasVertexColors = true
//   }
//   // force collider
//   terrain.userData.collider = true
//   // const splatMap = terrain.material
//   // splatMap.wrapS = THREE.RepeatWrapping
//   // splatMap.wrapT = THREE.RepeatWrapping
//   // splatMap.colorSpace = THREE.SRGBColorSpace
//   const layers = {}
//   const toRemove = []
//   glb.scene.traverse(node => {
//     if (node.material && terrainLayerNames.includes(node.material.name)) {
//       layers[node.material.name] = node.material
//       node.material.wrapS = THREE.RepeatWrapping
//       node.material.wrapT = THREE.RepeatWrapping
//       // node.material.map.colorSpace = THREE.SRGBColorSpace
//       toRemove.push(node)
//     }
//   })
//   while (toRemove.length) {
//     toRemove.pop().removeFromParent()
//   }
//   const material = new CustomShaderMaterial({
//     baseMaterial: THREE.MeshPhysicalMaterial, // terrain.material is dark for some reason
//     vertexShader: `
//       varying vec2 vUv;
//       varying vec3 vNorm;
//       varying vec3 vPos;
//       void main() {
//         vUv = uv;
//         vNorm = normalize(normal);
//         vPos = position;
//         // vec4 foo = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
//         // vPos = foo.xyz;
//         // vec4 wPos = modelMatrix * vec4(position, 1.0);
//         // vPos = wPos.xyz;
//       }
//     `,

//     // fragmentShader: `
//     //   uniform bool hasVertexColors;
//     //   uniform sampler2D splatMap;

//     //   uniform sampler2D layer1Map;
//     //   uniform sampler2D layer2Map;
//     //   uniform sampler2D layer3Map;
//     //   uniform sampler2D layer4Map;

//     //   uniform float layer1Scale;
//     //   uniform float layer2Scale;
//     //   uniform float layer3Scale;
//     //   uniform float layer4Scale;

//     //   varying vec2 vUv;

//     //   // vec4 sRGBToLinear(vec4 color) {
//     //   //   return vec4(pow(color.rgb, vec3(2.2)), color.a);
//     //   // }

//     //   // vec4 LinearToSRGB(vec4 color) {
//     //   //   return vec4(pow(color.rgb, vec3(1.0 / 2.2)), color.a);
//     //   // }

//     //   void main() {
//     //     vec2 layer1Res = vec2(layer1Scale, layer1Scale);
//     //     vec2 layer2Res = vec2(layer2Scale, layer2Scale);
//     //     vec2 layer3Res = vec2(layer3Scale, layer3Scale);
//     //     vec2 layer4Res = vec2(layer4Scale, layer4Scale);

//     //     vec4 splat = texture2D(splatMap, vUv);

//     //     vec4 result = vec4(0, 0, 0, 1.0);
//     //     result += splat.r * texture2D(layer1Map, vUv * layer1Res);
//     //     result += splat.g * texture2D(layer2Map, vUv * layer2Res);
//     //     result += splat.b * texture2D(layer3Map, vUv * layer3Res);
//     //     result += (1.0 - splat.a) * texture2D(layer4Map, vUv * layer4Res);
//     //     if (hasVertexColors) {
//     //       // result *= vColor;
//     //     }
//     //     csm_DiffuseColor *= result;
//     //   }
//     // `,

//     // fragmentShader: `
//     //   uniform sampler2D splatMap;
//     //   uniform sampler2D layer1Map;
//     //   uniform sampler2D layer2Map;
//     //   uniform sampler2D layer3Map;
//     //   uniform sampler2D layer4Map;

//     //   uniform float layer1Scale;
//     //   uniform float layer2Scale;
//     //   uniform float layer3Scale;
//     //   uniform float layer4Scale;

//     //   varying vec2 vUv;

//     //   void main() {
//     //     vec4 splat = texture2D(splatMap, vUv);
//     //     vec4 result = vec4(0, 0, 0, 1.0);
//     //     result += splat.r * texture2D(layer1Map, vUv * layer1Scale);
//     //     result += splat.g * texture2D(layer2Map, vUv * layer2Scale);
//     //     result += splat.b * texture2D(layer3Map, vUv * layer3Scale);
//     //     result += (1.0 - splat.a) * texture2D(layer4Map, vUv * layer4Scale);
//     //     csm_DiffuseColor *= result;
//     //   }
//     // `,

//     // NOTE: we can use world coordinates too when triplanar is disabled so they match
//     // vec2 calculateUV(vec3 worldPos, float scale) {
//     //   // Assuming horizontal projection, this can be modified as needed
//     //   return worldPos.xz * scale;
//     // }
//     // vec2 uv = calculateUV(worldPos, textureScale);
//     // color = texture2D(texture, uv);

//     fragmentShader: `
//       uniform sampler2D splatMap;
//       uniform sampler2D layer1Map;
//       uniform sampler2D layer2Map;
//       uniform sampler2D layer3Map;
//       uniform sampler2D layer4Map;
//       uniform float layer1Scale;
//       uniform float layer2Scale;
//       uniform float layer3Scale;
//       uniform float layer4Scale;
//       varying vec2 vUv;
//       varying vec3 vNorm;
//       varying vec3 vPos;

//       vec4 textureTriplanar(sampler2D tex, float scale, vec3 normal, vec3 position) {
//           vec2 uv_x = position.yz * scale;
//           vec2 uv_y = position.xz * scale;
//           vec2 uv_z = position.xy * scale;
//           vec4 xProjection = texture2D(tex, uv_x);
//           vec4 yProjection = texture2D(tex, uv_y);
//           vec4 zProjection = texture2D(tex, uv_z);
//           vec3 weight = abs(normal);
//           weight = pow(weight, vec3(4.0)); // bias towards the major axis
//           weight = weight / (weight.x + weight.y + weight.z);
//           return xProjection * weight.x + yProjection * weight.y + zProjection * weight.z;
//       }

//       void main() {
//           vec4 splat = texture2D(splatMap, vUv);
//           vec4 result = vec4(0, 0, 0, 1.0);
//           result += splat.r * textureTriplanar(layer1Map, layer1Scale, vNorm, vPos);
//           result += splat.g * textureTriplanar(layer2Map, layer2Scale, vNorm, vPos);
//           result += splat.b * textureTriplanar(layer3Map, layer3Scale, vNorm, vPos);
//           result += (1.0 - splat.a) * textureTriplanar(layer4Map, layer4Scale, vNorm, vPos);
//           csm_DiffuseColor *= result;
//       }
//     `,

//     // fragmentShader: `
//     //   uniform sampler2D splatMap;
//     //   uniform sampler2D layer1Map;
//     //   uniform sampler2D layer2Map;
//     //   uniform sampler2D layer3Map;
//     //   uniform sampler2D layer4Map;

//     //   uniform float layer1Scale;
//     //   uniform float layer2Scale;
//     //   uniform float layer3Scale;
//     //   uniform float layer4Scale;

//     //   varying vec2 vUv;
//     //   varying vec3 vNorm;
//     //   varying vec3 vPos;

//     //   vec4 textureTriplanar(sampler2D map, float scale, vec3 norm, vec3 pos) {
//     //     vec3 weights = abs(norm);
//     //     weights =  weights / (weights.x + weights.y + weights.z);

//     //     vec2 uvX = vPos.yz;
//     //     vec2 uvY = vPos.xz;
//     //     vec2 uvZ = vPos.xy;

//     //     vec4 texX = texture2D(map, uvX);
//     //     vec4 texY = texture2D(map, uvY);
//     //     vec4 texZ = texture2D(map, uvZ);

//     //     vec4 color = texX * weights.x + texY * weights.y + texZ * weights.z;
//     //     return color;

//     //     // vec3 blendWeights = pow(abs(norm), vec3(2.0));
//     //     // blendWeights = blendWeights / (blendWeights.x + blendWeights.y + blendWeights.z);
//     //     // vec4 triplanarTex = texX * blendWeights.x + texY * blendWeights.y + texZ * blendWeights.z;
//     //     // return triplanarTex;
//     //   }

//     //   void main() {
//     //     vec4 splat = texture2D(splatMap, vUv);
//     //     vec4 result = vec4(0, 0, 0, 1.0);

//     //     #ifdef USE_TRIPLANAR_PROJECTION
//     //       vec3 nNormal = normalize(vNorm);
//     //       result += splat.r * textureTriplanar(layer1Map, layer1Scale, nNormal, vPos);
//     //       result += splat.g * textureTriplanar(layer2Map, layer2Scale, nNormal, vPos);
//     //       result += splat.b * textureTriplanar(layer3Map, layer3Scale, nNormal, vPos);
//     //       result += (1.0 - splat.a) * textureTriplanar(layer4Map, layer4Scale, nNormal, vPos);
//     //     #else
//     //       result += splat.r * texture2D(layer1Map, vUv * layer1Scale);
//     //       result += splat.g * texture2D(layer2Map, vUv * layer2Scale);
//     //       result += splat.b * texture2D(layer3Map, vUv * layer3Scale);
//     //       result += (1.0 - splat.a) * texture2D(layer4Map, vUv * layer4Scale);
//     //     #endif

//     //     #ifdef USE_VERT_COLORS
//     //       result *= vColor;
//     //     #endif

//     //     csm_DiffuseColor *= result;
//     //   }
//     // `,

//     // fragmentShader: `
//     //   uniform bool rotate;
//     //   uniform sampler2D splatMap;

//     //   uniform sampler2D layer1Map;
//     //   uniform sampler2D layer2Map;
//     //   uniform sampler2D layer3Map;
//     //   uniform sampler2D layer4Map;

//     //   uniform float layer1Scale;
//     //   uniform float layer2Scale;
//     //   uniform float layer3Scale;
//     //   uniform float layer4Scale;

//     //   varying vec2 vUv;

//     //   float randMaskValue = 3.0;

//     //   float rand2(vec2 co) {
//     //     return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
//     //   }

//     //   vec2 rotateUV(vec2 uv, float angle) {
//     //     float s = sin(angle);
//     //     float c = cos(angle);
//     //     uv -= 0.5;
//     //     uv = vec2(
//     //         c * uv.x - s * uv.y,
//     //         s * uv.x + c * uv.y
//     //     );
//     //     uv += 0.5;
//     //     return uv;
//     //   }

//     //   vec2 getRotatedUV(vec2 uv, float scale, float randMaskValue) {
//     //     if (rotate) {
//     //         float randValue = rand2(floor(uv * scale)) * randMaskValue;
//     //         float angle = floor(randValue) * (PI / 2.0);
//     //         return rotateUV(uv, angle);
//     //     } else {
//     //         return uv;
//     //     }
//     //   }

//     //   void main() {
//     //     vec2 layer1Res = vec2(layer1Scale, layer1Scale);
//     //     vec2 layer2Res = vec2(layer2Scale, layer2Scale);
//     //     vec2 layer3Res = vec2(layer3Scale, layer3Scale);
//     //     vec2 layer4Res = vec2(layer4Scale, layer4Scale);

//     //     vec4 splat = texture2D(splatMap, vUv);
//     //     vec4 result = vec4(0, 0, 0, 1.0);

//     //     vec2 rotatedUv1 = getRotatedUV(vUv, layer1Scale, randMaskValue);
//     //     vec2 rotatedUv2 = getRotatedUV(vUv, layer2Scale, randMaskValue);
//     //     vec2 rotatedUv3 = getRotatedUV(vUv, layer3Scale, randMaskValue);
//     //     vec2 rotatedUv4 = getRotatedUV(vUv, layer4Scale, randMaskValue);

//     //     result += splat.r * texture2D(layer1Map, rotatedUv1 * layer1Res);
//     //     result += splat.g * texture2D(layer2Map, rotatedUv2 * layer2Res);
//     //     result += splat.b * texture2D(layer3Map, rotatedUv3 * layer3Res);
//     //     result += (1.0 - splat.a) * texture2D(layer4Map, rotatedUv4 * layer4Res);
//     //     csm_DiffuseColor *= result * vColor;
//     //   }
//     // `,
//     uniforms: {
//       // triplanarScale: { value: 0.2 },
//       rotate: { value: true }, // TODO: how do i make seamless horizontal AND vertical ;)
//       splatMap: { value: layers.splat.map },
//       layer1Map: { value: layers.layer1.map },
//       layer2Map: { value: layers.layer2.map },
//       layer3Map: { value: layers.layer3.map },
//       layer4Map: { value: layers.layer4.map },
//       layer1Scale: { value: 0.2 /*this.layer1Scale*/ },
//       layer2Scale: { value: 0.3 /*this.layer2Scale*/ },
//       layer3Scale: { value: 0.1 /*this.layer3Scale*/ },
//       layer4Scale: { value: 100 /*this.layer4Scale*/ },
//     },
//     defines: {
//       // USE_TRIPLANAR_PROJECTION: true,
//       // USE_ROTATION_MASKS: true,
//       // USE_VERT_COLORS: true,
//     },
//   })

//   material.vertexColors = true
//   // material.roughness = 1
//   // material.metalness = 0
//   material.roughness = terrain.material.roughness
//   material.metalness = terrain.material.metalness
//   // window.terrain0 = terrain.material
//   // window.terrain1 = material
//   terrain.material = material
// }
