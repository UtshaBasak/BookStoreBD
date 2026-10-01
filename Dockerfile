# syntax=docker/dockerfile:1

# BookStoreBD as one image: the API serving the built site from the same
# origin, exactly as the live deployment runs. Published to GitHub Packages
# as ghcr.io/utshabasak/bookstorebd.
#
#   docker run -p 4000:4000 \
#     -e MONGO="mongodb+srv://..." -e JWT_SECRET="$(openssl rand -hex 48)" \
#     ghcr.io/utshabasak/bookstorebd
#
# The image holds no configuration of its own: the database, secrets and
# integrations are supplied at run time (see server/.env.example).

ARG NODE_VERSION=24

# ---------------------------------------------------------------- client build
FROM node:${NODE_VERSION}-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# The client compiles against the API's shared type declarations.
COPY server/shared/ /app/server/shared/
RUN npm run build

# ---------------------------------------------------------------- server build
FROM node:${NODE_VERSION}-alpine AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---------------------------------------------------------- runtime packages
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# --------------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-alpine
LABEL org.opencontainers.image.title="BookStoreBD" \
      org.opencontainers.image.description="A marketplace for new and second-hand books in Bangladesh: React, Express and MongoDB." \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PORT=4000
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY --from=server /app/server/dist ./dist
COPY --from=client /app/client/dist /app/client/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
