import asyncio

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode


from config import config
from database import init_db


from handlers import start
from handlers import user
from handlers import admin



async def main():

    # создаём таблицы
    await init_db()


    bot = Bot(
        token=config.BOT_TOKEN,
        default=DefaultBotProperties(
            parse_mode=ParseMode.HTML
        )
    )


    dp = Dispatcher()



    # подключаем роутеры

    dp.include_router(
        start.router
    )

    dp.include_router(
        user.router
    )

    dp.include_router(
        admin.router
    )


    print(
        "🔥 Bliss VPN Support Bot запущен"
    )


    await dp.start_polling(
        bot
    )



if __name__ == "__main__":

    asyncio.run(
        main()
    )