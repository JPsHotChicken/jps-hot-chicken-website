import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

import { InteriorSlideshow } from "@/components/InteriorSlideshow";

const IMAGES = Array.from({ length: 3 }, (_, i) => ({
  src: `/images/interior/photo${i + 1}.jpeg`,
  alt: `Interior photo ${i + 1}`,
}));

/** The large image is the only one with alt text; the thumbnails are decorative. */
const currentPhoto = () =>
  screen.getByRole("img", { name: /interior photo/i }).getAttribute("src");

const arrow = (name: "Previous photo" | "Next photo") =>
  screen.getByRole("button", { name });
const thumbnail = (n: number) =>
  screen.getByRole("button", { name: `Show photo ${n} of ${IMAGES.length}` });

describe("InteriorSlideshow", () => {
  it("starts on the first photo and previews every photo underneath", () => {
    render(<InteriorSlideshow images={IMAGES} />);

    expect(currentPhoto()).toBe(IMAGES[0].src);
    expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();
    // One thumbnail per photo, in order, with the current one marked.
    IMAGES.forEach((image, i) => {
      expect(thumbnail(i + 1).querySelector("img")).toHaveAttribute("src", image.src);
    });
    expect(thumbnail(1)).toHaveAttribute("aria-current", "true");
    expect(thumbnail(2)).not.toHaveAttribute("aria-current");
  });

  it("advances with the next arrow", () => {
    render(<InteriorSlideshow images={IMAGES} />);

    fireEvent.click(arrow("Next photo"));

    expect(currentPhoto()).toBe(IMAGES[1].src);
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
    expect(thumbnail(2)).toHaveAttribute("aria-current", "true");
  });

  it("jumps straight to any photo from its preview", () => {
    render(<InteriorSlideshow images={IMAGES} />);

    fireEvent.click(thumbnail(3));
    expect(currentPhoto()).toBe(IMAGES[2].src);

    fireEvent.click(thumbnail(1));
    expect(currentPhoto()).toBe(IMAGES[0].src);
  });

  it("wraps around when stepping back from the first photo", () => {
    render(<InteriorSlideshow images={IMAGES} />);

    fireEvent.click(arrow("Previous photo"));

    expect(currentPhoto()).toBe(IMAGES[2].src);
    expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
  });

  it("moves with the left/right arrow keys", () => {
    render(<InteriorSlideshow images={IMAGES} />);
    const carousel = screen.getByRole("group", { name: /trenton interior photos/i });

    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(currentPhoto()).toBe(IMAGES[2].src);

    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(currentPhoto()).toBe(IMAGES[1].src);
  });

  it("renders nothing without photos", () => {
    const { container } = render(<InteriorSlideshow images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
