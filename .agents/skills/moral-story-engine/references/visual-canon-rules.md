# Visual canon and shot rules

Lock canon before shot compilation. Canon owns character designs, character IDs, location ID and description, registered props and ownership, animation style, and narrator voice ID.

Every shot references IDs; the deterministic prompt composer resolves them into provider text. Reject unknown characters, props, or locations.

Each short segment contains exactly three timed beats, one continuous action, readable emotion, one camera direction, audio direction, complete spoken text, and a continuity anchor. Dialogue and narration must fit the duration at no more than four words per second.

Fresh segments repeat full visual canon and use the shared seed. Extensions describe only the next action and the previous visible state. They explicitly forbid recap, restart, redesign, wardrobe change, location change, lighting jump, and camera reversal.

Veo is an adapter, not part of story semantics. Keep model name, polling, extension, and decoding behind `VideoProvider` so story compilation remains provider-neutral.
