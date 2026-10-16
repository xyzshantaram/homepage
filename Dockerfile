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

# Fetch fieber.css into vendor/, outside static/ so the dev bind mount cannot
# shadow it. CACHEBUST only affects this layer, so bumping it re-fetches the
# stylesheet without reinstalling dependencies.
ARG CACHEBUST=0
RUN echo "fieber cachebust=${CACHEBUST}" \
    && mkdir -p vendor \
    && curl -fsSL https://raw.githubusercontent.com/trythursday/fieber/main/fieber.css -o vendor/fieber.css

EXPOSE 3000
CMD ["bun", "run", "index.ts"]
