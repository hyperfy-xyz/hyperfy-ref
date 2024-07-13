export class Sock {
  constructor(url, useQueue = true) {
    this.id = null
    this.connected = false
    this.useQueue = useQueue
    this.listeners = {}
    this.queue = []
    this.ws = new WebSocket(url)
    this.ws.addEventListener('open', () => {
      this.connected = true
      this.emit('connect')
    })
    this.ws.addEventListener('close', e => {
      this.connected = false
      this.disconnect(e?.code)
    })
    this.ws.addEventListener('message', e => {
      this.enqueue(e.data)
    })
  }

  enqueue(msg) {
    if (this.useQueue) {
      this.queue.push(msg)
    } else {
      this.exec(msg)
    }
  }

  flush() {
    while (this.queue.length) {
      this.exec(this.queue.shift())
    }
  }

  async exec(msg) {
    try {
      msg = JSON.parse(msg)
    } catch (err) {
      console.error(err)
      return
    }
    this.emit(msg[0], msg[1])
  }

  on(event, handler) {
    this.listeners[event] = handler
  }

  emit(event, data) {
    this.listeners[event]?.(data)
  }

  async send(event, data) {
    this.ws.send(JSON.stringify([event, data]))
  }

  disconnect(code) {
    if (this.connected) return this.ws.close()
    this.emit('disconnect', code)
  }
}
