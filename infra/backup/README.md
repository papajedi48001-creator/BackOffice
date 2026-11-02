# Backup and restore operations

`backup.sh` creates a daily encrypted archive containing a consistent MariaDB dump, the private object-storage data, and the web app's config volume (`config.tar`, the database URL saved by the first-run setup page; it holds the database password, so it exists only inside the encrypted archive). It writes a non-sensitive JSON completion record beside the archive. The operator supplies secret file paths and the retention duration from an approved operational policy; neither values nor keys belong in Git.

Required host tools are Docker Compose, GNU tar, GnuPG, and SHA-256 tooling. Run from a protected operator account:

```bash
set -a
. /etc/backoffice/production.env
set +a
infra/backup/backup.sh
```

Run a restore drill on a staging host/project only. The restore script decrypts the archive, restores MariaDB and attachment objects into a separate Compose project, checks that every table in `required_tables` (including `person`, `request`, `audit_event`, and `outbox_event`) is queryable, and confirms that `schema_migration` records every migration version declared in `packages/db/src/migrate.ts`:

```bash
set -a
. /etc/backoffice/staging-restore.env
set +a
BACKUP_FILE=/var/backups/waritch-backoffice/backoffice-YYYYMMDDTHHMMSSZ.tar.gpg \
infra/backup/restore-verify.sh
```

`--check` verifies local command prerequisites only; it is not a restore drill. Record the archive name, SHA-256, operator, time, and result in the restore evidence record after every real drill.

When MariaDB runs outside Compose (`docker-compose.external-db.yml`), `backup.sh` cannot dump it: back the database up on its own host with the approved procedure, and keep the config volume with `docker compose ... exec -T web tar -C /var/lib/backoffice/config -cf - . | gpg --symmetric ...` under the same retention.
