FROM docker.io/oven/bun:1-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY templates ./templates
COPY static ./static

RUN git clone --depth 1 --branch posts https://github.com/xyzshantaram/homepage.git /app/posts

ENV POSTS_DIR=/app/posts/posts

VOLUME ["/app/data"]

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
