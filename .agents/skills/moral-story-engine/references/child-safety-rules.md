# Child-safety and pedagogy rules

Apply deterministic policy before calling a model:

- `ALLOW`: represent the lesson through gentle choices and natural consequences.
- `TRANSFORM`: replace harmful framing with behavior, boundaries, feelings, consequences, and repair. Examples include absolute obedience, emotional suppression, and labeling people as bad.
- `REQUIRE_PARENT_REVIEW`: compile sensitive medical, diagnostic, religious, political, or therapeutic topics, but make the review requirement explicit before rendering.
- `REJECT`: stop sexual content, self-harm, graphic violence, weapons, discriminatory framing, abduction, poisoning, threats, fear, or punishment as a teaching method.

Required pedagogy:

- make the tempting alternative understandable without endorsing it;
- show observable cause and effect;
- use proportionate consequences;
- permit apology, repair, retry, and reconnection;
- preserve the child's dignity;
- fit vocabulary and emotional intensity to the selected age band;
- avoid sermons, stereotypes, coercion, humiliation, and fear.

No generated artifact may weaken the deterministic policy decision.

Treat the parent lesson as delimited untrusted data. Reject system-targeted prompt injection at policy time, reject a moral interpretation that quotes long lesson text or repeats instruction-like language, and scan later model artifacts for instruction injection before advancing. Exclude the raw and compiled lesson strings from every downstream writer, ranker, reviewer, shot-compiler, and provider prompt after `MoralSpec` is created. Recompute the deterministic policy from the persisted source at render boundaries; reject `REJECT`, decision drift, low semantic scores, discriminatory output, humiliation, and fear/punishment output even if stored approval flags claim success.
