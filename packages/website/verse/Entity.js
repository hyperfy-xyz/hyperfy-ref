export class Entity {
  constructor(world, data) {
    this.world = world

    this.type = 'unknown'
    this.isEntity = true

    this.id = data.id
    this.props = data.props || {}
    this.state = data.state || {}
  }
}
