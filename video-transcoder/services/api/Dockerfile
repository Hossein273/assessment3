FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package.json from parent directory
COPY ../../package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
