ARG CUSTOM_CA_CERT=""

##############################
# Frontend build stage
##############################
FROM node:20-slim AS build
ARG CUSTOM_CA_CERT

ENV NODE_ENV=production \
    NPM_CONFIG_PRODUCTION=false \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" && \
        update-ca-certificates && \
        npm config set cafile "$CUSTOM_CA_PATH"; \
    else \
        update-ca-certificates; \
    fi

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci --include=dev

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
ARG CUSTOM_CA_CERT

ENV NODE_ENV=production \
    PORT=8080 \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" && \
        update-ca-certificates && \
        npm config set cafile "$CUSTOM_CA_PATH"; \
    else \
        update-ca-certificates; \
    fi && \
    npm install -g serve && \
    npm config delete cafile

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
