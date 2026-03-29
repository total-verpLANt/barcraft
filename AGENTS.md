# Guidelines for AI-assisted contributors

This document helps humans and coding agents work on **Barcraft** without breaking conventions or scope. Read it before making non-trivial changes.

## Project in one paragraph

Barcraft is a **real-time LAN-party bar ordering app**: guests order from the browser, the bar sees a live queue (tablet-friendly), stats and push notifications are optional. **Stack:** Node.js (Express + Socket.io), **vanilla** HTML/CSS/JS in `public/` (no React/Vue, no bundler). Persistence is **JSON files** under `data/` with a write queue—no SQL migrations.

## Where things live

| Area | Path | Notes |
|------|------|--------|
| HTTP + Socket.io entry | `server/index.js` | Serves `public/` as static files |
| REST API | `server/routes/api.js` | Mounted at `/api` |
| Web Push | `server/routes/push.js`, `server/utils/pushNotifications.js` | Optional; needs VAPID in `.env` |
| Socket handlers | `server/socket/handlers.js` | Use `SOCKET_EVENTS` from `server/utils/constants.js` |
| DB / file access | `server/db/*.js` | Goes through `fileDb` helpers |
| Shared enums / event names | `server/utils/constants.js` | **Add new socket event strings here** and mirror usage on the client |
| Pages | `public/*.html` | One HTML file per “app screen” |
| Page scripts | `public/js/pages/*.js` | Loaded after shared scripts |
| Shared client JS | `public/js/utils.js`, `socket-client.js`, `auth.js`, … | |
| Styles | `public/css/base.css`, `components.css`, `animations.css` | Prefer **CSS classes** over inline `style=` (lint/accessibility) |
| Service worker | `public/sw.js` | Push subscription lifecycle |

## Conventions

- **JavaScript:** `'use strict';` at top of server files; client page scripts often wrap in an IIFE. **CommonJS** on the server (`require` / `module.exports`).
- **API & sockets:** Keep request bodies and socket payloads consistent with existing patterns; extend `constants.js` instead of scattering magic strings.
- **Auth:** Bar/guest/leaderboard flows use a shared password and `sessionStorage` token via `public/js/auth.js`—don’t invent a second auth model without a maintainer decision.
- **UI copy:** User-facing strings are often **German**; keep tone consistent with surrounding text.
- **CSS / HTML hygiene:** Use utilities in `components.css` for repeated layout (avoid large inline styles). For form controls that need a label for accessibility, use a visually hidden label pattern (e.g. `.sr-only`) and stable `id`s where scripts depend on them.
- **Secrets:** Never commit real `config.json` passwords, `.env`, or `data/`. `config.json` and `.env.example` patterns belong in docs/README, not live secrets.

## What agents should do

1. **Match existing style**—naming, file placement, and comment level should blend with neighboring code.
2. **Keep changes minimal**—fix the requested bug or feature without drive-by refactors or unrelated formatting.
3. **Touch the smallest surface**—prefer extending `constants`, `api.js`, and one page script over rewriting multiple layers.
4. **Preserve real-time behavior**—if you change order lifecycle or bar state, verify both REST and Socket.io paths still agree.
5. **Run the app** after substantive edits: `npm run dev` (or `node server/index.js`) and exercise the affected page in a browser.

## What agents should avoid

- Adding a **frontend framework**, **bundler**, or **ORM** without an explicit maintainer decision.
- Writing **synchronous bulk writes** to JSON files outside the existing `fileDb` patterns.
- **Renaming socket events** without updating both server and all clients that subscribe.
- Committing **generated keys**, production URLs, or personal data.

## Testing

- There is no mandatory unit test suite in CI; **manual smoke testing** of guest → bar → status updates is the default bar for risky changes.
- Playwright is listed under `devDependencies`; if you add automated checks, keep them maintainable and scoped.

## Commit messages

Follow **[Conventional Commits](https://www.conventionalcommits.org/)**-style summaries so history stays scannable.

**Subject line (first line)**

- Format: `type(scope): short description` — `scope` is optional but useful (e.g. `guest`, `bar`, `api`, `socket`, `css`).
- **Imperative mood**, as if completing: “add cart checkout” not “added” or “adds”.
- **~50 characters** is ideal; stay under **72** so tools don’t wrap awkwardly.
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

- Explain **why** if the subject isn’t enough (bug context, trade-off, link to issue).
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
- Mixing unrelated changes in one commit—split commits when the diff does two different things.

## Pull requests

**Scope**

- **One logical change** per PR when practical (easier review, safer revert). If you must bundle, say so in the description.
- **Rebase or merge** from the target branch (`master`) so the diff stays current; resolve conflicts before requesting review.

**Title**

- Should read like a **clear outcome**: e.g. `Add quantity stepper to guest cart` or `fix: bar overlay closes on outside tap`.
- Match the **main commit** if the PR is a single commit; otherwise summarize the whole set.

**Description — include when relevant**

- **Context:** what problem this solves (or link `Fixes #123` / `Refs #123`).
- **What changed:** bullet list by area (server / guest UI / bar UI) — not a file-by-file dump unless huge.
- **How to test:** numbered steps (e.g. open `/guest.html`, add two drinks, submit — bar should show both lines).
- **UI changes:** **screenshots or short screen recording** for layout/visual work.
- **Risks / follow-ups:** socket behavior, data migration, known limitations.

**Before opening / marking ready**

- [ ] Diff is **self-reviewed** (debug `console.log`, commented-out code, accidental `config.json` edits removed).
- [ ] **Smoke-tested** paths touched (see Testing above).
- [ ] **Commit messages** on the branch follow the commit guidelines above.

**Draft PRs**

- Use **draft** until tests pass and description is filled in; switch to **ready for review** when you want feedback.

## When in doubt

Prefer asking for clarification over guessing—especially for **order schema**, **bar state machine**, and **push subscription** flows. If README and this file disagree, **README** is authoritative for setup; **this file** is authoritative for agent behavior and code layout expectations.
