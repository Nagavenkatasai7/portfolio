// Single source of truth for every fact on the site.
//
// The page, the "Ask about my work" assistant and the Job-fit matcher all read
// from this file, so the site, the AI features and the resume cannot drift
// apart. Every sentence follows the resume: starts with a past-tense verb,
// names the tools, and states a measurable result. Nothing here goes beyond
// the resume or the public Hugging Face model card.

export const SITE_URL = 'https://chennunagavenkatasai.com';
export const RESUME_PATH = '/Naga_Venkata_Sai_Chennu_Resume.pdf';

export const person = {
  name: 'Naga Venkata Sai Chennu',
  shortName: 'Naga',
  title: 'AI Engineer',
  location: 'Fairfax, VA',
  email: 'nagavenkatasaichennu@gmail.com',
  summary:
    'I build LLM systems end to end: agents that call tools to finish real tasks, fine-tuned models that keep what they already knew, and the evaluations that prove both work.',
  rotating: ['LLM agents', 'tool calling', 'fine-tuning', 'model evaluation', 'RAG'],
  links: {
    linkedin: 'https://www.linkedin.com/in/naga-venkata-sai-chennu',
    github: 'https://github.com/Nagavenkatasai7',
    orcid: 'https://orcid.org/0009-0000-8252-8682',
  },
};

export const stats = [
  { value: 5, suffix: '', label: 'peer-reviewed papers' },
  { value: 50, suffix: '+', label: 'citations' },
  { value: 6000, suffix: '', label: 'chart images evaluated' },
  { value: 3, suffix: '', label: 'AI certifications' },
];

export const experience = [
  {
    id: 'smartremit',
    org: 'SmartRemit',
    short: 'SmartRemit',
    role: 'Co-founder & Lead Engineer',
    note: 'Sole engineer on a two-person founding team',
    place: 'Remote',
    dates: 'May 2026 – Present',
    link: { label: 'smartremit.ai', href: 'https://smartremit.ai' },
    intro:
      'Pre-launch startup designed to let people send money abroad over WhatsApp through licensed money-transfer companies.',
    tags: ['Next.js', 'TypeScript', 'WhatsApp Cloud API', 'LLM tool calling', 'PostgreSQL', 'Upstash Redis', 'Vercel'],
    bullets: [
      {
        id: 'smartremit-chatbot',
        text:
          'Led development of the WhatsApp chatbot (Next.js, TypeScript, WhatsApp Cloud API) that completes a money transfer inside one chat. The bot uses LLM tool calling to quote exchange rates, run Persona KYC identity checks, collect recipient details, and send the customer a payment link, so nobody has to leave WhatsApp or fill out a form.',
      },
      {
        id: 'smartremit-payments',
        text:
          'Designed the payment backend so no payment is ever charged or paid out twice. Every payment step carries an idempotency key, and each payment event is written through a transactional outbox in PostgreSQL, so a retry or a crash cannot repeat a charge. Customer data is envelope-encrypted, and every action lands in a full audit trail.',
      },
      {
        id: 'smartremit-partners',
        text:
          'Built a partner dashboard, a REST API, and signed webhooks so licensed partners can review transfers, check compliance, and connect their own systems. Deployed the platform on Vercel with Neon Postgres and Upstash Redis.',
      },
    ],
  },
  {
    id: 'gmu',
    org: 'George Mason University — Costello College of Business',
    short: 'GMU Graduate Research',
    role: 'AI Systems Engineer (Graduate Research Assistant)',
    place: 'Fairfax, VA',
    dates: 'Aug 2025 – May 2026',
    intro:
      'Automated a professor’s trademark research, replacing manual data collection and image review with a scraper and a multimodal LLM.',
    tags: ['Python', 'Web scraping', 'Claude Vision', 'Multimodal LLMs'],
    bullets: [
      {
        id: 'gmu-scraper',
        text:
          'Partnered with Dr. Saurabh Mishra to automate his trademark research. Built a Python scraper with caching and retry handling that collected ~200 USPTO opposition filings from TTABVue and TSDR and turned them into structured records ready for analysis.',
      },
      {
        id: 'gmu-vision',
        text:
          'Classified trademark images with Claude Vision (a multimodal LLM) at ~90% accuracy, which cut manual review time by ~60%.',
      },
    ],
  },
  {
    id: 'klu',
    org: 'KL University — Department of Computer Science & Engineering',
    short: 'KL University Research',
    role: 'Undergraduate Researcher, Applied ML',
    place: 'India',
    dates: 'Jan 2022 – May 2024',
    intro: 'Ran applied machine-learning research that led to peer-reviewed publications.',
    tags: ['scikit-learn', 'Ensemble learning', 'Grid search', 'Cross-validation'],
    bullets: [
      {
        id: 'klu-ensemble',
        text:
          'Implemented 4 classifiers (Decision Tree, Random Forest, SVM, Logistic Regression), tuned each with grid search and cross-validation, and combined them into an ensemble for hair-fall prediction. The ensemble reached 93% accuracy, compared with 89% for the best single model.',
      },
      {
        id: 'klu-papers',
        text:
          'Published 2 first-author papers, one on hair-fall prediction and one on AI in cybersecurity, and presented team research at IEEE ICICT 2023.',
      },
    ],
  },
];

export const projects = [
  {
    id: 'vlm',
    name: 'VLM Chart-Understanding Study',
    kicker: 'Evaluation research · CS 692, advised by Prof. Bo Han',
    question: 'Can a frontier vision-language model still read a chart once the chart is drawn in 3D?',
    tags: ['GPT-5.4', 'ChartX benchmark', 'McNemar’s test', 'Python'],
    bullets: [
      {
        id: 'vlm-eval',
        text:
          'Evaluated GPT-5.4 on chart question answering with the ChartX benchmark: 6,000 chart images across 18 chart types. Accuracy fell from 85.7% on 2D charts to 59.3% on 3D charts, and McNemar’s test showed the drop is statistically significant.',
      },
      {
        id: 'vlm-why',
        text:
          'Found why: 3D views hide or distort parts of the chart, so the model cannot read values it cannot see. Also found a flaw in the benchmark itself, where some questions asked for exact numbers the image never showed. Adding data labels to those charts raised accuracy from 51.6% to 97.7%.',
      },
    ],
    chart: 'vlm',
  },
  {
    id: 'llama',
    name: 'Finance-Tuned Llama 3.2 1B',
    kicker: 'Fine-tuning · Personal project',
    question: 'Can a small model learn finance without forgetting everything else it knew?',
    tags: ['LoRA', 'Hugging Face PEFT', 'TRL SFTTrainer', 'MMLU · GSM8K · IFEval'],
    link: { label: 'Model on Hugging Face', href: 'https://huggingface.co/Venkat9990/finance-specialist-v7' },
    bullets: [
      {
        id: 'llama-train',
        text:
          'Fine-tuned Llama 3.2 1B Instruct on 5,675 finance examples with LoRA (Hugging Face PEFT, TRL SFTTrainer) and published the model on Hugging Face. Cleaned the training data first, removing 72% of 20,000 loaded examples as noisy or duplicate.',
      },
      {
        id: 'llama-forgetting',
        text:
          'Benchmarked every version on MMLU, GSM8K, and IFEval. An earlier run lost 7.4 MMLU points to catastrophic forgetting, so I traced the cause and fixed it: lowered the LoRA rank to 8, trained only the attention layers, cut the learning rate 5x, and trained for a single epoch.',
      },
      {
        id: 'llama-result',
        text:
          'Held the final model at 45.9% on MMLU vs. 46.1% for the base model, and recovered 25.9 points on GSM8K and 15.7 points on IFEval compared with the earlier run. Training took under 7 minutes on one NVIDIA A100.',
      },
    ],
    chart: 'llama',
  },
  {
    id: 'mail',
    name: 'Mail Agent',
    kicker: 'Self-hosted AI mail platform · TypeScript',
    question: 'Can one private inbox triage and draft replies across every email account I own?',
    tags: ['TypeScript', 'Gemma via Ollama', 'AES-256-GCM', 'LLM triage'],
    bullets: [
      {
        id: 'mail-inbox',
        text:
          'Created a self-hosted web app that combines 5 email accounts (Gmail, iCloud, Fastmail, Zoho) into one inbox, with LLM triage and reply drafting powered by Gemma via Ollama, running locally or in the cloud.',
      },
      {
        id: 'mail-security',
        text:
          'Encrypted stored credentials with AES-256-GCM and sandboxed email HTML in an iframe, so a malicious email cannot run code inside the app. Automated follow-ups stop on their own when the recipient replies or unsubscribes.',
      },
    ],
  },
];

// Numbers behind the interactive charts. VLM figures come from the resume;
// Llama figures come from the public model card (finance-specialist-v7).
export const vlmResults = {
  dimension: [
    { label: '2D charts', value: 85.7 },
    { label: '3D charts', value: 59.3 },
  ],
  dataLabels: [
    { label: 'Without data labels', value: 51.6 },
    { label: 'With data labels', value: 97.7 },
  ],
};

export const llamaResults = {
  series: [
    { key: 'base', label: 'Base Llama 3.2 1B' },
    { key: 'v6', label: 'Earlier run (forgot)' },
    { key: 'v7', label: 'Final model' },
  ],
  benchmarks: [
    { name: 'MMLU', detail: 'general knowledge, 57 subjects', base: 46.05, v6: 38.67, v7: 45.86 },
    { name: 'GSM8K', detail: 'grade-school math reasoning', base: 33.59, v6: 6.07, v7: 31.99 },
    { name: 'IFEval', detail: 'instruction following', base: 43.07, v6: 25.32, v7: 41.04 },
  ],
};

export const publications = {
  items: [
    {
      id: 'pub-hairfall',
      title: 'Enhancing Hairfall Prediction: A Comparative Analysis of Individual Algorithms and an Ensemble Method',
      venue: 'IJRITCC',
      year: 2023,
      role: 'First author',
      href: 'https://doi.org/10.17762/ijritcc.v11i6s.6958',
    },
    {
      id: 'pub-cyber',
      title: 'Assessing the Effectiveness of Artificial Intelligence Techniques in Mitigating Cybersecurity Risks',
      venue: 'IJISAE',
      year: 2023,
      role: 'First author',
    },
  ],
  summary: '5 peer-reviewed papers (2 first-author, 50+ citations), including IEEE ICICT 2023.',
  icictHref: 'https://doi.org/10.1109/ICICT57646.2023.10134057',
};

export const education = [
  {
    id: 'edu-gmu',
    degree: 'M.S., Computer Science',
    school: 'George Mason University',
    place: 'Fairfax, VA',
    gpa: 'GPA 3.57 / 4.00',
    date: 'May 2026',
  },
  {
    id: 'edu-klu',
    degree: 'B.Tech, Computer Science & Engineering',
    school: 'KL University',
    place: 'India',
    gpa: 'GPA 8.7 / 10',
    date: 'May 2024',
  },
];

export const skills = [
  { id: 'skills-backend', group: 'Languages & Backend', items: ['Python', 'TypeScript', 'SQL', 'Bash', 'Next.js', 'FastAPI', 'PostgreSQL', 'Redis'] },
  { id: 'skills-llm', group: 'LLM & Agents', items: ['Claude API', 'OpenAI API', 'Ollama', 'Tool calling', 'RAG', 'Embeddings', 'Hybrid search', 'Chroma', 'Prompt engineering'] },
  { id: 'skills-ml', group: 'ML & Training', items: ['PyTorch', 'Hugging Face Transformers', 'TRL', 'PEFT', 'LoRA', 'QLoRA', 'DPO', 'GRPO', 'scikit-learn'] },
  { id: 'skills-deploy', group: 'Deployment & Evaluation', items: ['Docker', 'CI/CD', 'Vercel', 'AWS', 'vLLM', 'GGUF', 'Quantization', 'LLM evaluation (MMLU, GSM8K, IFEval)'] },
];

export const certifications = [
  { id: 'cert-aws', name: 'AWS Certified AI Practitioner', issuer: 'Amazon Web Services', href: 'https://www.credly.com/badges/b83ddb08-8a1f-42be-a0f1-8cf63652d43c' },
  { id: 'cert-nvidia', name: 'NVIDIA-Certified Associate: Generative AI LLMs', issuer: 'NVIDIA', href: 'https://www.credly.com/badges/872528da-8ea5-4efe-9e46-8bf599831274' },
  { id: 'cert-anthropic', name: 'Claude Code in Action', issuer: 'Anthropic', href: 'https://verify.skilljar.com/c/8hsq5c9qc9i5' },
];
