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

function updateBalanceUI(user) {
	const el = document.getElementById('balance')
	if (!el || !user) return
	el.textContent = user.is_vip ? 'VIP' : `${user.balance} ₽`
}

function updateUserIdUI(user) {
	const el = document.getElementById('user_id')
	if (!el || !user) return
	el.textContent = user.telegram_id ? `#${user.telegram_id}` : ''
}

async function initTelegramAuth() {
	const tg = window.Telegram?.WebApp
	if (!tg || !tg.initData) return false

	tg.ready()
	tg.expand()

	try {
		const resp = await fetch('/api/telegram-auth', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ initData: tg.initData })
		})
		return resp.ok
	} catch (e) {
		console.error('Telegram auth failed:', e)
		return false
	}
}
function updateStatusUI(user) {
	const pill = document.getElementById('status_pill')
	const dot = document.getElementById('status_dot')
	const text = document.getElementById('status_text')
	if (!pill || !dot || !text || !user) return

	if (user.has_subscription) {
		text.textContent = 'подписка активна'
		dot.classList.remove('bg-white')
		dot.classList.add('bg-green-400')
		pill.classList.remove('border-[#827f85]')
		pill.classList.add('border-green-500/40', 'text-green-300')
	} else {
		text.textContent = 'нет подписки'
		dot.classList.remove('bg-green-400')
		dot.classList.add('bg-white')
		pill.classList.remove('border-green-500/40', 'text-green-300')
		pill.classList.add('border-[#827f85]')
	}
}

const BOT_USERNAME = 'vpnbliss_bot'
let currentUser = null

async function checkSession() {
	try {
		const response = await fetch(`${API_BASE}/me`, { credentials: 'include' })
		if (response.ok) {
			const data = await response.json()
			currentUser = data.user
			showLoggedIn()
			updateUserIdUI(data.user)
			updateBalanceUI(data.user)
			updateStatusUI(data.user)
		}
	} catch (error) {
		console.error('Не удалось проверить сессию:', error)
	}
}

document.getElementById('invite_btn')?.addEventListener('click', () => {
	if (!currentUser?.telegram_id) {
		openModal(`
			
			<div class="text-center py-4">
				<div class="text-4xl mb-3">⚠️</div>
				<h3 class="text-lg font-bold mb-2">Недоступно</h3>
				<p class="text-gray-400 text-sm mb-5">Реферальная ссылка доступна только для пользователей, вошедших через Telegram-бота</p>
				<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">Закрыть</button>
			</div>

			`)

		return
	}
	const refLink = `https://t.me/${BOT_USERNAME}?start=${currentUser.telegram_id}`

	openModal(`
		
		<div class="text-center mb-1">
			<div class="text-4xl mb-3">👥</div>
			<h3 class="text-lg font-bold mb-2">Пригласи друга</h3>
			<p class="text-gray-400 text-sm mb-4">Получи 50₽ на баланс, когда друг зайдёт по ссылке и зарегистрируется</p>
			</div>
				<div class="bg-[#0c0d0f] rounded-lg p-3 text-xs break-all font-mono mb-4">${refLink}</div>
					<button id="copy_ref_btn" class="w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-xl py-3 font-bold transition-colors duration-300 mb-2">
						Скопировать ссылку
					</button>
					<button onclick="closeModal()" class="w-full bg-white/5 hover:bg-white/10 rounded-xl py-3 font-medium transition-colors">
						Закрыть
					</button>
		`)
	const copyBtn = document.getElementById('copy_ref_btn')
	copyBtn.addEventListener('click', async () => {
		try {
			await copyToClipboard(refLink)
			copyBtn.textContent = 'Скопировано!'
			setTimeout(() => {
				copyBtn.textContent = 'Скопировать ссылку'
			}, 1500)
		} catch (err) {
			copyBtn.textContent = 'Не удалось скопировать'
			setTimeout(() => {
				copyBtn.textContent = 'Скопировать ссылку'
			}, 1500)
		}
	})
})

async function refreshBalance() {
	try {
		const response = await fetch(`${API_BASE}/me`, {
			credentials: 'include'
		})
		if (response.ok) {
			const data = await response.json()
			updateUserIdUI(data.user)
			updateBalanceUI(data.user)
			updateStatusUI(data.user)
		}
	} catch (error) {
		console.log('Не удалось обновить баланс', error)
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

// ===== Модальное окно =====

const modalOverlay = document.getElementById('modal_overlay')
const modalBox = document.getElementById('modal_box')
const modalContent = document.getElementById('modal_content')

function openModal(html) {
	modalContent.innerHTML = html
	modalOverlay.classList.remove('pointer-events-none')
	requestAnimationFrame(() => {
		modalOverlay.classList.remove('opacity-0')
		modalBox.classList.remove('scale-95', 'opacity-0')
	})
}

function closeModal() {
	modalOverlay.classList.add('opacity-0')
	modalBox.classList.add('scale-95', 'opacity-0')
	setTimeout(() => {
		modalOverlay.classList.add('pointer-events-none')
		modalContent.innerHTML = ''
	}, 300)
}

modalOverlay.addEventListener('click', e => {
	if (e.target === modalOverlay) closeModal()
})

document.addEventListener('keydown', e => {
	if (e.key === 'Escape') closeModal()
})

// ===== Получить ссылку =====

document.addEventListener('DOMContentLoaded', () => {
	const generateBtn = document.getElementById('generate_link')

	if (!generateBtn) return

	generateBtn.addEventListener('click', async () => {
		openModal(`
			<div class="text-center py-6">
				<div class="text-gray-400 text-sm">Создаём ссылку...</div>
			</div>
		`)

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
				openModal(`
					<div class="text-center py-4">
						<div class="text-4xl mb-3">🔒</div>
						<h3 class="text-lg font-bold mb-2">Сессия истекла</h3>
						<p class="text-gray-400 text-sm mb-5">Войдите заново, чтобы продолжить</p>
						<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">
							Закрыть
						</button>
					</div>
				`)
				return
			}

			if (resp.status === 402) {
				openModal(`
					<div class="text-center py-4">
						<div class="text-4xl mb-3">💳</div>
						<h3 class="text-lg font-bold mb-2">Недостаточно средств</h3>
						<p class="text-gray-400 text-sm mb-5">Пополните баланс, чтобы получить ссылку на подписку</p>
						<button id="modal_topup_btn" class="w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-xl py-3 font-bold transition-colors duration-300">
							Пополнить баланс
						</button>
					</div>
				`)

				document
					.getElementById('modal_topup_btn')
					.addEventListener('click', () => {
						closeModal()
						document.getElementById('topup_btn')?.click()
					})
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
				openModal(`
					<div class="text-center mb-1">
						<div class="text-4xl mb-3">🔗</div>
						<h3 class="text-lg font-bold mb-4">Твоя ссылка на подписку</h3>
					</div>
					<div class="bg-[#0c0d0f] rounded-lg p-3 text-xs break-all font-mono mb-4" id="link_text">${data.link}</div>
					<button id="copy_link_btn" class="w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-xl py-3 font-bold transition-colors duration-300 mb-2">
						Скопировать
					</button>
					<button onclick="closeModal()" class="w-full bg-white/5 hover:bg-white/10 rounded-xl py-3 font-medium transition-colors">
						Закрыть
					</button>
				`)

				refreshBalance()

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
				openModal(`
					<div class="text-center py-4">
						<div class="text-4xl mb-3">⚠️</div>
						<h3 class="text-lg font-bold mb-2">Ошибка</h3>
						<p class="text-gray-400 text-sm mb-5">${data.error}</p>
						<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">
							Закрыть
						</button>
					</div>
				`)
			}
		} catch (e) {
			clearTimeout(timeoutId)
			const message =
				e.name === 'AbortError'
					? 'Сервер слишком долго не отвечает (превышен таймаут 20с). Проверь, работает ли backend.'
					: e.message
			openModal(`
				<div class="text-center py-4">
					<div class="text-4xl mb-3">⚠️</div>
					<h3 class="text-lg font-bold mb-2">Ошибка запроса</h3>
					<p class="text-gray-400 text-sm mb-5">${message}</p>
					<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">
						Закрыть
					</button>
				</div>
			`)
		}
	})
})
;(async () => {
	if (window.Telegram?.WebApp?.initData) {
		await initTelegramAuth()
	}
	checkSession()
})()
