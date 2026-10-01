# Deploy and rollback

## Preconditions

- Data Owner has approved the release and maintenance window.
- A successful encrypted backup is less than 24 hours old.
- The release images have been scanned and use the approved immutable release tag.
- `/etc/backoffice/production.env` and every referenced secret file are owned by the operator, mode `0600`, and are outside Git.
- The approved MinIO AIStor license is stored as `/etc/backoffice/secrets/minio_license`, mode `0600`; never put its contents in an environment file, image, log, or Git.
- The Caddy internal CA is trusted on managed client devices, or the Caddy TLS policy has been replaced by an approved certificate policy.

## Deploy to staging

1. Copy `infra/compose/.env.staging.example` to an operator-controlled staging environment file and fill every placeholder.
2. Validate without starting services: `docker compose --env-file /etc/backoffice/staging.env -f infra/compose/docker-compose.staging.yml config`.
3. Start the tagged release: `docker compose --env-file /etc/backoffice/staging.env -f infra/compose/docker-compose.staging.yml up -d`.
4. Run migrations with the web release image, then confirm `/api/health`, local login, a scoped authorization denial, and the audit path.
5. Check container health, Caddy logs, disk space, backup freshness, queue backlog, and connector error rate through the organization monitoring system.

### Staging behind an existing Nginx edge

Use this mode when staging shares a Linux VM with an existing Nginx service. It keeps the Back Office web container private on `127.0.0.1:3100`, leaves the current ports `80` and `443` owned by Nginx, and does not start Caddy.

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

## Deploy to production

1. Repeat the staging checks with the identical immutable image tags.
2. Run `infra/backup/backup.sh` and retain its metadata record.
3. Start production with `docker compose --env-file /etc/backoffice/production.env -f infra/compose/docker-compose.production.yml up -d`.
4. Run the migration and health checks; do not expose data-service ports to troubleshoot.
5. Record release tag, migration, health result, and approving Data Owner in the change record.

## Rollback

1. Stop at the first failed health or smoke check; retain logs and do not delete volumes.
2. Return only `WEB_IMAGE` and `WORKER_IMAGE` to the prior approved tag in the protected environment file.
3. Run `docker compose ... up -d` with that prior tag and re-check health.
4. Database rollback requires an approved migration-specific procedure. If data integrity is in doubt, restore only into staging first and escalate to the Data Owner.
