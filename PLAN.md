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
- RSS feed built and tested
- Comments built and tested
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

- comments
- ~~link-blog shape: external URL + commentary, inline-markdown titles~~ Superseded - we can ersatz this
  with just our markdown thing
- compose: signed commit/webhook, render, cache, regenerate RSS
- images in blog posts should be normalized and stored in docker volume at /media into webp max 4k res with filename = sha256
  of pre-webp file.
- `webcomponents:` frontmatter - include the script tags so the components just work.
- Contact and Donate as markdown pages
  - redirects from old URLs - not necessary. shantaram.xyz/contact/ and shantaram.xyz/contact/donate/ are fine.
- Services as a footer item (footer item added, WebComponent not wired up)
- 30 stubs need real bodies and dates
- deployment: Dockerfile copies only index.ts and static/, runs bun add hono, and misses templates/, package.json, bun.lock, and the posts
worktree
  - no nginx/public_html fallback on next; the live site is still main
    - This is fine, we will cut over when ready.
  - analytics counter - shantaram.xyz has some analytics solution
  - tests/CI
- stack needed
  - already: Bun, Hono, LiquidJS, markdown-it + footnote, gray-matter, lodash, fieber
  - comments: @cap.js/server, @cap.js/widget via CDN, bun:sqlite, ULID, zod, a limiter
  - RSS: plain XML generation
    - lastBuildDate currently uses new Date(), so it changes on every request
    - better to set it to the newest post date; otherwise clients see a changed feed on every fetch
    - we also send no ETag or Last-Modified, so conditional GET is not available yet
    - Will do this when our webhook stuff takes shape further
  - deploy: fixed Dockerfile, posts baked or mounted, nginx/redirect map
  - git/webhook for compose is also a v1 target. the idea is to make it easy for me to post by
    building a complete if feature-light website now, not make it something we engineer forever.

- limits: 1 comment per minute per IP+path; 5 captcha calls per 10s
- SQLite location: also in docker volume (storage:create with dokku)
- Moderation: should be able to copy comment id and push to posts branch maybe? 
  - bun run scripts/delete-comment.ts <ID> could create a commit and push, which also hits a webhook
  - each comment should be ID'd by a ULID and store the posts/2025/07/... slug as the reference/grouping key
- Deploy: we will cut over once we are satisfied, no need to rush it
- RSS: keep /blog/feed.rss as a redirect, but shantaram.xyz/feed.rss is the path we want people to use going forward
