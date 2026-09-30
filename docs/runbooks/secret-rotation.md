# Secret rotation

Secrets are protected files, not Compose environment values, Git files, URLs, audit metadata, or notifications.

1. Obtain approval from the System Admin and relevant Data Owner; schedule a maintenance window for secrets that invalidate sessions or database access.
2. Create new secret files with mode `0600`, ownership limited to the operator, and update the protected environment file to point to them.
3. Restart staging first and confirm health, authentication, migration access, backup encryption, and object storage access.
4. Back up production, rotate production during the approved window, and restart only the affected services.
5. Confirm old credentials are revoked at the issuer, test monitoring, and record the rotation reference without logging secret material.
6. Preserve the old backup decryption key only according to the approved key-retention policy; destroy it only after all governed archives are no longer required.
