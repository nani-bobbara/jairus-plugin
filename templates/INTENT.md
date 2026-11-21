---
schema_version: "3.0"                # do not change — the plugin reads this
project_name: ""                     # kebab-case, at most 32 characters; becomes the project folder and repo name
display_name: ""                     # the product name shown in the UI
one_liner: ""                        # at most 120 characters: what it does and for whom
status: draft                        # seed lifecycle only: draft | bootstrapped (set by /jairus:init at Gate F1)
mode: dev                            # dev | qa — the workflow mode chosen at init (rules/modes.md)
backend: neon                        # fixed
features:
  # One entry per MVP slice, dependency-ordered. A `feature` lives in a plugin (`plugin:` is the
  # business domain id, kebab-case, shared by the slices of one domain, never a core namespace);
  # a `config` card changes only product values in branding (plans, roles, brand, policies).
  # The feature loop starts a card only after everything in its depends_on is Review Passed or Done.
  - name: example-feature            # kebab-case card id, used as branch and docs folder name
    display_name: Example feature
    description: ""                  # 1–2 sentences: what it does and why it matters (the design scope contract)
    out_of_scope: []                 # at least one explicit exclusion
    type: feature                    # feature | config
    plugin: example                  # plugin id for type feature; omit for config
    plan: all                        # free | basic | pro | all
    depends_on: []
---

# Product Intent

## 1. What

<!-- 2–3 sentences: who uses it, what they do with it, what outcome they get. -->

## 2. Who

<!-- 1–2 primary personas: role, context, pain. -->

## 3. Core value

<!-- The one thing that makes this worth building. -->

## 4. Key features

<!-- One bullet per feature in the frontmatter: name — what it does, why it matters. -->

-

## 5. Out of scope (v1)

<!-- At least three things this is explicitly not doing. -->

-

## 6. Monetization

- **Model**: <!-- subscription | usage-based | one-time | freemium | none -->
- **Tiers**: <!-- e.g. Free (core), Pro $19/mo -->
- **Trial**: <!-- period, or none -->

## 7. Data model overview

<!-- The key entities and how they relate, in prose — not schema. -->

## 8. Non-negotiables

<!-- Security, compliance, performance or tooling constraints; or "Standard security practices apply." -->

-

## 9. Success metrics

<!-- 2–4 measurable outcomes for v1. -->

-
