const compressed = true // process.env.NODE_ENV === 'production'

let n = 0
const getEnum = () => n++

export const Events = {
  AUTH: compressed ? getEnum() : 'auth',
  SNAPSHOT: compressed ? getEnum() : 'snapshot',
  CLIENT_ADDED: compressed ? getEnum() : 'client:added',
  CLIENT_UPDATED: compressed ? getEnum() : 'client:updated',
  CLIENT_REMOVED: compressed ? getEnum() : 'client:removed',
  SCHEMA_UPSERTED: compressed ? getEnum() : 'schema:upserted',
  ENTITY_ADDED: compressed ? getEnum() : 'entity:added',
  ENTITY_UPDATED: compressed ? getEnum() : 'entity:updated',
  ENTITY_REMOVED: compressed ? getEnum() : 'entity:removed',
}
