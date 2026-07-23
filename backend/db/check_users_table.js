const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

console.log('=== users ===')
const cols = db.prepare(`PRAGMA table_info(users)`).all()
for (const c of cols) {
	console.log(`  ${c.name} (${c.type})${c.pk ? ' PRIMARY KEY' : ''}`)
}

db.close()
