from aiogram.types import (
    ReplyKeyboardMarkup,
    KeyboardButton
)


support_keyboard = ReplyKeyboardMarkup(
    keyboard=[
        [
            KeyboardButton(
                text="🆘 Поддержка"
            )
        ]
    ],
    resize_keyboard=True
)