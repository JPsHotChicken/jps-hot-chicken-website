"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TextSnippet } from "@/lib/applications";

type Props = {
  snippets: TextSnippet[];
  onCreate: (title: string, body: string) => Promise<void>;
  onUpdate: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (snippet: TextSnippet) => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The text info section: the paragraphs that get sent to everybody.
 *
 * The interview invite, the directions to the store, the "thanks but not this
 * time" — written once, kept here, and copied out when they're needed. **Copy**
 * is what the section is for; everything else is just keeping the list tidy.
 */
export function TextInfoPanel({ snippets, onCreate, onUpdate, onDelete, onMove }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto font-heading text-base font-bold">
          Text info
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {snippets.length === 0
              ? "nothing saved"
              : `${snippets.length} piece${snippets.length === 1 ? "" : "s"}`}
          </span>
        </h2>

        <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus data-icon="inline-start" />
          New piece
        </Button>
      </header>

      <div className="space-y-3 p-4">
        {adding && (
          <SnippetEditor
            title=""
            body=""
            onSave={async (title, body) => {
              await onCreate(title, body);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {snippets.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">No saved text yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Anything you find yourself typing more than once — the interview invite, where to
              park, what to bring — belongs here.
            </p>
          </div>
        ) : (
          snippets.map((snippet, index) => (
            <SnippetCard
              key={snippet.id}
              snippet={snippet}
              first={index === 0}
              last={index === snippets.length - 1}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </section>
  );
}

function SnippetCard({
  snippet,
  first,
  last,
  onUpdate,
  onDelete,
  onMove,
}: {
  snippet: TextSnippet;
  first: boolean;
  last: boolean;
} & Pick<Props, "onUpdate" | "onDelete" | "onMove">) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const label = snippet.title || "Untitled";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the text is on screen either way, so
      // there is nothing useful to say about it.
    }
  };

  if (editing) {
    return (
      <SnippetEditor
        title={snippet.title}
        body={snippet.body}
        onSave={async (title, body) => {
          await onUpdate(snippet.id, title, body);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <h3 className="mr-auto min-w-0 truncate font-semibold">{label}</h3>

        <Button variant="outline" size="sm" onClick={copy}>
          <Copy data-icon="inline-start" />
          {copied ? "Copied" : "Copy"}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${label} up`}
          disabled={first}
          onClick={() => onMove(snippet.id, -1)}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${label} down`}
          disabled={last}
          onClick={() => onMove(snippet.id, 1)}
        >
          <ChevronDown />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${label}`}
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>

        {confirming ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false);
                onDelete(snippet);
              }}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Keep it"
              onClick={() => setConfirming(false)}
            >
              <X />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${label}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        )}
      </header>

      <p className="px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">{snippet.body}</p>
    </article>
  );
}

function SnippetEditor({
  title: initialTitle,
  body: initialBody,
  onSave,
  onCancel,
}: {
  title: string;
  body: string;
  onSave: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim()) return setError("There's no text to save.");
    setBusy(true);
    setError(null);
    try {
      await onSave(title.trim(), body.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"
    >
      <div>
        <label htmlFor="snippet-title" className="text-xs font-semibold">
          Title <span className="font-normal text-muted-foreground">what it&apos;s for</span>
        </label>
        <input
          id="snippet-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Interview invite"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="snippet-body" className="text-xs font-semibold">
          Text
        </label>
        <textarea
          id="snippet-body"
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Hey! Thanks for applying at JP's Hot Chicken. We'd love to meet you…"
          className={`${FIELD} leading-relaxed`}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X data-icon="inline-start" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
