// backend/db/migrate_add_subscription_active.js
//
// Разводит понятия "оплатил подписку" и "есть закэшированная ссылка".
// Раньше это было одним полем vpn_link, из-за чего /create мог отдавать
// мёртвую ссылку на клиента, которого уже удалили в 3x-ui, не проверяя
// его реальное существование.
//
// subscription_active = 1 -> пользователь уже оплатил, повторно списывать
//                            деньги нельзя, но ссылку нужно каждый раз
//                            подтверждать/пересоздавать через Go-сервис.
//
// Запускать один раз: node backend/db/migrate_add_subscription_active.js

require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

function columnExists(table, column) {
	const rows = db.prepare(`PRAGMA table_info(${table})`).all()
	return rows.some(r => r.name === column)
}

db.transaction(() => {
	if (!columnExists('users', 'subscription_active')) {
		db.exec(
			`ALTER TABLE users ADD COLUMN subscription_active INTEGER NOT NULL DEFAULT 0`
		)
		console.log('users.subscription_active добавлена')
	}

	// у всех, кто уже когда-то получил ссылку раньше (по старой логике),
	// считаем что подписка уже оплачена - деньги повторно не списываем.
	db.exec(`
		UPDATE users
		SET subscription_active = 1
		WHERE vpn_link IS NOT NULL AND subscription_active = 0
	`)
	console.log('существующие пользователи с vpn_link помечены как оплатившие')
})()

console.log('Миграция выполнена')
db.close()
