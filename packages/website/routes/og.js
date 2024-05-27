import { css } from 'firebolt'
import snap from '@firebolt-dev/snap'

import bg from '@/routes/static/og-bg.png'
import rubik from '@/routes/static/rubik.woff2'

export async function get(ctx) {
  const { title } = ctx.params
  return snap(
    <div
      css={css`
        @font-face {
          font-family: 'Rubik';
          font-style: normal;
          font-weight: 300 900;
          font-display: swap;
          src: url(${rubik}) format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
            U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC,
            U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }

        -webkit-font-smoothing: antialiased;
        font-family: 'Rubik', sans-serif;
        font-optical-sizing: auto;
        font-size: 16px;
        font-weight: 400;
        font-style: normal;

        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        background-image: url(${bg});
        background-size: cover;
        background-position: center;
        padding: 0 70px;

        .title {
          margin-top: 337px;
          font-size: 70px;
          font-weight: 600;
          color: white;
        }
      `}
    >
      <div className='title'>{title}</div>
    </div>
  )
}
