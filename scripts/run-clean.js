const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const candidates = [
	process.env.NODE_BINARY,
	'C:\\Program Files\\nodejs\\node.exe',
	'C:\\Program Files (x86)\\nodejs\\node.exe'
].filter(Boolean)

const nodeBin =
	candidates.find(p => {
		try {
			return fs.existsSync(p)
		} catch {
			return false
		}
	}) || process.execPath

const cleanPath = path.join(__dirname, '..', 'backend', 'db', 'clean.js')
const child = spawn(nodeBin, [cleanPath], {
	stdio: 'inherit',
	cwd: path.join(__dirname, '..'),
	env: process.env
})

child.on('exit', code => process.exit(code ?? 1))
