#!/bin/bash

# Остановка скрипта при ошибке
set -e

echo "======================================"
echo "QMS Установка и Запуск"
echo "======================================"

echo "0. Проверка системных зависимостей (Node.js, npm, Docker)..."
# Проверка npm и node
if ! command -v npm &> /dev/null || ! command -v node &> /dev/null; then
    echo "⚠️ npm или node не найдены. Выполняется автоматическая установка..."
    sudo apt-get update
    sudo apt-get install -y nodejs npm
fi

# Проверка docker
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker не найден. Выполняется автоматическая установка..."
    sudo apt-get update
    sudo apt-get install -y docker.io
    sudo systemctl enable docker
    sudo systemctl start docker
fi

echo "Системные зависимости готовы."
echo "--------------------------------------"

echo "1. Установка зависимостей бэкенда..."
cd backend
rm -rf node_modules
npm install
cd ..

echo "2. Установка зависимостей фронтенда и сборка..."
cd frontend
rm -rf node_modules
npm install
npm run build
cd ..

echo "3. Настройка и запуск бэкенда (systemd)..."
# Генерируем файл сервиса динамически, чтобы он работал на ЛЮБОМ компьютере с правильными путями и пользователем
CURRENT_USER=$(whoami)
CURRENT_DIR=$(pwd)

cat <<EOF | sudo tee /etc/systemd/system/qms-backend.service > /dev/null
[Unit]
Description=QMS Backend Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${CURRENT_DIR}/backend
ExecStart=/usr/bin/npm run dev
Restart=always
Environment=NODE_ENV=production
StandardOutput=append:${CURRENT_DIR}/backend.log
StandardError=append:${CURRENT_DIR}/backend.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable qms-backend
sudo systemctl restart qms-backend
echo "Бэкенд успешно запущен!"

echo "4. Настройка автозапуска Nginx (Docker)..."
# Останавливаем старый контейнер, если он есть
sudo docker rm -f qms-nginx 2>/dev/null || true

# Запускаем Nginx в Docker
sudo docker run -d \
  --name qms-nginx \
  --restart always \
  -p 80:80 \
  --add-host host.docker.internal:host-gateway \
  -v ${CURRENT_DIR}/frontend/dist:/usr/share/nginx/html:ro \
  -v ${CURRENT_DIR}/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine

echo "Nginx успешно запущен в Docker!"
echo "======================================"
echo "Приложение успешно установлено и запущено!"
echo "Доступно по адресу: http://localhost или http://<IP_УСТРОЙСТВА>"
