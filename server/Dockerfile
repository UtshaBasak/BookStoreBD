# syntax=docker/dockerfile:1

# Node 20 to match .nvmrc and the engines field; Mongoose 9 and ESLint 10 both
# require >= 20.19, which any current 20.x satisfies.
FROM node:20-alpine AS base
WORKDIR /app
# NODE_ENV is deliberately not set here: it would reach the dependency stages
# and make `npm ci` skip devDependencies, so the dev image would have no
# nodemon. Each final stage sets it instead.

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
# Development: nodemon, with the source bind-mounted over /app at run time
# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run unprivileged; the node image already ships a `node` user.
USER node
EXPOSE 4000
CMD ["node", "index.js"]
