# Deploy and rollback

## Preconditions

- Data Owner has approved the release and maintenance window.
- A successful encrypted backup is less than 24 hours old.
- The release images have been scanned and use the approved immutable release tag.
- `/etc/backoffice/production.env` and every referenced secret file are owned by the operator, mode `0600`, and are outside Git. The database URL is not one of them by default: the first-run setup page saves it in the `backoffice-config` volume (see "First-run setup").
- The SeaweedFS S3 keys and identities file exist as described in "Attachment storage and virus scanning" below, mode `0600`; never put the keys in an environment file, image, log, or Git.
- The Caddy internal CA is trusted on managed client devices, or the Caddy TLS policy has been replaced by an approved certificate policy.

## Deploy to staging

1. Copy `infra/compose/.env.staging.example` to an operator-controlled staging environment file and fill every placeholder.
2. Validate without starting services: `docker compose --env-file /etc/backoffice/staging.env -f infra/compose/docker-compose.staging.yml config`.
3. Start the tagged release: `docker compose --env-file /etc/backoffice/staging.env -f infra/compose/docker-compose.staging.yml up -d`.
4. Run migrations with the web release image, then confirm `/api/health`, local login, a scoped authorization denial, and the audit path.
5. For the notification release, confirm migration `0001_in_app_notifications.sql` is recorded, the worker is running without notification-consumer errors, and only `notification.in_app` rows are selected by the worker.
6. For the outbox retry release, confirm migration `0002_outbox_retry.sql` is recorded. A failing event no longer restarts the worker: it logs `backoffice.worker.outbox_event_failed` with the event ID, type, and an error code, retries with backoff, and is dead-lettered after five attempts. Review dead letters with `SELECT id, type, attempts, last_error, dead_lettered_at FROM outbox_event WHERE dead_lettered_at IS NOT NULL`; fix the cause before clearing `dead_lettered_at`, `next_attempt_at`, and `attempts` for an approved retry, and never mark such an event processed by hand.
7. For the HR master-data release, create two separate 32-byte hex keys (`openssl rand -hex 32`) as `/etc/backoffice/secrets/national_id_encryption_key` and `/etc/backoffice/secrets/national_id_lookup_key`, mode `0600`, and back them up with the database backup key. Losing the encryption key makes stored national IDs unreadable; changing the lookup key breaks matching on re-import. Confirm migration `0004_hr_master_data.sql` is recorded, then have HR check a CSV at `/hr/imports` before importing it.
8. Run the notification UAT scenarios using new requests created after this release. Do not replay or mark processed historical `workflow.*` rows.
9. Check container health, Caddy logs, disk space, backup freshness, queue backlog, and connector error rate through the organization monitoring system.

### Attachment storage and virus scanning

ไฟล์แนบส่วนตัว (ใบรับรองแพทย์, หนังสือเชิญ) are kept in SeaweedFS (Apache 2.0) on the
internal backplane; MariaDB holds only their details. Every upload is scanned by ClamAV
before it is stored, and the web app refuses uploads while the scanner is unreachable.
Downloads always pass through the web app, which checks access on each request.

1. Mirror `chrislusf/seaweedfs` and `clamav/clamav` into the approved registry and set
   `SEAWEEDFS_IMAGE` and `CLAMAV_IMAGE` to their immutable digests.
2. Create the S3 keys and the SeaweedFS identities file that holds the same keys:

   ```bash
   umask 077
   openssl rand -hex 16 > /etc/backoffice/secrets/s3_access_key_id
   openssl rand -hex 32 > /etc/backoffice/secrets/s3_secret_access_key
   printf '{"identities":[{"name":"backoffice","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Admin","Read","Write","List","Tagging"]}]}\n' \
     "$(cat /etc/backoffice/secrets/s3_access_key_id)" "$(cat /etc/backoffice/secrets/s3_secret_access_key)" \
     > /etc/backoffice/secrets/seaweedfs_s3.json
   ```

   The web app creates the `S3_BUCKET` bucket on first upload.
   SeaweedFS sits alone with the web app on the internal `storage` network, and its master,
   volume and filer ports listen on loopback inside the container; ClamAV shares the internal
   `scan` network with the web app only. In staging, set `BACKOFFICE_STORAGE_SUBNET`,
   `BACKOFFICE_SCAN_SUBNET` and `BACKOFFICE_UPDATES_SUBNET` to allocated ranges that do not
   overlap hospital networks, as for the backplane.
3. ClamAV joins the non-internal `updates` network so `freshclam` can download signatures
   over HTTPS. Allow outbound HTTPS to `database.clamav.net` from the server, or point
   `freshclam` at an approved local mirror. Give the host about 3 GB of free RAM for
   `clamd`; the first start can take several minutes while signatures load.
4. Confirm migration `0015_attachment_filename.sql` is recorded, that `seaweedfs` and
   `clamav` are healthy, then upload a small PDF on a ใบลา and open it from the detail page.
   A test file such as the EICAR string must be refused with "ไฟล์นี้ไม่ผ่านการตรวจไวรัส".
5. Backups include SeaweedFS `/data` as `attachments.tar`; see `infra/backup/README.md`.

### Staging behind an existing Nginx edge

Use this mode when staging shares a Linux VM with an existing Nginx service. It keeps the Back Office web container private on `127.0.0.1:3100`, leaves the current ports `80` and `443` owned by Nginx, and does not start Caddy.

The shared-Nginx override makes the Docker backplane non-internal so Docker can
NAT the localhost-published web port. This does not publish MariaDB, Redis,
SeaweedFS, or ClamAV; their Compose services have no host-port mappings.

1. Obtain an internal DNS record and an internal-CA certificate for the approved staging hostname. Do not reuse an unrelated production hostname.
2. Copy `infra/nginx/backoffice-staging.conf.template` to an operator-controlled Nginx include, replace `__BACKOFFICE_STAGING_HOSTNAME__`, and set the approved certificate paths.
3. Validate the Nginx configuration before reload: `sudo nginx -t`. Reload only after validation succeeds: `sudo systemctl reload nginx`.
4. Validate the Compose rendering without starting services:
   `docker compose --env-file /etc/backoffice/staging.env -f infra/compose/docker-compose.staging.yml -f infra/compose/docker-compose.staging-shared-nginx.yml config`.
5. Start staging with the same two Compose files. Confirm that `caddy` is absent, the web service listens only at `127.0.0.1:3100`, and HTTPS health checks pass through the approved hostname.

The staging Docker network must use an allocated CIDR that does not overlap
hospital clients or routes. Set `BACKOFFICE_BACKPLANE_SUBNET` in
`/etc/backoffice/staging.env`. Use `infra/scripts/staging-network.sh validate`
before starting services. If an older network uses a different subnet, run its
`reset-network` command; it stops only the staging Compose project and retains
named volumes.

### Temporary source build for staging

When the approved internal registry is not yet available, staging may build the
web and worker images from a source archive at a recorded Git commit. This is
only a temporary staging path: production still requires approved immutable
registry images.

1. Record the commit ID used to create the source archive and unpack it into an
   operator-controlled directory on the staging VM.
2. Set `WEB_IMAGE` and `WORKER_IMAGE` to local tags containing that commit ID.
3. Add `infra/compose/docker-compose.staging-build.yml` to the two shared-Nginx
   Compose files for `config`, `build`, and `up`.
4. Record the source commit and resulting local image IDs in the staging change
   record. Do not promote those local images directly to production.

#### Required release guard

When using the temporary source-build path, run the release guard from the
unpacked release directory. Do not build from `/opt/backoffice-staging/current`:
that path is a symlink and can still point to a prior release.

The following example uses a short commit ID as the release ID. It builds only
after the source directory and tags agree, checks the built image artifacts,
then verifies the `current` symlink after activation. The image variables are
set on the same Compose command so the build cannot silently reuse stale tags
from the operator environment file.

```bash
release_id=6523964
release_dir="/opt/backoffice-staging/releases/${release_id}"
web_image="waritch-backoffice/web:${release_id}"
worker_image="waritch-backoffice/worker:${release_id}"

cd "${release_dir}"

infra/scripts/staging-release-guard.sh prebuild \
  --release-id "${release_id}" \
  --release-dir "${release_dir}" \
  --web-image "${web_image}" \
  --worker-image "${worker_image}" \
  --required-source-file apps/web/src/app/api/notifications/route.ts

WEB_IMAGE="${web_image}" WORKER_IMAGE="${worker_image}" \
  docker compose --env-file /etc/backoffice/staging.env \
  -f infra/compose/docker-compose.staging.yml \
  -f infra/compose/docker-compose.staging-shared-nginx.yml \
  -f infra/compose/docker-compose.staging-build.yml \
  build web worker

infra/scripts/staging-release-guard.sh postbuild \
  --release-id "${release_id}" \
  --release-dir "${release_dir}" \
  --web-image "${web_image}" \
  --worker-image "${worker_image}" \
  --required-web-artifact /app/apps/web/.next/server/app/api/notifications/route.js \
  --required-worker-artifact /app/apps/worker/src/main.ts

sudo ln -sfn "${release_dir}" /opt/backoffice-staging/current

infra/scripts/staging-release-guard.sh active \
  --release-id "${release_id}" \
  --release-dir "${release_dir}" \
  --web-image "${web_image}" \
  --worker-image "${worker_image}" \
  --current-link /opt/backoffice-staging/current
```

Only after all three commands report `*_OK` may the operator run migrations
and recreate `web` and `worker`. A guard failure means stop: do not switch
services, and retain the prior release for rollback.

## First-run setup

A new production install has no database URL. Until one exists, the web app answers every page with the setup page `/setup`, every other API with `503 setup_required`, and `/api/health` with `{"status":"setup-required"}`; the worker logs `backoffice.worker.waiting_for_database_config` and waits.

1. Create every other secret first (session secret, both national ID keys, S3 keys). The setup page names any that are missing and refuses to save without them.
2. Prepare the database. Either run the SQL script for the server as `root` (it creates the `backoffice` database, an application user with `SELECT, INSERT, UPDATE, DELETE`, and every migration), or give the application user `CREATE, ALTER, INDEX, REFERENCES` as well so the setup page can migrate an empty database. Prefer an application user over `root`.
3. Start the stack. For MariaDB outside Compose (for example `192.168.1.254`), add the override so web and worker can reach it and the bundled `mariadb` does not start:
   `docker compose --env-file /etc/backoffice/production.env -f infra/compose/docker-compose.production.yml -f infra/compose/docker-compose.external-db.yml up -d`
   Allow the Docker host to reach the database port through the hospital firewall.
4. Read the one-time setup code: `docker compose ... logs web | grep backoffice.setup.code`. Five wrong tries replace it with a new line in the log; a restart issues a new one.
5. Open `https://<PUBLIC_HOSTNAME>/setup`, type the code and the database details, press **ทดสอบการเชื่อมต่อ**, then fill the first **ผู้ดูแลระบบ** and press **บันทึกและสร้างบัญชี**. The page migrates if needed, creates the account with the `admin` role in one transaction (audit `system.setup.completed`), saves the URL to `/var/lib/backoffice/config/database_url` (mode `0600`), and closes for good. The worker starts within ten seconds.
6. Sign in as that ผู้ดูแลระบบ and grant other roles from `/admin/grants`.

The setup page refuses a database that already has accounts. To point a new web container at an existing database, or to change the database password later, write the URL into the volume yourself and restart web and worker:
`printf '%s\n' 'mysql://user:pass@host:3306/backoffice' | docker compose ... exec -T web sh -c 'umask 077; cat > /var/lib/backoffice/config/database_url'`
Operators who prefer an operator-managed secret file add `-f infra/compose/docker-compose.database-url-secret.yml` and set `DATABASE_URL_FILE` in the environment file, as before; the setup page then never opens. Existing installs that already use `DATABASE_URL_FILE` must add that override before upgrading, or they will start in setup mode. Staging keeps the secret file.

## Deploy to production

1. Repeat the staging checks with the identical immutable image tags.
2. Run `infra/backup/backup.sh` and retain its metadata record.
3. Start production with `docker compose --env-file /etc/backoffice/production.env -f infra/compose/docker-compose.production.yml up -d`.
4. Run the migration and health checks; do not expose data-service ports to troubleshoot.
   After migrating, run `infra/attendance/append-only-guards.sql` as the database admin (the application account has no `TRIGGER` privilege), for example `mariadb -h <database host> -u root -p backoffice < infra/attendance/append-only-guards.sql` from a machine that has the repository. It is safe to run on every release and makes the ระบบลงเวลา hash chain refuse `UPDATE` and `DELETE`.
5. Record release tag, migration, health result, and approving Data Owner in the change record.
6. Releases that change the notification payload or the read response (for example `0005_room_booking.sql`, which adds `notification.target_path` and makes the read route return `{href}`) must run the migration first and then switch `WEB_IMAGE` and `WORKER_IMAGE` together. An older worker dead-letters room notifications it cannot parse, and an older browser bundle cannot follow `{href}`; ask users to reload after the release.

## Rollback

1. Stop at the first failed health or smoke check; retain logs and do not delete volumes.
2. Return only `WEB_IMAGE` and `WORKER_IMAGE` to the prior approved tag in the protected environment file.
3. Run `docker compose ... up -d` with that prior tag and re-check health.
4. Database rollback requires an approved migration-specific procedure. If data integrity is in doubt, restore only into staging first and escalate to the Data Owner.
5. The notification migration is additive. Rolling back the web and worker images does not remove notification records or mark historical workflow rows processed; do not drop notification columns or tables during a rollback.
