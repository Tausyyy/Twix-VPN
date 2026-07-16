const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Cursor подсовывает свой Node (другой ABI) — better-sqlite3 от него падает.
// Запускаем сервер системным Node и ЖДЁМ его (spawnSync), иначе npm думает что скрипт завершился.
const candidates = [
	process.env.NODE_BINARY,
	'C:\\Program Files\\nodejs\\node.exe',
	'C:\\Program Files (x86)\\nodejs\\node.exe'
].filter(Boolean)

const systemNode = candidates.find(p => {
	try {
		return fs.existsSync(p)
	} catch {
		return false
	}
})

const serverPath = path.join(__dirname, '..', 'backend', 'server.js')
const root = path.join(__dirname, '..')

function canLoadSqlite() {
	try {
		require('better-sqlite3')
		return true
	} catch {
		return false
	}
}

if (canLoadSqlite()) {
	require(serverPath)
} else if (systemNode) {
	const result = spawnSync(systemNode, [serverPath], {
		stdio: 'inherit',
		cwd: root,
		env: process.env
	})
	process.exit(result.status ?? 1)
} else {
	console.error(
		'better-sqlite3 не загружается, а системный Node не найден.\n' +
			'Поставь Node.js с https://nodejs.org или задай NODE_BINARY.'
	)
	process.exit(1)
}
