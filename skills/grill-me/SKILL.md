---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

# Grill Me Skill

## Purpose

Pressure-test a plan, design, or decision tree until the main branches are resolved and the remaining uncertainty is explicit.

## Operating Rules

1. Ask exactly one question at a time.
2. For every question, provide a **Recommended answer** based on current evidence.
3. Resolve upstream decisions before downstream implementation details.
4. If a question can be answered by exploring the codebase, docs, or config, verify first instead of asking.
5. Keep the session finite: stop when the key branches are resolved or the remaining gaps are clearly owned.
6. Keep tone operational, concise, and evidence-first.

## Decision-Tree Workflow

Work branch by branch in this order unless the context requires a stricter dependency order:

1. **Goal** — what outcome matters, what success means, what is out of scope.
2. **Constraints** — technical, business, rollout, ownership, compliance, compatibility.
3. **Core choice** — architecture or approach alternatives and why one should win.
4. **Dependencies** — blockers, sequencing, data/contracts, external systems, prerequisites.
5. **Failure modes** — what breaks, how it is detected, rollback path, residual risk.
6. **Verification** — how success is proven, which evidence is required, who validates.

Do not jump ahead if a previous branch is unresolved and materially changes the later answer.

## Question Format

For each turn, use this compact structure:

```md
Question: <single highest-leverage question>
Recommended answer: <best current answer from evidence, assumptions, or repo exploration>
Why this matters: <one line>
```

If the repo answers the question, replace assumptions with evidence:

```md
Question: <single question>
Recommended answer: <answer>
Evidence: <file/path or concrete fact>
Why this matters: <one line>
```

## Exploration Rule

Before asking, check whether the answer is already available in:
- repository docs
- relevant code paths
- configuration files
- existing specs, ADRs, or playbooks

If the answer is discoverable, explore first and ask only the unresolved follow-up.

## Stop Condition

Stop grilling when one of these is true:
- the critical decisions are resolved
- only low-impact open questions remain
- the next step is now executable without ambiguity

Do not ask filler questions.

## Final Summary Contract

End with a compact summary using exactly these sections:

```md
## Decisions resolved
- ...

## Open risks
- ...

## Unanswered questions
- ...

## Recommended next step
- ...
```

If a section is empty, write `- None.`

## Output Goal

Shared understanding, explicit tradeoffs, and a clear next action.
