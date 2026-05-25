#!/bin/bash

# Прерывать выполнение при любой ошибке
set -e

echo "🚀 Начинаем автоматический деплой QMS-DSM..."

# Укажите абсолютный путь до рабочей директории проекта на целевом сервере
# Если проект лежит в другом месте (например, /var/www/qms-dsm), измените путь.
PROJECT_DIR="/home/nur/Рабочий стол/qms-dsm"

echo "📂 Переход в рабочую директорию: $PROJECT_DIR"
cd "$PROJECT_DIR"

echo "📥 Получаем последние изменения из ветки main..."
git fetch origin main
git reset --hard origin/main
# Альтернативно можно просто git pull origin main, но reset --hard надежнее

echo "📦 Обновляем зависимости и собираем Frontend..."
cd frontend
npm install
npm run build
cd ..

echo "⚙️ Устанавливаем зависимости Backend..."
cd backend
npm install
# Если backend требует сборки TypeScript, раскомментируйте следующую строку:
# npm run build
cd ..

echo "🔄 Перезапускаем службу backend (qms-backend.service)..."
sudo systemctl restart qms-backend.service

echo "🌐 Перезагружаем конфигурацию Nginx..."
sudo systemctl reload nginx

echo "✅ Деплой успешно завершен!"
