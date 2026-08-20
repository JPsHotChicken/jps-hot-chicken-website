"use server";

import { revalidatePath } from "next/cache";

import { assertISODate, assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import * as repo from "@/lib/pay-stubs-repo";

/**
 * Writes behind Staff pay stubs.
 *
 * Every action re-checks the admin session itself: a Server Action is a public
 * POST endpoint, and being rendered inside `/admin` proves nothing about who is
 * calling it. That matters more here than anywhere else on the dashboard —
 * these rows decide who is shown somebody's wages and bank details.
 */

export async function assignStubAction(stubId: string, employeeId: string | null) {
  await requireAdmin();
  assertUuid(stubId, "Page");
  if (employeeId) assertUuid(employeeId, "Employee");

  await repo.assignStub(stubId, employeeId);
  revalidatePath("/admin/pay-stubs");
}

export async function skipStubAction(stubId: string, skipped: boolean) {
  await requireAdmin();
  assertUuid(stubId, "Page");

  await repo.skipStub(stubId, skipped);
  revalidatePath("/admin/pay-stubs");
}

export async function setPayDateAction(batchId: string, payDate: string) {
  await requireAdmin();
  assertUuid(batchId, "Pay run");

  await repo.setPayDate(batchId, payDate ? assertISODate(payDate, "Pay date") : null);
  revalidatePath("/admin/pay-stubs");
}

/** Releases the run to staff. Throws with the page numbers still undecided. */
export async function releaseBatchAction(batchId: string) {
  await requireAdmin();
  assertUuid(batchId, "Pay run");

  await repo.releaseBatch(batchId);
  revalidatePath("/admin/pay-stubs");
  revalidatePath("/staff");
}

export async function unreleaseBatchAction(batchId: string) {
  await requireAdmin();
  assertUuid(batchId, "Pay run");

  await repo.unreleaseBatch(batchId);
  revalidatePath("/admin/pay-stubs");
  revalidatePath("/staff");
}

export async function deleteBatchAction(batchId: string) {
  await requireAdmin();
  assertUuid(batchId, "Pay run");

  await repo.deleteBatch(batchId);
  revalidatePath("/admin/pay-stubs");
  revalidatePath("/staff");
}

/**
 * Forgets a payroll name the owner taught us.
 *
 * Lives with the pay stub actions but is reached from Staff management, which
 * is where the roster — and so the list of remembered names — is looked after.
 */
export async function forgetPayrollNameAction(payrollName: string) {
  await requireAdmin();
  assertText(payrollName, "Payroll name", { required: true });

  await repo.forgetPayrollName(payrollName);
  revalidatePath("/admin");
  revalidatePath("/admin/pay-stubs");
}
