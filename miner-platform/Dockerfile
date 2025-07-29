# VFT Miner Platform Dockerfile
FROM nginx:alpine

# Copy miner platform files
COPY index.html /usr/share/nginx/html/
COPY miner-api.js /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:80 || exit 1