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

RUN git clone --depth 1 --branch content https://github.com/xyzshantaram/homepage.git /app/content

ENV POSTS_DIR=/app/content/posts
ENV COMMENTS_DB=/app/data/comments.db
ENV CAP_STATE=/app/data/cap-state.json

RUN mkdir -p /app/data && chown -R bun:bun /app

VOLUME ["/app/data"]

USER bun

EXPOSE 3000
CMD ["bun", "run", "src/main.ts"]
