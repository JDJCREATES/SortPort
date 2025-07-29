# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for sharp and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev \
    curl

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm ci && npm cache clean --force

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript application
RUN npm run build

# Remove source files and dev dependencies to reduce image size
RUN rm -rf src/ tsconfig.json node_modules/
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs

# Health check for AWS ECS
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Expose port
EXPOSE 3001

# Set NODE_ENV to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.js"]
