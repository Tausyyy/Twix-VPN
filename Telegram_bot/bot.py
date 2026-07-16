# bot.py
import asyncio
import logging
import os
import socket

import aiohttp
from aiogram import Bot, Dispatcher, Router
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.filters import CommandStart
from aiogram import F
from aiogram.types import Message
from aiogram.types import ReplyKeyboardRemove, ReplyKeyboardMarkup, KeyboardButton,InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder

from pathlib import Path

from dotenv import load_dotenv

# .env всегда из папки бота, даже если запуск из корня проекта
load_dotenv(Path(__file__).resolve().parent / ".env")

BOT_TOKEN = os.environ["BOT_TOKEN"]
BOT_API_SECRET = os.environ["BOT_API_SECRET"]
API_URL = os.environ.get("API_URL", "http://127.0.0.1:3000").rstrip("/")
SITE_URL = os.environ["SITE_URL"].rstrip("/")
# Пример: socks5://127.0.0.1:1080  или  http://127.0.0.1:7890
TELEGRAM_PROXY = (
	os.environ.get("TELEGRAM_PROXY")
	or os.environ.get("HTTPS_PROXY")
	or os.environ.get("HTTP_PROXY")
	or ""
).strip() or None

logging.basicConfig(level=logging.INFO)

session = AiohttpSession(proxy=TELEGRAM_PROXY)
# Часто IPv6 до Telegram «висит» — принудительно IPv4
session._connector_init["family"] = socket.AF_INET

bot = Bot(token=BOT_TOKEN, session=session)
dp = Dispatcher()
router = Router()
dp.include_router(router)


def get_keyboard():
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🔐 Личный кабинет")
            ],
            [
                KeyboardButton(text="😺 Кабинет не работает", style="danger")
            ],
            [
                KeyboardButton(text="🧑‍🤝‍🧑 Пригласить", style="success"),
                KeyboardButton(text="📖 Помощь", style="primary")
            ]
        ],
        resize_keyboard=True
    )

    return keyboard

@router.message(CommandStart())
async def start_handler(message: Message):
	user = message.from_user
	telegram_id = user.id
	# имя в Telegram: full_name / first_name (отдельного user.name нет)
	name = user.full_name or user.first_name or "друг"

	async with aiohttp.ClientSession() as http:
		try:
			async with http.post(
				f"{API_URL}/api/bot/login",
				json={"telegram_id": telegram_id},
				headers={"x-bot-secret": BOT_API_SECRET},
				timeout=aiohttp.ClientTimeout(total=5),
			) as resp:
				if resp.status != 200:
					text = await resp.text()
					logging.error("bot login failed: %s %s", resp.status, text)
					await message.answer("Ошибка авторизации, попробуй позже")
					return
				data = await resp.json()
		except aiohttp.ClientError as err:
			logging.error("site unreachable: %s", err)
			await message.answer("Сайт недоступен, попробуй позже")
			return

	# вот здесь создаётся ссылка: SITE_URL + token из ответа API
	token = data["token"]
	link = f"{SITE_URL}/auth?token={token}"

	await message.answer(
		f"Рады видеть, {name}!\n"
		f"Ваша ссылка для входа в личный кабинет:\n{link}\n\n"
		f"Ссылка действует 10 минут.",
		reply_markup=get_keyboard()
	)

	@router.message(F.text == "📖 Помощь")
	async def help_button(message: Message):
			await message.answer(
					"🆘 Помощь:\n\n"
					"Если возникли проблемы — напишите @dowtu."
			)
	
	@router.message(F.text == '🔐 Личный кабинет')
	async def profile(message: Message):
		await message.answer(
			f"Для входа в личный кабинет Twix VPN перейдите по ссылке ниже. " 
			f"Ссылка действует ограниченное время, при необходимости получите новую ссылку, "
			f"нажав на кнопку \n🔐 Личный кабинет.\n\n"
			f"{link}"
		)

	@router.message(F.text == '😺 Кабинет не работает')
	async def profile(message: Message):
		await message.answer(
			f"Если вы не можете зайти в личный кабинет или он работает некорректно, попробуйте:\n\n" 
			f"👉 попробуйте зайти в кабинет с включенным VPN\n\n"
			f"👉 попробуйте открыть ссылку на кабинет в другом браузере (Длинное нажатие на ссылку - Открыть в...)\n\n"
			f"👉 обновите страницу (меню браузера - Обновить ⟳)"

		)

async def main():
	if TELEGRAM_PROXY:
		logging.info("Telegram proxy: %s", TELEGRAM_PROXY)
	else:
		logging.warning(
			"TELEGRAM_PROXY не задан. Если api.telegram.org недоступен — "
			"включи VPN или пропиши прокси в Telegram_bot/.env"
		)

	# Не роняем весь make up: если Telegram недоступен — пробуем снова
	while True:
		try:
			await dp.start_polling(bot)
			break
		except Exception:
			logging.exception(
				"Нет связи с Telegram API. Проверь VPN/прокси "
				"(TELEGRAM_PROXY в .env), например socks5://127.0.0.1:1080. "
				"Повтор через 15 сек..."
			)
			await asyncio.sleep(15)


if __name__ == "__main__":
	asyncio.run(main())
