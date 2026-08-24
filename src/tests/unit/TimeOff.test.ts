import { describe, expect, it } from "vitest";

import {
  compareTimeOff,
  coversDate,
  coversWeek,
  formatDateRange,
  offOnDay,
  requestDayCount,
  type Employee,
  type RecurringTimeOff,
  type TimeOffRequest,
} from "@/lib/schedule";

function request(overrides: Partial<TimeOffRequest> = {}): TimeOffRequest {
  return {
    id: "r1",
    employeeId: "e1",
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    reason: "",
    status: "pending",
    requestedAt: "2026-08-01",
    ...overrides,
  };
}

describe("time off dates", () => {
  it("counts both ends of the range", () => {
    expect(requestDayCount(request())).toBe(3);
    expect(requestDayCount(request({ startDate: "2026-08-12", endDate: "2026-08-12" }))).toBe(1);
    expect(requestDayCount(request({ startDate: "2026-09-09", endDate: "2026-09-23" }))).toBe(15);
  });

  it("counts across a DST change, where the days are not all 24 hours", () => {
    // US DST ends Nov 1 2026, so Oct 31 → Nov 2 spans a 25-hour day.
    expect(requestDayCount(request({ startDate: "2026-10-31", endDate: "2026-11-02" }))).toBe(3);
  });

  it("covers the dates inside the range, inclusive of both ends", () => {
    const req = request();
    expect(coversDate(req, "2026-08-11")).toBe(false);
    expect(coversDate(req, "2026-08-12")).toBe(true);
    expect(coversDate(req, "2026-08-13")).toBe(true);
    expect(coversDate(req, "2026-08-14")).toBe(true);
    expect(coversDate(req, "2026-08-15")).toBe(false);
  });

  it("overlaps a week when either end lands inside it, or it straddles the whole week", () => {
    const weekStart = "2026-08-10"; // Mon Aug 10 – Sun Aug 16.
    expect(coversWeek(request(), weekStart)).toBe(true);
    // Ends on the Monday / starts on the Sunday — still overlapping.
    expect(coversWeek(request({ startDate: "2026-08-05", endDate: "2026-08-10" }), weekStart)).toBe(
      true,
    );
    expect(coversWeek(request({ startDate: "2026-08-16", endDate: "2026-08-20" }), weekStart)).toBe(
      true,
    );
    // Swallows the week whole.
    expect(coversWeek(request({ startDate: "2026-07-01", endDate: "2026-09-01" }), weekStart)).toBe(
      true,
    );
    // Just misses on either side.
    expect(coversWeek(request({ startDate: "2026-08-03", endDate: "2026-08-09" }), weekStart)).toBe(
      false,
    );
    expect(coversWeek(request({ startDate: "2026-08-17", endDate: "2026-08-18" }), weekStart)).toBe(
      false,
    );
  });

  it("formats a single day without repeating it", () => {
    expect(formatDateRange("2026-08-25", "2026-08-25")).toBe("Aug 25, 2026");
    expect(formatDateRange("2026-08-12", "2026-08-14")).toBe("Aug 12 – Aug 14, 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
  });
});

describe("time off ordering", () => {
  it("puts what still needs a decision first, then orders by start date", () => {
    const ordered = [
      request({ id: "old-approved", startDate: "2026-08-01", status: "approved" }),
      request({ id: "later-pending", startDate: "2026-09-01" }),
      request({ id: "denied", startDate: "2026-07-01", status: "denied" }),
      request({ id: "soon-pending", startDate: "2026-08-12" }),
    ]
      .sort(compareTimeOff)
      .map((entry) => entry.id);

    expect(ordered).toEqual(["soon-pending", "later-pending", "denied", "old-approved"]);
  });
});

describe("who is off on a day", () => {
  const employees: Employee[] = [
    { id: "e1", name: "Ann", group: "morning" },
    { id: "e2", name: "Bo", group: "night" },
    { id: "e3", name: "Cy", group: "other" },
  ];

  const recurring = (over: Partial<RecurringTimeOff> = {}): RecurringTimeOff => ({
    id: "x1",
    employeeId: "e3",
    day: "wednesday",
    reason: "Class",
    ...over,
  });

  /** Wednesday of the week the fixture requests sit in. */
  const WEDNESDAY = "2026-08-12";

  it("lists the requests covering the date, accepted and in review alike", () => {
    const off = offOnDay(
      employees,
      [
        request({ id: "r1", employeeId: "e1", startDate: WEDNESDAY, endDate: WEDNESDAY }),
        request({
          id: "r2",
          employeeId: "e2",
          startDate: "2026-08-10",
          endDate: "2026-08-20",
          status: "approved",
        }),
      ],
      [],
      "wednesday",
      WEDNESDAY,
    );

    // Accepted first — it is the firmer answer of the two.
    expect(off.map((entry) => [entry.employee.name, entry.kind])).toEqual([
      ["Bo", "approved"],
      ["Ann", "pending"],
    ]);
  });

  it("leaves out declined requests, and days the request doesn't reach", () => {
    const off = offOnDay(
      employees,
      [
        request({ id: "r1", employeeId: "e1", startDate: WEDNESDAY, endDate: WEDNESDAY, status: "denied" }),
        request({ id: "r2", employeeId: "e2", startDate: "2026-08-13", endDate: "2026-08-14" }),
      ],
      [],
      "wednesday",
      WEDNESDAY,
    );

    expect(off).toEqual([]);
  });

  it("includes a standing weekly conflict, on that weekday only", () => {
    expect(offOnDay(employees, [], [recurring()], "wednesday", WEDNESDAY)).toMatchObject([
      { employee: { name: "Cy" }, kind: "recurring", reason: "Class" },
    ]);
    expect(offOnDay(employees, [], [recurring()], "thursday", "2026-08-13")).toEqual([]);
  });

  it("lists somebody covered twice over only once, under the firmer answer", () => {
    const off = offOnDay(
      employees,
      [request({ id: "r1", employeeId: "e3", startDate: WEDNESDAY, endDate: WEDNESDAY })],
      [recurring()],
      "wednesday",
      WEDNESDAY,
    );

    expect(off).toHaveLength(1);
    expect(off[0].kind).toBe("recurring");
  });

  it("ignores time off belonging to somebody who is no longer on the roster", () => {
    const off = offOnDay(
      employees,
      [request({ id: "r1", employeeId: "gone", startDate: WEDNESDAY, endDate: WEDNESDAY })],
      [recurring({ employeeId: "gone" })],
      "wednesday",
      WEDNESDAY,
    );

    expect(off).toEqual([]);
  });
});
