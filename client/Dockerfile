# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# Development: the Vite dev server, so hot reload works in the container
# ---------------------------------------------------------------------------
FROM base AS development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# --host binds to every interface; without it the dev server is unreachable
# from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------------------------------------------------------------------------
# Production: build the bundle, then serve it as static files
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the bundle at build time, so it must be supplied here rather than
# at run time.
# Empty means same-origin; nginx proxies the API in front of this.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
