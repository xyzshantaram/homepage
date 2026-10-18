FROM docker.io/oven/bun:1-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY index.ts .
COPY static ./static
RUN bun add hono

EXPOSE 3000
CMD ["bun", "run", "index.ts"]
