"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  STAFF_ATTEMPT_WINDOW_MINUTES,
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_MAX_AGE_SECONDS,
  STAFF_SETUP_COOKIE,
  STAFF_SETUP_MAX_AGE_SECONDS,
  createStaffSessionToken,
  createStaffSetupToken,
  isValidPasswordShape,
  isValidSetupCodeShape,
  readStaffSession,
  readStaffSetupToken,
} from "@/lib/staff-auth";
import * as staff from "@/lib/staff-repo";
import { insertTimeOff } from "@/lib/schedule-repo";
import { type TimeOffRequest, type WeekSchedule } from "@/lib/schedule";

export type StaffLoginState = { error?: string };
export type StaffSetupState = { error?: string };

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

/** The cookie settings every signed thing here is stored under. */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  } as const;
}

const THROTTLED = `Too many incorrect tries. Wait ${STAFF_ATTEMPT_WINDOW_MINUTES} minutes, or ask your manager.`;

/**
 * Sign in with the password the employee chose for themselves.
 *
 * The password is the only thing asked for, so it is also what says who is
 * signing in — there is no name to go with it. That is why the database keeps
 * `staff_password` unique, and why nobody can be let in on a password that two
 * people happen to share.
 */
export async function staffLogin(
  _prevState: StaffLoginState,
  formData: FormData,
): Promise<StaffLoginState> {
  const password = String(formData.get("password") ?? "");
  const ip = await callerIp();

  if (staff.isThrottled(await staff.recentFailedAttempts(ip))) return { error: THROTTLED };

  if (!password) return { error: "Enter your password." };

  const employee = await staff.findEmployeeByPassword(password);
  await staff.recordLoginAttempt(ip, employee !== null);

  if (!employee) {
    // Same delay as the admin login, for the same reason.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      error: "That password isn't right. If you haven't set one yet, use the button below.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    STAFF_SESSION_COOKIE,
    await createStaffSessionToken(employee.id),
    cookieOptions(STAFF_SESSION_MAX_AGE_SECONDS),
  );

  redirect("/staff");
}

/**
 * Step one of a first sign-in: trade the five digit code the owner read out for
 * a short-lived ticket saying which employee it belongs to.
 *
 * The ticket is a signed cookie rather than an id in the URL, so the page that
 * follows cannot be talked into setting somebody else's password.
 */
export async function staffVerifySetupCode(
  _prevState: StaffSetupState,
  formData: FormData,
): Promise<StaffSetupState> {
  const code = String(formData.get("code") ?? "").trim();
  const ip = await callerIp();

  if (staff.isThrottled(await staff.recentFailedAttempts(ip))) return { error: THROTTLED };

  if (!isValidSetupCodeShape(code)) return { error: "Enter the five digit code from your manager." };

  const employee = await staff.findEmployeeBySetupCode(code);
  await staff.recordLoginAttempt(ip, employee !== null);

  if (!employee) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "That code doesn't match anyone. Check with your manager." };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    STAFF_SETUP_COOKIE,
    await createStaffSetupToken(employee.id),
    cookieOptions(STAFF_SETUP_MAX_AGE_SECONDS),
  );

  redirect("/staff/setup/password");
}

/**
 * Step two: save the password, then sign them straight in so they land on their
 * schedule rather than being asked to type it again.
 */
export async function staffCreatePassword(
  _prevState: StaffSetupState,
  formData: FormData,
): Promise<StaffSetupState> {
  const cookieStore = await cookies();
  const employeeId = await readStaffSetupToken(cookieStore.get(STAFF_SETUP_COOKIE)?.value);
  if (!employeeId) {
    return { error: "That took too long. Enter your five digit code again to start over." };
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isValidPasswordShape(password)) {
    return { error: `Your password needs to be at least ${STAFF_PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "Those two passwords don't match." };

  try {
    await staff.setStaffPassword(employeeId, password);
  } catch (cause) {
    if (cause instanceof staff.PasswordTakenError) return { error: cause.message };
    throw cause;
  }

  // The code has done its job; the ticket goes so it cannot be replayed.
  cookieStore.delete(STAFF_SETUP_COOKIE);
  cookieStore.set(
    STAFF_SESSION_COOKIE,
    await createStaffSessionToken(employeeId),
    cookieOptions(STAFF_SESSION_MAX_AGE_SECONDS),
  );

  redirect("/staff");
}

export async function staffLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_SESSION_COOKIE);
  cookieStore.delete(STAFF_SETUP_COOKIE);
  redirect("/staff/login");
}

/**
 * One published week's grid. The staff view merges the position rows anyway, so
 * all it takes from the grid is the hours each person is on.
 */
export async function loadPublishedWeekAction(weekStart: string): Promise<WeekSchedule> {
  await requireStaff();
  if (!ISO_DATE.test(weekStart)) throw new Error("Bad week.");
  return staff.loadPublishedWeek(weekStart);
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
