# Provider ID direct sign-in Implementation Plan

**Goal:** BackOffice signs in with MOPH ID + Provider ID itself instead of through the radius-server portal.
**Spec:** `docs/superpowers/specs/2026-11-10-provider-id-direct-design.md`

## Global Constraints

- Never put a code, token, secret, `hash_cid` or national ID in a URL BackOffice builds, a log, audit metadata or a cookie in clear text.
- Keep `ExternalLoginService`, the link page, the admin page and the audit actions unchanged.

## Task 1: `ProviderIdClient` (packages/core)

**Files:** create `packages/core/src/identity/provider-id-client.ts` and `.test.ts`; delete `oidc-client.ts` and its test; export from `packages/core/src/index.ts`.

**Produces:** `ProviderIdConfig { healthUrl, apiUrl, healthClientId, healthClientSecret, providerClientId, providerSecretKey, redirectUri }`,
`ProviderIdFlow { state }`, `ProviderIdError(code: 'UNAVAILABLE' | 'INVALID')`,
`new ProviderIdClient(config, fetchImpl?)` with `issuer: string`, `begin(): { flow, url }`, `complete(code): Promise<ExternalIdentity>`.

- [x] Failing tests: the authorize URL; the three requests with their bodies and headers and the `{ data }` wrapper; identity `{ issuer: apiUrl, subject, displayName }` without hash_cid; a 4xx → INVALID; a missing account_id → INVALID; a 5xx, a non-JSON answer or a network error → UNAVAILABLE.
- [x] Implement, `pnpm --filter @backoffice/core test -- provider-id-client` green.

## Task 2: web configuration and routes

**Files:** `apps/web/src/lib/provider-sso.ts` (+test), `apps/web/src/app/api/auth/provider/{start,callback}/route.ts` (+tests), `apps/web/src/app/page.test.tsx`, `packages/i18n/src/th.ts`, `apps/web/e2e/provider-sso.spec.ts`.

- [x] Failing tests: `providerSsoConfig()` is null until the five values are set, maps `prd`/`uat` to the base URLs, honours the overrides and refuses another environment; the flow cookie seals only `state`; start redirects to MOPH ID; callback maps `ProviderIdError` like before and resolves against `client.issuer`.
- [x] Implement; the e2e stub plays MOPH ID and Provider ID.
- [x] `pnpm --filter @backoffice/web test` green.

## Task 3: Docker override and runbook

**Files:** `infra/compose/docker-compose.provider-sso.yml`, `infra/compose/compose-config.test.sh`, `infra/compose/.env.*.example`, `infra/scripts/staging-network.sh`, `docs/runbooks/provider-sso.md`, `docs/runbooks/local-setup.md`.

- [x] Failing compose test: the new variables, both secrets file-only, web alone on a non-internal `egress` network with `BACKOFFICE_EGRESS_SUBNET`, no portal host pin.
- [x] Implement and update the runbook; `bash infra/compose/compose-config.test.sh` green.

## Verification

`pnpm lint && pnpm typecheck && pnpm test`, `bash infra/compose/compose-config.test.sh`, `git diff --check`.
