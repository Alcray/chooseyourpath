# Visual canon and shot rules

Lock canon before shot compilation. Canon owns character designs, character IDs, location ID and description, registered props and ownership, animation style, and narrator voice ID.

Every shot references IDs; the deterministic prompt composer resolves character/location bibles and each in-frame prop's registered name, owner, and initial condition into provider text. Reject unknown characters, props, or locations. Until shot manifests store per-shot prop condition/holder snapshots, do not claim that prompt compilation proves every intermediate prop state.

Each short segment contains exactly three timed beats, one continuous action, readable emotion, one camera direction, audio direction, complete spoken text, and a continuity anchor. Dialogue and narration must fit the duration at no more than four words per second.

Fresh segments repeat full visual canon and use the shared seed. Extensions contain only the next action and the exact predecessor segment ID, inheriting canon from the supplied provider video. They explicitly forbid recap, restart, redesign, wardrobe change, location change, lighting jump, and camera reversal.

The shared ending video remains branch-neutral. The deterministic player must present the validated `narrationByBranch` text for the selected route and must show the reflection prompt after the ending.

Veo is an adapter, not part of story semantics. Keep model name, polling, extension, and decoding behind `VideoProvider` so story compilation remains provider-neutral.
