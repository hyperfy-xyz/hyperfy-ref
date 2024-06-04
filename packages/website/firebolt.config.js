import icons from '@firebolt-dev/icons'

import { db, migrate } from '@/utils/db'
import { uuid } from '@/utils/uuid'
import { createToken, readToken } from '@/utils/jwt'
import { generateName } from '@/utils/names'
import { API } from './utils/api'

export const config = {
  plugins: [icons()],
  context: {
    // db,
    // uuid,
    // generateName,
    // createToken,
    // readToken,
  },
  middleware: [
    ctx => {
      ctx.api = new API(ctx)
    },
    // async ctx => {
    //   const auths = ctx.cookies.get('auths')
    //   const auth = auths?.find(auth => auth.active)
    //   const token = auth?.token
    //   if (token) {
    //     try {
    //       const { userId } = await readToken(token)
    //       ctx.userId = userId
    //     } catch (err) {
    //       // ...
    //     }
    //   }
    // },
    // async ctx => {
    //   const apiSecret = ctx.req.headers.get('x-api-secret')
    //   if (apiSecret === process.env.API_SECRET) {
    //     ctx.hasApiSecret = true
    //   }
    // },
  ],
  async start() {
    await migrate()
  },
}
