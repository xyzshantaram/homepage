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


## done

- Bun + Hono + LiquidJS app; fieber from jsDelivr
- / renders the 3 newest visible posts
- /posts renders all visible posts, 25 per page, ?tags=a,b filtering, filled/outlined tag buttons
- /posts/{year}/{month}/{slug} renders the full post
- markdown: GFM, footnotes, images as <figure> + <figcaption>, tables as scrollable 20ch-column figures
- footer: GitHub, Hire me, CV, Contact; body-size links
- content lives on the orphan posts branch, checked out at ~/th/scratch/posts-wt; 35 posts with created-date, tags, and hidden
- fieber fork: explicit palette, no system colors, flat kbd/meters, .surface, .content, .table-wrapper, showcase at index.html
- commits: homepage b3c114c on next (one ahead of origin), posts bbffed7 (pushed), fieber 8c076dc (pushed)
- RSS feed built and tested; 25 items, /feed.rss + /blog/feed.rss, atom self link
- Comments built and tested
- image pipeline: content-relative/HTTP images → sha256 WebP, max 4096, cached at /media
- page pipeline: FilePageStorage, extra_head, raw page HTML, image resolver
- Contact, Donate, Services pages built locally; /contact/donate(.html) → /donate
- Donate: XMR, BMC button + QR, BTCZap; Services: <services-estimate> on fieber forms
- Dockerfile fixed: src/, templates/, static/, package.json, bun.lock; content clone; /app/data volume
- comments stack: Cap, bun:sqlite, ULID, zod, limiter; 1 comment/min, 5 captcha/10s; SQLite on /app/data; moderation via admin
- admin: Nostr event → /api/v1/admin, session cookie, inline actions, footer link
- posts webhook: /api/v1/admin/posts/hook, HMAC, content branch
- test suite: 46 tests
- stack complete: Bun, Hono, LiquidJS, markdown-it + footnote, gray-matter, lodash, timeago, sharp, nostr-tools
- blog posts we have
  - visible:

| Post                                                                          | Date       | Tags               |
|-------------------------------------------------------------------------------|------------|--------------------|
| Writers Jam                                                                   | 2025-07-12 | musings, projects  |
| Two Slow Dancers                                                              | 2023-03-03 | fiction            |
| Five months and five thousand kilometers with the Royal Enfield Bullet (2022) | 2023-02-05 | musings, technical |
| imperfect dream                                                               | 2022-06-23 | fiction            |
| A Better Place                                                                | 2020-12-14 | fiction            |

- the other 30 are stubs or empty; none has a body
- hidden fiction: a cold tuesday in hell, Dead Mail, The Loneliest Man in the World, The Man and the Monks, We Have Held the Future…
- hidden musings: A Home of My Own, first love, Flavours of Love, one man's trash, reflections on misery
- hidden technical: ai-for-all, aidos, The Attention Button, campfire, cardea, cf-alert, colle, COVID-19 Resources, etu, ink-editor, luacheck-ts,
macrolight, next-steps, nostr-canvas, nostr-lora, pseudows, rite, stupid-simple-kv, thursday, wizardkit
- projects currently has only Writers Jam

## Pending

- 30 stubs need real bodies and dates
- Deploy/cutover
  - next.shantaram.xyz; nginx 404 → public_html; test webhook push
  - cut over to main when satisfied
  - analytics counter
  - CI (tests exist, no CI)
- RSS hardening: stable lastBuildDate (newest post); ETag/Last-Modified
