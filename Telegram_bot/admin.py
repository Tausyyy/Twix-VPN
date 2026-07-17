import os
import asyncio
import logging
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

load_dotenv()
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))

router = Router()


class BroadcastState(StatesGroup):
	waiting_for_broadcast_text = State()


def admins_main_menu():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="Статистика", callback_data="stats")],
			[InlineKeyboardButton(text="Рассылка", callback_data="broadcast")],
			[InlineKeyboardButton(text="Доп.Настройки", callback_data="settings")],
		]
	)


def back_menu():
	return InlineKeyboardMarkup(
		inline_keyboard=[
			[InlineKeyboardButton(text="Назад", callback_data="back")],
		]
	)


def is_admin(user_id: int) -> bool:
	return ADMIN_ID != 0 and user_id == ADMIN_ID


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

		# Telegram лимитирует отправку - небольшая пауза между сообщениями,
		# чтобы не словить flood-ограничение при большой базе пользователей.
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