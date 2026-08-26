import type { Metadata } from "next";
import Link from "next/link";

import { siteConfig } from "@/data/site";

/**
 * The Privacy Policy. Google Ads' review checklist treats a reachable privacy
 * policy as a hard requirement, so this page is linked from the footer of every
 * page, listed in the sitemap, and `/privacy-policy` redirects here
 * (see `next.config.ts`).
 *
 * Everything below describes what the site actually does today — the analytics
 * in `(site)/layout.tsx`, the careers form in `api/apply`, and the third parties
 * those depend on. If that stack changes, this page has to change with it.
 */

/** The day this wording last changed. Bump it whenever the text below does. */
const EFFECTIVE_DATE = "August 25, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, and protects personal information on jpshotchicken.com — cookies, analytics, advertising, job applications, and how to contact us about your data.`,
  alternates: { canonical: "/privacy" },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold tracking-tight text-brand">{title}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

const LINK = "font-semibold text-brand underline underline-offset-2 hover:no-underline";

export default function PrivacyPage() {
  const { privacyEmail, locations, name, url } = siteConfig;
  const mailto = `mailto:${privacyEmail}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="font-heading text-sm font-semibold tracking-[0.3em] text-brand">
          Legal
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <div className="mt-8 space-y-4 text-lg leading-relaxed text-foreground/90">
        <p>
          {name} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates{" "}
          {url.replace("https://", "")} and the restaurants listed on it. This policy
          explains what personal information we collect through this website, why we
          collect it, who we share it with, how long we keep it, and the choices you
          have. It applies to this website only — not to the separate ordering and
          delivery platforms we link to, each of which publishes its own policy.
        </p>
      </div>

      <Section title="Information you give us">
        <p>
          <strong>Job applications.</strong> If you apply through our careers page, we
          collect your first and last name, phone number, email address, age range,
          whether you are authorized to work in the United States, the position and
          location you are applying for, your availability, whether you want full-time or
          part-time work, your past food-service and other work experience, and whether
          you have reliable transportation. You provide all of it voluntarily, and we use
          it only to consider you for a job with us.
        </p>
        <p>
          <strong>Messages.</strong> If you email or call us, we keep your message and
          contact details so we can reply and follow up.
        </p>
        <p>
          <strong>No payments here.</strong>{" "}
          We do not take orders or accept payment on
          this website. Ordering happens on our ordering and delivery partners&rsquo;
          sites, so we never see or store your card number.
        </p>
      </Section>

      <Section title="Information collected automatically">
        <p>
          When you visit, our analytics tools record standard technical information: the
          pages you view, the site or ad that referred you, the approximate city or region
          derived from your IP address, your device and browser type, screen size,
          language, and the date and time of your visit. We use this in aggregate to see
          which pages and locations people are interested in and whether our advertising
          is working. We do not use it to identify you personally.
        </p>
      </Section>

      <Section title="Cookies and similar technologies">
        <p>
          <strong>Essential cookies.</strong> A small number of cookies keep our staff and
          management tools signed in. They are set only for employees who log in and are
          never used for advertising.
        </p>
        <p>
          <strong>Analytics.</strong> We use Google Analytics 4, which sets cookies to
          tell repeat visits apart from new ones, and Vercel Analytics, which is
          cookieless and does not follow you across other websites.
        </p>
        <p>
          <strong>Advertising.</strong> We advertise with Google. Google and its partners
          may use cookies and similar identifiers to measure clicks on our ads and to show
          our ads to people who have visited this site. You can control this at{" "}
          <a href="https://myadcenter.google.com" className={LINK} target="_blank" rel="noopener noreferrer">
            Google My Ad Center
          </a>{" "}
          or opt out of Google Analytics entirely with the{" "}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            className={LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Analytics opt-out browser add-on
          </a>
          . Every major browser also lets you block or delete cookies in its settings.
          Blocking analytics and advertising cookies will not stop you from using this
          site. Our site does not currently respond to browser &ldquo;Do Not Track&rdquo;
          signals.
        </p>
      </Section>

      <Section title="How we use information">
        <p>
          We use what we collect to answer your questions, review and respond to job
          applications, run and improve this website, understand which pages and
          restaurants people visit, measure and improve our advertising, keep the site
          secure and free of abuse, and meet our legal and record-keeping obligations. We
          do not use automated decision-making to accept or reject job applicants — a
          person reads every application.
        </p>
      </Section>

      <Section title="Third parties we share information with">
        <p>
          We do not sell your personal information, and we do not rent or trade it. We
          share it only with the service providers that make this site work, and only as
          much as each needs to do its job:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Vercel</strong> — hosts the website and provides privacy-friendly
            traffic analytics.
          </li>
          <li>
            <strong>Google</strong> — Analytics and Ads for measurement and advertising,
            and Google Workspace for the email inbox and the spreadsheet where new job
            applications are logged.
          </li>
          <li>
            <strong>Supabase</strong> — the database that stores job applications and our
            internal staff scheduling.
          </li>
          <li>
            <strong>Resend</strong> — delivers the email notification when an application
            is submitted.
          </li>
          <li>
            <strong>Our ordering and delivery partners</strong> — SkyTab and Toast for
            online pickup orders, and DoorDash and Uber Eats for delivery. Once you follow
            one of those links you are on their website, and their privacy policy and
            terms govern what happens there.
          </li>
        </ul>
        <p>
          We may also disclose information if the law requires it, to respond to a valid
          legal request, to protect our rights, safety, or property, or in connection with
          a sale or transfer of the business.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep job applications for up to two years so we can consider you for future
          openings, unless you ask us to delete yours sooner. Emails and phone messages
          stay in our business inbox for as long as we have a business reason to keep
          them. Analytics data is retained for up to 14 months, after which Google deletes
          it automatically. Records we are required by law to keep — tax and employment
          records, for example — are kept for the period the law specifies.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can ask us what personal information we hold about you, ask us to correct
          it, or ask us to delete it, by emailing{" "}
          <a href={mailto} className={LINK}>
            {privacyEmail}
          </a>
          . We will respond within 30 days. Deleting a pending job application means we can
          no longer consider you for the role. You can opt out of analytics and
          advertising cookies using the links above at any time, and you can ask us to
          stop emailing you by replying to any message we send.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This website is not directed to children under 13, and we do not knowingly
          collect personal information from them. Job applicants must be at least 16. If
          you believe a child has given us personal information, email us and we will
          delete it.
        </p>
      </Section>

      <Section title="Security">
        <p>
          The site is served over HTTPS, and access to job applications and staff records
          is limited to the owner and the managers who need it, each behind their own
          sign-in. No method of transmission or storage is completely secure, so we cannot
          guarantee absolute security, but we take reasonable steps to protect what you
          give us.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change how we handle personal information, we will update this page and
          change the effective date at the top. Material changes will be reflected here
          before they take effect, so it is worth checking back if it has been a while.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          Questions about this policy, or about your personal information, go to{" "}
          <a href={mailto} className={LINK}>
            {privacyEmail}
          </a>
          . You can also reach us by mail or in person at either restaurant:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          {locations.map((loc) => (
            <li key={loc.slug}>
              <strong>{name} — {loc.name}</strong>
              <br />
              {loc.streetNumber} {loc.street}, {loc.city}, {loc.state} {loc.zip}
            </li>
          ))}
        </ul>
        <p>
          Hours, phone numbers, and directions for both restaurants are on our{" "}
          <Link href="/contact" className={LINK}>
            contact page
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
