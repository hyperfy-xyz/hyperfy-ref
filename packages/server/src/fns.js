import moment from 'moment'

import { db } from './db'
import { readToken } from './jwt'

export async function getOrCreateWorld(id) {
  let world = await db('worlds').where('id', id).first()
  if (!world) {
    const now = moment().toISOString()
    world = {
      id,
      name: 'New World',
      ownerId: null,
      createdAt: now,
      updatedAt: now,
    }
    await db('worlds').insert(world)
  }
  return world
}

export async function getOrCreatePermissions(id) {
  // either <worldId> or <userId>@<worldId>
  // for world permissions and user-world permissions respectively
  const isWorld = !id.includes('@')
  let permissions = await db('permissions').where('id', id).first()
  if (!permissions) {
    const now = moment().toISOString()
    if (isWorld) {
      permissions = {
        id,
        worldAdmin: false,
        worldMeta: false,
        prototypeCreate: true,
        prototypeEdit: true,
        prototypeMove: true,
        prototypeDestroy: true,
        itemSpawn: true,
        itemMove: true,
        itemReturn: true,
        avatarVoice: true,
        avatarMute: true,
        avatarKick: true,
        createdAt: now,
        updatedAt: now,
      }
    } else {
      permissions = {
        id,
        worldAdmin: false,
        worldMeta: false,
        prototypeCreate: false,
        prototypeEdit: false,
        prototypeMove: false,
        prototypeDestroy: false,
        itemSpawn: false,
        itemMove: false,
        itemReturn: false,
        avatarVoice: false,
        avatarMute: false,
        avatarKick: false,
        createdAt: now,
        updatedAt: now,
      }
    }
    await db('permissions').insert(permissions)
  }
  return permissions
}

export async function getEntitiesByWorld(worldId) {
  return []
}

export async function getUserByToken(token) {
  if (!token) return null
  let value
  try {
    value = await readToken(token)
  } catch (err) {
    return null
  }
  const { userId } = value
  const user = await db('users').where('id', userId).first()
  return user
}
