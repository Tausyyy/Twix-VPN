// backend/db/migrate_add_payments.js
//
// Таблица для отслеживания платежей через Platega.
// transaction_id - id транзакции, который вернула Platega при создании
//                   платежа (используется для сопоставления с callback).
// status          - PENDING -> CONFIRMED / CANCELED / CHARGEBACKED
//
// Запускать один раз: node backend/db/migrate_add_payments.js

require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

db.exec(`
	CREATE TABLE IF NOT EXISTS payments (
		transaction_id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		amount REAL NOT NULL,
		status TEXT NOT NULL DEFAULT 'PENDING',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
`)

console.log('таблица payments готова (или уже была)')
console.log('Миграция выполнена')
db.close()
