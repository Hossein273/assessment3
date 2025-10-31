# ==============================
# Dockerfile for Worker Service
# ==============================
FROM node:20-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /usr/src/app

# Copy package manifests first
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy worker code
COPY . .

# Start the worker process
CMD ["node", "worker.js"]
