import "server-only";

import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

import { parsePayrollText, type ParsedPayroll } from "@/lib/pay-stubs";

/**
 * Turning the accountant's payroll PDF into one PDF per person.
 *
 * Two libraries, because they do different halves of the job: `unpdf` reads the
 * text off each page so we can tell whose page it is, and `pdf-lib` copies each
 * page into a document of its own so a person is only ever handed their own.
 */

export type ReadPayroll = ParsedPayroll & {
  /** One single-page PDF per page of the upload, in page order. */
  pageFiles: Uint8Array[];
};

/** Raised for a file the reader cannot make sense of, so callers can say why. */
export class UnreadablePayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadablePayrollError";
  }
}

/** Roughly what a payroll run should be, as a guard against the wrong file. */
const MAX_PAGES = 200;

export async function readPayrollPdf(bytes: Uint8Array): Promise<ReadPayroll> {
  // pdf.js takes ownership of the buffer it is handed and leaves it detached,
  // so each library gets its own copy of the bytes rather than a shared one.
  const forText = new Uint8Array(bytes);
  const forSplitting = new Uint8Array(bytes);

  let pageTexts: string[];
  try {
    const document = await getDocumentProxy(forText);
    const { text } = await extractText(document, { mergePages: false });
    pageTexts = text;
  } catch (error) {
    throw new UnreadablePayrollError(
      `That file could not be read as a PDF (${(error as Error).message}).`,
    );
  }

  if (pageTexts.length === 0) throw new UnreadablePayrollError("That PDF has no pages.");
  if (pageTexts.length > MAX_PAGES) {
    throw new UnreadablePayrollError(
      `That PDF has ${pageTexts.length} pages — more than a pay run should be.`,
    );
  }

  const source = await PDFDocument.load(forSplitting);
  const pageFiles: Uint8Array[] = [];
  for (let index = 0; index < source.getPageCount(); index++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(source, [index]);
    single.addPage(page);
    pageFiles.push(await single.save());
  }

  return { ...parsePayrollText(pageTexts), pageFiles };
}
