// ─────────────────────────────────────────────────────────────────────────────
//  Stage 4 — report corrections — regression spec
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/stage4.test.js
//  Exits non-zero if any assertion fails.
//
//  Drives the REAL core.jsx (cash flow, equity statement, KPIs) and
//  employees.jsx (revenue side). Amounts are integer cents. Covers
//  (implementation-plan-2026-10-18): 4.1 cash = bank+cash only · 4.2 voids
//  and reconciliation · 4.3 equity statement · 4.4 client money and loans out
//  of operating cash · 4.5 cancelled deals · 4.6 revenue net of VAT by entry
//  date · 4.8 runway base · 4.10 year shift.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + `
  ; return { createJournalEngine, buildLedger, accountBalance, calculateAppKpis, cashFlowCategory, computeCashFlow,
             computeEquityStatement, isOpenDeal, shiftIsoYears, isMoneyAccount };`)
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));
const EMP_NAMES = ["React", "uid", "usePersistedState", "usePersistedDateFilter", "C", "NAVY", "GOLD", "toast",
  "fmtAED", "fmtDate", "toCents", "todayStr", "xlsxExport", "XlsxSignBtn", "xAED", "hasPermission",
  "PageHeader", "DateFilterBar", "Inp", "Sel", "useState", "useEffect", "useMemo", "reversedTxnIds", "isInReversedPair", "isOpenDeal"];
const coreForEmp = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + "; return { reversedTxnIds, isInReversedPair, isOpenDeal };")
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));
const EMP = new Function(...EMP_NAMES, compile("nasama-accounting-v2.employees.jsx") + "; return { buildEmployeeLedger };")
  .apply(null, EMP_NAMES.map(n => coreForEmp[n] || (n === "uid" ? (() => "_" + Math.random().toString(36).slice(2)) : () => undefined)));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
const section = s => console.log("▸ " + s);

const ACCOUNTS = [
  { id: "aCash", code: "1001", name: "Cash", type: "Asset", isCash: true },
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "aPre",  code: "1004", name: "Prepaid Expenses", type: "Asset" },
  { id: "aFix",  code: "1510", name: "Computers & Laptops", type: "Asset" },
  { id: "aVAT",  code: "2101", name: "Output VAT Payable", type: "Liability", isOutputVAT: true },
  { id: "aRnd",  code: "2105", name: "VAT Rounding", type: "Liability" },
  { id: "aLoan", code: "2200", name: "Loan Payable", type: "Liability" },
  { id: "aCF",   code: "2230", name: "Client Funds Held", type: "Liability" },
  { id: "aCap",  code: "3000", name: "Capital Injection", type: "Equity" },
  { id: "aRE",   code: "3002", name: "Retained Earnings", type: "Equity" },
  { id: "aDraw", code: "3100", name: "Owner Drawings", type: "Equity" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense" },
];
const byId = new Map(ACCOUNTS.map(a => [a.id, a]));
let n = 0;
const T = (date, lines, extra = {}) => ({ id: "t" + (++n), date, ref: "R" + n, description: "d" + n, isVoid: false, txnType: "JV", lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })), ...extra });
const ledger = txns => X.buildLedger(txns, ACCOUNTS);

// ═════════════════════════════════════════════════════════════════════════════
section("4.1 / 4.2 / 4.4 cash flow");
{
  ok(!X.isMoneyAccount(byId.get("aPre")), "1004 Prepaid Expenses is NOT cash");
  ok(X.isMoneyAccount(byId.get("aCash")) && X.isMoneyAccount(byId.get("aBank")), "bank and cash are cash");
  const cap  = T("2026-01-01", [["aBank", 10000000, 0], ["aCap", 0, 10000000]], { txnType: "CI" });
  const rent = T("2026-02-01", [["a5100", 500000, 0], ["aBank", 0, 500000]], { txnType: "PV" });
  const pre  = T("2026-02-02", [["aPre", 300000, 0], ["aBank", 0, 300000]]);
  const amort= T("2026-02-28", [["a5100", 100000, 0], ["aPre", 0, 100000]]);
  const pc   = T("2026-02-03", [["aFix", 400000, 0], ["aBank", 0, 400000]]);
  const loan = T("2026-02-04", [["aBank", 2000000, 0], ["aLoan", 0, 2000000]]);
  const dep  = T("2026-02-05", [["aBank", 5000000, 0], ["aCF", 0, 5000000]], { txnType: "CF", tags: "client-funds-received" });
  const xfer = T("2026-02-06", [["aCash", 100000, 0], ["aBank", 0, 100000]], { txnType: "BT" });
  const sale = T("2026-02-07", [["aBank", 1050000, 0], ["a4000", 0, 1000000], ["aVAT", 0, 50000]], { txnType: "SR" });
  const voided = T("2026-02-08", [["aBank", 9900000, 0], ["a4000", 0, 9900000]], { txnType: "SR", isVoid: true });
  const cat = t => X.cashFlowCategory(t, byId);
  eq(cat(rent), "operating", "rent → operating");
  eq(cat(pre), "operating", "paying a prepayment → operating cash out (it is no longer 'cash')");
  eq(cat(amort), null, "amortising a prepayment moves no cash");
  eq(cat(pc), "investing", "fixed asset → investing");
  eq(cat(loan), "financing", "loan drawdown → financing (was operating)");
  eq(cat(cap), "financing", "capital → financing");
  eq(cat(dep), "clientFunds", "client deposit → its own line (was operating)");
  eq(cat(xfer), "transfer", "own-account transfer → no effect");
  eq(cat(voided), null, "void → nothing");

  const all = [cap, rent, pre, amort, pc, loan, dep, xfer, sale, voided];
  const period = all.filter(t => t.date >= "2026-02-01");
  const opening = ledger(all.filter(t => t.date < "2026-02-01"));
  const closing = ledger(all);
  const cf = X.computeCashFlow({ accounts: ACCOUNTS, txns: period, openingLedger: opening, toDateLedger: closing });
  eq(cf.openingCash, 10000000, "opening cash 100,000");
  eq(cf.sections.operating.total, -500000 - 300000 + 1050000, "operating = rent + prepayment + sale (void excluded)");
  eq(cf.sections.investing.total, -400000, "investing = laptop");
  eq(cf.sections.financing.total, 2000000, "financing = loan");
  eq(cf.sections.clientFunds.total, 5000000, "client money on its own line");
  eq(cf.difference, 0, "opening + movements = closing (the void no longer breaks it)");
  eq(cf.closingCash, cf.openingCash + cf.netMovement, "statement foots");
  ok(!cf.sections.operating.lines.some(l => l.amount === 9900000), "voided receipt is not listed");

  // Dashboard operating cash flow uses the same rules
  const now = new Date();
  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const k = X.calculateAppKpis({ accounts: ACCOUNTS, txns: [
      T(`${m}-01`, [["aBank", 5000000, 0], ["aCF", 0, 5000000]], { txnType: "CF", tags: "client-funds-received" }),
      T(`${m}-01`, [["aBank", 2000000, 0], ["aLoan", 0, 2000000]]),
      T(`${m}-01`, [["a5100", 100000, 0], ["aBank", 0, 100000]], { txnType: "PV" }),
    ], deals: [], ledger: {}, settings: { openingBalanceDate: "2025-01-01" } });
  eq(k.operatingCashFlowMTD, -100000, "dashboard operating cash ignores the deposit and the loan");
  const cur = k.cashFlowSeries.find(x => x.key === m);
  eq(cur.inflow, 2000000, "6-month series: client money left out, the real loan kept");
}

// ═════════════════════════════════════════════════════════════════════════════
section("4.3 statement of changes in equity");
{
  const txns = [
    T("2025-01-01", [["aBank", 20000000, 0], ["aCap", 0, 20000000]], { txnType: "CI" }),
    T("2025-06-01", [["aBank", 10000000, 0], ["a4000", 0, 10000000]]),       // 2025 profit 100,000
    T("2026-02-01", [["aBank", 7000000, 0], ["a4000", 0, 7000000]]),        // 2026 revenue 70,000
    T("2026-03-01", [["a5100", 2000000, 0], ["aBank", 0, 2000000]]),        // 2026 expense 20,000
    T("2026-04-01", [["aDraw", 2000000, 0], ["aBank", 0, 2000000]], { txnType: "OD" }),  // drawings 20,000
  ];
  const from = "2026-01-01", to = "2026-12-31";
  const es = X.computeEquityStatement({ accounts: ACCOUNTS,
    openingLedger: ledger(txns.filter(t => t.date < from)),
    filteredLedger: ledger(txns.filter(t => t.date >= from && t.date <= to)),
    toDateLedger: ledger(txns.filter(t => t.date <= to)) });
  const row = k => es.rows.find(r => r.key === k);
  eq(row("retained").opening, 10000000, "opening retained earnings include 2025's unclosed profit");
  eq(row("retained").ni, 5000000, "period net income 50,000");
  eq(row("drawings").movement, -2000000, "drawings are NEGATIVE (they reduce equity)");
  eq(es.total.movement, -2000000, "total movement subtracts drawings (it used to ADD them)");
  eq(es.total.closing, es.total.opening + es.total.movement + es.total.ni, "total row adds across");
  eq(es.total.closing, 20000000 + 10000000 + 5000000 - 2000000, "closing equity 330,000");
  eq(es.difference, 0, "closing equity equals the Balance Sheet");
  eq(es.total.closing, es.rows.reduce((s, r) => s + r.closing, 0), "total row adds down");
}

// ═════════════════════════════════════════════════════════════════════════════
section("4.5 cancelled deals and 4.8 runway");
{
  ok(X.isOpenDeal({ stage: "SPA Signed" }), "SPA signed is open");
  ok(!X.isOpenDeal({ stage: "Cancelled" }), "cancelled is not open");
  ok(!X.isOpenDeal({ stage: "Commission Collected" }), "collected is not open");
  const deals = [{ id: "a", type: "Off-Plan", stage: "SPA Signed", expected_commission_net: 100 }, { id: "b", type: "Off-Plan", stage: "Cancelled", expected_commission_net: 900 }];
  const now = new Date();
  const ym = k => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-10`; };
  const txns = [
    ...[1, 2, 3, 4, 5, 6].map(k => T(ym(k), [["a5100", 1000000, 0], ["aBank", 0, 1000000]], { txnType: "PV" })), // 10,000/month rent
    T(ym(2), [["a5500", 30000000, 0], ["aBank", 0, 30000000]], { txnType: "BP" }),                              // one 300,000 broker payout
    T(ym(0), [["a5100", 9000000, 0], ["aBank", 0, 9000000]], { txnType: "PV" }),                               // current month, incomplete
    T("2025-01-01", [["aBank", 100000000, 0], ["aCap", 0, 100000000]], { txnType: "CI" }),
  ];
  const k = X.calculateAppKpis({ accounts: ACCOUNTS, txns, deals, ledger: ledger(txns), settings: { openingBalanceDate: "2025-01-01" } });
  eq(k.pendingPipelineCommission, 100, "pipeline excludes the cancelled deal");
  eq(k.openDealsCount, 1, "open deal count excludes cancelled");
  eq(k.avgMonthlyFixedOverhead, 1000000, "fixed overhead = rent only, complete months only");
  eq(k.runwayMonths, k.availableCash / 1000000, "runway divides by fixed overhead (the broker payout no longer halves it)");
}

// ═════════════════════════════════════════════════════════════════════════════
section("4.6 employees revenue: net of VAT, dated by the entry");
{
  const roster = [{ id: "p1", name: "Faoud Dada", broker_id: "BR1", aliases: [] }];
  const deals = [{ id: "d1", broker_id: "BR1", property_name: "U1", stage: "Commission Collected", expected_commission_net: 1000000, created_at: "2025-12-15" }];
  const sr = T("2026-03-10", [["aBank", 1050000, 0], ["a4000", 0, 1000000], ["aVAT", 0, 50000]], { txnType: "SR", deal_id: "d1" });
  sr.lines.forEach(l => { l.deal_id = "d1"; });
  const run = (from, to) => EMP.buildEmployeeLedger({ roster, deals, txns: [sr], accounts: ACCOUNTS, from, to });
  const p26 = run("2026-01-01", "2026-12-31").rows[0];
  eq(p26.generated, 1000000, "2026 shows the revenue NET of VAT (was 1,050,000 gross)");
  const p25 = run("2025-01-01", "2025-12-31").rows[0];
  eq(p25.generated, 0, "2025 (deal created) shows no revenue — it was earned in 2026");
}

// ═════════════════════════════════════════════════════════════════════════════
section("4.10 year shift");
{
  eq(X.shiftIsoYears("2024-02-29", -1), "2023-02-28", "29 Feb clamps");
  eq(X.shiftIsoYears("2026-03-31", -1), "2025-03-31", "normal day unchanged");
  eq(X.shiftIsoYears("2027-02-28", 1), "2028-02-28", "forward shift");
  eq(X.shiftIsoYears("", -1), "", "blank stays blank");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 4: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
