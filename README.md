# Milwaukee Garbage Alert

## Postgres setup and migration notes

1. In Render, set the `DATABASE_URL` environment variable for both web and worker services.
2. Run SQL migrations manually in your Postgres console, in order:
   - `migrations/001_create_users.sql`
   - `migrations/002_create_subscriptions.sql`
3. After migrations complete, deploy/restart both web and worker services.
