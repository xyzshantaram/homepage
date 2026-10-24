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
  - any portfolio items that had screenshots that we want to show, get
    screenshots in the readme.
- **Blog** — becomes a link blog.
  - Title supports inline markdown.
  - Pasting an image uploads it to Colle.
  - Backed by an append-only log in SQLite.
  - Comments: Append-only log items, with rate limiting and a captcha — the approach in
    `~/repos/writers-jam`: Cap.js proof-of-work widget, plus a limiter on the
    submit routes.
  - Compose page - for me, should require a signed git commit to a branch with
    blogs maybe? it can refetch or force a fetch. (I think this could be a webhook,
    and then it pulls the Markdown, renders as HTML and caches it, regenerates the RSS feed, etc)
  - Should add a webcomponent-sources frontmatter field that's a list of URLs, it embeds it,
    then we get WebComponents in our MD for free.
- **Existing site stays as is** — nothing above touches the current pages yet.
  - Next step is minimal prototyping to settle how the site should look.
- RSS is 100% a target for first ver. Look at the existing site though.
- Need to steal recent changes from ~/repos/thursday/experiments/next-steps for
  the fieber stylesheet.
- Need bun language server support.
