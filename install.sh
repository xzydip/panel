#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${1:-}"
INSTALL_DIR="${2:-/opt/xzy-panel}"
PANEL_PORT="${PANEL_PORT:-8080}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash install.sh <github-repo-url> [install-dir]"
  exit 1
fi

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: sudo bash install.sh https://github.com/USER/REPO.git [/opt/xzy-panel]"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is missing. Install Docker Compose v2 and rerun this installer."
  exit 1
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
mkdir -p data

grep -q '^PANEL_PORT=' .env 2>/dev/null || echo "PANEL_PORT=$PANEL_PORT" >> .env

docker compose up -d --build

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow "$PANEL_PORT/tcp" >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

SERVER_IP="$(curl -4 -fsS https://ifconfig.me || hostname -I | awk '{print $1}')"
echo
echo "Xzy Panel installed successfully."
echo "URL: http://${SERVER_IP}:${PANEL_PORT}/"
echo "Logs: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f xzy-panel"
echo "Update: sudo bash ${INSTALL_DIR}/install.sh ${REPO_URL} ${INSTALL_DIR}"
