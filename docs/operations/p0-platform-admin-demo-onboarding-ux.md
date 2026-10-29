# P0 — Platform administration, demo data, onboarding and UX

## Governance

This roadmap tracks verified evidence, not claims of completion. Every implementation is a narrow PR with tests and direct evidence. Do not merge or deploy autonomously.

Allowed statuses: `DONE_VERIFIED`, `IN_PROGRESS`, `BLOCKED`, `NOT_STARTED`, `UNVERIFIED`.

## Latest verified baseline

Baseline: `main` at `4f162aa99bc8a5ef01fc262b89f7d906732db7cb` (2026-10-29, merge of PR #102).

- PR #85 adds HTTP regression coverage that a tenant admin cannot read/deactivate another tenant's team member. CI run `40668715854` passed lint, backend/frontend type-check, Vitest and build.
- PR #86 adds HTTP regression coverage that a tenant admin cannot read/update another tenant's location and that the rejected update has no side effect. CI run `40709870748` passed.
- PR #87 adds HTTP regression tests for client-supplied `role`/`platformRole` on registration, team invitation and profile update. CI run `40710324312` passed lint, backend/frontend type-check, Vitest and build.
- `server/assets.test.ts` already covers cross-tenant asset list/read/update/archive/reactivate and rejects cross-tenant location use on creation.
- `server/interventions.test.ts` and report tests contain existing cross-tenant coverage; this is not a complete route-by-route audit.
- PR #88 adds HTTP integration tests proving a company admin receives 403 on `/api/v1/admin/stats` and `/api/v1/admin/tenants`, while the canonical CEO can read both endpoints. CI run `40716278555` passed lint, backend/frontend type-check, Vitest and build; merge commit is `4007c5fba31585c6004e4103834041f016c15aed`.
- The latest repository search did not find active clone/sandbox API implementation references beyond roadmap requirements, but this is a search-based review and not yet a complete UI/config/seeder audit.
- PR #89 (`1b704b9a07e6f143f965dc0128e3ad1156f005b7`) adds persisted-state assertions after cross-tenant intervention update/transition attempts; CI run [40718550835](https://github.com/Neyza-3011/Base_Grid/actions/runs/40718550835) passed.
- PR #90 (`1d6b935a40ca0a70e961faeb5145a44ee8e807b6`) adds persisted-state assertions for cross-tenant location alias mutations; CI run [40718853029](https://github.com/Neyza-3011/Base_Grid/actions/runs/40718853029) passed.
- PR #91 (`988dba939702bfa7fc28d50e37920b544e70365c`) replaces the hard-coded customer count with adapter-backed counts and regression tests; CI run [40718888230](https://github.com/Neyza-3011/Base_Grid/actions/runs/40718888230) passed.
- PR #92 (`2a831abb2728f3d5a9154764a1c0fadc2fbcb7a9`) extracts PDF blob validation and adds focused valid/invalid blob tests. Current `main` CI run [40721405563](https://github.com/Neyza-3011/Base_Grid/actions/runs/40721405563) passed lint, backend/frontend type-check, Vitest and build. The broader live PDF UX flow remains unverified.
- PR #93 (`9f2acfadb0d6e8a772b95e21a54acb2352cb1192`) synchronizes this roadmap through PR #92; merged as `c7763917b48f2ecd54ba2a68c1d04f683d07f0c3`.
- PR #94 (`9769606c7974f1d50856ee51ab5897d0ae0f0d3a`) adds HTTP coverage for company settings authentication, client-supplied `companyId`, and subscription-status privilege separation. PR CI [40722437444](https://github.com/Neyza-3011/Base_Grid/actions/runs/40722437444) passed; merge commit is `8bb7c8ae1625caaab5816a486eafb32b2848a323`. This is focused coverage, not completion of the full route-by-route P0-ROLE audit.
- PR #95 (`0a77f053cb74124e38ecab0882f12e6befad4a92`) synchronizes this roadmap after PR #94; CI run [40730407882](https://github.com/Neyza-3011/Base_Grid/actions/runs/40730407882) passed.
- PR #96 (`a0a567a22995bd7cd2dc905a508a31e5411b323a`) adds keyboard focus trapping and focus restoration for the PDF preview modal. CI run [40777194209](https://github.com/Neyza-3011/Base_Grid/actions/runs/40777194209) passed lint, backend/frontend type-check, Vitest and build. Browser and screen-reader validation remain unverified.
- PR #97 (`b0a6398fb287a9d0ae031d3d63f6df6aad9a3b2e`) adds persisted-state assertions proving rejected cross-tenant asset update/archive/reactivate attempts do not mutate the owner's asset. CI run [40777274381](https://github.com/Neyza-3011/Base_Grid/actions/runs/40777274381) passed.
- PR #98 (`b4ebbf66443adccefb4389dd57f80c47e958a534`) adds persisted-state assertions proving rejected cross-tenant customer update/archive/reactivate attempts do not mutate the owner's customer. PR CI run [40778521447](https://github.com/Neyza-3011/Base_Grid/actions/runs/40778521447) passed lint, backend/frontend type-check, Vitest and build.
- PR #99 (`84595e2f55d739a84dab5e40e44fa9b6824e64c1`) adds HTTP regression coverage that a cross-tenant team-member update returns 404 and leaves persisted user state unchanged. CI run [40785978435](https://github.com/Neyza-3011/Base_Grid/actions/runs/40785978435) passed lint, backend/frontend type-check, Vitest and build.
- PR #100 (`ed47ed2c9beb06d6424903fe7e6b06fb81311e44`) fixes explicit null/blank optional-field clearing across customer, location, asset and intervention services and adds field-clearing tests. CI run [40827895363](https://github.com/Neyza-3011/Base_Grid/actions/runs/40827895363) passed lint, backend/frontend type-check, Vitest and build.
- PR #101 (`a24895b929cdfdaa101eba3495501b4aeb9d7323`) hardens runtime validation in `TeamService` and checks token-store availability before changing an email when verification requires session revocation. CI run [40827918008](https://github.com/Neyza-3011/Base_Grid/actions/runs/40827918008) passed lint, backend/frontend type-check, Vitest and build.
- PR #102 (`4f162aa99bc8a5ef01fc262b89f7d906732db7cb`) terminates the spawned Nitro child process on startup-readiness failure, modernizes Vitest config to `.mts`, reduces CPU-heavy concurrent mock registrations, and removes unreferenced `all_routes.ts`. CI run [40827945196](https://github.com/Neyza-3011/Base_Grid/actions/runs/40827945196) passed lint, backend/frontend type-check, Vitest and build.
- Current `main` CI run [40827945196](https://github.com/Neyza-3011/Base_Grid/actions/runs/40827945196) passed on `4f162aa99bc8a5ef01fc262b89f7d906732db7cb`; scheduled Render Smoke Tests run [40825371370](https://github.com/Neyza-3011/Base_Grid/actions/runs/40825371370) passed on PR #99 merge commit. Smoke tests are not full production validation.

## Ordered checkpoints

### P0-ROLE — Separate platform authority from company roles

Status: `IN_PROGRESS`

Evidence: PRs #84–#87 and #94 are merged; referenced CI runs passed. Coverage includes canonical CEO email enforcement, rejection of client-supplied role/platformRole fields on registration/invite/profile update, cross-tenant team-member and location isolation, existing asset/intervention/report isolation tests, focused company-settings HTTP tests, and no-side-effect assertions for rejected cross-tenant asset mutations (PR #97), customer mutations (PR #98), and team-member profile/role updates (PR #99). PR #101 adds runtime input validation and fail-closed handling for email changes requiring session revocation. `main` at `4f162aa99bc8a5ef01fc262b89f7d906732db7cb` passes CI run `40827945196`. This is still not a complete route-by-route audit; cross-tenant activation/deactivation side effects remain to be covered.

Acceptance criteria:
- Keep company roles scoped to their own company and platform CEO authority separate from company administration.
- Never accept platform authority from registration, invite payloads, profile updates or ordinary team-management APIs.
- Provision CEO identity only through trusted server-side mechanisms; fail closed for invalid identity/configuration.
- Complete a route → middleware → service → adapter review for every tenant-scoped endpoint, including negative authorization paths and no-side-effect assertions.
- Review session invalidation, auditability, migration/backfill safety and existing `superadmin` compatibility before persisted-role changes.
- Do not remove or rename legacy `superadmin` values until all usages and records are accounted for.

### P0-CEO-CONSOLE — Platform-wide administration

Status: `IN_PROGRESS`

Evidence: existing `/api/v1/admin/stats` and `/api/v1/admin/tenants` are server-protected by `requireSuperAdmin`, which delegates to CEO platform authorization. PR #88 adds HTTP integration coverage for company-admin denial and canonical CEO access; its CI run `40716278555` passed lint, backend/frontend type-check, Vitest and build. A separate audit found `total_clients` hardcoded to `42` in both database adapters; PR #91 removes the hard-coded `total_clients: 42` from both adapters and adds regression coverage; CI run `40718888230` passed. The console remains read-only; company/user lifecycle operations, persistent audit events, destructive-operation safeguards and session revocation remain unimplemented or unverified.

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

Audit evidence: the route tree contains `/wizard`, which creates a rapportino, and invite-acceptance routes; no dedicated required first-run company-setup route or onboarding-progress API/model was found in the searched frontend routes, API route mounts, or migration `002_team_and_onboarding.sql`. This is a targeted search, not a full product-wide proof. Do not confuse the rapportino wizard with company onboarding.

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

Status: `IN_PROGRESS`

Evidence: PR #92 is merged and focused unit tests cover PDF signature/MIME/size validation. PR #96 adds a keyboard focus trap and restores focus to the opener; its CI run `40777194209` passed lint, backend/frontend type-check, Vitest and build. Current `main` CI run `40780167543` passed on `b4ebbf66443adccefb4389dd57f80c47e958a534`. Browser/screen-reader behavior, print-iframe failure cleanup and end-to-end preview behavior remain unverified.

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
