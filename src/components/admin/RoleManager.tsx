"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_COLOR_CLASSES } from "@/lib/role-colors";
import { ROLE_COLORS, ROLE_NAME_MAX_LENGTH, type RoleColor, type ShiftRole } from "@/lib/schedule";
import { FIELD_CLASS } from "./field";

type Props = {
  roles: ShiftRole[];
  /** Resolve to an error to show, or `null` once saved. */
  onAdd: (name: string, color: RoleColor) => Promise<string | null>;
  onUpdate: (id: string, name: string, color: RoleColor) => Promise<string | null>;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** The row of colour dots a role is painted with. */
function ColorSwatches({
  value,
  onChange,
  label,
}: {
  value: RoleColor;
  onChange: (color: RoleColor) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {ROLE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={ROLE_COLOR_CLASSES[color].label}
          title={ROLE_COLOR_CLASSES[color].label}
          onClick={() => onChange(color)}
          className={`flex size-6 items-center justify-center rounded-full ${
            ROLE_COLOR_CLASSES[color].dot
          } ${value === color ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
        >
          {value === color && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

/** One role: shown as a label, or as a small form while it is being edited. */
function RoleRow({
  role,
  onUpdate,
  onDelete,
}: {
  role: ShiftRole;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState<RoleColor>(role.color);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setEditing(false);
    setName(role.name);
    setColor(role.color);
    setError(null);
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    setSaving(true);
    const problem = await onUpdate(role.id, name, color);
    setSaving(false);
    if (problem) {
      setError(problem);
      return;
    }
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <span
          className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-bold ${
            ROLE_COLOR_CLASSES[role.color].pill
          }`}
        >
          {role.name}
        </span>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${role.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${role.name}`}
            onClick={() => {
              if (
                confirm(
                  `Delete the role "${role.name}"?\n\n` +
                    "It will be taken off every shift that has it.",
                )
              ) {
                onDelete(role.id);
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg bg-muted/60 p-2.5 my-1">
      <input
        value={name}
        autoFocus
        aria-label="Role name"
        aria-invalid={error ? true : undefined}
        maxLength={ROLE_NAME_MAX_LENGTH}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            cancel();
          }
        }}
        className={FIELD_CLASS}
      />
      <ColorSwatches value={color} onChange={setColor} label={`Colour for ${role.name}`} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </li>
  );
}

/**
 * Create, rename, recolour and delete the roles a shift can be given. A modal
 * rather than a sidebar panel: roles are set up once and rarely touched, and the
 * sidebar is already busy with people and time off.
 */
export function RoleManager({ roles, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<RoleColor>(ROLE_COLORS[roles.length % ROLE_COLORS.length]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const add = async () => {
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    setAdding(true);
    const problem = await onAdd(name, color);
    setAdding(false);
    if (problem) {
      setError(problem);
      return;
    }
    setName("");
    setError(null);
    // Next role reaches for the next colour, so a quick run of adds doesn't
    // leave everything blue.
    setColor((current) => ROLE_COLORS[(ROLE_COLORS.indexOf(current) + 1) % ROLE_COLORS.length]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onPointerDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-manager-title"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="flex-1">
            <h2 id="role-manager-title" className="font-heading text-base font-bold">
              Shift roles
            </h2>
            <p className="text-xs text-muted-foreground">
              Click a name on the schedule to give that shift a role.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="overflow-y-auto px-4">
          {roles.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No roles yet. Add one below — for example Shift lead, Opener or Trainee.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {roles.map((role) => (
                <RoleRow key={role.id} role={role} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </div>

        <footer className="space-y-2 border-t border-border px-4 py-3">
          <label htmlFor="new-role-name" className="block text-xs font-semibold text-muted-foreground">
            New role
          </label>
          <div className="flex gap-2">
            <input
              id="new-role-name"
              value={name}
              placeholder="e.g. Shift lead"
              maxLength={ROLE_NAME_MAX_LENGTH}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void add();
                }
              }}
              className={FIELD_CLASS}
            />
            <Button onClick={() => void add()} disabled={adding}>
              {adding ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Add
            </Button>
          </div>
          <ColorSwatches value={color} onChange={setColor} label="Colour for the new role" />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
