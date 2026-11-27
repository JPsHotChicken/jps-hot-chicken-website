/**
 * The sections of `/staff`, reached from its Menu. Kept out of the client
 * component so the server page can read `?view=` with them too.
 */
export const STAFF_VIEWS = ["home", "schedule", "payStubs", "rules"] as const;
export type StaffView = (typeof STAFF_VIEWS)[number];

export function isStaffView(value: string | undefined): value is StaffView {
  return (STAFF_VIEWS as readonly string[]).includes(value ?? "");
}

/**
 * Sections that have moved, so an old link or bookmark still lands somewhere
 * sensible: asking for time off now lives on My schedule.
 */
export const MOVED_STAFF_VIEWS: Record<string, StaffView> = { timeOff: "schedule" };

export const STAFF_VIEW_LABELS: Record<StaffView, string> = {
  home: "Home",
  schedule: "My schedule",
  payStubs: "Pay Out",
  rules: "Rules",
};
