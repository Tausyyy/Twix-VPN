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
		const response = await fetch('http://localhost:3000/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: email.value,
				password: password.value
			})
		})

		const data = await response.json()

		if (response.ok) {
			document.getElementById('main').classList.add('hidden')
			document.getElementById('main_window').classList.remove('hidden')
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
		const response = await fetch('http://localhost:3000/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
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
