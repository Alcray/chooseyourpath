#!/usr/bin/env python3
"""Validate the deterministic release invariants in a StoryPackage or compiler fixture."""

from __future__ import annotations

import json
import sys
from pathlib import Path

POLICIES = {"ALLOW", "TRANSFORM", "REQUIRE_PARENT_REVIEW", "REJECT"}
EXPECTED_SHOTS = [
    ("opening", 0, 8),
    ("positive", 0, 6),
    ("positive", 1, 7),
    ("positive", 2, 7),
    ("negative", 0, 6),
    ("negative", 1, 7),
    ("negative", 2, 7),
    ("ending", 0, 8),
]
SCORE_FIELDS = [
    "storyInterest",
    "causalContinuity",
    "choiceMeaning",
    "consequenceProportion",
    "repairQuality",
    "ageFit",
    "moralClarity",
    "childSafety",
    "convergence",
]


def fail(message: str) -> None:
    raise ValueError(message)


def load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Could not read JSON: {error}")
    if not isinstance(value, dict):
        fail("The root must be an object.")
    return value


def validate(value: dict) -> None:
    moral = value.get("moralSpec")
    if not isinstance(moral, dict) or moral.get("policyDecision") not in POLICIES:
        fail("moralSpec.policyDecision is missing or invalid.")
    if moral["policyDecision"] == "REJECT":
        fail("A rejected lesson cannot produce a releasable package.")
    forbidden = moral.get("forbiddenTreatments")
    if not isinstance(forbidden, list) or len(forbidden) < 3:
        fail("At least three forbidden treatments are required.")

    premises = value.get("premiseCandidates")
    if not isinstance(premises, list) or len(premises) != 3:
        fail("Exactly three premise candidates are required.")
    premise_ids = [premise.get("id") for premise in premises if isinstance(premise, dict)]
    if len(set(premise_ids)) != 3 or value.get("selectedPremiseId") not in premise_ids:
        fail("Premise IDs must be unique and the selected ID must exist.")
    if any(not isinstance(premise.get("storynessScore"), int) or premise["storynessScore"] < 60 for premise in premises):
        fail("Every golden premise must pass the storyness threshold.")

    canon = value.get("canon")
    graph = value.get("graph")
    shots = value.get("shots")
    if not isinstance(canon, dict) or not isinstance(graph, dict) or not isinstance(shots, list):
        fail("canon, graph, and shots are required.")
    character_ids = set(canon.get("characterIds", []))
    prop_ids = {prop.get("id") for prop in canon.get("props", []) if isinstance(prop, dict)}
    location_id = canon.get("locationId")
    if len(character_ids) < 2 or not prop_ids or not location_id:
        fail("Canon must register characters, props, and a location.")

    choice_options = graph.get("choice", {}).get("options", [])
    if {option.get("id") for option in choice_options if isinstance(option, dict)} != {"constructive", "harmful"}:
        fail("The story graph requires constructive and harmful choices.")
    branches = graph.get("branches", {})
    harmful_beats = branches.get("harmful", {}).get("beats", [])
    if not any(beat.get("phase") == "repair" for beat in harmful_beats if isinstance(beat, dict)):
        fail("The harmful branch requires a repair beat.")

    if len(shots) != len(EXPECTED_SHOTS):
        fail("Exactly eight shot segments are required.")
    seen_shot_ids: set[str] = set()
    for index, (shot, expected) in enumerate(zip(shots, EXPECTED_SHOTS, strict=True), start=1):
        if not isinstance(shot, dict):
            fail(f"Shot {index} must be an object.")
        actual = (shot.get("clipId"), shot.get("segmentIndex"), shot.get("durationSeconds"))
        if actual != expected:
            fail(f"Shot {index} layout is {actual}, expected {expected}.")
        shot_id = shot.get("id")
        if not isinstance(shot_id, str) or shot_id in seen_shot_ids:
            fail(f"Shot {index} has an invalid or duplicate ID.")
        seen_shot_ids.add(shot_id)
        if shot.get("locationId") != location_id:
            fail(f"Shot {index} changes the locked location.")
        if not set(shot.get("characterIds", [])).issubset(character_ids):
            fail(f"Shot {index} invents a character ID.")
        if not set(shot.get("propIds", [])).issubset(prop_ids):
            fail(f"Shot {index} invents a prop ID.")
        if len(shot.get("timedBeats", [])) != 3:
            fail(f"Shot {index} must contain exactly three timed beats.")
        spoken_text = shot.get("spokenText", "")
        if not isinstance(spoken_text, str) or not spoken_text.strip():
            fail(f"Shot {index} needs spoken text.")
        if len(spoken_text.split()) > expected[2] * 4:
            fail(f"Shot {index} spoken text exceeds four words per second.")

    review = value.get("semanticReview") or value.get("validation", {}).get("semanticReview")
    if not isinstance(review, dict) or review.get("approved") is not True:
        fail("Independent semantic approval is required.")
    for field in SCORE_FIELDS:
        score = review.get(field)
        if not isinstance(score, int) or not 3 <= score <= 5:
            fail(f"Semantic score {field} must be between 3 and 5.")

    clips = value.get("clips")
    if clips is not None:
        if not isinstance(clips, list) or [clip.get("id") for clip in clips] != ["opening", "positive", "negative", "ending"]:
            fail("A full package must contain the four ordered playback clips.")
        for clip in clips:
            expected_extensions = 2 if clip["id"] in {"positive", "negative"} else 0
            if len(clip.get("extensions", [])) != expected_extensions:
                fail(f"Clip {clip['id']} has the wrong extension count.")


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} STORY_PACKAGE.json", file=sys.stderr)
        return 2
    try:
        path = Path(sys.argv[1])
        validate(load_json(path))
    except ValueError as error:
        print(f"story-package validation failed: {error}", file=sys.stderr)
        return 1
    print(f"story-package validation passed: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
