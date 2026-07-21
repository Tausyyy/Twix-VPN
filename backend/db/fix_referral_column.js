const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const columns = db.prepare('PRAGMA table_info(users)').all()
const hasTypo = columns.some(col => col.name === 'referreal_bonus_given')
const hasCorrect = columns.some(col => col.name === 'referral_bonus_given')

if (hasTypo && !hasCorrect) {
	db.exec(
		`ALTER TABLE users RENAME COLUMN referreal_bonus_given TO referral_bonus_given`
	)
	console.log(
		'Колонка переименована: referreal_bonus_given → referral_bonus_given'
	)
} else if (hasCorrect) {
	console.log(
		'Колонка referral_bonus_given уже существует, ничего делать не нужно'
	)
} else {
	console.log(
		'Колонка referreal_bonus_given не найдена — возможно, уже переименована или называется иначе'
	)
}

db.close()
