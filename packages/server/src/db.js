import Knex from 'knex'
import moment from 'moment'

import { avatarScriptCompiled, avatarScriptRaw } from './scripts/avatar'
import { botScriptCompiled, botScriptRaw } from './scripts/bot'

export const db = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: './db',
  },
  useNullAsDefault: true,
})

export async function migrate() {
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', table => {
      table.string('id').primary()
      table.string('name').unique().notNullable()
      table.string('address').unique()
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }
  if (!(await db.schema.hasTable('worlds'))) {
    await db.schema.createTable('worlds', table => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.string('ownerId')
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }
  // if (!(await db.schema.hasTable('entities'))) {
  //   await db.schema.createTable('entities', table => {
  //     table.string('id').primary()
  //     table.string('name').notNullable()
  //     table.string('ownerId').notNullable()
  //     table.timestamp('createdAt').notNullable()
  //     table.timestamp('updatedAt').notNullable()
  //   })
  // }
  if (!(await db.schema.hasTable('permissions'))) {
    await db.schema.createTable('permissions', table => {
      table.string('id').primary()
      table.boolean('worldAdmin').notNullable()
      table.boolean('worldMeta').notNullable()
      table.boolean('prototypeCreate').notNullable()
      table.boolean('prototypeEdit').notNullable()
      table.boolean('prototypeMove').notNullable()
      table.boolean('prototypeDestroy').notNullable()
      table.boolean('itemSpawn').notNullable()
      table.boolean('itemMove').notNullable()
      table.boolean('itemReturn').notNullable()
      table.boolean('avatarVoice').notNullable()
      table.boolean('avatarMute').notNullable()
      table.boolean('avatarKick').notNullable()
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }
  if (!(await db.schema.hasTable('scripts'))) {
    await db.schema.createTable('scripts', table => {
      table.string('id').primary()
      table.text('raw').notNullable()
      table.text('compiled').notNullable()
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }

  // temp: we're just slamming these into the db here for now
  // const now = moment().toISOString()
  // const avatarScript = {
  //   id: '$avatar',
  //   raw: avatarScriptRaw,
  //   compiled: avatarScriptCompiled,
  //   createdAt: now,
  //   updatedAt: now,
  // }
  // await db('scripts').insert(avatarScript).onConflict('id').merge(avatarScript)
  // const botScript = {
  //   id: '$bot',
  //   raw: botScriptRaw,
  //   compiled: botScriptCompiled,
  //   createdAt: now,
  //   updatedAt: now,
  // }
  // await db('scripts').insert(botScript).onConflict('id').merge(botScript)
}
