# Restaurant Website — Build Specification

This document is a complete build spec for an AI agent (or developer) to build this website correctly from scratch. Follow it top to bottom. Do not introduce libraries, patterns, or services not listed here without flagging the deviation first.

---

## 1. Project Overview

A **visual and informational website for a restaurant**. There is **no ordering, cart, or checkout** on this site — online ordering is handled entirely by a third-party company, which this site links out to.

The site's jobs are:
- Show the restaurant well (photos, atmosphere, brand)
- Inform (menu, hours, location, contact)
- Drive people to the third-party ordering link and to call/visit
- Load fast and look great on mobile
- Rank well in local search (SEO)

**Non-goals:** no e-commerce, no user accounts, no payment handling, no CMS (content is edited directly in code).

---

## 2. Tech Stack (do not substitute)

| Concern | Choice |
|---|---|
| Framework | **Next.js (App Router)** |
| Language | **TypeScript** (strict mode on) |
| Styling | **Tailwind CSS** (mobile-first) |
| UI components | **shadcn/ui** |
| Images | **`next/image`** (always) |
| Hosting | **Vercel** |
| Unit/component tests | **Vitest** + **React Testing Library** |
| E2E / mobile tests | **Playwright** (with mobile device projects) |
| Contact form (if built) | **React Hook Form** + **Formspree** or **Resend** (no custom backend) |

Content is managed as **typed data files in the repo**. There is intentionally **no headless CMS**. Updates are made by editing code and pushing to GitHub; Vercel auto-deploys.

---

## 3. Project Structure

Create exactly this structure. Add files within it as needed, but keep the top-level layout.

```
src/
  app/
    layout.tsx          # shared nav + footer + global metadata + JSON-LD
    page.tsx            # home
    menu/page.tsx       # menu
    about/page.tsx      # about / story
    contact/page.tsx    # contact + location + hours
    globals.css         # Tailwind directives + base styles
  components/
    ui/                 # shadcn components live here
    Nav.tsx
    Footer.tsx
    MenuSection.tsx
    OrderButton.tsx     # the prominent 3rd-party ordering CTA
  data/
    site.ts             # single source of truth: name, contact, hours, ordering URL
    menu.ts             # menu as typed data
  lib/
    utils.ts            # shadcn's cn() helper etc.
  tests/
    e2e/                # Playwright specs
public/
  images/               # all images, pre-compressed
```

---

## 4. Data Layer (edit these to update the site)

All editable content lives in `src/data/`. Components must read from these files — **never hardcode the restaurant's name, phone, hours, or menu directly into JSX.**

### `src/data/site.ts`

Single source of truth for site-wide info. Reference `siteConfig` everywhere.

```ts
export const siteConfig = {
  name: "RESTAURANT NAME",
  tagline: "SHORT TAGLINE",
  description: "One-sentence description used for SEO meta description.",
  url: "https://www.example.com",        // production URL
  orderingUrl: "https://order.thirdparty.com/restaurant", // 3rd-party ordering
  phone: "+1-555-555-5555",
  email: "hello@example.com",
  address: {
    street: "123 Main St",
    city: "Clarksville",
    state: "TN",
    zip: "37040",
  },
  // Use 24h "HH:MM" strings; null = closed that day
  hours: {
    monday:    { open: "11:00", close: "21:00" },
    tuesday:   { open: "11:00", close: "21:00" },
    wednesday: { open: "11:00", close: "21:00" },
    thursday:  { open: "11:00", close: "21:00" },
    friday:    { open: "11:00", close: "22:00" },
    saturday:  { open: "11:00", close: "22:00" },
    sunday:    null,
  },
  socials: {
    instagram: "https://instagram.com/...",
    facebook: "https://facebook.com/...",
  },
} as const;
```

### `src/data/menu.ts`

```ts
export type MenuItem = {
  name: string;
  description: string;
  price: number;
  tags?: ("vegetarian" | "gluten-free" | "spicy")[];
};

export type MenuSection = {
  title: string;
  items: MenuItem[];
};

export const menu: MenuSection[] = [
  {
    title: "Starters",
    items: [
      {
        name: "Bruschetta",
        description: "Tomato, basil, garlic",
        price: 9,
        tags: ["vegetarian"],
      },
    ],
  },
];
```

Prices are plain numbers; format to currency in the UI, not in the data.

---

## 5. Pages & What Each Must Contain

**Home (`/`)**
- Hero image + restaurant name + tagline
- Prominent **Order Online** button (links to `siteConfig.orderingUrl`, opens in new tab)
- Quick hits: today's hours, address, phone (all from `siteConfig`)
- A few atmosphere/food photos
- Clear links to Menu, About, Contact

**Menu (`/menu`)**
- Renders all sections from `data/menu.ts` via `MenuSection`
- Show dietary tags visually
- Ordering CTA near top and bottom

**About (`/about`)**
- Story, photos, what makes the place distinct

**Contact (`/contact`)**
- Full hours (from `siteConfig.hours`), address, phone, email
- Embedded map (Google Maps embed of the address)
- Optional contact form (React Hook Form + Formspree/Resend) — only if requested

The **`OrderButton`** component appears in the nav on every page and is visually prominent. Since ordering is the one transactional action and it lives off-site, users must never have to hunt for it.

---

## 6. SEO & Local Discovery (high priority — do not skip)

A restaurant lives or dies on local search. Implement all of:

1. **Global metadata** via the `metadata` export in `app/layout.tsx` — title template, description (from `siteConfig`), Open Graph tags, and a social share image.
2. **Per-page metadata** — each page exports its own `metadata` with a unique title/description.
3. **JSON-LD structured data** — inject a `Restaurant` schema (`@type: "Restaurant"`) in `layout.tsx` including `name`, `address`, `telephone`, `openingHoursSpecification`, `servesCuisine`, `priceRange`, and `url`. Build it from `siteConfig` so it never drifts from the visible content. This is what powers the Google hours/map card.
4. **`sitemap.ts`** and **`robots.ts`** in `app/` (Next.js generates these natively).
5. Semantic HTML and a single `<h1>` per page.

---

## 7. Performance & Mobile (the make-or-break)

Images are the #1 thing that wrecks restaurant-site performance. Enforce:

- **Always use `next/image`** — never raw `<img>`. Set `sizes` appropriately; mark only the hero as `priority`.
- **Pre-compress all images** before adding to `public/images/`. No raw multi-MB phone photos. Prefer modern formats (WebP/AVIF).
- **Mobile-first Tailwind**: write base (mobile) styles, layer `md:`/`lg:` for larger screens.
- **Tap targets** ≥ ~44px tall; **body text** ≥ 16px.
- Target Lighthouse mobile **Performance ≥ 90** and **Accessibility ≥ 95**. Treat these as acceptance criteria.
- Use `next/font` for fonts (no render-blocking external font CSS).

---

## 8. Testing

### Vitest + React Testing Library (unit/component)
- Test that `MenuSection` renders items, prices, and tags from data.
- Test that `OrderButton` points to `siteConfig.orderingUrl` and opens in a new tab.
- Test that `Nav`/`Footer` render links from `siteConfig`.

### Playwright (E2E + mobile)
Configure mobile device projects from day one in `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/tests/e2e",
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "iPhone",         use: { ...devices["iPhone 14"] } },
    { name: "Android",        use: { ...devices["Pixel 7"] } },
  ],
});
```

E2E specs must cover:
- Every page loads and shows its key content
- Nav works across all pages
- The ordering CTA is visible and links correctly on mobile viewports
- No horizontal scroll / layout breakage on mobile widths

---

## 9. Conventions & Guardrails

- **TypeScript strict mode on.** No `any` unless justified in a comment.
- **No hardcoded content** — name, phone, hours, menu, ordering URL all come from `src/data`.
- **No new dependencies** outside Section 2 without flagging the reason first.
- **No CMS, no database, no backend.** Static content only.
- Accessibility: all images need meaningful `alt`; the ordering link needs accessible text; color contrast must pass.
- External links (ordering, socials) open in a new tab with `rel="noopener noreferrer"`.
- Keep components small and presentational; data shaping stays in `src/data` or `src/lib`.

---

## 10. Setup & Commands

```bash
# Scaffold
npx create-next-app@latest . --typescript --tailwind --app --eslint

# shadcn/ui
npx shadcn@latest init

# Testing
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm i -D @playwright/test
npx playwright install

# Forms (only if contact form is built)
npm i react-hook-form
```

Expected `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "test:e2e": "playwright test"
  }
}
```

---

## 11. Deployment

- Push to **GitHub**.
- Connect the repo to **Vercel**; it auto-detects Next.js.
- Every push gets a **preview URL** — open it on a real phone to QA mobile before promoting.
- `main` branch deploys to production.
- Set the production domain and update `siteConfig.url` to match.

---

## 12. Definition of Done

- [ ] All four pages built and reading from `src/data`
- [ ] Ordering CTA prominent on every page, links to third-party URL in a new tab
- [ ] `next/image` used everywhere; images pre-compressed
- [ ] Global + per-page metadata and `Restaurant` JSON-LD in place
- [ ] `sitemap.ts` and `robots.ts` present
- [ ] Vitest component tests pass
- [ ] Playwright E2E passes on Desktop, iPhone, and Android projects
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95
- [ ] No horizontal scroll on mobile; tap targets and font sizes meet minimums
- [ ] Deployed to Vercel with correct production domain
