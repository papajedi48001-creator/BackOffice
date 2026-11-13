# Plan: portal photo contract

Spec: `docs/superpowers/specs/2026-11-13-portal-photo-contract-design.md`

## Task 1: JWKS at `/.well-known/jwks.json` with fallback (packages/core/src/identity/oidc-client.ts)

- [x] Failing test: `verifyPortalRequest` fetches `<issuer>/.well-known/jwks.json`; falls back to `/oidc/jwks` when it 404s; per-request timeout option
- [x] Implement `jwksUrls` + `timeoutMs` config
- [x] `pnpm --filter @backoffice/core test -- oidc-client`

## Task 2: default audience `backoffice` (apps/web/src/lib/provider-sso.ts)

- [x] Failing test in `provider-sso.test.ts`: issuer alone gives `clientId: 'backoffice'`; portal client uses a short timeout
- [x] Implement
- [x] `pnpm --filter @backoffice/web test -- provider-sso`

## Task 3: route guards — ≤2 MB, image types, 2.5 s deadline (apps/web/src/app/api/portal/photo/route.ts)

- [x] Failing tests in `route.test.ts`
- [x] Implement
- [x] `pnpm --filter @backoffice/web test -- portal/photo`

## Task 4: contract test (apps/web/src/app/api/portal/photo/route.contract.test.ts)

- [x] Real ES256 keys, real `PortalOidcClient`, stubbed `fetch` for JWKS, every clause of the contract
- [x] `pnpm --filter @backoffice/web test -- portal/photo`

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
git diff --check
```
