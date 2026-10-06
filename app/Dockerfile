# syntax=docker/dockerfile:1

# --- Stage 1: install only production dependencies -------------------------
# WHY a separate stage: the final image never needs npm's cache or dev tooling,
# just the resulting node_modules folder. Keeps the shipped image smaller.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- Stage 2: the actual runtime image --------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# WHY non-root: if the app is ever compromised, it can't write outside its own
# files or bind privileged ports. node:20-alpine already ships a `node` user
# (uid 1000) for exactly this, so we don't need to create one ourselves.
USER node

EXPOSE 3000

# WHY a HEALTHCHECK: Docker (and `docker compose ps`) can report "unhealthy"
# before the ALB ever gets involved, which makes local debugging much faster.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
