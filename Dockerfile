FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]

EXPOSE 2000
