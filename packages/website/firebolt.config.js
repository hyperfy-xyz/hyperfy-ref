import icons from '@firebolt-dev/icons'

import { API } from './api'

export const config = {
  plugins: [icons()],
  context: {},
  middleware: [
    ctx => {
      ctx.api = new API(ctx)
    },
  ],
}
