#!/usr/bin/env python3
"""Require visible evaluation coverage alongside prompt, schema, or provider changes."""

from __future__ import annotations

import subprocess
from pathlib import Path

SENSITIVE_PREFIXES = (
    "app/lib/compiler-config.ts",
    "app/lib/gemini-structured.ts",
    "app/lib/story-compiler.ts",
    "app/lib/story-migrations.ts",
    "app/lib/video-provider.ts",
    "app/lib/veo.ts",
    "app/api/plan/route.ts",
    "app/api/stories/route.ts",
    "app/api/stories/[storyId]/route.ts",
    "app/api/stories/[storyId]/retry/route.ts",
)
EVAL_PREFIXES = ("tests/", ".agents/skills/moral-story-engine/")


def run(*args: str) -> str:
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def main() -> int:
    repo = Path(__file__).resolve().parents[4]
    tracked = set(run("git", "-C", str(repo), "diff", "--name-only").splitlines())
    staged = set(run("git", "-C", str(repo), "diff", "--cached", "--name-only").splitlines())
    status_lines = run("git", "-C", str(repo), "status", "--porcelain").splitlines()
    untracked = {line[3:] for line in status_lines if line.startswith("?? ")}
    changed = tracked | staged | untracked
    sensitive = sorted(path for path in changed if path.startswith(SENSITIVE_PREFIXES))
    if not sensitive:
        print("prompt inspection passed: no compiler prompt/schema/provider changes detected")
        return 0
    evaluation = sorted(path for path in changed if path.startswith(EVAL_PREFIXES))
    print("compiler-sensitive changes:")
    for path in sensitive:
        print(f"  - {path}")
    if not evaluation:
        print("prompt inspection failed: add or update golden cases, validators, or compiler tests")
        return 1
    print("evaluation evidence:")
    for path in evaluation:
        print(f"  - {path}")
    print("prompt inspection passed: run live Gemini tests before deployment when model behavior changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
