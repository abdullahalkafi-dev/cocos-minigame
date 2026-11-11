# Documentation for AI assistants (and the people who use them)

These files are written so that **a person can read them** and so that **an AI assistant can be given them and work correctly**.
Copy a file (or a URL) into your assistant and ask it to do the task. Every file is self-contained and uses exact names, so
the assistant does not have to guess.

## I am a client's developer and want to integrate the game into my own site or app

Give your AI assistant **one** of these, then describe your stack ("Node/Express backend and a Flutter app", "Django + React", ...):

| You give it | What it contains |
|---|---|
| `https://<our-host>/llms.txt` | Short index: what the system is and where everything is |
| `https://<our-host>/llms-full.txt` | **Everything in one file**: the playbook, glossary, all prompts and the full API contract. Best choice for a chat assistant |
| `https://<our-host>/openapi.json` | The machine-readable API contract (OpenAPI 3.1) for code generators and agents |
| [`integration-playbook.md`](integration-playbook.md) | The step-by-step integration guide written for AI (same content as in `llms-full.txt`) |

Then use one of the ready-made prompts in [`prompts/`](prompts) (copy, replace the `<...>` parts, paste):

| Task | Prompt |
|---|---|
| Create play sessions from my backend | [`integrate-sessions.md`](prompts/integrate-sessions.md) |
| Sell coins with the managed wallet (credit/debit) | [`integrate-managed-wallet.md`](prompts/integrate-managed-wallet.md) |
| Keep coins in my own system (seamless wallet) | [`integrate-seamless-wallet.md`](prompts/integrate-seamless-wallet.md) |
| Receive and verify webhooks | [`webhook-receiver.md`](prompts/webhook-receiver.md) |
| Rooms, lobby and leaderboards | [`rooms-and-leaderboards.md`](prompts/rooms-and-leaderboards.md) |
| Review an integration I already wrote | [`review-my-integration.md`](prompts/review-my-integration.md) |

## I work on this repository (human or AI)

| Read | For |
|---|---|
| [`/AGENTS.md`](../../AGENTS.md) | Rules, commands, repository map, definition of done |
| [`project-context.md`](project-context.md) | A compact description of how the system works (good first message for an assistant) |
| [`dev-guidelines.md`](dev-guidelines.md) | How to make changes safely: patterns, checklists, pitfalls |
| [`glossary.md`](glossary.md) | Exact meaning of the words used in code and docs |
| [`prompts/add-new-game.md`](prompts/add-new-game.md) | A prompt for adding a game |

## Why this exists

Any client should be able to integrate by reading our documentation, with no custom work from us. People now do that by asking an
assistant. The assistant needs facts it can rely on: exact endpoints, field names, error codes, the order of steps, and the mistakes to avoid.
These files provide that, and `/openapi.json` is checked by a test against the real routes so it never drifts.
