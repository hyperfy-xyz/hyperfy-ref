import { Icons } from '@firebolt-dev/icons'

import { Styles } from '@/components/Styles'
import { Analytics } from '@/components/Analytics'
import { AuthProvider } from '@/components/AuthProvider'
import { Lockdown } from '@/components/Lockdown'

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link
          rel='preload'
          href='/static/rubik.woff2'
          as='font'
          type='font/woff2'
          crossOrigin='anonymous'
        />
        <Lockdown />
        <Styles />
        <Analytics />
        <Icons />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
