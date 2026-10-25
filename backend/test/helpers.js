const express = require('express');
const { createAuthRouter } = require('../src/api/auth/router');

// Starts the auth router on a random port and returns a url helper plus a close function.
async function startServer(auth) {
  const app = express().use(createAuthRouter(auth));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { url: (path) => `http://127.0.0.1:${server.address().port}${path}`, close: () => server.close() };
}

module.exports = { startServer };
