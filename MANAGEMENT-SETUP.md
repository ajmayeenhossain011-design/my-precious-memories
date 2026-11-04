# Secure Management Setup — MY PRECIOUS MEMORIES

This branch contains the management backend foundation. It is not live until the Supabase setup below is completed and the website UI is deployed.

## Safety
- Keep the existing Supabase project and private Storage bucket.
- Never put the Supabase service-role key in `index.html`, GitHub, or a chat.
- Do not delete or replace existing media.
- The migration removes direct authenticated Storage INSERT/UPDATE/DELETE policies so future changes must pass through the server-side function. Existing read access is intentionally retained.
- Take a Supabase database backup and export the current Storage policies before running the migration.

## 1. Deploy the Edge Function
In Supabase Dashboard, open Edge Functions and create a function named `memory-admin`. Deploy the contents of:
`supabase/functions/memory-admin/index.ts`

Ensure the function has these server-side secrets configured by Supabase:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must remain only in Supabase function secrets.

## 2. Review and run the SQL migration
Open SQL Editor and review, then run:
`supabase/migrations/202611050001_secure_memory_management.sql`

The migration creates the private Master Password credential table and text-memory table, and removes the named direct Storage write policies. Confirm the policy names match the current project before running. It does not delete Storage objects.

## 3. Master Password
After the UI is deployed, use Manage → Set Master Password. Choose a unique password of at least 10 characters. It is separate from the Supabase login password. Only a PBKDF2-SHA256 hash and random salt are stored.

## Important deployment note
The management UI must be deployed only after the Edge Function and SQL migration are ready. Until then, keep using the existing site and do not run destructive operations. The signed-upload endpoint returns a one-use upload token after server-side password verification.
