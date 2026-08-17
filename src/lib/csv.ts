/**
 * Reading and writing CSV, with no opinion about what is in it.
 *
 * This started out inside `truck.ts` for the distributor's exports. The tips
 * page reads a time clock export the same way, so it lives here now — both
 * import it, and `truck.ts` re-exports it for the callers that already had it.
 */

/**
 * Split CSV text into rows of fields.
 *
 * Written out rather than pulled from a library because of one detail no strict
 * parser gets right on this input: PFG's exports contain bare inch marks in
 * unquoted fields — `FRIES 3/8" REG CUT`, `BISCUIT DGH EASY SPLIT 3.25"` — and
 * quote nothing else. Treating every `"` as opening a quoted field pairs those
 * inch marks off against each other and swallows everything in between, which
 * silently merges rows and shifts columns rather than failing outright.
 *
 * So a quote only opens a field when it is that field's first character, which
 * is what Excel does. Properly quoted files still parse; an inch mark in the
 * middle of a description stays an inch mark.
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a byte order mark, which would otherwise glue itself to the
  // first header and stop it matching.
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Only true until the first character of a field is read.
  let atFieldStart = true;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (input[i + 1] === '"') {
        field += '"';
        i++; // A doubled quote is one literal quote.
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (char === ",") {
      atFieldStart = true;
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Only end the row on the first of a \r\n pair.
      if (char === "\r" && input[i + 1] === "\n") i++;
      atFieldStart = true;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      atFieldStart = false;
      field += char;
    }
  }

  // A file that doesn't end in a newline still has a last row in hand.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** Wrap a field only when it would otherwise break the row. */
function csvField(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/** Header text, flattened so small differences in spacing and case don't matter. */
export const normaliseHeader = (header: string) => header.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Find each wanted column by trying a list of names it might go under.
 *
 * Every export names the same column differently, and the same source changes
 * them between report types. Matching on a list of aliases means a new export
 * usually just works; when it doesn't, one more string is the whole fix.
 * Returns -1 for a field the file doesn't carry.
 */
export function matchColumns<K extends string>(
  headers: readonly string[],
  aliases: Record<K, readonly string[]>,
): Record<K, number> {
  const cleaned = headers.map(normaliseHeader);

  const find = (names: readonly string[]) => {
    // Walk the aliases in order rather than the columns: they are listed
    // best-first, so a guide carrying both "Item Description" and "Long
    // Description" is read from the one meant for a person to look at, whatever
    // order the two happen to appear in.
    for (const alias of names) {
      const exact = cleaned.indexOf(alias);
      if (exact !== -1) return exact;
    }
    // Nothing matched outright — settle for a header that contains an alias,
    // which is what catches "Item Description (long)" and its like.
    return cleaned.findIndex((header) => names.some((alias) => header.includes(alias)));
  };

  return Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [field, find(names as readonly string[])]),
  ) as Record<K, number>;
}
