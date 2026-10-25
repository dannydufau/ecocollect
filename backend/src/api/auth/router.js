const express = require('express');

const COOKIE_NAME = 'session';
const SESSION_MS = 5 * 24 * 60 * 60 * 1000; // 5 days, Firebase allows 5 minutes up to 14 days

// HttpOnly keeps JavaScript away from the cookie. EventSource can't send an
// Authorization header, so this cookie is how the SSE connection proves who it is.
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' };

// Firebase puts an "auth/..." code on errors caused by the token itself. Anything
// else (network, bad config) is our problem, so the caller shouldn't see a 401.
function sendAuthError(res, err) {
  if (err.code?.startsWith('auth/')) return res.sendStatus(401);
  console.error('Unexpected auth error:', err);
  res.sendStatus(500);
}

function createAuthRouter(auth) {
  const router = express.Router();

  // The ID token goes in the JSON body as { idToken }. Firebase checks it for us
  // while creating the cookie, so a bad or stale token ends up as a 401 here.
  router.post('/api/session', express.json(), async (req, res) => {
    const idToken = req.body?.idToken;
    if (!idToken) return res.sendStatus(401);

    try {
      const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MS });
      res.cookie(COOKIE_NAME, cookie, { ...COOKIE_OPTIONS, maxAge: SESSION_MS });
      res.sendStatus(204);
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  router.delete('/api/session', (req, res) => {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    res.sendStatus(204);
  });

  return router;
}

module.exports = { createAuthRouter, COOKIE_NAME };
