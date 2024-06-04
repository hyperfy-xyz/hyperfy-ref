class API {
  constructor() {
    this.apiUrl = process.env.API_URL
    this.apiSecret = process.env.API_SECRET
  }

  async get(endpoint) {
    const url = `${this.apiUrl}${endpoint}`
    const resp = await fetch(url, {
      method: 'GET',
      body: null,
      headers: {
        'X-Api-Secret': this.apiSecret,
      },
    })
    return await resp.json()
  }

  async put(endpoint, data) {
    const url = `${this.apiUrl}${endpoint}`
    const resp = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: {
        'X-Api-Secret': this.apiSecret,
      },
    })
    return await resp.json()
  }

  async post(endpoint, data) {
    const url = `${this.apiUrl}${endpoint}`
    const resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'X-Api-Secret': this.apiSecret,
      },
    })
    return await resp.json()
  }
}

export const api = new API()
