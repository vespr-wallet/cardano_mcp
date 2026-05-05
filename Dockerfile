FROM node:22.22.0-alpine AS builder

RUN npm install -g npm@11.7.0

WORKDIR /app

COPY package*.json .npmrc ./
ARG NPM_TOKEN
RUN npm ci --ignore-scripts && rm -f .npmrc

COPY tsconfig.json tsconfig.docker.json ./
COPY src ./src
RUN npx tsc --project tsconfig.docker.json

FROM node:22.22.0-alpine

RUN npm install -g npm@11.7.0

WORKDIR /app

COPY package*.json .npmrc ./
ARG NPM_TOKEN
RUN npm ci --omit=dev --ignore-scripts && rm -f .npmrc

COPY --from=builder /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
