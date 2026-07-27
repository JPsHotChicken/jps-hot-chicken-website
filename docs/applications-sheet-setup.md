# Collect job applications in a Google Sheet

Every application submitted on the website can be automatically added as a new
row in a Google Sheet you own. You'll still get the email notification too — the
sheet is just a permanent, sortable record of everyone who has applied.

This is a **one-time setup**, about 5 minutes. You do not share any password with
the website — it only ever sends data *to* your sheet through a small script you
create and control.

---

## Step 1 — Create the sheet

1. Go to <https://sheets.new> (signed in as **jpshotchicken@gmail.com**).
2. Rename it something like **"JP's Hot Chicken — Applications"**.
3. You don't need to add column headers — the script adds them automatically.

## Step 2 — Add the script

1. In that sheet, click **Extensions → Apps Script**.
2. Delete whatever code is in the editor, then paste in the code from
   [`apps-script.gs`](./apps-script.gs) (also shown at the bottom of this file).
3. *(Optional but recommended)* Change the `TOKEN` line to a long random string,
   e.g. `const TOKEN = "jp-2026-8Kd9fQ2pL";`. Keep this value — you'll paste the
   same one into Vercel in Step 4.
4. Click the **Save** icon (💾).

## Step 3 — Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** anything (e.g. "Careers collector")
   - **Execute as:** **Me** (your account)
   - **Who has access:** **Anyone**
4. Click **Deploy**.
5. It will ask you to **Authorize access** — approve it (it's your own script;
   Google may show a "not verified" warning, click *Advanced → Go to … (unsafe)*
   since it's your own project).
6. Copy the **Web app URL** — it ends in `/exec`. You'll need it next.

> "Who has access: Anyone" is required so the website's server can send rows to
> it. This does **not** make your spreadsheet public. Only this script endpoint
> accepts data, and if you set a `TOKEN`, only requests carrying that token are
> recorded. The sheet stays private to your Google account.

## Step 4 — Tell the website where the sheet is (Vercel)

1. Go to your project on **Vercel → Settings → Environment Variables**.
2. Add:
   - `SHEETS_WEBHOOK_URL` = the `/exec` URL you copied
   - `SHEETS_WEBHOOK_TOKEN` = the same random string as `TOKEN` *(skip if you
     left `TOKEN` blank)*
3. Set them for **Production** (and Preview if you like), then **Save**.
4. **Redeploy** the site (Vercel → Deployments → ⋯ → Redeploy) so the new
   settings take effect.

## Step 5 — Test it

1. Open the live site's **Careers → Apply** page and submit a test application.
2. Within a second or two, a new row should appear in your sheet.
3. Delete the test row when you're happy it works.

---

## Updating the script later

If you ever change the Apps Script code, the change won't go live until you
publish a new version:

**Deploy → Manage deployments → (pencil/Edit) → Version: New version → Deploy.**
The web app URL stays the same, so you don't need to touch Vercel again.

## Columns the sheet will have

| Timestamp | First name | Last name | Phone | Email | Age | Work authorized | Position | Location | Availability | Employment | Prior food service | Experience | Transportation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

(Everyone in the sheet has confirmed they're 16 or older — the form blocks
under-16 applicants before they can submit, so there's no separate column for it;
the **Age** column has their actual age.)

---

## The script (`apps-script.gs`)

```javascript
// JP's Hot Chicken — careers application collector.
// Appends one row per application submitted on the website.

// OPTIONAL: set this to a long random string and put the SAME value in Vercel
// as SHEETS_WEBHOOK_TOKEN. Leave "" to accept any request.
const TOKEN = "";

const SHEET_NAME = "Applications";
const HEADERS = [
  "Timestamp", "First name", "Last name", "Phone", "Email", "Age",
  "Work authorized", "Position", "Location", "Availability",
  "Employment", "Prior food service", "Experience", "Transportation",
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (TOKEN && body.token !== TOKEN) {
      return json({ ok: false, error: "unauthorized" });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    sheet.appendRow([
      new Date(),
      body.firstName || "",
      body.lastName || "",
      body.phone || "",
      body.email || "",
      body.age || "",
      body.workAuthorized || "",
      body.position || "",
      body.location || "",
      body.availability || "",
      body.employmentType || "",
      body.foodService || "",
      body.experience || "",
      body.transportation || "",
    ]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Lets you confirm the deployment is public by opening the /exec URL in a
// browser — you should see {"ok":true,...} instead of a Google error page.
function doGet() {
  return json({ ok: true, message: "JP's application collector is live." });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```
