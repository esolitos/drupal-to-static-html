# Use Node.js 20 Alpine for lightweight image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install npm dependencies (clean install for reproducible builds)
RUN npm ci --only=production

# Copy application source code
COPY src/ ./src/

# Create output directory for mount
RUN mkdir -p /output

# Set NODE_ENV to production
ENV NODE_ENV=production

# Define which mode to run (can be overridden at runtime)
ENV MODE=crawl

# Default environment variables (can be overridden at runtime)
ENV SITE_HOST=localhost
ENV SITE_IP=127.0.0.1
ENV LINKEDIN_PROFILE=https://linkedin.com
ENV CRAWL_DELAY=500
ENV MAX_DEPTH=0
ENV CONNECT_TIMEOUT=10000
ENV MAX_RETRIES=3

# Set entrypoint to main script
ENTRYPOINT ["node", "src/index.js"]

# Labels for container metadata
LABEL org.opencontainers.image.title="Drupal to Static HTML Exporter"
LABEL org.opencontainers.image.description="Docker tool to export Drupal sites to static HTML"
LABEL org.opencontainers.image.source="https://github.com/esolitos/drupal-to-static-html"
LABEL org.opencontainers.image.licenses="MIT"
