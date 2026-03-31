# Guidelines for AI-assisted contributors

Read [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, commit messages, and PR guidelines that apply to all contributors. Read [README.md](README.md) for project overview, tech stack, and file structure.

This file covers **AI-specific** behavior expectations.

## What agents should do

1. **Match existing style** — naming, file placement, and comment level should blend with neighboring code.
2. **Keep changes minimal** — fix the requested bug or feature without drive-by refactors or unrelated formatting.
3. **Touch the smallest surface** — prefer extending `constants`, `api.js`, and one page script over rewriting multiple layers.
4. **Preserve real-time behavior** — if you change order lifecycle or bar state, verify both REST and Socket.io paths still agree.
5. **Run the app** after substantive edits: `npm run dev` (or `node server/index.js`) and exercise the affected page in a browser.

## What agents should avoid

- Adding a **frontend framework**, **bundler**, or **ORM** without an explicit maintainer decision.
- Writing **synchronous bulk writes** to JSON files outside the existing `fileDb` patterns.
- **Renaming socket events** without updating both server and all clients that subscribe.
- Committing **generated keys**, production URLs, or personal data.

## When in doubt

Prefer asking for clarification over guessing — especially for **order schema**, **bar state machine**, and **push subscription** flows. If README and this file disagree, **README** is authoritative for setup; **CONTRIBUTING.md** is authoritative for conventions; **this file** is authoritative for agent behavior.
