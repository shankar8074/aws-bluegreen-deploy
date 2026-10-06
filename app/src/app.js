'use strict';

const express = require('express');

// WHY accept `pool` as a parameter instead of importing a global db connection:
// it lets tests pass in a fake object with a `.query()` function, so route logic
// can be tested in milliseconds with no real Postgres, no Docker, no network.
function createApp(pool) {
  const app = express();
  app.use(express.json());

  // Used by the ALB target group health check in Project A. Must fail (500)
  // if the database is unreachable, so the ALB never routes traffic to a
  // colour that can't actually serve requests.
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Used by the zero-downtime demo: curl this in a loop while Jenkins switches
  // the ALB listener, and watch `color` flip from blue to green with no errors.
  app.get('/version', (_req, res) => {
    res.status(200).json({
      version: process.env.APP_VERSION || 'dev',
      color: process.env.COLOR || 'unknown',
    });
  });

  app.get('/expenses', async (_req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, description, amount, created_at FROM expenses ORDER BY id DESC'
      );
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/expenses', async (req, res) => {
    const { description, amount } = req.body || {};

    if (typeof description !== 'string' || description.trim() === '') {
      return res.status(400).json({ message: 'description is required' });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    try {
      const result = await pool.query(
        'INSERT INTO expenses (description, amount) VALUES ($1, $2) RETURNING id, description, amount, created_at',
        [description.trim(), numericAmount]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
