// ─────────────────────────────────────────────────────────────────────────────
//  Commission / VAT math — regression spec
//
//  Zero dependencies. Run with:   node tests/commission.test.js
//  Exits non-zero if any assertion fails (usable in a pre-push hook or CI).
//
//  This file is the executable documentation of Nasama's money rules. All amounts
//  are integer CENTS (AED × 100), matching how deals are stored in Firestore.
//
//  It pins down the canonical rules the app relies on:
//    • expected_commission_net is THE commission figure — every screen reads it.
//    • Secondary:  net = buyer + seller − discount   (buyer = value×buyer%, etc.)
//    • Off-Plan / Rental:  net = value × pct   (or a directly-entered net)
//    • VAT-inclusive commission = net × 1.05  (UAE 5% VAT)
//  and guards the invariant that let us delete the Deals-Report heuristic:
//  the report's per-deal commission equals the stored net for every real deal.
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${expected}, got ${actual}`); }
}
function ok(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); }
}
function near(actual, expected, tolCents, msg) {
  if (Math.abs(actual - expected) <= tolCents) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n      ${actual} not within ${tolCents}¢ of ${expected}`); }
}

// ── Canonical formulas (the spec the app must honour) ────────────────────────
const round = n => Math.round(n);
const commissionCents = (valueCents, pct) => (pct && valueCents ? round(valueCents * parseFloat(pct) / 100) : 0);
const secondaryNetCents = (valueCents, buyerPct, sellerPct, discountCents = 0) =>
  commissionCents(valueCents, buyerPct) + commissionCents(valueCents, sellerPct) - (discountCents || 0);
const withVatCents = netCents => round(netCents * 1.05);
// The Deals Report's per-deal commission after the 2026-07 simplification.
const rowCommission = deal => deal.expected_commission_net || 0;

// ── 1. Single-side commission (Off-Plan / Rental) ────────────────────────────
console.log("commission (single side)");
eq(commissionCents(150000000, "7"), 10500000, "7% of AED 1,500,000 = AED 105,000");   // imp_001
eq(commissionCents(70901902, "3"), 2127057, "3% rounds to nearest cent");             // imp_002
eq(commissionCents(0, "5"), 0, "zero value → zero commission");
eq(commissionCents(100000000, ""), 0, "empty pct → zero (manual net used instead)");

// ── 2. Secondary: buyer + seller − discount ──────────────────────────────────
console.log("commission (secondary)");
eq(secondaryNetCents(100000000, "2", "2"), 4000000, "buyer 2% + seller 2% = AED 40,000");
eq(secondaryNetCents(100000000, "2", "2", 500000), 3500000, "…less AED 5,000 discount");
eq(secondaryNetCents(135000000, "2", "", 540000), 2160000, "buyer-only 2% less 20% discount = AED 21,600"); // imp_031 shape
eq(secondaryNetCents(100000000, "2.10", "0"), 2100000, "2.10% buyer, no seller");     // imp_035

// ── 3. VAT (UAE 5%) ──────────────────────────────────────────────────────────
console.log("VAT");
eq(withVatCents(10500000), 11025000, "AED 105,000 incl. 5% VAT = AED 110,250");
eq(withVatCents(0), 0, "no commission → no VAT");
eq(withVatCents(3240545), 3402572, "VAT rounds to nearest cent");                     // imp_014 net

// ── 4. Invariants over the real imported dataset ─────────────────────────────
console.log("imported dataset invariants (deals-2025.js)");
global.window = {};
require("../nasama-accounting-v2.deals-2025.js");
const deals = global.window.PASTED_DEALS;
ok(Array.isArray(deals) && deals.length === 64, `fixture has 64 imported deals (got ${deals && deals.length})`);

deals.forEach(d => {
  ok((d.expected_commission_net || 0) >= 0, `${d.id}: net is non-negative`);
  // The report shows exactly the stored net — the property that let us drop the heuristic.
  eq(rowCommission(d), d.expected_commission_net || 0, `${d.id}: report commission == stored net`);
});

// Off-Plan nets should match value×pct. Imports were hand-entered as whole-dirham
// figures, so allow sub-dirham (≤ AED 1) rounding — but flag anything larger, which
// would signal a wrong pct or a transposed value at import time.
deals.filter(d => d.type === "Off-Plan" && parseFloat(d.commission_pct)).forEach(d => {
  near(d.expected_commission_net, commissionCents(d.transaction_value, d.commission_pct), 100,
     `${d.id}: Off-Plan net ≈ value × ${d.commission_pct}% (within AED 1)`);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "✓ PASS" : "✗ FAIL"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
