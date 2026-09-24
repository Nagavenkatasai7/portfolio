---
title: Finance Llama Demo
emoji: 💹
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Base Llama 3.2 1B vs. a LoRA finance fine-tune, side by side
---

# Finance-Llama: base vs. fine-tuned

Backend for the live demo on [chennunagavenkatasai.com](https://chennunagavenkatasai.com/#lab).
It answers one finance question with two models and returns both answers:

- **Base:** `bartowski/Llama-3.2-1B-Instruct-GGUF` (Q4_K_M)
- **Fine-tuned:** [`Venkat9990/finance-specialist-v7`](https://huggingface.co/Venkat9990/finance-specialist-v7) (Q4_K_M)

The portfolio calls the `compare` endpoint through Gradio's HTTP API:
`POST /gradio_api/call/compare` with `{"data": ["<question>"]}`, then reads the
result stream from `GET /gradio_api/call/compare/<event_id>`. The result is
`[base_answer, tuned_answer, seconds]`.
