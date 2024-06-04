import { createContext, useContext, useState, useMemo } from 'react'
import { useAction, useCookie, useCookies } from 'firebolt'

import {
  http,
  createConfig,
  getAccount,
  watchAccount,
  signMessage,
  reconnect,
  connect,
  disconnect,
  getConnections,
  getEnsName,
} from '@wagmi/core'
import { mainnet, sepolia } from '@wagmi/core/chains'
import { injected, walletConnect } from '@wagmi/connectors'

export const AuthContext = createContext()

const isBrowser = typeof document !== 'undefined'

export function AuthProvider({ children }) {
  const cookies = useCookies()
  const [auths] = useCookie('auths')
  const auth = auths?.find(auth => auth.active)
  const user = auth?.user
  const [status, setStatus] = useState('reconnecting')
  const createUser = useAction(createUserAction)
  const getUser = useAction(getUserAction)
  const connectUser = useAction(connectUserAction)
  const ctrl = useMemo(() => {
    return new Controller({
      cookies,
      setStatus,
      createUser,
      getUser,
      connectUser,
    })
  }, [])
  const handle = useMemo(() => {
    return {
      auth,
      user,
      status,
      connect: ctrl.connect,
      disconnect: ctrl.disconnect,
    }
  }, [user, status])
  return <AuthContext.Provider value={handle}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export async function createUserAction(ctx) {
  return await ctx.api.post('/user')
}

export async function getUserAction(ctx) {
  return await ctx.api.get('/user')
}

export async function connectUserAction(ctx, address, signature) {
  const auth = await ctx.api.post('/connect', { address, signature })
  const auths = ctx.cookies.get('auths') || []
  auths.push(auth)
  ctx.cookies.set('auths', auths)
  return auth
}

const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: '3736fc7ed85e55906487c68343eab1eb', // TODO: https://cloud.walletconnect.com/sign-in
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
})

class Controller {
  constructor({ cookies, setStatus, createUser, getUser, connectUser }) {
    this.cookies = cookies
    this.auths = cookies.get('auths') || []
    this.setStatus = setStatus
    this.createUser = createUser
    this.getUser = getUser
    this.connectUser = connectUser
    if (isBrowser) this.init()
  }

  async init() {
    this.log('init')
    // ensure device has anon
    let anon = this.findAnon()
    if (!anon) {
      this.log('generating anon')
      anon = await this.createUser()
      this.auths.push(anon)
    }
    // if wallet connected, find matching auth
    await reconnect(config)
    const wallet = getAccount(config)
    if (wallet.isConnected) {
      this.log('wallet connected', wallet.address)
      const auth = this.auths.find(
        auth => auth.user.address === wallet.address.toLowerCase()
      )
      if (auth) {
        this.log('found matching auth', auth)
        this.log('user', auth.user)
        this.activate(auth)
        this.persist()
        this.setStatus('connected')
        this.refresh()
        this.watch()
        return
      } else {
        this.log('no matching auth, disconnecting')
        disconnect(config)
      }
    }
    this.log('using anon auth')
    this.log('user', anon.user)
    this.activate(anon)
    this.persist()
    this.setStatus('disconnected')
    this.refresh()
    this.watch()
  }

  findAnon() {
    return this.auths.find(auth => !auth.user.address)
  }

  activate(_auth) {
    for (const auth of this.auths) {
      auth.active = auth === _auth
    }
  }

  persist() {
    this.cookies.set('auths', this.auths)
  }

  watch() {
    this.unwatch = watchAccount(config, {
      onChange: wallet => {
        const address = wallet.address?.toLowerCase()
        const active = this.auths.find(auth => auth.active)
        if (active?.user.address === address) {
          return // no change
        }
        this.log('wallet switched', address)
        let auth
        if (address) {
          auth = this.auths.find(auth => auth.user.address === address)
        }
        if (!auth) {
          auth = this.findAnon()
        }
        this.activate(auth)
        this.persist()
        this.setStatus(auth.user.address ? 'connected' : 'disconnected')
      },
    })
  }

  connect = async type => {
    this.log('connect')
    let connector
    if (type === 'injected') {
      this.log('using injected')
      connector = config.connectors[0]
    }
    if (type === 'walletconnect') {
      this.log('using walletconnect')
      connector = config.connectors[1]
    }
    let address
    const wallet = getAccount(config)
    if (wallet.isConnected) {
      this.log('already connected')
      address = wallet.address.toLowerCase()
    } else {
      this.log('connecting')
      try {
        const result = await connect(config, { connector })
        address = result.accounts[0].toLowerCase()
      } catch (err) {
        console.error(err)
      }
    }
    if (!address) {
      this.log('failed to connect')
      return false
    }
    const auth = this.auths.find(auth => auth.user.address === address)
    if (auth) {
      this.log('found matching auth, using it')
      this.activate(auth)
      this.persist()
      this.setStatus('connected')
      this.refresh()
      return
    }
    this.log('requesting signature')
    let signature
    try {
      signature = await signMessage(config, {
        message: 'Connect to XYZ!',
      })
    } catch (err) {
      console.error(err)
    }
    if (!signature) {
      this.log('failed to get signature')
      disconnect(config)
      return false
    }
    this.log('authenticating')
    let auth2
    try {
      auth2 = await this.connectUser(address, signature)
    } catch (err) {
      this.log('could not authenticate:', err.code)
      return false
    }
    this.auths.push(auth2)
    this.activate(auth2)
    this.persist()
    this.setStatus('connected')
    this.log('authenticated!')
  }

  disconnect = () => {
    disconnect(config)
    const anon = this.findAnon()
    this.activate(anon)
    this.persist()
    this.setStatus('disconnected')
  }

  async refresh() {
    const auth = this.auths.find(auth => auth.active)
    const user = await this.getUser()
    if (auth.user.name !== user.name) {
      auth.user = user
      this.persist()
    }
  }

  log(...args) {
    console.log('[auth]', ...args)
  }
}
