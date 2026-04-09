# Architecture Research

**Domain:** WordPress SEO operations, automation, and QA workflow
**Researched:** 2026-04-07
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Strategy and Truth Layer                  │
├─────────────────────────────────────────────────────────────┤
│  master-seo-plan-current  execution-board  reality-check   │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│                  Planning and Control Layer                │
├─────────────────────────────────────────────────────────────┤
│  .planning docs  workstream scope  QA gates  KPI tracking  │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│                 WordPress Implementation Layer             │
├─────────────────────────────────────────────────────────────┤
│  scripts/  mu-plugins/  theme templates  plugin settings   │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│                  Live Validation and Measurement           │
├─────────────────────────────────────────────────────────────┤
│  public URLs  schema tests  Search Console  crawl checks   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                    | Responsibility                                                       | Typical Implementation                                                       |
| ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Strategy docs                | Define current truth, priorities, and sequencing                     | `wordpress/docs/*.md` with live-checked operating guidance                   |
| Planning workspace           | Translate strategy into requirements, phases, and execution memory   | `.planning/*.md` and `.planning/research/*.md`                               |
| Automation scripts           | Perform repeatable SEO updates and audits                            | `wordpress/scripts/*.js` executed under Node.js                              |
| WordPress runtime extensions | Inject fields, schema, or runtime logic into the CMS rendering layer | `wordpress/mu-plugins/*.php` and controlled plugin configuration             |
| QA and measurement loop      | Confirm changes are live, valid, and measurable                      | Search Console, rich-results checks, crawl validation, and URL artifact logs |

## Recommended Project Structure

```
wordpress/
├── docs/                # Source-of-truth strategy, execution board, reality checks
├── mu-plugins/          # Runtime SEO hooks and custom field logic
├── scripts/             # Batch automations, audits, and targeted cleanup tools
└── plugin-config/       # Recommended future home for exportable plugin settings and mappings

.planning/
├── PROJECT.md           # Project framing and constraints
├── REQUIREMENTS.md      # Checkable scope
├── ROADMAP.md           # Phase ordering
├── STATE.md             # Current execution memory
└── research/            # Stack, features, architecture, pitfalls, summary
```

### Structure Rationale

- **`wordpress/docs/`**: planning must stay close to the implementation context and live-operating evidence.
- **`wordpress/scripts/`**: repeatable SEO work belongs in reviewable scripts, not only admin click paths.
- **`wordpress/mu-plugins/`**: proven place for runtime behavior that cannot live purely in content or templates.
- **`.planning/`**: creates an execution memory separate from the source docs so strategy and delivery do not blur together.

## Architectural Patterns

### Pattern 1: Documented Workstream Before Script

**What:** Strategy, KPI, and QA expectations are written before automation is executed.
**When to use:** Any batch update, redirect rollout, template cleanup, or schema-affecting work.
**Trade-offs:** Slower startup, much lower rollback and documentation drift risk.

### Pattern 2: Script Plus Live Sample Validation

**What:** Scripted changes are followed by representative live URL checks rather than admin-only confirmation.
**When to use:** Any update that changes rendered body copy, FAQs, schema, links, or redirects.
**Trade-offs:** Requires manual review time, but it is the only way to distinguish code execution from live success.

### Pattern 3: Plugin or mu-Plugin Only After Strategy Freeze

**What:** Runtime dependencies are added only after the desired behavior and rollback expectations are understood.
**When to use:** Redirect management, schema features, or content field extensions.
**Trade-offs:** Slower to adopt tooling, much less likely to create orphaned dependencies.

## Data Flow

### Request Flow

```
[SEO priority]
    ↓
[Operating doc] → [Planning phase] → [Script or WP change] → [Live page]
    ↓                   ↓                    ↓                  ↓
[KPI target] ← [QA gate] ← [Artifact log] ← [Validation sample]
```

### State Management

```
[.planning/STATE.md]
    ↓
[Current phase and blockers] ←→ [Requirements and roadmap] → [Execution decisions]
```

### Key Data Flows

1. **Priority-to-implementation flow:** current-truth docs define the workstream, planning documents define the phase, then scripts or WordPress runtime changes implement it.
2. **Implementation-to-proof flow:** live pages, schema validators, and Search Console evidence are required before a workstream is considered complete.

## Scaling Considerations

| Scale                    | Architecture Adjustments                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| 0-20 active workstreams  | Markdown docs plus script-by-script artifacts are sufficient                                   |
| 20-50 active workstreams | Centralize URL lists, execution logs, and QA samples to reduce memory-only coordination        |
| 50+ active workstreams   | Add more formal reporting exports and stronger automation observability before expanding scope |

### Scaling Priorities

1. **First bottleneck:** QA bandwidth — fix by enforcing representative samples and artifact logging before scaling output volume.
2. **Second bottleneck:** documentation drift — fix by making live verification and status language part of the completion definition.

## Anti-Patterns

### Anti-Pattern 1: Script Ran Therefore Done

**What people do:** Mark work complete when automation executes without errors.
**Why it's wrong:** Live pages can still be broken, incomplete, or strategically wrong.
**Do this instead:** Require live URL samples, schema checks, KPI annotation, and owner sign-off.

### Anti-Pattern 2: Strategy Hidden Inside Tools

**What people do:** Install a plugin or write a script before agreeing on the behavior it should enforce.
**Why it's wrong:** Tooling choices start driving strategy instead of implementing it.
**Do this instead:** Freeze the mapping, quality bar, and rollback conditions first.

## Integration Points

### External Services

| Service                   | Integration Pattern                       | Notes                                                      |
| ------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Google Search Console     | Post-release measurement and query review | Required for validating ranking, CTR, and indexing effects |
| Google Rich Results Test  | Live structured-data spot checks          | Use for any FAQ or schema-bearing rollout                  |
| Screaming Frog SEO Spider | Crawl validation and duplicate detection  | Best used after template, link, or redirect changes        |

### Internal Boundaries

| Boundary                                        | Communication                                    | Notes                                                                          |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `wordpress/docs/` ↔ `.planning/`               | Markdown docs                                    | Strategy stays separate from execution memory                                  |
| `.planning/` ↔ `wordpress/scripts/`            | Phase plans and acceptance criteria              | Script work should only begin after scope and QA are written                   |
| `wordpress/scripts/` ↔ `wordpress/mu-plugins/` | Direct code changes plus shared workstream notes | Use scripts for batch transforms and mu-plugins for runtime rendering concerns |

## Sources

- `wordpress/docs/master-seo-plan-current.md`
- `wordpress/docs/seo-execution-board.md`
- `wordpress/docs/live-seo-reality-check-2026-04-07.md`
- `wordpress/scripts/`
- `wordpress/mu-plugins/`

---

_Architecture research for: WordPress SEO operations, automation, and QA workflow_
_Researched: 2026-04-07_
