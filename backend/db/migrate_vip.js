require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const columns = db.prepare('PRAGMA table_info(users)').all()
const balance = columns.some(col => col.name === 'balance')

if (balance) {
	console.log('Существует уже такая колонка')
} else {
	db.exec(`
		
		ALTER TABLE users ADD COLUMN balance 
			INTEGER NOT NULL DEFAULT  0`)
}

db.exec(`
	
		CREATE TABLE IF NOT EXISTS vip_users (
				telegram_id INTEGER PRIMARY KEY,
				added_at TEXT NOT NULL DEFAULT (datetime('now'))
		
		)	
	`)

console.log('Таблица vip_users готова')

db.close()
