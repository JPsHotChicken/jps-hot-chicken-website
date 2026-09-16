import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isPaidVisit,
  parseAttribution,
  primaryClickId,
  readAttribution,
  rememberAttribution,
} from "@/lib/attribution";
import { validateCateringForm } from "@/lib/catering";

/* --------------------------------------------------------------- parsing */

describe("parseAttribution", () => {
  it("pulls gclid off a landing URL", () => {
    expect(parseAttribution("?gclid=abc123")).toEqual({ gclid: "abc123" });
  });

  it("captures gbraid and wbraid, not just gclid", () => {
    // The whole point: on iOS, Google strips gclid and sends these instead.
    // Missing them means silently losing iOS conversions.
    expect(parseAttribution("?gbraid=ios-app")).toEqual({ gbraid: "ios-app" });
    expect(parseAttribution("?wbraid=ios-web")).toEqual({ wbraid: "ios-web" });
  });

  it("captures UTM parameters alongside the click id", () => {
    const result = parseAttribution("?gclid=x&utm_source=google&utm_campaign=brand");
    expect(result).toEqual({ gclid: "x", utm_source: "google", utm_campaign: "brand" });
  });

  it("ignores unrelated query parameters", () => {
    expect(parseAttribution("?ref=newsletter&page=2")).toEqual({});
  });

  it("ignores empty values", () => {
    expect(parseAttribution("?gclid=")).toEqual({});
  });

  it("truncates an absurdly long value rather than storing it whole", () => {
    const result = parseAttribution(`?gclid=${"a".repeat(2000)}`);
    expect(result.gclid).toHaveLength(512);
  });
});

/* ------------------------------------------------------ click id priority */

describe("primaryClickId", () => {
  it("prefers gclid when more than one is present", () => {
    expect(primaryClickId({ gclid: "g", gbraid: "b", wbraid: "w" })).toBe("g");
  });

  it("falls back to gbraid, then wbraid", () => {
    expect(primaryClickId({ gbraid: "b", wbraid: "w" })).toBe("b");
    expect(primaryClickId({ wbraid: "w" })).toBe("w");
  });

  it("returns undefined for an organic visit", () => {
    expect(primaryClickId({ utm_source: "newsletter" })).toBeUndefined();
    expect(isPaidVisit({ utm_source: "newsletter" })).toBe(false);
    expect(isPaidVisit({ wbraid: "w" })).toBe(true);
  });
});

/* --------------------------------------------------------------- storage */

describe("rememberAttribution", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists across page views within the session", () => {
    rememberAttribution("?gclid=abc");
    expect(readAttribution()).toEqual({ gclid: "abc" });
    // A later page with no query string must not wipe what we captured.
    rememberAttribution("");
    expect(readAttribution()).toEqual({ gclid: "abc" });
  });

  it("lets a newer click win", () => {
    rememberAttribution("?gclid=first");
    rememberAttribution("?gclid=second");
    expect(readAttribution().gclid).toBe("second");
  });

  it("merges new parameters over old ones", () => {
    rememberAttribution("?gclid=abc&utm_source=google");
    rememberAttribution("?utm_campaign=wings");
    expect(readAttribution()).toEqual({
      gclid: "abc",
      utm_source: "google",
      utm_campaign: "wings",
    });
  });

  it("still returns the parsed values when storage throws", () => {
    // Safari private mode and blocked site data both throw here. Attribution is
    // a nice-to-have; it must never take the page down with it.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(rememberAttribution("?gclid=abc")).toEqual({ gclid: "abc" });
  });

  it("returns an empty object rather than throwing on corrupt storage", () => {
    window.sessionStorage.setItem("jp_attribution", "not json");
    expect(readAttribution()).toEqual({});
  });
});

/* ------------------------------------------------------ form validation */

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe("validateCateringForm", () => {
  it("accepts a minimal valid enquiry", () => {
    const result = validateCateringForm(formOf({ name: "Sam", phone: "931 555 0142" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.enquiry.name).toBe("Sam");
      expect(result.enquiry.email).toBeUndefined();
    }
  });

  it("requires a name and a usable phone number", () => {
    const result = validateCateringForm(formOf({ name: "", phone: "555" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.phone).toBeDefined();
    }
  });

  it("accepts a phone number however it is typed", () => {
    for (const phone of ["(931) 555-0142", "931-555-0142", "9315550142", "+1 931 555 0142"]) {
      expect(validateCateringForm(formOf({ name: "Sam", phone })).ok).toBe(true);
    }
  });

  it("rejects an email that is clearly malformed, but allows none at all", () => {
    expect(validateCateringForm(formOf({ name: "S", phone: "9315550142", email: "nope" })).ok).toBe(
      false,
    );
    expect(
      validateCateringForm(formOf({ name: "S", phone: "9315550142", email: "s@example.com" })).ok,
    ).toBe(true);
  });

  it("carries the click identifiers through to the enquiry", () => {
    const result = validateCateringForm(
      formOf({
        name: "Sam",
        phone: "9315550142",
        gclid: "abc",
        utm_campaign: "wings",
        source: "wings-clarksville",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.enquiry.attribution).toEqual({ gclid: "abc", utm_campaign: "wings" });
      expect(result.enquiry.source).toBe("wings-clarksville");
    }
  });

  it("flags a filled honeypot as spam", () => {
    const result = validateCateringForm(
      formOf({ name: "Sam", phone: "9315550142", company: "bot" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.company).toBe("spam");
  });
});
