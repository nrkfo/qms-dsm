#!/bin/bash

# Остановка скрипта при ошибке
set -e

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
systemctl restart qms-backend

echo "5. Перезапуск Nginx (Docker)..."
docker restart qms-nginx

echo "======================================"
echo "Обновление успешно завершено!"
