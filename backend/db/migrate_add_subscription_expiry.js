// backend/db/migrate_add_subscription_expiry.js
//
// Заменяет "оплачено разово навсегда" (subscription_active) на реальный
// срок действия подписки: subscription_expires_at - unix-время в
// миллисекундах (тот же формат, что использует 3x-ui для expiryTime),
// чтобы не было путаницы с форматами дат между JS/SQLite/Go/3x-ui.
//
// Запускать один раз: node backend/db/migrate_add_subscription_expiry.js

require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

function columnExists(table, column) {
	const rows = db.prepare(`PRAGMA table_info(${table})`).all()
	return rows.some(r => r.name === column)
}

db.transaction(() => {
	if (!columnExists('users', 'subscription_expires_at')) {
		db.exec(`ALTER TABLE users ADD COLUMN subscription_expires_at INTEGER`)
		console.log('users.subscription_expires_at добавлена')
	}

	// Тем, у кого уже была активна подписка по старому флагу -
	// даём 30 дней от текущего момента, чтобы никто не остался без
	// доступа сразу после миграции.
	const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000
	const result = db
		.prepare(
			`UPDATE users
			 SET subscription_expires_at = ?
			 WHERE subscription_active = 1 AND subscription_expires_at IS NULL`
		)
		.run(thirtyDaysFromNow)
	console.log(
		`подписка перенесена для ${result.changes} пользователей (30 дней от сейчас)`
	)
})()

console.log('Миграция выполнена')
db.close()
