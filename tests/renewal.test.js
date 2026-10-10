// ─────────────────────────────────────────────────────────────────────────────
//  Rental renewal radar — regression spec
//
//  Zero dependencies. Run with:   node tests/renewal.test.js
//  Exits non-zero if any assertion fails.
//
//  Pins down the canonical renewal rules the app relies on (mirrors the
//  helpers in nasama-accounting-v2.core.jsx — keep both in sync):
//    • Only Rental / Renewal deals with a valid tenancy_end are tracked; Cancelled never.
//    • Window = 90 days before tenancy_end. Tiers: expired | ≤30 | ≤60 | ≤90.
//    • "renewed" / "not_renewed" resolve a deal off the radar; a snooze hides
//      it until the snooze date; "reminder_sent" keeps it on the radar.
//    • Default tenancy term = start + 1 year − 1 day (01 Jan → 31 Dec).
//    • A renewal deal's next term starts the day after the old tenancy_end.
//    • The app never sends email — it only builds a mailto: draft.
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── Canonical helpers (verbatim from core.jsx) ───────────────────────────────
const RENEWAL_WINDOW_DAYS = 90;
const isoAddDays = (iso, n) => { const dt = new Date(iso + "T12:00:00"); dt.setDate(dt.getDate() + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const isoAddYears = (iso, n) => { const dt = new Date(iso + "T12:00:00"); dt.setFullYear(dt.getFullYear() + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const isoDaysBetween = (fromIso, toIso) => Math.round((new Date(toIso + "T12:00:00").getTime() - new Date(fromIso + "T12:00:00").getTime()) / 86400000);
const defaultTenancyEnd = (startIso) => startIso ? isoAddDays(isoAddYears(startIso, 1), -1) : "";
const TENANCY_DEAL_TYPES = ["Rental", "Renewal"];
const isTenancyType = t => TENANCY_DEAL_TYPES.includes(t);
const renewalInfo = (deal, today) => {
  if (!deal || !isTenancyType(deal.type) || deal.stage === "Cancelled") return null;
  const end = deal.tenancy_end || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const daysLeft = isoDaysBetween(today, end);
  const tier = daysLeft < 0 ? "expired" : daysLeft <= 30 ? "d30" : daysLeft <= 60 ? "d60" : daysLeft <= RENEWAL_WINDOW_DAYS ? "d90" : "later";
  const status = deal.renewal_status || "";
  const snoozed = !!deal.renewal_snooze_until && deal.renewal_snooze_until > today;
  const inWindow = tier !== "later" && status !== "renewed" && status !== "not_renewed" && !snoozed;
  return { daysLeft, tier, status, snoozed, inWindow };
};
const mailtoHref = ({ to, subject, body }) => `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`;

const TODAY = "2026-09-29";
const rental = (end, extra = {}) => ({ type: "Rental", stage: "Lead", tenancy_end: end, ...extra });

// ── 1. Date arithmetic ───────────────────────────────────────────────────────
console.log("date arithmetic");
eq(isoAddDays("2026-12-31", 1), "2027-01-01", "add day rolls the year");
eq(isoAddDays("2026-03-01", -1), "2026-02-28", "minus day rolls the month (non-leap)");
eq(isoDaysBetween("2026-09-29", "2026-10-29"), 30, "30 days ahead");
eq(isoDaysBetween("2026-09-29", "2026-09-28"), -1, "yesterday = −1");
eq(defaultTenancyEnd("2026-01-01"), "2026-12-31", "standard term: 01 Jan → 31 Dec");
eq(defaultTenancyEnd("2026-06-15"), "2027-06-14", "mid-year term: start + 1yr − 1 day");
eq(defaultTenancyEnd("2024-02-29"), "2025-02-28", "leap-day start lands on 28 Feb next year");
eq(defaultTenancyEnd(""), "", "no start → no derived end");

// ── 2. Who is on the radar at all ────────────────────────────────────────────
console.log("radar eligibility");
eq(renewalInfo({ type: "Off-Plan", stage: "Lead", tenancy_end: "2026-10-01" }, TODAY), null, "Off-Plan is never tracked");
eq(renewalInfo({ type: "Secondary", stage: "Lead", tenancy_end: "2026-10-01" }, TODAY), null, "Secondary is never tracked");
ok(renewalInfo(rental("2026-10-01", { type: "Renewal" }), TODAY) !== null, "a Renewal deal is tracked like a Rental — it renews again");
eq(renewalInfo(rental("2026-10-01", { type: "Renewal", stage: "Cancelled" }), TODAY), null, "Cancelled renewal is never tracked");
eq(renewalInfo(rental("2026-10-01", { stage: "Cancelled" }), TODAY), null, "Cancelled rental is never tracked");
eq(renewalInfo(rental(""), TODAY), null, "no tenancy_end → nothing to track");
eq(renewalInfo(rental("soon"), TODAY), null, "malformed tenancy_end → nothing to track");
ok(renewalInfo(rental("2026-10-01", { stage: "Commission Collected" }), TODAY) !== null, "a collected rental still renews next year — stays tracked");

// ── 3. Tier boundaries (window = 90 days) ────────────────────────────────────
console.log("tiers");
const tierAt = (days) => renewalInfo(rental(isoAddDays(TODAY, days)), TODAY).tier;
eq(tierAt(-1), "expired", "past end date → expired");
eq(tierAt(0), "d30", "expires today → ≤30 tier");
eq(tierAt(30), "d30", "day 30 → ≤30 tier");
eq(tierAt(31), "d60", "day 31 → ≤60 tier");
eq(tierAt(60), "d60", "day 60 → ≤60 tier");
eq(tierAt(61), "d90", "day 61 → ≤90 tier");
eq(tierAt(90), "d90", "day 90 → ≤90 tier (window edge)");
eq(tierAt(91), "later", "day 91 → outside the window");
eq(renewalInfo(rental(isoAddDays(TODAY, 91)), TODAY).inWindow, false, "outside the window → not surfaced");
eq(renewalInfo(rental(isoAddDays(TODAY, 90)), TODAY).inWindow, true, "inside the window → surfaced");

// ── 4. Status & snooze take deals off the radar ──────────────────────────────
console.log("status & snooze");
const dueSoon = (extra) => renewalInfo(rental(isoAddDays(TODAY, 10), extra), TODAY);
eq(dueSoon({ renewal_status: "renewed" }).inWindow, false, "renewed → resolved, off the radar");
eq(dueSoon({ renewal_status: "not_renewed" }).inWindow, false, "not renewed → resolved, off the radar");
eq(dueSoon({ renewal_status: "reminder_sent" }).inWindow, true, "reminder sent → still needs an outcome, stays on");
eq(dueSoon({ renewal_snooze_until: isoAddDays(TODAY, 5) }).inWindow, false, "snoozed until a future date → hidden");
eq(dueSoon({ renewal_snooze_until: TODAY }).inWindow, true, "snooze expires ON the date → back on the radar");
eq(dueSoon({ renewal_snooze_until: isoAddDays(TODAY, -1) }).inWindow, true, "past snooze → back on the radar");

// ── 5. Renewal chain: the next tenancy year ──────────────────────────────────
console.log("renewal chain");
const oldEnd = "2026-12-31";
const nextStart = isoAddDays(oldEnd, 1);
eq(nextStart, "2027-01-01", "next term starts the day after the old end");
eq(defaultTenancyEnd(nextStart), "2027-12-31", "next term ends a year later, back-to-back");

// ── 6. mailto draft (approval = the user pressing Send in their mail app) ────
console.log("mailto draft");
const href = mailtoHref({ to: "a@b.ae", subject: "Renewal — Unit 5", body: "Line 1\nLine 2" });
ok(href.startsWith("mailto:a%40b.ae?subject=Renewal%20%E2%80%94%20Unit%205&body="), "to & subject are URI-encoded");
ok(href.includes("Line%201%0ALine%202"), "newlines survive as %0A");
eq(mailtoHref({}), "mailto:?subject=&body=", "empty draft never throws");

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
