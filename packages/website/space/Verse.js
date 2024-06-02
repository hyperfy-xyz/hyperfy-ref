import { World } from './World'

const browser = typeof window !== 'undefined'

export class Verse {
  constructor() {
    this.world = null
    this.next = null
    if (browser) {
      window.verse = this
    }
  }

  connect(id, auth) {
    if (!browser) return
    if (!this.world) {
      this.world = new World({ id, auth })
      this.log('create world')
      return
    }
    if (this.world && this.world.id === id) {
      this.log('set world auth')
      this.world.setAuth(auth)
      return
    }
    if (this.next && this.next.id === id) {
      this.log('set next auth')
      this.next.setAuth(auth)
      return
    }
    if (this.next && this.next.id !== id) {
      this.log('next changed, destroying')
      this.next.destroy()
    }
    this.log('create next')
    this.next = new World({ id, auth })
    const onStatus = status => {
      if (this.dead) return
      if (status === 'active') {
        this.log('next active, swapping', this.next)
        this.next.off('status', onStatus)
        const old = this.world
        this.world = this.next
        this.next = null
        if (old) {
          old.emit('swap')
          old.destroy()
        }
      }
    }
    this.next.on('status', onStatus)
  }

  log(...args) {
    console.log('[verse]', ...args)
  }

  destroy() {
    this.world?.destroy()
    this.world = null
    this.next?.destroy()
    this.next = null
    this.dead = true
  }
}
