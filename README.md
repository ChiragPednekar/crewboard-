# CrewBoard

A task, assessment and leaderboard portal for a video production crew.

- **Admins** plan each videographer's month of shoots, then review and score what comes back.
- **Videographers** deliver in the app, or in a Google Sheet that syncs both ways.
- **Monthly assessment** scores each person on points, completion, on-time delivery and the admin's judgement.
- **Home page** is a leaderboard showing the top performer and the best work of the month.

**Stack:** React 18 · Vite · TypeScript (strict) · Tailwind · shadcn/ui (Radix) · TanStack Query · react-hook-form + zod · Framer Motion · Recharts · Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions, pg_cron) · Vercel.

All seven phases of [PLAN.md](PLAN.md) are built. Google Sheets setup has its own guide: [SHEETS_SETUP.md](SHEETS_SETUP.md).

---

## Contents

1. [Run it locally](#run-it-locally)
2. [Demo accounts](#demo-accounts)
3. [Environment variables](#environment-variables)
4. [Database: migrations, seed, types](#database-migrations-seed-types)
5. [Scripts and tests](#scripts-and-tests)
6. [How it's put together](#how-its-put-together)
7. [Deploying to production](#deploying-to-production)
8. [Troubleshooting](#troubleshooting)

---

## Run it locally

You need Node 20+, Docker Desktop, the [Supabase CLI](https://supabase.com/docs/guides/cli) (2.100+), and optionally [Deno](https://deno.com) for type-checking the Edge Functions.

```bash
npm install
supabase start              # Postgres, Auth, Storage, Realtime, Edge Functions in Docker
supabase db reset           # runs every migration, then supabase/seed.sql
cp .env.example .env.local  # paste API_URL and ANON_KEY from `supabase status`
npm run dev                 # http://localhost:5173
```

### Useful local URLs

| What | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio (tables, SQL, storage) | http://127.0.0.1:54323 |
| Mailpit (catches invite and password-reset emails) | http://127.0.0.1:54324 |
| Mock Google Sheets (optional, see [SHEETS_SETUP.md](SHEETS_SETUP.md#testing-without-google)) | http://localhost:8787 |

### Edge Functions

`supabase start` serves everything in `supabase/functions/`:

| Function | Purpose |
|---|---|
| `admin-users` | Invites, resending invites, email changes, deactivating and reactivating accounts (needs the Auth admin API) |
| `link-meta` | Title and thumbnail for pasted links. Only fetches public addresses, re-checked after every redirect |
| `sheets` | Google Sheets sync: info, provision, sync. Called by the admin or by pg_cron |

If an edit to a function doesn't take effect, restart the runtime:

```bash
docker restart supabase_edge_runtime_crewboard
```

Changes to `supabase/config.toml` or `supabase/.env` need a full restart:

```bash
supabase stop && supabase start
```

---

## Demo accounts

These exist in the local seed only, and the seed must never be run in production. Every account uses the password at the top of [`supabase/seed.sql`](supabase/seed.sql).

| Email | Role | What's interesting |
|---|---|---|
| `admin@crewboard.test` | admin | Sees everything |
| `priya@crewboard.test` | videographer | Last month's top performer |
| `arjun@crewboard.test` | videographer | Made last month's Best Work |
| `rohan@crewboard.test` | videographer | Has a revision request and an overdue task |
| `sana@crewboard.test` | videographer | |
| `vikram@crewboard.test` | videographer | This month's plan is still a **draft**, so he sees nothing yet |

The seed works relative to today's date in India time:
- **Last month** is complete: reviewed, assessed, published, and Best Work picked.
- **This month** is in progress.

---

## Environment variables

| Variable | Where it lives | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` / Vercel | Supabase API URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` / Vercel | Public anon (publishable) key. Safe in the browser, because RLS protects the data |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Injected automatically by Supabase |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Edge Function secret (`supabase/.env` locally) | Google Sheets sync. See [SHEETS_SETUP.md](SHEETS_SETUP.md) |
| `SYNC_CRON_SECRET` | Edge Function secret **and** Vault (`sheets_sync_secret`) | Authenticates pg_cron's call to `sheets` |
| `GOOGLE_SHEETS_API_BASE` | Edge Function secret, optional | Points the sync at the local mock Google server |

**Never** put the service role key or any secret in a `VITE_` variable; anything with that prefix is shipped to the browser.

---

## Database: migrations, seed, types

Migrations in `supabase/migrations/` run in order:

| File | Contents |
|---|---|
| `…0100_schema.sql` | Tables, enums, constraints, indexes |
| `…0200_domain_logic.sql` | Status machine, month locks, punctuality, scoring, notifications, activity log, sheet outbox triggers |
| `…0300_rls.sql` | Grants and Row Level Security on every table |
| `…0400_rpc.sql` | Workflow functions (start, submit, review, cancel, publish, assess, feature) and the leaderboard functions |
| `…0500_storage.sql` | Storage buckets and their policies |
| `…0600_admin_ops.sql` | Plans, creating one task for several people, copying a month, client assignment, account status, audit |
| `…0700_crew_access.sql` | Lets videographers read the clients of their own published tasks |
| `…0100_sheets_sync.sql` | Sync run bookkeeping, task snapshots, pg_cron schedule |

```bash
npm run db:reset   # local: re-run every migration + seed (wipes local data)
npm run db:types   # regenerate src/lib/database.types.ts after changing SQL
supabase migration new <name>   # start a new migration
```

The seed (`supabase/seed.sql`) is local-only demo data. It creates its users directly in `auth.users` with a shared password.

---

## Scripts and tests

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run check` | Everything below except the database tests |
| `npm run typecheck` | `tsc -b` in strict mode |
| `npm run lint` | ESLint, including React Hooks and accessibility (jsx-a11y) rules |
| `npm test` | Vitest unit and component tests (127) |
| `npm run check:functions` | `deno check` on the Edge Functions |
| `npm run test:db` | pgTAP database tests (167), against the local stack |

**What's covered:**
- **Security (RLS):** a videographer can't read or change another's data, nothing in draft plans is visible to them, and no admin-only functions can be called (`01_rls_isolation`, `05_crew_access`, `06_sheets_sync`).
- **Workflow rules:** status transitions, submissions and versions, reviews and point limits, punctuality, publish/lock/unlock, featured work (`02_workflow`, `04_admin_ops`).
- **Scoring:** the same test cases (`supabase/tests/fixtures/scoring-cases.json`) run against both the SQL and the TypeScript scoring code, so the two copies can't drift apart.
- **Sheets sync:** all the rules, plus full sync cycles against in-memory fakes (`supabase/functions/_shared/*.test.ts`).
- **Other logic:** link parsing and its security checks, CSV escaping (including spreadsheet formula injection), India-time date helpers, form validation, error messages, and key components.

---

## How it's put together

```
src/
  app/            router, providers, theme, layouts (AppShell with sidebar / phone tab bar, AuthLayout)
  components/     shared UI: StatusChip, MonthPicker, LinkPreviewCard, VideoEmbed, CheckList, ConfirmDialog, …
  components/ui/  shadcn/ui primitives (themed)
  features/       one folder per area: api.ts (queries + mutations), pages, dialogs, schemas
    auth  home  dashboard  videographers  clients  plans  tasks  review  assessments
    crew  notifications  activity  settings  leaderboard  lookups  profile
  hooks/          month/tab URL state, useOnOpen
  lib/            supabase client + generated types, dates (India time), scoring, links, exports, errors
supabase/
  migrations/     schema → domain logic → RLS → RPCs → storage → later phases
  functions/      admin-users, link-meta, sheets, _shared (sync-core, sync-runner, google, auth, http)
  tests/          pgTAP tests + shared scoring fixtures
  seed.sql        local demo data
  templates/      invite and password-reset email templates
scripts/          mock Google Sheets server, scoring test generator
```

**Design principles:**
- **The database enforces the rules.** Every state change with a business rule goes through a Postgres function or trigger. That covers starting, submitting, reviewing, cancelling, publishing plans, computing, publishing and unlocking assessments, and picking featured work. The UI, the Google Sheet and the Edge Functions all use the same functions, so they can't disagree.
- **Row Level Security everywhere.** Videographers read only their own rows, and only from published plans. Data that crosses users (leaderboard, featured work, team stats) comes only from `SECURITY DEFINER` functions that return a fixed set of safe columns; admin remarks are never included.
- **Time:** stored in UTC and shown in India time (Asia/Kolkata). A task is on time if its **first** submission arrives before midnight India time at the end of its due date.
- **Scoring** is computed in SQL, which is authoritative. A TypeScript copy powers the live preview in the assessment editor, and both are tested against the same cases.
- **Accessibility:**
  - Every page was checked with axe-core (WCAG 2.1 AA and best practices) in dark and light mode, with no remaining violations: admin pages at desktop width, videographer pages at phone width.
  - ESLint's jsx-a11y rules guard against regressions.
  - Everything works with the keyboard, focus is visible, and animations respect "reduce motion".
  - Main controls are 40–44px tall and none are under 36px, well above the WCAG 2.2 AA minimum of 24px.

---

## Deploying to production

These steps go from a fresh Supabase project and Vercel account to a working app. Steps 1–5 take about 30 minutes, plus Google setup if you want sheets.

### 1. Supabase project

1. Create a project at <https://supabase.com/dashboard> and pick the **Mumbai (ap-south-1)** region, closest to the crew.
2. Link it and push the schema. Don't run the seed in production.

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```

3. **Database › Extensions:** confirm `pg_cron`, `pg_net` and `supabase_vault` are on. The migrations enable them, but some plans need them switched on once in the dashboard.

### 2. Auth settings (Dashboard › Authentication)

- **URL Configuration:** set the Site URL to `https://<your-domain>`, and add `https://<your-domain>/**` to the redirect URLs.
- **Sign In / Providers › Email:** keep email enabled and turn **off "Allow new users to sign up"**. Only admins invite people.
- **Emails › Templates:** paste `supabase/templates/invite.html` into *Invite user* and `recovery.html` into *Reset password*. Use the subjects from `supabase/config.toml`.
- **Emails › SMTP:** set up a real sender, for example [Resend](https://resend.com) or Amazon SES. Supabase's built-in sender only sends a few emails per hour, which isn't enough for invites.
- **Password policy:** minimum 8 characters.

### 3. Edge Functions

```bash
supabase functions deploy admin-users
supabase functions deploy link-meta
supabase functions deploy sheets          # verify_jwt=false comes from config.toml
# optional, for Google Sheets (see SHEETS_SETUP.md):
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
supabase secrets set SYNC_CRON_SECRET="$(openssl rand -hex 32)"
```

### 4. First admin account

Public sign-up is off, so create the first admin by hand:

1. **Authentication › Users › Add user › Send invite** (or *Create new user* with a password).
2. In the SQL editor, make them an admin:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@studio.com';
   ```

From then on, the admin invites videographers from **Videographers › Add videographer**.

### 5. Frontend on Vercel

1. Import the repository in Vercel. The framework preset is **Vite**, the build command is `npm run build`, and the output directory is `dist`.
2. Add these environment variables:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the project's anon or publishable key
3. Deploy, then point your domain at it.

`vercel.json` handles the rest:
- routing every path to the single-page app
- long-term caching of hashed assets
- security headers: a strict Content-Security-Policy, no framing, `nosniff`, HSTS and a Permissions-Policy

> The CSP allows API calls to `*.supabase.co`. If you put Supabase behind a **custom domain**, add it to `connect-src` (https and wss) in `vercel.json`. It also allows `'wasm-unsafe-eval'`, which the PDF export's layout engine needs; that permits WebAssembly only, not JavaScript `eval`.

### 6. Google Sheets (optional)

Follow [SHEETS_SETUP.md](SHEETS_SETUP.md). In short:
1. Create a service account and set the two secrets above.
2. Add the Vault entries for the 10-minute schedule.
3. Switch on automatic sync in **Settings › Google Sheets**.
4. Connect each videographer's sheet.

### 7. Smoke test after deploying

- [ ] Admin signs in. A videographer invite arrives, and the invite link lets them set a password.
- [ ] Publish a plan: the videographer gets a live notification and sees the tasks.
- [ ] The videographer submits a link, and it appears in the review queue with an inline player.
- [ ] Approve it; then on Assessments › Create drafts › publish, the score appears on the home page.
- [ ] PDF and Excel exports download.
- [ ] (Sheets) **Sync now** writes the rows, and a status change in the sheet comes back to the app.

### Backups and operations

- **Backups:** Supabase takes daily backups on paid plans. Point-in-time recovery is a paid add-on.
- **Logs:** Edge Function logs are under *Edge Functions › Logs*. The Google Sheets sync history is in **Settings › Google Sheets › Sync health**, and everything people do is on the **Activity** page.
- **Retention:** sync runs are kept for 30 days and processed sync queue entries for 7. Notifications and activity are kept indefinitely.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Please sign in again" right after `supabase db reset` | The reset wiped sessions; sign out and back in |
| Invite email never arrives (local) | Check Mailpit at http://127.0.0.1:54324 |
| Invite email never arrives (production) | Set up custom SMTP; the built-in sender is heavily rate-limited |
| A changed Edge Function still behaves the old way | `docker restart supabase_edge_runtime_crewboard` |
| Google sheet shows "Can't open the sheet (403)" | Share it with the service-account email as **Editor** |
| Scheduled sync never runs | Check that automatic sync is switched on in Settings, the Vault secrets `sheets_sync_url` and `sheets_sync_secret` exist, and `select * from net._http_response order by created desc limit 5` |
| "This assessment is locked" when reviewing | That month was published; unlock it (with a reason) on the assessment page first |
| Port 5173 already in use | `npm run dev -- --port 5174` |
