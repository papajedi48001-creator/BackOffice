# R0 go-live checklist

All entries require named owner, date, and evidence reference before production approval.

- [ ] HR master-data sign-off completed.
- [ ] UAT scenarios completed by the applicable Data Owners.
- [ ] Pilot users trained and fallback procedure communicated.
- [ ] Deploy, restore, connector failure, secret rotation, and backfill runbooks reviewed.
- [ ] Encrypted backup restore drill completed in isolated staging.
- [ ] Monitoring health, disk, backup freshness, queue backlog, connector error, and alert routing tested.
- [ ] KPI baseline recorded.
- [ ] Data Owner and production approver authorize the release.

CI and image builds do not constitute production approval.
