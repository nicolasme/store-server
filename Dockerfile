# Use official Node.js LTS image
FROM node:20-alpine

# Install dependencies for native modules (canvas, sharp)
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create directories for data if they don't exist
RUN mkdir -p data/hgt public

# Expose the port
EXPOSE 3060

# Set environment to production by default
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
