# Connector failure

For future time-attendance and other connectors, alert only on actionable connector failures. Never include national ID, credentials, tokens, or attachment contents in an alert.

1. Identify the connector, source, error rate, last successful import, and affected time window from monitoring and audit records.
2. Pause retries only when they could duplicate or corrupt source data; preserve the error queue and idempotency keys.
3. Notify the Data Owner and source-system owner with a non-sensitive incident reference.
4. Use the controlled paper/Excel fallback only for critical work. The business owner records the reason, period, and source evidence.
5. When service returns, import/backfill through the approved connector, reconcile counts, and create an audit-trail entry for each retrospective record.
6. Close only after the owner confirms reconciliation and the error/queue metrics recover.
