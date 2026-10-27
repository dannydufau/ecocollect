// The gateway has already checked the token. It tells us who is calling in these headers,
// and strips them from the outside world, so we can trust them here.
function gatewayUser(req, res, next) {
  const uid = req.get('X-User-Id');
  if (!uid) return res.status(401).json({ error: 'not signed in' });
  req.user = { uid, roles: (req.get('X-User-Roles') || '').split(',').filter(Boolean) };
  next();
}

// Sends the 403 itself and returns false, so a route can just `if (!requireRole(...)) return;`
function requireRole(req, res, role) {
  if (req.user.roles.includes(role)) return true;
  res.status(403).json({ error: `this needs the ${role} role` });
  return false;
}

module.exports = { gatewayUser, requireRole };
