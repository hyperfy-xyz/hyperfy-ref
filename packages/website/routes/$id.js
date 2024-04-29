import { useRef, useEffect, useState } from 'react'
import { css, useRoute } from 'firebolt'

import { Header } from '@/components/Header'
import { useAuth } from '@/components/AuthProvider'
import { Space } from '@/space/Space'

export default function Page() {
  const { auth } = useAuth()
  if (!auth) return null // TODO: loading
  return <Content />
}

function Content() {
  const viewportRef = useRef()
  const spaceRef = useRef()
  const [status, setStatus] = useState({ type: 'connecting' })
  const { auth } = useAuth()
  const { id } = useRoute().params
  useEffect(() => {
    const viewport = viewportRef.current
    const space = new Space({ id, auth, viewport })
    spaceRef.current = space
    space.on('connect', () => {
      setStatus({ type: 'connected' })
    })
    space.on('active', () => {
      setStatus({ type: 'active' })
    })
    space.on('disconnect', msg => {
      setStatus({ type: 'disconnected' })
    })
    return () => {
      space.destroy()
    }
  }, [])
  useEffect(() => {
    const space = spaceRef.current
    space.setAuth(auth)
  }, [auth])
  return (
    <>
      <Header inSpace />
      <div
        className='space'
        css={css`
          position: relative;
          height: 100vh;
          background: black;
          .space-viewport {
            position: absolute;
            inset: 0;
          }
          .space-overlay {
            position: absolute;
            inset: 0;
            background: blue;
            display: flex;
            align-items: center;
            justify-content: center;
            > div {
              color: white;
              font-size: 20px;
            }
          }
        `}
      >
        <div className='space-viewport' ref={viewportRef} />
        {status.type === 'connecting' && (
          <div className='space-overlay'>
            <div>Connecting</div>
          </div>
        )}
        {status.type === 'connected' && (
          <div className='space-overlay'>
            <div>Preparing</div>
          </div>
        )}
        {status.type === 'disconnected' && (
          <div className='space-overlay'>
            <div>Disconnected</div>
          </div>
        )}
      </div>
    </>
  )
}
