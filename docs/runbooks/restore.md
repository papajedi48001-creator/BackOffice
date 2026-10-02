# Restore procedure

Restore is performed only into the isolated staging project unless incident command and the Data Owner authorize production recovery.

1. Select an encrypted archive and matching metadata record; verify the recorded SHA-256.
2. Prepare `/etc/backoffice/staging-restore.env` with a distinct `STAGING_COMPOSE_PROJECT_NAME`, staging secret files, and no production volume names.
3. Run `BACKUP_FILE=/protected/path/archive.tar.gpg infra/backup/restore-verify.sh`.
4. Confirm the script reports a numeric `foundation_person` count, attachment extraction completes, and staging services remain isolated.
5. Record date/time, operator, archive hash, result, discrepancies, and Data Owner acknowledgement. Destroy the temporary staging project after evidence is retained.

Do not restore a backup directly to production merely to test it. The daily backup objective is RPO not greater than 24 hours; run additional approved backups during the day if attendance or inventory requires a stricter objective.
