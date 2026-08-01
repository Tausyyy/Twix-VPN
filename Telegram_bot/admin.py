import os
import asyncio
import logging
from pathlib import Path

import aiohttp
from aiogram import Router, F, Bot
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command
from aiogram.types import (
	InlineKeyboardButton,
	InlineKeyboardMarkup,
	CallbackQuery,
	Message,
)
from dotenv import load_dotenv

from db import get_all_telegram_ids, get_stats

load_dotenv(Path(__file__).resolve().parent / ".env")
ADMIN_IDS = {
	int(x) for x in os.getenv("ADMINS", "").replace(",", " ").split()
}
API_URL = os.environ.get("API_URL", "http://127.0.0.1:3000").rstrip("/")
BOT_API_SECRET = os.environ["BOT_API_SECRET"]

router = Router()


class BroadcastState(StatesGroup):
	waiting_for_broadcast_text = State()


class VipUsersState(StatesGroup):
	waiting_for_ids_text = State()


class BalanceState(StatesGroup):
	waiting_for_balance_input = State()


def admins_main_menu():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="Статистика", callback_data="stats")],
			[InlineKeyboardButton(text="Рассылка", callback_data="broadcast")],
			[InlineKeyboardButton(text="Доп.Настройки", callback_data="settings")],
		]
	)


def settings_menu():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="VIP-пользователи", callback_data="vip_users")],
			[InlineKeyboardButton(text="Выдать баланс", callback_data="give_balance")],
			[InlineKeyboardButton(text="Назад", callback_data="back")],
		]
	)


def back_menu():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="Назад", callback_data="back")],
		]
	)


def is_admin(user_id: int) -> bool:
	return user_id in ADMIN_IDS


@router.message(Command("admin"))
async def admin_panel(message: Message):
	if not is_admin(message.from_user.id):
		await message.answer("У вас нет прав на эту команду")
		return
	await message.answer(
		"Добро пожаловать в админ панель", reply_markup=admins_main_menu()
	)


@router.callback_query(F.data == "back")
async def back_to_main(callback: CallbackQuery, state: FSMContext):
	await state.clear()
	await callback.message.edit_text(
		"Админ панель: Выберите действие", reply_markup=admins_main_menu()
	)
	await callback.answer()


@router.callback_query(F.data == "stats")
async def process_stats(callback: CallbackQuery):
	if not is_admin(callback.from_user.id):
		await callback.answer("Нет прав", show_alert=True)
		return

	data = get_stats()
	text = (
		"📊 Статистика:\n\n"
		f"Всего пользователей: {data['total']}\n"
		f"Пришли из Telegram: {data['with_telegram']}\n"
		f"Есть VPN-ссылка: {data['with_link']}"
	)
	await callback.message.edit_text(text, reply_markup=back_menu())
	await callback.answer()


@router.callback_query(F.data == "broadcast")
async def process_broadcast(callback: CallbackQuery, state: FSMContext):
	if not is_admin(callback.from_user.id):
		await callback.answer("Нет прав", show_alert=True)
		return

	await callback.message.edit_text(
		"Отправьте текст для рассылки:", reply_markup=back_menu()
	)
	await state.set_state(BroadcastState.waiting_for_broadcast_text)
	await callback.answer()


@router.message(BroadcastState.waiting_for_broadcast_text)
async def receive_broadcast_text(message: Message, state: FSMContext, bot: Bot):
	if not is_admin(message.from_user.id):
		return

	await state.clear()
	text = message.text

	if not text:
		await message.answer(
			"Нужен именно текст для рассылки, попробуй ещё раз через /admin"
		)
		return

	telegram_ids = get_all_telegram_ids()
	if not telegram_ids:
		await message.answer("В базе нет ни одного пользователя с telegram_id.")
		return

	sent = 0
	failed = 0
	status_msg = await message.answer(f"Рассылка запущена: 0/{len(telegram_ids)}")

	for i, telegram_id in enumerate(telegram_ids, start=1):
		try:
			await bot.send_message(telegram_id, text)
			sent += 1
		except Exception:
			logging.exception("Не удалось отправить сообщение %s", telegram_id)
			failed += 1

		await asyncio.sleep(0.05)

		if i % 20 == 0 or i == len(telegram_ids):
			try:
				await status_msg.edit_text(f"Рассылка идёт: {i}/{len(telegram_ids)}")
			except Exception:
				pass

	await message.answer(
		f"Готово. Отправлено: {sent}, не доставлено: {failed}.",
		reply_markup=admins_main_menu(),
	)


@router.callback_query(F.data == "settings")
async def process_settings(callback: CallbackQuery):
	if not is_admin(callback.from_user.id):
		await callback.answer("Нет прав", show_alert=True)
		return
	await callback.message.edit_text("Доп.Настройки:", reply_markup=settings_menu())
	await callback.answer()


@router.callback_query(F.data == "vip_users")
async def process_vip_users(callback: CallbackQuery, state: FSMContext):
	if not is_admin(callback.from_user.id):
		await callback.answer("Нет прав", show_alert=True)
		return

	async with aiohttp.ClientSession() as http:
		async with http.get(
			f"{API_URL}/api/bot/vip",
			headers={"x-bot-secret": BOT_API_SECRET},
			timeout=aiohttp.ClientTimeout(total=5),
		) as resp:
			data = await resp.json()

	ids = data.get("telegram_ids", [])
	ids_text = ", ".join(str(i) for i in ids) if ids else "пусто"

	await callback.message.edit_text(
		f"Telegram ID с бесплатным доступом (VIP):\n{ids_text}\n\n"
		f"Пришлите ID через пробел/запятую, чтобы добавить.\n"
		f"Чтобы удалить — с минусом, например: -5 -12",
		reply_markup=back_menu(),
	)
	await state.set_state(VipUsersState.waiting_for_ids_text)
	await callback.answer()


@router.message(VipUsersState.waiting_for_ids_text)
async def receive_vip_user_ids(message: Message, state: FSMContext):
	if not is_admin(message.from_user.id):
		return

	raw = (message.text or "").replace(",", " ").split()
	to_add, to_remove = [], []

	for token in raw:
		token = token.strip()
		if token.startswith("-") and token[1:].isdigit():
			to_remove.append(int(token[1:]))
		elif token.isdigit():
			to_add.append(int(token))

	if not to_add and not to_remove:
		await message.answer("Не нашёл ни одного ID. Попробуй ещё раз через /admin")
		await state.clear()
		return

	async with aiohttp.ClientSession() as http:
		if to_add:
			await http.post(
				f"{API_URL}/api/bot/vip",
				json={"telegram_ids": to_add},
				headers={"x-bot-secret": BOT_API_SECRET},
			)
		if to_remove:
			await http.post(
				f"{API_URL}/api/bot/vip/remove",
				json={"telegram_ids": to_remove},
				headers={"x-bot-secret": BOT_API_SECRET},
			)

		async with http.get(
			f"{API_URL}/api/bot/vip",
			headers={"x-bot-secret": BOT_API_SECRET},
		) as resp:
			data = await resp.json()

	await state.clear()
	ids = data.get("telegram_ids", [])
	ids_text = ", ".join(str(i) for i in ids) if ids else "пусто"

	await message.answer(
		f"Готово.\nДобавлено: {to_add or '—'}\nУдалено: {to_remove or '—'}\n\n"
		f"Текущий список: {ids_text}",
		reply_markup=admins_main_menu(),
	)


@router.callback_query(F.data == "give_balance")
async def process_give_balance(callback: CallbackQuery, state: FSMContext):
	if not is_admin(callback.from_user.id):
		await callback.answer("Нет прав", show_alert=True)
		return

	await callback.message.edit_text(
		"Пришли telegram_id и сумму через пробел.\n\n"
		"Например: 123456789 100 — начислить 100₽\n"
		"Или: 123456789 -50 — списать 50₽",
		reply_markup=back_menu(),
	)

	await state.set_state(BalanceState.waiting_for_balance_input)
	await callback.answer()


@router.message(BalanceState.waiting_for_balance_input)
async def receive_balance_input(message: Message, state: FSMContext):
	if not is_admin(message.from_user.id):
		return

	parts = (message.text or "").split()

	if len(parts) != 2 or not parts[0].isdigit():
		await message.answer(
			"Неверный формат. Нужно: telegram_id сумма, например: 123456789 100"
		)
		return

	telegram_id = int(parts[0])
	try:
		amount = int(parts[1])
	except ValueError:
		await message.answer("Сумма должна быть целым числом (можно отрицательным).")
		return

	async with aiohttp.ClientSession() as http:
		async with http.post(
			f"{API_URL}/api/bot/balance",
			json={"telegram_id": telegram_id, "amount": amount},
			headers={"x-bot-secret": BOT_API_SECRET},
			timeout=aiohttp.ClientTimeout(total=5),
		) as resp:
			data = await resp.json()

	await state.clear()

	if resp.status != 200:
		await message.answer(
			f"Ошибка: {data.get('error', 'неизвестная ошибка')}",
			reply_markup=admins_main_menu(),
		)
		return

	await message.answer(
		f"Готово. Баланс пользователя {telegram_id}: {data['balance']}₽",
		reply_markup=admins_main_menu(),
	)