# Contributing to Barcraft

Project overview, tech stack, and file structure live in the [README](README.md). This document describes conventions for all contributors — human and AI.

## Conventions

- **JavaScript:** `'use strict';` at top of server files; client page scripts often wrap in an IIFE. **CommonJS** on the server (`require` / `module.exports`).
- **API & sockets:** Keep request bodies and socket payloads consistent with existing patterns; extend `constants.js` instead of scattering magic strings.
- **Auth:** Bar/guest/leaderboard flows use a shared password and `sessionStorage` token via `public/js/auth.js` — don't invent a second auth model without a maintainer decision.
- **UI copy:** User-facing strings are often **German**; keep tone consistent with surrounding text.
- **CSS / HTML hygiene:** Use utilities in `components.css` for repeated layout (avoid large inline styles). For form controls that need a label for accessibility, use a visually hidden label pattern (e.g. `.sr-only`) and stable `id`s where scripts depend on them.
- **Secrets:** Never commit real `config.json` passwords, `.env`, or `data/`. `config.json` and `.env.example` patterns belong in docs/README, not live secrets.

## Testing

- **Every change must be tested before opening a PR.** At minimum, manually verify that the affected flows still work (e.g. guest ordering, bar accepting/rejecting, status updates). Don't rely on reviewers to catch runtime breakage.
- There is no mandatory unit test suite in CI; **manual smoke testing** of guest → bar → status updates is the default bar for risky changes.
- Playwright is listed under `devDependencies`; if you add automated checks, keep them maintainable and scoped.

## Commit messages

Follow **[Conventional Commits](https://www.conventionalcommits.org/)**-style summaries so history stays scannable.

**Subject line (first line)**

- Format: `type(scope): short description` — `scope` is optional but useful (e.g. `guest`, `bar`, `api`, `socket`, `css`).
- **Imperative mood**, as if completing: "add cart checkout" not "added" or "adds".
- **~50 characters** is ideal; stay under **72** so tools don't wrap awkwardly.
- **No period** at the end of the subject; capitalize like a sentence.

**Common `type` values**

| type | Use for |
|------|---------|
| `feat` | New user-visible behavior |
| `fix` | Bug fixes |
| `docs` | README, AGENTS.md, comments that mainly document behavior |
| `style` | Formatting-only (no logic change) |
| `refactor` | Internal restructuring without changing behavior |
| `chore` | Tooling, deps, build scripts, non-user-facing cleanup |
| `test` | Adding or changing automated tests |

**Body (optional, after a blank line)**

- Explain **why** if the subject isn't enough (bug context, trade-off, link to issue).
- Mention **breaking changes** or migration steps explicitly.
- Wrap at ~72 characters for readability in `git log`.

**Examples**

```
fix(bar): dismiss alert overlay when tapping outside drink name

Guest overlay was stealing focus; match tap target to full card.

feat(api): validate order items array before write

chore: bump nodemon devDependency
```

**Avoid**

- Vague subjects: `update`, `fix stuff`, `WIP`, `address feedback` (be specific).
- Mixing unrelated changes in one commit — split commits when the diff does two different things.

## Pull requests

### Atomic changes

Every PR must represent **one logical change**. This is the single most important rule.

**What counts as one change:**
- A single feature (e.g. cart checkout flow)
- A bug fix and its minimal test
- A refactoring that enables a future feature (but not the feature itself)
- A translation pass across files
- A CSS/a11y cleanup

**What does NOT belong in one PR:**
- Feature + translation + CSS cleanup + new middleware
- Refactoring mixed into a feature branch
- Unrelated fixes tacked on because "I was in the file anyway"

**When in doubt, split.** Four small PRs that each take 5 minutes to review are better than one large PR that takes an hour and still gets things missed.

### Size guidelines

These are signals, not hard rules — a 400-line CSS file is simpler than 150 lines scattered across server logic, socket handlers, and three HTML templates.

| Metric | Green | Amber — justify in description | Red — split first |
|--------|-------|-------------------------------|-------------------|
| Changed lines | < 300 | 300–500 | > 500 |
| Files touched | ≤ 6 | 7–10 | > 10 |
| Layers crossed | ≤ 2 (e.g. API + client) | 3 | 4+ |

### How to split

Common splits that keep PRs atomic:

1. **Prep refactoring** → separate PR, merge first, then build the feature on top
2. **New middleware / auth** → own PR, then the feature that uses it
3. **Translations / i18n** → own PR (touches many files but zero logic risk)
4. **CSS / a11y cleanup** → own PR (visual-only, easy to review)
5. **Data model changes** → own PR with migration notes, then the UI that consumes them

### Branch hygiene

- **Rebase** onto `master` before requesting review — keep the diff current and conflict-free.
- Use **draft PRs** for work in progress; switch to **ready for review** only when the checklist below is done.

### Title

- Should read like a **clear outcome**: e.g. `Add quantity stepper to guest cart` or `fix: bar overlay closes on outside tap`.
- Match the **main commit** if the PR is a single commit; otherwise summarize the whole set.

### Description — include when relevant

- **Context:** what problem this solves (or link `Fixes #123` / `Refs #123`).
- **What changed:** bullet list by area (server / guest UI / bar UI) — not a file-by-file dump unless huge.
- **How to test:** numbered steps (e.g. open `/guest.html`, add two drinks, submit — bar should show both lines).
- **UI changes:** **screenshots or short screen recording** for layout/visual work.
- **Risks / follow-ups:** socket behavior, data migration, known limitations.

### Before opening / marking ready

- [ ] **Scope check:** this PR does exactly one thing — if you can describe two unrelated changes, split.
- [ ] Diff is **self-reviewed** (debug `console.log`, commented-out code, accidental `config.json` edits removed).
- [ ] **Smoke-tested** paths touched (see Testing above).
- [ ] **Commit messages** on the branch follow the commit guidelines above.
