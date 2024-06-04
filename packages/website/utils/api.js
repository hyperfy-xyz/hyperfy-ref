export class API {
  constructor(ctx) {
    this.ctx = ctx
    this.baseUrl = process.env.PUBLIC_API_URL
  }

  headers() {
    const auths = this.ctx.cookies.get('auths')
    const auth = auths?.find(auth => auth.active)
    const token = auth?.token
    return {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
    }
  }

  async get(path) {
    const url = `${this.baseUrl}${path}`
    const resp = await fetch(url, {
      headers: {
        ...this.headers(),
      },
      method: 'GET',
    })
    if (!resp.ok) {
      const err = await resp.text()
      this.ctx.error(err)
    }
    return await resp.json()
  }

  async put(path, data) {
    const url = `${this.baseUrl}${path}`
    const resp = await fetch(url, {
      headers: {
        ...this.headers(),
      },
      method: 'PUT',
      body: JSON.stringify(data),
    })
    if (!resp.ok) {
      const err = await resp.text()
      this.ctx.error(err)
    }
    return await resp.json()
  }

  async post(path, data) {
    const url = `${this.baseUrl}${path}`
    console.log('post', url, data)
    const resp = await fetch(url, {
      headers: {
        ...this.headers(),
      },
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!resp.ok) {
      const err = await resp.text()
      this.ctx.error(err)
    }
    return await resp.json()
  }
}
