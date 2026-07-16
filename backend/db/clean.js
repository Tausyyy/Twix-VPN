const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const deletedTokens = db.prepare('DELETE FROM login_tokens').run()
const deletedUsers = db
	.prepare('DELETE FROM users WHERE telegram_id IS NULL')
	.run()

console.log(`Удалено токенов: ${deletedTokens.changes}`)
console.log(`Удалено юзеров без telegram_id: ${deletedUsers.changes}`)
console.log('Остались:')
for (const row of db
	.prepare('SELECT id, email, telegram_id, created_at FROM users ORDER BY id')
	.all()) {
	console.log(row)
}

db.close()
