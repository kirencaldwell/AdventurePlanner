FROM node:20-alpine

# Use a specific shell for stability
SHELL ["/bin/sh", "-c"]

# Install standard Linux tools required for some node packages
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy only package files first to cache the install step (speeds up rebuilds)
COPY package*.json ./

# Install dependencies (using flags to prevent timeouts and unnecessary checks)
RUN npm install --no-audit --no-fund

# Copy the rest of the project files
COPY . .

# Build the project
RUN npm run build

# Expose the server port
EXPOSE 8099

# Start script
CMD ["npm", "run", "start"]

