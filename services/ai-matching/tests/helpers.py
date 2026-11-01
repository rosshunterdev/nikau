"""Test helpers: a fake Gemini and fixture loading. No API key, no network."""

import json
from pathlib import Path
from types import SimpleNamespace

from ai_matching.contract import ModelOutput

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
THIS_YEAR = 2026
C1_SHORTLIST = ["a0", "b1", "b2", "b3", "b4"]  # fixtures README, expected for c1


def load(name):
    with open(FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)


class FakeGemini:
    """Stands in for genai.Client. Each call pops the next reply off the list.

    A reply is a dict (the model's JSON), a string (raw text that may not parse),
    or an Exception to raise.
    """

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.models = self  # so gemini.models.generate_content(...) works

    def generate_content(self, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, str):
            return SimpleNamespace(parsed=None, text=reply)
        return SimpleNamespace(
            parsed=ModelOutput.model_validate(reply), text=json.dumps(reply)
        )


def result(activity_id, rank, why_fits=("Matches their interests",)):
    return {
        "activity_id": activity_id,
        "rank": rank,
        "why_fits": list(why_fits),
        "why_doesnt_cover": [],
        "why_ask": [],
    }
