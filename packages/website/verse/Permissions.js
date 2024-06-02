import { System } from './System'

export class Permissions extends System {
  constructor(world) {
    super(world)
  }

  canCreatePrototype() {
    const worldPerms = this.world.network.permissions
    const userPerms = this.world.network.client.permissions
    return worldPerms.prototypeCreate || userPerms.prototypeCreate
  }

  canMoveEntity(entity) {
    const client = this.world.network.client
    const userId = client.user.id
    const worldPerms = this.world.network.permissions
    const userPerms = this.world.network.client.permissions
    if (entity.schema.type === 'prototype') {
      // if you created it you can move it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only move if you have move permission
      return worldPerms.prototypeMove || userPerms.prototypeMove
    }
    if (entity.schema.type === 'item') {
      return worldPerms.itemMove || userPerms.itemMove
    }
    return false
  }

  canEditEntity(entity) {
    const client = this.world.network.client
    const userId = client.user.id
    const worldPerms = this.world.network.permissions
    const userPerms = this.world.network.client.permissions
    if (entity.schema.type === 'prototype') {
      // if you created it you can edit it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only edit if you have edit permission
      return worldPerms.prototypeEdit || userPerms.prototypeEdit
    }
    return false
  }

  canDestroyEntity(entity) {
    const client = this.world.network.client
    const userId = client.user.id
    const worldPerms = this.world.network.permissions
    const userPerms = this.world.network.client.permissions
    if (entity.schema.type === 'prototype') {
      // if you created it you can destroy it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only destroy if you have destroy permission
      return worldPerms.prototypeDestroy || userPerms.prototypeDestroy
    }
    return false
  }
}
