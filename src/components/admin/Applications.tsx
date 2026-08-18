"use client";

import { useCallback, useState } from "react";
import { CalendarClock, ClipboardList, FileText, LogOut, Menu, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import {
  createInterviewAction,
  createSnippetAction,
  deleteApplicationAction,
  deleteInterviewAction,
  deleteSnippetAction,
  reloadApplicationsAction,
  reorderSnippetsAction,
  setNoteAction,
  setStatusAction,
  updateInterviewAction,
  updateSnippetAction,
} from "@/app/admin/applications/actions";
import {
  applicantName,
  compareInterviews,
  moveSnippet,
  splitInterviews,
  type Application,
  type ApplicationStatus,
  type Interview,
  type InterviewDraft,
  type TextSnippet,
} from "@/lib/applications";
import { AdminDrawer } from "./AdminDrawer";
import { ApplicantSheet } from "./ApplicantSheet";
import { InterviewPanel } from "./InterviewPanel";
import { TextInfoPanel } from "./TextInfoPanel";

export type ApplicationsProps = {
  applications: Application[];
  interviews: Interview[];
  snippets: TextSnippet[];
};

type Section = "applications" | "interviews" | "text";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "applications", label: "Applications", icon: <ClipboardList className="size-4" /> },
  { id: "interviews", label: "Set interview dates", icon: <CalendarClock className="size-4" /> },
  { id: "text", label: "Text info", icon: <FileText className="size-4" /> },
];

/**
 * The hiring page: three sections that share nothing but a screen.
 *
 * They are tabs rather than one long scroll because the applications table is
 * as wide as the window on its own — stacked, the other two would live below
 * the fold forever. The counts on the tabs are the part that would be lost by
 * hiding them, so they are on the tabs.
 *
 * Edits are applied locally first and saved behind the scenes, the same way the
 * truck order works. When a save fails the banner says so and the page is
 * re-read, so what is on screen is never quietly out of step with what's stored.
 */
export function Applications({
  applications: initialApplications,
  interviews: initialInterviews,
  snippets: initialSnippets,
}: ApplicationsProps) {
  const [applications, setApplications] = useState(initialApplications);
  const [interviews, setInterviews] = useState(initialInterviews);
  const [snippets, setSnippets] = useState(initialSnippets);

  const [section, setSection] = useState<Section>("applications");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * An applicant on their way to the interview form. A fresh object each time,
   * which is what tells the form a second click is a new instruction.
   */
  const [prefill, setPrefill] = useState<InterviewDraft | null>(null);

  const reload = useCallback(async () => {
    const fresh = await reloadApplicationsAction();
    setApplications(fresh.applications);
    setInterviews(fresh.interviews);
    setSnippets(fresh.snippets);
  }, []);

  /**
   * Run a save. On failure the optimistic edit is thrown away and the page is
   * re-read, so a rejected change never lingers on screen looking saved.
   */
  const save = useCallback(
    async (description: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (cause) {
        console.error(`[applications] Could not ${description}:`, cause);
        setError(`Couldn't ${description}. That change wasn't saved.`);
        try {
          await reload();
        } catch (reloadCause) {
          console.error("[applications] Reload after a failed save also failed:", reloadCause);
          setError(
            `Couldn't ${description}, and reloading failed too. ` +
              "Check your connection and refresh the page.",
          );
        }
      }
    },
    [reload],
  );

  /* --------------------------------------------------------- applications */

  const patchApplication = (id: string, patch: Partial<Application>) =>
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, ...patch } : application,
      ),
    );

  const setStatus = (id: string, status: ApplicationStatus) => {
    const previous = applications.find((application) => application.id === id)?.status;
    patchApplication(id, { status });
    void save("update that status", async () => {
      try {
        await setStatusAction(id, status);
      } catch (cause) {
        if (previous) patchApplication(id, { status: previous });
        throw cause;
      }
    });
  };

  const setNote = (id: string, note: string) => {
    patchApplication(id, { note });
    void save("save that note", () => setNoteAction(id, note));
  };

  const removeApplication = (application: Application) => {
    setApplications((current) => current.filter((row) => row.id !== application.id));
    // An interview booked from this application keeps its own row — the
    // database nulls the link rather than deleting it — so it is patched here
    // instead of being dropped.
    setInterviews((current) =>
      current.map((interview) =>
        interview.applicationId === application.id
          ? { ...interview, applicationId: null }
          : interview,
      ),
    );
    void save("delete that application", () => deleteApplicationAction(application.id));
  };

  /** Send an applicant to the interview form, and follow them over there. */
  const startInterview = (application: Application) => {
    setPrefill({
      applicationId: application.id,
      name: applicantName(application),
      phone: application.phone,
      date: "",
      time: "",
      note: application.position ? `Applied for ${application.position}` : "",
    });
    setSection("interviews");
  };

  /* ------------------------------------------------------------ interviews */

  const createInterview = async (draft: InterviewDraft) => {
    // Awaited rather than optimistic: the row needs the id the database mints,
    // and one interview at a time is not a typing speed worth optimising for.
    const created = await createInterviewAction(draft);
    setInterviews((current) => [...current, created].sort(compareInterviews));
    // Booking one is the moment the application stops being just "contacted".
    if (draft.applicationId) {
      const id = draft.applicationId;
      patchApplication(id, { status: "interview" });
      void save("update that status", () => setStatusAction(id, "interview"));
    }
  };

  const updateInterview = async (id: string, draft: InterviewDraft) => {
    const updated = await updateInterviewAction(id, draft);
    setInterviews((current) =>
      current.map((interview) => (interview.id === id ? updated : interview)).sort(compareInterviews),
    );
  };

  const removeInterview = (interview: Interview) => {
    setInterviews((current) => current.filter((row) => row.id !== interview.id));
    void save("delete that interview", () => deleteInterviewAction(interview.id));
  };

  /* --------------------------------------------------------- text snippets */

  const createSnippet = async (title: string, body: string) => {
    const created = await createSnippetAction(title, body);
    setSnippets((current) => [...current, created]);
  };

  const updateSnippet = async (id: string, title: string, body: string) => {
    const updated = await updateSnippetAction(id, title, body);
    setSnippets((current) =>
      current.map((snippet) => (snippet.id === id ? updated : snippet)),
    );
  };

  const removeSnippet = (snippet: TextSnippet) => {
    setSnippets((current) => current.filter((row) => row.id !== snippet.id));
    void save("delete that text piece", () => deleteSnippetAction(snippet.id));
  };

  const moveOneSnippet = (id: string, direction: -1 | 1) => {
    const reordered = moveSnippet(snippets, id, direction);
    setSnippets(reordered);
    void save("save the new order", () =>
      reorderSnippetsAction(
        reordered.map(({ id: snippetId, sortOrder }) => ({ id: snippetId, sortOrder })),
      ),
    );
  };

  /* ------------------------------------------------------------------ view */

  const newCount = applications.filter((application) => application.status === "new").length;
  const upcomingCount = splitInterviews(interviews).upcoming.length;
  const counts: Record<Section, number> = {
    applications: newCount,
    interviews: upcomingCount,
    text: snippets.length,
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <ClipboardList className="size-4 text-brand" />
              Applications
            </h1>
            <p className="text-xs text-muted-foreground">
              {newCount > 0
                ? `${newCount} new application${newCount === 1 ? "" : "s"} to look at`
                : "Everyone who's applied, and who you're seeing"}
            </p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>

        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {SECTIONS.map((tab) => {
            const active = tab.id === section;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  active ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.icon}
                {tab.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      active ? "bg-brand/15" : "bg-muted-foreground/15"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <AdminDrawer open={menuOpen} view="applications" onOpenChange={setMenuOpen} />

      {/*
        All three stay mounted and the inactive ones are hidden, rather than
        being unmounted with the tab. A half-typed interview or a search you had
        narrowed down survives a look at another section, which is the whole
        reason to have them on one page instead of three.
      */}
      <div className="flex-1 p-4 sm:px-6">
        <div className={section === "applications" ? "" : "hidden"}>
          <ApplicantSheet
            applications={applications}
            onStatus={setStatus}
            onNote={setNote}
            onDelete={removeApplication}
            onSetInterview={startInterview}
          />
        </div>

        <div className={section === "interviews" ? "" : "hidden"}>
          <InterviewPanel
            interviews={interviews}
            prefill={prefill}
            onCreate={createInterview}
            onUpdate={updateInterview}
            onDelete={removeInterview}
          />
        </div>

        <div className={section === "text" ? "" : "hidden"}>
          <TextInfoPanel
            snippets={snippets}
            onCreate={createSnippet}
            onUpdate={updateSnippet}
            onDelete={removeSnippet}
            onMove={moveOneSnippet}
          />
        </div>
      </div>
    </div>
  );
}
