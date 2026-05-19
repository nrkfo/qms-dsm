#!/bin/bash

# Остановка скрипта при ошибке
set -e

echo "======================================"
echo "QMS-DSM Установка и Запуск"
echo "======================================"

echo "1. Установка зависимостей бэкенда..."
cd backend
npm install
cd ..

echo "2. Установка зависимостей фронтенда и сборка..."
cd frontend
npm install
npm run build
cd ..

echo "3. Настройка и запуск бэкенда (systemd)..."
sudo cp qms-backend.service /etc/systemd/system/
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
  -v $(pwd)/frontend/dist:/usr/share/nginx/html:ro \
  -v $(pwd)/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine

echo "Nginx успешно запущен в Docker!"
echo "======================================"
echo "Приложение успешно установлено и запущено!"
echo "Доступно по адресу: http://localhost или http://<IP_УСТРОЙСТВА>"
