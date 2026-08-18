# Applications

The Applications page at `/admin/applications` is the hiring side of the
dashboard. Three sections, one screen, and nothing shared between them except a
sign-out button:

| Section | What it is |
|---|---|
| **Applications** | Everyone who has applied. Fills itself in. |
| **Set interview dates** | The interviews you have booked. Typed in by hand. |
| **Text info** | The paragraphs you send to everybody, written once. |

It uses the same Supabase project and the same environment variables as the
scheduler — see [`scheduler-database-setup.md`](./scheduler-database-setup.md).
Nothing extra needs configuring.

## Applications

Every application submitted at `/careers/apply` is written straight into this
table. There is nothing to import and nothing to type in: refresh the page and
new ones are at the top, with **Today** or **3 days ago** where the date goes,
because on this page how long somebody has been waiting matters more than the
calendar date they applied.

The Google Sheet set up in
[`applications-sheet-setup.md`](./applications-sheet-setup.md) still gets its row
too, and the email still goes out. Both are best-effort and independent: if one
fails the other still happens, and the applicant is never asked to submit twice —
a duplicate row is worse than a missing email.

Open a row and you get everything the applicant actually wrote, plus the two
things that are yours rather than theirs:

- **Status** — New, Contacted, Interview set, Hired, Passed.
- **Your notes** — saved when you click away from the box.

**Nothing an applicant typed can be edited.** That is on purpose. The sheet is a
record of what was submitted, and it stops being one the first time somebody
tidies up a phone number. If a row has to go, delete it.

**Export** downloads what is currently on screen — so filter or search first, and
you get a spreadsheet of exactly those people rather than all of them.

## Set interview dates

A date, a time, a name and a phone number, which is all an interview is. Add one
from the form, or press **Set an interview** on an application and the name and
number come across with it — the date is deliberately left blank, since that is
the one thing being decided. Booking an interview from an application also moves
that application to **Interview set**.

Today's interviews stay under "coming up" for the whole day rather than dropping
into the past the moment they start — one at 10am is still worth seeing from the
parking lot at 10:05. Everything genuinely past is kept, newest first, behind
**Show past interviews**.

A time can be left off. It shows as **no time set** in amber, so a half-booked
interview reads as the loose end it is instead of hiding among the settled ones.

## Text info

The interview invite, where to park, what to bring, the "thanks but not this
time" — anything typed more than once. **Copy** puts a piece on the clipboard;
that is what the section is for, and the up and down arrows are just for keeping
the list in the order you use it.

## Tables

| Table | Holds |
|---|---|
| `job_applications` | One row per submitted application, plus your status and note. |
| `interviews` | One row per booked interview. |
| `text_snippets` | The saved pieces of text. |

All three have **RLS enabled with no policies**, exactly like the scheduler's and
the truck order's tables: nothing is reachable through the public API, and every
read and write goes through the service role from server code. The Supabase
linter's `rls_enabled_no_policy` (INFO) notice on them is the intended posture.

Two details worth knowing:

- `interviews.application_id` is `on delete set null`. Deleting an application
  therefore does not take a booked interview with it — the interview keeps its
  name, number, date and time and simply stops pointing anywhere.
- `interviews.interview_time` is text in 24-hour `HH:MM`, which is exactly what
  `<input type="time">` gives back, with a check constraint enforcing the shape.
  Empty is allowed and means a date with no time decided yet.

## Where the code lives

| File | What's in it |
|---|---|
| `src/lib/applications.ts` | Types, dates, sorting, CSV. No database, no React. |
| `src/lib/applications-repo.ts` | Every read and write. |
| `src/app/admin/applications/actions.ts` | The Server Actions, each re-checking the session. |
| `src/components/admin/Applications.tsx` | The shell and the three tabs. |
| `src/components/admin/ApplicantSheet.tsx` | Section one. |
| `src/components/admin/InterviewPanel.tsx` | Section two. |
| `src/components/admin/TextInfoPanel.tsx` | Section three. |

All three sections stay mounted and the inactive ones are hidden, rather than
being unmounted with the tab — a half-typed interview or a search you had
narrowed down survives a look at another section, which is the whole reason to
have them on one page instead of three.
