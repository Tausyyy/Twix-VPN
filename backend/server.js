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
app.set('trust proxy', 1)

app.use(
	cors({
		origin: true,
		credentials: true
	})
)
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'dist', 'src.index.html'))
})
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

function verifyTelegramWebAppData(initData, botToken) {
	const params = new URLSearchParams(initData)
	const hash = params.get('hash')
	params.delete('hash')

	const dataCheckArr = [...params.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, value]) => `${key}=${value}`)
	const dataCheckString = dataCheckArr.join('\n')

	const secretKey = crypto
		.createHmac('sha256', 'WebAppData')
		.update(botToken)
		.digest()
	const computedHash = crypto
		.createHmac('sha256', secretKey)
		.update(dataCheckString)
		.digest('hex')

	return computedHash === hash
}

function requireAuth(req, res, next) {
	if (!req.session.userId) {
		return res.status(401).json({ error: 'Не авторизован' })
	}
	next()
}

function isVip(telegramId) {
	if (!telegramId) return false
	const row = db
		.prepare('SELECT 1 FROM vip_users WHERE telegram_id = ?')
		.get(telegramId)
	return !!row
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
		.prepare(
			'SELECT id, email, telegram_id, balance, vpn_link FROM users WHERE id = ?'
		)
		.get(req.session.userId)

	res.json({
		user: {
			...user,
			is_vip: isVip(user.telegram_id),
			has_subscription: !!user.vpn_link
		}
	})
})

app.post('/logout', (req, res) => {
	req.session.destroy(() => res.json({ message: 'Вы вышли' }))
})

const SUBSCRIPTION_COST = Number(process.env.SUBSCRIPTION_COST || 0)

// Создаёт (или возвращает уже существующую) ссылку на VPN-подписку для
// текущего залогиненного пользователя. Ссылка выдаётся один раз на юзера -
// повторные клики отдают тот же результат, новый клиент в панели не плодится.
app.post('/create', requireAuth, async (req, res) => {
	const user = db
		.prepare(
			'SELECT id, telegram_id, vpn_link, balance FROM users WHERE id = ?'
		)
		.get(req.session.userId)

	if (!user) {
		return res.status(401).json({ error: 'Не авторизован' })
	}

	if (user.vpn_link) {
		return res.json({ success: true, link: user.vpn_link })
	}

	const vip = isVip(user.telegram_id)

	if (!vip && user.balance < SUBSCRIPTION_COST) {
		return res.status(402).json({ error: 'Недостаточно средств на балансе' })
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

		if (!vip && SUBSCRIPTION_COST > 0) {
			db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(
				SUBSCRIPTION_COST,
				user.id
			)
		}

		db.prepare('UPDATE users SET vpn_link = ? WHERE id = ?').run(
			data.link,
			user.id
		)

		const updatedBalance = vip ? user.balance : user.balance - SUBSCRIPTION_COST

		res.json({ success: true, link: data.link, balance: updatedBalance })
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

	const { telegram_id, referred_by } = req.body
	if (!telegram_id) {
		return res.status(400).json({ error: 'telegram_id required' })
	}

	let user = db
		.prepare('SELECT id FROM users WHERE telegram_id = ?')
		.get(telegram_id)

	if (!user) {
		const referrer = referred_by
			? db
					.prepare('SELECT id FROM users WHERE telegram_id = ?')
					.get(referred_by)
			: null

		const result = db
			.prepare('INSERT INTO users (telegram_id, referred_by) VALUES (?, ?)')
			.run(telegram_id, referrer ? referred_by : null)

		user = { id: result.lastInsertRowid }

		if (referrer) {
			db.prepare('UPDATE users SET balance = balance + 50 WHERE id = ?').run(
				referrer.id
			)
			db.prepare('UPDATE users SET referral_bonus_given = 1 WHERE id = ?').run(
				user.id
			)
		}
	}

	const token = crypto.randomBytes(32).toString('base64url')
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

	db.prepare(
		'INSERT INTO login_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
	).run(token, user.id, expiresAt)

	res.json({ token })
})

app.post('/api/telegram-auth', (req, res) => {
	const { initData } = req.body
	if (!initData) {
		return res.status(400).json({ error: 'initData required' })
	}

	if (!verifyTelegramWebAppData(initData, process.env.BOT_TOKEN)) {
		return res.status(403).json({ error: 'invalid initData' })
	}

	const params = new URLSearchParams(initData)
	const userJson = params.get('user')
	if (!userJson) {
		return res.status(400).json({ error: 'no user data' })
	}

	const tgUser = JSON.parse(userJson)
	const telegram_id = tgUser.id

	let user = db
		.prepare('SELECT id FROM users WHERE telegram_id = ?')
		.get(telegram_id)
	if (!user) {
		const result = db
			.prepare('INSERT INTO users (telegram_id) VALUES (?)')
			.run(telegram_id)
		user = { id: result.lastInsertRowid }
	}

	req.session.userId = user.id
	req.session.save(err => {
		if (err) console.error('Session save error:', err)
		res.json({ success: true })
	})
})

app.get('/api/bot/vip', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const rows = db.prepare('SELECT telegram_id FROM vip_users').all()
	res.json({ telegram_ids: rows.map(r => r.telegram_id) })
})

app.post('/api/bot/vip', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const { telegram_ids } = req.body
	if (!Array.isArray(telegram_ids) || telegram_ids.length === 0) {
		return res.status(400).json({ error: 'telegram_ids required' })
	}

	const insert = db.prepare(
		'INSERT OR IGNORE INTO vip_users (telegram_id) VALUES (?)'
	)
	const insertMany = db.transaction(ids => {
		for (const id of ids) insert.run(id)
	})
	insertMany(telegram_ids)

	res.json({ success: true })
})

app.post('/api/bot/balance', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const { telegram_id, amount } = req.body

	if (!telegram_id || typeof amount !== 'number') {
		return res
			.status(400)
			.json({ error: 'telegram_id и amount (число) обязательны' })
	}

	const user = db
		.prepare('SELECT id, balance FROM users WHERE telegram_id = ?')
		.get(telegram_id)

	if (!user) {
		return res
			.status(404)
			.json({ error: 'Пользователь с таким telegram_id не найден' })
	}

	db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(
		amount,
		user.id
	)

	const updated = db
		.prepare('SELECT balance FROM users WHERE id = ?')
		.get(user.id)

	res.json({ success: true, balance: updated.balance })
})

app.post('/api/bot/vip/remove', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const { telegram_ids } = req.body
	if (!Array.isArray(telegram_ids) || telegram_ids.length === 0) {
		return res.status(400).json({ error: 'telegram_ids required' })
	}

	const remove = db.prepare('DELETE FROM vip_users WHERE telegram_id = ?')
	const removeMany = db.transaction(ids => {
		for (const id of ids) remove.run(id)
	})
	removeMany(telegram_ids)

	res.json({ success: true })
})

app.get('/auth', (req, res) => {
	const { token } = req.query
	if (!token) {
		return res.status(400).send('Ссылка недействительна или истекла')
	}

	// Telegram делает служебный запрос для генерации превью ссылки в чате -
	// не должен "сжигать" токен, иначе реальный клик пользователя получит
	// уже использованную ссылку.
	const userAgent = req.headers['user-agent'] || ''
	if (userAgent.includes('TelegramBot')) {
		return res.status(200).send('Twix VPN')
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
	res.redirect('/')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
	console.log(`Сервер запущен на http://0.0.0.0:${PORT}`)
})
