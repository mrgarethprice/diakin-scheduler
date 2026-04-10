# Stage 1 — build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src    ./src

# REACT_APP_API_URL is intentionally blank:
# the frontend is served from the same origin as the API via Nginx proxy.
RUN REACT_APP_API_URL="" npm run build

# Stage 2 — serve
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
