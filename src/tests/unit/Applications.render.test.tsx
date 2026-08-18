import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Applications } from "@/components/admin/Applications";
import type { Application, Interview, TextSnippet } from "@/lib/applications";

// Both of these are Server Actions, which have no meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));
vi.mock("@/app/admin/applications/actions", () => ({
  setStatusAction: vi.fn(async () => {}),
  setNoteAction: vi.fn(async () => {}),
  deleteApplicationAction: vi.fn(async () => {}),
  createInterviewAction: vi.fn(async (draft) => ({ id: "new-interview", ...draft })),
  updateInterviewAction: vi.fn(async (id, draft) => ({ id, ...draft })),
  deleteInterviewAction: vi.fn(async () => {}),
  createSnippetAction: vi.fn(async (title: string, body: string) => ({
    id: "new-snippet",
    title,
    body,
    sortOrder: 0,
  })),
  updateSnippetAction: vi.fn(async (id: string, title: string, body: string) => ({
    id,
    title,
    body,
    sortOrder: 0,
  })),
  deleteSnippetAction: vi.fn(async () => {}),
  reorderSnippetsAction: vi.fn(async () => {}),
  reloadApplicationsAction: vi.fn(async () => ({
    applications: [],
    interviews: [],
    snippets: [],
  })),
}));

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    submittedAt: new Date().toISOString(),
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
    experience: "Two years on a line",
    transportation: "Yes",
    status: "new",
    note: "",
    ...overrides,
  };
}

function setup({
  applications = [application()],
  interviews = [] as Interview[],
  snippets = [] as TextSnippet[],
} = {}) {
  return render(
    <Applications applications={applications} interviews={interviews} snippets={snippets} />,
  );
}

/** Move to one of the three sections the way the owner does. */
const openSection = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("the applications sheet", () => {
  it("lists an applicant with the columns you skim on", () => {
    setup();
    const row = screen.getByText("Jo Ruiz").closest("tr")!;
    expect(within(row).getByText("Kitchen Staff")).toBeInTheDocument();
    expect(within(row).getByText("(931) 555-0142")).toBeInTheDocument();
  });

  it("keeps what they wrote out of the way until the row is opened", () => {
    setup();
    expect(screen.queryByText("Two years on a line")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show Jo Ruiz's answers/ }));
    expect(screen.getByText("Two years on a line")).toBeInTheDocument();
    expect(screen.getByText("jo@example.com")).toBeInTheDocument();
  });

  it("says so plainly when nobody has applied", () => {
    setup({ applications: [] });
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
  });

  it("searches on a phone number as readily as a name", () => {
    setup({
      applications: [application(), application({ id: "a2", firstName: "Lee", phone: "" })],
    });
    fireEvent.change(screen.getByLabelText("Search applications"), {
      target: { value: "5550142" },
    });
    expect(screen.getByText("Jo Ruiz")).toBeInTheDocument();
    expect(screen.queryByText("Lee Ruiz")).not.toBeInTheDocument();
  });
});

describe("setting an interview from an application", () => {
  it("carries the applicant into the interview form and switches to it", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Show Jo Ruiz's answers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Set an interview" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Jo Ruiz");
    expect(screen.getByLabelText("Phone")).toHaveValue("+19315550142");
    // The date is deliberately left blank — it is the one thing being decided.
    expect(screen.getByLabelText("Date")).toHaveValue("");
  });
});

describe("the interviews section", () => {
  const interview: Interview = {
    id: "22222222-2222-4222-8222-222222222222",
    applicationId: null,
    name: "Sam Doyle",
    phone: "+19315550188",
    date: "2099-08-18",
    time: "14:30",
    note: "Applying for kitchen",
  };

  it("shows a booked interview with the time spoken the way it is read", () => {
    setup({ interviews: [interview] });
    openSection(/Set interview dates/);
    expect(screen.getByText("Sam Doyle")).toBeInTheDocument();
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
  });

  it("flags a date that still has no time on it", () => {
    setup({ interviews: [{ ...interview, time: "" }] });
    openSection(/Set interview dates/);
    expect(screen.getByText("no time set")).toBeInTheDocument();
  });

  it("won't save an interview with nobody's name on it", () => {
    setup();
    openSection(/Set interview dates/);
    fireEvent.click(screen.getByRole("button", { name: /Add interview/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("A name is needed");
  });
});

describe("the text info section", () => {
  const snippet: TextSnippet = {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Interview invite",
    body: "Come in Tuesday at 2 and ask for JP.",
    sortOrder: 0,
  };

  it("shows a saved piece with the copy button that is the point of it", () => {
    setup({ snippets: [snippet] });
    openSection(/Text info/);
    expect(screen.getByText("Come in Tuesday at 2 and ask for JP.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("refuses to save a piece with no text in it", () => {
    setup();
    openSection(/Text info/);
    fireEvent.click(screen.getByRole("button", { name: /New piece/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no text to save");
  });

  it("invites the owner to write one when the list is empty", () => {
    setup({ snippets: [] });
    openSection(/Text info/);
    expect(screen.getByText("No saved text yet")).toBeInTheDocument();
  });
});
