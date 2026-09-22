# Xzy Panel

Docker-backed Minecraft panel prototype with a small Node.js API.

## VPS requirements

- Docker Engine and Docker Compose plugin
- A VPS firewall rule allowing TCP `8080`
- DNS/reverse proxy recommended for public access

## Run

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
