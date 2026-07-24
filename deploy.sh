#!/bin/bash
set -e

echo "→ Обновляю код из репозитория..."
cd ~/blissvpn.vu/public_html
git pull

echo "→ Пересобираю фронтенд..."
npm install
npm run build

echo "→ Обновляю зависимости backend..."
cd backend
npm install

echo "→ Перезапускаю Passenger..."
touch tmp/restart.txt

echo "✓ Деплой завершён"
