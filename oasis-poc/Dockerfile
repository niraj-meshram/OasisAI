##############################
# Frontend build stage
##############################
ARG CUSTOM_CA_CERT=""

##############################
# Frontend build stage
##############################
FROM node:20-slim AS frontend-build
ARG CUSTOM_CA_CERT
ENV NODE_ENV=production \
    NPM_CONFIG_PRODUCTION=false \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt
WORKDIR /frontend
COPY frontend/package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" \
        && update-ca-certificates \
        && npm config set cafile "$CUSTOM_CA_PATH"; \
    else \
        update-ca-certificates; \
    fi
RUN npm ci --include=dev
COPY frontend .
RUN npm run build

##############################
# Backend dependencies stage
##############################
FROM python:3.11-slim AS backend-build
ARG CUSTOM_CA_CERT
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt
WORKDIR /app
COPY backend/requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" \
        && update-ca-certificates; \
    else \
        update-ca-certificates; \
    fi
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && if [ -n "$CUSTOM_CA_CERT" ]; then \
        pip install --no-cache-dir --cert "$CUSTOM_CA_PATH" -r requirements.txt; \
    else \
        pip install --no-cache-dir -r requirements.txt; \
    fi \
    && apt-get remove -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

##############################
# Final runtime image
##############################
FROM python:3.11-slim
ARG CUSTOM_CA_CERT
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt \
    APP_USER=appuser
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gosu \
    && rm -rf /var/lib/apt/lists/* \
    && if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" \
        && update-ca-certificates; \
    else \
        update-ca-certificates; \
    fi \
    && useradd --create-home "$APP_USER"

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy python env from builder
COPY --from=backend-build /usr/local /usr/local
# Copy backend app
COPY backend/app ./app
# Copy built frontend assets
COPY --from=frontend-build /frontend/dist ./frontend_dist

RUN chown -R "$APP_USER":"$APP_USER" /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import sys, urllib.request; \
resp = urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5); \
sys.exit(0 if resp.status == 200 else 1)"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]

