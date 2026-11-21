/**
 * The sections of `/staff`, reached from its Menu. Kept out of the client
 * component so the server page can read `?view=` with them too.
 */
export const STAFF_VIEWS = ["home", "schedule", "timeOff", "tips", "payStubs", "rules"] as const;
export type StaffView = (typeof STAFF_VIEWS)[number];

export function isStaffView(value: string | undefined): value is StaffView {
  return (STAFF_VIEWS as readonly string[]).includes(value ?? "");
}

export const STAFF_VIEW_LABELS: Record<StaffView, string> = {
  home: "Home",
  schedule: "My schedule",
  timeOff: "Request Time Off",
  tips: "Online tips",
  payStubs: "Pay stubs",
  rules: "Rules",
};
