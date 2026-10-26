FROM docker.io/oven/bun:1-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY templates ./templates
COPY static ./static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN git clone --depth 1 --branch content https://github.com/xyzshantaram/homepage.git /app/content

ENV POSTS_DIR=/app/content/posts
ENV MEDIA_DIR=/app/data/media
ENV COMMENTS_DB=/app/data/comments.db
ENV CAP_STATE=/app/data/cap-state.json

RUN mkdir -p /app/data && chown -R bun:bun /app

VOLUME ["/app/data"]

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "src/main.ts"]
