import { css } from 'firebolt'
import { BackpackIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForceUpdate } from './useForceUpdate'

export function Backpack({ world }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <BackpackButton world={world} onClick={() => setOpen(!open)} />
      {open && <BackpackContents world={world} />}
    </>
  )
}

function BackpackButton({ world, onClick }) {
  return (
    <div
      css={css`
        position: absolute;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 12px;
        height: 44px;
        width: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        cursor: pointer;
      `}
      onClick={onClick}
    >
      {<BackpackIcon size={20} strokeWidth={1.5} />}
    </div>
  )
}

function BackpackContents({ world }) {
  const forceUpdate = useForceUpdate()
  useEffect(() => {
    return world.backpack.watch(forceUpdate)
  }, [])
  const items = world.backpack.items
  return (
    <div
      className='BackpackContents'
      css={css`
        position: absolute;
        bottom: 74px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 12px;
        width: 280px;
        padding: 10px;
        .BackpackContents-grid {
          display: flex;
          flex-wrap: wrap;
          margin: -2px;
        }
        .BackpackContents-griditem {
          width: 25%;
          padding: 2px;
        }
        .BackpackContents-griditeminner {
          padding-bottom: 100%;
          position: relative;
        }
        .BackpackContents-item {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          display: flex;
          overflow: hidden;
        }
        .BackpackContents-item-foo {
          flex: 1;
          background: white;
        }
      `}
    >
      <div className='BackpackContents-grid'>
        {items.map((item, idx) => (
          <div key={item?.id || idx} className='BackpackContents-griditem'>
            <div
              key={item?.id || idx}
              className='BackpackContents-griditeminner'
            >
              <div
                className='BackpackContents-item'
                onClick={() => world.backpack.use(item)}
              >
                {item && <div className='BackpackContents-item-foo' />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
