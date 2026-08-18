"use client";

import { useState } from "react";
import { CalendarClock, Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhone, telHref } from "@/lib/format";
import {
  formatInterviewDate,
  formatTime,
  isValidTime,
  splitInterviews,
  todayISO,
  type Interview,
  type InterviewDraft,
} from "@/lib/applications";

/** A blank interview, dated today because that is the common case. */
function blankDraft(): InterviewDraft {
  return { applicationId: null, name: "", phone: "", date: todayISO(), time: "", note: "" };
}

type Props = {
  interviews: Interview[];
  /**
   * Set from the applications section when an interview is started from a row,
   * so the form opens already filled in. A fresh object each time, which is how
   * the form knows a second click on the same applicant is a new instruction.
   */
  prefill: InterviewDraft | null;
  onCreate: (draft: InterviewDraft) => Promise<void>;
  onUpdate: (id: string, draft: InterviewDraft) => Promise<void>;
  onDelete: (interview: Interview) => void;
};

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive";

/**
 * The interviews section: the date, time, name and number of everyone booked in.
 *
 * It is a diary, not a calendar — a handful of interviews at a time, read as a
 * list of what is coming. Everything that has already happened is kept, newest
 * first, under its own heading, because "who did we see last month" is a real
 * question and there is no other record of it.
 */
export function InterviewPanel({ interviews, prefill, onCreate, onUpdate, onDelete }: Props) {
  const [draft, setDraft] = useState<InterviewDraft>(() => prefill ?? blankDraft());
  /** The interview being edited, or null when the form is adding a new one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  /**
   * An applicant sent over from the applications section drops straight into
   * the form, which then behaves like any other new interview.
   *
   * Done during render rather than in an effect, which is what React asks for
   * when state has to follow a prop: the component re-runs with the new draft
   * before anything is painted, so the form never flashes the old one first.
   * The comparison is by identity — every "Set an interview" builds a fresh
   * object, so clicking the same person twice fills the form twice.
   */
  const [applied, setApplied] = useState<InterviewDraft | null>(prefill);
  if (prefill !== applied) {
    setApplied(prefill);
    if (prefill) {
      setDraft(prefill);
      setEditingId(null);
      setError(null);
    }
  }

  const { upcoming, past } = splitInterviews(interviews);

  const set = <K extends keyof InterviewDraft>(key: K, value: InterviewDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(blankDraft());
    setEditingId(null);
    setError(null);
  };

  const startEdit = (interview: Interview) => {
    setEditingId(interview.id);
    setError(null);
    setDraft({
      applicationId: interview.applicationId,
      name: interview.name,
      phone: interview.phone,
      date: interview.date,
      time: interview.time,
      note: interview.note,
    });
  };

  const submit = async () => {
    const trimmed: InterviewDraft = {
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      note: draft.note.trim(),
    };
    if (!trimmed.name) return setError("Whose interview is it? A name is needed.");
    if (!trimmed.date) return setError("Pick a date.");
    if (!isValidTime(trimmed.time)) return setError("That time doesn't look right.");

    setBusy(true);
    setError(null);
    try {
      if (editingId) await onUpdate(editingId, trimmed);
      else await onCreate(trimmed);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that interview.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-base font-bold">
          Set interview dates
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {upcoming.length === 0
              ? "nothing booked"
              : `${upcoming.length} coming up`}
          </span>
        </h2>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"
        >
          <p className="font-heading text-sm font-bold">
            {editingId ? "Edit interview" : "New interview"}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="interview-date" className="text-xs font-semibold">
                Date
              </label>
              <input
                id="interview-date"
                type="date"
                value={draft.date}
                onChange={(event) => set("date", event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="interview-time" className="text-xs font-semibold">
                Time
              </label>
              <input
                id="interview-time"
                type="time"
                value={draft.time}
                onChange={(event) => set("time", event.target.value)}
                aria-invalid={!isValidTime(draft.time)}
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <label htmlFor="interview-name" className="text-xs font-semibold">
              Name
            </label>
            <input
              id="interview-name"
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Who you're meeting"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="interview-phone" className="text-xs font-semibold">
              Phone
            </label>
            <input
              id="interview-phone"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder="(931) 555-0142"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="interview-note" className="text-xs font-semibold">
              Note <span className="font-normal text-muted-foreground">optional</span>
            </label>
            <textarea
              id="interview-note"
              rows={2}
              value={draft.note}
              onChange={(event) => set("note", event.target.value)}
              placeholder="Applying for kitchen, confirmed by text"
              className={FIELD}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {editingId ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              {busy ? "Saving…" : editingId ? "Save changes" : "Add interview"}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <X data-icon="inline-start" />
                Cancel
              </Button>
            )}
          </div>
        </form>

        <div className="min-w-0">
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <CalendarClock className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Nothing booked</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add one on the left, or start one from an application.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {upcoming.map((interview) => (
                <InterviewRow
                  key={interview.id}
                  interview={interview}
                  editing={editingId === interview.id}
                  onEdit={() => startEdit(interview)}
                  onDelete={() => onDelete(interview)}
                />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPast((open) => !open)}
                aria-expanded={showPast}
              >
                {showPast ? "Hide" : "Show"} {past.length} past interview
                {past.length === 1 ? "" : "s"}
              </Button>

              {showPast && (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border opacity-70">
                  {past.map((interview) => (
                    <InterviewRow
                      key={interview.id}
                      interview={interview}
                      editing={editingId === interview.id}
                      onEdit={() => startEdit(interview)}
                      onDelete={() => onDelete(interview)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InterviewRow({
  interview,
  editing,
  onEdit,
  onDelete,
}: {
  interview: Interview;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const time = formatTime(interview.time);

  return (
    <li className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${editing ? "bg-brand/5" : ""}`}>
      <div className="w-28 shrink-0">
        <p className="text-sm font-semibold">{formatInterviewDate(interview.date)}</p>
        <p className={`text-xs ${time ? "text-muted-foreground" : "text-amber-700"}`}>
          {time || "no time set"}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{interview.name}</p>
        {interview.note && (
          <p className="truncate text-xs text-muted-foreground">{interview.note}</p>
        )}
      </div>

      {interview.phone && (
        <a
          href={telHref(interview.phone)}
          className="text-sm whitespace-nowrap text-brand hover:underline"
        >
          {formatPhone(interview.phone)}
        </a>
      )}

      {confirming ? (
        <div className="flex items-center gap-1.5">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Keep" onClick={() => setConfirming(false)}>
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${interview.name}'s interview`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${interview.name}'s interview`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
