require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const columns = db.prepare('PRAGMA table_info(users)').all()
const hasVpnLink = columns.some(col => col.name === 'vpn_link')

if (hasVpnLink) {
	console.log('Колонка vpn_link уже существует, пропускаю')
} else {
	db.exec('ALTER TABLE users ADD COLUMN vpn_link TEXT')
	console.log('Колонка vpn_link добавлена в users')
}

db.close()
