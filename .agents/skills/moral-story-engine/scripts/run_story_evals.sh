#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
fixture="$repo_root/tests/fixtures/compiled-story-input.json"

python3 "$repo_root/.agents/skills/moral-story-engine/scripts/validate_story_package.py" "$fixture"
python3 "$repo_root/.agents/skills/moral-story-engine/scripts/validate_branch_convergence.py" "$fixture"
python3 "$repo_root/.agents/skills/moral-story-engine/scripts/inspect_prompt_changes.py"
"$repo_root/node_modules/.bin/tsx" --test "$repo_root/tests/story-compiler.test.ts"
npm --prefix "$repo_root" run typecheck
