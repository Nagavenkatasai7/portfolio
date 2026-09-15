// lib/graph.js
// The only source of content for the COLDSTART homepage.
// Every string here is a résumé fact (spec §4). Every metric carries provenance.
// Node ids, order, lanes and edges are fixed: other modules treat ids as opaque strings.

export const LANES = ['DATA', 'TRAIN', 'EVAL', 'SERVE'];

export const FORBIDDEN = /visa|\bOPT\b|H-1B|sponsor|Salesforce|test automation/i;

const SIZE = { w: 320, h: 190 };
const COL = { DATA: 0, TRAIN: 380, EVAL: 760, SERVE: 1140 };

const APPS = [
  { name: 'IntelliDoc-Nexus', href: '/intellidoc', thumb: '/assets/projects/intellidoc.jpg' },
  { name: 'AI Business Request Intake & Jira Automation', href: '/jira-automation', thumb: '/assets/projects/jira-automation.jpg' },
  { name: 'AI Automation ROI & Process Optimization', href: '/automation-roi', thumb: '/assets/projects/automation-roi.jpg' },
  { name: 'Healthcare Workflow Automation & EMR Extraction', href: '/healthcare-emr', thumb: '/assets/projects/healthcare-emr.jpg' },
  { name: 'Product Master-Data Automation & Quality Control', href: '/master-data', thumb: '/assets/projects/master-data.jpg' },
  { name: 'Revenue Operations Automation Dashboard', href: '/revops', thumb: '/assets/projects/revops.jpg' },
  { name: 'Resume Tailor', href: '/resume-tailor', thumb: '/assets/projects/resume-tailor.jpg' },
  { name: 'PassportPathways', href: '/passport', thumb: '/assets/projects/passport.jpg' },
];

// NODES are in topological / reading order: DOM order == tab order.
// cuda.kernel precedes llm-forge because cuda.kernel -> llm-forge is an edge,
// while keeping its layout row at y = 460.
export const NODES = [
  {
    id: 'identity.yaml',
    lane: 'DATA',
    title: 'identity.yaml',
    human: 'Naga Venkata Sai Chennu',
    kind: 'identity',
    pos: { x: COL.DATA, y: 0 },
    size: { ...SIZE },
    lod: {
      0: 'AI Systems Engineer - LLM systems, evals, and serving - Fairfax, VA',
      1: [
        'Naga Venkata Sai Chennu - AI Systems Engineer',
        'LLM systems, evals, and serving',
        'Fairfax, VA',
        'Available now, open to remote',
      ],
      2: {
        demo: null,
        body: [
          'This page is the work itself, wired up as a graph. The DATA lane is where I come from, TRAIN is what I built, EVAL is how I checked it, SERVE is what runs.',
          'Nothing here is a claim without a source. Every number on a card is tagged: taken from the résumé, or computed in your browser from the data that ships with the page.',
          'If the graph is not how you want to read this, the résumé PDF and the plain-text version are one key away, top right.',
        ],
        source: null,
      },
    },
    // Availability is a status, not a résumé number, so it is not tagged as one.
    // The claim itself still stands in lod1, where it reads as a statement rather
    // than as a sourced metric.
    metrics: [
      { label: 'location', value: 'Fairfax, VA', provenance: 'resume' },
    ],
    links: [
      { label: 'Email', href: 'mailto:nagavenkatasaichennu@gmail.com' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/naga-venkata-sai-chennu/' },
      { label: 'GitHub', href: 'https://github.com/Nagavenkatasai7' },
      { label: 'Résumé', href: '/Naga_Chennu_Resume.pdf' },
      { label: 'Book 30 min', href: 'https://fantastical.app/vhrdnrbmgt/chennunagavenkatasai' },
    ],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'experience.gmu',
    lane: 'DATA',
    title: 'experience.gmu',
    human: 'AI Systems Engineer, George Mason University',
    kind: 'experience',
    pos: { x: COL.DATA, y: 230 },
    size: { ...SIZE },
    lod: {
      0: 'AI Systems Engineer, GMU Costello College of Business, Aug 2025 - May 2026',
      1: [
        'Built llm-forge, a config-driven 12-stage SFT pipeline (LoRA, QLoRA, GRPO) on a 4x NVIDIA H100 SLURM cluster, halving time-to-first-experiment.',
        'Caught a TRL v0.20.0 regression that silently dropped assistant-only loss masking, and restored masking for every run.',
        "Built a 900-check regression suite scored against human-labeled ground truth with McNemar's exact test and ANOVA, surfacing model regressions before release.",
        'Shipped a Claude API extraction service over 500+ multi-page USPTO and legal filings, constrained to a Pydantic v2 schema at 95% field-level accuracy.',
        'Ran an MCP server routing multi-step tool calls across 2,000+ records and published fine-tuned models to Hugging Face for two faculty research groups.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint at Costello was shared hardware and researchers who are not engineers. A training run had to be launchable from one config file, and it had to be reproducible by the person who did not write it.',
          'So the work split three ways: a pipeline that turns configuration into runs, an evaluation layer that decides whether a change is real, and serving code that puts the results in front of faculty.',
          'What came out of it is the rest of this graph. The TRAIN, EVAL and SERVE lanes are all this role.',
        ],
        source: null,
      },
    },
    metrics: [
      { label: 'dates', value: 'Aug 2025 - May 2026', provenance: 'resume' },
      { label: 'org', value: 'George Mason University, Costello College of Business', provenance: 'resume' },
    ],
    links: [],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'experience.klu',
    lane: 'DATA',
    title: 'experience.klu',
    human: 'Research Assistant, Koneru Lakshmaiah University',
    kind: 'experience',
    pos: { x: COL.DATA, y: 460 },
    size: { ...SIZE },
    lod: {
      0: 'Research Assistant, Koneru Lakshmaiah University, Dept. of CSE, Aug 2020 - May 2024',
      1: [
        'Benchmarked a four-classifier ensemble against single-model baselines for physiological stress detection, reaching 93% accuracy and 92% F1 with t-test and ANOVA significance testing rather than a single held-out split.',
        'Selected CatBoost over an ANN for psychological stress detection on measured accuracy (89%) and precision (91%), then deployed the winning model into a dashboard operated by non-technical reviewers.',
      ],
      2: {
        demo: null,
        body: [
          'The department wanted model comparisons that would survive a reviewer. A single accuracy number from one split does not.',
          'The habit that stuck came from here: before claiming a model is better, test whether the difference could be noise, and say which test you ran.',
          'That is the same reasoning the EVAL lane runs on today, just applied to larger models.',
        ],
        source: null,
      },
    },
    metrics: [
      { label: 'dates', value: 'Aug 2020 - May 2024', provenance: 'resume' },
      { label: 'department', value: 'Dept. of CSE', provenance: 'resume' },
      { label: 'ensemble accuracy', value: '93%', provenance: 'resume' },
      { label: 'ensemble F1', value: '92%', provenance: 'resume' },
      { label: 'CatBoost accuracy', value: '89%', provenance: 'resume' },
      { label: 'CatBoost precision', value: '91%', provenance: 'resume' },
    ],
    links: [],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'education',
    lane: 'DATA',
    title: 'education',
    human: 'Education',
    kind: 'education',
    pos: { x: COL.DATA, y: 690 },
    size: { ...SIZE },
    lod: {
      0: 'M.S. Computer Science, GMU, May 2026; B.Tech CSE, KL University, May 2024',
      1: [
        'M.S. Computer Science, George Mason University, Aug 2024 - May 2026 - GPA 3.57/4.00',
        'B.Tech Computer Science and Engineering, KL University, Aug 2020 - May 2024',
        'First Class with Distinction',
      ],
      2: {
        demo: null,
        body: [
          'Two degrees, four years apart in method: the undergraduate work was classical machine learning and statistics, the masters work is LLM systems.',
          'The overlap is the part that matters here - both taught measurement before claims, which is why this page halts at a failure instead of showing only finished results.',
        ],
        source: null,
      },
    },
    metrics: [
      { label: 'GPA', value: '3.57/4.00', provenance: 'resume' },
      { label: 'B.Tech standing', value: 'First Class with Distinction', provenance: 'resume' },
    ],
    links: [],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'publications',
    lane: 'DATA',
    title: 'publications',
    human: 'Publications and patent',
    kind: 'papers',
    pos: { x: COL.DATA, y: 920 },
    size: { ...SIZE },
    lod: {
      0: 'IEEE ICICT 2023, three first-author papers, one patent pending',
      1: [
        'IEEE ICICT 2023 - doi 10.1109/ICICT57646.2023.10134057',
        'First-author paper, IJRITCC 2023',
        'First-author papers, IJISAE 2023 and IJISAE 2024',
        'Smart FuelGuard - patent pending',
      ],
      2: {
        demo: null,
        body: [
          'Writing the papers is where the evaluation discipline was forced. A conference reviewer will ask what the baseline was and whether the difference is significant, and there is no way to answer that after the fact.',
          'The patent came out of the same loop: describe the mechanism precisely enough that someone else can tell whether it works.',
        ],
        source: 'https://doi.org/10.1109/ICICT57646.2023.10134057',
      },
    },
    metrics: [
      { label: 'DOI', value: '10.1109/ICICT57646.2023.10134057', provenance: 'resume' },
      { label: 'first-author papers', value: '3', provenance: 'resume' },
    ],
    links: [{ label: 'IEEE ICICT 2023', href: 'https://doi.org/10.1109/ICICT57646.2023.10134057' }],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'skills.registry',
    lane: 'DATA',
    title: 'skills.registry',
    human: 'Skills registry',
    kind: 'skills',
    pos: { x: COL.DATA, y: 1150 },
    size: { ...SIZE },
    lod: {
      0: 'Production / Working / Methods - focus a skill to outline the nodes that use it',
      // The tier payloads are the résumé's, verbatim — the same three strings
      // api/_persona.mjs carries. tests/graph.test.mjs asserts each one is a
      // substring of SYSTEM_PROMPT, because the two must not drift: this is the
      // node a recruiter screens on, and every drift last time moved upward.
      1: [
        'Production: Python (PyTorch, Hugging Face Transformers, TRL, PEFT, scikit-learn), SQL (PostgreSQL), Docker, Linux, Git.',
        'Working: FastAPI, Model Context Protocol (MCP), SLURM, CUDA, CatBoost, TypeScript, AWS, NVIDIA Jetson.',
        "Methods: supervised fine-tuning (SFT), LoRA, QLoRA, GRPO, Retrieval-Augmented Generation (RAG), constrained tool calling and structured outputs, eval harness design, error taxonomy, McNemar's exact test, ANOVA, t-tests.",
      ],
      2: {
        demo: null,
        body: [
          'The tiers are honest about depth. Production means I have run it against a deadline on shared hardware and fixed it when it broke. Working means I have shipped with it and would need a day to be fast again.',
          'Methods is the tier that transfers. Tools change every year; deciding whether a change is real does not.',
          'Each skill here is a filter: focus one and every node that exercises it is outlined, so the claim can be checked against the work rather than taken on trust.',
        ],
        source: null,
      },
    },
    metrics: [],
    links: [],
    thumb: null,
    run: { durationMs: 500, halts: false },
  },

  {
    id: 'cuda.kernel',
    lane: 'TRAIN',
    title: 'cuda.kernel',
    human: 'Tiled CUDA matmul kernel',
    kind: 'work',
    pos: { x: COL.TRAIN, y: 460 },
    size: { ...SIZE },
    lod: {
      0: 'Tiled CUDA matmul benchmarked against cuBLAS; shared memory and block size tuned',
      1: [
        'Tiled matrix-multiplication kernel written in C++ and CUDA.',
        'Benchmarked against the cuBLAS baseline on every change.',
        'Tuned shared-memory tiling and thread-block size against the measured tradeoff.',
        'No speed claim is made here - the point was the measurement loop.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint is that a naive matmul is memory-bound: it re-reads the same values from global memory far more often than it needs to.',
          'Tiling into shared memory changes the arithmetic intensity, and block size decides occupancy. Both were tuned by measuring against cuBLAS rather than by reasoning about the hardware in the abstract.',
          'This node sits upstream of the training pipeline for a reason: knowing what the GPU is actually doing is what makes a training run debuggable instead of mysterious.',
        ],
        source: null,
      },
    },
    metrics: [],
    links: [],
    thumb: '/assets/projects/cuda.jpg',
    run: { durationMs: 700, halts: false },
  },

  {
    id: 'llm-forge',
    lane: 'TRAIN',
    title: 'llm-forge',
    human: 'Config-driven SFT training pipeline',
    kind: 'work',
    pos: { x: COL.TRAIN, y: 0 },
    size: { ...SIZE },
    lod: {
      0: 'Config-driven 12-stage SFT pipeline: LoRA, QLoRA, GRPO on a 4x H100 SLURM cluster',
      1: [
        'Config-driven 12-stage SFT pipeline: one config file launches a full run.',
        'LoRA, QLoRA and GRPO training paths behind the same interface.',
        'Runs on a 4x NVIDIA H100 SLURM cluster shared across research groups.',
        'Halved time-to-first-experiment for researchers who do not write the pipeline.',
        'Open source: github.com/Nagavenkatasai7/llm-forge',
      ],
      2: {
        demo: null,
        body: [
          'The constraint was a shared cluster and users who are researchers, not engineers. Every hand-edited launch script is a way to lose a night of GPU time to a typo nobody reviewed.',
          'What was measured was time-to-first-experiment: how long from having an idea to having a job on the queue. Making the config the only surface, and validating it before submission, is what moved that number.',
          'The result was half the previous time, and runs that can be repeated by someone who did not set them up. The cost of that design shows up in the next node: when the pipeline is uniform, an upstream library change breaks every run at once.',
        ],
        source: 'https://github.com/Nagavenkatasai7/llm-forge',
      },
    },
    metrics: [
      { label: 'time-to-first-experiment', value: 'halved', provenance: 'resume' },
      { label: 'cluster', value: '4x NVIDIA H100 SLURM', provenance: 'resume' },
    ],
    links: [{ label: 'repo', href: 'https://github.com/Nagavenkatasai7/llm-forge' }],
    thumb: '/assets/projects/llm-forge.jpg',
    run: { durationMs: 900, halts: false },
  },

  {
    id: 'loss-mask.patch',
    lane: 'TRAIN',
    title: 'loss-mask.patch',
    human: 'Assistant-only loss masking, restored',
    kind: 'work',
    pos: { x: COL.TRAIN, y: 230 },
    size: { ...SIZE },
    lod: {
      0: 'TRL v0.20.0 silently dropped assistant-only loss masking; found it, restored it',
      1: [
        'TRL v0.20.0 stopped applying assistant-only loss masking, with no error and no warning.',
        'Found by inspecting token-level loss across SFT checkpoints, not from a failing job.',
        'Prompt tokens were training the model alongside the answers it was supposed to learn.',
        'Masking restored for every run in the pipeline, and pinned so the regression cannot return silently.',
      ],
      2: {
        demo: 'LossMask',
        body: [
          'The constraint is that this failure is invisible. The job succeeds, the loss curve goes down, the checkpoints are written. Nothing tells you the model is being trained on the prompt as well as the answer.',
          'What was measured was token-level loss inside the checkpoints, split by role. Prompt tokens should contribute nothing. They were contributing, which is the only place the upstream change was visible.',
          'The fix restored assistant-only masking for every run and pinned the upstream version, so this cannot come back without someone noticing. Press P to apply it here and the run continues.',
        ],
        source: 'lib/coldstart/lossmask.js',
      },
    },
    metrics: [{ label: 'upstream', value: 'trl==0.20.0', provenance: 'resume' }],
    links: [],
    thumb: null,
    run: { durationMs: 1200, halts: true, patchKey: 'P' },
  },

  {
    id: 'regression.suite',
    lane: 'EVAL',
    title: 'regression.suite',
    human: 'Regression suite against human-labeled ground truth',
    kind: 'work',
    pos: { x: COL.EVAL, y: 0 },
    size: { ...SIZE },
    lod: {
      0: '900-check regression suite against human-labeled ground truth',
      1: [
        '900 checks run against human-labeled ground truth.',
        "McNemar's exact test and ANOVA decide whether a difference is real or noise.",
        'Regressions surface before release, not after a researcher reports a bad run.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint is that a pipeline with many stages fails quietly: a config error or an upstream change shows up as slightly worse output, which looks like variance.',
          'What is measured is agreement with human labels, check by check, and then whether the change in agreement is statistically distinguishable from chance.',
          'The result is that a regression is a failed check with a name attached, rather than a feeling that the model got worse. The previous node is exactly the kind of failure this exists to catch.',
        ],
        source: 'lib/coldstart/stats.js',
      },
    },
    metrics: [{ label: 'checks', value: '900', provenance: 'resume' }],
    links: [],
    thumb: null,
    run: { durationMs: 800, halts: false },
  },

  {
    id: 'chartx.eval',
    lane: 'EVAL',
    title: 'chartx.eval',
    human: 'Vision-language chart understanding',
    kind: 'work',
    pos: { x: COL.EVAL, y: 230 },
    size: { ...SIZE },
    lod: {
      0: 'GPT-5.4 across all 6,000 ChartX images, 18 chart types',
      1: [
        'Evaluated GPT-5.4 on all 6,000 ChartX images across 18 chart types.',
        'Position-encoded charts scored 91-95%; treemaps scored 51.6%.',
        'Re-rendering the treemaps with explicit value labels moved accuracy to 97.7%.',
        "McNemar's exact test on the discordant pairs: p = 0.0003.",
        'The benchmark was the flaw, not the model.',
      ],
      2: {
        demo: 'ChartX',
        body: [
          'The constraint was a result that looked like a model weakness: near-ceiling accuracy on position-encoded charts and a collapse on treemaps, on the same model, in the same run.',
          'What was tested next was the benchmark rather than the model. Reading the failing cases showed the treemap ground truth had never been visually recoverable from the image, so the treemaps were re-rendered with explicit value labels and the same model re-scored.',
          'Accuracy moved from 51.6% to 97.7%, and McNemar on the discordant pairs put it at p = 0.0003 - the change is not noise. The honest conclusion is that the benchmark was broken, which is a result worth more than a leaderboard number.',
        ],
        source: 'https://github.com/Nagavenkatasai7/vlm-eval-immersive-analytics',
      },
    },
    metrics: [
      { label: 'images', value: '6,000', provenance: 'resume' },
      { label: 'chart types', value: '18', provenance: 'resume' },
      { label: 'treemap accuracy', value: '51.6% -> 97.7%', provenance: 'resume' },
      { label: 'McNemar', value: 'p = 0.0003', provenance: 'resume' },
    ],
    links: [{ label: 'repo', href: 'https://github.com/Nagavenkatasai7/vlm-eval-immersive-analytics' }],
    thumb: null,
    run: { durationMs: 1600, halts: false },
  },

  {
    id: 'extract.svc',
    lane: 'SERVE',
    title: 'extract.svc',
    human: 'Schema-constrained document extraction service',
    kind: 'work',
    pos: { x: COL.SERVE, y: 0 },
    size: { ...SIZE },
    lod: {
      0: 'Claude API extraction over 500+ multi-page USPTO and legal filings',
      1: [
        'Extraction service built on the Claude API for multi-page documents.',
        'Runs over 500+ multi-page USPTO and legal filings.',
        'Tool-call output constrained to a Pydantic v2 schema, so malformed output cannot be returned.',
        '95% field-level accuracy against human labels.',
        'Manual review effort down about 80%.',
      ],
      2: {
        demo: 'SchemaCheck',
        body: [
          'The constraint is that a filing is long, inconsistently formatted, and read by a person who is legally accountable for the fields pulled out of it. Free-text output from a model is not usable there.',
          'What was measured is field-level agreement with human labels, field by field rather than document by document, because one wrong date matters more than a paragraph of prose.',
          'Constraining the tool call to a Pydantic v2 schema made wrong shapes unrepresentable, and the remaining errors were value errors that review could target. Accuracy landed at 95% and manual review effort fell by about 80%.',
        ],
        source: 'lib/coldstart/schema.js',
      },
    },
    metrics: [
      { label: 'filings', value: '500+', provenance: 'resume' },
      { label: 'field-level accuracy', value: '95%', provenance: 'resume' },
      { label: 'manual review effort', value: '~80% lower', provenance: 'resume' },
    ],
    links: [],
    thumb: null,
    run: { durationMs: 900, halts: false },
  },

  {
    id: 'mcp.server',
    lane: 'SERVE',
    title: 'mcp.server',
    human: 'MCP server for multi-step tool calls',
    kind: 'work',
    pos: { x: COL.SERVE, y: 230 },
    size: { ...SIZE },
    lod: {
      0: 'MCP server routing multi-step tool calls across 2,000+ records',
      1: [
        'MCP server routes multi-step tool calls across 2,000+ records.',
        'Extraction throughput up about 30%.',
        'Fine-tuned models published to Hugging Face for two faculty research groups.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint is that a research workflow is a chain of tool calls, and every hop is somewhere the run can stall or repeat work it already did.',
          'Routing those calls through one MCP server raised extraction throughput by about 30%, and the fine-tuned models that came out of the work were published to Hugging Face for the two groups that use them.',
        ],
        source: null,
      },
    },
    metrics: [
      { label: 'records', value: '2,000+', provenance: 'resume' },
      { label: 'extraction throughput', value: '~30% higher', provenance: 'resume' },
    ],
    // No link here: the résumé names no profile or org URL, and a link to
    // huggingface.co's homepage would imply evidence it does not carry.
    links: [],
    thumb: null,
    run: { durationMs: 700, halts: false },
  },

  {
    id: 'jetbot',
    lane: 'SERVE',
    title: 'jetbot',
    human: 'On-device agent on Jetson Orin Nano',
    kind: 'work',
    pos: { x: COL.SERVE, y: 460 },
    size: { ...SIZE },
    lod: {
      0: 'On-device agent on a Jetson Orin Nano, with a human approval gate on every action',
      1: [
        'On-device agent running on a Jetson Orin Nano.',
        'Nemotron served through OpenRouter.',
        'SQLite FTS5 memory for recall on constrained hardware.',
        'cgroups v2 isolation and human-approval gates before anything destructive.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint is edge hardware: limited memory, limited compute, and an agent that can touch the machine it runs on.',
          'Memory is SQLite with FTS5 because full-text search over local history costs almost nothing there, and inference is routed out through OpenRouter rather than run on the board.',
          'The safety property is deliberate and unglamorous: cgroups v2 keeps the agent inside its resource budget, and anything destructive waits for a human to approve it.',
        ],
        source: null,
      },
    },
    metrics: [],
    links: [],
    thumb: '/assets/projects/jetbot.jpg',
    run: { durationMs: 600, halts: false },
  },

  {
    id: 'deployed.apps',
    lane: 'SERVE',
    title: 'deployed.apps',
    human: 'Eight live applications',
    kind: 'apps',
    pos: { x: COL.SERVE, y: 690 },
    size: { ...SIZE },
    lod: {
      0: 'Eight live apps, each deployed and reachable from a short link',
      1: [
        'Eight applications built and deployed, all of them live.',
        'Each one is reachable from a short link on this domain.',
        'Thumbnails open the running app, not a screenshot gallery.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint here is the one every portfolio has: a description of an app is not evidence that it runs.',
          'So these are deployed rather than described. Each card links straight through to the live app, and what you see is what is serving.',
          'They range from document intelligence to operations dashboards, and they are the reason the SERVE lane exists at all.',
        ],
        source: null,
      },
    },
    apps: APPS,
    // Counted from the APPS array below, in code — that is 'computed', not a
    // number lifted off the résumé.
    metrics: [{ label: 'live apps', value: String(APPS.length), provenance: 'computed' }],
    links: APPS.map((a) => ({ label: a.name, href: a.href })),
    thumb: '/assets/projects/intellidoc.jpg',
    run: { durationMs: 600, halts: false },
  },

  {
    id: 'ask-naga',
    lane: 'SERVE',
    title: 'ask-naga',
    human: 'Ask about this work',
    kind: 'ask',
    pos: { x: COL.SERVE, y: 920 },
    size: { ...SIZE },
    lod: {
      0: 'Ask a question, or paste a job description, and the graph moves to the answer',
      1: [
        'Ask in plain language and the camera moves to the node that answers.',
        'Paste a job description and the matching subgraph lights up, scored locally.',
        'Three suggested questions run with no network call at all.',
        'If the model is unreachable, a local matcher picks the node and says so.',
      ],
      2: {
        demo: null,
        body: [
          'The constraint is that a chat box on a portfolio can say anything, including things that are not true about the person it claims to speak for.',
          'So the reply is not rendered as prose. It is bound to an enum: the model may choose one node id from this graph and a short caption, and anything else is discarded.',
          'Job descriptions never leave your browser - that path is a deterministic keyword match over the same data, and it prints what it read you as.',
        ],
        source: 'lib/coldstart/nav.js',
      },
    },
    metrics: [],
    links: [{ label: 'Email', href: 'mailto:nagavenkatasaichennu@gmail.com' }],
    thumb: null,
    run: { durationMs: 400, halts: false },
  },
];

export const NODE_IDS = NODES.map((n) => n.id);

const LANE_OF = Object.fromEntries(NODES.map((n) => [n.id, n.lane]));

const EDGE_PAIRS = [
  ['identity.yaml', 'llm-forge'],
  ['experience.gmu', 'llm-forge'],
  ['experience.gmu', 'loss-mask.patch'],
  ['experience.klu', 'regression.suite'],
  ['education', 'llm-forge'],
  ['publications', 'chartx.eval'],
  ['skills.registry', 'llm-forge'],
  ['cuda.kernel', 'llm-forge'],
  ['llm-forge', 'loss-mask.patch'],
  ['loss-mask.patch', 'regression.suite'],
  ['loss-mask.patch', 'chartx.eval'],
  ['regression.suite', 'extract.svc'],
  ['chartx.eval', 'extract.svc'],
  ['extract.svc', 'mcp.server'],
  ['mcp.server', 'jetbot'],
  ['mcp.server', 'deployed.apps'],
  ['deployed.apps', 'ask-naga'],
];

// lane of an edge is the lane of its destination node
export const EDGES = EDGE_PAIRS.map(([from, to]) => ({ from, to, lane: LANE_OF[to] }));

export const GRAPH = { lanes: LANES, nodes: NODES, edges: EDGES };

const BY_ID = new Map(NODES.map((n) => [n.id, n]));

export function nodeById(id) {
  return BY_ID.get(id);
}
