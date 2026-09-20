# syntax=docker/dockerfile:1

# Node 24 is the Active LTS. Node 20 reached end of life in April 2026, so
# pinning to it meant building on a runtime with no security updates.
FROM node:24-alpine AS base
WORKDIR /app
# NODE_ENV is deliberately not set here: it would reach the dependency stages
# and make `npm ci` skip devDependencies, so the dev image would have no
# nodemon or TypeScript. Each final stage sets it instead.

# ---------------------------------------------------------------------------
# Dependencies, cached independently of the source
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS deps-dev
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Development: nodemon running the sources through tsx, with the source
# bind-mounted over /app at run time
# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Compile TypeScript to dist/
#
# A separate stage so the compiler and its declarations stay out of the image
# that ships: production only needs the emitted JavaScript.
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
# package.json comes along for its "type": "module", and because the app finds
# its own root by looking for it.
COPY package.json ./
COPY --from=build /app/dist ./dist

# Run unprivileged; the node image already ships a `node` user.
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
