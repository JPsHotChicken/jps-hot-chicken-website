import Script from "next/script";

/**
 * Microsoft Clarity — heatmaps and session replay.
 *
 * The project ID is public by design; it appears in the page source of every
 * site running Clarity and grants no access to the dashboard.
 *
 * Rendered from the (site) layout only, never app-wide. Clarity records what
 * visitors see and do, and the admin, staff, and operations areas show payroll
 * figures, tip sheets, and scheduling — none of which should be shipped to a
 * third party's replay viewer.
 *
 * `afterInteractive`: replay is not needed to paint the page, and blocking
 * first render on an analytics script is what makes a paid click bounce.
 */
const CLARITY_PROJECT_ID = "yjx347b0h8";

export function ClarityTag() {
  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
      `}
    </Script>
  );
}
