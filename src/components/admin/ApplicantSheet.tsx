"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronDown,
  Download,
  Inbox,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhone, telHref } from "@/lib/format";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  STATUS_STYLES,
  applicantName,
  applicationsCsvFilename,
  formatAge,
  formatSubmitted,
  toApplicationsCsv,
  type Application,
  type ApplicationStatus,
} from "@/lib/applications";

type Props = {
  applications: Application[];
  onStatus: (id: string, status: ApplicationStatus) => void;
  onNote: (id: string, note: string) => void;
  onDelete: (application: Application) => void;
  /** Start an interview for this applicant, over on the interviews section. */
  onSetInterview: (application: Application) => void;
};

export function StatusPill({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A field and its answer, for the panel under an opened row. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}

/** Push a browser download of text the page generated itself. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The applications section: every application ever submitted, newest first.
 *
 * It reads like a spreadsheet because that is what it replaces — a row per
 * person, the columns you sort and skim on, and everything they actually wrote
 * one click down rather than crammed into a cell. Nothing an applicant typed is
 * editable; the two things the owner owns, a status and a note, are.
 */
export function ApplicantSheet({
  applications,
  onStatus,
  onNote,
  onDelete,
  onSetInterview,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const tally = new Map<ApplicationStatus, number>();
    for (const application of applications) {
      tally.set(application.status, (tally.get(application.status) ?? 0) + 1);
    }
    return tally;
  }, [applications]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applications.filter((application) => {
      if (filter !== "all" && application.status !== filter) return false;
      if (!needle) return true;
      // Everything worth searching on, flattened — a phone number is as likely
      // a search as a name when somebody has just rung back.
      return [
        applicantName(application),
        application.phone,
        application.email,
        application.position,
        application.location,
        application.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [applications, query, filter]);

  const exportCsv = () =>
    download(applicationsCsvFilename(), toApplicationsCsv(visible));

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto font-heading text-base font-bold">
          Applications
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {applications.length === 0
              ? "none yet"
              : `${applications.length} total · ${counts.get("new") ?? 0} new`}
          </span>
        </h2>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="applicant-search" className="sr-only">
            Search applications
          </label>
          <input
            id="applicant-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, phone, role…"
            className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <label htmlFor="applicant-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="applicant-filter"
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as ApplicationStatus | "all")
          }
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">All statuses</option>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]} ({counts.get(status) ?? 0})
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={visible.length === 0}
          title="Download what's shown as a spreadsheet"
        >
          <Download data-icon="inline-start" />
          Export
        </Button>
      </header>

      {applications.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <Inbox className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No applications yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Everyone who applies at <code className="font-mono">/careers/apply</code> shows up
            here on their own — there is nothing to type in.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing matches that search.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="w-8 py-2 pl-4" />
                <th scope="col" className="py-2 pr-3 font-semibold">Applied</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Phone</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Position</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Location</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Availability</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
              </tr>
            </thead>

            <tbody>
              {visible.map((application) => {
                const open = openId === application.id;
                const age = formatAge(application.submittedAt);

                return (
                  <ApplicantRow
                    key={application.id}
                    application={application}
                    open={open}
                    age={age}
                    onToggle={() => setOpenId(open ? null : application.id)}
                    onStatus={onStatus}
                    onNote={onNote}
                    onDelete={onDelete}
                    onSetInterview={onSetInterview}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApplicantRow({
  application,
  open,
  age,
  onToggle,
  onStatus,
  onNote,
  onDelete,
  onSetInterview,
}: {
  application: Application;
  open: boolean;
  age: string | null;
  onToggle: () => void;
} & Pick<Props, "onStatus" | "onNote" | "onDelete" | "onSetInterview">) {
  // The note is typed here and saved on blur, so the row isn't writing to the
  // database on every keystroke.
  const [note, setNote] = useState(application.note);
  const [confirming, setConfirming] = useState(false);

  const name = applicantName(application);

  return (
    <>
      <tr
        className={`border-b border-border/60 transition-colors ${open ? "bg-muted/60" : "hover:bg-muted/40"}`}
      >
        <td className="py-2 pl-4">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Hide ${name}'s answers` : `Show ${name}'s answers`}
          >
            <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </td>

        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
          {age ?? formatSubmitted(application.submittedAt)}
        </td>

        <td className="py-2 pr-3 font-semibold">{name}</td>

        <td className="py-2 pr-3 whitespace-nowrap">
          {application.phone ? (
            <a href={telHref(application.phone)} className="text-brand hover:underline">
              {formatPhone(application.phone)}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        <td className="py-2 pr-3">{application.position || "—"}</td>
        <td className="py-2 pr-3">{application.location || "—"}</td>
        <td className="py-2 pr-3">{application.availability || "—"}</td>

        <td className="py-2 pr-4">
          <label htmlFor={`status-${application.id}`} className="sr-only">
            Status for {name}
          </label>
          <select
            id={`status-${application.id}`}
            value={application.status}
            onChange={(event) =>
              onStatus(application.id, event.target.value as ApplicationStatus)
            }
            className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-border bg-muted/60">
          <td colSpan={8} className="px-4 py-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Submitted" value={formatSubmitted(application.submittedAt)} />
              <Detail label="Email" value={application.email} />
              <Detail label="Age" value={application.age} />
              <Detail label="Authorized to work in the U.S." value={application.workAuthorized} />
              <Detail label="Employment preference" value={application.employmentType} />
              <Detail label="Worked food service before" value={application.foodService} />
              <Detail label="Reliable transportation" value={application.transportation} />
              <Detail label="Availability" value={application.availability} />
            </dl>

            {application.experience && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground">Experience</p>
                <p className="mt-1 rounded-lg border border-border bg-background p-3 text-sm whitespace-pre-wrap">
                  {application.experience}
                </p>
              </div>
            )}

            <div className="mt-4">
              <label
                htmlFor={`note-${application.id}`}
                className="text-xs font-semibold text-muted-foreground"
              >
                Your notes
              </label>
              <textarea
                id={`note-${application.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => {
                  if (note !== application.note) onNote(application.id, note);
                }}
                rows={2}
                placeholder="Called Tuesday, left a voicemail…"
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onSetInterview(application)}>
                <CalendarPlus data-icon="inline-start" />
                Set an interview
              </Button>

              {confirming ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    Delete {name}&apos;s application for good?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setConfirming(false);
                      onDelete(application);
                    }}
                  >
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    <X data-icon="inline-start" />
                    Keep
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
