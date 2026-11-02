# AI foundations course — content and evidence plan

Status: authored bilingual course, 2026-11-02. This replaces the earlier single-topic-only product scope under the user's explicit request for a complete multi-chapter AI course. It does **not** claim that the course's teaching effectiveness has been established with learners.

## Audience and finish line

A curious beginner who can read a simple graph and do basic arithmetic. No programming, provider account, API key, paid service, or prerequisite calculus is required. The 12-chapter sequence is a bounded introductory course, not an exhaustive treatment of all AI. Chapter estimates are author planning estimates, not observed completion times. They include reading, two controlled runs, a transfer response, checks, and reflection; readers may take longer.

The final artifact is a learner-written, scoped release proposal for a small evidence-grounded assistant: intended use and exclusions; permitted data; retrieval/evidence rules; evaluation subsets and failures; abstention/review route; monitoring and rollback conditions. It is a learning exercise, not production authorization, safety certification, or a claim of mastery.

## Sequence and observable outcomes

| # | Stable ID | Chapter | Evidence a learner can produce | Deterministic experiment |
|---|---|---|---|---|
| 1 | data-split | Data, splits, leakage / 数据划分与泄漏 | Choose an entity-aware split and identify unavailable-at-prediction information | 12 people × 2 visits; identity memorizer, mixed visits versus held-out people, training fraction |
| 2 | regression | Regression and loss / 回归与损失 | Calculate residual/MSE, explain an outlier's influence | Fixed five-point data; slope, intercept, outlier |
| 3 | overfitting | Generalization / 泛化与过拟合 | Compare training and independent-grid errors with one variable changed | Degree 1–9 polynomial on ten fixed noisy points; adjustable noise; clean grid |
| 4 | gradient-descent | Optimization / 梯度下降 | Explain a gradient update and diagnose instability | L=s²(w−3)², 12 updates, learning rate and scale |
| 5 | classification | Thresholds and costs / 阈值与代价 | Calculate precision/recall and distinguish reclassification from revaluation | Fixed scores/labels; threshold and false-negative cost; undefined-denominator state |
| 6 | neural-network | Nonlinear representations / 非线性表示 | Distinguish representability from successful training | Four XOR points; linear x₁+x₂ versus two hand-set ReLU paths, threshold |
| 7 | embeddings | Similarity and relevance / 相似性与相关性 | Explain cosine versus dot product and give a misleading neighbor | Hand-set three-dimensional vectors; query word and length multiplier |
| 8 | attention | Context weighting / 注意力与上下文 | Explain normalization/masking without treating weight as causal explanation | Fixed scores; query focus, temperature, causal mask at position 2 |
| 9 | generation | Tokens and decoding / 词元与生成 | Separate rank, sampling, and factual support | Four fixed logits; temperature, top-k, 12 fixed-seed draws |
| 10 | rag | Retrieval and evidence / 检索与证据 | Separate retrieval failure, unsupported synthesis, and appropriate abstention | Fixed toy corpus; query, document count, evidence threshold |
| 11 | evaluation | Distribution and subsets / 分布与子集 | Calculate mixture-weighted accuracy; report weakest-group evidence | Two synthetic subgroup rates; model choice and difficult-group proportion |
| 12 | safety | Responsible deployment capstone / 负责任发布结课项目 | Draft a scoped evaluation/review/rollback plan | Fixed scored cases including confident errors; automation threshold and error cost |

Each chapter requires the previous chapter as its recommended prerequisite; IDs and order are stable. The original full overfitting lab remains a separate, reachable legacy experience. New course progress is separate from `LearningSession` and does not reinterpret or upload old learner answers.

## Content contract

`src/course/types.ts` defines `CourseChapter` and `ChapterContent`. `curriculum.ts` exports `chapters`, combining `foundations.ts` (1–6) and `advanced.ts` (7–12). Each chapter supplies complete `zh-CN` and `en` versions with:

- a title, summary, three measurable objectives, and three explanatory sections;
- one explicit misconception and correction;
- one prediction question with three options and option-specific feedback;
- experiment prompt, concrete steps, interpretation, and limitations;
- a transfer prompt, three rubric criteria, and an example answer;
- two knowledge checks, each with three choices and explanatory feedback;
- two reflection prompts, three glossary items, and at least two primary/authoritative source links with a stated use.

Question IDs, semantic choice IDs, and correct IDs match across languages. Correct choices occupy each displayed position exactly 12 times across the 36 unique prediction/check questions. Ordering is deterministic across visits and languages, not runtime randomization. IDs are not intended to conceal answers in source code; the goal is to avoid a first-button shortcut during ordinary use.

Reading acknowledgement, responses, controlled-run counts, and quiz completion are **activity evidence**. Text length is an effort gate, not semantic grading. Matching a multiple-choice key does not establish transfer or mastery. Predictions may be wrong and still useful; feedback should invite revision, not punish exploration. The sample transfer answer is a model response, not a claim that all other valid answers must match its wording.

## Source review and technical precision

Sources were opened and reviewed on 2026-11-02 using official documentation, original papers, and an author-maintained textbook. Lesson prose and synthetic examples are original; links are for verification and further study, not copied curricula. Stable conceptual sources are preferred over product rankings, pricing, or release claims.

- Data, loss, optimization, classification: Google Machine Learning Crash Course; scikit-learn cross-validation, common pitfalls, evaluation metrics, and threshold documentation.
- Neural representations: Google MLCC; *Dive into Deep Learning*, multilayer perceptrons.
- Embeddings: Google MLCC embedding space; scikit-learn pairwise metrics.
- Attention: Vaswani et al., *Attention Is All You Need* (2017); Jain & Wallace, *Attention is not Explanation* (2019). The latter supports caution about attention as explanation, not a claim that no attention analysis can ever be useful.
- Generation: Google MLCC LLM introduction; Hugging Face generation documentation; Holtzman et al., *The Curious Case of Neural Text Degeneration* (2019). The fixed-logit exercise is not an LLM or factuality benchmark.
- RAG: Lewis et al., *Retrieval-Augmented Generation* (2020); Gao et al., *Enabling Large Language Models to Generate Text with Citations* (2023). Retrieval/citation presence does not alone establish support or truth.
- Evaluation: scikit-learn metrics; Mitchell et al., *Model Cards for Model Reporting* (2018).
- Deployment: Geifman & El-Yaniv, *Selective Classification for Deep Neural Networks* (2017); NIST AI RMF. These sources motivate explicit scope, coverage/risk tradeoffs, evaluation, and oversight; this course is not a compliance assessment.

Every displayed source has its exact URL in the content record. No relative or invented citations, vendor comparisons, claimed users/revenue, or claimed first-hand model trials appear. Source publication dates are not presented as today's news.

Important precision rules retained throughout:

1. Training fit, validation selection, final testing, and deployment performance are distinct.
2. A deterministic clean evaluation grid is not an empirical sample of noisy future observations.
3. Precision/recall with zero denominators are undefined, not silently manufactured percentages.
4. A fixed-score threshold does not retrain a model; higher precision is not monotonic in every finite score ordering.
5. Attention weights are normalized relevance signals in the toy computation, not causal proof.
6. Temperature/top-k transform selection probabilities, not underlying evidence or factual truth.
7. Embedding similarity is not task relevance or factual equivalence; the demo uses hand-set **3D** vectors.
8. Hand-set XOR parameters demonstrate existence of a representation, not a learned outcome.
9. A risk score is not a safety guarantee; high-confidence errors remain in the final exercise.
10. Synthetic tests, generated fixtures, UI completion, and engineering passes are not real-learner effectiveness results.

## Acceptance and future content maintenance

Verify unique ordered IDs, backward prerequisites/no cycles, complete locale fields, nonempty feedback/rubrics/sources, identical semantic question keys across locales, valid HTTPS source URLs, and balanced fixed answer positions. Exercise controls and lesson steps must be reviewed together whenever an engine changes. Localized terms should preserve mathematical meaning; literal English translations are not more important than clarity.

Run type checking and the curriculum structure tests after edits. Platform/E2E owners additionally verify all 12 chapters render, locale changes preserve semantic answers, progress survives refresh, experiment results belong to saved configurations, two genuinely different configurations are needed, and invalid or corrupt stored progress cannot fabricate completion. Confirm both desktop Chromium and narrow WebKit behavior, using the repository's normal no-retry policy.

Future learner observation may reveal misconceptions or inaccessible language; record consented, privacy-preserving evidence before claiming effectiveness. No real learner records are included here. Optional provider/OAuth/transcription integrations remain outside this curriculum work and disabled by default.
