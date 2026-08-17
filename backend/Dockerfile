# Stage 1: Build stage
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production Runner stage
FROM python:3.12-slim AS runner

WORKDIR /app

# Install minimal runtime dependencies (libpq for PostgreSQL driver, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root dedicated user
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -m appuser

# Copy installed dependencies from builder
COPY --from=builder /install /usr/local

# Copy application source code with correct ownership
COPY --chown=appuser:appgroup . /app

# Make the start script executable
RUN chmod +x /app/start.sh

USER appuser:appgroup

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 10000

CMD ["./start.sh"]
