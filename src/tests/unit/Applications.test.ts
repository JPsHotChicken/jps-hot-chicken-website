import { describe, expect, it } from "vitest";

import {
  compareInterviews,
  compareSnippets,
  formatAge,
  formatTime,
  isValidTime,
  moveSnippet,
  splitInterviews,
  toApplicationsCsv,
  type Application,
  type Interview,
  type TextSnippet,
} from "@/lib/applications";

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: "i1",
    applicationId: null,
    name: "Sam",
    phone: "",
    date: "2026-08-18",
    time: "14:30",
    note: "",
    ...overrides,
  };
}

function snippet(overrides: Partial<TextSnippet> = {}): TextSnippet {
  return { id: "s1", title: "Invite", body: "Come in Tuesday", sortOrder: 0, ...overrides };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    submittedAt: "2026-08-18T15:04:00.000Z",
    firstName: "Jo",
    lastName: "Ruiz",
    phone: "+19315550142",
    email: "jo@example.com",
    age: "18+",
    workAuthorized: "Yes",
    position: "Kitchen Staff",
    location: "Clarksville, TN",
    availability: "Weekends",
    employmentType: "Part-time",
    foodService: "Yes",
    experience: "",
    transportation: "Yes",
    status: "new",
    note: "",
    ...overrides,
  };
}

describe("interview times", () => {
  it("accepts a 24-hour time, and an empty one for a date with no time yet", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime("14:60")).toBe(false);
  });

  it("shows a time the way it is spoken, with noon and midnight the right way round", () => {
    expect(formatTime("14:30")).toBe("2:30 PM");
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("00:15")).toBe("12:15 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("")).toBe("");
  });
});

describe("ordering interviews", () => {
  it("puts the soonest first, and an undecided time at the top of its day", () => {
    const list = [
      interview({ id: "b", date: "2026-08-19", time: "09:00" }),
      interview({ id: "a", date: "2026-08-18", time: "16:00" }),
      interview({ id: "c", date: "2026-08-18", time: "" }),
    ];
    expect([...list].sort(compareInterviews).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps today's interviews as upcoming for the whole day", () => {
    const { upcoming, past } = splitInterviews(
      [
        interview({ id: "today", date: "2026-08-18", time: "08:00" }),
        interview({ id: "tomorrow", date: "2026-08-19" }),
        interview({ id: "last-week", date: "2026-08-11" }),
      ],
      "2026-08-18",
    );
    expect(upcoming.map((row) => row.id)).toEqual(["today", "tomorrow"]);
    expect(past.map((row) => row.id)).toEqual(["last-week"]);
  });

  it("reads the past newest first", () => {
    const { past } = splitInterviews(
      [
        interview({ id: "older", date: "2026-08-01" }),
        interview({ id: "newer", date: "2026-08-10" }),
      ],
      "2026-08-18",
    );
    expect(past.map((row) => row.id)).toEqual(["newer", "older"]);
  });
});

describe("moving a text piece", () => {
  const list = [
    snippet({ id: "a", sortOrder: 0 }),
    snippet({ id: "b", sortOrder: 1 }),
    snippet({ id: "c", sortOrder: 2 }),
  ];

  it("swaps with its neighbour and renumbers the whole list", () => {
    const moved = moveSnippet(list, "c", -1);
    expect(moved.map((row) => row.id)).toEqual(["a", "c", "b"]);
    expect(moved.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("survives a second move, which renumbering is what makes possible", () => {
    const once = moveSnippet(list, "c", -1);
    expect(moveSnippet(once, "c", -1).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("does nothing at either end", () => {
    expect(moveSnippet(list, "a", -1).map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(moveSnippet(list, "c", 1).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts a list that arrives out of order before touching it", () => {
    const shuffled = [snippet({ id: "b", sortOrder: 1 }), snippet({ id: "a", sortOrder: 0 })];
    expect(compareSnippets(shuffled[0], shuffled[1])).toBeGreaterThan(0);
    expect(moveSnippet(shuffled, "b", -1).map((row) => row.id)).toEqual(["b", "a"]);
  });
});

describe("how long ago an application landed", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const now = new Date(2026, 7, 18, 8, 0);
    expect(formatAge(new Date(2026, 7, 18, 1, 0).toISOString(), now)).toBe("Today");
    // 11pm last night is nine hours ago, and is still yesterday.
    expect(formatAge(new Date(2026, 7, 17, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatAge(new Date(2026, 7, 13, 12, 0).toISOString(), now)).toBe("5 days ago");
  });

  it("gives up on anything old, where a date reads better than a tally", () => {
    const now = new Date(2026, 7, 18, 8, 0);
    expect(formatAge(new Date(2026, 6, 19, 8, 0).toISOString(), now)).toBe("30 days ago");
    expect(formatAge(new Date(2026, 6, 18, 8, 0).toISOString(), now)).toBeNull();
  });

  it("says nothing at all about a date it can't read", () => {
    expect(formatAge("not a date")).toBeNull();
  });
});

describe("exporting the sheet", () => {
  it("writes a header row and one row per application", () => {
    const rows = toApplicationsCsv([application(), application({ id: "a2", firstName: "Lee" })])
      .split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[0].startsWith("Submitted,First name,Last name,Phone")).toBe(true);
    expect(rows[1]).toContain("Jo");
    expect(rows[2]).toContain("Lee");
  });

  it("shows the status as the owner reads it, not as it is stored", () => {
    expect(toApplicationsCsv([application({ status: "interview" })])).toContain("Interview set");
  });

  it("quotes an answer containing a comma, so the columns don't shift", () => {
    const csv = toApplicationsCsv([application({ experience: "Line cook, 2 years" })]);
    expect(csv).toContain('"Line cook, 2 years"');
  });
});
