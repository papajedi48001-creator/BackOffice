# Provider ID auto-link by national ID Implementation Plan

**Goal:** link a first Provider ID sign-in to the บุคลากร whose national ID matches `hash_cid`; otherwise send the person to the ผู้ดูแลระบบ.
**Spec:** `docs/superpowers/specs/2026-11-11-provider-id-auto-link-design.md`

## Global Constraints

- `hash_cid` and national IDs never reach a log, audit metadata, cookie, URL or the database.
- Only an exact single match among ACTIVE people links; anything else is รอผูกบัญชี.

## Task 1: `ProviderIdClient.complete` returns `{ identity, hashCid }` (packages/core)

- [x] Failing test: `hashCid` is the lower-cased 64-hex value, null when missing or malformed; `identity` keys stay issuer/subject/displayName.
- [x] Implement; `pnpm --filter @backoffice/core test -- provider-id-client` green.

## Task 2: match and auto-link (packages/core)

**Produces:** `NationalIdHashMatcher(database, protector).findActivePerson(hashCid): Promise<string | null>`;
`ExternalLoginDependencies.findPersonByNationalIdHash?`; `resolve(identity, { hashCid })`.

- [x] Failing tests: one match links with `method: 'national_id'` and returns linked; no match, two matches, an inactive person or a person already linked go to pending; `linkWithPassword` is gone.
- [x] Implement; `pnpm --filter @backoffice/core test -- external-login national-id-hash` green.

## Task 3: web

**Files:** `apps/web/src/lib/provider-sso.ts`, callback route (+test), `/link-provider` page (+test), remove `link-provider-form*` and `api/auth/provider/link`, `apps/web/e2e/provider-sso.spec.ts`, runbook.

- [ ] Failing tests: callback passes `hashCid` to resolve; `/link-provider` shows the contact-admin message and no password field.
- [ ] Implement; `pnpm --filter @backoffice/web test` green.

## Verification

`pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`.
