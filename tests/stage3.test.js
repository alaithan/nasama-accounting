// ─────────────────────────────────────────────────────────────────────────────
//  Stage 3 — invoices and UAE VAT compliance — regression spec
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/stage3.test.js
//  Exits non-zero if any assertion fails.
//
//  core.jsx and invoices.jsx are compiled into ONE scope, as the browser loads
//  them, so the invoice helpers see the real core globals. Ledger amounts are
//  integer cents; invoice line amounts are AED. Covers
//  (implementation-plan-2026-10-18): 3.3 TRN rules · 3.4 credit notes ·
//  3.5 accrual invoicing · 3.6 deposits never pay invoices · 3.7 fixed /
//  0% lines and the % column · 3.8 multi-deal receipts · 3.11 statement aging.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "ReactDOM", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console", "xlsxExport"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + ";\n" + compile("nasama-accounting-v2.invoices.jsx") + `
  ; return { createJournalEngine, buildLedger, accountBalance, dealCollection, commissionInvoicing,
             invoiceIsCancelled, invoiceUsesAccrual, invoiceIsAccrual, isClientFundsTxn, AR_ACCOUNT_SEED,
             invLineCalc, invTotals, invLineCents, invPctDisplay, invLineForTarget, invValidate, invTrnValid,
             invCustomerTrnLabel, invBuildArTxn, invBuildCreditNoteTxn, invReceiptPlan, invStatement,
             invAgingBucket, invPartyKey, invDocKind, invNormalizeLine, invDueDateOf, isInvoiceOwnedTxn, dealHasCashBasisRevenue };`)
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
function throws(fn, match, msg) {
  try { fn(); failed++; console.error(`  ✗ ${msg}\n      expected a throw, got none`); }
  catch (e) {
    if (!match || String(e.message).includes(match)) passed++;
    else { failed++; console.error(`  ✗ ${msg}\n      threw "${e.message}", expected to include "${match}"`); }
  }
}
const section = s => console.log("▸ " + s);

// ── fixtures ────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  X.AR_ACCOUNT_SEED,
  { id: "aCF",   code: "2230", name: "Client Funds Held", type: "Liability" },
  { id: "aVAT",  code: "2101", name: "Output VAT Payable", type: "Liability", isOutputVAT: true },
  { id: "aIn",   code: "1201", name: "Input VAT", type: "Asset", isInputVAT: true },
  { id: "aRnd",  code: "2105", name: "VAT Rounding", type: "Liability" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a4010", code: "4010", name: "Seller Commission", type: "Revenue" },
  { id: "a4020", code: "4020", name: "Rental Commission", type: "Revenue" },
];
const OFFPLAN = { id: "dOff", type: "Off-Plan", property_name: "Sky Tower", vat_applicable: true, transaction_value: 200000000, commission_pct: 5, expected_commission_net: 10000000 };
const RENTAL  = { id: "dRen", type: "Rental",   property_name: "JVC 1402",  vat_applicable: false, transaction_value: 12000000, expected_commission_net: 600000 };
const DEALS = [OFFPLAN, RENTAL];
const bal = (code, txns) => X.accountBalance(ACCOUNTS.find(a => a.code === code), X.buildLedger(txns, ACCOUNTS));
const engine = txns => X.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
const balanced = t => (t.lines || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) === 0;
const TRN = "100123456700003";
const baseInv = (over = {}) => ({
  id: "inv1", invoiceNumber: "101", invoiceDate: "2026-03-25", status: "issued",
  billFrom: { companyName: "Nasama", trn: TRN }, invoicedTo: { companyName: "Emaar", trn: "100999999900003", developerId: "dev1" },
  lineItems: [
    { _id: "l1", projectUnit: "Sky Tower 1201", specification: "5%", dealValue: 2000000, commissionPct: 5, dealId: "dOff" },
    { _id: "l2", projectUnit: "JVC 1402", specification: "Rental fee", amountMode: "fixed", fixedAmount: 6000, dealId: "dRen", noVat: true },
  ], ...over });

// ═════════════════════════════════════════════════════════════════════════════
section("3.7 fixed / 0% lines and the % column");
{
  eq(X.invLineCalc({ amountMode: "fixed", fixedAmount: 6000 }).total, 6300, "fixed line on top: 6,000 + 5%");
  eq(X.invLineCalc({ amountMode: "fixed", fixedAmount: 6000, noVat: true }).vat, 0, "fixed no-VAT line: zero VAT");
  eq(X.invLineCalc({ amountMode: "fixed", fixedAmount: 6300, vatInclusive: true }).commissionAmount, 6000, "fixed inclusive line backs the VAT out");
  eq(X.invPctDisplay({ commissionPct: 5 }), "5%", "normal rate prints");
  eq(X.invPctDisplay({ commissionPct: "2.5" }), "2.5%", "decimals print");
  eq(X.invPctDisplay({ commissionPct: "2.38095238" }), "--", "an 8-decimal derived rate prints as --");
  eq(X.invPctDisplay({ amountMode: "fixed", fixedAmount: 10, commissionPct: 5 }), "--", "fixed line has no rate");

  // exact natural rate kept; otherwise a fixed amount for exactly the balance
  const exact = X.invLineForTarget(200000000, 10000000, 5, false, false);
  eq(exact.amountMode, "pct", "5% of 2M = 100k → keeps the deal's rate");
  const bal1 = X.invLineForTarget(200000000, 5761905, 5, false, false);
  eq(bal1.amountMode, "fixed", "a balance that 5% cannot produce → fixed amount");
  eq(X.invLineCents(bal1), 5761905, "…billing exactly the outstanding net");
  [1, 7, 99, 12345, 5761905, 11523810].forEach(cents => {
    const inc = X.invLineForTarget(200000000, cents, 5, true, false);
    eq(X.invLineCents(inc), cents, `inclusive balance ${cents} lands on the fils`);
  });
  eq(X.invLineCents(X.invLineForTarget(0, 600000, null, false, true)), 600000, "no deal value, no VAT → fixed 6,000");

  const v = X.invValidate({ invoicedTo: { companyName: "A" }, lineItems: [{ projectUnit: "p", specification: "s", amountMode: "fixed", fixedAmount: 50 }] }, false);
  eq(v.length, 0, "fixed line needs no deal value or %");
  ok(X.invValidate({ invoicedTo: { companyName: "A" }, lineItems: [{ projectUnit: "p", specification: "s", amountMode: "fixed", fixedAmount: 0 }] }, false).some(e => e.includes("Amount must be")), "fixed line with 0 amount refused");
}

// ═════════════════════════════════════════════════════════════════════════════
section("3.3 TRN rules");
{
  ok(X.invTrnValid("100123456700003"), "15 digits valid");
  ok(X.invTrnValid("100-1234-5670-0003"), "dashes tolerated");
  ok(!X.invTrnValid("10012345"), "short TRN invalid");
  const inv = baseInv();
  eq(X.invValidate(inv, true).length, 0, "complete invoice passes issue checks");
  ok(X.invValidate(baseInv({ billFrom: { trn: "" } }), true).some(e => e.includes("Bill From TRN")), "supplier TRN required to issue");
  ok(X.invValidate(baseInv({ invoicedTo: { companyName: "X", trn: "" } }), true).some(e => e.includes("not VAT registered")), "blank recipient TRN must be confirmed as not registered");
  eq(X.invValidate(baseInv({ invoicedTo: { companyName: "X", trn: "", notRegistered: true } }), true).length, 0, "…ticking 'not registered' satisfies it");
  eq(X.invValidate(baseInv({ billFrom: { trn: "" } }), false).length, 0, "drafts can be saved without TRNs");
  eq(X.invCustomerTrnLabel({ trn: "" }), "--", "blank TRN prints -- (never a false 'Not VAT registered')");
  eq(X.invCustomerTrnLabel({ trn: "", notRegistered: true }), "Not VAT registered", "explicit flag prints the statement");
  eq(X.invCustomerTrnLabel({ trn: TRN }), TRN, "TRN prints");
}

// ═════════════════════════════════════════════════════════════════════════════
section("3.5 accrual invoicing — issue, collect, credit");
{
  const S = { arInvoicing: { enabled: true, from: "2026-01-01" } };
  ok(X.invoiceUsesAccrual(S, "2026-03-25"), "invoice after the start date → accrual");
  ok(!X.invoiceUsesAccrual(S, "2025-12-31"), "invoice before the start date → cash basis");
  ok(!X.invoiceUsesAccrual({ arInvoicing: { enabled: true } }, "2026-03-25"), "enabled without a date does nothing");
  ok(!X.invoiceUsesAccrual({}, "2026-03-25"), "default is cash basis");

  const inv = baseInv();
  const T = X.invTotals(inv.lineItems);            // 100,000 + 5,000 VAT + 6,000 no-VAT
  eq(T.incl, 111000, "invoice total 111,000");
  const ar = X.invBuildArTxn(inv, { deals: DEALS, accounts: ACCOUNTS });
  ok(balanced(ar), "issue entry balances");
  eq(ar.txnType, "IN", "issue entry type IN");
  eq(ar.date, "2026-03-25", "dated on the invoice date (the tax point)");
  eq(ar.ref, "INV-101", "ref carries the invoice number");
  let L = [ar];
  eq(bal("1100", L), 11100000, "receivable = invoice total");
  eq(bal("4000", L), 10000000, "off-plan line → 4000 Developer Commission");
  eq(bal("4020", L), 600000, "rental line → 4020 Rental Commission");
  eq(bal("2101", L), 500000, "output VAT only on the VAT line");

  // Receipt against the accrual invoice: clears AR, books no revenue/VAT
  const r1 = engine(L).postInvoiceReceipt({ date: "2026-04-10", deal: OFFPLAN, gross: 105000, invoiceId: "inv1", invoiceNo: "101", commit: false });
  ok(balanced(r1), "receipt balances");
  ok(!r1.lines.some(l => ["a4000", "aVAT"].includes(l.accountId)), "receipt books no revenue and no VAT");
  L = [ar, r1];
  eq(bal("1100", L), 600000, "receivable down to the unpaid rental share");
  eq(bal("4000", L), 10000000, "revenue unchanged by the receipt (no double count)");
  eq(bal("2101", L), 500000, "VAT unchanged by the receipt");
  eq(X.dealCollection(OFFPLAN, L, ACCOUNTS).collectedCents, 10500000, "deal shows the cash collected");
  throws(() => engine(L).postInvoiceReceipt({ date: "2026-04-10", deal: OFFPLAN, gross: 10, commit: false }), "invoiceId is required", "an AR receipt must name its invoice");

  // Multi-deal: next receipt covers the rental share
  const plan = X.invReceiptPlan(inv, [r1], ACCOUNTS);
  eq(plan.dealId, "dRen", "next receipt moves on to the unpaid deal");
  eq(plan.dueCents, 600000, "…for exactly its share");

  // Credit note: mirror entry, dated on the credit note
  const cn = X.invBuildCreditNoteTxn(ar, { id: "cn1", number: "CN-001", date: "2026-05-02" });
  ok(balanced(cn), "credit note entry balances");
  eq(cn.reversesTxnId, ar.id, "credit note reverses the invoice entry");
  eq(cn.date, "2026-05-02", "VAT comes back out in the credit note's own period");
  const L2 = [ar, cn];
  ["1100", "4000", "4020", "2101"].forEach(c => eq(bal(c, L2), 0, `${c} nets to zero after a full credit note`));
  const vatMar = engine(L2).getVATReport({ fromDate: "2026-01-01", toDate: "2026-03-31" });
  const vatMay = engine(L2).getVATReport({ fromDate: "2026-04-01", toDate: "2026-06-30" });
  eq(vatMar.outputVat, 500000, "Q1 return shows the invoice's VAT (invoice date, not cash date)");
  eq(vatMay.outputVat, -500000, "Q2 return shows the credit note's VAT adjustment");
}

// ═════════════════════════════════════════════════════════════════════════════
section("3.4 / 3.10 lifecycle: credited, claims, converted");
{
  ok(X.invoiceIsCancelled({ status: "credited" }), "credited is cancelled");
  ok(X.invoiceIsCancelled({ status: "void" }), "legacy void is cancelled");
  ok(X.invoiceIsCancelled({ status: "converted" }), "a converted claim no longer bills");
  ok(!X.invoiceIsCancelled({ status: "claim" }), "an open claim still counts as pending");
  const deal = { ...OFFPLAN };
  const line = { dealId: "dOff", dealValue: 2000000, commissionPct: 5, commissionAmount: 100000 };
  const ci = st => X.commissionInvoicing(deal, [{ status: st, invoiceNumber: "1", lineItems: [line] }]);
  eq(ci("issued").totalInvoicedCents, 10000000, "issued invoice counts as invoiced");
  eq(ci("credited").totalInvoicedCents, 0, "credited invoice no longer counts as invoiced");
  eq(ci("credited").totalPendingCents, 0, "…nor as pending");
  eq(ci("claim").totalPendingCents, 10000000, "open claim counts as pending, not invoiced");
  eq(ci("converted").totalPendingCents, 0, "converted claim drops out (its tax invoice counts instead)");
  eq(X.invDocKind({ status: "claim" }), "claim", "claim prints as a commission claim");
  eq(X.invDocKind({ status: "draft" }), "draft", "draft prints as draft");
  eq(X.invDocKind({ status: "issued" }), "invoice", "issued prints as tax invoice");
}

// ═════════════════════════════════════════════════════════════════════════════
section("3.6 deposits are never invoice payments");
{
  const dep = engine([]).postClientFunds({ date: "2026-04-01", amount: 5000, receivedFrom: "Tenant", commit: false });
  ok(X.isClientFundsTxn(dep), "a deposit is a client-funds entry (excluded from the link list)");
}

// ═════════════════════════════════════════════════════════════════════════════
section("3.11 statement of account");
{
  eq(X.invAgingBucket(0), "current", "not yet due");
  eq(X.invAgingBucket(30), "d30", "30 days");
  eq(X.invAgingBucket(31), "d60", "31 days");
  eq(X.invAgingBucket(91), "d90p", "over 90");
  const mk = (id, date, due, total, paid, st = "issued", to = { developerId: "dev1", companyName: "Emaar" }) =>
    ({ inv: { id, status: st, invoiceNumber: id, invoiceDate: date, dueDate: due, invoicedTo: to }, total, paid });
  const items = [
    mk("a", "2026-01-01", "2026-01-31", 1000, 0),
    mk("b", "2026-07-01", "2026-07-31", 2000, 500),
    mk("c", "2026-10-01", "2026-10-31", 3000, 3000),
    mk("d", "2026-02-01", "2026-03-01", 9999, 0, "credited"),
    mk("e", "2026-02-01", "2026-03-01", 4444, 0, "issued", { developerId: "dev2", companyName: "Other" }),
  ];
  const meta = new Map(items.map(x => [x.inv.id, { total: x.total, paid: x.paid }]));
  const st = X.invStatement(items.map(x => x.inv), inv => meta.get(inv.id), "developer:dev1", "2026-10-19");
  eq(st.rows.length, 3, "only this party's issued invoices (credited and other parties excluded)");
  eq(st.totals.due, 2500, "balance due 1,000 + 1,500");
  eq(st.aging.d90p, 1000, "January invoice is over 90 days");
  eq(st.aging.d90, 1500, "July invoice (due 31 Jul) is 61–90 days");
  eq(st.aging.current, 0, "the paid invoice adds nothing");
  eq(X.invPartyKey({ invoicedTo: { companyName: " Emaar " } }), "name:emaar", "unlinked party keyed by name");
}

// ═════════════════════════════════════════════════════════════════════════════
section("review fixes: IN/CN are not receipts · legacy due dates · cash-basis clash");
{
  const inv = baseInv();
  const ar = X.invBuildArTxn(inv, { deals: DEALS, accounts: ACCOUNTS });
  ok(X.isInvoiceOwnedTxn(ar), "the issue entry is invoice-owned");
  ok(X.isInvoiceOwnedTxn(X.invBuildCreditNoteTxn(ar, { id: "c", number: "CN-1", date: "2026-05-02" })), "…and so is the credit note");
  ok(!X.isInvoiceOwnedTxn(engine([ar]).postInvoiceReceipt({ date: "2026-04-10", deal: OFFPLAN, gross: 10, invoiceId: "inv1", invoiceNo: "101", commit: false })), "a receipt is not");
  eq(X.invDueDateOf({ invoiceDate: "2026-01-10" }), "2026-02-09", "no dueDate → invoice date + 30 (legacy invoices age)");
  eq(X.invDueDateOf({ invoiceDate: "2026-01-10", dueDate: "2026-03-01" }), "2026-03-01", "explicit due date kept");
  const sr = engine([]).postSaleReceipt({ date: "2026-05-01", deal: OFFPLAN, gross: 105000, commit: false });
  ok(X.dealHasCashBasisRevenue(OFFPLAN, [sr], ACCOUNTS), "a cash-basis receipt on the deal is detected (accrual invoice must be refused)");
  const rev = engine([sr]).reverseTransaction(sr.id, "2026-05-02", "R", false);
  ok(!X.dealHasCashBasisRevenue(OFFPLAN, [sr, rev], ACCOUNTS), "…not once it is reversed");
  const arRcpt = engine([ar]).postInvoiceReceipt({ date: "2026-04-10", deal: OFFPLAN, gross: 10, invoiceId: "inv1", invoiceNo: "101", commit: false });
  ok(!X.dealHasCashBasisRevenue(OFFPLAN, [ar, arRcpt], ACCOUNTS), "an AR receipt books no revenue, so it is not a clash");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 3: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
