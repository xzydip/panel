# Xzy Panel

Docker-backed Minecraft panel prototype with a small Node.js API.

## VPS requirements

- Docker Engine and Docker Compose plugin
- A VPS firewall rule allowing TCP `8080`
- DNS/reverse proxy recommended for public access

## Automated VPS install

On a fresh Ubuntu/Debian VPS, run:

```bash
curl -fsSL https://raw.githubusercontent.com/xzydip/panel/main/install.sh -o /tmp/xzy-install.sh
sudo bash /tmp/xzy-install.sh https://github.com/xzydip/panel.git
```
curl -fsSL https://raw.githubusercontent.com/xzydip/panel/main/install.sh | sudo bash -s -- https://github.com/xzydip/panel.git


The installer installs Docker, clones or updates `xzydip/panel`, opens TCP `8080`, and starts the panel.

## Run manually

```bash
docker compose up -d --build
```

Open `http://SERVER_IP:8080/login.html`.

The panel API is served from the same port. Creating a server calls Docker and starts a container from `itzg/minecraft-server:java21`. The selected allocation port is mapped to Minecraft container port `25565`.

## Stop and logs

```bash
docker compose logs -f xzy-panel
docker compose down
```

The panel state is stored in the Docker volume `xzy-panel-data`. Do not commit runtime state or credentials to GitHub.

## Important

This project is a prototype. Before exposing it publicly, add authentication and authorization to the API, HTTPS, rate limiting, and secure password hashing. The current browser login uses local storage and is not production-grade authentication.
