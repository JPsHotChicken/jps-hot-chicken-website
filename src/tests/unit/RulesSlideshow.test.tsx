import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RulesSlideshow } from "@/components/staff/RulesSlideshow";
import { signRulesSlideAction } from "@/app/staff/actions";
import { RULE_SLIDES, type RuleSignature, type RuleSlideId } from "@/lib/staff-rules";

vi.mock("@/app/staff/actions", () => ({ signRulesSlideAction: vi.fn() }));

const sign = vi.mocked(signRulesSlideAction);

const signed = (slideId: RuleSlideId): RuleSignature => ({
  slideId,
  signedName: "Noah Williams",
  signedAt: "2026-09-20T15:00:00Z",
});

beforeEach(() => {
  sign.mockReset();
  sign.mockImplementation(async (slideId, signedName) => ({
    ok: true,
    signature: { slideId: slideId as RuleSlideId, signedName, signedAt: "2026-09-20T15:00:00Z" },
  }));
});

const nameBox = () => screen.getByLabelText(/Your signature/);
const next = () => screen.getByRole("button", { name: "Next" });

function typeAndSign(name: string) {
  fireEvent.change(nameBox(), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Sign" }));
}

describe("RulesSlideshow", () => {
  it("opens on the first page, says how many there are, and won't go on unsigned", () => {
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    expect(screen.getByText(`Page 1 of ${RULE_SLIDES.length}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /write-up/i })).toBeInTheDocument();
    expect(next()).toBeDisabled();
    // Every later page in the list is locked too.
    expect(screen.getByRole("button", { name: /Page 2, Phones, locked/ })).toBeDisabled();
  });

  it("takes the name on the signature line itself, in the cursive font", () => {
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    // One box to type in — the signature line — not a separate name field.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    fireEvent.change(nameBox(), { target: { value: "Noah Williams" } });
    expect(nameBox()).toHaveValue("Noah Williams");
    expect(nameBox()).toHaveClass("font-stub");
  });

  it("signs on Enter from the signature line", async () => {
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    fireEvent.change(nameBox(), { target: { value: "Noah Williams" } });
    fireEvent.keyDown(nameBox(), { key: "Enter" });

    await waitFor(() => expect(sign).toHaveBeenCalledWith("write-ups", "Noah Williams"));
  });

  it("turns away random letters without asking the server", () => {
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    typeAndSign("qwerty asdf");

    expect(screen.getByRole("alert")).toHaveTextContent(/first name/);
    expect(sign).not.toHaveBeenCalled();
    expect(next()).toBeDisabled();
  });

  it("signs a page with the full name, then lets them move on", async () => {
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    typeAndSign("Noah Williams");

    await waitFor(() => expect(sign).toHaveBeenCalledWith("write-ups", "Noah Williams"));
    expect(await screen.findByText("You signed this page")).toBeInTheDocument();
    expect(next()).toBeEnabled();

    fireEvent.click(next());
    expect(screen.getByText(`Page 2 of ${RULE_SLIDES.length}`)).toBeInTheDocument();
    // A fresh page wants its own signature.
    expect(nameBox()).toHaveValue("");
    expect(next()).toBeDisabled();
  });

  it("shows the server's refusal against the signature", async () => {
    sign.mockResolvedValueOnce({ ok: false, error: "Sign the pages before this one first." });
    render(<RulesSlideshow employeeName="Noah" initialSignatures={[]} />);

    typeAndSign("Noah Williams");

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign the pages before this one");
    expect(next()).toBeDisabled();
  });

  it("picks up where they left off, and lets them go back", () => {
    render(
      <RulesSlideshow
        employeeName="Noah"
        initialSignatures={[signed("write-ups"), signed("phones")]}
      />,
    );

    expect(screen.getByText(`Page 3 of ${RULE_SLIDES.length}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Page 4, Sign-off, locked/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(`Page 2 of ${RULE_SLIDES.length}`)).toBeInTheDocument();

    // The page list jumps to any page up to the first unsigned one.
    fireEvent.click(screen.getByRole("button", { name: /Page 1, Write-ups, signed/ }));
    expect(screen.getByText(`Page 1 of ${RULE_SLIDES.length}`)).toBeInTheDocument();
  });

  it("folds down to one line once everything is signed, and opens to review", () => {
    render(
      <RulesSlideshow
        employeeName="Noah"
        initialSignatures={RULE_SLIDES.map((slide) => signed(slide.id))}
      />,
    );

    expect(screen.getByText(`All ${RULE_SLIDES.length} pages signed · Sep 20, 2026`)).toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(`Page 1 of ${RULE_SLIDES.length}`)).toBeInTheDocument();
    expect(screen.getByTestId("signature-preview")).toHaveTextContent("Noah Williams");
  });
});
