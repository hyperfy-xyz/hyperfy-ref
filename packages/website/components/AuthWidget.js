import { useState } from 'react'

import { useAuth } from './AuthProvider'

export function AuthWidget() {
  const { user, status, connect, disconnect } = useAuth()
  const connected = !!user?.address
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div>{status}</div>
      {connected && <div onClick={() => disconnect()}>{user.name}</div>}
      {!connected && <div onClick={() => setOpen(true)}>Connect</div>}
      {open && (
        <div>
          <div
            onClick={() => {
              setOpen(false)
              connect('injected')
            }}
          >
            MetaMask
          </div>
          <div
            onClick={() => {
              setOpen(false)
              connect('walletconnect')
            }}
          >
            WalletConnect
          </div>
        </div>
      )}
    </div>
  )
}
