// ─────────────────────────────────────────────────────────────────────────────
//  Posting engine — regression spec (implementation plan 8.1)
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/engine.test.js
//  Drives the REAL createJournalEngine in core.jsx. Amounts in integer cents.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + "; return { createJournalEngine, buildLedger, accountBalance, isVATSettlementTxn, toCents };")
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
function throws(fn, match, msg) {
  try { fn(); failed++; console.error(`  ✗ ${msg}\n      expected a throw`); }
  catch (e) { if (!match || String(e.message).includes(match)) passed++; else { failed++; console.error(`  ✗ ${msg}: ${e.message}`); } }
}
const section = s => console.log("▸ " + s);
const ACCOUNTS = [
  { id: "aCash", code: "1001", name: "Cash", type: "Asset", isCash: true },
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "aBank2", code: "1003", name: "Bank 2", type: "Asset", isBank: true },
  { id: "aIn", code: "1201", name: "Input VAT", type: "Asset", isInputVAT: true },
  { id: "aVAT", code: "2101", name: "Output VAT", type: "Liability", isOutputVAT: true },
  { id: "aRnd", code: "2105", name: "VAT Rounding", type: "Liability" },
  { id: "aAcc", code: "2210", name: "Accrued", type: "Liability" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a4010", code: "4010", name: "Seller Commission", type: "Revenue" },
  { id: "a4020", code: "4020", name: "Rental Commission", type: "Revenue" },
  { id: "a5040", code: "5040", name: "Manager Override", type: "Expense" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5500", code: "5500", name: "Broker Commission", type: "Expense" },
];
const J = (txns = []) => X.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
const bal = (code, txns) => X.accountBalance(ACCOUNTS.find(a => a.code === code), X.buildLedger(txns, ACCOUNTS));
const sum = (t, k) => t.lines.reduce((s, l) => s + (l[k] || 0), 0);
const balanced = t => sum(t, "debit") === sum(t, "credit");
const line = (t, id) => t.lines.find(l => l.accountId === id) || { debit: 0, credit: 0 };
const deal = (type = "Off-Plan") => ({ id: "d1", type, property_name: "Sky", client_name: "Acme", broker_id: "BR1", broker_name: "Ali", developer: "DEV" });

section("sale receipt — VAT split and revenue account");
{
  const sr = J().postSaleReceipt({ date: "2026-05-01", deal: deal(), gross: 105000, commit: false });
  ok(balanced(sr), "balanced");
  eq(line(sr, "aBank").debit, 10500000, "bank debited gross");
  eq(line(sr, "a4000").credit, 10000000, "net to Developer Commission");
  eq(line(sr, "aVAT").credit, 500000, "5% output VAT");
  for (const gross of [100.01, 0.07, 333.33, 1, 99999.99, 12345.67]) {
    const t = J().postSaleReceipt({ date: "2026-05-01", deal: deal(), gross, commit: false });
    ok(balanced(t), `balanced at gross ${gross}`);
    eq(sum(t, "credit"), X.toCents(gross), `credits = gross at ${gross} (rounding absorbed)`);
  }
  eq(line(J().postSaleReceipt({ date: "2026-05-01", deal: deal("Secondary"), gross: 1050, commit: false }), "a4010").credit, 100000, "Secondary → 4010");
  eq(line(J().postSaleReceipt({ date: "2026-05-01", deal: deal("Renewal"), gross: 1050, commit: false }), "a4020").credit, 100000, "Renewal → 4020");
  eq(J().postSaleReceipt({ date: "2026-05-01", deal: deal(), gross: 1000, vatRate: 0, commit: false }).lines.length, 2, "0% → no VAT line");
  throws(() => J().postSaleReceipt({ date: "2026-05-01", deal: deal(), gross: 0, commit: false }), "positive", "zero refused");
  throws(() => J().postSaleReceipt({ date: "2026-05-01", deal: { id: "x", type: "Other" }, gross: 1, commit: false }), "Invalid deal type", "unknown deal type refused");
  throws(() => J().postSaleReceipt({ date: "2026-05-01", deal: null, gross: 1, commit: false }), "deal_id", "a receipt needs a deal");
}

section("payment voucher — input VAT");
{
  const pv = J().postPayment({ date: "2026-05-02", memo: "Rent", gross: 21000, vatRate: 5, expenseCode: "5100", commit: false });
  ok(balanced(pv), "balanced");
  eq(line(pv, "a5100").debit, 2000000, "expense net");
  eq(line(pv, "aIn").debit, 100000, "input VAT recoverable");
  eq(line(pv, "aBank").credit, 2100000, "bank credited gross");
  eq(J().postPayment({ date: "2026-05-02", memo: "x", gross: 10, expenseCode: "5100", paidFromCode: "1001", commit: false }).lines.find(l => l.credit).accountId, "aCash", "can pay from cash");
  throws(() => J().postPayment({ date: "2026-05-02", memo: "x", gross: 10, commit: false }), "expenseCode", "an expense account is required");
  throws(() => J().postPayment({ date: "2026-05-02", memo: "x", gross: 10, expenseCode: "9999", commit: false }), "not found", "unknown expense account refused");
}

section("journal, broker payment, transfer");
{
  throws(() => J().post({ date: "2026-05-03", description: "x", ref: "JV", lines: [{ accountId: "aBank", debit: 100, credit: 0 }, { accountId: "a5100", debit: 0, credit: 99 }], commit: false }), "Unbalanced", "unbalanced journal refused");
  const both = J().postBrokerPayment({ date: "2026-05-04", deal: deal(), brokerAmount: 300, managerAmount: 100, manager_id: "M1", manager_name: "Mo", commit: false });
  ok(balanced(both), "broker + manager balanced");
  eq(line(both, "a5500").debit, 30000, "broker leg");
  eq(line(both, "a5040").debit, 10000, "manager leg");
  eq(line(both, "aBank").credit, 40000, "bank credited for both");
  throws(() => J().postBrokerPayment({ date: "2026-05-04", deal: deal(), commit: false }), "positive", "nothing to pay refused");
  const bt = J().postBankTransfer({ date: "2026-05-05", fromCode: "1002", toCode: "1003", amount: 500, commit: false });
  eq(bal("1003", [bt]) + bal("1002", [bt]), 0, "transfer moves money between own accounts only");
}

section("VAT report — settlements and reversals");
{
  const sr = J().postSaleReceipt({ date: "2026-05-01", deal: deal(), gross: 1050, commit: false });
  const pv = J().postPayment({ date: "2026-05-02", memo: "Rent", gross: 210, vatRate: 5, expenseCode: "5100", commit: false });
  const settle = { id: "st", date: "2026-07-10", isVoid: false, txnType: "JV", lines: [{ accountId: "aVAT", debit: 5000, credit: 0 }, { accountId: "aIn", debit: 0, credit: 1000 }, { accountId: "aBank", debit: 0, credit: 4000 }] };
  ok(X.isVATSettlementTxn(settle, ACCOUNTS), "a VAT payment to the FTA is recognised as a settlement");
  ok(!X.isVATSettlementTxn(sr, ACCOUNTS), "a sale receipt is not a settlement");
  let txns = [sr, pv, settle];
  const r = J(txns).getVATReport({ fromDate: "2026-04-01", toDate: "2026-06-30" });
  eq(r.outputVat, 5000, "output VAT");
  eq(r.inputVat, 1000, "input VAT");
  eq(r.netVat, 4000, "net payable");
  eq(r.status, "Payable", "status");
  const rev = J(txns).reverseTransaction(sr.id, "2026-06-15", "Reversal", false);
  txns = [...txns, rev];
  eq(J(txns).getVATReport({ fromDate: "2026-04-01", toDate: "2026-06-30" }).outputVat, 0, "a reversed receipt's VAT comes back out");
  eq(J(txns).getVATReport({ fromDate: "2026-07-01", toDate: "2026-09-30" }).outputVat, 0, "the settlement is not itself VAT activity");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — engine: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
