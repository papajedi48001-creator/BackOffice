# Controlled backfill

Use backfill after an approved fallback period; do not treat a spreadsheet as an offline replica.

1. Data Owner approves the module, date range, source, operator, and reason.
2. Validate columns, identifiers, duplicate/idempotency keys, and sensitive-data masking before import.
3. Import into staging first, reconcile row counts and exceptions, then obtain owner approval for production.
4. Import production using the approved tool/connector with audit metadata containing the approval reference and reason only.
5. Reconcile source and destination counts, retain the controlled source evidence according to its policy, and record completion.
