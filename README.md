# Naga Venkata Sai Chennu — AI Engineer Portfolio

[![CI](https://github.com/Nagavenkatasai7/portfolio/actions/workflows/ci.yml/badge.svg?branch=platform)](https://github.com/Nagavenkatasai7/portfolio/actions/workflows/ci.yml)
&nbsp;•&nbsp; **Live:** [chennunagavenkatasai.com](https://chennunagavenkatasai.com)

A one-page portfolio with three working AI features built in. Every fact on the
site lives in one file, `content/profile.js`, which matches the resume. The page and both
LLM features read from it, so they cannot drift apart.

## AI Lab

| Feature | What it does | How it works |
|---|---|---|
| **Ask about my work** | Answers questions about my experience with citations. | BM25 retrieval over resume passages → free OpenRouter model answers only from those passages → server keeps only citations that match a real passage. Falls back to showing the retrieved passages if every model is down. |
| **Job-fit check** | Maps a pasted job description to evidence, and lists gaps. | LLM returns JSON (requirement, match, evidence ids) → server validates every id against the knowledge base and downgrades unsupported claims. Falls back to a word-boundary keyword matcher. |
| **Finance-Llama live** | Base Llama 3.2 1B vs. my fine-tuned model, side by side. | Next.js route proxies to a Hugging Face Space (`space/`) running both GGUF models with llama.cpp on a free CPU tier. |

The site also has interactive charts for the VLM study (2D vs. 3D, data-label fix) and the Llama fine-tune (base vs. earlier run vs. final).

**Abuse limits.** All three API routes reject cross-site browser requests, validate input size, and rate-limit per IP (per minute and per day) plus a global per-minute cap. The LLMs are free models, so abuse can use up the free quota (the fallbacks then take over) but cannot create a bill.

## Layout

```
content/profile.js      every fact on the site (single source of truth)
lib/knowledge.js        profile -> citable passages with page anchors
lib/search.js           BM25 retrieval
lib/ask.js, lib/fit.js  the two LLM features + their fallbacks
lib/llm.js              OpenRouter client with a free-model fallback chain
lib/space.js            Gradio HTTP client for the Llama Space
lib/ratelimit.js        in-memory sliding-window limiter
app/                    Next.js App Router page, API routes, SEO, OG image
components/             hero canvas, charts, AI Lab panels
space/                  Hugging Face Space (Gradio + llama.cpp)
tests/                  node --test unit tests
```

## Run locally

```bash
npm ci
cp .env.example .env.local   # optional: add OPENROUTER_API_KEY / HF_SPACE_URL
npm run dev
npm test
```

Without any keys the site works fully; the AI features use their offline fallbacks.

## Environment variables (Vercel)

| Name | Needed for | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Ask + Job-fit | Free models only. Set it for **Production and Preview**. |
| `HF_SPACE_URL` | Finance-Llama live | The Space's `https://<owner>-<name>.hf.space` URL. Not a secret. |
| `OPENROUTER_MODELS` | optional | Comma-separated override when free models change. |

## Deploy the Llama Space

1. On Hugging Face, create a new **Space** → SDK **Gradio** → hardware **CPU basic (free)**.
2. Upload the three files in `space/` (`app.py`, `requirements.txt`, `README.md`).
3. Wait for the first build (installing `llama-cpp-python` takes about 10 minutes) and model download.
4. Copy the Space URL (`https://<owner>-<name>.hf.space`) into `HF_SPACE_URL` in Vercel, then redeploy.

Free Spaces sleep after 48 hours without traffic; the first request after that takes a few minutes, and the site says so.
