# Evaluation rubric

Release requires all deterministic checks plus independent semantic approval.

The judge scores each dimension from 1 to 5:

- story interest;
- causal continuity;
- choice meaning;
- consequence proportionality;
- repair quality;
- age fit;
- moral clarity;
- child safety;
- convergence.

Every score must be at least 3. Deterministic release checks cover storyness, exact choices, shared origin, escalation, repair, constructive effort, both convergence paths, canon IDs, branch-aware finale narration, shot count, duration budget, shot canon, bounded actions, and semantic approval.

The golden corpus must include allowed lessons, transformed lessons, sensitive parent-review lessons, rejected lessons, a fully valid branching package, broken convergence, unknown canon IDs, tampered validation, prompt/canon resolution, four rendered roles, UI compiler progress, both playback paths, persistent video elements, pause/resume, and the shared ending.

Run static/lint/type/build tests on every change. Run live Gemini route tests when modifying model/schema/prompt behavior, and the full video pipeline only when quota use is explicitly intended.
