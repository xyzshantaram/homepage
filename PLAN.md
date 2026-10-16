# PLAN

## Vibes

- Simon Willison's blog — link blog: a short pointer to someone else's work with
  my own commentary attached, sitting in the same timeline as full posts.
- Bear blog — plain, fast, readable, no ceremony.

## Stack

- Liquid templates.
- Hono.
- Bun.
- SQLite — an append-only log.

## Plan

- **Home page** — keep it as the starting point, improve it.
  - Remove the Portfolio section; link to GitHub instead.
  - Any portfolio item still worth showing gets written up as a post.
- **Blog** — becomes a link blog.
  - Title supports inline markdown.
  - Pasting an image uploads it to Colle.
  - Backed by an append-only log in SQLite.
    - Postgres rejected: too much complexity for what this is.
  - Comments, undecided between two options:
    - GitHub Issues via a drop-in script (utterances / giscus) — no storage of
      our own, tied to GitHub identity.
    - Append-only log items, with rate limiting and a captcha — the approach in
      `~/repos/writers-jam`: Cap.js proof-of-work widget, plus a limiter on the
      submit routes.
- **Existing site stays as is** — nothing above touches the current pages yet.
  - Next step is minimal prototyping to settle how the site should look.
