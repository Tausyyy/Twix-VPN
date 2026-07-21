# bot.py
import asyncio
import logging
import os
import socket

import aiohttp
from aiogram import Bot, Dispatcher, Router
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.filters import CommandStart, CommandObject
from aiogram import F
from aiogram.types import (
	Message,
	CallbackQuery,
	ReplyKeyboardRemove,
	ReplyKeyboardMarkup,
	KeyboardButton,
	InlineKeyboardMarkup,
	InlineKeyboardButton,
)
from admin import router as admin_router
from aiogram.utils.keyboard import InlineKeyboardBuilder

from pathlib import Path

from dotenv import load_dotenv

# .env всегда из папки бота, даже если запуск из корня проекта
load_dotenv(Path(__file__).resolve().parent / ".env")

BOT_TOKEN = os.environ["BOT_TOKEN"]
BOT_API_SECRET = os.environ["BOT_API_SECRET"]
API_URL = os.environ.get("API_URL", "http://127.0.0.1:3000").rstrip("/")
SITE_URL = os.environ["SITE_URL"].rstrip("/")
CHANNEL_ID = os.environ.get("CHANNEL_ID")
CHANNEL_LINK = os.environ.get("CHANNEL_LINK", "https://t.me/vpnbliss")
# Пример: socks5://127.0.0.1:1080  или  http://127.0.0.1:7890
TELEGRAM_PROXY = (
	os.environ.get("TELEGRAM_PROXY")
	or os.environ.get("HTTPS_PROXY")
	or os.environ.get("HTTP_PROXY")
	or ""
).strip() or None

logging.basicConfig(level=logging.INFO)


def subscribe_keyboard():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="📢 Подписаться", url=CHANNEL_LINK)],
			[InlineKeyboardButton(text="✅ Я подписался", callback_data="check_sub")],
		]
	)


async def is_subscribed(bot: Bot, user_id: int) -> bool:
	logging.info("CHANNEL_ID = %r", CHANNEL_ID)
	if not CHANNEL_ID:
		logging.warning("CHANNEL_ID не задан — пропускаю всех без проверки")
		return True
	try:
		member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
		logging.info("Статус пользователя %s в канале: %s", user_id, member.status)
		return member.status in ("member", "administrator", "creator")
	except Exception:
		logging.exception("Не удалось проверить подписку для %s", user_id)
		return False


session = AiohttpSession(proxy=TELEGRAM_PROXY)
# Часто IPv6 до Telegram «висит» — принудительно IPv4
session._connector_init["family"] = socket.AF_INET

bot = Bot(token=BOT_TOKEN, session=session)
dp = Dispatcher()
router = Router()
dp.include_router(router)
dp.include_router(admin_router)


def get_keyboard():
	keyboard = ReplyKeyboardMarkup(
		keyboard=[
			[KeyboardButton(text="🔐 Личный кабинет")],
			[KeyboardButton(text="😺 Кабинет не работает", style="danger")],
			[
				KeyboardButton(text="🧑‍🤝‍🧑 Пригласить", style="success"),
				KeyboardButton(text="📖 Помощь", style="primary"),
			],
		],
		resize_keyboard=True,
	)

	return keyboard


async def send_login_link(message: Message, telegram_id: int, name: str, referred_by):
	"""Логинит пользователя через backend и присылает ему ссылку в личный кабинет."""
	async with aiohttp.ClientSession() as http:
		try:
			async with http.post(
				f"{API_URL}/api/bot/login",
				json={"telegram_id": telegram_id, "referred_by": referred_by},
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

	token = data["token"]
	link = f"{SITE_URL}/auth?token={token}"

	await message.answer(
		f"Рады видеть, {name}!\n"
		f"Ваша ссылка для входа в личный кабинет:\n{link}\n\n"
		f"Ссылка действует 10 минут.",
		reply_markup=get_keyboard(),
	)


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject, bot: Bot):
	user = message.from_user
	telegram_id = user.id
	name = user.full_name or user.first_name or "друг"

	if not await is_subscribed(bot, telegram_id):
		await message.answer(
			"Чтобы пользоваться ботом, сначала подпишись на наш канал 👇",
			reply_markup=subscribe_keyboard(),
		)
		return

	referred_by = None
	if command.args and command.args.isdigit():
		ref_id = int(command.args)
		if ref_id != telegram_id:  # нельзя пригласить самого себя
			referred_by = ref_id

	await send_login_link(message, telegram_id, name, referred_by)


@router.callback_query(F.data == "check_sub")
async def process_check_sub(callback: CallbackQuery, bot: Bot):
	telegram_id = callback.from_user.id

	if await is_subscribed(bot, telegram_id):
		await callback.answer("Спасибо за подписку! ✅")
		await callback.message.delete()

		name = callback.from_user.full_name or callback.from_user.first_name or "друг"
		await send_login_link(callback.message, telegram_id, name, referred_by=None)
	else:
		await callback.answer("Ты ещё не подписался 🙁", show_alert=True)


@router.message(F.text == "📖 Помощь")
async def help_button(message: Message):
	await message.answer("🆘 Помощь:\n\nЕсли возникли проблемы — напишите @dowtu.")


@router.message(F.text == "🔐 Личный кабинет")
async def profile_button(message: Message):
	telegram_id = message.from_user.id
	name = message.from_user.full_name or message.from_user.first_name or "друг"
	await send_login_link(message, telegram_id, name, referred_by=None)


@router.message(F.text == "😺 Кабинет не работает")
async def broken_profile_button(message: Message):
	await message.answer(
		"Если вы не можете зайти в личный кабинет или он работает некорректно, попробуйте:\n\n"
		"👉 попробуйте зайти в кабинет с включенным VPN\n\n"
		"👉 попробуйте открыть ссылку на кабинет в другом браузере (Длинное нажатие на ссылку - Открыть в...)\n\n"
		"👉 обновите страницу (меню браузера - Обновить ⟳)"
	)


async def main():
	if TELEGRAM_PROXY:
		logging.info("Telegram proxy: %s", TELEGRAM_PROXY)
	else:
		logging.warning(
			"TELEGRAM_PROXY не задан. Если api.telegram.org недоступен — "
			"включи VPN или пропиши прокси в Telegram_bot/.env"
		)

	# Не роняем весь main: если Telegram недоступен — пробуем снова
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