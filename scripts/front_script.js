window.onload = function () {
	const preloader = this.document.getElementById('preloader')
	preloader.style.opacity = '0'
	this.setTimeout(() => {
		preloader.style.display = 'none'
	}, 500)
}

const API_BASE = ''

function hideAllScreens() {
	;['welcome', 'main', 'reg', 'success_reg', 'main_window'].forEach(id => {
		document.getElementById(id)?.classList.add('hidden')
	})
}

function showLoggedIn() {
	hideAllScreens()
	document.getElementById('main_window').classList.remove('hidden')
}

async function checkSession() {
	try {
		const response = await fetch(`${API_BASE}/me`, {
			credentials: 'include'
		})
		if (response.ok) {
			showLoggedIn()
		}
	} catch (error) {
		console.error('Не удалось проверить сессию:', error)
	}
}

document.getElementById('logo_btn').addEventListener('click', () => {
	document.getElementById('main').classList.add('hidden')
	document.getElementById('reg').classList.add('hidden')
	document.getElementById('welcome').classList.remove('hidden')
})

document.getElementById('next-btn').addEventListener('click', () => {
	document.getElementById('welcome').classList.add('hidden')
	document.getElementById('main').classList.remove('hidden')
	document.getElementById('email_alert').classList.add('hidden')
})

const form = document.querySelector('.form-submit')
const emailAlert = document.getElementById('email_alert')
const passPatternHintLogin = document.getElementById('pass_pattern_hint')

form.addEventListener('submit', async e => {
	e.preventDefault()

	const email = form.email
	const password = form.password
	let isValid = true

	if (!email.checkValidity()) {
		email.closest('label').classList.add('input-error')
		emailAlert.classList.remove('hidden')
		isValid = false
	} else {
		email.closest('label').classList.remove('input-error')
		emailAlert.classList.add('hidden')
	}

	if (!password.checkValidity()) {
		password.closest('label').classList.add('input-error')
		isValid = false
		passPatternHintLogin.classList.remove('hidden')
	} else {
		password.closest('label').classList.remove('input-error')
		passPatternHintLogin.classList.add('hidden')
	}

	if (!isValid) {
		return
	}

	try {
		const response = await fetch(`${API_BASE}/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				email: email.value,
				password: password.value
			})
		})

		const data = await response.json()

		if (response.ok) {
			showLoggedIn()
		} else {
			alert(data.error)
		}
	} catch (error) {
		console.error('Ошибка сети:', error)
		alert('Не удалось связаться с сервером')
	}
})

document.getElementById('registration-btn').addEventListener('click', () => {
	document.getElementById('main').classList.add('hidden')
	document.getElementById('reg').classList.remove('hidden')
})

const regForm = document.getElementById('reg')
const passAlert = document.getElementById('pass_alert')
const emailInput = document.getElementById('email_reg')
const currPassInput = document.getElementById('current_password')
const passPatternHint = document.getElementById('pass_pattern_hint_reg')

regForm.addEventListener('submit', async e => {
	e.preventDefault()

	const email = emailInput.value
	const currPass = currPassInput.value
	const repeatPass = document.getElementById('repeat_password').value

	if (!email || !currPass || !repeatPass) {
		return
	}
	if (!emailInput.checkValidity()) {
		emailInput.closest('label').classList.add('input-error')
		return
	}
	emailInput.closest('label').classList.remove('input-error')

	if (!currPassInput.checkValidity()) {
		currPassInput.closest('label').classList.add('input-error')
		passPatternHint.classList.remove('hidden')
		return
	}
	currPassInput.closest('label').classList.remove('input-error')
	passPatternHint.classList.add('hidden')

	if (currPass !== repeatPass) {
		passAlert.classList.remove('hidden')
		return
	}
	passAlert.classList.add('hidden')

	try {
		const response = await fetch(`${API_BASE}/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ email, password: currPass })
		})

		const data = await response.json()

		if (response.ok) {
			document.getElementById('reg').classList.add('hidden')
			document.getElementById('success_reg').classList.remove('hidden')
			console.log(`Зарегистрирован: ${email}`)
		} else {
			alert(data.error)
		}
	} catch (err) {
		console.error('Ошибка сети:', err)
		alert('Не удалось связаться с сервером')
	}
})

document.getElementById('join_btn').addEventListener('click', () => {
	document.getElementById('success_reg').classList.add('hidden')
	document.getElementById('main').classList.remove('hidden')
})

const header = document.getElementById('header')
const mainWindow = document.getElementById('main_window')

function showMainWindow() {
	header.classList.add('hidden')
	balance.classList.remove('hidden')
}

// Копирует текст в буфер обмена. navigator.clipboard работает только в
// "безопасном контексте" (https:// или localhost/127.0.0.1) — если сайт
// открыт по LAN-IP (например, из-за host: true в vite.config.js) без https,
// navigator.clipboard будет undefined, и тут используется старый fallback
// через скрытый textarea + document.execCommand('copy').
async function copyToClipboard(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		await navigator.clipboard.writeText(text)
		return
	}

	const textarea = document.createElement('textarea')
	textarea.value = text
	textarea.style.position = 'fixed'
	textarea.style.opacity = '0'
	document.body.appendChild(textarea)
	textarea.focus()
	textarea.select()
	const ok = document.execCommand('copy')
	document.body.removeChild(textarea)

	if (!ok) {
		throw new Error('execCommand("copy") не сработал')
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const generateBtn = document.getElementById('generate_link')
	const resultBox = document.getElementById('link_result')

	if (!generateBtn) return

	generateBtn.addEventListener('click', async () => {
		generateBtn.disabled = true
		const originalText = generateBtn.textContent
		generateBtn.textContent = 'Создаём...'
		resultBox.innerHTML = ''

		// Таймаут, чтобы кнопка не висела вечно, если сервер/панель
		// зависли: через 20 секунд отменяем запрос и показываем ошибку
		// вместо бесконечного "Создаём...".
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 20000)

		try {
			const resp = await fetch('/create', {
				method: 'POST',
				credentials: 'include', // ВАЖНО: без этого сессия не долетит до Express
				signal: controller.signal
			})
			clearTimeout(timeoutId)

			if (resp.status === 401) {
				resultBox.innerHTML = `
          <div class="bg-[#2a1414] border border-[#5c2626] rounded-xl p-4 text-red-400 text-sm">
            Сессия истекла, войдите заново.
          </div>
        `
				return
			}

			const text = await resp.text()
			let data
			try {
				data = text ? JSON.parse(text) : null
			} catch (parseErr) {
				throw new Error(
					`Сервер вернул не-JSON ответ (статус ${resp.status}): ${text.slice(0, 200)}`
				)
			}

			if (!data) {
				throw new Error(`Пустой ответ от сервера (статус ${resp.status})`)
			}

			if (data.success) {
				resultBox.innerHTML = `
          <div class="bg-[#18222d] rounded-xl p-4">
            <p class="text-gray-400 text-sm mb-2">Твоя ссылка на подписку:</p>
            <div class="bg-[#0c0d0f] rounded-lg p-3 text-xs break-all font-mono mb-3" id="link_text">${data.link}</div>
            <button id="copy_link_btn" class="w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-lg py-2 text-sm font-bold transition-all duration-300">
              Скопировать
            </button>
          </div>
        `

				const copyBtn = document.getElementById('copy_link_btn')

				copyBtn.addEventListener('click', async () => {
					try {
						await copyToClipboard(data.link)

						copyBtn.textContent = 'Скопировано!'

						setTimeout(() => {
							copyBtn.textContent = 'Скопировать'
						}, 1500)
					} catch (err) {
						console.error('Не удалось скопировать:', err)
						copyBtn.textContent = 'Не удалось скопировать'

						setTimeout(() => {
							copyBtn.textContent = 'Скопировать'
						}, 1500)
					}
				})
			} else {
				resultBox.innerHTML = `
          <div class="bg-[#2a1414] border border-[#5c2626] rounded-xl p-4 text-red-400 text-sm">
            Ошибка: ${data.error}
          </div>
        `
			}
		} catch (e) {
			clearTimeout(timeoutId)
			const message =
				e.name === 'AbortError'
					? 'Сервер слишком долго не отвечает (превышен таймаут 20с). Проверь, работает ли backend.'
					: e.message
			resultBox.innerHTML = `
        <div class="bg-[#2a1414] border border-[#5c2626] rounded-xl p-4 text-red-400 text-sm">
          Ошибка запроса: ${message}
        </div>
      `
		} finally {
			generateBtn.disabled = false
			generateBtn.textContent = originalText
		}
	})
})

checkSession()
