'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

// WHY a fake pool instead of a real Postgres connection: these tests check
// route logic (status codes, validation, response shape), not Postgres itself.
// A fake keeps the whole suite running in milliseconds with no Docker needed,
// so `npm test` works the same on a laptop or in a future CI step.
function makeFakePool(queryImpl) {
  return { query: queryImpl };
}

// Starts the app on a random free port (port 0) and returns its base URL plus
// a close() function, so each test gets an isolated server instance.
async function startTestServer(pool) {
  const app = createApp(pool);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('GET /version returns APP_VERSION and COLOR from env', async () => {
  process.env.APP_VERSION = '1.2.3';
  process.env.COLOR = 'blue';
  const { baseUrl, close } = await startTestServer(makeFakePool(async () => ({ rows: [] })));
  try {
    const res = await fetch(`${baseUrl}/version`);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { version: '1.2.3', color: 'blue' });
  } finally {
    await close();
    delete process.env.APP_VERSION;
    delete process.env.COLOR;
  }
});

test('GET /health returns 200 when the database is reachable', async () => {
  const pool = makeFakePool(async () => ({ rows: [{ '?column?': 1 }] }));
  const { baseUrl, close } = await startTestServer(pool);
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    await close();
  }
});

test('GET /health returns 500 when the database is unreachable', async () => {
  const pool = makeFakePool(async () => {
    throw new Error('connection refused');
  });
  const { baseUrl, close } = await startTestServer(pool);
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.status, 'error');
  } finally {
    await close();
  }
});

test('POST /expenses rejects a missing description with 400', async () => {
  const { baseUrl, close } = await startTestServer(makeFakePool(async () => ({ rows: [] })));
  try {
    const res = await fetch(`${baseUrl}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 10 }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test('POST /expenses rejects a non-positive amount with 400', async () => {
  const { baseUrl, close } = await startTestServer(makeFakePool(async () => ({ rows: [] })));
  try {
    const res = await fetch(`${baseUrl}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'coffee', amount: -5 }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test('POST /expenses inserts a valid expense and returns 201', async () => {
  const fakeRow = { id: 1, description: 'coffee', amount: '4.50', created_at: '2026-01-01T00:00:00.000Z' };
  const pool = makeFakePool(async (sql) => {
    assert.match(sql, /INSERT INTO expenses/);
    return { rows: [fakeRow] };
  });
  const { baseUrl, close } = await startTestServer(pool);
  try {
    const res = await fetch(`${baseUrl}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'coffee', amount: 4.5 }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), fakeRow);
  } finally {
    await close();
  }
});

test('GET /expenses returns the list from the database', async () => {
  const fakeRows = [{ id: 2, description: 'lunch', amount: '12.00', created_at: '2026-01-01T00:00:00.000Z' }];
  const pool = makeFakePool(async (sql) => {
    assert.match(sql, /SELECT id, description, amount, created_at FROM expenses/);
    return { rows: fakeRows };
  });
  const { baseUrl, close } = await startTestServer(pool);
  try {
    const res = await fetch(`${baseUrl}/expenses`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), fakeRows);
  } finally {
    await close();
  }
});
