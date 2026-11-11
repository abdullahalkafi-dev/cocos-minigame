# Documentation

Start here. Each folder answers one kind of question.

| Folder | Read it when you want to know... |
|---|---|
| [`architecture/`](architecture) | how the system is built and why: the big picture, backend modules, data model, dashboard, game client |
| [`guides/`](guides) | how to do something: run it locally, test it, add a game |
| [`games/`](games) | what a game contains and what a buyer can customize (written so you can present it to a client) |
| [`operations/`](operations) | how to deploy, update, back up and migrate |
| [`ai/`](ai/README.md) | how to use these docs with an AI assistant: playbook, ready-made prompts, rules for AI working in this repo |
| [`roadmap.md`](roadmap.md) | what is planned next and the reasoning behind it |

**For a client's developer, or their AI assistant** (integrating a game into their own site or app): start with [`ai/README.md`](ai/README.md) and the live `/llms.txt`, `/llms-full.txt` and `/openapi.json`. The public integration guide is served by the running server at `/docs/` (source: [`server/public/docs/index.html`](../server/public/docs/index.html)). It covers the API key, game IDs, session creation in Node.js, Python, Java, PHP and cURL, embedding in a website, React and Flutter, events, errors and security.

## Reading order for a new developer on this project

1. [`architecture/overview.md`](architecture/overview.md): the pieces and how a request flows through them
2. [`architecture/backend.md`](architecture/backend.md): the rules every backend module follows
3. [`architecture/data-model.md`](architecture/data-model.md): the collections and the money rules
4. [`architecture/wallets.md`](architecture/wallets.md): who holds the coins (demo, managed, seamless)
5. [`architecture/realtime.md`](architecture/realtime.md): rooms, the live hub and WebSocket push
6. [`guides/local-development.md`](guides/local-development.md): get it running
7. [`guides/adding-a-game.md`](guides/adding-a-game.md): the most common extension
8. [`/AGENTS.md`](../AGENTS.md) if you are (or use) an AI assistant
