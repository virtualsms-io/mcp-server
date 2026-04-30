# `src/tools/v1_3/` — STUBS ONLY

These six TypeScript files are **signatures only** — design pass for v1.3.0.

**No implementation logic shipped here.** Each `handle*` throws a `not implemented` error.

| File | Tool | Design ref |
|------|------|------------|
| `buy-batch.ts` | `virtualsms_buy_batch` | design §4.1 |
| `wait-batch.ts` | `virtualsms_wait_for_sms_batch` | design §4.2 |
| `find-best-pick.ts` | `virtualsms_find_best_pick` | design §4.3 |
| `pay-and-buy.ts` | `virtualsms_pay_and_buy` | design §4.4 |
| `x402-info.ts` | `virtualsms_x402_info` | design §4.5 |
| `subscribe-webhook.ts` | `virtualsms_subscribe_webhook` | design §4.6 |
| `manage-webhooks.ts` | `virtualsms_manage_webhooks` | design §4.6b |

These files are **not** wired into `src/index.ts` or `src/http-server.ts` yet — wiring happens per-task during the implementation phase (see `docs/v1.3.0-plan.md` Tasks 3-9).

Don't ship to npm/registry until the plan is fully executed and all stub `throw`s are replaced with real implementations.
