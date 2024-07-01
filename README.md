# Supaverse

## engines

- node 20.11.0
- yarn 4.3.1 (corepack enable; yarn set version stable)

## three-vrm

- we needed to fork three-vrm to fix the new three@0.166.0 shadowIntensity value 
    - https://github.com/pixiv/three-vrm/pull/1431
- in our fork we made a new "build" branch that makes a build `yarn build`
- we copied three-vrm/packages/three-vrm/lib/three-vrm.module.js -> verse/lib/three-vrm.js
- and we use that instead, until the PR is merged