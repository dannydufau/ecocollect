const express = require('express');

const COOKIE_NAME = 'session';
const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`);
const SESSION_MS = 5 * 24 * 60 * 60 * 1000; // 5 days, Firebase allows 5 minutes up to 14 days

// HttpOnly keeps JavaScript away from the cookie. EventSource can't send an
// Authorization header, so this cookie is how the SSE connection proves who it is.
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' };

// Errors caused by the token itself. Anything else means Firebase or our setup failed.
const TOKEN_PROBLEMS = new Set([
  'auth/argument-error',          // malformed token or bad signature
  'auth/invalid-id-token',        // createSessionCookie rejected the ID token
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/user-disabled',
  'auth/user-not-found',          // user deleted (checkRevoked looks the user up)
]);

function sendAuthError(res, err) {
  if (TOKEN_PROBLEMS.has(err.code)) {
    return res.sendStatus(401);
  }
  console.error('Unexpected auth error:', err);
  res.sendStatus(500);
}

function readBearerToken(req) {
  return /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1];
}

function readSessionCookie(req) {
  return COOKIE_PATTERN.exec(req.headers.cookie ?? '')?.[1];
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

  router.delete('/api/session', async (req, res) => {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);

    // Clearing the cookie only makes this browser forget it. Revoking makes any copy
    // of it stop working too, but signs the user out on every device.
    const cookie = readSessionCookie(req);
    if (cookie) {
      try {
        const user = await auth.verifySessionCookie(cookie);
        await auth.revokeRefreshTokens(user.uid);
      } catch (err) {
        // A bad or expired cookie has nothing left to revoke.
        if (!TOKEN_PROBLEMS.has(err.code)) console.error('Could not revoke session:', err);
      }
    }
    res.sendStatus(204);
  });

  // Caddy's forward_auth calls this before every /api/* request. A 200 lets the
  // request through, with the identity copied onto it from the headers below.
  router.get('/verify', async (req, res) => {
    const token = readBearerToken(req);
    const cookie = token ? undefined : readSessionCookie(req);
    if (!token && !cookie) return res.sendStatus(401);

    try {
      // The `true` makes Firebase also reject revoked tokens and disabled users.
      // It costs a network call, but without it a stolen token works until it expires.
      const user = token
        ? await auth.verifyIdToken(token, true)
        : await auth.verifySessionCookie(cookie, true);

      res.set({ 'X-User-Id': user.uid, 'X-User-Roles': [].concat(user.roles ?? []).join(',') });
      res.sendStatus(200);
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  // A body that isn't valid JSON would otherwise get Express's default error page,
  // which includes a stack trace outside production.
  router.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.sendStatus(400);
    next(err);
  });

  return router;
}

module.exports = { createAuthRouter };
