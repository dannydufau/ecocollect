const express = require('express');
const { gatewayUser, requireRole } = require('./user');
const { parseCreate, parseList } = require('./validate');
const { RequestError } = require('./store');

function createRequestsRouter(store) {
  const router = express.Router();

  // Who is calling comes first, so a stranger gets a 401 before we even read their body.
  router.use('/api/requests', gatewayUser, express.json());

  router.post('/api/requests', async (req, res) => {
    if (!requireRole(req, res, 'resident')) return;
    const { error, ...body } = parseCreate(req.body);
    if (error) return res.status(400).json({ error });
    const requests = await store.createRequests({ uid: req.user.uid, ...body });
    res.status(201).json({ requests });
  });

  router.get('/api/requests', async (req, res) => {
    const { error, view, status, postalCodes } = parseList(req.query);
    if (error) return res.status(400).json({ error });
    if (view === 'mine') {
      if (!requireRole(req, res, 'resident')) return;
      return res.json(await store.listMine(req.user.uid, status));
    }
    if (!requireRole(req, res, 'volunteer')) return;
    res.json(await store.listAvailable(postalCodes));
  });

  router.use('/api/requests', (err, req, res, next) => {
    if (err instanceof RequestError) return res.status(400).json({ error: err.message });
    // express.json() marks a body that is not JSON (or too large) with a 4xx status.
    if (err.status === 400) return res.status(400).json({ error: 'the body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'something went wrong on our side' });
  });

  return router;
}

module.exports = { createRequestsRouter };
