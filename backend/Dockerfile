FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifests first, so the install layer is reused when only the code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The node image ships a non-root user; no reason to run as root.
USER node
CMD ["node", "src/api/server.js"]
