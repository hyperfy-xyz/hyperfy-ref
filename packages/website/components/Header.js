import { cls, css } from 'firebolt'

import { AuthWidget } from './AuthWidget'
import { ThemeBtn } from './ThemeBtn'

export function Header({ inSpace = false }) {
  return (
    <div
      className={cls('header', { inSpace })}
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
        &.inSpace {
          color: white;
        }
      `}
    >
      <div className='header-logo'>SumVerse</div>
      <div className='header-gap' />
      <AuthWidget />
    </div>
  )
}
