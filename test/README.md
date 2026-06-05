# FinAlly E2E Tests

End-to-end Playwright tests for FinAlly (SPEC §12). They drive the **assembled
app** — FastAPI serving the static frontend plus all `/api/*` routes on a single
origin (port 8000) — and assert the user-visible behaviour and the documented
[`/api/*` contract](../planning/agent-contract.md).

Tests run with **`LLM_MOCK=true`** (deterministic, no API key) and the built-in
**market simulator** (no `MASSIVE_API_KEY`), so they are fast and reproducible.

## Scenarios covered

| Spec file | Scenario (SPEC §12) |
|-----------|---------------------|
| `tests/fresh-start.spec.ts` | Default watchlist appears, $10k balance shown, prices streaming |
| `tests/watchlist.spec.ts` | Add and remove a watchlist ticker |
| `tests/trade.spec.ts` | Buy (cash down, position appears) / sell (cash up, position updates); insufficient-shares guard |
| `tests/portfolio-viz.spec.ts` | Heatmap renders, P&L chart has data points |
| `tests/chat.spec.ts` | Mocked AI chat: send → response, inline trade execution |
| `tests/sse-resilience.spec.ts` | Stream disconnect → auto-reconnect |

## Run with Docker (recommended)

A separate `docker-compose.test.yml` spins up the production app container plus a
Playwright container, keeping browser deps out of the app image. The app uses an
ephemeral (`tmpfs`) database, so every run starts from the fresh seed.

```bash
cd test
docker compose -f docker-compose.test.yml up --build \
  --abort-on-container-exit --exit-code-from playwright
# tear down
docker compose -f docker-compose.test.yml down -v
```

The `playwright` service's exit code is the test result (0 = pass). The HTML
report is written to `test/playwright-report/`.

> The `app` service builds from the repo-root `Dockerfile` (multi-stage image
> from fin-vix4). The compose stack is self-contained otherwise.

## Run locally against a running app

If the app is already running on `http://localhost:8000` (e.g. `docker run` or a
dev server) with `LLM_MOCK=true`:

```bash
cd test
npm ci
npx playwright install --with-deps chromium
BASE_URL=http://localhost:8000 npx playwright test
```

Useful variants: `npm run test:headed`, `npm run test:ui`, `npm run report`.

## Conventions

- Specs lean on **accessible selectors** (roles, labels, placeholders, visible
  text) rather than `data-testid`, matching the frontend's current markup.
- UI actions are **cross-checked against the API contract** (`/api/portfolio`,
  `/api/watchlist`, `/api/portfolio/history`) so assertions are robust to
  incidental DOM changes and to async UI refreshes after a mutation.
- The suite runs **serially** (`workers: 1`) because trades mutate shared
  server state; determinism is preferred over parallel speed.
