"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  OPERATIONS_SESSION_COOKIE,
  OPERATIONS_SESSION_MAX_AGE_SECONDS,
  createOperationsSessionToken,
  isValidCodeShape,
  verifyOperationsCode,
} from "@/lib/operations-auth";

export type OperationsLoginState = { error?: string };

export async function operationsLogin(
  _prevState: OperationsLoginState,
  formData: FormData,
): Promise<OperationsLoginState> {
  const code = String(formData.get("code") ?? "").trim();

  if (!isValidCodeShape(code)) return { error: "Enter the four digit code." };

  if (!(await verifyOperationsCode(code))) {
    // Small delay to make guessing four digits over the network tedious.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "That code isn't right. Check with your manager." };
  }

  const cookieStore = await cookies();
  cookieStore.set(OPERATIONS_SESSION_COOKIE, await createOperationsSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPERATIONS_SESSION_MAX_AGE_SECONDS,
  });

  redirect("/operations");
}

export async function operationsLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OPERATIONS_SESSION_COOKIE);
  redirect("/operations/login");
}
