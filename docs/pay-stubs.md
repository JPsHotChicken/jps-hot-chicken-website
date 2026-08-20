# Staff pay stubs

The accountant sends one payroll PDF per pay run with a page per person.
`/admin/pay-stubs` splits it, works out whose page is whose, and holds the whole
run as a draft until the owner releases it. Staff then read their own page — and
only their own — when they sign in at `/staff`.

It uses the same Supabase project and the same environment variables as the
scheduler — see [`scheduler-database-setup.md`](./scheduler-database-setup.md).
Nothing extra needs configuring.

## The flow

1. **Upload** the PDF. Every page is split into a PDF of its own and stored in a
   private bucket.
2. **Check** the matches. Each page is shown in full with the person it has been
   given to. The badge says how the match was made.
3. **Settle** anything left. A page is either assigned to somebody or set aside.
4. **Go live.** The run is released to everyone at once.

Go live is refused while any page is still undecided. A page nobody has looked
at is as likely to be somebody's missing stub as it is to be a page for a person
who does not work here, and the difference matters too much to assume.

## How pages are matched to people

The roster holds short names — `Rissi`, `Gabby`, `Samjhana` — while payroll
prints legal ones — `Marrissia D Bermudez`. Nothing in the PDF is
machine-readable, so the name on the page is the only handle there is.

| Badge | What happened |
|---|---|
| **Known name** | This exact payroll name has been assigned before. |
| **Name matched** | The roster name is the printed first name. |
| **Best guess — check it** | A shortening (`Rissi` inside `Marrissia`) or a spelling that drifts by a letter or two (`Uddipti` for `Uddhipti`). |
| **Needs assigning** | No safe guess. The owner picks. |

Nobody is ever suggested twice in one run: two pages pointing at one person
means at least one is wrong, so the stronger claim keeps the person and the
weaker page comes back unassigned.

**Assigning by hand teaches it.** Pick `Gabby` for `Gabrielle A Muschette` once
and every later run matches her on its own. Remembered names show as chips under
each person on **Staff management**, where a wrong one can be dropped.

The name itself is read off the page rather than from a fixed position, so a
change of payroll software does not break it: the employee's name is the text
that repeats most on their own page, anything printed on every page is a form
label, and the company and bank print in capitals while names do not.

## Who can see what

The bucket is private. The only way to a page is `/api/pay-stubs/[stubId]`,
which is the whole of the security for this feature:

| | Draft run | Released — their own | Released — someone else's |
|---|---|---|---|
| Not signed in | 401 | 401 | 401 |
| Staff | 404 | ✅ the page | 404 |
| Owner | ✅ | ✅ | ✅ |

"No such page" and "not yours" give the same answer, so the route cannot be used
to learn which pages exist. Pages are sent `private, no-store` and are never
cached by anything in between.

This matters more than it does elsewhere on the dashboard: a page carries
somebody's wages, their home address, and the account their pay lands in.

**Take it back** un-releases a run — staff lose access immediately. It cannot
un-see anything already opened, so it is a way to stop a mistake spreading, not
to undo it.

## Where things live

| | |
|---|---|
| The screen | `/admin/pay-stubs` |
| Matching, dates, name reading | `src/lib/pay-stubs.ts` (pure, tested) |
| Splitting and text extraction | `src/lib/pay-stubs-pdf.ts` |
| Reads and writes | `src/lib/pay-stubs-repo.ts` |
| Upload | `POST /api/admin/pay-stubs/upload` |
| One page | `GET /api/pay-stubs/[stubId]` |
| What staff see | `/staff` → *My pay stubs*, and `/staff/pay-stubs/[stubId]` |

Uploading is a route rather than a Server Action because it carries a file:
actions post through a body-size limit meant for form fields. The limit here is
20 MB, and a PDF with more than 200 pages is refused as not being a pay run.

## The tables

Already applied to the live project. Recorded here so the schema has a home.

```sql
create table public.pay_stub_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_filename text not null,
  page_count integer not null check (page_count > 0),
  pay_date date,
  period_start date,
  period_end date,
  -- Null until the owner presses Go live.
  released_at timestamptz
);
alter table public.pay_stub_batches enable row level security;

create table public.pay_stubs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.pay_stub_batches(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  employee_id uuid references public.employees(id) on delete set null,
  payroll_name text,
  match_source text not null default 'none'
    check (match_source in ('alias', 'exact', 'fuzzy', 'none')),
  skipped boolean not null default false,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (batch_id, page_number)
);

-- One page per person per pay run.
create unique index pay_stubs_one_page_per_person
  on public.pay_stubs (batch_id, employee_id)
  where employee_id is not null;

create index pay_stubs_employee_idx on public.pay_stubs (employee_id);
alter table public.pay_stubs enable row level security;

create table public.employee_payroll_names (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  payroll_name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.employee_payroll_names enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pay-stubs', 'pay-stubs', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;
```

RLS is enabled with no policies, like every other table here — all access is
server-side under the service role. The Supabase linter's
`rls_enabled_no_policy` (INFO) on these three tables is the intended posture,
not a finding to fix.

Deleting a pay run removes its rows and its stored pages together.

## What staff see

**My pay stubs** sits under *My requests* on `/staff`. Each released stub is one
row — the pay period it covers, the date it was paid, and **See more**. The whole
row is the link, so it is one easy target on a phone rather than a small button
to aim at.

Tapping through opens `/staff/pay-stubs/[stubId]`, which shows the PDF itself.
That page checks ownership before it renders and the PDF inside it is fetched
through `/api/pay-stubs/[stubId]`, which checks again — two locks on one door.

The stub is embedded with `<object>` rather than `<iframe>` so that a browser
which cannot display a PDF inline shows an **Open my pay stub** button instead of
a blank rectangle. Some Android browsers do exactly that, and a stub somebody
cannot see is the same to them as one that was never sent. The header carries the
same escape hatch on every device.

A draft run is invisible here. So is anybody else's stub: both give a 404, which
is also what a made-up id gives.
