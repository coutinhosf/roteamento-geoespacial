# ─── Stage 1: build do React ─────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: servir os estáticos com Nginx ──────────────────────────────────
FROM nginx:alpine

# Config do Nginx (SPA + proxy /api → backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Estáticos compilados
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
