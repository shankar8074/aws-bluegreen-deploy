'use strict';

const { Pool } = require('pg');

// WHY: `new Pool()` with no args reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
// from the environment automatically (a pg built-in). That means no custom env
// parsing code here, and the same code works locally (docker-compose sets these
// vars) and in prod (the EC2 compose files set them the same way).
function createPool() {
  return new Pool();
}

// WHY retry: when docker-compose starts `db` and `app` at the same time, Postgres
// usually isn't accepting connections for the first couple of seconds. Without a
// retry loop here, the app container would crash-loop until Postgres happened to
// win the race. We wait up to ~20s (10 attempts x 2s) before giving up for good.
async function initDb(pool, { attempts = 10, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS expenses (
          id SERIAL PRIMARY KEY,
          description TEXT NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      return;
    } catch (err) {
      const isLastAttempt = attempt === attempts;
      console.error(`[db] init attempt ${attempt}/${attempts} failed: ${err.message}`);
      if (isLastAttempt) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { createPool, initDb };
