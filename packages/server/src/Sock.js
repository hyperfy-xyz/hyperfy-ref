let ids = 0

export class Sock {
  constructor(ws) {
    this.id = ids++
    this.listeners = {}
    this.alive = true
    this.closed = false
    this.disconnected = false
    this.ws = ws
    this.init()
  }

  init() {
    this.ws.on('message', msg => {
      try {
        msg = JSON.parse(msg)
      } catch (err) {
        console.error(err)
        return
      }
      this.emit(msg[0], msg[1])
    })
    this.ws.on('pong', () => {
      this.alive = true
      this.emit('pong')
    })
    this.ws.on('close', e => {
      this.closed = true
      this.disconnect(e?.code)
    })
  }

  on(event, handler) {
    this.listeners[event] = handler
  }

  emit(event, data) {
    this.listeners[event]?.(this, data)
  }

  send(event, data) {
    this.ws.send(JSON.stringify([event, data]))
  }

  close(code) {
    this.ws.close(code)
  }

  disconnect(code) {
    if (!this.closed) return this.ws.terminate()
    if (this.disconnected) return
    this.disconnected = true
    this.emit('disconnect', code) // emit for others
  }
}
