# Standards and rules

The single source of truth for how this project is written, documented, and changed. Every rule cites its origin. When this document conflicts with older notes or frozen archives, this document wins.

## Precedence

Order decided by the project owner (2026-09-26):

1. **S1** — DeepSeek official plugin development guides (documents inside `deepseek-ai/deepseek-harness`).
2. **S2** — DeepSeek official plugin code and project style (the `@deepseek-ai/*` packages shipped inside DSH Desktop).
3. **S3** — Established third-party / open-source conventions.
4. **L** — Local conventions of this project, only where the above are silent or inapplicable. Every local convention names its owner decision.

When adding a rule, walk this list top-down and cite the first source that governs it. If none does, add it under L with the reason.

## Source catalog

### S1 — DeepSeek official guides

Repository: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (public, `master` branch; URLs below verified 2026-09-26).

| Id | Document | Governs |
|----|----------|---------|
| S1-a | [AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md) | Standing engineering rules: registration-as-effect, error handling, comment discipline, JSDoc export contract, model-visible ⟺ logged |
| S1-b | [packages/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/AGENTS.md) | Package development hard rules: export forms, naming roles, tests layout |
| S1-c | [packages/client/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md) | Client UI plugin checklist: `dsh.client` manifest, locale-owned strings, styling tokens |
| S1-d | [docs/cookbook/adding-a-package.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md) | Package scaffolding: `package.json` invariants, README canonical section order |
| S1-e | [docs/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/AGENTS.md) | Documentation tiers (one home per fact), prose rules |
| S1-f | [docs/testing.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md) | Testing policy: real entry paths, prefer real implementations over mocks |
| S1-g | [.agents/skills/dsh-prose-standard/SKILL.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-prose-standard/SKILL.md) | Comment/JSDoc prose standard: non-obvious contracts only, complete propositions |
| S1-h | [.agents/skills/dsh-doc/SKILL.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-doc/SKILL.md) | README kind system and metadata rules |
| S1-i | [.agents/skills/dsh-doc/references/review.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-doc/references/review.md) | README review criteria: Summary word limit, limitation entry format |
| S1-j | [.agents/skills/dsh-doc/templates/package-reference.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-doc/templates/package-reference.md) | The `package-reference` README template this project follows |
| S1-k | [docs/user/develop/basic/config.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md) | Plugin config principles: no hardcoded tunables, fail loud on bad config |
| S1-l | [docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) | Third-party plugin packaging and installation |
| S1-m | [docs/cookbook/extension-cookbook.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md) | Extension-point discipline: no row modifies the loop |
| S1-n | [CONTRIBUTING.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) | Ecosystem participation: publish plugins with the `dsh-plugin` GitHub topic |

### S2 — DeepSeek official plugin packages

Shipped inside DSH Desktop under `node_modules/@deepseek-ai/` (244 packages inspected 2026-09-26).

| Source | Governs |
|--------|---------|
| `@deepseek-ai/dsh-client-ui-workspace` | README section layout; `lib/client.js` naming and error-handling style |
| `@deepseek-ai/dsh-client-ui-primitives` | JSDoc `@param x - desc` format; SCREAMING constants; `README.i18n.yaml` bilingual pairing |
| all `@deepseek-ai/*` packages | `package.json` field conventions (description, files whitelist, exports, repository); MIT LICENSE text |

### S3 — Third-party conventions

| Id | Source | Governs |
|----|--------|---------|
| S3-a | [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) | `CHANGELOG.md` structure |
| S3-b | [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) | Version numbers |
| S3-c | [EditorConfig](https://editorconfig.org) | `.editorconfig` (the official harness repo ships one too) |

### L — Local conventions

| Id | Home | Owner decision |
|----|------|----------------|
| L-a | [AGENTS.md](../AGENTS.md) | Standing discipline: five-name consistency, fork anchors, test discipline, Chinese commit messages |
| L-b | [docs/pitfalls.md](pitfalls.md) | Hard constraints this plugin must respect |
| L-c | [docs/development.md](development.md) | Verification workflow and CDP regression checklist |

## Rules

### User documentation

1. **README follows the `package-reference` template**: frontmatter (`description`, `kind`) → H1 → language switch → Summary → Table of Contents → `-----` → Use this package → Understand the implementation (inside `<details>`) → Further Exploration → Model Experience → Known Limitations and Deferred Work → Dev Note → closing bold **Runtime invariant** line. — S1-j, S1-d
2. **Summary is ≤ 100 words**, present tense, and says what the reader can do with the package — not internal component names. — S1-i
3. **Known Limitations entries** use `- **Short name** — consequence`. Durable consumer-visible gaps go here; routine cleanups stay out. — S1-i
4. **Model Experience is written from the model's viewpoint**: per entry `What the model sees` / `Token effect` / `KV Cache effect`, with stable model-visible text quoted verbatim in a titled fenced block. — S1-d (README section spec), S1-h
5. **Bilingual pairing**: `README.md` and `README.zh.md` stay structurally aligned; `README.i18n.yaml` records both git blob hashes; edit both sides in the same change and re-record the hashes. — S2 (pairing sidecar in official packages), S1-h
6. **One home per fact** (documentation tiering): AGENTS.md = standing discipline; README = user documentation; `docs/` = developer guides; `.agents/notes/archived/` = frozen history that is never updated. — S1-e
7. **Prose states current state**, one paragraph per line, and never restates code. — S1-e, S1-g

### Comments and JSDoc

8. **Comments and JSDoc are English.** Chinese appears only in locale strings and model prompts. — S1-a (comment discipline), S2 (all package comments are English); adopted by owner decision 2026-09-26
9. **Comments explain the non-obvious**: contracts, failure modes, timing, ownership, and motives. Never narrate what the code already says. — S1-g
10. **Exported functions carry JSDoc** with `@param name - description` (no type prefixes) and `@returns`; add `@throws`, side effects, and timing when they are part of the contract. — S1-d/S1-g (`verify-export-jsdoc` contract), S2 (primitives JSDoc style)
11. **An empty `catch` names the swallowed error and why it is ignorable.** Keep the `try` to one statement where practical. — S1-a

### Naming and code style

12. **Constants are SCREAMING_SNAKE_CASE, functions camelCase, components PascalCase.** — S2 (official package code)
13. **ESM only** (`"type": "module"`). — S1-a, S1-d

### Package metadata

14. **`package.json` carries**: `name`, a one-sentence `description` ending in a period, `version`, `license: MIT`, `repository`/`bugs`/`homepage`, a `files` whitelist, and explicit `exports`. — S1-d (`package.json` invariants), S2 (package survey)
15. **The `dsh` manifest** declares `bundle.patch` and `client.{platform, inject}` as required by the loader. — S1-c

### Architecture and plugin behavior

16. **Registration is an effect**: everything is registered through `ctx.effect()` / `ctx.on()`, and disposal unregisters. — S1-a
17. **The plugin never rewrites conversation content**; mutations go only through documented session APIs (`fork`, `rename`, `updateQueue`), and user-pinned titles are never overwritten. — L-a (product contract, restated as README Runtime invariant); consistent with S1-m (extension points, no loop modification)
18. **Hard constraints of this plugin** (fork anchor semantics, title truth, credential read-only discipline, DOM anchor rules, loader-patch semantics) live in docs/pitfalls.md and are binding. — L-b

### Error handling

19. **Environmental failures skip silently** with a recorded reason; **configuration errors fail loud** at the earliest resolvable point. — S1-a (fail loud), L-a (skip policy for credential/log faults)

### Test suite: writing, coverage, format

20. **Tests live at package root under `tests/`, named `*.spec.js`** (the official packages use `tests/*.spec.ts`; the `.js` suffix matches this project's no-build layout). One spec file per behavior area; shared fixtures and doubles live in `tests/helpers.js`, never in another spec. — S1-f ("tests stay with the code area", shared harness in `tests/harness.ts`), S1-b (tests at package level)
21. **The runner is vitest; `npm test` runs the suite to completion.** — S1-f (the official tier runner)
22. **Test names describe behavior, not correctness** ("skips generation for branch families", never "works correctly"). Table-driven cases use `it.each`. — S1-a ("测试描述行为而非正确性"), S2 (official spec style)
23. **Host behavior is tested through the real entry path**: mount `apply(ctx)` with a minimal ctx double that captures `webServer.register`, then drive the captured route handlers with request/response doubles. Hand-built calls to internal helpers are insufficient. — S1-f ("Test the real entry path": REAL-composition over hand-built `ctx.plugin(...)`)
24. **Mock only expensive or non-deterministic boundaries** — the `llm` service and the clock (fake timers). Session logs, branch stores, and title records are real files: fixtures are actual zstd-compressed JSONL written by the test and read through production code paths. — S1-f ("Prefer the real implementation over a mock": mock only LLM adapter, network, clock)
25. **Verify the world, not the self-report**: after a request, re-read the store file from disk and re-issue the GET; assert the fixture log's framed prompt captured at the model boundary, not the handler's return echo alone. — S1-f ("Verify the world, not the self-report")
26. **Tests own their resources**: temp home/data/session directories are created in setup and removed in teardown, on failure too. The suite passes with parallel workers and in any order — a spec that passes only alone is a spec defect. — S1-f (resource ownership; "How specs execute": forked workers, concurrent specs)
27. **Tests never touch user data.** The suite redirects `$HOME` and the store data directory to per-suite temp fixtures; running the suite must leave `branches.json` and `autotitle.json` byte-identical. — L-a (hard constraint: user data is untouchable), S1-f
28. **Coverage bar**: every host route (all methods and error paths), every `/auto-title` skip branch (user-pinned, branch-family, stale-title, in-flight, no-material, chain-exhausted), title-tier ordering, material framing, and sanitize accept/reject are covered. The client DOM half is covered by the CDP regression (rule 31) — see Adaptations. Line-coverage tooling is optional; branch presence in the suite is the bar. — S1-f (coverage tier: line coverage necessary, never sufficient)

### Testing and verification

29. **Behavior changes land with their tests in the same commit**; an outdated test is changed together with the behavior it pins. — S1-a ("过时行为与其测试一起改"), L-a
30. **Product-visible changes are additionally verified through the real product** using disposable test sessions; user sessions and user data files are never touched. — S1-f (with-key policy: a green unit suite can still hide a broken product), L-a
31. **The CDP four-item regression is the browser half's test**: edit flow, family rows, arrows, host routes — run it for any client.js behavior change. — L-c
32. **Every change runs the checklist**: `npm test`, `node --check` on both halves, five-name consistency, reload smoke, then the CDP regression for behavior changes. Every commit keeps the plugin working. — L-a, L-c

### Repository hygiene

33. **LICENSE is MIT**, `Copyright (c) 2026 ProgrammerAsahi`. — S2 (all official packages are MIT), owner decision 2026-09-26
34. **CHANGELOG.md follows Keep a Changelog; versions follow SemVer.** — S3-a, S3-b
35. **`.editorconfig`**: UTF-8, LF, 2-space indent, final newline; trailing whitespace kept in Markdown. — S3-c
36. **Commit messages are Chinese, timestamps are real development time.** — L-a (owner decision)
37. **Public-release privacy gate**: before first push, every revision is scanned for secrets, personal information, and real user data (comments included); offending history is rewritten. User data files (`branches.json`, `autotitle.json`) stay git-ignored. — owner decision 2026-09-25
38. **The repository carries the `dsh-plugin` GitHub topic** for ecosystem discoverability. — S1-n

## Adaptations

Deliberate deviations from S1/S2, each with its reason. Do not "fix" these back without checking the reason first.

- **No monorepo, no CI.** S1's machine gates (`verify-export-jsdoc`, `verify-translation-pairing`, `verify-package-readme-*`, `verify-doc-budgets`) cannot run locally; their rules are followed as human-checkable conventions through the L-c checklist. If CI is ever added, wire these gates first.
- **Only the verified install path is documented.** `dsh plugin` CLI installation is not exercised on this machine; S1-i requires fact-checked commands, so the README documents `link:` install only.
- **Single-file, build-free layout** (`index.js` + `lib/client.js`) instead of the official TypeScript multi-file compiled packages. File organization is local (L-a); comment, naming, and JSDoc rules still follow S1/S2.
- **Testing is a manual CDP checklist**, not vitest suites: the plugin is a small DOM layer with no test harness available at this install shape. S1-f's "real entry path" principle is preserved by testing through DSH Desktop itself.
- **README `kind: package-reference`** is recorded for metadata discipline even though no gate reads it here.
- **vitest is a devDependency.** S1-f names vitest as the tier runner; runtime stays dependency-free (dev-only install). Lockfile committed for reproducible dev installs.
- **Two test seams exist in `index.js`**, both defaulting to production behavior: `DSH_UI_TWEAKS_DATA_DIR` relocates the user-data stores (the store location is deployment-varying, the S1-k spirit — but schemastery Config would add a runtime dependency, so an env seam stands in), and the harness redirects `$HOME` before module load so the kimi credential path and the sessions root resolve inside the fixture (no production change). S1-k (configurable deployment values), S1-f (isolation).
- **No coverage gate, no web-snapshot tier, no REAL-composition Loader harness** in this install shape (single local plugin, no monorepo tooling). The documented substitutes are the rule-28 coverage bar and the rule-31 CDP regression; wire the official gates if CI ever arrives.

## Changing this document

1. A new or changed rule must cite its source: an S1/S2/S3 identifier (with URL for S1) or an explicit "owner decision" note under L.
2. Behavior changes update `README.md` and `README.zh.md` in the same commit and re-record both hashes in `README.i18n.yaml`.
3. When an S1 document evolves (renamed sections, new gates), update the affected rule and note the date in the rule's citation.
4. Rules are removed only when their source is retracted or an owner decision supersedes them; record the supersession rather than silently deleting.
