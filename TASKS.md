# Restaurant Website — Build Task List

An ordered, step-by-step task list for an AI agent to build this project. Work through phases **in order** — each phase depends on the ones before it. Do not skip ahead. Check off each task as it's completed. Refer to `README.md` for the full spec behind each step; do not deviate from the stack or conventions defined there.

> **Status (build complete):** Phases 0–8 are done and verified. Phase 9 (deployment to
> GitHub + Vercel) requires the owner's accounts and is the only remaining work. See the
> "Owner action items" at the bottom.

---

## Phase 0 — Prerequisites & Ground Rules

- [x] Read `README.md` in full before writing any code.
- [x] Confirm Node.js LTS is installed. _(Node 26 via Homebrew at `/opt/homebrew/bin`.)_
- [x] Do not introduce any library, service, or pattern not listed in README Section 2. _(Testing deps are per Section 2; see "Deviations flagged" below.)_
- [x] Remember the core constraints: **no ordering/cart/checkout, no CMS, no database, no backend.**

---

## Phase 1 — Scaffold the Project

- [x] Initialize the app with `create-next-app` (TypeScript, Tailwind, App Router, ESLint, `src/`).
- [x] Confirm App Router (not Pages Router) is in use.
- [x] Enable **TypeScript strict mode** in `tsconfig.json`. _(On by default.)_
- [x] Initialize shadcn/ui (`npx shadcn@latest init`).
- [x] Verify `src/lib/utils.ts` exists with the `cn()` helper.
- [x] Get a blank dev server running with no errors. _(Verified via `next build` + `next start`.)_
- [~] Make the first commit and push to GitHub. _(Local commits made; **push pending owner** — see Phase 9.)_

---

## Phase 2 — Create the Folder Structure

- [x] Build out the directory tree as defined in README Section 3.
- [x] Create `components/Nav.tsx`, `Footer.tsx`, `MenuSection.tsx`, `OrderButton.tsx`.
- [x] Create `src/data/site.ts` and `src/data/menu.ts`.
- [x] Create `src/tests/e2e/`.
- [x] Create `public/images/`.

---

## Phase 3 — Build the Data Layer

- [x] Create `src/data/site.ts` with the `siteConfig` object (placeholders flagged with ⚠️).
- [x] Create `src/data/menu.ts` with the `MenuItem` / `MenuSection` types and the `menu` array.
- [x] Confirm both files type-check with no errors.
- [x] Rule enforced: every component reads from these files. _(Brand wordmark is derived from `siteConfig.name`.)_

---

## Phase 4 — Shared Layout & Global Setup

- [x] `app/globals.css` with Tailwind v4 directives + base styles + brand tokens.
- [x] Fonts via `next/font` (Inter body + Oswald headings, `display: swap`).
- [x] `components/OrderButton.tsx` — prominent CTA, opens in new tab with `rel="noopener noreferrer"`.
- [x] `components/Nav.tsx` — links + OrderButton, responsive (hamburger on mobile).
- [x] `components/Footer.tsx` — address, phone, hours, socials, all from `siteConfig`.
- [x] `app/layout.tsx` — wires Nav + Footer, global `metadata`, JSON-LD, skip-to-content link.
- [x] Verify Nav and Footer render across mobile and desktop widths.

---

## Phase 5 — Build the Pages

- [x] **Home (`app/page.tsx`)** — hero + name + tagline, prominent CTA, today's hours/address/phone, gallery, links.
- [x] **Menu (`app/menu/page.tsx`)** — `MenuSection` renders all data sections, dietary tags, currency formatting, CTA top + bottom.
- [x] **About (`app/about/page.tsx`)** — story + photos.
- [x] **Contact (`app/contact/page.tsx`)** — full hours, address, phone, email, embedded Google Map.
- [x] Contact form — **skipped** (optional; not requested).
- [x] Verify all four pages load and navigation works between them.

---

## Phase 6 — SEO & Local Discovery

- [x] Global `metadata` in `layout.tsx`: title template, description, Open Graph, social share image.
- [x] Each page exports unique `metadata` (title + description).
- [x] **`Restaurant` JSON-LD** in `layout.tsx`, built from `siteConfig` (verified in rendered HTML).
- [x] `app/sitemap.ts`.
- [x] `app/robots.ts`.
- [x] Generated social share image via `app/opengraph-image.tsx` (`next/og`).
- [x] Semantic HTML and a single `<h1>` per page (verified by E2E).

---

## Phase 7 — Performance & Mobile Hardening

- [x] `next/image` everywhere (no raw `<img>`); `sizes` set; only hero `priority`.
- [x] All images pre-compressed WebP in `public/images/` (~12–22 KB each, 104 KB total).
- [x] Mobile-first Tailwind audited.
- [x] Tap targets ≥ 44px; body text ≥ 16px.
- [x] No horizontal scroll at mobile widths (verified by E2E on iPhone + Pixel).
- [x] Lighthouse (mobile): **Performance 97–99**, **Accessibility 100**, color-contrast PASS on all four pages.

---

## Phase 8 — Testing

- [x] Vitest + React Testing Library + jsdom configured (`vitest.config.mts`).
- [x] Component tests: `MenuSection`, `OrderButton`, `Nav`, `Footer` (14 tests).
- [x] Playwright installed; browsers installed (Chromium + WebKit).
- [x] `playwright.config.ts` with Desktop Chrome, iPhone 14, Pixel 7 projects.
- [x] E2E specs: page loads, nav, ordering CTA, no horizontal scroll (30 tests).
- [x] `test` and `test:e2e` scripts in `package.json`.
- [x] All unit (14) and E2E (30) tests pass.

---

## Phase 9 — Deployment  *(owner action required)*

- [~] Push the repo to GitHub. _(Committed locally; needs the owner's GitHub remote + auth.)_
- [ ] Connect the repo to Vercel (auto-detects Next.js).
- [ ] Verify a preview URL builds; QA on a real phone.
- [ ] Set the production domain.
- [ ] Update `siteConfig.url` to match the production domain.
- [ ] Promote to production from `main`.

---

## Phase 10 — Final Verification (Definition of Done)

- [x] All four pages built and reading from `src/data`.
- [x] Ordering CTA prominent on every page, links to third-party URL in a new tab.
- [x] `next/image` everywhere; images pre-compressed.
- [x] Global + per-page metadata and `Restaurant` JSON-LD in place.
- [x] `sitemap.ts` and `robots.ts` present.
- [x] Vitest component tests pass (14).
- [x] Playwright E2E passes on Desktop, iPhone, and Android (30).
- [x] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95. _(97–99 / 100.)_
- [x] No horizontal scroll on mobile; tap targets and font sizes meet minimums.
- [ ] Deployed to Vercel with correct production domain. _(Phase 9 — owner action.)_
- [~] Placeholder values in `siteConfig` flagged for the owner (see below).

---

## Owner action items (placeholders to replace)

In `src/data/site.ts`, replace the ⚠️-flagged placeholders before launch:

- `url` — real production domain (also update after Vercel deploy).
- `orderingUrl` — real third-party online-ordering link.
- `phone` — real phone number.
- `address` — real street address (currently the Clarksville, TN example).
- `socials.instagram` / `socials.facebook` — real profile URLs.

Replace the placeholder images in `public/images/*.webp` with real photography
(keep the same filenames/sizes). Regenerate placeholders any time with `npm run gen:images`.

`email` is already the real address (`jpshotchicken@gmail.com`).

## Deviations flagged

- **shadcn/ui** pulled in its standard peers (`@base-ui/react`, `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`) — all part of the shadcn/ui
  choice in README Section 2.
- Lucide v1 removed brand icons, so Instagram/Facebook glyphs are small inline SVGs in
  `src/components/icons.tsx`.
- Testing infra uses `@vitejs/plugin-react` (pinned to v4 to avoid a Babel 8 peer conflict),
  `vite-tsconfig-paths`, `jsdom`, and `@testing-library/*` — all standard for the README's
  Vitest + RTL choice.
- Brand color adjusted to a WCAG-AA-passing red-orange (with a lighter `--brand-light`
  tint for the dark footer) so the contrast/accessibility acceptance criteria pass.
