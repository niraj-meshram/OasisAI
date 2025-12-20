FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_CERT=/usr/local/share/ca-certificates/zscaler-root.crt \
    SSL_CERT_FILE=/usr/local/share/ca-certificates/zscaler-root.crt \
    REQUESTS_CA_BUNDLE=/usr/local/share/ca-certificates/zscaler-root.crt

WORKDIR /app

COPY certs/zscaler-root.crt /usr/local/share/ca-certificates/zscaler-root.crt
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates build-essential && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --cert $PIP_CERT -r requirements.txt

COPY backend/app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
