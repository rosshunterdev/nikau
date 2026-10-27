"""Spike SCRUM-63, step 6: run the same request many times and record the results.

Usage (Git Bash, from the repo root):
    python services/ai-matching/spikes/run_batch.py --client c1 --runs 10 --prompt v1

Each batch writes:
  docs/spikes/runs/summary.csv                       one row per run (appended)
  docs/spikes/runs/batch-<time>-<client>-<prompt>.jsonl   raw model reply per run
Fixtures only. Never real client data.
"""
import argparse
import csv
import json
import time

from gemini_spike import (
    PROMPTS, REPO_ROOT, SHORTLISTS, build_request, call_gemini,
    check_results, load, make_gemini,
)

RUNS_DIR = REPO_ROOT / "docs" / "spikes" / "runs"
PAUSE_S = 5   # wait between calls to stay under the free tier's per-minute limit


def run_batch(gemini, request, client_key, prompt_version, runs):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    batch = time.strftime("%Y%m%d-%H%M")
    raw_path = RUNS_DIR / f"batch-{batch}-{client_key}-{prompt_version}.jsonl"
    csv_path = RUNS_DIR / "summary.csv"
    new_csv = not csv_path.exists()

    with open(csv_path, "a", newline="", encoding="utf-8") as cf, \
         open(raw_path, "w", encoding="utf-8") as rf:
        writer = csv.writer(cf)
        if new_csv:
            writer.writerow(["batch", "run", "client", "prompt", "parsed", "returned",
                             "kept", "dropped", "model_ms", "not_returned", "error"])

        for run in range(1, runs + 1):
            parsed, raw, model_ms = None, None, ""
            returned = kept_n = dropped = not_returned = ""
            error = ""
            start = time.perf_counter()   # also time failed calls: does a retry fit in 15 s?
            try:
                parsed, raw, model_ms = call_gemini(gemini, request, PROMPTS[prompt_version])
                if parsed is None:
                    error = "parse_failed"
                else:
                    returned = len(parsed.results)
                    kept, dropped = check_results(parsed, request)
                    kept_n = len(kept)
                    kept_ids = {r.activity_id for r in kept}
                    # Shortlisted activities the model left out (e.g. b4 for c1)
                    not_returned = " ".join(a["id"][-2:] for a in request["shortlist"]
                                            if a["id"] not in kept_ids)
            except ValueError as e:          # check_results: invalid_output
                error = str(e)
            except Exception as e:           # rate limit (429), timeout, network
                failed_ms = round((time.perf_counter() - start) * 1000)
                error = f"after {failed_ms} ms: {type(e).__name__}: {e}"[:200]

            rf.write(json.dumps({"run": run, "model_ms": model_ms,
                                 "error": error, "raw": raw}) + "\n")
            writer.writerow([batch, run, client_key, prompt_version, parsed is not None,
                             returned, kept_n, dropped, model_ms, not_returned, error])
            print(f"run {run}/{runs}: ms={model_ms} returned={returned} kept={kept_n} "
                  f"dropped={dropped} not_returned=[{not_returned}] {error}")

            if run < runs:
                time.sleep(PAUSE_S)

    print(f"\nsaved: {csv_path.name} and {raw_path.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SCRUM-63 Gemini spike, step 6")
    parser.add_argument("--client", choices=sorted(SHORTLISTS), default="c1")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--prompt", choices=sorted(PROMPTS), default="v1")
    args = parser.parse_args()

    clients = load("clients.json")
    activities = load("activities.json")
    raw_client = next(c for c in clients if c["id"].endswith(args.client))
    request = build_request(raw_client, activities, SHORTLISTS[args.client])

    print(f"client {args.client}, prompt {args.prompt}, {len(request['shortlist'])} activities, {args.runs} runs")
    run_batch(make_gemini(), request, args.client, args.prompt, args.runs)
