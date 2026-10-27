# Prototypes — see ../PLAN.md.

_image := "localhost/homepage-prototypes:latest"
_static := justfile_directory() / "static"
_posts := env("HOME") / "th/homepage-content"
_data := justfile_directory() / "data"

# List the available recipes.
default:
    @just --list

# Build the image.
build:
    podman build -t {{_image}} .

# Dev server on :3000. static/, posts, and data are bind-mounted.
dev:
    podman build -t {{_image}} .
    podman run --rm --name homepage-dev -p 0.0.0.0:3000:3000 \
        -v "{{_static}}:/app/static:Z" \
        -v "{{_posts}}:/app/content:Z" \
        -v "{{_data}}:/app/data:Z" \
        -e POSTS_DIR=/app/content/posts \
        -e MEDIA_DIR=/app/data/media \
        -e COMMENTS_DB=/app/data/comments.db \
        -e CAP_STATE=/app/data/cap-state.json \
        {{_image}}

# Run the built image on :3001 with nothing mounted, as in production.
docker:
    podman build -t {{_image}} .
    podman run --rm --name homepage-docker -p 0.0.0.0:3001:3000 \
        -e COMMENTS_DB=/app/data/comments.db \
        -e CAP_STATE=/app/data/cap-state.json \
        {{_image}}
