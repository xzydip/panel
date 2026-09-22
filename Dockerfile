FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package.json server.js index.html login.html panel.html server-console.html ./
EXPOSE 8080
CMD ["node", "server.js"]
