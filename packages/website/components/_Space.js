import { useRef, useEffect } from 'react'
import { css } from 'firebolt'

import { Client } from '@/client/Client'

export function World({ worldId }) {
  const canvasRef = useRef()
  useEffect(() => {
    const canvas = canvasRef.current
    const client = new Client({ canvas })
  }, [])
  return (
    <div
      css={css`
        position: absolute;
        inset: 0;
      `}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}

{
  /* <Meta
        title='Firebolt'
        description='The Effortless React Framework.'
        image='/og-default.png'
        root
      /> */
}
