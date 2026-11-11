# P0 — Platform administration, demo data, onboarding and UX

## Governance

This roadmap tracks verified evidence, not claims of completion. Every implementation is a narrow PR with tests and direct evidence. Do not merge or deploy autonomously.

Allowed statuses: `DONE_VERIFIED`, `IN_PROGRESS`, `BLOCKED`, `NOT_STARTED`, `UNVERIFIED`.

## Current checkpoint — 2026-11-11 (rechecked after PR #254 merge)

- **Current `main`:** [`a13f33b7f6621fbaac98dc622afcf2abca97680d`](https://github.com/Neyza-3011/Base_Grid/commit/a13f33b7f6621fbaac98dc622afcf2abca97680d), merge commit for [PR #255](https://github.com/Neyza-3011/Base_Grid/pull/255), which persists the first onboarding step. Its PR CI run #42996686670 passed lint, both type-checks, Vitest, build and backend runtime smoke before merge.
- **Recent merged changes:** [PR #255](https://github.com/Neyza-3011/Base_Grid/pull/255) persists onboarding identity at the first step; [PR #254](https://github.com/Neyza-3011/Base_Grid/pull/254) reconciles roadmap evidence; [PR #253](https://github.com/Neyza-3011/Base_Grid/pull/253) refreshed the earlier checkpoint; [PR #252](https://github.com/Neyza-3011/Base_Grid/pull/252) updates the product/API/route inventory; [PR #251](https://github.com/Neyza-3011/Base_Grid/pull/251) surfaces incomplete asset-location loads; [PR #250](https://github.com/Neyza-3011/Base_Grid/pull/250) uses the local calendar date for new reports; [PR #249](https://github.com/Neyza-3011/Base_Grid/pull/249) removes simulated subscription and invoice claims. Merges alone do not establish full release readiness.
- **Open implementation PRs at this checkpoint:** [PR #256](https://github.com/Neyza-3011/Base_Grid/pull/256) adds retry for failed company-settings loads; [PR #257](https://github.com/Neyza-3011/Base_Grid/pull/257) restores focus and announces step changes in the product tour; [PR #259](https://github.com/Neyza-3011/Base_Grid/pull/259) handles an empty hourly-rate input without serializing `NaN` as `null`. [PR #258](https://github.com/Neyza-3011/Base_Grid/pull/258) updates this roadmap checkpoint. These PRs are not merged or deployed.
- **CI evidence:** Historical main run [#42993925385](https://github.com/Neyza-3011/Base_Grid/actions/runs/42993925385) ended with `startup_failure` and zero jobs on the preceding main SHA `c6c6efa22d66a469e13ee33c39aaca869dccdc05`; its lint, backend/frontend type-check, tests and build were `NOT_RUN`. The combined status checked on current main exposes a successful Vercel check only; this does not prove GitHub Actions CI passed on `98a306d1b9735c42927fb51248f82eb35ea81802`.
- **PR CI at this checkpoint:** PR #255 run [#42996686670](https://github.com/Neyza-3011/Base_Grid/actions/runs/42996686670) passed all required CI jobs before merge. PR #256 run [#42996743990](https://github.com/Neyza-3011/Base_Grid/actions/runs/42996743990) passed lint, backend/frontend type-check, Vitest, build and runtime smoke. PR #257 run [#42996827359](https://github.com/Neyza-3011/Base_Grid/actions/runs/42996827359) passed those jobs on its earlier head; the latest focus-announcement commit has no surfaced run yet. PR #258 run [#42997066613](https://github.com/Neyza-3011/Base_Grid/actions/runs/42997066613) passed on its earlier head; this documentation update requires a fresh run. PR #259's first run [#42996976896](https://github.com/Neyza-3011/Base_Grid/actions/runs/42996976896) failed lint at line 148 because of Prettier formatting. That formatting has been corrected on the branch, and rerun [#42997930820](https://github.com/Neyza-3011/Base_Grid/actions/runs/42997930820) is `IN_PROGRESS`. Vercel success is not a substitute for the required CI jobs.
- **Live Render smoke:** [run #42971353890](https://github.com/Neyza-3011/Base_Grid/actions/runs/42971353890) passed on 2026-11-11 at 06:17 UTC on older SHA `fb30cb15e25516134bedef560f6cca090bada2d6`. It confirms `/health` and `/ready` passed at that time, but does not identify the currently deployed revision or prove end-to-end product readiness.
- **Roadmap discipline:** Detailed task evidence below originated from the 2026-11-01 snapshot and remains historical unless revalidated against current code, PRs and CI. No task is promoted to `DONE_VERIFIED` by this checkpoint alone.

## Historical baseline snapshot — 2026-11-01

Baseline: `main` at `ccd83c4699e490d8072851017f5c68504e840082` (2026-11-01, merge of PR #132). Main CI run [41328081643](https://github.com/Neyza-3011/Base_Grid/actions/runs/41328081643) completed successfully on this exact SHA, including lint, backend/frontend type-check, Vitest, build and the PostgreSQL + Redis runtime smoke test.

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
- PR #103 (`04ce257099284c0de221184ebb06218f8907d9c4`) adds HTTP regression coverage for cross-tenant team activation/deactivation and asserts persisted user state remains unchanged after both rejected requests. PR CI run [40845008831](https://github.com/Neyza-3011/Base_Grid/actions/runs/40845008831) passed lint, backend/frontend type-check, Vitest and build. Merge commit: `cb456f89c0293099b0e2cd4ed1e35de1ce7ff581`.
- Current `main` CI run [40845568747](https://github.com/Neyza-3011/Base_Grid/actions/runs/40845568747) passed on `cb456f89c0293099b0e2cd4ed1e35de1ce7ff581`. Scheduled Render Smoke Tests run [40825371370](https://github.com/Neyza-3011/Base_Grid/actions/runs/40825371370) passed on PR #99 merge commit. Smoke tests are not full production validation.
- PR #105 (`feat/p0-account-setup-gate`) adds a first-run company setup gate based on persisted company name/address, an onboarding route, and integration tests. The branch CI run [40865145679](https://github.com/Neyza-3011/Base_Grid/actions/runs/40865145679) passed; PR #105 was subsequently merged as `9bd3bfcccc52fa1fc2285d5bcf905c47c8f2ca9c`, and main CI run [40868378977](https://github.com/Neyza-3011/Base_Grid/actions/runs/40868378977) passed. This is a first implementation slice, not full onboarding; contact details, service categories, service area, locale/time zone, browser E2E and additional failure/retry coverage remain outstanding.
- PR #116 adds CEO-only tenant-user profile/role editing and activate/deactivate API controls; the current backend route contains these guarded endpoints and session-revocation checks.
- PR #118 adds CEO tenant platform controls; PRs #121–#124 add persisted platform audit-event storage and audited tenant suspension/reactivation with a CEO console slice. The database migration `012_admin_audit_events.sql` and `/api/v1/admin/audit-events` endpoint exist on this baseline.
- PR #119 improves admin dashboard load-error reporting and retry states.
- PR #126 stabilizes the responsive PDF preview layout; PR #128 adds company-branded reports. Browser-level PDF preview/print and screen-reader verification remain outstanding.
- PR #127 adds a skippable product tour; PR #130 adds the guided company setup wizard. The tour and onboarding code exist, but persisted progress, browser E2E and full first-run setup requirements are not yet fully verified.
- PR #129 improves responsive dashboard layouts; PR #131 improves the CEO panel's mobile layout; PR #132 improves responsive authentication screens.
- Direct source inspection confirms the CEO UI includes tenant search, tenant details, profile editing and user information. The route does not currently call the company suspend/reactivate endpoints or render an audit-event viewer; lifecycle UI, deletion safeguards and browser verification remain incomplete.
- At the 2026-11-01 snapshot, PRs [#133](https://github.com/Neyza-3011/Base_Grid/pull/133) and [#134](https://github.com/Neyza-3011/Base_Grid/pull/134) were open and excluded from that baseline. Both were merged on 2026-11-01: #133 adds retry handling for onboarding settings-load failures, and #134 confirms server logout in CEO/company dashboards. These merges do not establish full onboarding or browser-level logout validation. Vercel preview skips/rate limits are not source-code failures and are not to be worked around.

## Ordered checkpoints

### Priority order for implementation

1. `P0-ACCOUNT-SETUP`: mandatory, persistent setup immediately after account creation.
2. `P0-CEO-CONSOLE`: finalize the CEO-only control panel and full company/account lifecycle management.
3. `P0-CEO-DEMO-ACCOUNT`: seed synthetic demo information only into the explicitly verified CEO account/tenant.
4. Continue the remaining roadmap checkpoints, resolving any security/CI dependency before starting dependent work. This priority order does not waive the route-by-route security audit or release gates.


### P0-ROLE — Separate platform authority from company roles

Status: `IN_PROGRESS`

Evidence recorded at the 2026-11-01 snapshot: `main` at `ccd83c4699e490d8072851017f5c68504e840082` passed CI run `41328081643`. Existing tests covered canonical CEO/platform authority, client-supplied role/platformRole rejection, cross-tenant access and no-side-effect assertions for multiple entity mutations, plus fail-closed session revocation paths. This remains a focused set of protections, not a complete route-by-route authorization audit.

Acceptance criteria:
- Keep company roles scoped to their own company and platform CEO authority separate from company administration.
- Never accept platform authority from registration, invite payloads, profile updates or ordinary team-management APIs.
- Provision CEO identity only through trusted server-side mechanisms; fail closed for invalid identity/configuration.
- Complete a route → middleware → service → adapter review for every tenant-scoped endpoint, including negative authorization paths and no-side-effect assertions.
- Review session invalidation, auditability, migration/backfill safety and existing `superadmin` compatibility before persisted-role changes.
- Do not remove or rename legacy `superadmin` values until all usages and records are accounted for.

### P0-ACCOUNT-SETUP — Configure the company immediately after account creation

Status: `IN_PROGRESS`

The required gate and `/onboarding` route existed at the 2026-11-01 snapshot; PR #130 added a guided two-step company setup form. The server gate is covered by `server/onboarding-gate.test.ts`. The form persists name, address, VAT number, hourly-rate default and report-footer notes. It is not the full setup profile: contact details, service area/categories, locale/time zone and browser E2E remain outstanding. PR #133 added explicit retry handling for settings-load failures and was merged on 2026-11-01; this does not complete the broader setup acceptance criteria.

Acceptance criteria:
- After registration and first authentication, route a new owner through a required, resumable company setup before exposing normal operational workflows. The report/rapportino `/wizard` is not company onboarding.
- Collect and persist the minimum company profile: legal/display name, business contact details, address and service area, supported service categories, locale/time zone, and operational defaults needed by the existing workflows. Ask for tax/legal identifiers only where actually required; do not imply tax/accounting integrations that do not exist.
- Provide clear progress, required versus optional fields, validation, save-and-resume, back navigation, loading/error/retry states and a completion summary. Do not lose data on refresh or re-login.
- Derive tenant/company identity from authenticated server-side state; ignore client-supplied `companyId`. Validate on the server and prevent bypass by direct route/API calls.
- Existing/invited users must not be forced through owner-only company creation; define behavior for partially configured companies and members joining them.
- Add integration tests for new registration, partial completion, persistence across sessions, invalid input, unauthorized bypass, tenant isolation and failure/retry. Verify the full flow in a browser before `DONE_VERIFIED`.

### P0-CEO-DEMO-ACCOUNT — Synthetic demo content for the CEO's explicitly authorized account only

Status: `NOT_STARTED`

Acceptance criteria:
- Use only the explicitly authorized account `jack.cardinali15@gmail.com` after verifying its identity and linked tenant server-side. The seeder must not create, elevate or change CEO/platform permissions.
- Provide realistic but wholly synthetic demo records that let the CEO inspect the actual product: company setup, customers, sites, assets, quotes/jobs/interventions, technicians/calendar, hours/materials, checklists, photos/signatures where safe to synthesize, report PDFs/documents and maintenance examples only for entities supported by the real application.
- Keep demo data isolated from every other tenant and from real customer records. Never copy production customer data or seed every new customer automatically.
- Make the operation explicit, opt-in, idempotent, auditable, reversible/cleanable, and fail-closed if the account/tenant does not match. Clearly label generated data as demo where supported.
- Do not execute a seed against production until the target account, tenant and operation have been directly verified and explicitly authorized. Add tests for repeat runs, wrong account/tenant, isolation, cleanup and no privilege changes.

### P0-CEO-CONSOLE — Platform-wide administration

Status: `IN_PROGRESS`

Evidence from direct inspection of `main` at `c6c6efa22d66a469e13ee33c39aaca869dccdc05` before PR #254: `frontend/src/routes/admin/super-dashboard.tsx` contains tenant search/detail/profile editing, calls `/api/v1/admin/tenants/:id/suspend` and `/reactivate`, and loads/displays up to 50 events from `/api/v1/admin/audit-events?limit=50`. The status mutation uses a confirmation prompt and `appendCsrfHeaders`; the audit panel has loading, error/retry and empty states. `server/migrations/012_admin_audit_events.sql` defines the durable audit table. Therefore the earlier statement that the UI lacked these call sites and the audit viewer was stale. Permanent deletion is not implemented, and browser/E2E lifecycle behavior, persisted audit assertions for all relevant paths, and production behavior remain unverified. Do not infer `DONE_VERIFIED` from source presence alone.

Acceptance criteria:
- Finalize the CEO-only control panel as the central platform administration interface, with searchable/filterable company and user lists, detail views, status/usage summaries, linked records and clear empty/loading/error states.
- View the complete company/account profile and lifecycle information: owner, users and roles, creation/update dates, account status, setup completion, subscription/status fields that truly exist, and relevant operational counts. Distinguish unavailable data from zero and never fabricate metrics.
- Support validated editing of company details, controlled activation/deactivation/suspension/reactivation, user/account management, and viewing related information. Changes must use server-side APIs and respect platform-vs-company authorization.
- Support account/company deletion only through an explicit confirmation flow with typed confirmation or equivalent safeguard, dependency preview, re-authentication/step-up protection where available, persistent audit event, session/token revocation and documented retention/recovery rules. Prefer a reversible suspension/archive when permanent deletion is unsafe or legally constrained; never perform implicit destructive cascades.
- Define the semantics of deleting a login/user versus deleting a company/tenant; show consequences for customers, sites, assets, jobs, documents, signatures, PDFs and audit history before an irreversible action.
- Enforce CEO/platform authorization on every endpoint, not just by hiding UI. Company Admin must remain restricted to its own tenant and must not access the global panel.
- Add positive and negative HTTP/integration tests for list/detail/edit/status/deletion, IDOR, cross-tenant access, unauthorized roles, no-side-effects on rejected operations, audit persistence and session revocation.
- Verify the completed workflows in a browser with real persisted state before `DONE_VERIFIED`.

### P0-REMOVE-SANDBOX-CLONE — Remove general sandbox/clone access

Status: `IN_PROGRESS`

Evidence: PR #82 added a frontend guard and removed the dashboard entry point; PR #83/#84 removed the sandbox route source and generated route-tree references. The latest search did not find an active clone/sandbox API implementation, but a full UI/routes/API/seeders/config audit and direct-access regression tests are still outstanding.

Acceptance criteria:
- Audit every sandbox/demo/clone entry point across UI, routes, APIs, seeders and configuration.
- Remove/disable general global clone functionality unless a specifically authorized internal demo flow is required.
- Do not rely on hidden UI for authorization; direct API calls must also be rejected.
- Add tests proving ordinary users cannot clone data or create demo tenants.


### P0-ONBOARDING — Required first-run setup

Status: `IN_PROGRESS`

Evidence from the historical implementation snapshot: `main` contains `/onboarding`, the server-side company setup gate and `server/onboarding-gate.test.ts`; PR #130 added the guided setup wizard. The form persists company name, address, VAT number, hourly rate and report-footer notes. PR #133, which adds retry handling for settings-load failures, was merged on 2026-11-01; this does not complete the broader setup acceptance criteria. Recheck current code and browser behavior before treating the full onboarding flow as verified.

Acceptance criteria:
- Require minimal company setup after account creation/authentication before exposing normal operational workflows.
- Persist progress server-side so refresh/relogin cannot bypass required steps.
- Validate fields server-side and provide accessible loading, validation, error and recovery states.
- Test new/existing users, incomplete setup, reloads, expired sessions and direct API access.
- Add the remaining supported business contact details, service area/categories and locale/time-zone fields only after confirming the data model and downstream workflow contracts; do not add unsupported fields only to satisfy a checklist.
- Verify save/resume and the full flow in a browser before `DONE_VERIFIED`.
### P0-TUTORIAL — Optional product tour

Status: `IN_PROGRESS`

Evidence: PR #127 adds the skippable product-tour component and is merged. Browser-level keyboard/accessibility checks and proof of persistent per-user tour state remain unverified.

Acceptance criteria:
- Keep tutorial separate from mandatory onboarding; allow skip, dismiss, resume and restart.
- Persist per-user tutorial state and support keyboard access.
- Verify responsive layouts and behavior when a target control is unavailable.

### P0-PDF-UX — PDF preview, responsive UI and UX defects

Status: `IN_PROGRESS`

Evidence: PRs #92 and #96 cover PDF blob validation and preview keyboard focus; PR #126 stabilizes the responsive preview layout, and PR #128 adds company branding to reports. Current `main` CI run `41328081643` passed on `ccd83c4699e490d8072851017f5c68504e840082`. Browser/screen-reader behavior, print-iframe failure cleanup, and end-to-end PDF preview/branding behavior remain unverified.

Acceptance criteria:
- Reproduce reported preview failures and trace generation, response headers/body, browser preview, object URL lifecycle and error states.
- Fix confirmed root causes with regression tests for success, malformed/failed responses, loading, close/reopen and cleanup.
- Audit high-impact phone/desktop usability issues; verify responsive layouts, focus, overflow and accessible errors.
- Measure claimed performance improvements; avoid speculative refactors.

## Deferred work and release rules

- P0.9 backup/restore: `NOT_STARTED` — explicitly skipped by the user until reauthorized. Do not implement or execute backup/restore operations before explicit reauthorization.
- Supabase RLS: `BLOCKED` — explicitly deferred until the user explicitly reopens it.
- One checkpoint per PR unless an inseparable dependency is documented.
- Never push directly to `main`, merge autonomously, deploy autonomously or bypass CI/review.
- Before each PR, verify `main`, open PRs, dependencies, CI and exact diff.
- Report commits, PR URL, tests actually executed, observed results, untested cases and live checks separately.
