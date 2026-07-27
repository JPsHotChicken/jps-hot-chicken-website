// JP's Hot Chicken — careers application collector.
// Appends one row per application submitted on the website.
// Setup instructions: see docs/applications-sheet-setup.md

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
