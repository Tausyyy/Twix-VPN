# Twix / Tailwind practice — быстрый запуск
# Windows: можно писать `make up` (есть make.cmd) или `npm start`

.PHONY: help install up server front bot db-clean migrate stop

help:
	@echo.
	@echo  Commands:
	@echo    make install   - npm i + pip deps for bot
	@echo    make up        - API + Vite + bot together
	@echo    make up-web    - only API + Vite (without bot)
	@echo    make server    - only Express :3000
	@echo    make front     - only Vite :5173
	@echo    make bot       - only Telegram bot
	@echo    make db-clean  - remove junk users/tokens
	@echo    make migrate   - DB migration (one-time)
	@echo.

install:
	npm install
	.\.venv\Scripts\python.exe -m pip install -r Telegram_bot\requirements.txt

up:
	npm start

up-web:
	npm run start:web

server:
	npm run server

front:
	npm run front

bot:
	npm run bot

db-clean:
	npm run db:clean

migrate:
	npm run migrate
