# Twix / Tailwind practice — быстрый запуск
# Windows: можно писать `make up` (есть make.cmd) или `npm start`

.PHONY: help install up server front bot db-clean migrate stop go-server go-build

help:
	@echo.
	@echo  Commands:
	@echo    make install   - npm i + pip deps for bot
	@echo    make up        - API + Vite + bot + go together
	@echo    make up-web    - only API + Vite + go (without bot)
	@echo    make server    - only Express :3000
	@echo    make front     - only Vite :5173
	@echo    make bot       - only Telegram bot
	@echo    make go-server - only Go server (webtest) :8080
	@echo    make go-build  - build Go server binary (webtest)
	@echo    make stop      - kill lingering processes on used ports
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

go-server:
	cd webtest && go run main.go

go-build:
	cd webtest && go build -o twix-vpn.exe main.go

stop:
	npm run free-ports

db-clean:
	npm run db:clean

migrate:
	npm run migrate