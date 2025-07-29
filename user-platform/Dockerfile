# VFT User Platform Dockerfile
FROM nginx:alpine

# Copy user platform files
COPY index.html /usr/share/nginx/html/
COPY user-api.js /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:80 || exit 1