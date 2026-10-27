const express = require('express');
const { getFirebaseAuth } = require('./auth/firebase');
const { createAuthRouter } = require('./auth/router');

const app = express();

// Auth lives in its own router so it can move into a separate service later without changes.
app.use(createAuthRouter(getFirebaseAuth()));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API server listening on port ${port}`));
