// ─────────────────────────────────────────────────────────────────────────────
//  Stage 6 — accounting completeness — regression spec
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/stage6.test.js
//  Covers: 6.1 depreciation · 6.2 payroll / advances · 6.3 UAE end-of-service
//  · 6.4 year-end close · 6.5 broker accrual & settlement · 6.6 foreign currency.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + `
  ; return { createJournalEngine, buildLedger, accountBalance, withStage6Accounts, computeDepreciation, buildDepreciationTxn,
             buildSalaryAccrualTxn, buildStaffAdvanceTxn, buildSalaryPaymentTxn, employeeBalance, computeGratuity,
             computeEosbProvision, buildEosbTxn, buildYearEndCloseTxn, isClosingTxn, withoutClosing, computeEquityStatement,
             accrualStatus, fxToAed, fxTxnFields, fxLabel };`)
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
const BASE = [
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "aPC", code: "1510", name: "Computers & Laptops", type: "Asset" },
  { id: "aAcc", code: "2210", name: "Accrued Expenses Payable", type: "Liability" },
  { id: "aCap", code: "3000", name: "Capital Injection", type: "Equity" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense" },
  { id: "a5040", code: "5040", name: "Sales Manager Override", type: "Expense" },
];
const ALL = X.withStage6Accounts(BASE, ["staffAdvances", "accDepreciation", "salariesPayable", "eosbProvision", "eosbExpense", "depreciation", "salaries", "retained"]).accounts;
const bal = (code, txns) => X.accountBalance(ALL.find(a => a.code === code), X.buildLedger(txns, ALL));
const balanced = t => t.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) === 0;
let n = 0;
const T = (date, lines, extra = {}) => ({ id: "t" + (++n), date, isVoid: false, txnType: "JV", lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })), ...extra });

// ═════════════════════════════════════════════════════════════════════════════
section("6.1 depreciation");
{
  eq(X.withStage6Accounts(BASE, ["depreciation"]).missing.length, 1, "missing 5610 is created on first use");
  const buy = T("2026-01-05", [["aPC", 3600000, 0], ["aBank", 0, 3600000]]);         // 36,000 laptops
  const cfg = { aPC: { lifeMonths: 36, residualPct: 0, startMonth: "2026-01" } };
  let txns = [buy];
  const r1 = X.computeDepreciation({ accounts: ALL, txns, config: cfg, month: "2026-01" }).find(r => r.account.id === "aPC");
  eq(r1.amount, 100000, "36,000 over 36 months = 1,000 a month");
  const d1 = X.buildDepreciationTxn({ accounts: ALL, rows: [r1], month: "2026-01" });
  ok(balanced(d1), "entry balances");
  eq(d1.date, "2026-01-31", "dated at month end");
  txns = [buy, d1];
  eq(X.computeDepreciation({ accounts: ALL, txns, config: cfg, month: "2026-01" }).find(r => r.account.id === "aPC").amount, 0, "a month is posted only once");
  eq(bal("5610", txns), 100000, "expense booked");
  eq(bal("1590", txns), -100000, "accumulated depreciation is a contra-asset (credit balance)");
  // cap: nearly fully depreciated
  const big = T("2026-01-31", [["a5610", 3550000, 0], ["a1590", 0, 3550000]].map(x => x), {});
  big.lines = [{ accountId: "a5610", debit: 3550000, credit: 0, asset_account_id: "aPC" }, { accountId: "a1590", debit: 0, credit: 3550000, asset_account_id: "aPC" }];
  const rCap = X.computeDepreciation({ accounts: ALL, txns: [buy, big], config: cfg, month: "2026-02" }).find(r => r.account.id === "aPC");
  eq(rCap.amount, 50000, "never depreciates beyond cost (only 500 left)");
  eq(X.computeDepreciation({ accounts: ALL, txns: [buy], config: { aPC: { lifeMonths: 36, startMonth: "2026-06" } }, month: "2026-03" }).find(r => r.account.id === "aPC").amount, 0, "nothing before the start month");
  eq(X.computeDepreciation({ accounts: ALL, txns: [buy], config: {}, month: "2026-03" }).find(r => r.account.id === "aPC").amount, 0, "nothing until a useful life is set");
  ok(!X.computeDepreciation({ accounts: ALL, txns: [buy], config: cfg, month: "2026-03" }).some(r => r.account.code === "1590"), "1590 itself is not depreciated");
}

// ═════════════════════════════════════════════════════════════════════════════
section("6.2 payroll and advances");
{
  const emps = [
    { id: "e1", name: "Sara", base_salary: 1000000, join_date: "2024-03-01" },
    { id: "e2", name: "Omar", base_salary: 800000, join_date: "2026-04-15" },
    { id: "e3", name: "Left", base_salary: 500000, join_date: "2023-01-01", leave_date: "2026-01-31" },
  ];
  const acc = X.buildSalaryAccrualTxn({ accounts: ALL, employees: emps, txns: [], month: "2026-03" });
  ok(balanced(acc), "accrual balances");
  eq(acc.lines.filter(l => l.debit).length, 1, "only Sara: Omar joins in April, the leaver left in January");
  let txns = [acc];
  throws(() => X.buildSalaryAccrualTxn({ accounts: ALL, employees: emps, txns, month: "2026-03" }), "already accrued", "a month cannot be accrued twice");
  eq(X.employeeBalance(txns, "a2240", "e1"), 1000000, "10,000 owed to Sara");
  const adv = X.buildStaffAdvanceTxn({ accounts: ALL, employee: emps[0], amountC: 200000, bankCode: "1002", date: "2026-03-10" });
  txns = [acc, adv];
  eq(-X.employeeBalance(txns, "a1150", "e1"), 200000, "2,000 advanced");
  throws(() => X.buildSalaryPaymentTxn({ accounts: ALL, txns, employee: emps[0], grossC: 1100000, bankCode: "1002", date: "2026-04-01" }), "Only", "cannot pay more than is owed");
  throws(() => X.buildSalaryPaymentTxn({ accounts: ALL, txns, employee: emps[0], grossC: 1000000, recoverC: 300000, bankCode: "1002", date: "2026-04-01" }), "recovery", "cannot recover more than was advanced");
  const pay = X.buildSalaryPaymentTxn({ accounts: ALL, txns, employee: emps[0], grossC: 1000000, recoverC: 200000, bankCode: "1002", date: "2026-04-01" });
  ok(balanced(pay), "payment balances");
  txns = [acc, adv, pay];
  eq(X.employeeBalance(txns, "a2240", "e1"), 0, "nothing owed after payment");
  eq(X.employeeBalance(txns, "a1150", "e1"), 0, "advance fully recovered");
  eq(bal("1002", txns), -1000000, "bank: 2,000 advance + 8,000 net salary");
  eq(bal("5010", txns), 1000000, "salary expense booked once, at accrual");
}

// ═════════════════════════════════════════════════════════════════════════════
section("6.3 UAE end-of-service gratuity");
{
  const g3 = X.computeGratuity({ basicMonthlyC: 1000000, joinDate: "2023-01-01", asOf: "2025-12-31" });
  ok(Math.abs(g3.days - 63) < 0.1, "3 years → 63 days");
  ok(Math.abs(g3.amountC - 2100000) < 2000, "≈ 21,000 on a 10,000 basic");
  const g7 = X.computeGratuity({ basicMonthlyC: 1000000, joinDate: "2019-01-01", asOf: "2025-12-31" });
  ok(Math.abs(g7.days - 165) < 0.5, "7 years → 5×21 + 2×30 = 165 days");
  const g30 = X.computeGratuity({ basicMonthlyC: 1000000, joinDate: "1990-01-01", asOf: "2025-12-31" });
  eq(g30.amountC, 24000000, "capped at two years' basic salary");
  ok(!X.computeGratuity({ basicMonthlyC: 1000000, joinDate: "2025-06-01", asOf: "2025-12-31" }).vested, "under one year: provision accrues but is not yet payable");
  const emps = [{ id: "e1", name: "Sara", base_salary: 1000000, join_date: "2023-01-01" }];
  const rows = X.computeEosbProvision({ accounts: ALL, employees: emps, txns: [], asOf: "2025-12-31" });
  const t = X.buildEosbTxn({ accounts: ALL, rows, asOf: "2025-12-31" });
  ok(balanced(t), "provision entry balances");
  const rows2 = X.computeEosbProvision({ accounts: ALL, employees: emps, txns: [t], asOf: "2025-12-31" });
  eq(rows2[0].adjustment, 0, "once booked, the same date needs no further adjustment");
  const rows3 = X.computeEosbProvision({ accounts: ALL, employees: emps, txns: [t], asOf: "2026-12-31" });
  ok(rows3[0].adjustment > 0, "a year later the provision tops up");
}

// ═════════════════════════════════════════════════════════════════════════════
section("6.4 year-end close");
{
  const txns = [
    T("2025-01-01", [["aBank", 10000000, 0], ["aCap", 0, 10000000]], { txnType: "CI" }),
    T("2025-05-01", [["aBank", 5000000, 0], ["a4000", 0, 5000000]]),
    T("2025-06-01", [["a5100", 2000000, 0], ["aBank", 0, 2000000]]),
    T("2026-02-01", [["aBank", 1000000, 0], ["a4000", 0, 1000000]]),
  ];
  const { txn: close, profit } = X.buildYearEndCloseTxn({ accounts: ALL, txns, year: 2025 });
  eq(profit, 3000000, "2025 profit 30,000");
  ok(balanced(close), "closing entry balances");
  eq(close.date, "2025-12-31", "dated 31 December");
  const all = [...txns, close];
  throws(() => X.buildYearEndCloseTxn({ accounts: ALL, txns: all, year: 2025 }), "already closed", "a year closes once");
  eq(bal("3002", all), 3000000, "profit now sits in Retained Earnings");
  const p25 = X.buildLedger(X.withoutClosing(all.filter(t => t.date.startsWith("2025"))), ALL);
  eq(X.accountBalance(ALL.find(a => a.code === "4000"), p25), 5000000, "the 2025 P&L still reports its revenue (closing entry excluded)");
  const assets = X.accountBalance(ALL.find(a => a.code === "1002"), X.buildLedger(all, ALL));
  const L = X.buildLedger(all, ALL);
  const equityPlusProfit = ALL.filter(a => a.type === "Equity").reduce((s, a) => s + X.accountBalance(a, L), 0)
    + ALL.filter(a => a.type === "Revenue").reduce((s, a) => s + X.accountBalance(a, L), 0)
    - ALL.filter(a => a.type === "Expense").reduce((s, a) => s + X.accountBalance(a, L), 0);
  eq(assets, equityPlusProfit, "Balance Sheet still balances after the close");
  const es = X.computeEquityStatement({ accounts: ALL,
    openingLedger: X.buildLedger(all.filter(t => t.date < "2026-01-01"), ALL),
    filteredLedger: X.buildLedger(X.withoutClosing(all.filter(t => t.date >= "2026-01-01")), ALL),
    toDateLedger: X.buildLedger(all, ALL) });
  eq(es.difference, 0, "2026 equity statement still ties to the Balance Sheet");
  eq(es.rows.find(r => r.key === "retained").opening, 3000000, "opening retained earnings = the closed 2025 profit (counted once)");
}

// ═════════════════════════════════════════════════════════════════════════════
section("6.5 broker accrual → payment");
{
  const deal = { id: "d1", type: "Off-Plan", property_name: "Sky", broker_id: "BR1", broker_name: "Ali" };
  const E = txns => X.createJournalEngine({ accounts: ALL, txns, saveTxn: () => {} });
  const accr = E([]).postBrokerAccrual({ date: "2026-03-01", deal, amount: 5000, commit: false });
  let txns = [accr];
  eq(bal("5500", txns), 500000, "commission expense booked at accrual");
  eq(bal("2210", txns), 500000, "owed in Accrued Expenses");
  eq(X.accrualStatus(accr, txns), "unpaid", "accrual reads Unpaid");
  ok(E(txns).openBrokerAccrual("d1", "broker"), "open accrual found for the deal");
  const pay = E(txns).postBrokerPayment({ date: "2026-03-20", deal, brokerAmount: 5200, settleAccrualTxnId: accr.id, commit: false });
  ok(balanced(pay), "settlement balances");
  txns = [accr, pay];
  eq(bal("2210", txns), 0, "accrual cleared");
  eq(bal("5500", txns), 520000, "expense = what was actually paid (no double count)");
  eq(X.accrualStatus(accr, txns), "settled", "accrual reads Settled");
  ok(!E(txns).openBrokerAccrual("d1", "broker"), "no open accrual left");
}

// ═════════════════════════════════════════════════════════════════════════════
section("6.6 foreign currency");
{
  eq(X.fxToAed("10,000", 3.6725), 36725, "USD 10,000 @ 3.6725 = AED 36,725");
  ok(isNaN(X.fxToAed("1", 0)), "a zero rate is invalid");
  ok(isNaN(X.fxToAed("abc", 3.67)), "non-numeric amount is invalid");
  const f = X.fxTxnFields({ currency: "USD", amount: "10000", rate: "3.6725" });
  eq(f.fx_currency, "USD", "currency stamped on the entry");
  eq(X.fxLabel(f), "USD 10,000.00 @ 3.6725", "list label");
  eq(Object.keys(X.fxTxnFields(null)).length, 0, "AED entries carry no fx fields");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 6: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
