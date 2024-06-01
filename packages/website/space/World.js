export class World {
  constructor(verse, { type, id, auth, onConnect }) {
    this.verse = verse
    this.type = type
    this.id = id
    this.auth = auth
    this.onConnect = onConnect
    this.permissions = new Permissions(this)
    this.entities = new Entities(this)
    this.network = new Network(this)
  }

  update(delta) {
    this.permissions.update(delta)
    this.entities.update(delta)
    this.network.update(delta)
  }

  lateUpdate(delta) {
    this.permissions.lateUpdate(delta)
    this.entities.lateUpdate(delta)
    this.network.lateUpdate(delta)
  }

  fixedUpdate(delta) {
    this.permissions.fixedUpdate(delta)
    this.entities.fixedUpdate(delta)
    this.network.fixedUpdate(delta)
  }

  destroy() {
    this.permissions.destroy()
    this.entities.destroy()
    this.network.destroy()
  }
}
