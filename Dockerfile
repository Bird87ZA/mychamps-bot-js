FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev

EXPOSE 2000

ENV NODE_ENV=production

ENTRYPOINT ["sh", "./scripts/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
