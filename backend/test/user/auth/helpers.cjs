const { createApp } = require('../../../src/user/app.ts');

async function startServer(auth) {
  const app = await createApp({ auth });
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return {
    url: path => `http://127.0.0.1:${server.address().port}${path}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

module.exports = { startServer };
