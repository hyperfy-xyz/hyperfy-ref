import Knex from 'knex'

export const db = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: './data.db',
  },
  useNullAsDefault: true,
})

export async function migrate() {
  const hasUsersTable = await db.schema.hasTable('users')
  if (!hasUsersTable) {
    await db.schema.createTable('users', table => {
      table.string('id').primary()
      table.string('name').unique().notNullable()
      table.string('address').unique()
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }
  const hasSpacesTable = await db.schema.hasTable('spaces')
  if (!hasSpacesTable) {
    await db.schema.createTable('spaces', table => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.string('ownerId')
      table.timestamp('createdAt').notNullable()
      table.timestamp('updatedAt').notNullable()
    })
  }
  // const hasEntitiesTable = await db.schema.hasTable('entities')
  // if (!hasEntitiesTable) {
  //   await db.schema.createTable('entities', table => {
  //     table.string('id').primary()
  //     table.string('name').notNullable()
  //     table.string('ownerId').notNullable()
  //     table.timestamp('createdAt').notNullable()
  //     table.timestamp('updatedAt').notNullable()
  //   })
  // }
  const hasPermissionsTable = await db.schema.hasTable('permissions')
  if (!hasPermissionsTable) {
    await db.schema.createTable('permissions', table => {
      table.string('id').primary()
      table.boolean('spaceAdmin').notNullable()
      table.boolean('spaceMeta').notNullable()
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
}
