"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  FileUp,
  LoaderCircle,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/admin/field";
import { TagToggles } from "@/components/admin/TagToggles";
import {
  ALLERGENS,
  FLAVOR_TAGS,
  ITEM_SCOPES,
  ITEM_SCOPE_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  MAX_INTENSITY,
  STORAGE_ZONES,
  STORAGE_ZONE_LABELS,
  TEXTURE_TAGS,
  hasGroup,
  nextCode,
  type ItemScope,
  type ItemSheetFields,
  type ItemSheetReading,
  type ItemType,
} from "@/lib/items";
import { createItemAction, type ItemFormInput } from "@/app/admin/items/actions";

const SPEC_SHEET_URL = "/api/admin/items/spec-sheet";

/** The categories already in use, offered to every category box on the page. */
const CATEGORY_LIST_ID = "item-categories";

/** Matches the route's own cap, so an oversized file fails before it is sent. */
const MAX_BYTES = 4 * 1024 * 1024;

/** A blank record, before the type-specific fields are filled in. */
const EMPTY: Omit<ItemFormInput, "code" | "type" | "internalName" | "category" | "scope"> = {
  customerName: "",
  aliases: [],
  subcategory: "",
  status: "active",
  purchaseUnit: "",
  packSize: "",
  purchaseCost: null,
  parLevel: null,
  reorderPoint: null,
  stockUnit: "",
  portionUnit: "",
  stockPerPurchaseUnit: null,
  portionsPerStockUnit: null,
  yieldFactor: "1",
  batchYieldQuantity: "1",
  recipeUrl: "",
  menuPrice: null,
  allergens: [],
  flavorTags: [],
  textureTags: [],
  intensity: 3,
  storageZone: "none",
  storageTemp: "",
  shelfLifeDays: "",
  dateLabelRule: "",
  photoUrl: "",
  notes: "",
  availableEverywhere: true,
};

/** A number a form holds as text: empty box, not zero, when there is nothing. */
const asText = (value: number | null) => (value === null ? "" : String(value));

/** What was read off one file, as the form holds it. */
function toFormInput(fields: ItemSheetFields, code: string): ItemFormInput {
  return {
    ...EMPTY,
    code,
    type: fields.type,
    internalName: fields.internalName,
    customerName: fields.customerName,
    aliases: fields.aliases,
    category: fields.category,
    subcategory: fields.subcategory,
    scope: "core",
    purchaseUnit: fields.purchaseUnit,
    packSize: fields.packSize,
    purchaseCost: asText(fields.purchaseCost),
    stockUnit: fields.stockUnit,
    portionUnit: fields.portionUnit,
    stockPerPurchaseUnit: asText(fields.stockPerPurchaseUnit),
    portionsPerStockUnit: asText(fields.portionsPerStockUnit),
    allergens: fields.allergens,
    flavorTags: fields.flavorTags,
    textureTags: fields.textureTags,
    intensity: fields.intensity,
    storageZone: fields.storageZone,
    storageTemp: fields.storageTemp,
    shelfLifeDays: asText(fields.shelfLifeDays),
    dateLabelRule: fields.dateLabelRule,
    notes: fields.notes,
  };
}

/** One file on its way to becoming an item. */
type Draft = {
  key: number;
  fileName: string;
  status: "reading" | "ready" | "creating" | "done" | "failed";
  form: ItemFormInput;
  /** "May contain" warnings off the sheet — shown, never saved. */
  crossContact: string;
  error: string | null;
  /** The code it was created under, once it has been. */
  created: string | null;
  /** Somebody typed their own code, so it stops following the type. */
  customCode: boolean;
};

/** Reads one file into item fields, or says what went wrong. */
async function postSheet(file: File): Promise<ItemSheetReading> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(SPEC_SHEET_URL, { method: "POST", body });
  // A platform timeout answers with a page, not JSON.
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.fields) {
    throw new Error(result.error ?? "That file couldn't be read. Try again.");
  }
  return result as ItemSheetReading;
}

let nextKey = 0;

/**
 * Starting a new record — by hand, or from the supplier's paperwork.
 *
 * By hand asks for identity only; everything else is filled in on the record,
 * where the fields on show are the ones its type actually calls for.
 *
 * From paperwork, each file is read into a whole record — name, pack size,
 * conversions, allergens, storage, how it tastes — and waits here for the owner
 * to check it. Several files are read one after another rather than at once:
 * they each cost a model call, and a queue that arrives in order is easier to
 * follow than five spinners. Nothing is saved until Create is pressed.
 */
export function NewItemForm({
  existingCodes,
  categories,
}: {
  existingCodes: string[];
  categories: string[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );

  /** The next free code, counting the ones the other drafts have claimed. */
  const codeAmong = (type: ItemType, drafts: Draft[], ignoreKey?: number) =>
    nextCode(type, [
      ...existingCodes,
      ...drafts.filter((draft) => draft.key !== ignoreKey).map((draft) => draft.form.code),
    ]);

  const read = async (files: File[]) => {
    setError(null);

    const tooBig = files.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setError(
        `${tooBig.name} is ${(tooBig.size / 1024 / 1024).toFixed(1)} MB — the limit is 4 MB a file.`,
      );
      return;
    }

    const queued: Draft[] = files.map((file) => ({
      key: nextKey++,
      fileName: file.name,
      status: "reading",
      form: { ...EMPTY, code: "", type: "raw", internalName: "", category: "", scope: "core" },
      crossContact: "",
      error: null,
      created: null,
      customCode: false,
    }));
    setDrafts((current) => [...current, ...queued]);

    setReading(true);
    for (const [index, file] of files.entries()) {
      const { key } = queued[index];
      try {
        const sheet = await postSheet(file);
        setDrafts((current) =>
          current.map((draft) =>
            draft.key === key
              ? {
                  ...draft,
                  status: "ready",
                  form: toFormInput(sheet.fields, codeAmong(sheet.fields.type, current, key)),
                  crossContact: sheet.crossContact,
                }
              : draft,
          ),
        );
      } catch (cause) {
        update(key, {
          status: "failed",
          error: cause instanceof Error ? cause.message : "That file couldn't be read.",
        });
      }
    }
    setReading(false);
  };

  const create = async (draft: Draft) => {
    update(draft.key, { status: "creating", error: null });
    try {
      const code = await createItemAction(draft.form);
      update(draft.key, { status: "done", created: code });
      router.refresh();
    } catch (cause) {
      update(draft.key, {
        status: "ready",
        error: cause instanceof Error ? cause.message : "Couldn't create that item.",
      });
    }
  };

  const ready = drafts.filter((draft) => draft.status === "ready");
  const busy = reading || drafts.some((draft) => draft.status === "creating");

  return (
    <div className="space-y-4">
      {/* Every category box on the page shares this one list, since a repeated
          id would leave all but the first of them pointing at the wrong list. */}
      <datalist id={CATEGORY_LIST_ID}>
        {categories.map((existing) => (
          <option key={existing} value={existing} />
        ))}
      </datalist>

      {/* ------------------------------------------------- from a spec sheet */}
      <section className="rounded-xl border border-dashed border-border bg-background p-4 shadow-sm">
        <h2 className="font-heading text-base font-bold">Start from the paperwork</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A supplier&rsquo;s spec sheet, a case label, or a photo of one. PDF, JPEG or PNG, up to
          4&nbsp;MB each — pick several and they&rsquo;ll be read one after another.
        </p>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Spec sheets, labels or photos"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length > 0) void read(files);
          }}
        />
        <Button
          variant="outline"
          size="lg"
          className="mt-3"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {reading ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <FileUp data-icon="inline-start" />
          )}
          {reading ? "Reading…" : "Choose files"}
        </Button>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {drafts.map((draft) => (
        <DraftCard
          key={draft.key}
          draft={draft}
          onChange={(form) => update(draft.key, { form })}
          onRetypeCode={(type) =>
            setDrafts((current) =>
              current.map((entry) =>
                entry.key === draft.key
                  ? {
                      ...entry,
                      form: {
                        ...entry.form,
                        type,
                        code: entry.customCode
                          ? entry.form.code
                          : codeAmong(type, current, entry.key),
                      },
                    }
                  : entry,
              ),
            )
          }
          onOwnCode={(code) =>
            update(draft.key, { customCode: true, form: { ...draft.form, code } })
          }
          onCreate={() => create(draft)}
          onDiscard={() =>
            setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
          }
        />
      ))}

      {ready.length > 1 && (
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            for (const draft of ready) await create(draft);
          }}
        >
          <Check data-icon="inline-start" />
          Create all {ready.length}
        </Button>
      )}

      {/* --------------------------------------------------------- by hand */}
      {drafts.length === 0 && <ByHand existingCodes={existingCodes} />}
    </div>
  );
}

/* ------------------------------------------------------------------ by hand */

/**
 * The plain way in: a code, a name, what layer it belongs to. Everything else
 * is filled in on the record itself.
 */
function ByHand({ existingCodes }: { existingCodes: string[] }) {
  const router = useRouter();
  const [type, setType] = useState<ItemType>("raw");
  // Null until somebody types their own code, at which point it is theirs and
  // stops following the type. Derived rather than synced, so the box can never
  // disagree with the type selected above it.
  const [customCode, setCustomCode] = useState<string | null>(null);
  const code = customCode ?? nextCode(type, existingCodes);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<ItemScope>("core");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const created = await createItemAction({
          ...EMPTY,
          code,
          type,
          internalName: name,
          category,
          scope,
        });
        router.push(`/admin/items/${encodeURIComponent(created)}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't create that item.");
      }
    });
  };

  return (
    <>
      <section className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
        <h2 className="font-heading text-base font-bold">Or enter it by hand</h2>

        <label className="block">
          <span className={LABEL_CLASS}>What layer is it?</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ItemType)}
            className={`${FIELD_CLASS} mt-1`}
          >
            {ITEM_TYPES.map((option) => (
              <option key={option} value={option}>
                {ITEM_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Item code</span>
          <input
            value={code}
            onChange={(event) => setCustomCode(event.target.value)}
            className={`${FIELD_CLASS} mt-1 font-mono`}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Permanent. It is never reused or renumbered, because every other document points at it.
          </span>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Internal name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How the crew refers to it"
            className={`${FIELD_CLASS} mt-1`}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Category</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            list={CATEGORY_LIST_ID}
            placeholder="Protein, Dairy, Sandwiches…"
            className={`${FIELD_CLASS} mt-1`}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Scope</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as ItemScope)}
            className={`${FIELD_CLASS} mt-1`}
          >
            {ITEM_SCOPES.map((option) => (
              <option key={option} value={option}>
                {ITEM_SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" disabled={pending || !name.trim()} onClick={submit}>
        <Plus data-icon="inline-start" />
        {pending ? "Creating…" : "Create item"}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------ one draft */

/**
 * What was read off one file, laid out to be checked.
 *
 * Every field is editable here rather than only on the record afterwards: the
 * point at which somebody is looking at the sheet is the point at which a wrong
 * conversion or a missed allergen is cheapest to fix.
 */
function DraftCard({
  draft,
  onChange,
  onRetypeCode,
  onOwnCode,
  onCreate,
  onDiscard,
}: {
  draft: Draft;
  onChange: (form: ItemFormInput) => void;
  onRetypeCode: (type: ItemType) => void;
  onOwnCode: (code: string) => void;
  onCreate: () => void;
  onDiscard: () => void;
}) {
  const { form } = draft;
  const set = <K extends keyof ItemFormInput>(key: K, value: ItemFormInput[K]) =>
    onChange({ ...form, [key]: value });

  const type = form.type as ItemType;
  const shows = (group: Parameters<typeof hasGroup>[1]) => hasGroup(type, group);

  if (draft.status === "reading" || draft.status === "creating") {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-sm">
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{draft.fileName}</span>
        <span className="text-xs text-muted-foreground">
          {draft.status === "reading" ? "Reading…" : "Creating…"}
        </span>
      </section>
    );
  }

  if (draft.status === "done") {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-sm">
        <Check className="size-4 text-brand" />
        <span className="min-w-0 flex-1 truncate">{form.internalName}</span>
        <Link
          href={`/admin/items/${encodeURIComponent(draft.created ?? "")}`}
          className="font-mono text-xs text-brand hover:underline"
        >
          {draft.created}
        </Link>
      </section>
    );
  }

  if (draft.status === "failed") {
    return (
      <section
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{draft.fileName}</span> — {draft.error}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Discard" onClick={onDiscard}>
          <X />
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto min-w-0">
          <h2 className="truncate font-heading text-base font-bold">
            {form.internalName || draft.fileName}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Read from {draft.fileName} · check it before creating
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Discard this one" onClick={onDiscard}>
          <X />
        </Button>
      </header>

      <div className="space-y-4 p-4">
        {draft.crossContact && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              The sheet also warns: {draft.crossContact} That isn&rsquo;t saved — the allergen list
              below means what the product contains.
            </span>
          </p>
        )}

        <Grid>
          <Field label="Item code">
            <input
              value={form.code}
              onChange={(event) => onOwnCode(event.target.value)}
              className={`${FIELD_CLASS} font-mono`}
            />
          </Field>
          <Field label="What layer is it?">
            <select
              value={form.type}
              onChange={(event) => onRetypeCode(event.target.value as ItemType)}
              className={FIELD_CLASS}
            >
              {ITEM_TYPES.map((option) => (
                <option key={option} value={option}>
                  {ITEM_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Internal name">
            <input
              value={form.internalName}
              onChange={(event) => set("internalName", event.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Customer-facing name">
            <input
              value={form.customerName}
              onChange={(event) => set("customerName", event.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Category">
            <input
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
              list={CATEGORY_LIST_ID}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Subcategory">
            <input
              value={form.subcategory}
              onChange={(event) => set("subcategory", event.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Aliases" wide>
            <input
              value={form.aliases.join(", ")}
              onChange={(event) =>
                set("aliases", event.target.value.split(",").map((alias) => alias.trim()))
              }
              placeholder="Other names it goes by, comma separated"
              className={FIELD_CLASS}
            />
          </Field>
        </Grid>

        {shows("purchasing") && (
          <Section title="Purchasing">
            <Grid>
              <Field label="Purchase unit">
                <Text value={form.purchaseUnit} onChange={(value) => set("purchaseUnit", value)} />
              </Field>
              <Field label="Pack size">
                <Text value={form.packSize} onChange={(value) => set("packSize", value)} />
              </Field>
              <Field label="Cost per purchase unit">
                <Text
                  value={form.purchaseCost ?? ""}
                  onChange={(value) => set("purchaseCost", value)}
                  placeholder="Only if the sheet says"
                />
              </Field>
            </Grid>
          </Section>
        )}

        {shows("units") && (
          <Section
            title="Units & conversions"
            hint="Everything is counted and costed in the stock unit. Check these against the pack size."
          >
            <Grid>
              <Field label="Stock unit">
                <Text value={form.stockUnit} onChange={(value) => set("stockUnit", value)} />
              </Field>
              <Field label="Stock units per purchase unit">
                <Text
                  value={form.stockPerPurchaseUnit ?? ""}
                  onChange={(value) => set("stockPerPurchaseUnit", value)}
                />
              </Field>
              <Field label="Portion unit">
                <Text value={form.portionUnit} onChange={(value) => set("portionUnit", value)} />
              </Field>
              <Field label="Portions per stock unit">
                <Text
                  value={form.portionsPerStockUnit ?? ""}
                  onChange={(value) => set("portionsPerStockUnit", value)}
                />
              </Field>
            </Grid>
          </Section>
        )}

        {shows("allergens") && (
          <Section
            title="Allergens"
            hint="What the product contains. Tick None once it has been checked and contains nothing."
          >
            <TagToggles
              legend="Contains"
              options={ALLERGENS}
              value={form.allergens}
              onChange={(value) => set("allergens", value)}
              tone="allergen"
            />
          </Section>
        )}

        {shows("taste") && (
          <Section title="Taste & texture" hint="What the menu description generator reads.">
            <div className="space-y-4">
              <fieldset>
                <legend className={LABEL_CLASS}>Intensity</legend>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: MAX_INTENSITY }, (_, index) => index + 1).map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={form.intensity === level}
                      onClick={() => set("intensity", level)}
                      className={`size-8 rounded-lg border text-sm font-semibold tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                        form.intensity === level
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                  <span className="ml-2 self-center text-xs text-muted-foreground">
                    1 barely there · 5 dominates
                  </span>
                </div>
              </fieldset>
              <TagToggles
                legend="Flavor"
                options={FLAVOR_TAGS}
                value={form.flavorTags}
                onChange={(value) => set("flavorTags", value)}
              />
              <TagToggles
                legend="Texture"
                options={TEXTURE_TAGS}
                value={form.textureTags}
                onChange={(value) => set("textureTags", value)}
              />
            </div>
          </Section>
        )}

        {shows("storage") && (
          <Section title="Storage & shelf life">
            <Grid>
              <Field label="Storage zone">
                <select
                  value={form.storageZone}
                  onChange={(event) => set("storageZone", event.target.value)}
                  className={FIELD_CLASS}
                >
                  {STORAGE_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {STORAGE_ZONE_LABELS[zone]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Required temperature">
                <Text value={form.storageTemp} onChange={(value) => set("storageTemp", value)} />
              </Field>
              <Field label="Shelf life (days)">
                <Text
                  value={form.shelfLifeDays ?? ""}
                  onChange={(value) => set("shelfLifeDays", value)}
                />
              </Field>
              <Field label="Date-labelling rule">
                <Text
                  value={form.dateLabelRule}
                  onChange={(value) => set("dateLabelRule", value)}
                />
              </Field>
            </Grid>
          </Section>
        )}

        <Section title="Notes">
          <textarea
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            aria-label="Notes"
            className={FIELD_CLASS}
          />
        </Section>

        {draft.error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {draft.error}
          </p>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!form.internalName.trim()}
          onClick={onCreate}
        >
          <Plus data-icon="inline-start" />
          Create {form.code}
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- pieces */

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={LABEL_CLASS}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="font-heading text-sm font-bold">{title}</h3>
      {hint && <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={FIELD_CLASS}
    />
  );
}
