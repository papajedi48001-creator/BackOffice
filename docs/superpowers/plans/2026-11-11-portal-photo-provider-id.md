# Plan: รูปโปรไฟล์ portal หา link ด้วย Provider ID

Spec: `docs/superpowers/specs/2026-11-11-portal-photo-provider-id-design.md`. Branch stacked on PR #87.

- [ ] Task 1 (core): `verifyPortalRequest` returns `{ memberId, provider }`.
  Files: `packages/core/src/identity/oidc-client.ts`, `oidc-client.test.ts`.
  Failing test: a request with `provider_iss`/`provider_sub` resolves to `{ memberId: 'member-1', provider: {...} }`; one claim alone, a non-string or an over-long value is INVALID.
  Verify: `pnpm --filter @backoffice/core exec vitest run src/identity/oidc-client.test.ts`
- [ ] Task 2 (web): route looks up the Provider ID link first, then the portal link; `portalSsoConfig()` needs only issuer and client id.
  Files: `apps/web/src/app/api/portal/photo/route.ts`, `route.test.ts`, `apps/web/src/lib/provider-sso.ts`, `provider-sso.test.ts`.
  Failing tests: link found under `https://provider.id.th`/`acc-1`; issuer from another environment ignored; fallback to the portal link; config without a secret is enough.
  Verify: `pnpm --filter @backoffice/web exec vitest run src/app/api/portal/photo src/lib/provider-sso.test.ts`
- [ ] Task 3 (infra/docs): `docker-compose.portal-photo.yml`, compose-config test, env examples, runbook.
  Failing test: `bash infra/compose/compose-config.test.sh` asserts the override passes `PROVIDER_SSO_ISSUER`, the client id, the host pin and no secret.
  Verify: `bash infra/compose/compose-config.test.sh`
- [ ] Final: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`.
