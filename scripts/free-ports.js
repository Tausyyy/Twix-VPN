/**
 * Освобождает порты API/Vite, чтобы make up не уезжал на 5175
 * и не падал из‑за старых node-процессов.
 */
const { execSync } = require('child_process')

const ports = [3000, 5173, 5174, 5175, 8080]

function pidsOnPort(port) {
	try {
		const out = execSync(`netstat -ano | findstr ":${port}"`, {
			encoding: 'utf8'
		})
		const pids = new Set()
		for (const line of out.split(/\r?\n/)) {
			if (!line.includes('LISTENING')) continue
			const parts = line.trim().split(/\s+/)
			const pid = parts[parts.length - 1]
			if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
		}
		return [...pids]
	} catch {
		return []
	}
}

for (const port of ports) {
	for (const pid of pidsOnPort(port)) {
		try {
			execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
			console.log(`freed :${port} (pid ${pid})`)
		} catch {
			// уже завершён / нет прав
		}
	}
}
