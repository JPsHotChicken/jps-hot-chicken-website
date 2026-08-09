"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isAdminConfigured,
  verifyPassword,
} from "@/lib/admin-auth";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!isAdminConfigured()) {
    return {
      error: "Admin login isn't configured yet — set ADMIN_PASSWORD in the environment.",
    };
  }

  if (!(await verifyPassword(password))) {
    // Small delay to make brute-forcing over the network tedious.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "Incorrect password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/admin");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
