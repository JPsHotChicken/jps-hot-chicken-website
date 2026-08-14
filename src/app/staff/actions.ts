"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_MAX_AGE_SECONDS,
  createStaffSessionToken,
  isValidCodeShape,
  readStaffSession,
  STAFF_ATTEMPT_WINDOW_MINUTES,
} from "@/lib/staff-auth";
import * as staff from "@/lib/staff-repo";
import { insertTimeOff } from "@/lib/schedule-repo";
import { MAX_ROW_COUNT, type TimeOffRequest, type WeekSchedule } from "@/lib/schedule";

export type StaffLoginState = { error?: string };

/**
 * Best guess at who is calling, for throttling only. `x-forwarded-for` can be
 * spoofed, but on Vercel the left-most entry is set by the platform, and the
 * throttle is a speed bump rather than an access control.
 */
async function callerIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
}

async function requireStaff(): Promise<string> {
  const cookieStore = await cookies();
  const employeeId = await readStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
  if (!employeeId) throw new Error("Not signed in.");
  return employeeId;
}

export async function staffLogin(
  _prevState: StaffLoginState,
  formData: FormData,
): Promise<StaffLoginState> {
  const code = String(formData.get("code") ?? "").trim();
  const ip = await callerIp();

  if (staff.isThrottled(await staff.recentFailedAttempts(ip))) {
    return {
      error: `Too many incorrect codes. Try again in ${STAFF_ATTEMPT_WINDOW_MINUTES} minutes, or ask your manager.`,
    };
  }

  if (!isValidCodeShape(code)) return { error: "Enter your four digit code." };

  const employee = await staff.findEmployeeByCode(code);
  await staff.recordLoginAttempt(ip, employee !== null);

  if (!employee) {
    // Same delay as the admin login, for the same reason.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "That code doesn't match anyone. Check with your manager." };
  }

  const cookieStore = await cookies();
  cookieStore.set(STAFF_SESSION_COOKIE, await createStaffSessionToken(employee.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  });

  redirect("/staff");
}

export async function staffLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_SESSION_COOKIE);
  redirect("/staff/login");
}

/**
 * One published week's grid. Read at `MAX_ROW_COUNT` so no published shift is
 * ever dropped — the staff view merges rows anyway, so the height is irrelevant
 * to what it displays.
 */
export async function loadPublishedWeekAction(weekStart: string): Promise<WeekSchedule> {
  await requireStaff();
  if (!ISO_DATE.test(weekStart)) throw new Error("Bad week.");
  return staff.loadPublishedWeek(weekStart, MAX_ROW_COUNT);
}

/** The signed-in employee's requests, re-read after filing a new one. */
export async function myRequestsAction(): Promise<TimeOffRequest[]> {
  return staff.listRequestsForEmployee(await requireStaff());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * File a request for time off. The employee is taken from the session, never
 * from the form, so nobody can file against somebody else's name.
 */
export async function requestTimeOffAction(input: {
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<void> {
  const employeeId = await requireStaff();

  const { startDate, endDate } = input;
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new Error("Pick the days you need off.");
  }
  if (endDate < startDate) throw new Error("The last day can't be before the first day.");

  const reason = input.reason.trim();
  if (reason.length > 200) throw new Error("Please keep the reason under 200 characters.");

  await insertTimeOff({ employeeId, startDate, endDate, reason });
}
