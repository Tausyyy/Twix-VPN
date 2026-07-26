from aiogram import Router, F
from aiogram.types import Message
from aiogram.filters import Command

from config import config

from database import (
    get_user_by_admin_message,
    save_message,
    close_ticket,
    ban_user,
    unban_user,
    get_history,
    get_user
)


router = Router()



# =========================
# Ответ через Reply
# =========================

@router.message(
    F.reply_to_message,
    F.text,
    ~F.text.startswith("/")
)
async def admin_reply(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    ticket = await get_user_by_admin_message(
        message.reply_to_message.message_id
    )


    if not ticket:
        return


    await message.bot.send_message(
        ticket["user_id"],
        (
            "💬 <b>Ответ поддержки Bliss VPN</b>\n\n"
            f"{message.text}"
        )
    )


    await save_message(
        ticket_id=ticket["ticket_id"],
        sender="admin",
        text=message.text
    )


    await message.answer(
        "✅ Ответ отправлен."
    )



# =========================
# CLOSE
# =========================

@router.message(Command("close"))
async def close_handler(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    if not message.reply_to_message:
        await message.answer(
            "Ответь /close на сообщение тикета."
        )
        return


    ticket = await get_user_by_admin_message(
        message.reply_to_message.message_id
    )


    if not ticket:
        await message.answer(
            "❌ Тикет не найден."
        )
        return



    await close_ticket(
        ticket["ticket_id"]
    )


    await message.bot.send_message(
        ticket["user_id"],
        "✅ Ваш тикет закрыт.\n\nСпасибо за обращение ❤️"
    )


    await message.answer(
        "✅ Тикет закрыт."
    )



# =========================
# INFO
# =========================

@router.message(Command("info"))
async def info_handler(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    if not message.reply_to_message:
        await message.answer(
            "Ответь /info на сообщение тикета."
        )
        return


    ticket = await get_user_by_admin_message(
        message.reply_to_message.message_id
    )


    if not ticket:
        return


    user = await get_user(
        ticket["user_id"]
    )


    if not user:
        return


    await message.answer(
        "👤 <b>Информация</b>\n\n"
        f"ID: <code>{user[0]}</code>\n"
        f"Имя: {user[2]}\n"
        f"Username: @{user[1]}\n\n"
        f"Бан: {'Да' if user[3] else 'Нет'}\n"
        f"Дата: {user[4]}"
    )



# =========================
# BAN
# =========================

@router.message(Command("ban"))
async def ban_handler(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    if not message.reply_to_message:
        await message.answer(
            "Ответь /ban на тикет."
        )
        return


    ticket = await get_user_by_admin_message(
        message.reply_to_message.message_id
    )


    if not ticket:
        return


    await ban_user(
        ticket["user_id"]
    )


    await message.answer(
        "🚫 Пользователь заблокирован."
    )



# =========================
# UNBAN
# =========================

@router.message(Command("unban"))
async def unban_handler(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    args = message.text.split()


    if len(args) < 2:

        await message.answer(
            "Использование:\n"
            "/unban telegram_id"
        )

        return


    await unban_user(
        int(args[1])
    )


    await message.answer(
        "✅ Пользователь разблокирован."
    )



# =========================
# HISTORY
# =========================

@router.message(Command("history"))
async def history_handler(message: Message):

    if message.from_user.id != config.ADMIN_ID:
        return


    if not message.reply_to_message:
        await message.answer(
            "Ответь /history на тикет."
        )
        return


    ticket = await get_user_by_admin_message(
        message.reply_to_message.message_id
    )


    if not ticket:
        return


    history = await get_history(
        ticket["user_id"]
    )


    text = "📜 <b>История</b>\n\n"


    for item in history[-10:]:

        text += (
            f"<b>{item[0]}</b>\n"
            f"{item[1]}\n\n"
        )


    await message.answer(
        text
    )