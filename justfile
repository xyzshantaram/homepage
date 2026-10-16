# Prototypes — see ../PLAN.md.

_image := "localhost/homepage-prototypes:latest"
_static := justfile_directory() / "static"

# List the available recipes.
default:
    @just --list

# Build the image. fieber.css is fetched from the fork at build time.
build:
    podman build -t {{_image}} .

# Dev server on :3000. static/ is bind-mounted; fieber.css comes from the image.
dev:
    podman build -t {{_image}} .
    podman run --rm --name homepage-dev -p 0.0.0.0:3000:3000 \
        -v "{{_static}}:/app/static:Z" \
        {{_image}}

# Run the built image on :3001 with nothing mounted, as in production.
docker:
    podman build -t {{_image}} .
    podman run --rm --name homepage-docker -p 0.0.0.0:3001:3000 {{_image}}

# Refetch fieber.css from the fork, bypassing the layer cache.
fieber:
    podman build --build-arg CACHEBUST=$(date +%s) -t {{_image}} .
