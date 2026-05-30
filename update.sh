#!/bin/bash

# Остановка скрипта при ошибке
set -e

# Читаем пароль из stdin (передан из Node.js)
read -r PASSWORD

echo "======================================"
echo "QMS Обновление Системы"
echo "======================================"

cd "/home/nur/Рабочий стол/qms-dsm"

echo "1. Загрузка обновлений с GitHub..."
git pull

echo "2. Установка зависимостей бэкенда..."
cd backend
npm install
cd ..

echo "3. Установка зависимостей фронтенда и сборка..."
cd frontend
npm install
npm run build
cd ..

echo "4. Перезапуск бэкенда (systemd)..."
echo "$PASSWORD" | sudo -S systemctl restart qms-backend

echo "5. Перезапуск Nginx (Docker)..."
echo "$PASSWORD" | sudo -S docker restart qms-nginx

echo "======================================"
echo "Обновление успешно завершено!"
