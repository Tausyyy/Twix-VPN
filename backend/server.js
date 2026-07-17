require('dotenv').config({
	path: require('path').join(__dirname, 'db', '.env')
})
const path = require('path')
const crypto = require('crypto')
const express = require('express')
const session = require('express-session')
const cors = require('cors')
const bcrypt = require('bcrypt')
const db = require('./db/init')

if (!process.env.SESSION_SECRET) {
	console.error('SESSION_SECRET не задан в backend/db/.env')
	process.exit(1)
}
if (!process.env.BOT_API_SECRET) {
	console.error('BOT_API_SECRET не задан в backend/db/.env')
	process.exit(1)
}
if (!process.env.INTERNAL_SECRET) {
	console.error(
		'INTERNAL_SECRET не задан в backend/db/.env (нужен для связи с Go-сервером)'
	)
	process.exit(1)
}

const INTERNAL_SECRET = process.env.INTERNAL_SECRET
const GO_BASE_URL = process.env.GO_BASE_URL || 'http://127.0.0.1:8080'

const app = express()

app.use(
	cors({
		origin: true,
		credentials: true
	})
)
app.use(express.json())

app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 7 * 24 * 60 * 60 * 1000
		}
	})
)

function requireAuth(req, res, next) {
	if (!req.session.userId) {
		return res.status(401).json({ error: 'Не авторизован' })
	}
	next()
}

app.post('/register', async (req, res) => {
	const { email, password } = req.body

	if (!email || !password) {
		return res.status(400).json({ error: 'Email и пароль обязательны' })
	}

	try {
		const hash = await bcrypt.hash(password, 10)
		const stmt = db.prepare(
			'INSERT INTO users (email, password_hash) VALUES (?, ?)'
		)
		const result = stmt.run(email, hash)

		req.session.userId = result.lastInsertRowid
		res.status(201).json({ message: 'Пользователь создан' })
	} catch (err) {
		console.error(err)
		res.status(400).json({ error: 'Email уже занят или ошибка сервера' })
	}
})

app.post('/login', async (req, res) => {
	const { email, password } = req.body

	try {
		const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
		const user = stmt.get(email)

		if (!user || !user.password_hash) {
			return res.status(401).json({ error: 'Неверный email или пароль' })
		}

		const isValid = await bcrypt.compare(password, user.password_hash)
		if (!isValid) {
			return res.status(401).json({ error: 'Неверный email или пароль' })
		}

		req.session.userId = user.id
		res.json({ message: 'Вход выполнен' })
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: 'Ошибка сервера' })
	}
})

app.get('/me', (req, res) => {
	if (!req.session.userId) {
		return res.status(401).json({ error: 'Не авторизован' })
	}
	const user = db
		.prepare('SELECT id, email, telegram_id FROM users WHERE id = ?')
		.get(req.session.userId)
	res.json({ user })
})

app.post('/logout', (req, res) => {
	req.session.destroy(() => res.json({ message: 'Вы вышли' }))
})

// Создаёт (или возвращает уже существующую) ссылку на VPN-подписку для
// текущего залогиненного пользователя. Ссылка выдаётся один раз на юзера -
// повторные клики отдают тот же результат, новый клиент в панели не плодится.
app.post('/create', requireAuth, async (req, res) => {
	const user = db
		.prepare('SELECT id, vpn_link FROM users WHERE id = ?')
		.get(req.session.userId)

	if (!user) {
		return res.status(401).json({ error: 'Не авторизован' })
	}

	if (user.vpn_link) {
		return res.json({ success: true, link: user.vpn_link })
	}

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 20000)

		const goResp = await fetch(`${GO_BASE_URL}/internal/create`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Internal-Secret': INTERNAL_SECRET
			},
			body: JSON.stringify({ user_id: user.id }),
			signal: controller.signal
		})
		clearTimeout(timeoutId)

		const data = await goResp.json()

		if (!goResp.ok || !data.success) {
			return res
				.status(502)
				.json({ error: data.error || 'Не удалось создать подписку' })
		}

		db.prepare('UPDATE users SET vpn_link = ? WHERE id = ?').run(
			data.link,
			user.id
		)

		res.json({ success: true, link: data.link })
	} catch (err) {
		console.error('create error:', err)
		const message =
			err.name === 'AbortError'
				? 'Go-сервер не отвечает (таймаут)'
				: 'Go-сервер недоступен'
		res.status(502).json({ error: message })
	}
})

app.post('/api/bot/login', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const { telegram_id } = req.body
	if (!telegram_id) {
		return res.status(400).json({ error: 'telegram_id required' })
	}

	let user = db
		.prepare('SELECT id FROM users WHERE telegram_id = ?')
		.get(telegram_id)

	if (!user) {
		const result = db
			.prepare('INSERT INTO users (telegram_id) VALUES (?)')
			.run(telegram_id)
		user = { id: result.lastInsertRowid }
	}

	const token = crypto.randomBytes(32).toString('base64url')
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

	db.prepare(
		'INSERT INTO login_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
	).run(token, user.id, expiresAt)

	res.json({ token })
})

app.get('/auth', (req, res) => {
	const { token } = req.query
	if (!token) {
		return res.status(400).send('Ссылка недействительна или истекла')
	}

	const row = db
		.prepare(
			'SELECT user_id, expires_at, used FROM login_tokens WHERE token = ?'
		)
		.get(token)

	if (!row || row.used || new Date(row.expires_at) < new Date()) {
		return res.status(400).send('Ссылка недействительна или истекла')
	}

	db.prepare('UPDATE login_tokens SET used = 1 WHERE token = ?').run(token)

	req.session.userId = row.user_id
	// на тот же origin (через Vite proxy) — фронт сам откроет кабинет по /me
	res.redirect('/')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
	console.log(`Сервер запущен на http://0.0.0.0:${PORT}`)
})
