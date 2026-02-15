FROM node:20-slim

WORKDIR /app

# Copiar dependencias
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx ws dotenv openai

# Copiar código del WS server y sus dependencias
COPY tsconfig.json ./
COPY ws-server.ts ./
COPY src/ ./src/

EXPOSE 8080

CMD ["npx", "tsx", "ws-server.ts"]
