const express = require('express');
const { Pool } = require('pg');
const { getFirebaseAuth } = require('./auth/firebase');
const { createAuthRouter } = require('./auth/router');
const { createRequestsRouter } = require('./requests/router');
const { createStore } = require('./requests/store');
const { startOutboxPublisher } = require('../messaging/outbox');

for (const name of ['DATABASE_URL', 'RABBITMQ_URL']) {
  if (!process.env[name]) throw new Error(`${name} is not set, see backend/README.md`);
}

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Auth lives in its own router so it can move into a separate service later without changes.
app.use(createAuthRouter(getFirebaseAuth()));
app.use(createRequestsRouter(createStore(pool)));

startOutboxPublisher({ pool, url: process.env.RABBITMQ_URL });

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API server listening on port ${port}`));
