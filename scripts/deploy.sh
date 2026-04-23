#!/bin/bash
set -e

echo "=== JobFlow AI Deploy ==="

APP_DIR="/root/projects/jobflow"
cd $APP_DIR

if [ ! -f .env ]; then
  echo "ERROR: .env tidak ditemukan di $APP_DIR"
  exit 1
fi

docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "Menunggu database siap..."
sleep 8

docker exec jobflow-api npx prisma db push --schema=/app/packages/db/prisma/schema.prisma 2>/dev/null || true

echo "=== Deploy selesai! ==="
echo "Akses di: http://$(curl -s ifconfig.me)"
