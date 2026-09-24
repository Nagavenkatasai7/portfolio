"""Finance-Llama side-by-side demo (Hugging Face Space).

Runs the base Llama 3.2 1B Instruct model and Naga's finance-tuned version
(finance-specialist-v7) on the same question, as 4-bit GGUF models on CPU via
llama.cpp. The portfolio site calls the `compare` API endpoint.

Set MOCK_MODELS=1 to run without downloading the models (for local testing).
"""

import os
import time

import gradio as gr

BASE_MODEL = ("bartowski/Llama-3.2-1B-Instruct-GGUF", "Llama-3.2-1B-Instruct-Q4_K_M.gguf")
TUNED_MODEL = ("Venkat9990/finance-specialist-v7", "gguf/finance-specialist-v7-Q4_K_M.gguf")

# Both models get the same system prompt, so the only difference is the fine-tune.
SYSTEM_PROMPT = (
    "You are a finance specialist AI assistant. You provide accurate, well-reasoned "
    "financial explanations based on established financial principles. Answer in under "
    "150 words."
)
MAX_QUESTION_CHARS = 300
MAX_NEW_TOKENS = 220
MOCK = os.environ.get("MOCK_MODELS") == "1"


def _load(repo_id, filename):
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama

    path = hf_hub_download(repo_id=repo_id, filename=filename)
    return Llama(
        model_path=path,
        n_ctx=2048,
        n_threads=os.cpu_count() or 2,
        chat_format="llama-3",
        verbose=False,
    )


if MOCK:
    base_llm = tuned_llm = None
else:
    base_llm = _load(*BASE_MODEL)
    tuned_llm = _load(*TUNED_MODEL)


def _answer(llm, question, label):
    if llm is None:
        return f"[mock {label}] {question}"
    out = llm.create_chat_completion(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        max_tokens=MAX_NEW_TOKENS,
        temperature=0.1,
        top_k=40,
        repeat_penalty=1.1,
    )
    return out["choices"][0]["message"]["content"].strip()


def compare(question):
    question = " ".join((question or "").split())[:MAX_QUESTION_CHARS]
    if len(question) < 3:
        raise gr.Error("Ask a finance question of at least 3 characters.")
    start = time.time()
    base = _answer(base_llm, question, "base")
    tuned = _answer(tuned_llm, question, "tuned")
    return base, tuned, round(time.time() - start, 1)


with gr.Blocks(title="Finance-Llama: base vs. fine-tuned") as demo:
    gr.Markdown(
        "# Finance-Llama: base vs. fine-tuned\n"
        "Same question, two models: **Llama 3.2 1B Instruct** and "
        "[**finance-specialist-v7**](https://huggingface.co/Venkat9990/finance-specialist-v7), "
        "fine-tuned with LoRA by Naga Venkata Sai Chennu. Both run as 4-bit GGUF on CPU."
    )
    question = gr.Textbox(label="Finance question", placeholder="What is a bond yield curve inversion?", max_lines=3)
    ask = gr.Button("Compare", variant="primary")
    with gr.Row():
        base_out = gr.Textbox(label="Base Llama 3.2 1B", lines=10)
        tuned_out = gr.Textbox(label="Finance-tuned (v7)", lines=10)
    seconds = gr.Number(label="Seconds", precision=1)
    ask.click(compare, inputs=question, outputs=[base_out, tuned_out, seconds], api_name="compare")
    question.submit(compare, inputs=question, outputs=[base_out, tuned_out, seconds], api_name=False)

# One request at a time: two 1B models on 2 vCPUs are CPU-bound.
demo.queue(default_concurrency_limit=1, max_size=16)

if __name__ == "__main__":
    demo.launch()
