/**
 * Event
 * - t(type) is "e" for event
 * - n(name) is the event name
 * - d(data) is the event data
 *
 * Call
 * - t(type) is "c" for call
 * - n(name) is the method name
 * - d(data) is the method args array
 * - i(id) is a callback id
 *
 * Result
 * - t(type) is "r" for call result
 * - d(data) is the result (on success)
 * - e(error) is the result error message (on error)
 * - i(id) is the caller id
 */

let callIds = 0

export class SockClient {
  constructor(url, useQueue = true) {
    this.id = null
    this.connected = false
    this.useQueue = useQueue
    this.queue = []
    this.eventHandlers = {}
    this.methodHandlers = {}
    this.methodListeners = {}
    this.ws = new WebSocket(url)
    this.ws.addEventListener('open', () => {
      this.connected = true
      this._emit('connect')
    })
    this.ws.addEventListener('close', e => {
      this.connected = false
      this.disconnect(e?.code)
    })
    this.ws.addEventListener('message', msg => {
      this.enqueue(msg)
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
    let data
    try {
      data = JSON.parse(msg.data)
    } catch (err) {
      console.error(err)
      return
    }
    // this.log('<-', data)
    const { t, n, d, e, i } = data
    if (t === 'e') {
      this._emit(n, d)
    }
    if (t === 'c') {
      const handler = this.methodHandlers[n]
      if (handler) {
        let result
        try {
          result = await handler(...d)
        } catch (err) {
          console.error(err)
          this._sendJSON({
            t: 'r',
            i: i,
            e: err.message,
          })
          return
        }
        this._sendJSON({
          t: 'r',
          i: i,
          d: result,
        })
      } else {
        this._sendJSON({
          t: 'r',
          i: i,
          e: `Unknown method '${n}'`,
        })
      }
    }
    if (t === 'r') {
      const listener = this.methodListeners[i]
      if (e) {
        listener.reject(e)
      } else {
        listener.resolve(d)
      }
      delete this.methodListeners[i]
    }
  }

  on(event, handler) {
    this.eventHandlers[event] = handler
  }

  _emit(event, data) {
    this.eventHandlers[event]?.(data)
  }

  bind(method, handler) {
    if (this.methodHandlers[method]) {
      throw new Error('method already has a handler')
    }
    this.methodHandlers[method] = handler
  }

  async send(event, data) {
    this._sendJSON({ t: 'e', n: event, d: data })
  }

  async _sendJSON(data) {
    // this.log('->', data)
    this.ws.send(JSON.stringify(data))
  }

  call(method, ...args) {
    return new Promise((resolve, reject) => {
      const callId = ++callIds
      this.methodListeners[callId] = { resolve, reject }
      this._sendJSON({
        t: 'c',
        n: method,
        d: args,
        i: callId,
      })
    })
  }

  disconnect(code) {
    if (this.connected) return this.ws.close()
    this._emit('disconnect', code)
  }

  log(...args) {
    console.log('[sock]', ...args)
  }
}
