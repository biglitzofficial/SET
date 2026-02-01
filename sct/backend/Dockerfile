# Use Node.js LTS version
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Cloud Run expects the container to listen on PORT env variable
# Use the PORT environment variable provided by Cloud Run
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for security
USER node

# Start the application
CMD ["node", "server.js"]
