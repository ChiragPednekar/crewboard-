# CrewBoard — Implementation Plan (for approval)

Status: **Approved and built** (all 7 phases, Oct 2026). The open questions in §9 were answered with the defaults shown in bold.

Environment checked: Node 24, Supabase CLI 2.109, and Docker are installed, so Phase 1 can run against a local Supabase stack (`supabase start`). Deploying to a hosted Supabase project and to Vercel comes later.

---

## 1. Architecture at a glance

```
React SPA (Vite, TS, Tailwind, shadcn/ui)  ──►  Supabase
  TanStack Query + supabase-js                   ├─ Postgres: tables, RLS, RPC functions, triggers
  Role-guarded routes                            ├─ Auth: email+password, invite, reset
                                                 ├─ Storage: avatars, client-logos, task-refs, thumbnails
                                                 ├─ Edge Functions: admin-users, sheets-sync, sheets-provision, link-meta
                                                 └─ pg_cron + pg_net: calls sheets-sync every 10 min
                                                                │
                                                     Google Sheets API (service account)
```

**Guiding rule: the database is the authority.** All state changes that carry business rules go through Postgres `SECURITY DEFINER` RPC functions. These include status transitions, submissions, reviews, assessment publish and lock, and featured picks. Each RPC checks the caller's role and the allowed transition, writes activity_log and notifications, and runs as one transaction. The UI only calls the RPCs, and RLS blocks direct writes that would bypass them. A Sheet edit and an in-app edit therefore follow the same code path.

---

## 2. Database schema

Conventions:
- `uuid` primary keys, all timestamps `timestamptz` in UTC, and `updated_at` triggers on every mutable table.
- Months are stored as a `date` pinned to the 1st of the month, with `CHECK (extract(day from month) = 1)`. They display as `YYYY-MM`.
- `due_date` is a `date` read as the end of that day in Asia/Kolkata (23:59:59 IST).

### Enums
`user_role` (admin, videographer) · `plan_status` (draft, published) · `task_status` (assigned, in_progress, submitted, revision_requested, approved, cancelled) · `task_priority` (low, normal, high, urgent) · `submission_source` (app, sheet) · `assessment_status` (draft, published) · `reference_kind` (link, file, note) · `sheet_mode` (own_sheet, master_tab) · `sync_event_kind` (updated, submission_created, unknown_id, missing_id, conflict_approved, conflict_lww, permission_denied, bad_link, invalid_status, error)

> I added `cancelled` so the Admin can drop a task without deleting its history. Cancelled tasks are excluded from every metric.

### Tables

| Table | Key columns (beyond id/created_at/updated_at) | Notes |
|---|---|---|
| **profiles** | id → auth.users, full_name, email, phone, avatar_url, role, base_location, is_active, deactivated_at | Created by the `admin-users` Edge Function. Deactivating also bans the auth user so they cannot log in. |
| **clients** | name, type, address, city, contact_name, contact_phone, contact_email, logo_url, notes, is_active | |
| **videographer_clients** | videographer_id, client_id, assigned_at | PK (videographer_id, client_id) |
| **task_categories** | name (unique), default_max_points, sort_order, is_active | Admin-editable. Seeded with: Surgery video, Testimonial, Reel, Event coverage, Photo shoot, Other. |
| **monthly_plans** | videographer_id, month, summary, goals, status, created_by, published_at | UNIQUE (videographer_id, month) |
| **tasks** | plan_id, videographer_id, client_id, category_id, title, brief, priority, due_date, max_points, status, first_submitted_at, approved_at, status_changed_at, status_changed_via (app/sheet), sheet_row_ref, version | `videographer_id` must match the plan's videographer, enforced by a check trigger. Status transitions are validated by a trigger: videographers may only move assigned→in_progress→submitted and revision_requested→submitted, and only an admin may set approved, revision_requested or cancelled. |
| **task_references** | task_id, kind, url, storage_path, title, note, meta jsonb (oEmbed/OG thumbnail), sort_order | |
| **submissions** | task_id, version (1..n), links text[] (1–5 URLs), thumbnail_path, notes, source, submitted_by, submitted_at, is_on_time (generated from due_date) | Append-only, so every version is kept. |
| **task_reviews** | task_id, submission_id, reviewer_id, decision (approved / revision_requested), points_awarded, quality_rating 1–5, feedback | CHECK `points_awarded BETWEEN 0 AND max_points`, enforced via the RPC and a trigger. Approved reviews require points and a rating. |
| **app_settings** | singleton row: weight_points, weight_completion, weight_punctuality, weight_discretionary, sheet_mode, master_spreadsheet_id, sync_enabled | CHECK that the weights sum to 100 |
| **monthly_assessments** | videographer_id, month, metrics jsonb (raw counts), weights jsonb (snapshot), points_pct, completion_pct, punctuality_pct, discretionary_score 0–10, bonus_points, bonus_reason, total_score, admin_remarks (private to admin + that videographer), public_note (shown on the home page hero), status, is_locked, published_at, published_by | UNIQUE (videographer_id, month). Weights are snapshotted at publish, so later changes to the settings do not alter scores already published. |
| **assessment_unlocks** | assessment_id, unlocked_by, reason (required), unlocked_at | Audit trail for the unlock-with-reason rule |
| **featured_work** | month, task_id, rank (1 = Best Work, 2+ = runner-ups), reason, chosen_by | UNIQUE (month, rank) and UNIQUE (month, task_id). The task must be approved. |
| **activity_log** | actor_id (null when the actor is the sync system), actor_kind (user/sheet/system), action, entity_type, entity_id, videographer_id, payload jsonb | Written by triggers and RPCs. Read: admin sees all, a videographer sees only rows about their own entities. |
| **notifications** | user_id, type, title, body, link, read_at | Created by triggers. Supabase Realtime makes the bell badge update live. |
| **sheet_configs** | videographer_id (unique), spreadsheet_id, tab_name, last_synced_at, last_status, last_error | Works for both one sheet per person and one tab per person in a master sheet |
| **sheet_row_state** | task_id (PK), sheet_config_id, last_status, last_link, last_notes, last_hash, last_written_at, last_read_at | Holds the last values seen in each row, used to work out what changed in the Sheet since the previous sync |
| **sheet_outbox** | task_id, reason, enqueued_at, processed_at, attempts, last_error | Filled by a trigger on task, reference, review or submission changes, so App→Sheet writes are batched and retried |
| **sync_runs** | trigger (cron/manual), started_at, finished_at, status, stats jsonb | |
| **sync_events** | run_id, sheet_config_id, task_id (nullable), row_number, kind, detail jsonb | Shown in the sync health panel in Settings |

**Indexes:** FK columns, `tasks (videographer_id, status)`, `tasks (plan_id)`, `tasks (due_date) WHERE status NOT IN ('approved','cancelled')`, `submissions (task_id, version DESC)`, `notifications (user_id, read_at)`, `activity_log (created_at DESC)`, `monthly_assessments (month, status)`, `sheet_outbox (processed_at) WHERE processed_at IS NULL`.

### RLS (every table has RLS enabled)

There are two helpers: `is_admin()` and `auth.uid()`. Both are `STABLE SECURITY DEFINER` with a fixed `search_path`.

| Table | Admin | Videographer |
|---|---|---|
| profiles | all | read own row, plus a **public view** `profiles_public` (id, name, avatar, is_active) for the leaderboard |
| clients | all | read only clients linked to them |
| monthly_plans, tasks, task_references, submissions, task_reviews | all | read only rows where `videographer_id = auth.uid()`, and only for **published** plans. Writes go only through RPCs. |
| monthly_assessments | all | read own row **only when status = published** |
| featured_work, leaderboard data | all | read only through RPCs that return safe columns (see below) |
| notifications | all | read and mark read on own rows only |
| activity_log | all | read own |
| app_settings, task_categories | all | read categories only |
| sheet_* , sync_* | all | none |

Storage buckets mirror the same rules. The `task-refs/{task_id}/…` and `thumbnails/{task_id}/…` paths are readable only by the owning videographer or an admin, enforced by policies that join through tasks. Avatars and client logos are readable by any logged-in user.

**Home-page data that crosses users** is exposed only through `SECURITY DEFINER` RPCs that return a fixed, safe set of columns:
- `get_leaderboard(month)` returns rank, name, avatar, total_score, tasks_completed, and is_provisional. If assessments are published for that month, it uses them. Otherwise it falls back to the sum of approved points.
- `get_top_performer(month)` returns the leaderboard row plus `public_note`, never `admin_remarks`.
- `get_featured_work(month)` returns title, client name, videographer name, deliverable link, thumbnail, and reason.
- `get_team_stats(month)` returns videos delivered, clients served, and on-time %.

### Key RPCs
`start_task`, `submit_task(task_id, links, notes, thumbnail_path, source)`, `review_task(task_id, decision, points, rating, feedback)`, `cancel_task`, `upsert_plan_with_tasks(payload)`, `duplicate_plan(from_month, to_month, videographer_id)`, `assign_task_to_many(task_template, videographer_ids[])`, `compute_assessment(videographer_id, month)` (fills a draft row), `publish_assessment`, `unlock_assessment(id, reason)`, `set_featured_work(month, picks[])`, `mark_notifications_read`.

---

## 3. Scoring

The calculation runs **in SQL**, so the stored score is authoritative. It is mirrored in `src/lib/scoring.ts` for the live preview while the Admin types. Both are tested against **one shared JSON file of test cases**, so the two copies cannot drift apart.

For one videographer and one month, over tasks that are not cancelled:
- `points_pct = Σ points_awarded(approved) / Σ max_points(all tasks)`
- `completion_pct = approved_count / assigned_count`
- `punctuality_pct = on_time_submitted / submitted_count`, where a task counts as submitted if it has at least one submission. On time means the **first** submission arrived by the due date (see Q3).
- `total = w_p·points_pct + w_c·completion_pct + w_t·punctuality_pct + w_d·(discretionary/10)` gives a score out of 100, plus `bonus_points`.
- Edge cases: if nothing was assigned, every ratio is 0 and the UI says "No tasks this month". If nothing was submitted, punctuality is 0 (see Q3).

**Provisional standings** (shown before publishing): Σ approved points for the month, labelled "Live standings (provisional)".

---

## 4. Routes & screens

```
/login  /forgot-password  /reset-password  /accept-invite        (public)
/                     Home: top performer, leaderboard, best work, team stats   (all roles)
/notifications        (all roles)
/profile              own profile, change password, theme          (all roles)

/admin                Dashboard
/admin/videographers               list + "Add videographer"
/admin/videographers/:id           tabs: Overview · Plan & tasks · Submissions · Assessments · Sheet
/admin/clients                     list + CRUD
/admin/clients/:id                 details, assigned crew, work-by-month
/admin/plans?vid=&month=           Monthly Plan builder
/admin/tasks/:id                   task detail, references, history, (edit)
/admin/review                      "Needs review" queue
/admin/review/:taskId              side-by-side deliverable vs references → approve / revise
/admin/assessments?month=          team grid for month + CSV/Excel export
/admin/assessments/:vid/:month     assessment editor, Planned vs Completed, publish/lock, PDF
/admin/featured?month=             pick Best Work + runner-ups
/admin/settings                    tabs: Categories · Scoring weights · Google Sheets & sync health
/admin/activity                    full activity log

/me                   Videographer dashboard (plan, clients, tasks by status)
/me/tasks/:id         brief, references, Start / Submit / Resubmit, feedback, history
/me/points            points this month, published assessment, rank, trend chart
```

Route guards: `<RequireAuth>` → `<RequireRole role="admin">`. A videographer who opens `/admin/*` is redirected to `/me` and sees a toast. RLS still enforces access on the server even if the guard is bypassed.

## 5. Front-end structure

```
src/
  app/            router.tsx, providers.tsx (QueryClient, Theme, Auth), layouts (AdminShell, CrewShell, AuthLayout)
  components/ui/  shadcn components (themed)
  components/     StatusChip, VideoEmbed, LinkPreviewCard, VideoThumb16x9, EmptyState, CountUp, MonthPicker, ConfirmDialog, PageHeader, StatCard, Skeletons
  features/
    auth/ dashboard/ videographers/ clients/ plans/ tasks/ submissions/ review/
    assessments/ leaderboard/ featured/ notifications/ settings/ sync/ activity/
      each: api.ts (query/mutation hooks), schemas.ts (zod), components/, pages/
  lib/            supabase.ts, database.types.ts (generated), dates.ts (IST helpers), scoring.ts, links.ts (YouTube/Vimeo/Drive/IG parsing), export/ (pdf, csv, xlsx)
  hooks/          useAuth, useRole, useMonth, useReducedMotion, useMediaQuery
supabase/
  migrations/  seed.sql (+ seed.ts for auth users)  tests/ (pgTAP RLS + scoring)
  functions/ admin-users/ sheets-sync/ sheets-provision/ link-meta/ _shared/ (sync-core.ts – pure, unit-tested)
```

Libraries beyond the stack you listed: `@react-pdf/renderer` (assessment PDF), SheetJS loaded only when exporting (Excel/CSV), `date-fns` + `date-fns-tz`, `vitest`, `@testing-library/react`, and `sonner` (toasts).

## 6. Design system

- Tokens are CSS variables on `:root` (light) and `.dark` (the default), mapped into the Tailwind theme:
  - Surfaces: bg `#0B0B0F`, surface `#15151C`, surface-2 `#1C1C25`, border `#26262F`.
  - Accents: primary amber `#F5A524`, secondary violet `#7C6CF2`.
  - Muted states: success `#3FA37A`, warning `#D9A441`, danger `#D0605E`, info `#5B8DEF`.
  - Light mode uses a matching warm-paper palette.
  - All text/background pairs are checked for WCAG AA.
- Fonts: Inter for UI, Space Grotesk for headings and numbers, with `font-variant-numeric: tabular-nums` on scores.
- Status chip colours are defined once in `StatusChip`: assigned slate, in progress violet, submitted amber, revision orange-red, approved green, cancelled muted.
- Motion uses Framer Motion: page fade/slide, count-up numbers, and animated bars. All of it is gated by `useReducedMotion`.
- App shell:
  - Admin: collapsible sidebar on desktop, sheet drawer on mobile.
  - Videographer: bottom tab bar on mobile (Home · My Tasks · Points · Alerts) and sidebar on desktop.
  - Tap targets are at least 44px.
- Leaderboard: gold, silver and bronze accents for the top 3, a Recharts horizontal bar chart in violet with the leader in amber, and a month selector.

## 7. Google Sheets sync design

**Setup:** a service account JSON is stored in Supabase secrets (`GOOGLE_SERVICE_ACCOUNT_JSON`). The Admin pastes each videographer's spreadsheet URL in Settings. **Provision** (`sheets-provision`) then:
- writes the header row
- adds Status dropdown validation
- protects every column except Status, Deliverable link and Notes, with the service account and admin as the only editors
- freezes the header and hides a helper column

**Columns:** Task ID | Month | Client | Title | Category | Brief | Reference links | Due date | Status | Deliverable link | Videographer notes | Admin feedback | Points | Last updated | *(hidden) Sheet edited at*

**Each run** (pg_cron every 10 min → `pg_net` POST with a shared secret; "Sync now" calls the same function with the admin's JWT):
1. Take a Postgres advisory lock so two runs never overlap, and open a `sync_runs` row.
2. For each active `sheet_config`, call `values.batchGet` on the whole tab (one read per sheet, which stays well within API quotas for about 20 sheets).
3. **Sheet → App, per row, matched by Task ID only:**
   - Empty or unknown ID, or an ID belonging to a different videographer: skip the row and record `missing_id` / `unknown_id`.
   - Compare the editable cells with `sheet_row_state`. If nothing changed, skip.
   - Task already `approved` or `cancelled`: ignore and record `conflict_approved`.
   - Status `Approved` or `Revision Requested` typed in the Sheet: ignore and record `invalid_status`.
   - **Conflict:** the app changed the task after the last sync *and* the Sheet changed it too. Compare the app's `status_changed_at` with the Sheet's edit timestamp. The later one wins, and a `conflict_lww` event is logged.
   - Status `Submitted` with a link that passes URL validation: call the same `submit_task(..., source => 'sheet')` used in the app. A new link on an already-submitted or revision task creates a new submission version. This notifies the Admin and logs the activity. A bad URL is recorded as `bad_link`.
   - In Progress: call `start_task`. A Notes-only change updates the latest submission's notes, or a pending-notes field.
4. **App → Sheet:**
   - Drain `sheet_outbox`. Find each task's row by searching the Task ID column, never by position, then update that row or append a new one.
   - Write in one `values.batchUpdate` per sheet, then update `sheet_row_state` so the app's own write is not read back as a Sheet edit.
5. Update `sheet_configs.last_synced_at/last_status`, close the run with stats, and log the activity.

**Code split:**
- The pure decision logic lives in `_shared/sync-core.ts`. It covers row parsing, diffing against the stored state, conflict resolution and the action list, with no I/O, so it can be unit-tested in Vitest.
- The Edge Function only does I/O.
- It uses Google's JWT auth (`google-auth-library`) and the Sheets REST API, rather than the whole `googleapis` package, which is very large for an Edge Function cold start. Tell me if you want the full `googleapis` package regardless.

**Settings → Sync health:**
- one row per sheet: last sync, rows updated, errors in the last run, and a link to open the sheet
- a filterable list of events
- a "Sync now" button, plus a "Re-provision" button that repairs headers and protections

`SHEETS_SETUP.md` covers creating the GCP project, enabling the Sheets API, creating the service account, sharing each sheet as Editor, setting the env var or secret, scheduling cron, and the optional Apps Script for edit timestamps.

## 8. Testing plan

- **Vitest:**
  - `scoring.ts` against the shared test cases
  - `sync-core.ts`: ID matching, unknown/missing IDs, approved-task conflict, LWW in both directions, submission creation, invalid status, bad link
  - `links.ts` URL parsers
  - key form schemas
- **pgTAP (`supabase test db`):**
  - RLS: videographer A cannot select, update or insert B's tasks, submissions, reviews, assessments or notifications
  - a videographer cannot read unpublished plans or assessments, and cannot call admin RPCs
  - status-transition trigger and points bounds
  - SQL scoring against the shared test cases
- **Manual acceptance:** I run the §12 checklist in a browser at 360px and 1440px before reporting each phase done.

---

## 9. Open questions (please answer — defaults in **bold** if you'd rather not decide)

1. **Master sheet privacy.** Google Sheets cannot hide one tab from someone who has edit access to the file. In master-tab mode every videographer could therefore read every other videographer's tab, which conflicts with "never see another's tasks". → **Default: build both modes as asked, recommend one sheet per videographer, and show a warning when master-tab mode is selected.**
2. **Last-write-wins timestamps.** The Sheets API does not report when a cell was edited. Two options:
   - (a) A 6-line Apps Script `onEdit` that writes a "Sheet edited at" stamp into a hidden column. It is pasted once per sheet and gives true LWW.
   - (b) Without the script, the time of a Sheet edit is taken as the time the sync detects it.
   → **Default: support (a) and fall back to (b), logging every conflict either way.**
3. **Punctuality.** Is a task on time based on its *first* submission or its *final approved* one, and what about tasks resubmitted after a revision? If nothing was submitted, is punctuality 0, or is its weight redistributed? → **Default: first submission; 0 when nothing was submitted.**
4. **Score scale.** The total is out of 100, and bonus points add on top, so a score can exceed 100. → **Default: yes, show for example "92.5 (+3 bonus)".**
5. **Invite emails.** Supabase's built-in email sender is rate-limited to a few emails per hour, which is not suitable for production. → **Default: document custom SMTP (for example Resend) in the README. Locally, Supabase's mail catcher (Inbucket) captures the emails.**
6. **Deactivated videographers.** → **Default: they stay on leaderboards for months where they have a published assessment, and are hidden from the current month's provisional standings.**
7. **Plan visibility.** Should a videographer see a plan and its tasks while the plan is still in *draft*? → **Default: no, only after the Admin publishes the plan. Publishing notifies the videographer about each task ("new task assigned").**
8. **Supabase/Vercel targets.** → **Default: Phases 1–6 run on a local Supabase (Docker), and I deploy to your hosted Supabase project and Vercel once you confirm. I won't create cloud projects without asking.**

## 10. Phases (I stop and report after each)

1. Scaffold, design tokens and theme, app shell; all migrations, RLS, RPCs and triggers; seed data (1 admin, 5 videographers, 6 clients, a month of tasks in mixed states); auth (login, reset, invite acceptance); role routing; pgTAP RLS tests.
2. Admin: clients, videographers (create via Edge Function, deactivate), Plan builder (duplicate last month, assign to many), tasks and references with link previews.
3. Videographer: dashboard, task detail, start/submit/resubmit, notifications (realtime), mobile tab bar.
4. Review flow with embeds, points and rating; assessment (auto-fill → draft → publish → lock/unlock); Planned vs Completed; PDF + CSV/Excel export; Admin dashboard metrics.
5. Home: top performer, leaderboard chart, podium, best work + runner-ups, team stats, provisional standings, featured-work picker.
6. Google Sheets: provision, two-way sync, cron, sync health, SHEETS_SETUP.md, sync-core tests.
7. Polish: responsiveness pass, accessibility audit, motion, remaining tests, README (setup, env, migrations, seed, deploy).
