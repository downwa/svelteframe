# Use a lean base image with Bun pre-installed
FROM oven/bun:1-alpine

# --- THIS IS THE CRITICAL FIX ---
# Set a fast, public DNS server to solve network latency inside the container.
RUN echo "nameserver 1.1.1.1" > /etc/resolv.conf
# --- END FIX ---

# Set the working directory
WORKDIR /usr/src/app

# Copy package files and install ONLY production dependencies
COPY package.json bun.lock ./
RUN bun install --production

# Copy the pre-built application.
COPY . .

# Expose the port the app will run on
EXPOSE 3000

# The command to start the server
CMD ["bun", "index.js"]
