/**
 * Reading a point-of-sale export in the browser.
 *
 * Toast hands out its sales summary as a real Excel `.xls` — the old binary
 * format, not a renamed CSV — and there is no dependency here that opens one.
 * The obvious package for the job has a long history of parser advisories and
 * ships a megabyte to read a file with eighty rows in it, which is a poor trade
 * for a page one person opens once a week. So the format is read directly.
 *
 * Only what a sales summary actually contains is implemented: strings, numbers,
 * and the cached results of formulas. Charts, styles, dates and formula
 * expressions are skipped — the export states its figures as text and numbers,
 * and anything cleverer than that would be guessing at meaning this file never
 * carries.
 *
 * `.xlsx` is read as well, through the zip decoder already in the project. It
 * is not the format Toast produces, but it is what comes back out of Excel,
 * Numbers or Sheets the moment somebody opens the file and saves it — which is
 * a normal thing to do and a bad reason for the page to break.
 *
 * Nothing here touches Node APIs: the file is read on the owner's machine and
 * no part of it is ever uploaded.
 */

/** A cell holds a number or a string. Empty cells are `null`. */
export type CellValue = string | number | null;

/** One sheet, dense — a sales summary is eighty rows, so gaps cost nothing. */
export type Sheet = {
  name: string;
  rows: CellValue[][];
};

export type Workbook = {
  sheets: Sheet[];
};

/** The file was not a spreadsheet this can open, or was damaged. */
export class SpreadsheetError extends Error {}

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);

/**
 * Open a spreadsheet, whichever of the two formats it is in.
 *
 * The file is identified by its first bytes rather than its extension, because
 * an export saved out of another program keeps its old name far more often than
 * it keeps its old format.
 */
export async function readWorkbook(data: ArrayBuffer): Promise<Workbook> {
  const bytes = new Uint8Array(data);

  if (startsWith(bytes, CFB_MAGIC)) return readXls(bytes);
  if (startsWith(bytes, ZIP_MAGIC)) return readXlsx(bytes);

  throw new SpreadsheetError(
    "That file isn't an Excel spreadsheet. Download the sales summary from Toast and upload it without opening it.",
  );
}

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

/** Latin-1, which is what BIFF calls a "compressed" string. */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** UTF-16LE, which is what BIFF calls an ordinary one. */
function utf16(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    out += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
  }
  return out;
}

/** Grow a sheet to fit `row`/`col`, then write the cell. */
function put(rows: CellValue[][], row: number, col: number, value: CellValue): void {
  // A corrupt file can name a cell far outside any real sheet, and filling to
  // it would allocate until the tab dies. Excel's own grid is the ceiling.
  if (row < 0 || col < 0 || row > 1_048_575 || col > 16_383) return;
  while (rows.length <= row) rows.push([]);
  const line = rows[row];
  while (line.length <= col) line.push(null);
  line[col] = value;
}

/* ------------------------------------------------------------------ *
 * .xls — Compound File Binary, then BIFF8
 * ------------------------------------------------------------------ */

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;

/** True for the two values that mean "the chain stops here". */
const isTerminal = (sector: number) => sector === END_OF_CHAIN || sector === FREE_SECTOR;

/**
 * An `.xls` is a little filesystem — the "compound file" — and the spreadsheet
 * is one stream inside it. This walks that filesystem far enough to pull the
 * stream out, and no further.
 */
function readWorkbookStream(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const sectorSize = 1 << view.getUint16(30, true);
  const miniSectorSize = 1 << view.getUint16(32, true);
  const directoryStart = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const miniFatStart = view.getUint32(60, true);
  const difatStart = view.getUint32(68, true);
  const difatCount = view.getUint32(72, true);

  if (sectorSize < 128 || bytes.length < 512 + sectorSize) {
    throw new SpreadsheetError("That spreadsheet is damaged and couldn't be opened.");
  }

  const sectorAt = (sector: number) => 512 + sector * sectorSize;
  const perSector = sectorSize / 4;

  // Where the allocation table itself lives. The first 109 entries are in the
  // header; anything past that is chained through sectors of its own.
  const fatSectors: number[] = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = view.getUint32(76 + index * 4, true);
    if (isTerminal(sector)) break;
    fatSectors.push(sector);
  }
  let next = difatStart;
  for (let seen = 0; seen < difatCount && !isTerminal(next); seen += 1) {
    const base = sectorAt(next);
    if (base + sectorSize > bytes.length) break;
    for (let index = 0; index < perSector - 1; index += 1) {
      const sector = view.getUint32(base + index * 4, true);
      if (!isTerminal(sector)) fatSectors.push(sector);
    }
    next = view.getUint32(base + sectorSize - 4, true);
  }

  const readTable = (sectors: number[]): number[] => {
    const table: number[] = [];
    for (const sector of sectors) {
      const base = sectorAt(sector);
      if (base + sectorSize > bytes.length) break;
      for (let index = 0; index < perSector; index += 1) {
        table.push(view.getUint32(base + index * 4, true));
      }
    }
    return table;
  };

  const fat = readTable(fatSectors);

  /** Follow a chain through the allocation table and join what it points at. */
  const follow = (start: number, size?: number): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    let sector = start;
    // The table is finite, so a chain longer than it is a loop, not a file.
    for (let step = 0; !isTerminal(sector) && step <= fat.length; step += 1) {
      const base = sectorAt(sector);
      if (base + sectorSize > bytes.length) break;
      parts.push(bytes.subarray(base, base + sectorSize));
      total += sectorSize;
      sector = fat[sector] ?? END_OF_CHAIN;
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    return size == null ? joined : joined.subarray(0, size);
  };

  // The directory: one 128-byte entry per stream in the file.
  const directory = follow(directoryStart);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory[offset + 64] | (directory[offset + 65] << 8);
    if (nameLength < 2 || nameLength > 64) continue;
    const dv = new DataView(directory.buffer, directory.byteOffset + offset, 128);
    entries.push({
      name: utf16(directory.subarray(offset, offset + nameLength - 2)),
      type: directory[offset + 66],
      start: dv.getUint32(116, true),
      size: dv.getUint32(120, true),
    });
  }

  // Streams smaller than the cutoff live packed inside the root entry's own
  // stream rather than in sectors of their own.
  const root = entries.find((entry) => entry.type === 5);
  const readMini = (start: number, size: number): Uint8Array => {
    if (!root) return new Uint8Array(0);
    const miniStream = follow(root.start, root.size);
    const miniFat = readTable(
      (() => {
        const sectors: number[] = [];
        let sector = miniFatStart;
        for (let step = 0; !isTerminal(sector) && step <= fat.length; step += 1) {
          sectors.push(sector);
          sector = fat[sector] ?? END_OF_CHAIN;
        }
        return sectors;
      })(),
    );
    const out = new Uint8Array(size);
    let written = 0;
    let sector = start;
    for (let step = 0; !isTerminal(sector) && written < size && step <= miniFat.length; step += 1) {
      const base = sector * miniSectorSize;
      const take = Math.min(miniSectorSize, size - written);
      out.set(miniStream.subarray(base, base + take), written);
      written += take;
      sector = miniFat[sector] ?? END_OF_CHAIN;
    }
    return out;
  };

  const workbook = entries.find((entry) => entry.name === "Workbook" || entry.name === "Book");
  if (!workbook) {
    throw new SpreadsheetError("That file has no spreadsheet inside it.");
  }

  return workbook.size < miniCutoff
    ? readMini(workbook.start, workbook.size)
    : follow(workbook.start, workbook.size);
}

/** Record types this reads. Everything else in the stream is skipped. */
const BIFF = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  CONTINUE: 0x003c,
  BOUNDSHEET: 0x0085,
  MULRK: 0x00bd,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  STRING: 0x0207,
  RK: 0x027e,
} as const;

type BiffRecord = { id: number; data: Uint8Array; offset: number };

/** The stream is a flat list of length-prefixed records. Split it. */
function splitRecords(stream: Uint8Array): BiffRecord[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const records: BiffRecord[] = [];
  for (let offset = 0; offset + 4 <= stream.length; ) {
    const id = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    if (offset + 4 + length > stream.length) break;
    records.push({ id, data: stream.subarray(offset + 4, offset + 4 + length), offset });
    offset += 4 + length;
  }
  return records;
}

/**
 * Every string in the file, in one table.
 *
 * The awkward part is that the table is allowed to run past the 8KB a record
 * can hold and continue in the next one — and it may split a string in half to
 * do it, with the second half free to change between one-byte and two-byte
 * characters. So this walks the pieces as one long tape rather than reading
 * each record on its own.
 */
function readSharedStrings(records: BiffRecord[], index: number): string[] {
  const parts = [records[index].data];
  for (let next = index + 1; next < records.length && records[next].id === BIFF.CONTINUE; next += 1) {
    parts.push(records[next].data);
  }

  const first = new DataView(parts[0].buffer, parts[0].byteOffset, parts[0].byteLength);
  const unique = parts[0].length >= 8 ? first.getUint32(4, true) : 0;

  let part = 0;
  let at = 8;

  /** Move to the next piece once the current one is spent. */
  const settle = () => {
    while (part < parts.length && at >= parts[part].length) {
      part += 1;
      at = 0;
    }
  };
  const byte = () => parts[part][at++];
  const uint16 = () => {
    const value = parts[part][at] | (parts[part][at + 1] << 8);
    at += 2;
    return value;
  };

  const strings: string[] = [];
  for (let count = 0; count < unique; count += 1) {
    settle();
    if (part >= parts.length) break;

    let length = uint16();
    settle();
    const flags = byte();
    let wide = (flags & 0x01) === 1;
    const richRuns = flags & 0x08 ? (settle(), uint16()) : 0;
    let farEast = 0;
    if (flags & 0x04) {
      settle();
      const dv = new DataView(parts[part].buffer, parts[part].byteOffset, parts[part].byteLength);
      farEast = dv.getUint32(at, true);
      at += 4;
    }

    let text = "";
    while (length > 0) {
      settle();
      if (part >= parts.length) break;
      const available = parts[part].length - at;
      const take = Math.min(length, wide ? Math.floor(available / 2) : available);
      if (take > 0) {
        const slice = parts[part].subarray(at, at + (wide ? take * 2 : take));
        text += wide ? utf16(slice) : latin1(slice);
        at += wide ? take * 2 : take;
        length -= take;
      }
      if (length > 0) {
        // Carried into the next record, which restates the encoding first.
        part += 1;
        at = 0;
        if (part >= parts.length) break;
        wide = (parts[part][at++] & 0x01) === 1;
      }
    }

    // Formatting runs and phonetic text ride along after the characters and
    // say nothing about the value, so they are stepped over.
    let skip = richRuns * 4 + farEast;
    while (skip > 0 && part < parts.length) {
      settle();
      if (part >= parts.length) break;
      const take = Math.min(skip, parts[part].length - at);
      at += take;
      skip -= take;
      if (skip > 0) {
        part += 1;
        at = 0;
      }
    }

    strings.push(text);
  }

  return strings;
}

/** RK is Excel's packed number: two bits say how to unpack the other thirty. */
function decodeRk(raw: number): number {
  const scratch = new DataView(new ArrayBuffer(8));
  let value: number;
  if (raw & 0x02) {
    value = raw >> 2;
  } else {
    scratch.setInt32(0, 0, true);
    scratch.setInt32(4, raw & 0xfffffffc, true);
    value = scratch.getFloat64(0, true);
  }
  return raw & 0x01 ? value / 100 : value;
}

function readXls(bytes: Uint8Array): Workbook {
  const stream = readWorkbookStream(bytes);
  const records = splitRecords(stream);

  const sstIndex = records.findIndex((record) => record.id === BIFF.SST);
  const shared = sstIndex >= 0 ? readSharedStrings(records, sstIndex) : [];

  // Each sheet says where in the stream its own records begin.
  const positions = new Map(records.map((record, index) => [record.offset, index]));
  const sheets: Sheet[] = [];

  for (const record of records) {
    if (record.id !== BIFF.BOUNDSHEET || record.data.length < 8) continue;
    const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
    const start = view.getUint32(0, true);
    const nameLength = record.data[6];
    const wide = (record.data[7] & 0x01) === 1;
    const name = wide
      ? utf16(record.data.subarray(8, 8 + nameLength * 2))
      : latin1(record.data.subarray(8, 8 + nameLength));

    const from = positions.get(start);
    const rows: CellValue[][] = [];
    if (from != null) readSheetRecords(records, from + 1, shared, rows);
    sheets.push({ name, rows });
  }

  if (sheets.length === 0) {
    throw new SpreadsheetError("That spreadsheet has no sheets in it.");
  }

  return { sheets };
}

/** Read cells from `start` up to the sheet's own end-of-record. */
function readSheetRecords(
  records: BiffRecord[],
  start: number,
  shared: string[],
  rows: CellValue[][],
): void {
  for (let index = start; index < records.length; index += 1) {
    const { id, data } = records[index];
    if (id === BIFF.EOF) return;
    if (data.length < 6) continue;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const row = view.getUint16(0, true);
    const col = view.getUint16(2, true);

    switch (id) {
      case BIFF.LABELSST: {
        put(rows, row, col, shared[view.getUint32(6, true)] ?? "");
        break;
      }
      case BIFF.LABEL: {
        const length = view.getUint16(6, true);
        const wide = (data[8] & 0x01) === 1;
        put(
          rows,
          row,
          col,
          wide ? utf16(data.subarray(9, 9 + length * 2)) : latin1(data.subarray(9, 9 + length)),
        );
        break;
      }
      case BIFF.RK: {
        put(rows, row, col, decodeRk(view.getInt32(6, true)));
        break;
      }
      case BIFF.MULRK: {
        // One record, a run of cells across a row, two bytes of trailing column.
        for (let at = 4, column = col; at + 6 <= data.length - 2; at += 6, column += 1) {
          put(rows, row, column, decodeRk(view.getInt32(at + 2, true)));
        }
        break;
      }
      case BIFF.NUMBER: {
        put(rows, row, col, view.getFloat64(6, true));
        break;
      }
      case BIFF.FORMULA: {
        // A formula carries its last computed value, which is all that is
        // wanted here. The marker at the end means "this one came out a
        // string", and the string itself is in the record that follows.
        if (data.length >= 14 && view.getUint16(12, true) === 0xffff) {
          const following = records[index + 1];
          if (following?.id === BIFF.STRING && following.data.length >= 3) {
            const sv = new DataView(
              following.data.buffer,
              following.data.byteOffset,
              following.data.byteLength,
            );
            const length = sv.getUint16(0, true);
            const wide = (following.data[2] & 0x01) === 1;
            put(
              rows,
              row,
              col,
              wide
                ? utf16(following.data.subarray(3, 3 + length * 2))
                : latin1(following.data.subarray(3, 3 + length)),
            );
          }
        } else if (data.length >= 14) {
          put(rows, row, col, view.getFloat64(6, true));
        }
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * .xlsx — a zip of XML
 * ------------------------------------------------------------------ */

/** `"BC12"` -> `{ row: 11, col: 54 }`, both zero-based. */
function parseRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let col = 0;
  for (const character of match[1]) col = col * 26 + (character.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)));
    return XML_ENTITIES[entity] ?? whole;
  });
}

/** The text of every `<t>` in a fragment, joined — a shared string may be split. */
function textOf(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) {
    out += decodeXml(match[1] ?? "");
  }
  return out;
}

async function readXlsx(bytes: Uint8Array): Promise<Workbook> {
  // Loaded on demand: an `.xls` is the format Toast actually produces, and it
  // would be a shame to ship a zip decoder to everyone for the other case.
  const { unzipSync } = await import("fflate");

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new SpreadsheetError("That spreadsheet is damaged and couldn't be opened.");
  }

  const decoder = new TextDecoder();
  const read = (path: string) => (files[path] ? decoder.decode(files[path]) : null);

  const workbookXml = read("xl/workbook.xml");
  if (!workbookXml) {
    throw new SpreadsheetError("That file has no spreadsheet inside it.");
  }

  // Sheet names live in `workbook.xml` and point at their part by relationship
  // id, which is resolved in a second file. Order matters: this is the order
  // the tabs appear in.
  const relationships = new Map<string, string>();
  for (const match of (read("xl/_rels/workbook.xml.rels") ?? "").matchAll(
    /<Relationship\b[^>]*>/g,
  )) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1];
    if (id && target) relationships.set(id, target.replace(/^\/?(xl\/)?/, ""));
  }

  const shared: string[] = [];
  for (const match of (read("xl/sharedStrings.xml") ?? "").matchAll(
    /<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g,
  )) {
    shared.push(textOf(match[1] ?? ""));
  }

  const sheets: Sheet[] = [];
  let fallbackIndex = 0;
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    fallbackIndex += 1;
    const name = decodeXml(/\bname="([^"]*)"/.exec(match[0])?.[1] ?? `Sheet${fallbackIndex}`);
    const relationshipId = /\br:id="([^"]+)"/.exec(match[0])?.[1] ?? "";
    const path = `xl/${relationships.get(relationshipId) ?? `worksheets/sheet${fallbackIndex}.xml`}`;
    sheets.push({ name, rows: readXlsxSheet(read(path) ?? "", shared) });
  }

  if (sheets.length === 0) {
    throw new SpreadsheetError("That spreadsheet has no sheets in it.");
  }

  return { sheets };
}

function readXlsxSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];

  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1];
    const body = match[2] ?? "";

    const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
    const at = ref ? parseRef(ref) : null;
    // Every cell in a real export carries its reference; one that doesn't
    // would have to be placed by counting, and a miscount here moves money
    // into the wrong row. Skipping it is the honest failure.
    if (!at) continue;

    const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? "n";

    if (type === "inlineStr") {
      put(rows, at.row, at.col, textOf(body));
      continue;
    }

    const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (value == null) continue;

    if (type === "s") {
      put(rows, at.row, at.col, shared[Number(value)] ?? "");
    } else if (type === "str" || type === "e") {
      put(rows, at.row, at.col, decodeXml(value));
    } else if (type === "b") {
      put(rows, at.row, at.col, value === "1" ? "TRUE" : "FALSE");
    } else {
      const number = Number(value);
      put(rows, at.row, at.col, Number.isFinite(number) ? number : decodeXml(value));
    }
  }

  return rows;
}
