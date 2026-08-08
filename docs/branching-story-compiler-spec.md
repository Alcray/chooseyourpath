# The best architecture: a **branching story compiler**

Do not send the parent’s moral directly to a model and ask it to “make a video story.”

Instead, compile the moral through several controlled stages:

```text
Parent moral
   ↓
Moral interpretation and safety policy
   ↓
Adventure premise candidates
   ↓
Hierarchical story outline
   ↓
Typed branching story graph
   ↓
Continuity and pedagogy validation
   ↓
Screenplay and shot manifest
   ↓
Locked keyframes / character assets
   ↓
Short animation or image-to-video shots
   ↓
Visual QA, audio, and deterministic assembly
```

The model should never simultaneously invent the story, characters, branch logic, shot composition, and final video. That is where coherence and character quality collapse.

Research on long-form generation points in the same direction: models struggle with macro-level planning and long-range consistency, while hierarchical outlining plus explicit memory/state tracking improves plot coherence and reduces contradictions. ([[arXiv](https://arxiv.org/html/2412.13575v1)][1])

---

## 1. The moral should control the **choice**, not become the whole plot

Suppose the parent enters:

> “I want my child to learn honesty.”

The weak approach is:

> “Write a children’s story about why honesty is good.”

That almost always creates a short, obvious lesson: a character lies, something bad happens, and a narrator explains the moral.

Instead, first compile the input into an internal specification:

```yaml
moral_spec:
  value: honesty
  desired_behavior: admit a mistake truthfully
  tempting_alternative: hide the mistake to avoid embarrassment
  understandable_motive: fear of disappointing a friend
  positive_consequence: trust and collaborative problem-solving
  natural_wrong_consequence: confusion and loss of trust
  repair_action: confess, apologize, and help fix the problem
  age_band: 6-8
  emotional_intensity: gentle
  forbidden_treatments:
    - humiliation
    - frightening punishment
    - labeling the character as bad
```

Then generate several **adventure premises** in which honesty is only the decision axis.

For example:

> Nia and Milo are preparing a glowing seed for the Moon Garden Festival. Nia accidentally cracks the borrowed crystal that makes the seed bloom. The festival starts soon, and she must decide whether to tell Milo or secretly replace the crystal with one from another project.

Now the story has:

* An external goal: succeed at the festival.
* A relationship: Nia and Milo’s friendship.
* A time constraint.
* A concrete object and visual mystery.
* An understandable temptation.
* A moral choice with a real cost.

That is a story first and a lesson second.

### Add a “storyness contract”

Every generated premise should be rejected unless it contains:

1. A non-moral external goal.
2. A meaningful relationship.
3. At least one escalating obstacle before the choice.
4. A setup that pays off near the ending.
5. A good option that requires courage or effort.
6. A wrong option that is tempting for an understandable reason.
7. Natural, proportionate consequences rather than punishment.

For honesty specifically, research with children aged three to seven found that stories emphasizing the positive consequences of honesty promoted truth-telling more effectively than stories centered on frightening consequences of dishonesty. ([[Weber State University](https://apps.weber.edu/wsuimages/psychology/Research/ResearchArticles/Lee%20et%20al_%20%282014%29.pdf)][2])

So the wrong branch should not be:

> “You lied, so everyone hates you.”

It should be:

> “Hiding the mistake created confusion. Now the character has an opportunity to repair it.”

Also, avoid describing children as “good” or “bad.” Describe **choices** as helpful, harmful, honest, unsafe, considerate, or unfair.

---

## 2. Generate an outline before writing dialogue

Use hierarchical planning rather than one giant script prompt.

A useful structure is:

```text
ACT 1 — Adventure setup
1. Introduce the hero, relationship, and larger goal.
2. Establish a special prop, rule, or promise.
3. Introduce the first obstacle.
4. Escalate the obstacle.
5. The hero causes or discovers the central problem.

CHOICE
6. Present two understandable actions.

GOOD BRANCH
7G. The hero chooses the difficult constructive action.
8G. There is an immediate cost.
9G. Other characters respond realistically.
10G. The positive consequence develops.

WRONG BRANCH
7W. The hero takes the tempting shortcut.
8W. It appears to work briefly.
9W. A natural consequence appears.
10W. The hero gets an opportunity to repair the harm.

CONVERGENCE
11G/11W. A branch-specific bridge restores required story state.
12. Shared or parameterized finale.
13. Reflection prompt.
```

The “wrong” branch should still be a complete mini-arc. It should not abruptly stop with a failure screen.

A useful branch pattern is:

```text
                 ┌─ constructive choice ─ consequence ─ bridge ─┐
common prefix ─ choice                                         ├─ finale
                 └─ harmful choice ─ consequence ─ repair ─────┘
```

Narrative participation and reflection can support children’s emotion understanding and perspective-taking, so the interaction should include a moment to consider what the characters felt and why—not only reveal which button was “correct.” ([[Frontiers](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1833673/full)][3])

---

## 3. Represent the story as a typed state graph

Do not keep the story only as prose. Store a canonical `StoryPackage` object.

```yaml
story_package:
  id: story_123
  age_band: 6-8
  moral_spec: {...}

  canon:
    characters: [...]
    locations: [...]
    props: [...]
    visual_style: {...}
    voices: [...]

  common_prefix:
    beats: [...]

  choice:
    question: "What should Nia do?"
    options:
      - id: admit_mistake
        child_text: "Tell Milo what happened"
      - id: hide_mistake
        child_text: "Try to replace it secretly"

  branches:
    constructive:
      beats: [...]
      end_state: {...}
    harmful:
      beats: [...]
      end_state: {...}

  convergence:
    required_state: {...}
    constructive_bridge: [...]
    harmful_bridge: [...]
    finale: [...]

  shots: [...]
```

Each beat should read and update explicit state:

```yaml
state:
  time: sunset
  location: moon_garden_workshop
  present_characters: [nia, milo]
  props:
    crystal:
      owner: festival_school
      condition: cracked
      holder: nia
  relationships:
    nia_trusts_milo: true
    milo_trusts_nia: true
  character_knowledge:
    nia: [crystal_is_cracked]
    milo: []
  unresolved_promises:
    - return_crystal_safely
```

This eliminates common failures such as:

* A broken object becoming intact without explanation.
* A character knowing something they were never told.
* Clothing or weather changing between clips.
* A character appearing in a location they never entered.
* The finale referring to an event that happened in only one branch.

### Enforce branch convergence as code

Your validator should assert:

```python
for branch in story.branches:
    assert finale.required_state.is_satisfied_by(branch.end_state)
```

For example, if the finale takes place at the festival with the crystal repaired, both branches must reach that state.

The bridges can be different:

* Constructive branch: Milo helps Nia repair the crystal.
* Wrong branch: Nia confesses, apologizes, and then they repair it together.

The actual finale can then use the same location and animation while changing a small amount of narration or dialogue.

In many stories, forcing an identical finale will feel artificial. Support a **parameterized finale**:

```yaml
finale:
  shared_visual_sequence: festival_launch_v3
  narration_by_branch:
    constructive: "Telling the truth gave them time to solve it together."
    harmful: "Once Nia told the truth and made things right, they could solve it together."
```

---

## 4. Use Structured Outputs and deterministic validators

Every model stage should produce schema-constrained data rather than free-form text.

OpenAI Structured Outputs can enforce a strict JSON schema, while PydanticAI can validate model output and ask the model to retry when validation fails. ([[OpenAI Developers](https://developers.openai.com/api/docs/guides/structured-outputs)][4])

Use two types of checks:

### Deterministic checks

These should be normal code, not model judgments:

```text
Exactly two choices exist
Both branches originate from the same state
Both branches satisfy finale preconditions
All characters and props have canonical IDs
Every setup has a payoff or explicit resolution
Dialogue fits within the assigned shot duration
No shot introduces an unregistered character
No branch exceeds the target length
```

### Semantic model checks

Use a separate reviewer prompt or model to score:

```text
Is this an interesting story independent of the moral?
Is the wrong choice understandable but not encouraged?
Are the consequences natural and proportionate?
Does the constructive choice involve meaningful effort?
Is the lesson understandable for the target age?
Does the story shame, frighten, stereotype, or manipulate?
Can the child infer the lesson without a long lecture?
```

Do not rely on the writer to approve its own work. Use a writer, an editor, and an independent judge—but keep them inside a deterministic pipeline rather than creating an autonomous swarm.

---

# 5. For character quality, lock the visual canon before generating video

The strongest version-one approach would use a recurring cast of perhaps three to five stylized animal or fantasy characters.

For each character, create a canonical asset pack:

```text
character_id
front / side / three-quarter reference
neutral full-body pose
height and scale relative to other characters
five to eight facial expressions
approved clothing variants
exact palette
eye, ear, hair, tail, and accessory rules
forbidden changes
voice ID and speaking style
```

Example:

```yaml
character:
  id: nia_fox_v1
  silhouette: small fox with large triangular ears and short round tail
  clothing: teal overalls, yellow star patch, no shoes
  palette:
    fur: "#D98245"
    muzzle: "#F4D7B5"
  never:
    - change eye color
    - add a hat
    - make photorealistic
    - change the star patch
    - alter age or body proportions
```

Create equivalent sheets for locations and important props.

Every shot should refer to IDs:

```yaml
shot:
  id: S08_good
  duration_seconds: 6
  characters: [nia_fox_v1, milo_moth_v1]
  location: moon_workshop_v2
  props: [crystal_cracked_v1]
  first_frame: keyframe_S08_good_v3
  action: Nia slowly places the cracked crystal on the table
  emotion:
    nia: nervous_but_resolute
    milo: surprised
  camera: static medium two-shot
  continuity_from: S07_choice
```

Never restate all character information from scratch inside every video prompt. Resolve the IDs into references behind the scenes.

---

## 6. The visual production choice that will matter most

### Best consistency: rigged 2D, 2.5D, or simple 3D characters

For your first commercial version, I would use:

* Fixed character rigs.
* Generated or artist-created backgrounds.
* A constrained animation vocabulary.
* Generated narration, dialogue, music, and sound.
* Selectively generated cinematic inserts.

The story model outputs an animation plan such as:

```yaml
animation:
  character: nia_fox_v1
  enter_from: left
  move_to: workbench
  expression: worried
  gesture: place_prop
  prop: crystal_cracked_v1
  camera: slow_push_in
```

A deterministic renderer then performs it.

This will give you much better:

* Character consistency.
* Lip synchronization.
* Body proportions.
* Wardrobe consistency.
* Repeatability.
* Safety control.
* Editing and localization.
* Predictable cost.

The characters can still look high quality. They simply should not be regenerated pixel-by-pixel for every shot.

### Higher visual richness: keyframe-first image-to-video

When using generative video:

1. Generate or retrieve the canonical first frame.
2. Validate the first frame against the character and location references.
3. Animate that frame for four to eight seconds.
4. Give the video model motion instructions, not a new description of the whole character.
5. Keep each shot to one clear action.
6. Generate dialogue and sound separately.
7. Assemble shots deterministically.

Use:

```text
reference images → approved keyframe → image-to-video
```

Not:

```text
paragraph of story text → complete video
```

Reference-driven video is becoming more capable. For example, Google documents Veo subject references that preserve a character or product’s appearance. However, the current reference-to-video workflow permits adult people or no people and explicitly excludes youth or child people/faces. ([[Google Cloud Documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/use-reference-images-to-guide-video-generation)][5])

That makes recurring nonhuman mascots particularly practical. Human child characters can still be used as original illustrated or rigged assets, but I would avoid any workflow based on real children’s faces or voices.

Provider terms also need to be checked product by product. Runway’s additional rules for its **Characters & Game Worlds** products currently prohibit characters based on the face or voice of an under-18 person and child-directed characters or games in those products. That wording does not necessarily cover every Runway API use, but it is enough that you should obtain written confirmation before making it a core dependency. ([[Runway](https://runwayml.com/ja/safety/usage-policy)][6])

As of August 8, 2026, I would also not start a new dependency on the Sora 2 Videos API: OpenAI says those models and that API will shut down on September 24, 2026. ([[OpenAI Developers](https://developers.openai.com/api/docs/guides/video-generation)][7])

---

# 7. Recommended open-source and production stack

| Layer                          | Recommended choice                                                        |
| ------------------------------ | ------------------------------------------------------------------------- |
| Product/API                    | TypeScript frontend; Python story/media service                           |
| Story schemas                  | Pydantic models                                                           |
| LLM integration                | Structured Outputs or PydanticAI                                          |
| Durable workflow               | Temporal                                                                  |
| Canon and story state          | PostgreSQL                                                                |
| Images, audio, video           | S3-compatible object storage                                              |
| Media provider access          | Your own `ImageProvider`, `VideoProvider`, and `VoiceProvider` interfaces |
| Local generative media         | ComfyUI behind an API adapter                                             |
| Prompt and trace observability | Langfuse                                                                  |
| CI evaluations                 | Promptfoo                                                                 |
| Video assembly                 | FFmpeg, Remotion, Blender, or your chosen deterministic renderer          |
| Prompt optimization later      | DSPy, after collecting a rated dataset                                    |

### Temporal for runtime orchestration

Rendering a story involves long-running calls, retries, partial failures, parent approval, and resumable processing. Temporal automatically handles many transient failures through retries and durable execution, and PydanticAI has an official Temporal integration. ([[Temporal Docs](https://docs.temporal.io/develop/python/best-practices/error-handling)][8])

A workflow might be:

```text
CreateStoryWorkflow
  1. normalize_moral
  2. generate_premises
  3. rank_premises
  4. generate_outline
  5. validate_story_graph
  6. request_parent_approval
  7. generate_screenplay
  8. generate_storyboard
  9. validate_keyframes
  10. render_all_shots
  11. inspect_rendered_shots
  12. retry_failed_shots
  13. compose_audio_and_video
  14. publish_story_package
```

This is a much better fit than using CrewAI, AutoGen, or another unconstrained multi-agent system as your top-level production engine.

LangGraph could be used inside the story-planning stage if you need iterative writer/editor loops, but the overall production process should remain an explicit state machine.

### Langfuse and Promptfoo

Langfuse gives you open-source, self-hostable tracing, prompt versioning, cost/latency visibility, and evaluations. Promptfoo provides open-source prompt testing and red-teaming that can run locally or in CI. ([[Langfuse](https://langfuse.com/docs)][9])

Every story should record:

```text
prompt version
schema version
model and model snapshot
media provider
reference asset versions
seed, where supported
latency and cost
validation scores
human review result
rejected and regenerated shots
```

OpenAI’s evaluation guidance similarly recommends moving from trace inspection to repeatable datasets and eval runs once you know what good performance looks like. ([[OpenAI Developers](https://developers.openai.com/api/docs/guides/agent-evals)][10])

---

## 8. Where ComfyUI and open video models fit

ComfyUI is useful as a **media execution backend**, not as the source of truth for your story.

It is an open-source node-based inference system that can expose local image and video workflows through APIs. ([[ComfyUI](https://docs.comfy.org/)][11])

Your architecture should look like:

```text
Temporal / Story Service
         ↓
VideoProvider interface
         ↓
┌───────────────┬────────────────┬─────────────────┐
│ ComfyUI local │ Commercial API │ Rigged renderer │
└───────────────┴────────────────┴─────────────────┘
```

Current open models worth benchmarking include:

* **Wan2.2**, which provides text-to-video and image-to-video variants, including 720p-capable models. ([[GitHub](https://github.com/Wan-Video/Wan2.2)][12])
* **LTX-2**, which provides open video inference and LoRA training and includes synchronized audio/video capabilities. ([[GitHub](https://github.com/Lightricks/LTX-2)][13])

But do not assume that “open source” automatically solves identity consistency. For example, LTX-2’s repository currently has an open report specifically about image conditioning not preserving identity in image-to-video generation. ([[GitHub](https://github.com/Lightricks/LTX-2/issues)][14])

I would use open-source video in this order:

1. Background motion and atmospheric shots.
2. Establishing shots without close character interaction.
3. Short character shots with locked keyframes.
4. Custom character LoRAs after you have enough approved training material.
5. Only later, fully local production rendering.

Do not train character LoRAs immediately. First accumulate a curated set of approved, consistent character images. Otherwise, you will train inconsistencies into the character.

---

# 9. A Codex skill is useful—but for engineering discipline

A Codex skill should help developers implement and maintain the system. It should not be your runtime story engine.

OpenAI’s skill format uses a `SKILL.md` file with optional references and scripts, and repository skills can live under `.agents/skills`. ([[OpenAI Developers](https://developers.openai.com/codex/build-skills)][15])

I would add:

```text
.agents/skills/moral-story-engine/
├── SKILL.md
├── references/
│   ├── story-contract.md
│   ├── story-schema.md
│   ├── continuity-rules.md
│   ├── child-safety-rules.md
│   ├── visual-canon-rules.md
│   └── evaluation-rubric.md
└── scripts/
    ├── validate_story_package.py
    ├── validate_branch_convergence.py
    ├── run_story_evals.sh
    └── inspect_prompt_changes.py
```

A useful starting `SKILL.md`:

```markdown
---
name: moral-story-engine
description: Use when implementing, modifying, testing, or reviewing the branching children's-story generation, rendering, continuity, safety, or evaluation pipeline. Do not use for unrelated application work.
---

# Required workflow

1. Read:
   - references/story-contract.md
   - references/story-schema.md
   - references/continuity-rules.md
   - references/child-safety-rules.md
   - references/evaluation-rubric.md

2. Preserve the typed StoryPackage and MoralSpec schemas.

3. Never replace the staged story pipeline with one free-form
   moral-to-script or moral-to-video model request.

4. Enforce:
   - exactly two child-facing choices
   - explicit branch end states
   - finale precondition validation
   - canonical IDs for all characters, locations, and props
   - natural and proportionate consequences
   - a repair opportunity in the harmful branch

5. Keep all media providers behind provider interfaces.
   Do not place provider-specific fields in the canonical StoryPackage.

6. Any change to a model, prompt, schema, or grader must:
   - add or update golden evaluation cases
   - run scripts/validate_story_package.py
   - run scripts/run_story_evals.sh

7. Report regressions in:
   - narrative quality
   - moral clarity
   - age appropriateness
   - child safety
   - continuity
   - visual identity
   - latency
   - cost
```

This will stop Codex—or human developers—from gradually collapsing your carefully staged system back into one enormous prompt.

---

# 10. Build a real evaluation harness before scaling generation

Create a golden dataset such as:

```text
20 moral themes
× 3 age bands
× 3 adventure settings
= 180 core cases
```

Themes might include:

```text
honesty
empathy
sharing
boundaries
asking for help
keeping promises
including others
handling jealousy
responsible courage
patience
repairing mistakes
online safety
peer pressure
respecting differences
caring for belongings
```

For every case, rate the generated story on a one-to-five scale:

```text
Story is interesting without the moral
Plot has causal continuity
Choice is meaningful
Wrong choice is understandable
Consequences are proportionate
Repair is possible
Constructive choice requires effort
Moral is understandable but not preachy
Characters retain agency
Content is appropriate for the age
Finale follows logically from both branches
```

For visual evaluations, sample frames from every shot and compare them with the canon:

```text
Character identity
Body proportions
Clothing and accessories
Color palette
Prop condition and ownership
Location continuity
Number of characters
Facial emotion
Action correctness
Visual anomalies
Unintended text or symbols
Safety concerns
```

A failed six-second shot should result in rerendering that shot, not the entire story.

At launch, include human review before publication. As your evaluation set becomes reliable, move to risk-tiered review rather than removing human oversight completely.

---

# 11. Add a moral-policy layer because parent input is untrusted

A parent may enter a harmful, discriminatory, frightening, or developmentally inappropriate lesson.

Your system should classify every moral as:

```text
ALLOW
TRANSFORM
REQUIRE_PARENT_REVIEW
REJECT
```

Examples:

| Parent input                       | Safer handling                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| “Children must always obey adults” | Transform into listening to trusted adults while speaking up about unsafe or uncomfortable requests |
| “People who lie are bad”           | Transform into honesty, consequences, and repairing trust                                           |
| “Teach him not to cry”             | Transform into understanding feelings and expressing them safely                                    |
| “Girls should not do…”             | Reject discriminatory framing                                                                       |
| “Scare her so she never…”          | Reject fear-based or threatening treatment                                                          |

UNICEF’s current child-centered AI guidance emphasizes safety, privacy, fairness, transparency, accountability, children’s best interests, and development—not merely filtering obviously violent content. ([[UNICEF](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children)][16])

Also design for minimal child data:

* Do not require the child’s photo or voice.
* Avoid putting the child’s real name into generated media by default.
* Do not build a hidden psychological profile from their choices.
* Keep the parent in control of creation and history.
* Avoid advertising profiles or third-party tracking.
* Explain to the child that the story was generated.
* Allow parents to delete stories and associated data.

For services directed to U.S. children under 13, COPPA requirements apply to the collection and use of children’s personal information, and the FTC’s rule was amended in April 2025. This needs product-specific legal review before launch. ([[Federal Trade Commission](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa?utm_source=chatgpt.com)][17])

---

# The version I would build first

I would launch with:

* Three to five recurring animal or fantasy characters.
* Six to ten reusable locations.
* Fixed 2D/2.5D or simple 3D character rigs.
* Generated backgrounds, props, narration, music, and selected cinematic shots.
* Six to eight common story beats before the choice.
* Three to four beats per branch.
* A branch-specific repair or transition.
* A shared or parameterized finale.
* Parent approval of the premise and storyboard before expensive rendering.
* Both branches fully rendered before the child begins, so the choice changes playback immediately.
* Temporal + PydanticAI for the runtime pipeline.
* PostgreSQL and object storage for canon and media.
* Langfuse for traces and prompt versions.
* Promptfoo plus a golden dataset for CI.
* ComfyUI as an optional media backend, not the workflow controller.
* A repository Codex skill that enforces the architecture and evaluation rules.

The biggest quality improvement will not come from finding one superior video model. It will come from **separating story planning from rendering, tracking explicit state, locking visual assets, and regenerating only short validated shots**. That structure also lets you replace video providers later without rewriting the educational and narrative engine.

[1]: https://arxiv.org/html/2412.13575v1 "Generating Long-form Story Using Dynamic Hierarchical Outlining with Memory-Enhancement"
[2]: https://apps.weber.edu/wsuimages/psychology/Research/ResearchArticles/Lee%20et%20al_%20%282014%29.pdf "Can Classic Moral Stories Promote Honesty in Children?"
[3]: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1833673/full "Frontiers | Narrative participation as a context for meaning-making in early school years: a mixed-methods study of emotion comprehension"
[4]: https://developers.openai.com/api/docs/guides/structured-outputs "Structured model outputs | OpenAI API"
[5]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/use-reference-images-to-guide-video-generation "Guide video generation using asset and style images  |  Gemini Enterprise Agent Platform  |  Google Cloud Documentation"
[6]: https://runwayml.com/ja/safety/usage-policy "Runway's Usage Policy | Runway"
[7]: https://developers.openai.com/api/docs/guides/video-generation "Video generation with Sora | OpenAI API"
[8]: https://docs.temporal.io/develop/python/best-practices/error-handling "Error handling - Python SDK | Temporal Platform Documentation"
[9]: https://langfuse.com/docs "Overview - Langfuse"
[10]: https://developers.openai.com/api/docs/guides/agent-evals "Evaluate agent workflows | OpenAI API"
[11]: https://docs.comfy.org/ "ComfyUI Official Documentation - ComfyUI"
[12]: https://github.com/Wan-Video/Wan2.2 "GitHub - Wan-Video/Wan2.2: Wan: Open and Advanced Large-Scale Video Generative Models · GitHub"
[13]: https://github.com/Lightricks/LTX-2 "GitHub - Lightricks/LTX-2: Official Python inference and LoRA trainer package for the LTX-2 audio–video generative model. · GitHub"
[14]: https://github.com/Lightricks/LTX-2/issues "Issues · Lightricks/LTX-2 · GitHub"
[15]: https://developers.openai.com/codex/build-skills "Build skills | ChatGPT Learn"
[16]: https://www.unicef.org/innocenti/reports/policy-guidance-ai-children "Guidance on AI and children | Office of Strategy and Evidence Innocenti"
[17]: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa?utm_source=chatgpt.com "Children's Online Privacy Protection Rule (\"COPPA\")"
