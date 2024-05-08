import { useCookie, css } from 'firebolt'

export function Styles() {
  return (
    <>
      <Reset />
      <Theme />
      <Main />
    </>
  )
}

function Reset() {
  // based on https://www.digitalocean.com/community/tutorials/css-minimal-css-reset
  return (
    <style
      global={css`
        html {
          box-sizing: border-box;
          font-size: 16px;
        }

        *,
        *:before,
        *:after {
          box-sizing: inherit;
        }

        body,
        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        p,
        ol,
        ul {
          margin: 0;
          padding: 0;
          font-weight: normal;
        }

        ol,
        ul {
          list-style: none;
        }

        img {
          max-width: 100%;
          height: auto;
        }
      `}
    />
  )
}

function Theme() {
  const [theme] = useCookie('theme', 'system')
  return (
    <style
      global={css`
        .light {
          ${lightVariables}
        }
        .dark {
          ${darkVariables}
        }

        ${theme === 'light' &&
        `
          :root {
            ${lightVariables}
          }
        `}
        ${theme === 'dark' &&
        `
          :root {
            ${darkVariables}
          }
        `}
        ${theme === 'system' &&
        `
          @media (prefers-color-scheme: light) {
            :root {
              ${lightVariables}
            }
          }
          @media (prefers-color-scheme: dark) {
            :root {
              ${darkVariables}
            }
          }
        `}
      `}
    />
  )
}

const lightVariables = css`
  --primary-color: rgb(244 63 94);
  --bg-color: white;
  --bg2-color: white;
  --text-color: rgb(23, 23, 23);
  --text-color-dim: rgb(102, 102, 102);
  --line-color: rgba(0, 0, 0, 0.1);
  --icon-color: black;
  --icon-color-dim: rgba(0, 0, 0, 0.3);
  --header-bg: rgba(255, 255, 255, 0.9);
  --menu-bg: white;
  --menu-border: 1px solid rgb(239 239 239);
  --menu-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
  --menu-item-hover-bg: rgb(240 240 240);
  --menu-item-active-bg: var(--primary-color);
  --menu-item-active-color: white;
`

const darkVariables = css`
  --primary-color: rgb(244 63 94);
  --bg-color: rgb(10, 14, 18);
  --bg2-color: rgb(15, 18, 25);
  --text-color: rgba(237, 237, 237);
  --text-color-dim: rgb(92, 101, 113);
  --line-color: rgb(35, 41, 45);
  --icon-color: white;
  --icon-color-dim: rgba(255, 255, 255, 0.3);
  --header-bg: rgba(10, 14, 18, 0.9);
  --menu-bg: rgb(10, 14, 18);
  --menu-border: 1px solid rgb(39 37 37);
  --menu-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
  --menu-item-hover-bg: rgb(55 51 51);
  --menu-item-active-bg: var(--primary-color);
  --menu-item-active-color: white;
`

function Main() {
  return (
    <style
      global={css`
        // fonts

        /* latin */
        @font-face {
          font-family: 'Rubik';
          font-style: normal;
          font-weight: 300 900;
          font-display: swap;
          src: url(/assets/rubik.woff2) format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
            U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC,
            U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }

        // fix common issue with flex ellipsis

        * {
          min-width: 0;
        }

        // fix alignment of svgs

        svg {
          display: inline-block;
        }

        // text selection

        ::selection {
          color: white;
          background: var(--primary-color);
        }

        // general

        p {
          line-height: 1.9;
        }

        pre {
          margin: 0;
        }

        html,
        body {
          -webkit-font-smoothing: antialiased;
          font-family: 'Rubik', sans-serif;
          font-optical-sizing: auto;
          font-size: 16px;
          font-weight: 400;
          font-style: normal;

          background-color: var(--bg-color);
          color: var(--text-color);
        }

        input,
        textarea {
          border: 0;
          background: none;
          outline: 0;
          padding: 0;
          margin: 0;
          display: block;
          width: 100%;
          font-family: inherit;
          font-size: inherit;
          color: inherit;
          &::placeholder {
            /* color: rgba(255, 255, 255, 0.3); */
          }
        }

        a {
          text-decoration: none;
          color: inherit;
        }
      `}
    />
  )
}
