require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

db.transaction(() => {
	db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      telegram_id INTEGER UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

	db.exec(`
    INSERT INTO users_new (id, email, password_hash, created_at)
    SELECT id, email, password_hash, created_at FROM users
  `)

	db.exec(`DROP TABLE users`)
	db.exec(`ALTER TABLE users_new RENAME TO users`)

	db.exec(`
    CREATE TABLE IF NOT EXISTS login_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    )
  `)
})()

console.log('Миграция выполнена')
db.close()
