import { storageKeys } from './constants'

export function getChunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`
}

export function getSeed() {
  return parseFloat(
    sessionStorage.getItem(storageKeys.MAP_SEED) || Math.random().toString()
  )
}
