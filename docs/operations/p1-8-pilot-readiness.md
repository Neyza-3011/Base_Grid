# P1.8 — Pilot readiness checklist

## Purpose and release decision

Use this checklist before inviting the first real company to use BaseGrid. It is an operational gate, not proof that the live environment is configured correctly. Repository configuration, passing CI, and a successful health check do not by themselves establish production readiness.

**Current checkpoint status: `IN_PROGRESS`.** The checklist has been added; live provider settings, recovery evidence, and a controlled pilot have not been verified by this document.

Allowed checkpoint statuses: `DONE_VERIFIED`, `IN_PROGRESS`, `BLOCKED`, `NOT_STARTED`, `UNVERIFIED`.

Record evidence and the date for each item. Never record secrets, credentials, full connection strings, personal data, or real customer documents in this file or in CI logs.

## 1. Repository and release candidate

- [ ] Record the exact approved commit SHA and the PR that introduced it.
- [ ] Confirm the required CI run for that commit completed successfully: lint, backend and frontend type-checks, tests, and build.
- [ ] Review open PRs and known issues that could affect authentication, tenant isolation, data integrity, reports/PDFs, or deployment.
- [ ] Confirm the deployed build can be traced to the approved commit using trustworthy deployment evidence.
- [ ] Record rollback owner, decision authority, and the steps to stop pilot access if a critical issue appears.

Evidence to record: commit SHA, PR URL, CI run URL, deployment/version evidence, reviewer, date.

## 2. Runtime and external dependencies

The repository's `render.yaml` declares a Render web service, `/health` as its health check, and `autoDeploy: false`. These are repository declarations only; they do not prove the current provider configuration.

- [ ] Verify the actual Render service, deployed commit, runtime version, build command, start command, and health-check path in the provider dashboard.
- [ ] Verify the actual frontend URL and backend URL; confirm the browser calls the intended backend over HTTPS.
- [ ] Verify production CORS origins, cookie flags/domain/same-site behavior, and HTTPS using the real deployed application.
- [ ] Verify required environment variables are present without copying their values into logs or documentation.
- [ ] Verify PostgreSQL connectivity, TLS certificate validation, pool settings, and bounded timeouts.
- [ ] Verify Redis connectivity and token/session behavior when Redis is unavailable.
- [ ] Verify `/health` and `/ready` separately, including expected failure behavior when essential dependencies are unavailable. Do not treat a health response alone as proof of application correctness.
- [ ] Verify startup fails safely when required production configuration or essential dependencies are missing; no volatile in-memory fallback may serve production data.
- [ ] Verify shutdown and restart behavior without exposing secrets or corrupting in-flight operations.

Status for live Render, frontend hosting, PostgreSQL, and Redis configuration: `UNVERIFIED` until checked directly. Do not change provider settings as part of this checklist.

## 3. Security and tenant isolation

- [ ] Exercise the supported roles against representative read and write operations.
- [ ] Verify `companyId` is derived server-side from the authenticated identity, not trusted from request payloads or query parameters.
- [ ] Verify cross-tenant attempts to access customers, locations, assets, interventions, reports, members, and invitations are denied unless explicitly authorized.
- [ ] Verify unauthorized status transitions and administrative operations are rejected.
- [ ] Verify CSRF protections on state-changing requests, CORS allow-list behavior, session expiration/revocation, and rate limits on sensitive endpoints.
- [ ] Verify error responses do not reveal stack traces, SQL, tokens, secrets, or unnecessary personal data.
- [ ] Record test names/results or reproducible sanitized evidence for positive and negative cases.

Do not invite a real company while a critical/high security issue is open or tenant isolation remains unverified.

## 4. Core workflow and data integrity

- [ ] Using synthetic pilot data, complete the workflow: company/team, customer, location, asset (when applicable), intervention, technician assignment, field entries, report, PDF, and completion/readiness score.
- [ ] Verify saved data survives a fresh read and a service restart; do not infer persistence from an in-memory test adapter.
- [ ] Verify missing required data, invalid input, expired session, network interruption, failed save, and unavailable dependencies produce safe, understandable outcomes.
- [ ] Verify the PDF opens as a real PDF and contains the persisted values expected for the intervention, customer, location, technician, hours, materials, notes, signature, and dates where applicable.
- [ ] Verify unauthorized report/PDF access is rejected across tenants.
- [ ] Verify repeated or concurrent requests do not create inconsistent or duplicate critical records.
- [ ] Verify known limitations are documented and acceptable for the specific pilot scope.

CI tests provide evidence only for the assertions they actually cover; they do not replace the above checks against the candidate application.

## 5. Logs, support, and incident handling

- [ ] Confirm errors can be correlated using request/correlation identifiers and timestamps.
- [ ] Confirm logs exclude passwords, access/refresh tokens, session secrets, connection strings, private keys, and unnecessary customer data.
- [ ] Confirm someone can inspect application and provider logs during the pilot and knows how to escalate a critical incident.
- [ ] Document how to disable pilot access, stop further writes where appropriate, preserve relevant logs, and communicate an incident.
- [ ] Record known issues, workarounds, impact, and owner; do not describe an unverified workaround as tested.

## 6. Backup and recovery evidence

This section records evidence required for pilot readiness; it does not execute backup or restore operations and does not override the separately controlled P0.9 gate.

- [ ] Identify the actual production database provider/project and verify backup/PITR configuration and retention directly.
- [ ] Verify a recoverable backup exists and record a sanitized backup identifier, timestamp, and checksum where applicable.
- [ ] Record evidence of a successful restore test into an isolated, non-production target, including the verification performed after restoration.
- [ ] Document application rollback and database migration compatibility/forward-recovery constraints.
- [ ] Confirm recovery procedures and responsibilities are understood by the operator.

Until verified directly, backup availability, restore success, and recovery time remain `UNVERIFIED`. Do not perform restore tests against production or expose production data in CI/artifacts.

## 7. Controlled pilot

- [ ] Define the pilot company, named users, supported roles, intended workflows, duration, support contact, and explicit success criteria.
- [ ] Start with synthetic data; use real company/customer data only after security, access control, privacy, retention, and recovery protections have been reviewed and accepted.
- [ ] Onboard one company and a small, explicitly approved set of users; do not open public registration or broaden access as a substitute for a controlled pilot.
- [ ] Capture feedback and defects without collecting unnecessary personal data or credentials.
- [ ] Review failures and workflow friction regularly; prioritize data-loss, cross-tenant, authentication, and report-integrity defects before usability enhancements.
- [ ] Decide explicitly whether to continue, pause, or end the pilot; record accepted limitations and responsible approver.

## 8. Final decision record

Complete this section only when evidence is available.

- Overall P1.8 status: `IN_PROGRESS`
- Release/pilot decision: `NOT DECIDED`
- Approved commit SHA:
- CI run URL:
- Deployment/version evidence:
- Security and tenant-isolation evidence:
- Backup/restore evidence:
- Known limitations accepted for this pilot:
- Open blockers and owners:
- Decision maker and date:

A pilot is **not ready** if critical/high security issues remain, tenant isolation is unverified, essential dependencies are failing open, core workflow data is not reliably persisted, or recovery expectations are unknown and unacceptable to the decision maker. Do not mark this checkpoint `DONE_VERIFIED` until the relevant checks have evidence and the controlled pilot has been evaluated.
