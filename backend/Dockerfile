FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifests first, so the install layer is reused when only the code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The node image ships a non-root user; no reason to run as root.
USER node
# No CMD: every service built from this image sets its own command in docker-compose.yml.
