# homepage

This repo holds the source for shantaram.xyz, my personal site.

## Stack

The site is plain static HTML and CSS. It has no build step and no
JavaScript framework. A `Dockerfile` serves the files with
[static-web-server](https://static-web-server.net/), a small Rust binary
taken from the official static-web-server image. The container runs as a
dedicated non-root user (uid 10004) on port 8080.

The site deploys to [dokku](https://dokku.com/) running on shantaram.xyz. 
dokku's own nginx proxy terminates TLS and forwards traffic to the container.

## Local development

Open `index.html` directly in a browser, or serve the repo root with any
static file server. No build step runs before a page loads.

To test the production container locally:

```sh
podman build -t homepage .
podman run --rm -p 8080:8080 homepage
```

Then open `http://localhost:8080`.

## Deployment

Push to the `dokku` remote to deploy:

```sh
git push dokku main
```

dokku rebuilds the image from the `Dockerfile` and redeploys the container.
No manual steps run after the push, other than the one-time app setup on
the dokku host (`apps:create`, domain, and cert).

## Front-end fallback to public_html

`nginx.conf.sigil` sends any path this app does not have to `public_html`,
a separate directory of site content on tomato that this repo does not
track on purpose. dokku reads `nginx.conf.sigil` from the repo root on
every push and uses it in place of its own built-in nginx template for
this app.

A plain `nginx.conf.d/*.conf` snippet cannot do this. dokku's built-in
template already sets `error_page 404` at server scope for its own shared
error page, and nginx uses the first matching `error_page` for a status
code, not the last, so a snippet declaring the same code later never wins.
The full template gives a location-scoped `error_page`, which does win for
that location.

`nginx.conf.sigil` is not maintained by hand. It is generated from dokku's
own shipped template plus a small patch:

- `nginx.conf.sigil.patch` is a unified diff, the actual tracked source of
  truth. It adds `proxy_intercept_errors`, `recursive_error_pages` and a
  location-scoped `error_page 404 = @public_html;` inside the proxied
  `location /` block, and a new `location @public_html` block that serves
  from `{{ var "PUBLIC_HTML_DIR" }}`, a dokku app config var (not a path
  hardcoded in the file).
- `scripts/generate-nginx-sigil.sh` fetches dokku's current template
  straight from tomato, applies the patch, and writes `nginx.conf.sigil`.
  Run it again after any dokku upgrade on tomato, then review the diff,
  commit, and push. If the patch no longer applies, dokku's template
  changed in a conflicting way. Fix `nginx.conf.sigil.patch` by hand and
  rerun the script.
- `nginx.conf.sigil`, the generated result, is committed too, so a plain
  `git push dokku main` works without running the script first.

`recursive_error_pages on;` is required, not cosmetic. `@public_html` is a
named location, and nginx's `index` handling for a directory URI issues an
internal redirect that re-enters `location /` (a named location is never
re-matched by a normal internal redirect). That second pass reaches the
proxied app, 404s again, and with recursion off (nginx's default) nginx
refuses to re-apply `error_page` for the same request, returning its own
default 404 instead. With recursion on, that second 404 falls back into
`@public_html` and the directory's `index.html` is served. Plain files do
not need it because they are served by `@public_html` on the first pass.

One-time host setup, before the first push that uses this file:

```sh
dokku config:set --no-restart homepage PUBLIC_HTML_DIR=/home/sid/public_html
```

Test with four requests after a deploy: a homepage-native path (`/`)
returns homepage content, a `public_html`-only file (for example
`/important.html`) returns that file, a `public_html`-only directory with
its own `index.html` (for example `/poetry-photos/`) returns that page, and
a path in neither returns a clean 404.
