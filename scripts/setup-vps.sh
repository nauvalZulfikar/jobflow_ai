#!/bin/bash
set -e

echo "=== Setup VPS JobFlow AI ==="

# 1. Install Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 2. Install Git
apt-get update -qq && apt-get install -y git curl

# 3. Clone project
mkdir -p /opt/jobflow
cd /opt/jobflow

if [ -d ".git" ]; then
  git pull origin main
else
  echo "Clone repo dulu:"
  echo "  git clone <YOUR_REPO_URL> /opt/jobflow"
  echo "Lalu upload .env ke /opt/jobflow/.env"
  echo "Kemudian jalankan: bash scripts/deploy.sh"
  exit 0
fi

echo "=== Setup selesai! Jalankan: bash scripts/deploy.sh ==="
