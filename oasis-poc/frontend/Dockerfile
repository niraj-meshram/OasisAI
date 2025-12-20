##############################
# Frontend build stage
##############################
FROM node:20-slim AS build

ENV NODE_ENV=production \
    NPM_CONFIG_PRODUCTION=false

WORKDIR /app

# Install CA root if present (useful for corp proxies)
COPY certs/zscaler-root.crt /usr/local/share/ca-certificates/zscaler-root.crt
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Install dependencies
COPY frontend/package*.json ./
RUN npm config set cafile /usr/local/share/ca-certificates/zscaler-root.crt && \
    npm ci --include=dev

# Copy source
COPY frontend ./

# Provide sensible defaults for dockerized builds; can be overridden via build args
ARG VITE_API_BASE=http://localhost:8000/api/v1
ARG VITE_AUTH0_REDIRECT_URI=http://localhost:8080
ARG VITE_AUTH0_LOGOUT_URI=http://localhost:8080
ARG VITE_AUTH0_ROLES_CLAIM=http://localhost:8080/roles
ARG VITE_APP_API_KEY=

ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_AUTH0_REDIRECT_URI=$VITE_AUTH0_REDIRECT_URI \
    VITE_AUTH0_LOGOUT_URI=$VITE_AUTH0_LOGOUT_URI \
    VITE_AUTH0_ROLES_CLAIM=$VITE_AUTH0_ROLES_CLAIM \
    VITE_APP_API_KEY=$VITE_APP_API_KEY

RUN npm run build

##############################
# Runtime image
##############################
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY certs/zscaler-root.crt /usr/local/share/ca-certificates/zscaler-root.crt
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates && \
    npm config set cafile /usr/local/share/ca-certificates/zscaler-root.crt && \
    npm install -g serve && \
    npm config delete cafile

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
