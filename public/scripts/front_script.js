window.onload = function () {
	const preloader = document.getElementById('preloader')
	if (preloader) {
		preloader.style.opacity = '0'
		setTimeout(() => {
			preloader.style.display = 'none'
		}, 500)
	}
}

const API_BASE = ''
let currentUser = null

function hideAllScreens() {
	;['landing', 'main_window'].forEach(id => {
		document.getElementById(id)?.classList.add('hidden')
	})
}

function showLoggedIn() {
	hideAllScreens()
	document.getElementById('main_window')?.classList.remove('hidden')
	const header = document.getElementById('header')
	if (header) header.classList.add('hidden')
}

function showWelcome() {
	hideAllScreens()
	document.getElementById('landing')?.classList.remove('hidden')
	const header = document.getElementById('header')
	if (header) header.classList.remove('hidden')
}

function updateBalanceUI(user) {
	const el = document.getElementById('balance')
	if (!el || !user) return
	el.textContent = user.is_vip ? 'VIP' : `${user.balance ?? 0} ₽`
}

function updateUserIdUI(user) {
	const el = document.getElementById('user_id')
	if (!el || !user) return
	el.textContent = user.telegram_id ? `#${user.telegram_id}` : ''
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
		} else {
			showWelcome()
		}
	} catch (error) {
		console.error('Не удалось проверить сессию:', error)
		showWelcome()
	}
}

async function refreshBalance() {
	try {
		const response = await fetch(`${API_BASE}/me`, { credentials: 'include' })
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

// ===== Accordion =====

document.querySelectorAll('.accordion-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		const accordion = btn.closest('.accordion')
		const content = accordion?.querySelector('.accordion-content')
		const icon = accordion?.querySelector('.icon')
		if (!content || !icon) return

		const isOpen = content.classList.contains('grid-rows-[1fr]')

		document.querySelectorAll('.accordion-content').forEach(el =>
			el.classList.replace('grid-rows-[1fr]', 'grid-rows-[0fr]')
		)
		document.querySelectorAll('.icon').forEach(el => (el.textContent = '+'))

		if (!isOpen) {
			content.classList.replace('grid-rows-[0fr]', 'grid-rows-[1fr]')
			icon.textContent = '−'
		} else {
			content.classList.replace('grid-rows-[1fr]', 'grid-rows-[0fr]')
			icon.textContent = '+'
		}
	})
})

// ===== Mobile menu =====

const mobileMenuBtn = document.getElementById('mobile_menu_btn')
const mobileMenu = document.getElementById('mobile_menu')

if (mobileMenuBtn && mobileMenu) {
	mobileMenuBtn.addEventListener('click', () => {
		const isHidden = mobileMenu.classList.toggle('hidden')
		mobileMenuBtn.setAttribute('aria-expanded', String(!isHidden))
	})

	mobileMenu.querySelectorAll('a').forEach(link => {
		link.addEventListener('click', () => {
			mobileMenu.classList.add('hidden')
			mobileMenuBtn.setAttribute('aria-expanded', 'false')
		})
	})
}

// ===== Logo button =====

document.getElementById('logo_btn')?.addEventListener('click', e => {
	if (document.getElementById('main_window')?.classList.contains('hidden')) return
	e.preventDefault()
	showWelcome()
})

// ===== Invite =====

const BOT_USERNAME = 'vpnbliss_bot'

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
	copyBtn?.addEventListener('click', async () => {
		try {
			await copyToClipboard(refLink)
			copyBtn.textContent = 'Скопировано!'
		} catch (err) {
			copyBtn.textContent = 'Не удалось скопировать'
		}
		setTimeout(() => {
			copyBtn.textContent = 'Скопировать ссылку'
		}, 1500)
	})
})

// ===== Modal =====

const modalOverlay = document.getElementById('modal_overlay')
const modalBox = document.getElementById('modal_box')
const modalContent = document.getElementById('modal_content')

function openModal(html) {
	if (!modalContent || !modalOverlay || !modalBox) return
	modalContent.innerHTML = html
	modalOverlay.classList.remove('pointer-events-none')
	requestAnimationFrame(() => {
		modalOverlay.classList.remove('opacity-0')
		modalBox.classList.remove('scale-95', 'opacity-0')
	})
}

function closeModal() {
	if (!modalOverlay || !modalBox || !modalContent) return
	modalOverlay.classList.add('opacity-0')
	modalBox.classList.add('scale-95', 'opacity-0')
	setTimeout(() => {
		modalOverlay.classList.add('pointer-events-none')
		modalContent.innerHTML = ''
	}, 300)
}

modalOverlay?.addEventListener('click', e => {
	if (e.target === modalOverlay) closeModal()
})

document.addEventListener('keydown', e => {
	if (e.key === 'Escape') closeModal()
})

// ===== Clipboard =====

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

// ===== Generate link =====

document.addEventListener('DOMContentLoaded', () => {
	const generateBtn = document.getElementById('generate_link')
	if (!generateBtn) return

	async function createLink(force = false) {
		openModal(`
			<div class="text-center py-6">
				<div class="text-gray-400 text-sm">${force ? 'Пересоздаём ссылку...' : 'Создаём ссылку...'}</div>
			</div>
		`)

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 20000)

		try {
			const resp = await fetch('/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ force }),
				signal: controller.signal
			})
			clearTimeout(timeoutId)

			if (resp.status === 401) {
				openModal(`
					<div class="text-center py-4">
						<div class="text-4xl mb-3">🔒</div>
						<h3 class="text-lg font-bold mb-2">Сессия истекла</h3>
						<p class="text-gray-400 text-sm mb-5">Войдите заново, чтобы продолжить</p>
						<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">Закрыть</button>
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

				document.getElementById('modal_topup_btn')?.addEventListener('click', () => {
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
				throw new Error(`Сервер вернул не-JSON ответ (статус ${resp.status}): ${text.slice(0, 200)}`)
			}

			if (!data) {
				throw new Error(`Пустой ответ от сервера (статус ${resp.status})`)
			}

			if (data.success && data.exists && !force) {
				openModal(`
					<div class="text-center mb-1">
						<div class="text-4xl mb-3">🔗</div>
						<h3 class="text-lg font-bold mb-2">У вас уже есть ссылка</h3>
						<p class="text-gray-400 text-sm mb-4">Если старая ссылка не работает — пересоздайте её.</p>
					</div>
					<div class="bg-[#0c0d0f] rounded-lg p-3 text-xs break-all font-mono mb-4" id="link_text">${data.link}</div>
					<button id="recreate_link_btn" class="w-full bg-pink-500 hover:bg-pink-400 rounded-xl py-3 font-bold transition-colors duration-300 mb-2">
						Пересоздать ссылку
					</button>
					<button id="copy_link_btn" class="w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-xl py-3 font-bold transition-colors duration-300 mb-2">
						Скопировать
					</button>
					<button onclick="closeModal()" class="w-full bg-white/5 hover:bg-white/10 rounded-xl py-3 font-medium transition-colors">
						Закрыть
					</button>
				`)

				document.getElementById('recreate_link_btn')?.addEventListener('click', () => {
					createLink(true)
				})

				const copyBtn = document.getElementById('copy_link_btn')
				copyBtn?.addEventListener('click', async () => {
					try {
						await copyToClipboard(data.link)
						copyBtn.textContent = 'Скопировано!'
					} catch (err) {
						console.error('Не удалось скопировать:', err)
						copyBtn.textContent = 'Не удалось скопировать'
					}
					setTimeout(() => {
						copyBtn.textContent = 'Скопировать'
					}, 1500)
				})
				return
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
				copyBtn?.addEventListener('click', async () => {
					try {
						await copyToClipboard(data.link)
						copyBtn.textContent = 'Скопировано!'
					} catch (err) {
						console.error('Не удалось скопировать:', err)
						copyBtn.textContent = 'Не удалось скопировать'
					}
					setTimeout(() => {
						copyBtn.textContent = 'Скопировать'
					}, 1500)
				})
			} else {
				openModal(`
					<div class="text-center py-4">
						<div class="text-4xl mb-3">⚠️</div>
						<h3 class="text-lg font-bold mb-2">Ошибка</h3>
						<p class="text-gray-400 text-sm mb-5">${data.error}</p>
						<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">Закрыть</button>
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
					<button onclick="closeModal()" class="w-full bg-white/10 hover:bg-white/15 rounded-xl py-3 font-medium transition-colors">Закрыть</button>
				</div>
			`)
		}
	}

	generateBtn.addEventListener('click', () => createLink(false))
})

// ===== Top up =====

document.getElementById('topup_btn')?.addEventListener('click', () => {
	openModal(`
		<div class="text-center py-4">
			<div class="text-4xl mb-3">💳</div>
			<h3 class="text-lg font-bold mb-2">Пополнение баланса</h3>
			<p class="text-gray-400 text-sm mb-5">Пополнение происходит через Telegram-бота. Нажмите кнопку ниже.</p>
			<a href="https://t.me/vpnbliss_bot" target="_blank" rel="noopener noreferrer" class="block w-full bg-[#0c54a0] hover:bg-[#3774b5] rounded-xl py-3 font-bold transition-colors duration-300 mb-2">
				Перейти в бота
			</a>
			<button onclick="closeModal()" class="w-full bg-white/5 hover:bg-white/10 rounded-xl py-3 font-medium transition-colors">Закрыть</button>
		</div>
	`)
})

// ===== Init =====

;(async () => {
	if (window.Telegram?.WebApp?.initData) {
		await initTelegramAuth()
	}
	checkSession()
})()
