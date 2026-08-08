# Continuity and convergence rules

Every state tracks time, location ID, present character IDs, prop condition and holder, per-character knowledge, relationship state, and unresolved promises.

Every beat declares nonempty reads and updates using typed fact keys (`time`, `location`, `presence.<character>`, `prop.<prop>.<condition|holder>`, `knowledge.<character>`, `relationship.<from>.<to>`, or `promise.<id>`). Promise IDs and relationship pairs must be declared in typed states; they are not accepted from syntax alone. Never derive these fields from prose or emotion.

Every common-prefix beat whose phase is `setup` has one explicit payoff mapping to an existing later beat on each branch. A shared finale beat may resolve both paths, but an invented or missing beat ID fails deterministic validation.

Both branches must:

- originate from the exact shared `initialState.id`;
- read and update only declared story facts;
- use registered character, location, and prop IDs;
- contain at least three causal beats;
- end at a state that satisfies the shared finale requirements.

The harmful path must contain a visible, proportionate natural consequence followed by an explicit repair beat. Repair restores the finale's required prop state, ownership, location, time, characters, and promises. The child is never shamed, frightened, abandoned, or magically rescued from the consequence.

The finale is visually shared but its narration may be parameterized by branch history. Never erase the child's earlier choice or imply that both routes were identical.

Convergence means both unmodified generated end states satisfy declared preconditions; the validator must never normalize a failed end state into compliance. Required knowledge facts must be present, and the unresolved-promise set must match exactly. Histories may still differ beyond the required facts.
