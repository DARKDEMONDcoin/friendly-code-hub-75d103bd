# Megsy Quality Audit Memory

Updated: 2026-06-23

## Operating rule
- Keep this file updated whenever reliability, mobile performance, pricing/credits, model data, support knowledge, settings, or service functionality is changed.

## Confirmed critical issues
- Mobile black/blank loading risk: route Suspense and protected auth loading previously rendered an empty/dark screen. Fixed with a lightweight visible skeleton.
- Error recovery UX: the app showed a generic full-screen crash that forced reload. Improved to show a recoverable retry and a short safe error detail.
- iPhone/mobile lag: global blurred backgrounds, pricing bubbles, grid overlays, backdrop filters, and decorative animations were active across phones. Reduced/disabled on touch/mobile breakpoints.
- Pricing/credit drift: pricing page, feature guide, workspace plans, and support knowledge had inconsistent MC amounts. Unified plan credits to Starter 70, Pro 240, Elite 500, Business 1,200 MC/month.
- Unexpected 1000-credit balances: database inspection found historical 1000-credit rows and credit transactions labelled “Backfill: Starter subscription credits”; not all users are affected, but affected balances must be normalized separately.
- Fake/stale model claims: chat/model descriptions named specific upstream models and token sizes that can drift. Replaced hardcoded claims with live-routing language and invalidated the model cache.
- Broken gating risk: subscription gating was disabled in code and treated every user as paid. Restored plan-based gating.
- Visible placeholder bug: pricing cards rendered the word “PLACEHOLDER” on desktop. Removed from UI.

## Open audit areas
- Deep service audit: verify every generation route and edge function with real authenticated calls.
- Settings audit: verify every settings page writes to Supabase or clearly disables unavailable controls.
- Desktop redesign: unify desktop settings/chat/billing with the current mobile visual system without hardcoded colors.
- Model catalog audit: compare every `image_models` and `video_models` database row to actual provider capabilities and active edge-function support.
- Support knowledge refresh: regenerate `siteKnowledge.md` after every public-page copy/pricing change.

## Verification notes
- Playwright smoke test on localhost checked mobile home, desktop home, mobile settings redirect, and desktop pricing without page errors.
- Supabase checks confirmed `profiles.credits` default is 0 and the active test account has plan `pro` with 2705 MC.
## Round 2 fixes (2026-06-23)

- ErrorBoundary: reset state immediately for transient chunk errors so we never flash "Something went wrong" before the silent reload (`ErrorBoundary.tsx:55-70`).
- Mobile prefetch: limit warm-up to 2 chunks on touch devices to free first-paint budget (`App.tsx:181-197`).
- LiveAurora: detect `(hover: none) and (pointer: coarse)` + `prefers-reduced-motion` and render a static gradient instead of three animated `mix-blend-screen blur-3xl` blobs — the heaviest visual on iPhone.
- Stars background canvas: pause draw work when `document.hidden` to save battery.
- Referral signup credits: fixed `CREDITS_PER_SIGNUP` constant from 5 → 15 to match the database function `claim_referral_signup` (grants 15) and the UI promise on landing/auth pages.
- Removed orphaned `PlansModelsPage` (lazy-imported, never routed, stale plan names — ESSENTIAL/PREMIUM/ULTIMATE). PricingPage is now the only pricing surface.

## Round 3 fixes (2026-06-23)

- Vite dep scan: scoped `optimizeDeps.entries` to `index.html` + `src/**` so the noisy "Failed to run dependency scan" warning from `public/templates/*.html` (3D demo bundles) stops on every dev boot.
- Mobile pricing: replaced fake "Unlimited Claude 4.6 / GPT-5 / Sora / Veo 3" bullets and "All paid plans unlimited" splash chips with credit-based language and neutral capability chips.
- Workspace plans (`src/lib/workspacePlans.ts`): removed "Claude Sonnet 4 & Opus 4 — Unlimited & Free" perks across Pro/Elite/Business; replaced with credit-based / queue / support tiers that match reality.
- Support knowledge: removed hardcoded model names from the assistant prompt — it now refers to "current frontier models" + in-app picker, so it never lies when the catalog changes.

## Round 4 fixes (2026-06-23)

- System Status page: was rendering mock services + fake incident history ("Video Generation degraded", "Flux Pro outage Jun 10"). Now reads live from `service_status` + `service_incidents` tables, shows "All systems operational" / "No incidents reported" when the tables are empty, and displays the real last-checked timestamp.
- Security CRITICAL — `_shared/tasks-bot.ts` internal action router (`notify_admins`, `admin_stats`, `new_subscription`, `run_agent`, `setup_webhook`, …) was publicly reachable through the `telegram-tasks-bot` webhook URL. Added `INTERNAL_ACTIONS_SECRET` shared-secret check: every action call must send header `x-internal-secret` matching the env value, otherwise 401. The Telegram webhook path (no `action` field) is unaffected.
- Security HIGH — `agent-run` `seed-squads` action was processed BEFORE auth, letting anyone overwrite `agents_catalog` / `agent_squads`. Now requires a valid Bearer JWT and `has_role(user, 'admin')`.
- No client callers of the tasks-bot internal actions existed in the repo, so the secret rollout is backend-only.
- Trust Center: removed unverified "over 180 countries" claim — now just says "worldwide".
- Supabase linter snapshot: 87 advisories (mostly `function_search_path_mutable` + `security_definer_view` on legacy DB functions, plus a couple of permissive RLS policies). Tracked here for the next dedicated DB hardening pass — not safe to mass-rewrite without per-function review.
- Marketing copy audit: model-name drift was already cleaned in earlier rounds; remaining "Unlimited" wording in pricing pages is accurate (chat IS unlimited on paid plans; generations are credit-based and labeled as such).

## Round 6 — Production probe (2026-06-23)

Tested live `https://www.megsyai.com` with Playwright + the test account `support@megsyai.com`:

- **Real desktop perf is healthy on prod**: TTFB 227ms, DOMContentLoaded 502ms, FCP 1.33s, total JS ~1.0MB, 62 resources, zero console errors on `/`, `/chat`, `/pricing`, `/blog`, `/trust`, `/contact`, `/auth`. Biggest chunk is `ChatMessage` (305KB transferred) — flagged for future split, but not blocking.
- **Critical DB bug fixed**: `public.profiles` was missing `GRANT UPDATE … TO authenticated`. The RLS policy "Users can update own profile" existed but PostgREST refused every profile UPDATE with 403, so display name / avatar / `chat_greeted` / `active_workspace_id` writes silently failed in production. Added the missing GRANT (+ `GRANT ALL … TO service_role`). All other user-scoped tables already had correct grants — verified via `has_table_privilege` sweep over 14 hot tables.
- **403 noise on `/rest/v1/profiles?id=eq.<uid>`** observed in console immediately after login — confirmed as the same missing-grant + early-fire race; resolved by the migration above.
- **Stale published bundle**: prod build (`/assets/index-*.js`) predates Rounds 1–5. Code-side fixes (mobile auroras, error boundary, pricing copy, system status live data, internal-secret guard, agent-run admin check) are in the repo but not yet shipped — a `Publish` is required to deliver them to megsyai.com.
- **Soft 404 polish**: added redirects `/referrals → /settings/referrals` and `/billing/referrals → /settings/referrals` so guess-URLs land on the right page instead of NotFound.
- **No failed network requests** on the marketing surface; no `pageerror`s anywhere we probed. The "site is in catastrophic failure" complaint is not reproducible against current code on desktop; it was real before Round 1 fixes (mobile auroras + ErrorBoundary loop + plan gating turned off).

## Round 7 — Authenticated route sweep (2026-06-23)

Logged in as `support@megsyai.com` and walked 25 authenticated routes against live prod with Playwright:

- **All real settings/billing/referrals/operator pages render with zero console errors and no failed network requests** after the Round 6 grant fix — including `/settings/system-status`, `/settings/operator/audit` (12.3KB rendered), `/settings/referrals/*` (dashboard, program, tasks, withdrawals), `/settings/memory`, `/settings/customization`, `/settings/language`, `/settings/notifications`, `/settings/privacy`, `/settings/profile`, `/settings/change-email`, `/settings/change-password`, `/settings/delete-account`.
- **Three "missing" routes were actually wrong-URL guesses**, not bugs: the real paths are `/settings/support/help`, `/settings/support/contact`, `/settings/switch`. Added soft redirects from `/settings/help`, `/settings/contact`, `/settings/switch-account` so guess-URLs work.
- **Chat surface** body length 172 on `/chat` is expected (empty conversation skeleton until the user types — the composer renders client-side after auth resolves).
- Prod is functionally healthy on desktop end-to-end once the missing `profiles` UPDATE grant from Round 6 is in place; remaining gap is the stale published bundle (Rounds 1–6 fixes not yet shipped to megsyai.com).

## Round 8 — Live chat probe + embeddings circuit breaker (2026-06-23)

- **Real chat on prod works end-to-end.** Sent "Say 'hello world' in one sentence" as `support@megsyai.com`; got "Hello world!" back with zero 4xx/5xx and zero console errors.
- **No more `profiles 403`** after the Round 6 grant fix shipped — re-tested on the live `megsyai.com` bundle.
- **New finding from edge logs**: `chat-alibaba/embed` was throwing `DashScope embeddings 400: The free tier of the model has been exhausted` on every message — repeated since 08:02 UTC. Throwing inside the embed call was being caught by chat but flooded logs, added latency, and could break memory features.
- **Fixed in `supabase/functions/_shared/embeddings.ts`**: replaced the hard `throw` with a module-level circuit breaker. On 401/403/429 or any "free tier / quota / exhaust / insufficient" message, embeddings disable for 60 minutes and return `[]` so memory features degrade gracefully instead of crashing the request. Missing key now also returns `[]` instead of throwing. Logged as a single `console.warn`, not per-message.
- **Slow-query check**: top offenders (`messages` with `images IS NOT NULL`, `conversations` by `user_id+mode`) already have matching partial/composite indexes (`idx_messages_images_partial`, `idx_conversations_user_mode_updated`). No index migration needed; high totals are historical from the pre-Round-4 mock `service_status` insert churn (146k inserts, 0 rows now).
