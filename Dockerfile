FROM node:24.22.3-alpine AS builder

RUN npm install -g npm@12.2.2

WORKDIR /app

COPY package*.json .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --ignore-scripts

COPY tsconfig.json tsconfig.docker.json ./
COPY src ./src
RUN npx tsc --project tsconfig.docker.json

FROM node:24.22.3-alpine

RUN npm install -g npm@12.2.2

WORKDIR /app

COPY package*.json .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
