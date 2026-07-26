from aiogram import Router, F
from aiogram.types import (
    Message,
    CallbackQuery
)

from aiogram.fsm.context import FSMContext

from states import SupportState
from keyboards.user import support_keyboard

from config import config

from database import (
    add_user,
    is_banned,
    get_open_ticket,
    create_ticket,
    save_message
)


router = Router()


# =========================
# Кнопка поддержки
# =========================

@router.message(F.text == "🆘 Поддержка")
async def support_start(
    message: Message,
    state: FSMContext
):

    await add_user(message.from_user)


    if await is_banned(message.from_user.id):

        await message.answer(
            "🚫 Доступ к поддержке ограничен."
        )

        return


    ticket = await get_open_ticket(
        message.from_user.id
    )


    if ticket:

        await message.answer(
            "⚠️ У вас уже есть открытое обращение.\n\n"
            "Ожидайте ответа поддержки."
        )

        return



    await create_ticket(
        message.from_user.id
    )


    await state.set_state(
        SupportState.waiting_message
    )


    await message.answer(
        "🆘 <b>Поддержка Bliss VPN</b>\n\n"
        "Опишите вашу проблему.\n\n"
        "Можно отправить:\n"
        "• текст\n"
        "• фото\n"
        "• видео\n"
        "• файл\n\n"
        "Мы ответим как можно быстрее.",
        parse_mode="HTML"
    )



# =========================
# Получение сообщения
# =========================

@router.message(
    SupportState.waiting_message
)
async def receive_ticket(
    message: Message,
    state: FSMContext
):


    ticket_id = await get_open_ticket(
        message.from_user.id
    )


    if not ticket_id:

        ticket_id = await create_ticket(
            message.from_user.id
        )



    # Отправляем админу

    admin_text = (
        "━━━━━━━━━━━━━━\n"
        "📩 <b>Новый тикет Bliss VPN</b>\n\n"
        f"👤 {message.from_user.full_name}\n"
        f"🆔 <code>{message.from_user.id}</code>\n"
    )


    if message.from_user.username:

        admin_text += (
            f"📎 @{message.from_user.username}\n"
        )


    admin_text += (
        f"\n🎫 Тикет #{ticket_id}\n"
        "━━━━━━━━━━━━━━"
    )



    admin_message = await message.bot.send_message(
        config.ADMIN_ID,
        admin_text,
        parse_mode="HTML"
    )


    # отправляем само сообщение пользователя

    copied = await message.copy_to(
        config.ADMIN_ID,
        reply_to_message_id=admin_message.message_id
    )


    await save_message(
        ticket_id=ticket_id,
        sender="user",
        text=message.text or "[медиа]",
        user_message_id=message.message_id,
        admin_message_id=copied.message_id
    )



    await message.answer(
        "✅ Сообщение отправлено.\n\n"
        "Оператор ответит вам в ближайшее время."
    )


    await state.clear()