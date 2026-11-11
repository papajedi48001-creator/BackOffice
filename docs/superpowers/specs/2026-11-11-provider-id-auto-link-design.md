# ผูกบัญชี Provider ID กับเลขบัตรบุคลากรอัตโนมัติ

Status: asked for in the project thread on 2026-11-11 ("ให้ mapping กับเลขบัตรบุคลากรเลยอัตโนมัติ ถ้าหาไม่เจอให้ประสาน admin").
Builds on `2026-11-10-provider-id-direct-design.md`.

## Behaviour

1. The Provider ID profile carries `hash_cid`. `ProviderIdClient.complete` now returns `{ identity, hashCid }`; `hashCid` is the lower-case
   64-hex value or null when it is missing or malformed. It stays in memory for this one request: never stored, logged, audited or put in a cookie.
2. A sign-in with no link yet, and a `hashCid`, looks for the บุคลากร whose national ID gives that hash. BackOffice decrypts the national ID of every
   ACTIVE person and compares `sha256(nationalId)` (hex) in constant time. The ministry does not document how `hash_cid` is made (radius-server ADR 0002);
   SHA-256 of the 13 digits is assumed. A wrong guess only means nobody is matched, never the wrong person, so the fallback below is safe.
3. Exactly one match whose person has no Provider ID link yet: link it (`linkedByPersonId` null, audit `identity.provider_link` with
   `metadata: { method: 'national_id' }`), audit the login and sign straight in.
4. No match, more than one, a person already linked to another account, no national-ID keys configured, or no `hash_cid`: the login goes to
   รอผูกบัญชี as today and `/link-provider` tells the person to contact the ผู้ดูแลระบบ, who links it at ผู้ดูแลระบบ > บัญชี Provider ID.
   The username-and-password self-link form, its API route and `linkWithPassword` are removed.

## Not changed

Existing links, the admin page, unlink, the audit actions and the flow cookie.
