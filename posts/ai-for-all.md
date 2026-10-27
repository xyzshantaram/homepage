---
title: "AI For All"
description: "a free, captcha-gated proxy for AI inference"
hidden: true
created-date: 2026-10-19
tags:
  - technical
---

## AI For All

AI For All is a free, captcha-gated proxy for AI inference. No account, no API
key to buy.

When I was younger and first getting interested in AI, I had no money for
inference tokens. Inference is cheap enough now, and I am fortunate enough, that
I can give away a small amount to people who want to learn and experiment. There
is a practical reason too: I wanted a way for people to try the open models
behind Thursday's experiments without setting up an account somewhere.

Your computer solves a small proof-of-work challenge, and you get a disposable
key valid for 24 hours. The API is OpenAI-compatible, so it works with anything
that speaks that protocol. There are two model aliases: `local` (Qwen3.8 Flash)
and `frontier` (DeepSeek V4.1 Flash). The limits are 25 requests an hour per IP
and per key, 16k input and output tokens, and a 32k context. The whole thing is
backed by an OpenRouter key with a few dollars in credit; if it runs out, I add
more.

It is as much an experiment in cheap and open models as it is an experiment in
human kindness. Use it for small experiments, not agentic workflows. You can
also host a copy yourself and keep all the goodwill for your own.

[Get a key](https://ai-for-all.trythursday.org) ·
[Source](https://github.com/trythursday/ai-for-all)
