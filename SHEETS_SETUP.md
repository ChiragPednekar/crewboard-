# Google Sheets sync — setup

CrewBoard can mirror each videographer's tasks into a Google Sheet and read their updates back. The app stays the source of truth; the sheet is a second way to work.

- **App → Sheet:** every task in a *published* plan gets a row: brief, references, due date, status, feedback and points.
- **Sheet → App:** the videographer edits only **Status**, **Deliverable link** and **Notes**. Everything else is protected.
  - Setting Status to *Submitted* with a link creates a real submission and notifies you.
  - *In Progress* starts the task.
  - Notes are copied across.
- **When:** every 10 minutes, plus **Sync now** in *Settings › Google Sheets*.

You need about 15 minutes, a Google account, and access to the Supabase project.

---

## 1. Create a service account (once)

1. Open <https://console.cloud.google.com/> and create a project (e.g. `crewboard-sync`). No billing is needed.
2. Go to **APIs & Services › Library**, search **Google Sheets API**, and click **Enable**.
3. Go to **IAM & Admin › Service Accounts** and click **Create service account**.
   - Name: `crewboard-sync`.
   - Skip the optional role and user steps.
4. Open the new account and go to **Keys › Add key › Create new key › JSON**. A `.json` file downloads.
   - **Keep it secret.** It can edit every sheet shared with it.
5. Note the account's email (`crewboard-sync@<project>.iam.gserviceaccount.com`). Every sheet is shared with this address.

## 2. Give the key to the Edge Functions

Generate a random secret for the scheduler:

```bash
openssl rand -hex 32
```

**Hosted Supabase:**

```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat ~/Downloads/crewboard-sync-xxxx.json)"
supabase secrets set SYNC_CRON_SECRET=<the random value>
supabase functions deploy sheets
```

`supabase/config.toml` already sets `verify_jwt = false` for `sheets`. That lets the scheduler call it without a user login. The function then checks the admin's login, or the `x-sync-secret` header, itself.

**Local:** put the same values in `supabase/.env` (gitignored), then restart:

```bash
supabase stop && supabase start
```

## 3. Turn on the 10-minute schedule

The migration already created a `pg_cron` job. It does nothing until it knows where to call and with which secret. Run this once in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/sheets', 'sheets_sync_url');
select vault.create_secret('<the same SYNC_CRON_SECRET>', 'sheets_sync_secret');
```

Locally, the URL is `http://supabase_kong_crewboard:8000/functions/v1/sheets`.

Then in CrewBoard go to **Settings › Google Sheets** and switch on **Sync automatically every 10 minutes**. Switch it off at any time to pause the schedule. *Sync now* still works while it's paused.

## 4. Connect each videographer

**Recommended: one spreadsheet per person.**

1. Create a blank Google Sheet, e.g. "Priya — CrewBoard".
2. **Share** it as **Editor** with:
   - the videographer, and
   - the service account email.
3. In **Settings › Google Sheets**, click **Connect** next to their name, paste the sheet's link, and keep the tab name `Tasks`.

CrewBoard then sets the sheet up:
- header row
- Status dropdown
- protection, so only Status, Deliverable link and Notes are editable
- frozen header
- a hidden edit-stamp column

It then writes all their published tasks. Later tasks are added at the bottom as you publish them.

**Alternative: one master spreadsheet with a tab per person.** Choose that layout in Settings, paste the master sheet's link, and connect each person; they each get their own tab.

> ⚠️ Google can't hide a tab from someone who can edit the file, so in master-tab mode **everyone can read everyone's tasks**. Use one spreadsheet per person if that matters.

Use **⋯ › Repair header & protection** if someone breaks the layout.

## 5. Optional: exact edit times (Apps Script)

**Why it matters:** if a task changes in the app *and* in the sheet between two syncs, the newer change wins. Google's API doesn't say when a cell was edited, so without help, a sheet edit counts as happening when the sync notices it.

To record the real edit time, paste the script from **Settings › Google Sheets › Optional: edit-time stamp** into each spreadsheet:
1. Go to **Extensions › Apps Script**, paste the script and save.
2. Nothing else is needed. It's a simple `onEdit` trigger, so it runs for whoever edits.

It writes the time into the hidden column O whenever Status, Deliverable link or Notes change. Column O stays editable so the script can write to it while running as the videographer. Tampering with it can only affect which side wins a conflict, and future times are capped at "now".

## How conflicts and mistakes are handled

| What happens in the sheet | Result | Shown in *Sync health* as |
|---|---|---|
| Status → *Submitted* with a valid link | New submission (a new version if they'd already submitted) | Submission received |
| Status → *Submitted* without a link, or with text that isn't a link | Ignored; status goes back; their typed text is kept so they can fix it | Bad link |
| Status → *Approved* / *Revision Requested* / *Cancelled*, or an unknown word | Reverted; only you can set these | Invalid status |
| Any edit to an *Approved* or *Cancelled* task | Reverted | Edited a closed task |
| Changed in both app and sheet since the last sync | Newer change wins; the other side is overwritten | Conflict (who won) |
| A row typed by hand without a Task ID | Ignored (tasks are created in the app) | Row without a Task ID |
| A row deleted | Put back on the next sync | — |
| Sheet not shared with the service account | That sheet is skipped; the others still sync | Can't open the sheet (403) |
| Month already assessed and locked | Change refused; row restored | Error: assessment is locked |

Every change that came from a sheet is labelled "via Sheet" in the app's history and activity log.

## Testing without Google

`scripts/mock-google-sheets.mjs` imitates Google's sign-in and the Sheets API, and checks the token signature for real.

1. Write a mock key and `supabase/.env`:
   ```bash
   node scripts/mock-google-sheets.mjs --env
   ```
2. Restart Supabase:
   ```bash
   supabase stop && supabase start
   ```
3. Start the mock at http://localhost:8787:
   ```bash
   node scripts/mock-google-sheets.mjs
   ```
4. In Settings, connect anyone with any link, e.g. `https://docs.google.com/spreadsheets/d/mockSheetForPriya0000001/edit`.
   - IDs containing `denied` behave like a sheet that isn't shared.
5. Open http://localhost:8787 to see the "sheets". Edit the yellow cells as the videographer would, then press **Sync now**.

**Before going live,** replace `supabase/.env` with your real key and delete `supabase/.mock-google-key.pem`.

## Limits and costs

- Each sync makes one read and at most one write per sheet. That's far under Google's free quota (300 requests per minute per project), even for dozens of people.
- Runs don't overlap: a second run waits, and a run stuck for 15 minutes is abandoned.
- The run log is kept for 30 days.
