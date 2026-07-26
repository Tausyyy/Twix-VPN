from aiogram import Router
from aiogram.types import Message
from aiogram.filters import Command

from keyboards.user import support_keyboard
from database import add_user


router = Router()


@router.message(Command("start"))
async def start_handler(message: Message):

    await add_user(
        message.from_user
    )

    await message.answer(
        "🌸 <b>Добро пожаловать в Bliss VPN</b>\n\n"
        "Если у вас возникли проблемы с сервисом — "
        "нажмите кнопку поддержки.\n\n"
        "Мы поможем решить ваш вопрос ❤️",
        reply_markup=support_keyboard
    )