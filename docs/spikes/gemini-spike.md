# Spike SCRUM-63: can Gemini Flash-Lite return valid, grounded leads?

**Status:** draft, 27 Oct 2026 · **Owner:** Ross · **Branch:** `SCRUM-63-gemini-spike`
**Code:** `services/ai-matching/spikes/gemini_spike.py` (request, prompt, checks), `run_batch.py` (repeat runs)
**Data:** `docs/spikes/runs/summary.csv` (one row per run), `batch-*.jsonl` (raw replies)

## Questions

1. Does the model return valid JSON against our schema, and how reliably?
2. Does it stay on the shortlist (no invented or duplicate activity IDs)?
3. Is latency inside the Core API's 15 s timeout (contract D4)?
4. Are the explanations grounded in the fields we send?
5. Are the free-tier limits enough for development, the demo and RQ1?

## Setup

- **Model:** `gemini-3.1-flash-lite`, structured output (JSON MIME type + Pydantic schema), 15 s timeout, free tier.
- **Data:** synthetic fixtures only (SCRUM-59). Request built with an **allow-list** of "To AI" fields from contract v0.3.
  - c1: interests Art and craft + Sport and fitness, sensory hard limit on. Shortlist a0, b1, b2, b3, b4.
  - c2: interests Sport and fitness only (negative interest case), no hard limit. Shortlist a0, a3, b1, b2, b3, b4.
  - Both: goals "improve physical exercise", "start in a social club". Limit 5.
- **Prompt v1:** contract "Rules AI Matching guarantees" as the system instruction; client and shortlist as data in the message.
- **Prompt v2:** v1 plus three rules, one per v1 finding: name goals the activity doesn't help with (and interest mismatches) in `why_doesnt_cover`; never claim travel time or range; an age limit that might not fit → `why_ask`.
- **Our checks** (`check_results`): drop off-shortlist and duplicate IDs (counted in `dropped_count`), drop results with no `why_fits`, cut to `limit`, renumber ranks, trim each `why_*` to 3 lines, `invalid_output` if nothing is left. Tested offline with a hand-made bad output.
- **Runs:** 10 per client per prompt, 5 s apart, 27 Oct 2026 about 1:47–1:55 pm NZDT.

## Results

| | c1 v1 | c2 v1 | c1 v2 | c2 v2 | Total |
|---|---|---|---|---|---|
| Model replied | 2/10 | 6/10 | 6/10 | 2/10 | **16/40 (40%)** |
| 503 UNAVAILABLE ("high demand") | 5 | 3 | 2 | 5 | 15 |
| 504 DEADLINE_EXCEEDED | 3 | 1 | 2 | 3 | 9 |
| Parsed and passed our checks (of replies) | 2/2 | 6/6 | 6/6 | 2/2 | **16/16** |
| Dropped (off-shortlist or duplicate) | 0 | 0 | 0 | 0 | **0** |
| model_ms median (max) | 5,510 (7,392) | 6,364 (12,001) | 3,726 (13,922) | 4,578 (5,150) | **4,005 (13,922)** |

### Q1 and Q2: valid and on the shortlist

Every reply parsed against the schema and passed our checks: 16/16, no invented IDs, no duplicates, never more than `limit`. Earlier single runs (`run-01`, `run-02`) agree.

### Q3: latency

Median 4.0 s (mean 6.4 s) for successful calls, but 4 of 16 took 10.6–13.9 s, close to the 15 s limit. The 504s are most likely calls that ran past the 15 s deadline we set, so under D4 they are timeouts.

### Q4: grounding (8 replies per prompt)

| Check | v1 | v2 |
|---|---|---|
| False "matches their interests" claim for c2 | 0 | 0 |
| Names the unmet goal "improve physical exercise" | 0/8 | 5/8 (c1 3/6, c2 2/2) |
| Names the interest mismatch for c2 | 0/6 | 2/2 |
| Claims "within travel range" (no travel data is sent) | 1/8 | 0/8 |
| b4 (max age 24) returned for c1 | 0/2 (always left out) | 6/6, as an age `why_ask` |
| a3 sensory load above the client's level flagged (c2) | 6/6 | a3 not returned (cut at limit 5) |
| b1 unknown step-free access → `why_ask` | 8/8 | 8/8 |
| Field names in the text | 0 | 0 |

**v2 is better on every check it targeted.** Remaining issues:
- Inconsistent: in 3 of 6 c1 v2 runs `why_doesnt_cover` was empty for every result.
- New embellishment (c2 v2): "a small group social club environment". "Social club" comes from the client's goal, not the activity.
- When nothing matches the client's interests (c2), `why_fits` becomes generic and repeats across activities.
- The limit decides what the worker sees: v2 kept b4 and cut a3, so the sensory flag never appeared.

### Q5: free tier

No 429 (rate-limit) errors, so quota wasn't the problem at this volume. The failures were capacity: 503 "This model is currently experiencing high demand". Other developers reported the same for 3.1 Flash-Lite at the time ([Google AI forum](https://discuss.ai.google.dev/t/gemini-3-1-flash-lite-frequent-503s-and-high-latency-recently/138414)).

Free-tier limits for this model (AI Studio, 28 Oct 2026): **15 RPM, 250K TPM, 500 RPD**. Peak spike usage over the last 28 days was 7 RPM, about 15.9K TPM and 48 RPD, well inside all three. AI Studio's error chart for 27 Oct shows the same 503 and 504 counts as our logs, which confirms the failures were Google's capacity and our timeout, not quota.

- **Development and demo:** enough. A request is about 2.3K tokens, so RPM, not TPM, is the limit that would bind.
- **RQ1:** 15 RPM caps any load test at 15 matches a minute on the free tier. Above that we'd be measuring Google's quota, not our architecture, so RQ1 should mock Gemini or use a paid tier.

## Decision

**Go: Gemini Flash-Lite with prompt v2 and our post-validation**, because the output is reliable whenever the model replies. **Availability is the main risk**, so SCRUM-75 must:
1. Retry once on 503, only if the 15 s budget allows (failed-call times are now logged to check this).
2. Keep the fallback (catalogue search with the client's needs pre-filled) as a required path. This spike shows it will be used, not just designed.
3. Log `timeout`, `error` and `invalid_output` in `matching_log` as the contract says, so RQ1 can report availability.

## Limitations

- Small sample: 16 replies, one afternoon, one model.
- Weak ranking test: every shortlisted activity is the same art class with one field changed; c1 and c2 share goals.
- Grounding was checked with keyword searches plus reading sample replies, not a full manual review of every line.
- Free tier and a preview model: the 503 rate may reflect Google's load at that time, not normal behaviour.

## Follow-ups

- [ ] Comparison: 10 runs on a stable (non-preview) Flash-Lite model, and 3.1 again at a different time of day
- [ ] Fill in Q5 limits from AI Studio
- [ ] SCRUM-75: move the allow-lists, models and `check_results` into `ai_matching/contract.py` and `service.py`; add `google-genai` to `requirements.txt`; mock Gemini in tests
- [ ] Contract v0.4 with Jove: should a result removed for having no `why_fits` count in `dropped_count`? May the AI say "nothing here fits well" instead of always returning at least one result?
- [ ] SCRUM-60: varied seed activities for a real ranking test
- [ ] RQ1: don't benchmark only on the free tier, or the results measure Google's load rather than our architecture
