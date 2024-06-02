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
      `}
    >
      <div className='header-logo'>SumVerse</div>
      <div className='header-gap' />
      <Link href='/123'>123</Link>
      <Link href='/1234'>1234</Link>
      <AuthWidget />
    </div>
  )
}
