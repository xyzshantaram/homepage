---
title: "split-utils"
description: "a Deno app and AI skill for splitting shared delivery orders with my housemates and pushing them to Splitwise."
created-date: 2026-09-19
tags:
  - technical
  - projects
---

## Shared bills

I live with my housemates. The three of us order groceries and food across 
Zepto, Blinkit, Zomato and Swiggy, and the bills pile up in four different apps.

I used to do this manually with pen and paper, back in college, with a different
set of housemates. Then I started to do it in Excel. It was still slow, painful 
work though.

My dream was to have a workflow which could automate the gathering flow and let
me assign the orders.

The first version of split-utils used the rudimentary MCPs that the service
providers exposed. I thought it was novel for about 2 days that my coding agent
could order me a coffee - then I realised, if I have to reach for my phone 
anyway to pay for it, it was not the future. And the MCP route had its own 
problems - arbitrary order limits on fetching history, and certain endpoints
had seemingly nonsensical design decisions.

No shade to the engineers at those companies - I'm sure they were doing their
best, and it's cool that there's an official route at all to do some kind of
automation, but I found it sorely lacking.

So for a while I went back to using the Splitwise upload flow. I had paid for
Splitwise Pro so I could atleast OCR the receipts, and it took an hours-long 
painful process to about 30 seconds per order. Still bad, not as bad as doing
it manually.

Then I began to consider automation again. This time, I reused the split 
assignment dashboard (a simple Python/Tkinter script) from split-utils as well
as the push API client, and put screenshots of the orders into my coding agent.
With cheap vision models, it was possible to get the whole job done in about
20-30 minutes.

This was close to ideal - half an hour every month was something I was willing
to dedicate. But then I realised: there was no need for any of this to use AI
at all. I just had to write enough glue to make it entirely deterministic, and
that would mean my friends who are more... cautious, shall we say, about AI,
would be able to use it too!

## The ugly parts

Gathering the order set is where most of the work went. 

I ended up having to drive real browsers for the Swiggy, Zepto, and Blinkit 
websites and parse the DOM - for Zomato, which has no web client, I had GLM-5.3 
reverse engineer just enough of the app to do the fetching steps.

Each platform had its own way of getting in the way:

- Zepto answers any request with `HeadlessChrome` in the user agent with a 429 
  that looks like a rate limit but never clears.
- Swiggy sits behind AWS WAF, and a phone user agent without full mobile 
  emulation scores as a bot.
- Zomato wants OAuth2 plus PKCE, with a device identity that has to stay 
  consistent across every step.
- Blinkit exposes JSON APIs that work from the page context, but the order list 
  has no year in its dates.

## Technical specifics

It's a Deno app (the news hadn't arrived when I built it) with two fronts: a 
browser wizard for humans, and a skill for AI agents. Both work on the same 
`orders.json` and `output.json`, so an agent can gather and split the orders, 
then stop and show you the table before anything is pushed.

The command line has seven verbs:

- `gather` collects orders from the four platforms, or takes manual entries.
- `validate` checks a split file before it goes anywhere.
- `push` sends the split to Splitwise. It's a dry run unless you pass `--yes`.
- `aggregate` prints a summary for hand entry when you don't have a Splitwise API key.
- `share` makes an encrypted link a friend can push from their account.
- `wizard` serves the browser app.
- `last-push` shows the last push so you can confirm it.

No account is needed for `aggregate`, and a friend with Splitwise access can 
push for you through `share`. The data lives in the per-user data directory, 
never in the repo, and `SPLIT_UTILS_STATE` moves it somewhere else so a trial 
run never touches real orders.

The browser wizard is built on 
[wizardkit](https://github.com/xyzshantaram/dotfiles-ai/tree/main/skills/wizardkit), 
which lets the same Deno script serve as HTML in a browser or a desktop window.

## Now

It takes about 10 minutes in the background to fetch a month's worth of orders,
30 mins or so for 6 months. We stress-tested it on my friend's backlog of orders
since May.

The assignment is still the time consuming part but with keyboard shortcuts it's
pretty fast - about 10 minutes of me at the computer to get through a month's 
work of orders. Now I order shit stress-free.

## Try it

The skill lives at [dotfiles-ai](https://github.com/xyzshantaram/dotfiles-ai/tree/main/skills/split-utils)
on GitHub.

To use with an AI agent, paste this into your assistant:

```
Install the split utils skill from [dotfiles-ai/skills/split-utils](https://github.com/xyzshantaram/dotfiles-ai/tree/main/skills/split-utils).
Read docs/schema.md for the output format.
Gather orders with scripts/cli.ts gather.
Write the split result as output.json.
Check the file with scripts/cli.ts validate before you push.
```

For the AI-free route (browser app), the README has the one-line installer for 
macOS, Linux and Windows.
