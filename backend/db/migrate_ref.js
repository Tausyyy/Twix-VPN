require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const colums = db.prepare('PRAGMA table_info(users)').all()
const hasReferredBy = colums.some(col => col.name === 'referred_by')
const hasBonusGiven = colums.some(col => col.name === 'referral_bonus_given')

if (!hasReferredBy) {
	db.exec(`ALTER TABLE users ADD COLUMN referred_by INTEGER`)
	console.log('колонка referred_by добавлена')
}

if (!hasBonusGiven) {
	db.exec(
		`ALTER TABLE users ADD COLUMN referreal_bonus_given INTEGER NOT NULL DEFAULT 0`
	)
	console.log('Колонка referral_bonus_given добавлена')
}
