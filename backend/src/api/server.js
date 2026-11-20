const express = require('express');
const { Pool } = require('pg');
const { createRequestsRouter } = require('./requests/router');
const { createStore } = require('./requests/store');
const { startOutboxPublisher } = require('../messaging/outbox');

for (const name of ['DATABASE_URL', 'RABBITMQ_URL']) {
  if (!process.env[name]) throw new Error(`${name} is not set, see backend/README.md`);
}

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use(createRequestsRouter(createStore(pool)));

startOutboxPublisher({ pool, url: process.env.RABBITMQ_URL });

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API server listening on port ${port}`));
