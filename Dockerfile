FROM node:22-alpine

WORKDIR /app

COPY Backend/api/package.json Backend/api/package-lock.json ./Backend/api/

WORKDIR /app/Backend/api

RUN npm ci --omit=dev

WORKDIR /app

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "Backend/api/server.js"]