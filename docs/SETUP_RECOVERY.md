# Setup wizard recovery

## Fix for Better Auth's `accountId` schema error

The Drizzle schema now exposes Better Auth's expected account/session/verification property names while mapping existing legacy SQL column names where possible. Apply the schema update after taking a database backup:

```bash
npm run db:push
```

Review the Drizzle Kit plan carefully before accepting any destructive operation. Restart the dev server after applying changes:

```bash
npm run dev
```

## Recovering from a failed setup attempt

The setup flow now verifies the password if the owner email already exists, so it can resume a partially completed setup without blindly promoting an unrelated account. Enter the same owner email and its correct password to continue. If you don't control that account, use a different email.

The setup endpoint returns the actionable error message instead of hiding every failure behind a generic 500. Check the terminal for `[setup launch]` when a database or authentication issue persists.

## Logo upload

The wizard accepts PNG, JPEG, WebP, and GIF files up to 2 MB. Uploads are signature-checked and saved under `static/uploads/branding`, then stored as a relative URL. This filesystem approach is intended for self-hosted deployments with persistent writable storage. For multi-instance or ephemeral deployments, configure the production media upload to use the existing Backblaze B2 storage utilities instead.

## Important

Do not wipe the user tables to retry setup unless you intentionally want to delete accounts. The setup wizard supports resuming an existing owner account by verifying its password.
