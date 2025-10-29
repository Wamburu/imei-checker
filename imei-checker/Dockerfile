FROM node:18-alpine

# Install Chromium with better progress tracking
RUN echo "🚀 Starting Chromium installation..." && \
    apk update && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont && \
    echo "✅ Chromium installed successfully!"

# Verify installation
RUN chromium-browser --version && \
    echo "🎯 Chromium version confirmed"

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN echo "📦 Installing Node.js dependencies..." && \
    npm install --omit=dev --progress=false && \
    echo "✅ Dependencies installed successfully!"

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
