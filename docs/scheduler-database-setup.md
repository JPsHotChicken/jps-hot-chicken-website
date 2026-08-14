# Scheduler database (Supabase)

The schedule maker at `/admin` stores its data in Supabase. Before this it lived
in the browser's `localStorage`, which meant schedules were tied to one browser
and vanished if site data was cleared.

## The project

| | |
|---|---|
| Project | `jps-hot-chicken` |
| Reference | `ubotsksjsqjhfrsqcrna` |
| Region | `us-east-1` |
| URL | `https://ubotsksjsqjhfrsqcrna.supabase.co` |

## Environment variables

Both are required. Without them `/admin` shows a setup notice instead of the
dashboard rather than erroring.

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → `service_role` |

Locally these go in `.env.local`. On Vercel: Project Settings → Environment
Variables, for **all three** environments (Production, Preview, Development).

The service role key bypasses every access rule in the database. It is read only
by server code and never reaches the browser — do not give it a `NEXT_PUBLIC_`
prefix, and do not commit it.

## How access works

There is no Supabase Auth. The dashboard authenticates the way it always has:
`ADMIN_PASSWORD` plus a signed, httpOnly cookie. So:

- Every table has **RLS enabled with no policies**. Anonymous and authenticated
  callers can read nothing at all through the public API.
- All queries run server-side under the service role, which bypasses RLS.
- `src/lib/supabase/server.ts` imports `server-only`, so importing it from a
  Client Component is a build error and the key can never end up in a bundle.
- Every Server Action in `src/app/admin/schedule-actions.ts` re-checks the
  session cookie and validates its own arguments. A Server Action is a public
  POST endpoint; being rendered inside a protected page proves nothing about who
  is calling it.

The Supabase linter reports `rls_enabled_no_policy` (INFO) on all five tables.
That is the intended posture, not a finding to fix.

## Tables

| Table | Holds |
|---|---|
| `schedule_settings` | Single row. `row_count` — rows shown per day. |
| `employees` | Name, shift group, and the four digit `login_code`. |
| `shift_assignments` | One row per filled grid cell — the owner's working copy. |
| `time_off_requests` | Dated requests, `pending` / `approved` / `denied`. |
| `recurring_time_off` | Standing weekly conflicts, one per person per weekday. |
| `published_weeks` | One row per week the owner has sent to staff. |
| `published_shifts` | Snapshot of the grid as of the last "Go Live". |
| `staff_login_attempts` | Sign-in throttling for `/staff`. |

`shift_assignments` is keyed by real calendar date — `(shift_date, row_index,
hour)` — rather than by week plus weekday, so a date can only ever mean one
thing. It is sparse: empty cells are absent rather than stored as nulls. `hour`
is the absolute hour (8 = the 8–9 AM block, 21 = the 9–10 PM block).

Everything hangs off `employees` with `on delete cascade`, so removing someone
takes their shifts, requests and recurring entries with them in one statement.

## The staff side (`/staff`)

Employees sign in at `/staff/login` with a four digit code held on their row in
`employees`. There is no environment variable and no account to create: the owner
reads the code off the employee list in `/admin` and tells them.

New employees are given a code automatically when they're added. Anyone added
before this existed has `login_code = null` and cannot sign in until the owner
clicks the refresh icon beside their name to issue one.

### Publishing is a snapshot, not a flag

The owner's edits land in `shift_assignments` immediately. Staff never read that
table — they read `published_shifts`, which is only written by the **Go Live**
button. So a half-built week is invisible to employees until it's deliberately
sent, and republishing *replaces* the snapshot so a deleted shift actually
disappears for them.

The button shows three states: `Go live` (never sent), `Push changes` (sent, but
edited since), and `Live` (sent and unchanged).

### Why the code is stored as typed

`login_code` is stored in plain text rather than hashed, because the owner has to
be able to read it back to the employee. That is a deliberate trade-off, and the
reason the throttle in `staff_login_attempts` exists — four digits is only 10,000
possibilities. What the code protects is one person's own shift times and their
time-off requests.

If that ever feels too thin, the change is small: widen the column and the
`employee_login_code_is_four_digits` check to six digits, and update `LENGTH` in
`src/app/staff/login/LoginForm.tsx`.

## Changing the schema

Apply migrations through Supabase, then regenerate the types so TypeScript
matches the database:

```bash
npx supabase gen types typescript --project-id ubotsksjsqjhfrsqcrna > src/lib/supabase/database.types.ts
```

## Data flow

```
/admin (Server Component)
  └─ loadScheduleBase() + loadWeek()        src/lib/schedule-repo.ts
       └─ getDb()                            src/lib/supabase/server.ts
  └─ <Scheduler>  (Client Component)
       ├─ edits applied to local state immediately
       └─ saved via Server Actions           src/app/admin/schedule-actions.ts
```

Edits are optimistic: dragging across a row of cells has to feel instant, so the
UI updates first and saves in the background. If a save fails, a banner says so
and the week is re-read from the database, so what is on screen never quietly
disagrees with what is stored.

Only the week you are looking at is loaded. Navigating to another week fetches
it on demand and caches it for the rest of the session.
