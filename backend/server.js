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
			'SELECT id, email, telegram_id, balance, vpn_link, subscription_expires_at FROM users WHERE id = ?'
		)
		.get(req.session.userId)

	res.json({
		user: {
			...user,
			is_vip: isVip(user.telegram_id),
			has_subscription: !!(
				user.subscription_expires_at &&
				user.subscription_expires_at > Date.now()
			)
		}
	})
})

app.post('/logout', (req, res) => {
	req.session.destroy(() => res.json({ message: 'Вы вышли' }))
})

const SUBSCRIPTION_COST = Number(process.env.SUBSCRIPTION_COST || 0)
const SUBSCRIPTION_DURATION_MS =
	Number(process.env.SUBSCRIPTION_DURATION_DAYS || 30) * 24 * 60 * 60 * 1000
// Создаёт (или продлевает/подтверждает существующую) VPN-подписку для
// текущего залогиненного пользователя.
//
// Логика:
// 1. Если подписка ещё активна (subscription_expires_at в будущем) -
//    деньги НЕ списываются, просто освежаем ссылку через Go (self-heal,
//    если клиента вдруг удалили в панели руками).
// 2. Если подписки нет или она истекла - атомарно списываем
//    SUBSCRIPTION_COST и продлеваем на SUBSCRIPTION_DURATION_MS вперёд
//    от текущего момента. Атомарность (без await между чтением и
//    записью) исключает двойное списание при быстрых повторных кликах.
// 3. В любом случае Go получает актуальный expiry_time и сам следит,
//    чтобы в 3x-ui у клиента стояло то же самое значение - панель сама
//    отключит клиента, когда время истечёт (встроенный cron 3x-ui).
app.post('/create', requireAuth, async (req, res) => {
	try {
		const user = db
			.prepare(
				'SELECT id, telegram_id, balance, subscription_expires_at FROM users WHERE id = ?'
			)
			.get(req.session.userId)

		if (!user) {
			return res.status(401).json({ error: 'Не авторизован' })
		}

		const vip = isVip(user.telegram_id)
		const now = Date.now()
		let expiresAt = user.subscription_expires_at || 0
		let isActive = expiresAt > now

		if (!isActive) {
			const newExpiry = now + SUBSCRIPTION_DURATION_MS

			if (vip) {
				db.prepare(
					`UPDATE users SET subscription_expires_at = ?
					 WHERE id = ? AND (subscription_expires_at IS NULL OR subscription_expires_at <= ?)`
				).run(newExpiry, user.id, now)
				expiresAt = newExpiry
				isActive = true
			} else {
				const result = db
					.prepare(
						`UPDATE users
						 SET balance = balance - ?, subscription_expires_at = ?
						 WHERE id = ?
						   AND (subscription_expires_at IS NULL OR subscription_expires_at <= ?)
						   AND balance >= ?`
					)
					.run(SUBSCRIPTION_COST, newExpiry, user.id, now, SUBSCRIPTION_COST)

				if (result.changes === 1) {
					expiresAt = newExpiry
					isActive = true
				} else {
					const fresh = db
						.prepare('SELECT subscription_expires_at FROM users WHERE id = ?')
						.get(user.id)

					if (
						fresh.subscription_expires_at &&
						fresh.subscription_expires_at > now
					) {
						expiresAt = fresh.subscription_expires_at
						isActive = true
					} else {
						return res
							.status(402)
							.json({ error: 'Недостаточно средств на балансе' })
					}
				}
			}
		}

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 20000)

		const goResp = await fetch(`${GO_BASE_URL}/internal/create`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Internal-Secret': INTERNAL_SECRET
			},
			body: JSON.stringify({
				user_id: user.id,
				telegram_id: user.telegram_id,
				expiry_time: expiresAt
			}),
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

		const updatedUser = db
			.prepare('SELECT balance FROM users WHERE id = ?')
			.get(user.id)

		res.json({
			success: true,
			link: data.link,
			balance: updatedUser.balance,
			expires_at: expiresAt
		})
	} catch (err) {
		console.error('create error:', err)
		res.status(500).json({ error: `Внутренняя ошибка: ${err.message}` })
	}
})

// ==== Платежи через Platega ====

const PLATEGA_MERCHANT_ID = process.env.PLATEGA_MERCHANT_ID
const PLATEGA_SECRET = process.env.PLATEGA_SECRET
const PLATEGA_BASE_URL =
	process.env.PLATEGA_BASE_URL || 'https://app.platega.io'
const SITE_URL = process.env.SITE_URL || 'https://blissvpn.vu'

if (!PLATEGA_MERCHANT_ID || !PLATEGA_SECRET) {
	console.error(
		'PLATEGA_MERCHANT_ID / PLATEGA_SECRET не заданы в backend/db/.env - платежи работать не будут'
	)
}

// Создаёт платёж на пополнение баланса для текущего залогиненного
// пользователя. Сумма приходит с фронта - amount в рублях, > 0.
app.post('/api/payment/create', requireAuth, async (req, res) => {
	const amount = Number(req.body?.amount)

	if (!amount || amount <= 0) {
		return res.status(400).json({ error: 'Некорректная сумма' })
	}

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 15000)

		const plategaResp = await fetch(`${PLATEGA_BASE_URL}/transaction/process`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-MerchantId': PLATEGA_MERCHANT_ID,
				'X-Secret': PLATEGA_SECRET
			},
			body: JSON.stringify({
				paymentMethod: 2, // СБП
				paymentDetails: {
					amount,
					currency: 'RUB'
				},
				description: `Пополнение баланса Bliss VPN, пользователь #${req.session.userId}`,
				return: `${SITE_URL}/payment-success`,
				failedUrl: `${SITE_URL}/payment-failed`
			}),
			signal: controller.signal
		})
		clearTimeout(timeoutId)

		const data = await plategaResp.json()

		if (!plategaResp.ok || !data.transactionId) {
			console.error('platega create error:', data)
			return res
				.status(502)
				.json({ error: 'Не удалось создать платёж, попробуйте позже' })
		}

		// Сохраняем транзакцию как PENDING - callback потом найдёт её по
		// transaction_id и поймёт, какому пользователю зачислять деньги.
		db.prepare(
			'INSERT INTO payments (transaction_id, user_id, amount, status) VALUES (?, ?, ?, ?)'
		).run(data.transactionId, req.session.userId, amount, 'PENDING')

		res.json({ success: true, redirect: data.redirect })
	} catch (err) {
		console.error('payment create error:', err)
		const message =
			err.name === 'AbortError'
				? 'Платёжный сервис не отвечает (таймаут)'
				: 'Платёжный сервис недоступен'
		res.status(502).json({ error: message })
	}
})

// Публичный эндпоинт - сюда стучится сама Platega при изменении статуса
// транзакции. URL нужно указать в личном кабинете Platega (Настройки ->
// Callback URLs). ВАЖНО: должен отвечать быстро (в течение 60 секунд),
// иначе Platega повторит попытку до 3 раз с интервалом 5 минут.
app.post('/api/payment/callback', (req, res) => {
	// Platega подтверждает свою личность теми же заголовками,
	// что мы используем для авторизации своих запросов к ней.
	if (
		req.headers['x-merchantid'] !== PLATEGA_MERCHANT_ID ||
		req.headers['x-secret'] !== PLATEGA_SECRET
	) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const { id, status, amount } = req.body

	if (!id || !status) {
		return res.status(400).json({ error: 'id и status обязательны' })
	}

	const payment = db
		.prepare('SELECT * FROM payments WHERE transaction_id = ?')
		.get(id)

	if (!payment) {
		// Платёж не наш / уже удалён - отвечаем 200, чтобы Platega
		// не долбила повторными попытками бессмысленно.
		console.warn('callback for unknown transaction_id:', id)
		return res.json({ success: true })
	}

	if (status === 'CONFIRMED') {
		// Атомарно: зачисляем баланс и помечаем платёж подтверждённым
		// ОДНИМ синхронным шагом, защищённым условием status='PENDING' -
		// если Platega пришлёт callback дважды за одну и ту же транзакцию
		// (у них это официально предусмотрено - retry при не-200 ответе),
		// повторное зачисление физически невозможно: второй раз условие
		// WHERE status = 'PENDING' не совпадёт, changes будет 0.
		const result = db
			.prepare(
				`UPDATE payments SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND status = 'PENDING'`
			)
			.run(id)

		if (result.changes === 1) {
			db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(
				payment.amount,
				payment.user_id
			)
			console.log(
				`Баланс пользователя ${payment.user_id} пополнен на ${payment.amount} (transaction ${id})`
			)
		}
	} else if (status === 'CANCELED' || status === 'CHARGEBACKED') {
		db.prepare(
			`UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND status = 'PENDING'`
		).run(status, id)
	}

	res.json({ success: true })
})

// Позволяет фронту узнать текущий статус платежа (для страницы
// "ожидание оплаты" - можно поллить, пока callback не придёт).
app.get('/api/payment/status/:transactionId', requireAuth, (req, res) => {
	const payment = db
		.prepare(
			'SELECT transaction_id, status, amount FROM payments WHERE transaction_id = ? AND user_id = ?'
		)
		.get(req.params.transactionId, req.session.userId)

	if (!payment) {
		return res.status(404).json({ error: 'Платёж не найден' })
	}

	res.json({ status: payment.status, amount: payment.amount })
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


app.get('/api/bot/all-users', (req, res) => {
	if (req.headers['x-bot-secret'] !== process.env.BOT_API_SECRET) {
		return res.status(403).json({ error: 'forbidden' })
	}

	const rows = db
		.prepare('SELECT telegram_id, vpn_link FROM users WHERE telegram_id IS NOT NULL')
		.all()

	res.json({
		total: rows.length,
		with_telegram: rows.length,
		with_link: rows.filter(r => r.vpn_link).length,
		telegram_ids: rows.map(r => r.telegram_id)
	})
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
