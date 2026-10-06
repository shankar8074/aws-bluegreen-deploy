'use strict';

const { createApp } = require('./app');
const { createPool, initDb } = require('./db');

const PORT = process.env.PORT || 3000;

async function main() {
  const pool = createPool();
  await initDb(pool);

  const app = createApp(pool);
  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (color=${process.env.COLOR || 'unknown'})`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
