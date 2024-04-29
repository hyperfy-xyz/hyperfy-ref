import Knex from 'knex'

export const db = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: './data',
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
}
