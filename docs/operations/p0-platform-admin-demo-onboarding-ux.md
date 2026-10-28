# P0 — Platform administration, demo data, onboarding and UX

## Governance

This roadmap tracks verified evidence, not claims of completion. Every implementation is a narrow PR with tests and direct evidence. Do not merge or deploy autonomously.

Allowed statuses: `DONE_VERIFIED`, `IN_PROGRESS`, `BLOCKED`, `NOT_STARTED`, `UNVERIFIED`.

## Latest verified baseline

Baseline: `main` at `d40e9ea28c93cdf234c870c7118ac1c8a4c9b823` (2026-10-28, merge of PR #87).

- PR #85 adds HTTP regression coverage that a tenant admin cannot read/deactivate another tenant's team member. CI run `40668715854` passed lint, backend/frontend type-check, Vitest and build.
- PR #86 adds HTTP regression coverage that a tenant admin cannot read/update another tenant's location and that the rejected update has no side effect. CI run `40709870748` passed.
- PR #87 adds HTTP regression tests for client-supplied `role`/`platformRole` on registration, team invitation and profile update. CI run `40710324312` passed lint, backend/frontend type-check, Vitest and build.
- `server/assets.test.ts` already covers cross-tenant asset list/read/update/archive/reactivate and rejects cross-tenant location use on creation.
- `server/interventions.test.ts` and report tests contain existing cross-tenant coverage; this is not a complete route-by-route audit.
- `server/routes/admin.ts` exposes only read-only `/stats` and `/tenants` routes and applies `authenticate` plus `requireSuperAdmin` router-wide. The new PR adds integration coverage for company-admin denial and canonical CEO access to both endpoints; that new CI is pending.
- The latest repository search did not find active clone/sandbox API implementation references beyond roadmap requirements, but this is a search-based review and not yet a complete UI/config/seeder audit.

## Ordered checkpoints

### P0-ROLE — Separate platform authority from company roles

Status: `IN_PROGRESS`

Evidence: PRs #84, #85, #86 and #87 are merged. CI passed for each referenced change. Coverage now includes canonical CEO email enforcement, rejection of client-supplied role/platformRole fields on registration/invite/profile update, cross-tenant team-member isolation, cross-tenant location isolation, and existing asset/intervention/report isolation tests.

Acceptance criteria:
- Keep company roles scoped to their own company and platform CEO authority separate from company administration.
- Never accept platform authority from registration, invite payloads, profile updates or ordinary team-management APIs.
- Provision CEO identity only through trusted server-side mechanisms; fail closed for invalid identity/configuration.
- Complete a route → middleware → service → adapter review for every tenant-scoped endpoint, including negative authorization paths and no-side-effect assertions.
- Review session invalidation, auditability, migration/backfill safety and existing `superadmin` compatibility before persisted-role changes.
- Do not remove or rename legacy `superadmin` values until all usages and records are accounted for.

### P0-CEO-CONSOLE — Platform-wide administration

Status: `IN_PROGRESS`

Evidence: existing `/api/v1/admin/stats` and `/api/v1/admin/tenants` are server-protected by `requireSuperAdmin`, which delegates to CEO platform authorization. PR #88 adds HTTP integration coverage for company-admin denial and canonical CEO access; its CI run `40716278555` passed lint, backend/frontend type-check, Vitest and build. A separate audit found `total_clients` hardcoded to `42` in both database adapters; PR #91 proposes counting actual customer records and adding adapter regression tests, pending CI. The console remains read-only; company/user lifecycle operations, persistent audit events, destructive-operation safeguards and session revocation remain unimplemented or unverified.

Acceptance criteria:
- CEO-only console can list/manage companies and account lifecycle across tenants.
- Every endpoint enforces platform authorization server-side; company Admin remains tenant-scoped.
- Sensitive operations require explicit safeguards, persistent audit events and session revocation where appropriate.
- Deletion behavior documents dependencies, retention, backup and recovery; no implicit destructive cascades.
- Tests cover unauthorized access, cross-tenant IDOR, destructive operations and session revocation.

### P0-REMOVE-SANDBOX-CLONE — Remove general sandbox/clone access

Status: `IN_PROGRESS`

Evidence: PR #82 added a frontend guard and removed the dashboard entry point; PR #83/#84 removed the sandbox route source and generated route-tree references. The latest search did not find an active clone/sandbox API implementation, but a full UI/routes/API/seeders/config audit and direct-access regression tests are still outstanding.

Acceptance criteria:
- Audit every sandbox/demo/clone entry point across UI, routes, APIs, seeders and configuration.
- Remove/disable general global clone functionality unless a specifically authorized internal demo flow is required.
- Do not rely on hidden UI for authorization; direct API calls must also be rejected.
- Add tests proving ordinary users cannot clone data or create demo tenants.

### P0-DEMO-DATA — Synthetic data for the authorized demo account only

Status: `NOT_STARTED`

Acceptance criteria:
- Populate only the explicitly authorized account `jack.cardinali15@gmail.com` with wholly synthetic company/customer/location/asset/intervention/report data.
- Never copy real customer data, create demo content for other tenants, or grant CEO permissions as a seeding side effect.
- Use an explicit, idempotent, opt-in seed operation that verifies the intended account/tenant server-side and fails closed on mismatch.
- Mark generated records as demo data where possible; document cleanup and test idempotency/tenant isolation.
- Do not run the seeder against production until the target account/tenant and operation are explicitly verified.

### P0-ONBOARDING — Required first-run setup

Status: `NOT_STARTED`

Acceptance criteria:
- Require minimal company setup after account creation/authentication before normal workflows.
- Persist progress server-side so refresh/relogin cannot bypass required steps.
- Validate fields server-side and provide accessible loading, validation, error and recovery states.
- Test new/existing users, incomplete setup, reloads, expired sessions and direct API access.

### P0-TUTORIAL — Optional product tour

Status: `NOT_STARTED`

Acceptance criteria:
- Keep tutorial separate from mandatory onboarding; allow skip, dismiss, resume and restart.
- Persist per-user tutorial state and support keyboard access.
- Verify responsive layouts and behavior when a target control is unavailable.

### P0-PDF-UX — PDF preview, responsive UI and UX defects

Status: `NOT_STARTED`

Acceptance criteria:
- Reproduce reported preview failures and trace generation, response headers/body, browser preview, object URL lifecycle and error states.
- Fix confirmed root causes with regression tests for success, malformed/failed responses, loading, close/reopen and cleanup.
- Audit high-impact phone/desktop usability issues; verify responsive layouts, focus, overflow and accessible errors.
- Measure claimed performance improvements; avoid speculative refactors.

## Deferred work and release rules

- P0.9 backup/restore: `BLOCKED` — explicitly deferred by the user.
- Supabase RLS: `BLOCKED` — explicitly deferred by the user.
- One checkpoint per PR unless an inseparable dependency is documented.
- Never push directly to `main`, merge autonomously, deploy autonomously or bypass CI/review.
- Before each PR, verify `main`, open PRs, dependencies, CI and exact diff.
- Report commits, PR URL, tests actually executed, observed results, untested cases and live checks separately.
