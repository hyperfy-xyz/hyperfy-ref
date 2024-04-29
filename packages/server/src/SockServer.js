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

let ids = 0
let callIds = 0

export class SockServer {
  constructor(ws) {
    this.id = ++ids
    this.eventHandlers = {}
    this.methodHandlers = {}
    this.responseHandlers = {}
    this.alive = true
    this.ws = ws
    this.ws.on('message', async message => {
      let data
      try {
        data = JSON.parse(message)
      } catch (err) {
        console.error(err)
        return
      }
      // this._emit('<-', data)
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
        const handler = this.responseHandlers[i]
        if (e) {
          handler.reject(e)
        } else {
          handler.resolve(d)
        }
        delete this.responseHandlers[i]
      }
    })
    this.ws.on('pong', () => {
      this.alive = true
      this._emit('pong')
    })
    this.ws.on('close', e => {
      this.closed = true
      this.disconnect(e?.code)
    })
  }

  on(event, handler) {
    this.eventHandlers[event] = handler
  }

  _emit(event, data) {
    this.eventHandlers[event]?.(this, data)
  }

  bind(methodName, handler) {
    if (this.methodHandlers[methodName]) {
      throw new Error('method handler already bound')
    }
    this.methodHandlers[methodName] = handler
  }

  async send(event, data) {
    this._sendJSON({
      t: 'e',
      n: event,
      d: data,
    })
  }

  async _sendJSON(json) {
    this._emit('->', json)
    this.ws.send(JSON.stringify(json))
  }

  call(method, ...args) {
    return new Promise((resolve, reject) => {
      const callId = ++callIds
      this.responseHandlers.set(callId, { resolve, reject })
      this._sendJSON({
        t: 'c',
        n: method,
        d: args,
        i: callId,
      })
    })
  }

  close(code) {
    this.ws.close(code)
  }

  disconnect(code) {
    if (!this.closed) return this.ws.terminate()
    if (this.disconnected) return
    this.disconnected = true
    this._emit('disconnect', code) // emit for others
  }
}
