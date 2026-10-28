# P0 — Platform administration, demo data, onboarding and UX

## Governance

This document records the newly approved product requirements. It does not claim that any feature below is implemented or release-ready. Each implementation must be delivered in a separate, narrowly scoped pull request, with tests and direct evidence. Do not merge or deploy automatically.

Statuses allowed: `DONE_VERIFIED`, `IN_PROGRESS`, `BLOCKED`, `NOT_STARTED`, `UNVERIFIED`.

## Audit findings on the verified baseline

Baseline audited for this update: `main` at `e53d22f8e6726c8109807774f5dc3bdf6b704b11` (2026-10-28).

- `server/types.ts` defines a single `UserRole` union containing both `superadmin` and company roles such as `owner` and `admin`.
- Registration in `server/routes/auth.ts` creates the first user as `owner`.
- `ASSIGNABLE_ROLES` excludes `superadmin`, which is a useful existing safeguard.
- `server/middleware/auth.ts` authorizes global access by checking the persisted role string `superadmin`; authenticated users are also required to resolve a company through `user.companyId`.
- Company settings are scoped through the authenticated user's `companyId`. The code reviewed here does not establish a separate platform identity/role model or a CEO console.
- PR #82 is merged; its CI run passed lint, backend/frontend type-check, Vitest, and build.
- This remains a targeted source review, not an exhaustive endpoint audit.

## Ordered checkpoints

### P0-ROLE — Separate platform authority from company roles

Status: `IN_PROGRESS`

Acceptance criteria:
- Keep company roles (including the company's Admin) scoped to one company.
- Represent platform-level CEO authority separately from company administration; never accept a platform role from registration, invite payloads, profile updates, or ordinary team-management APIs.
- Provision the CEO identity only through a trusted server-side mechanism. Do not rely on frontend visibility, a user-editable email, or an unprotected database role.
- Preserve least privilege for company admins and prevent cross-company access by default.
- Cover positive and negative authorization paths with automated tests: registration/invitation cannot create a CEO; company admin cannot grant platform access; tenant A cannot administer tenant B; platform access is rejected when identity/configuration is invalid.
- Review session invalidation, auditability, migration/backfill safety, and existing `superadmin` compatibility before changing persisted roles.

Implementation note: inspect all route → middleware → service → adapter paths before choosing a migration. Do not rename/remove the existing `superadmin` role until all usages and existing records are accounted for. If a deployment environment variable is needed, document it for a separately authorized operator change; do not alter external provider settings.

### P0-CEO-CONSOLE — Platform-wide administration

Status: `IN_PROGRESS`

Evidence: PR #80 is merged and GitHub Actions CI passed for the trusted `platformRole` session field and frontend CEO gate. Existing `/api/v1/admin/stats` and `/api/v1/admin/tenants` are server-protected by `requireSuperAdmin` (an alias for `requirePlatformRole("ceo")`). The current console only reads statistics and tenant summaries; editing company settings, managing users/account lifecycle, persistent audit events, destructive-operation safeguards and session revocation remain unimplemented or unverified. The CEO identity is being pinned to `jack.cardinali15@gmail.com` through server-side config validation and a restrictive migration.

Acceptance criteria:
- CEO-only platform console lists and manages companies and account lifecycle across tenants.
- Every endpoint enforces platform authorization server-side; company Admin remains restricted to its own tenant.
- Sensitive operations (suspend/reactivate company or user, update platform settings, delete an account) validate permissions, prevent accidental destructive actions, record audit events, and revoke affected sessions where required.
- Account/company deletion has explicit dependency, retention, backup, and recovery behavior; no hidden cascade surprises.
- Tests cover unauthorized access, cross-tenant IDOR, destructive operations, and session revocation.

### P0-REMOVE-SANDBOX-CLONE — Remove general sandbox/clone access

Status: `IN_PROGRESS`

Evidence: the prior PR #82 added a frontend guard and removed the dashboard entry point. This PR deletes the sandbox route source and removes its generated route-tree references. A wider audit for other demo/clone references and automated direct-access tests remains outstanding.

Acceptance criteria:
- Locate all sandbox/demo/clone entry points in UI, routes, APIs, seeders, and configuration.
- Remove or disable user-facing global clone functionality unless a narrowly authorized internal demo flow is required.
- Ensure hidden UI is not treated as authorization: endpoints must also reject unauthorized calls.
- Tests prove ordinary users cannot clone data or create demo tenants through direct API requests.

### P0-DEMO-DATA — Synthetic data for the authorized demo account only

Status: `NOT_STARTED`

Acceptance criteria:
- Populate only the explicitly authorized account `jack.cardinali15@gmail.com` with realistic but wholly synthetic company/customer/location/asset/intervention/report data for demonstrations.
- Never copy real customer data, create demo content for other tenants, or grant CEO permissions as a side effect of seeding.
- Use an explicit, idempotent, opt-in seed operation that verifies the intended account/tenant server-side and fails closed on mismatch.
- Mark generated records as demo data where the schema permits; document cleanup and ensure generated data cannot be mistaken for real customer records.
- Add tests for idempotency and tenant isolation. Do not run the seeder against production until the target account/tenant and operation are explicitly verified.

### P0-ONBOARDING — Required first-run setup

Status: `NOT_STARTED`

Acceptance criteria:
- After account creation and successful authentication, require completion of a minimal company setup before entering normal product workflows.
- Make only explicitly designated nonessential setup steps skippable; persist progress server-side so refresh/relogin does not bypass required steps.
- Validate required fields server-side and provide accessible loading, validation, error, and recovery states.
- Cover new/existing users, incomplete setup, reloads, expired sessions, and direct API access.

### P0-TUTORIAL — Optional product tour

Status: `NOT_STARTED`

Acceptance criteria:
- Provide a tutorial separate from mandatory onboarding.
- Allow users to skip, dismiss, and resume/restart it without blocking normal workflows.
- Persist tutorial state per user and make controls keyboard-accessible.
- Verify responsive layouts and ensure the tour remains usable when a target control is unavailable.

### P0-PDF-UX — PDF preview, responsive UI and UX defects

Status: `NOT_STARTED`

Acceptance criteria:
- Reproduce each reported PDF preview failure before changing code; trace generation, response headers/body, browser preview component, object URL lifecycle, and error states.
- Fix only confirmed root causes and add regression tests for successful preview, malformed/failed responses, loading, close/reopen, and cleanup.
- Audit reported high-impact usability issues on phone and desktop; implement in small, independently reviewable fixes.
- Verify responsive behavior at representative mobile and desktop widths, keyboard/focus behavior, overflow, and accessible error states.
- Measure any claimed performance optimization and record the baseline/result; avoid speculative refactors.

## Release and implementation rules

- One checkpoint per PR, unless a small inseparable dependency is documented.
- Never push directly to `main`, merge autonomously, deploy autonomously, or bypass CI/review.
- Before every implementation PR, re-check `main`, open PRs, dependent merges, CI and the exact diff.
- Record the commit, PR URL, tests actually executed, results, untested cases and live checks separately.
- P0.9 backup/restore remains explicitly deferred until the user authorizes it. Supabase RLS remains deferred until the user explicitly authorizes it.
