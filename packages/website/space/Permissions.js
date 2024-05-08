import { System } from './System'

export class Permissions extends System {
  constructor(space) {
    super(space)
  }

  canCreatePrototype() {
    const spacePerms = this.space.network.permissions
    const userPerms = this.space.network.client.permissions
    return spacePerms.prototypeCreate || userPerms.prototypeCreate
  }

  canMoveEntity(entity) {
    const client = this.space.network.client
    const userId = client.user.id
    const spacePerms = this.space.network.permissions
    const userPerms = this.space.network.client.permissions
    if (entity.type === 'prototype') {
      // if you created it you can move it if you still have the create permission
      if (entity.creator === userId) {
        return spacePerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only move if you have move permission
      return spacePerms.prototypeMove || userPerms.prototypeMove
    }
    if (entity.type === 'item') {
      return spacePerms.itemMove || userPerms.itemMove
    }
    return false
  }

  canEditEntity(entity) {
    const client = this.space.network.client
    const userId = client.user.id
    const spacePerms = this.space.network.permissions
    const userPerms = this.space.network.client.permissions
    if (entity.type === 'prototype') {
      // if you created it you can edit it if you still have the create permission
      if (entity.creator === userId) {
        return spacePerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only edit if you have edit permission
      return spacePerms.prototypeEdit || userPerms.prototypeEdit
    }
    return false
  }

  canDestroyEntity(entity) {
    const client = this.space.network.client
    const userId = client.user.id
    const spacePerms = this.space.network.permissions
    const userPerms = this.space.network.client.permissions
    if (entity.type === 'prototype') {
      // if you created it you can destroy it if you still have the create permission
      if (entity.creator === userId) {
        return spacePerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only destroy if you have destroy permission
      return spacePerms.prototypeDestroy || userPerms.prototypeDestroy
    }
    return false
  }
}
