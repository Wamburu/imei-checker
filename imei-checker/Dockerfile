FROM node:18-alpine

# Use a pre-built Chromium binary that's smaller
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./

# Skip puppeteer Chromium download entirely
RUN npm config set puppeteer_skip_chromium_download true && \
    npm install --omit=dev --no-fund --no-audit

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
