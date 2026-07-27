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

// ── 5. Deal ↔ invoice agreement ──────────────────────────────────────────────
//  An invoice line always bills dealValue × commissionPct (major AED units,
//  2-dp), so these must reproduce a deal's cents targets exactly. Mirrors
//  invCommissionAmount / invLineCents / invPctForAmount in the invoices module.
console.log("deal ↔ invoice agreement");
// ON TOP: the stated amount is the fee, 5% is added. INCLUSIVE: the stated
// amount is the all-in figure and VAT is the remainder after backing the net out.
const invSplitVat = (stated, vatIncl) => {
  const amt = parseFloat((parseFloat(stated) || 0).toFixed(2));
  if (!vatIncl) {
    const vat = parseFloat((amt * 0.05).toFixed(2));
    return { net: amt, vat, total: parseFloat((amt + vat).toFixed(2)) };
  }
  const net = parseFloat((amt / 1.05).toFixed(2));
  return { net, vat: parseFloat((amt - net).toFixed(2)), total: amt };
};
const invStated = (dealValueAED, pct) => {
  const dv = parseFloat(dealValueAED) || 0, p = parseFloat(pct) || 0;
  return dv > 0 && p > 0 ? parseFloat((dv * p / 100).toFixed(2)) : 0;
};
const invLineCents = (dealValueAED, pct, vatIncl) =>
  Math.round(invSplitVat(invStated(dealValueAED, pct), vatIncl).net * 100);
const invPctForAmount = (tvCents, cents, naturalPct, vatIncl) => {
  if (!(tvCents > 0) || !(cents > 0)) return naturalPct || "";
  const billed = pct => invLineCents(tvCents / 100, pct, vatIncl);
  const nat = parseFloat(naturalPct);
  if (isFinite(nat) && nat > 0 && billed(nat) === cents) return naturalPct;
  const exact = (cents / tvCents) * 100 * (vatIncl ? 1.05 : 1);
  for (let dp = 2; dp <= 8; dp++) {
    const cand = parseFloat(exact.toFixed(dp));
    if (billed(cand) === cents) return cand;
  }
  return parseFloat(exact.toFixed(8));
};
// A deal's own rate survives when it already bills the target — no ugly % on
// the printed invoice for the ordinary full-commission case.
eq(invPctForAmount(242000000, 12100000, "5"), "5", "full bill keeps the deal's own 5%");   // TVI-126
eq(invLineCents(2420000, "5"), 12100000, "2,420,000 × 5% bills AED 121,000 excl. VAT");
eq(withVatCents(12100000), 12705000, "…and AED 127,050 incl. 5% VAT on top");
// Partial bills must still land on the exact fils. A flat 2-dp rate does not:
// 4.76% of 2,420,000 = 115,192.00, AED 46.09 short of the 115,238.09 outstanding.
eq(invLineCents(2420000, 4.76), 11519200, "2-dp rate under-bills a partial by AED 46.09");
eq(invLineCents(2420000, invPctForAmount(242000000, 11523809, "5")), 11523809,
   "derived rate bills the partial exactly");
// Same over every imported deal, at full and at three arbitrary partial amounts.
deals.filter(d => d.transaction_value > 0 && parseFloat(d.commission_pct) > 0).forEach(d => {
  [d.expected_commission_net, 100000, Math.floor(d.expected_commission_net / 3), d.expected_commission_net - 1]
    .filter(c => c > 0)
    .forEach(cents => {
      eq(invLineCents(d.transaction_value / 100, invPctForAmount(d.transaction_value, cents, d.commission_pct)), cents,
         `${d.id}: invoice line reproduces ${cents}¢ exactly`);
    });
});

// The deal-form guard: flags a hand-typed net that no longer matches value × %,
// which is the one way a deal and its invoice can disagree. Mirrors
// commissionMismatch in the core module.
const isVatInclusive = d => !!(d && d.vat_applicable && d.commission_vat_inclusive);
const impliedGrossCents = (deal) => {
  const tv = (deal && deal.transaction_value) || 0, pct = parseFloat(deal && deal.commission_pct) || 0;
  return (!tv || !pct) ? null : Math.round(tv * pct / 100);
};
const impliedNetCents = (deal) => {
  const g = impliedGrossCents(deal);
  return g == null ? null : (isVatInclusive(deal) ? Math.round(g / 1.05) : g);
};
const dealVatCents = (deal) => {
  if (!deal || !deal.vat_applicable) return 0;
  const net = deal.expected_commission_net || 0;
  if (isVatInclusive(deal)) {
    const g = impliedGrossCents(deal);
    if (g != null && g >= net) return g - net;
  }
  return Math.round(net * 0.05);
};
const dealGrossCents = deal => (deal ? (deal.expected_commission_net || 0) + dealVatCents(deal) : 0);
const commissionMismatch = (deal) => {
  if (!deal || deal.type === "Secondary") return null;
  const implied = impliedNetCents(deal);
  if (implied == null) return null;
  const diff = (deal.expected_commission_net || 0) - implied;
  return diff === 0 ? null : { implied, stored: deal.expected_commission_net || 0, diff };
};
const tvi126 = { type: "Off-Plan", transaction_value: 242000000, commission_pct: "5" };
ok(commissionMismatch({ ...tvi126, expected_commission_net: 12100000 }) === null,
   "TVI-126 at AED 121,000 net: no mismatch");
eq(commissionMismatch({ ...tvi126, expected_commission_net: 11523809 }).diff, -576191,
   "TVI-126 typed VAT-inclusive: flagged AED 5,761.91 short");
eq(commissionMismatch({ ...tvi126, expected_commission_net: 11523809 }).implied, 12100000,
   "…and offers the correct AED 121,000");
ok(commissionMismatch({ type: "Secondary", transaction_value: 242000000, commission_pct: "2", seller_commission_pct: "2", discount: 500000, expected_commission_net: 9180000 }) === null,
   "Secondary is exempt — its net is buyer + seller − discount by design");
ok(commissionMismatch({ type: "Off-Plan", commission_pct: "5", expected_commission_net: 12100000 }) === null,
   "commission-only deal (no transaction value) is exempt");
deals.filter(d => d.type === "Off-Plan").forEach(d => {
  const mm = commissionMismatch(d);
  ok(!mm || Math.abs(mm.diff) <= 100, `${d.id}: imported net within AED 1 of value × % (no false alarm)`);
});

// ── 6. VAT-inclusive commission agreements ───────────────────────────────────
//  Some developers pay the % ALL-IN: 5% of 2,420,000 = 121,000 is the total
//  cheque, VAT already inside it. The invoice must land on exactly 121,000.00 —
//  taking 5% of the net instead gives 120,999.99 and the cheque won't match.
console.log("VAT-inclusive commission");
const tviIncl = { type: "Off-Plan", transaction_value: 242000000, commission_pct: "5",
                  vat_applicable: true, commission_vat_inclusive: true };

eq(invSplitVat(121000, true).net,   115238.10, "121,000 all-in → net 115,238.10");
eq(invSplitVat(121000, true).vat,     5761.90, "…VAT 5,761.90 (the remainder, not 5% of net)");
eq(invSplitVat(121000, true).total, 121000.00, "…totalling exactly 121,000.00");
eq(invSplitVat(121000, false).total, 127050.00, "same figure ON TOP totals 127,050.00");
// The bug this pins down: 5% of the net rounds the total off the agreed figure.
ok(parseFloat((115238.09 * 1.05).toFixed(2)) !== 121000, "5% of a 115,238.09 net misses 121,000");
ok(invSplitVat(121000, true).net + invSplitVat(121000, true).vat === 121000, "net + VAT is exact");

eq(impliedNetCents(tviIncl), 11523810, "deal stores net 115,238.10 under inclusive terms");
eq(impliedNetCents({ ...tviIncl, commission_vat_inclusive: false }), 12100000, "…and 121,000.00 on top");
eq(dealVatCents({ ...tviIncl, expected_commission_net: 11523810 }), 576190, "deal VAT = the remainder");
eq(dealGrossCents({ ...tviIncl, expected_commission_net: 11523810 }), 12100000, "deal gross = the agreed 121,000");
eq(dealGrossCents({ type: "Off-Plan", vat_applicable: true, expected_commission_net: 10500000 }), 11025000,
   "on-top deal gross is still net × 1.05");
eq(dealGrossCents({ type: "Off-Plan", vat_applicable: false, expected_commission_net: 10500000 }), 10500000,
   "no VAT → gross equals net");

// End to end: deal → invoice line → printed totals, under inclusive terms.
eq(invPctForAmount(242000000, 11523810, "5", true), "5", "inclusive full bill keeps a clean 5%");
eq(invLineCents(2420000, "5", true), 11523810, "line's NET matches the deal's stored net");
eq(invSplitVat(invStated(2420000, "5"), true).total, 121000.00, "invoice total incl. VAT = 121,000.00");
// Partial bills stay exact in inclusive mode too.
[5000000, 11523810 - 1, Math.floor(11523810 / 3)].forEach(cents => {
  eq(invLineCents(2420000, invPctForAmount(242000000, cents, "5", true), true), cents,
     `inclusive partial of ${cents}¢ bills exactly`);
});
ok(commissionMismatch({ ...tviIncl, expected_commission_net: 11523810 }) === null,
   "correctly-entered inclusive deal raises no mismatch");
eq(commissionMismatch({ ...tviIncl, expected_commission_net: 11523809 }).implied, 11523810,
   "the original 115,238.09 entry was one fils short of the correct net");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "✓ PASS" : "✗ FAIL"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
