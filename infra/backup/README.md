# Backup and restore operations

`backup.sh` creates a daily encrypted archive containing a consistent MariaDB dump and the private object-storage data. It writes a non-sensitive JSON completion record beside the archive. The operator supplies secret file paths and the retention duration from an approved operational policy; neither values nor keys belong in Git.

Required host tools are Docker Compose, GNU tar, GnuPG, and SHA-256 tooling. Run from a protected operator account:

```bash
set -a
. /etc/backoffice/production.env
set +a
infra/backup/backup.sh
```

Run a restore drill on a staging host/project only. The restore script decrypts the archive, restores MariaDB and attachment objects into a separate Compose project, and checks that `foundation_person` is queryable:

```bash
set -a
. /etc/backoffice/staging-restore.env
set +a
BACKUP_FILE=/var/backups/waritch-backoffice/backoffice-YYYYMMDDTHHMMSSZ.tar.gpg \
infra/backup/restore-verify.sh
```

`--check` verifies local command prerequisites only; it is not a restore drill. Record the archive name, SHA-256, operator, time, and result in the restore evidence record after every real drill.
