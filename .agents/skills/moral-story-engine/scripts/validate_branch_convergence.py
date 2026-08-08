#!/usr/bin/env python3
"""Validate that both story branches satisfy the declared shared-finale state."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def prop_key(prop: dict) -> tuple[str | None, str | None, str | None]:
    return (prop.get("propId"), prop.get("condition"), prop.get("holderId"))


def satisfies(required: dict, actual: dict) -> bool:
    if required.get("time") != actual.get("time") or required.get("locationId") != actual.get("locationId"):
        return False
    required_characters = required.get("presentCharacterIds", [])
    actual_characters = actual.get("presentCharacterIds", [])
    if len(set(required_characters)) != len(required_characters) or len(set(actual_characters)) != len(actual_characters):
        return False
    if set(required_characters) != set(actual_characters):
        return False
    required_promises = required.get("unresolvedPromises", [])
    actual_promises = actual.get("unresolvedPromises", [])
    if len(set(required_promises)) != len(required_promises) or len(set(actual_promises)) != len(actual_promises):
        return False
    if set(required_promises) != set(actual_promises):
        return False
    actual_props = {prop_key(prop) for prop in actual.get("propStates", [])}
    if not all(prop_key(prop) in actual_props for prop in required.get("propStates", [])):
        return False
    actual_knowledge = {
        entry.get("characterId"): set(entry.get("facts", []))
        for entry in actual.get("characterKnowledge", [])
    }
    for entry in required.get("characterKnowledge", []):
        if not set(entry.get("facts", [])).issubset(actual_knowledge.get(entry.get("characterId"), set())):
            return False
    actual_relationships = {
        (entry.get("fromCharacterId"), entry.get("toCharacterId"), entry.get("status"))
        for entry in actual.get("relationships", [])
    }
    required_relationships = {
        (entry.get("fromCharacterId"), entry.get("toCharacterId"), entry.get("status"))
        for entry in required.get("relationships", [])
    }
    return required_relationships.issubset(actual_relationships)


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} STORY_PACKAGE.json", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        root = json.loads(path.read_text(encoding="utf-8"))
        graph = root["graph"]
        origin_id = graph["initialState"]["id"]
        required = graph["convergence"]["requiredState"]
        failures: list[str] = []
        for branch_id in ("constructive", "harmful"):
            branch = graph["branches"][branch_id]
            if branch.get("originStateId") != origin_id:
                failures.append(f"{branch_id} does not share origin {origin_id}")
            if not satisfies(required, branch["endState"]):
                failures.append(f"{branch_id} does not satisfy the finale state")
        if not any(beat.get("phase") == "repair" for beat in graph["branches"]["harmful"].get("beats", [])):
            failures.append("harmful branch has no repair beat")
        narration = graph["convergence"].get("narrationByBranch", {})
        if not narration.get("constructive") or not narration.get("harmful"):
            failures.append("branch-aware finale narration is incomplete")
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"branch-convergence validation failed: unreadable package: {error}", file=sys.stderr)
        return 1
    if failures:
        print("branch-convergence validation failed: " + "; ".join(failures), file=sys.stderr)
        return 1
    print(f"branch-convergence validation passed: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
