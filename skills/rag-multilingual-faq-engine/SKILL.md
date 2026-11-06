---
name: rag-multilingual-faq-engine
description: Indexing, retrieval, and Google-Translate + Human-in-the-Loop multilingual translation skill for all AdRadarHQ FAQs, Website UI sentences, Radar Feed Searches, AI Creative Remixes, and Customize AI Strategy works. Compatible across all AI models including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna.
---

# RAG & Multilingual FAQ / Website Sentence Corpus Skill

## Purpose
This skill governs the **AdRadarHQ Retrieval-Augmented Generation (RAG) & Multilingual Translation Engine**, fulfilling two core mandates:
1. **Comprehensive Website & AI Works Sentence Corpus:** Maintains a complete, searchable list of all sentences used across the website UI, all 27+ FAQs, and all AI works including **Radar Feed Searches**, **AI Creative Remixes**, and **Customize AI Brand Strategy deliverables**.
2. **Multilingual FAQ & Sentence Authoring (Google Translate -> Human Edit -> RAG):** Enables all users and administrators to translate existing FAQs, write new FAQs, or translate any website/AI sentence into 20+ world languages using **Google Translate** for instant machine translation, followed by a mandatory **Human Edit & Review** step before indexing into the RAG corpus.

## Universal Model Compatibility
All workflows and prompts are strictly deterministic and zero-temperature friendly so they execute identically across:
- **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite`)
- **Claude Haiku 4.5** (`claude-haiku-4-5`)
- **gpt-6-luna** (`gpt-6-luna`)
- Deterministic non-LLM execution paths (Google Translate GTX API + BM25 token retrieval)

## 4-Stage Pipeline

### Stage 1: Atomic Sentence Decomposition & Source Tagging
Every knowledge artifact is decomposed into atomic sentences and tagged with one of five canonical `sourceType` classifications:
- `FAQ`: Official and community-translated Frequently Asked Questions (Question + Answer + atomic sentences).
- `WEBSITE_UI`: All static and interactive UI sentences across AdRadarHQ (Navigation, Radar Filter Bar tooltips, Remix Studio, Brand Cards, Customize page, Wallet, Stripe Tax & GST notices, Footer Geo/Time & Currency widgets).
- `RADAR_SEARCH`: Sentences harvested from live Radar Feed Searches (`token_transactions`, `normalized_ads`, `radar_cache`), including search queries, winning ad headlines, primary copy sentences, and CTAs across Meta, TikTok, and Google.
- `AI_REMIX`: Sentences harvested from AI Creative Remix blueprints (`remixes`), including Persuasion DNA hook analyses, angle headlines, primary ad copy, and storyboard voiceover lines.
- `CUSTOMIZE_AI`: Sentences harvested from Customize Brand Strategy AI works (`customize_requests` and `admin_messages`), including multi-angle strategy hooks, primary copy, and visual directions.

### Stage 2: Instant Google Translator Bridge (`POST /api/rag/translate`)
1. Accepts `{ text, question?, items?, sourceLang, targetLang }`.
2. Queries Google Translate (`https://translate.googleapis.com/translate_a/single?client=gtx`) for instant low-latency translation into **all ASEAN official & regional languages** (`id` Indonesian, `ms` Malay MY/BN/SG, `vi` Vietnamese, `th` Thai, `tl` Filipino/Tagalog, `my` Burmese/Myanmar, `km` Khmer/Cambodia, `lo` Lao/Laos, `ta` Tamil SG/MY, `zh-CN` Mandarin SG/MY, `tet` Tetum Timor-Leste, `pt` Portuguese Timor-Leste, `ceb` Cebuano/Bisaya, `ilo` Ilocano, `jw` Javanese, `su` Sundanese) plus major global languages (`zh-TW`, `ja`, `ko`, `hi`, `ar`, `es`, `fr`, `de`, `it`, `ru`, `tr`, `nl`, `pl`, `el`).
3. Preserves domain terminology (`AdRadarHQ`, `Proven (28+d)`, `Extended (60+d)`, `Top Winners (90%+)`, `Token`).
4. Returns the draft translation to the client UI with `isHumanVerified: false` so it can be edited by a human prior to RAG ingestion.

### Stage 3: Mandatory Human-in-the-Loop Edit Gate (`POST /api/rag`)
- Machine translations from Google Translate are **never** silently written to the RAG database without human review.
- The UI populates editable **Human Edit Question** and **Human Edit Answer / Sentence** fields immediately after Google Translate completes.
- Once the user or administrator reviews and refines the translated text, clicking **"Approve Human Edit & Add to RAG"** submits the verified payload to `POST /api/rag`, storing it in Firestore (`system_config/rag_corpus`) with `isHumanVerified: true`.

### Stage 4: Hybrid Keyword & Semantic Token Retrieval (`GET /api/rag`)
- Tokenizes every original and translated sentence into normalized lowercase keyword vectors (`keywords: string[]`).
- Supports instant filtering by search query (`q`), `sourceType`, `faqId`, and `languageCode`.

