import { Link, cls, css } from 'firebolt'

import { AuthWidget } from './AuthWidget'
import { ThemeBtn } from './ThemeBtn'

export function Header({ inWorld = false }) {
  return (
    <div
      className={cls('header', { inWorld })}
      css={css`
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        padding: 0 30px;
        height: 70px;
        z-index: 100;
        color: var(--text-color);
        .header-logo {
          // ...
        }
        .header-gap {
          flex: 1;
        }
        &.inWorld {
          color: white;
        }
        .templink {
          margin-right: 10px;
        }
      `}
    >
      <div className='header-logo'>SumVerse</div>
      <div className='header-gap' />
      <div className='templink'>
        <Link href='/1'>1</Link>
      </div>
      <div className='templink'>
        <Link href='/2'>2</Link>
      </div>
      <div className='templink'>
        <Link href='/3'>3</Link>
      </div>
      <div className='templink'>
        <Link href='/4'>4</Link>
      </div>
      <div className='templink'>
        <Link href='/5'>5</Link>
      </div>
      <AuthWidget />
    </div>
  )
}
