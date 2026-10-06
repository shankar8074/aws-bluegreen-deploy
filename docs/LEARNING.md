# Learning Log — Project A (Blue-Green Deployment)

## Step A1 — App + Dockerfile + local Docker Compose + tests

### What we built
- A tiny Express + Postgres "expense tracker" API in `app/`:
  - `GET /health` — queries Postgres (`SELECT 1`); returns 500 if the DB is unreachable.
  - `GET /version` — returns `{ version, color }` from the `APP_VERSION` / `COLOR` env vars.
  - `GET /expenses` / `POST /expenses` — list and create expenses in a `expenses` table.
- `src/db.js` creates the Postgres pool from standard `PG*` env vars and creates the
  `expenses` table on startup, retrying up to 10 times (2s apart) in case Postgres isn't
  ready yet.
- `src/app.js` builds the Express app via `createApp(pool)` — the DB pool is passed in
  rather than imported globally, so tests can substitute a fake pool.
- `test/app.test.js` — 7 tests using Node's built-in test runner (`node:test`) and a fake
  pool object. No Docker or real Postgres needed to run them.
- `Dockerfile` — multi-stage build on `node:20-alpine`: stage 1 installs prod dependencies,
  stage 2 copies only `node_modules` + `src` into the final image, runs as the non-root
  `node` user, and defines a `HEALTHCHECK` hitting `/health`.
- `docker-compose.yml` (repo root) — runs one Postgres container + one app container for
  local development only. Production (on the EC2 app server) instead runs two app
  containers (blue/green) against one shared Postgres, using the files in `deploy/` — that
  comes later in A6.

### Why
Everything downstream (Terraform, Jenkins, the blue-green switch) assumes this app already
runs and is already containerized. Building and proving it locally first means later steps
only have to debug *infrastructure*, not a mix of infrastructure and app bugs. `/health` and
`/version` specifically exist because the ALB target group (A4) will poll `/health`, and the
zero-downtime demo (A7) will poll `/version` in a loop to prove traffic didn't drop during a
colour switch.

### How it works
- `new Pool()` (no arguments) in `pg` reads `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
  from the environment automatically — no custom config-parsing code needed, and the same
  code works unchanged locally and in prod, since both set those same env var names.
- Dependency injection (`createApp(pool)`) is the reason the test suite doesn't need Docker:
  tests pass a fake object with a `.query()` function instead of a real database connection.
- The Dockerfile's two stages mean the shipped image only contains production
  `node_modules` and app source — no dev dependencies, no npm cache, smaller attack surface
  from running as a non-root user.

### Commands to verify it works
```bash
# Unit tests (no Docker required)
cd app
npm install
npm test            # expect: 7 passing

# Full stack locally (Docker required)
cd ..
docker compose up -d --build
curl http://localhost:3000/version    # {"version":"local-dev","color":"local"}
curl http://localhost:3000/health     # {"status":"ok"}
curl -X POST http://localhost:3000/expenses \
  -H "Content-Type: application/json" \
  -d '{"description":"coffee","amount":4.5}'
curl http://localhost:3000/expenses
docker compose down -v   # tear down + remove the Postgres volume
```

### Interview questions
**Q: Why does `createApp` take the database pool as a parameter instead of importing it directly?**
A: It's dependency injection — it decouples the route logic from a real database connection.
Tests can hand in a fake pool and verify status codes and validation in milliseconds, with no
Docker, no network calls, and no flaky shared test database.

**Q: Why retry the database connection on startup instead of just connecting once?**
A: In both Docker Compose and in production, the app container and the database container
start at roughly the same time. Postgres takes a couple of seconds to accept connections, so
without a retry loop the app would crash on its very first request and rely on a container
restart policy to eventually get lucky. Retrying for ~20 seconds handles that race cleanly.

**Q: Why multi-stage Docker build instead of one `FROM node:20-alpine` with everything in it?**
A: The first stage only exists to run `npm ci`; its build cache and any dev dependencies
never end up in the final image because stage 2 copies over just `node_modules` and `src`.
Smaller image, faster pulls, and a smaller surface for a container escape to do damage with
root-equivalent npm/dev tooling, on top of running as the non-root `node` user.
