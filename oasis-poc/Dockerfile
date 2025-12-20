##############################
# Frontend build stage
##############################
FROM node:20-slim AS frontend-build
ENV NODE_ENV=production \
    NPM_CONFIG_PRODUCTION=false
WORKDIR /frontend
COPY frontend/package*.json ./
COPY certs/zscaler-root.crt /usr/local/share/ca-certificates/zscaler-root.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && update-ca-certificates
RUN npm config set cafile /usr/local/share/ca-certificates/zscaler-root.crt
RUN npm ci --include=dev
COPY frontend .
RUN npm run build

##############################
# Backend dependencies stage
##############################
FROM python:3.11-slim AS backend-build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt .
COPY certs/zscaler-root.crt /usr/local/share/ca-certificates/zscaler-root.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && update-ca-certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && pip install --no-cache-dir --cert /usr/local/share/ca-certificates/zscaler-root.crt -r requirements.txt \
    && apt-get remove -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

##############################
# Final runtime image
##############################
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080
WORKDIR /app

# Copy python env from builder
COPY --from=backend-build /usr/local /usr/local
# Copy backend app
COPY backend/app ./app
# Copy built frontend assets
COPY --from=frontend-build /frontend/dist ./frontend_dist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]

