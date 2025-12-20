ARG CUSTOM_CA_CERT=""

FROM python:3.11-slim AS builder
ARG CUSTOM_CA_CERT
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CUSTOM_CA_PATH=/usr/local/share/ca-certificates/custom-ca.crt
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates build-essential \
    && if [ -n "$CUSTOM_CA_CERT" ]; then \
        printf '%s\n' "$CUSTOM_CA_CERT" > "$CUSTOM_CA_PATH" \
        && update-ca-certificates \
        && pip install --no-cache-dir --cert "$CUSTOM_CA_PATH" -r requirements.txt; \
    else \
        update-ca-certificates \
        && pip install --no-cache-dir -r requirements.txt; \
    fi \
    && apt-get remove -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

FROM python:3.11-slim
ARG CUSTOM_CA_CERT
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
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

COPY --from=builder /usr/local /usr/local
COPY backend/app /app/app

RUN chown -R "$APP_USER":"$APP_USER" /app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import sys, urllib.request; \
resp = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5); \
sys.exit(0 if resp.status == 200 else 1)"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
