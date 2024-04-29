import icons from '@firebolt-dev/icons'

import { db, migrate } from '@/utils/db'
import { uuid } from '@/utils/uuid'
import { createToken, readToken } from '@/utils/jwt'
import { generateName } from '@/utils/names'

export const config = {
  plugins: [icons()],
  context: {
    db,
    uuid,
    generateName,
    createToken,
    readToken,
  },
  middleware: [
    async ctx => {
      const auths = ctx.cookies.get('auths')
      const auth = auths?.find(auth => auth.active)
      const token = auth?.token
      if (token) {
        try {
          const { userId } = await readToken(token)
          ctx.userId = userId
        } catch (err) {
          // ...
        }
      }
    },
  ],
  async start() {
    await migrate()
  },
}
