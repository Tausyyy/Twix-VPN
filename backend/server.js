const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const db = require('./db/init') // наш файл с БД

const app = express()

app.use(cors())
app.use(express.json())

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
		stmt.run(email, hash)

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

		if (!user) {
			return res.status(401).json({ error: 'Неверный email или пароль' })
		}

		const isValid = await bcrypt.compare(password, user.password_hash)
		if (!isValid) {
			return res.status(401).json({ error: 'Неверный email или пароль' })
		}

		res.json({ message: 'Вход выполнен' })
	} catch (err) {
		console.error(err)
		res.status(500).json({ error: 'Ошибка сервера' })
	}
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
	console.log(`Сервер запущен на http://localhost:${PORT}`)
})
