# content

This branch holds the site's content, separate from the code.

- `posts/` — blog posts, one Markdown file per post.
- `pages/` — standalone pages such as contact, services, and donate.

Frontmatter uses `title`, `description`, `created-date`, `tags`, and `hidden`.

Pull before editing, and push to update the running site.

## Rebuilding a post

A post is rendered once and cached, so a fix or a re-transcode needs a forced
rebuild. Sign in at `/admin`, then paste this into the devtools console on the
site:

```js
await (await fetch("/api/v1/admin/rebuild", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: "/posts/2026/10/making-coding-fun-again" }),
})).json()
```

The session cookie rides along automatically. It returns
`{ success: true, url, bytes }`, or an error code of `Unauthorized`,
`InvalidUrl`, or `NotFound`. A `url` query parameter works too:

```sh
curl -X POST "https://shantaram.xyz/api/v1/admin/rebuild?url=/posts/2026/10/making-coding-fun-again" \
  -b "admin_session=…"
```

Rebuilding clears the cached media resolutions as well, so it also retries any
video that failed to transcode.
