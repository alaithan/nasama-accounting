// ─────────────────────────────────────────────────────────────────────────────
//  Reports — property spec (implementation plan 8.2)
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/reports.test.js
//  Builds a seeded, random book of entries through the REAL engine and checks
//  the accounting identities every report relies on, for many random periods:
//    • trial balance: debits = credits
//    • balance sheet: assets = liabilities + equity + profit to date
//    • cash flow: opening + movements = closing (difference 0)
//    • changes in equity: closing ties to the balance sheet (difference 0)
//    • VAT report: net = movement on 2101 − 1201, settlements excluded
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + `; return { createJournalEngine, buildLedger, accountBalance, computeCashFlow,
  computeEquityStatement, withoutClosing, buildYearEndCloseTxn, isVATSettlementTxn, withStage6Accounts };`)
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; if (failed < 15) console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
// Deterministic PRNG (mulberry32) so a failure is reproducible.
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const BASE = [
  { id: "aCash", code: "1001", name: "Cash", type: "Asset", isCash: true },
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "aBank2", code: "1003", name: "Bank 2", type: "Asset", isBank: true },
  { id: "aPre", code: "1004", name: "Prepaid Expenses", type: "Asset" },
  { id: "aIn", code: "1201", name: "Input VAT", type: "Asset", isInputVAT: true },
  { id: "aPC", code: "1510", name: "Computers", type: "Asset" },
  { id: "aVAT", code: "2101", name: "Output VAT", type: "Liability", isOutputVAT: true },
  { id: "aRnd", code: "2105", name: "VAT Rounding", type: "Liability" },
  { id: "aLoan", code: "2200", name: "Loan Payable", type: "Liability" },
  { id: "aAcc", code: "2210", name: "Accrued Expenses", type: "Liability" },
  { id: "aCF", code: "2230", name: "Client Funds Held", type: "Liability" },
  { id: "aCap", code: "3000", name: "Capital Injection", type: "Equity" },
  { id: "aDraw", code: "3100", name: "Owner Drawings", type: "Equity" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a4010", code: "4010", name: "Seller Commission", type: "Revenue" },
  { id: "a4020", code: "4020", name: "Rental Commission", type: "Revenue" },
  { id: "a5040", code: "5040", name: "Manager Override", type: "Expense" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5500", code: "5500", name: "Broker Commission", type: "Expense" },
];
const ACCOUNTS = X.withStage6Accounts(BASE, ["retained"]).accounts;
const types = ["Off-Plan", "Secondary", "Rental"];

function buildBook(seed) {
  const r = rng(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const amt = (lo, hi) => Math.round((lo + r() * (hi - lo)) * 100) / 100;
  const date = () => { const d = new Date(2025, 0, 1 + Math.floor(r() * 640)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const txns = [];
  const J = () => X.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
  const add = t => { if (t) txns.push(t); return t; };
  add(J().post({ date: "2025-01-01", description: "capital", ref: "CI", txnType: "CI", commit: false, lines: [{ accountId: "aBank", debit: 50000000, credit: 0 }, { accountId: "aCap", debit: 0, credit: 50000000 }] }));
  for (let i = 0; i < 260; i++) {
    const k = r(), d = date();
    const deal = { id: "d" + Math.floor(r() * 30), type: pick(types), property_name: "P", broker_id: "B1", broker_name: "B" };
    try {
      if (k < 0.22) add(J().postSaleReceipt({ date: d, deal, gross: amt(500, 90000), vatRate: r() < 0.8 ? 5 : 0, bankCode: pick(["1002", "1001"]), commit: false }));
      else if (k < 0.40) add(J().postPayment({ date: d, memo: "exp", gross: amt(50, 9000), vatRate: r() < 0.6 ? 5 : 0, expenseCode: "5100", paidFromCode: pick(["1002", "1003"]), commit: false }));
      else if (k < 0.48) add(J().postBrokerPayment({ date: d, deal, brokerAmount: amt(100, 20000), commit: false }));
      else if (k < 0.54) add(J().postBankTransfer({ date: d, fromCode: "1002", toCode: pick(["1003", "1001"]), amount: amt(10, 5000), commit: false }));
      else if (k < 0.62) add(J().postClientFunds({ date: d, amount: amt(1000, 30000), receivedFrom: "C" + i, deal_id: deal.id, commit: false }));
      else if (k < 0.66) { const held = J().clientFundsHeldCents(); if (held > 100) add(J().postClientFundsPayout({ date: d, amount: Math.min(held, 500000) / 100, paidTo: "C", commit: false })); }
      else if (k < 0.72) add(J().postAccrual({ date: d, memo: "acc", gross: amt(100, 4000), expenseCode: "5100", plannedExpenseId: "pe" + i, commit: false }));
      else if (k < 0.76) { const open = txns.filter(t => t.txnType === "AC" && !txns.some(s => s.accrual_txn_id === t.id)); if (open.length) { const a = pick(open); add(J().postAccrualSettlement({ date: d > a.date ? d : a.date, memo: "pay", gross: amt(100, 4000), accrualTxnId: a.id, plannedExpenseId: a.planned_expense_id, expenseCode: "5100", commit: false })); } }
      else if (k < 0.80) { const c = Math.round(amt(1000, 8000) * 100); add(J().post({ date: d, description: "laptop", ref: "PC", commit: false, lines: [{ accountId: "aPC", debit: c, credit: 0 }, { accountId: "aBank", debit: 0, credit: c }] })); }
      else if (k < 0.83) { const c = Math.round(amt(5000, 50000) * 100); add(J().post({ date: d, description: "loan", ref: "LN", commit: false, lines: [{ accountId: "aBank", debit: c, credit: 0 }, { accountId: "aLoan", debit: 0, credit: c }] })); }
      else if (k < 0.86) { const c = Math.round(amt(500, 8000) * 100); add(J().post({ date: d, description: "drawing", ref: "OD", txnType: "OD", commit: false, lines: [{ accountId: "aDraw", debit: c, credit: 0 }, { accountId: "aBank", debit: 0, credit: c }] })); }
      else if (k < 0.89) { const c = Math.round(amt(500, 6000) * 100); add(J().post({ date: d, description: "prepay", ref: "PP", commit: false, lines: [{ accountId: "aPre", debit: c, credit: 0 }, { accountId: "aBank", debit: 0, credit: c }] })); }
      else if (k < 0.94) { const cands = txns.filter(t => !t.reversesTxnId && !t.isVoid && !txns.some(x => x.reversesTxnId === t.id)); if (cands.length) { const o = pick(cands); add(J().reverseTransaction(o.id, d > o.date ? d : o.date, "Reversal", false)); } }
      else if (k < 0.97) { const settleOut = Math.round(amt(100, 3000) * 100); add({ id: "vs" + i, date: d, isVoid: false, txnType: "JV", lines: [{ accountId: "aVAT", debit: settleOut, credit: 0 }, { accountId: "aBank", debit: 0, credit: settleOut }] }); }
      else { const c = txns[Math.floor(r() * txns.length)]; if (c && !c.reversesTxnId && !txns.some(x => x.reversesTxnId === c.id)) c.isVoid = true; }
    } catch (e) { /* the engine refusing a random case (e.g. paying out more than held) is fine */ }
  }
  // Close 2025 for half the seeds: reports must still tie.
  if (seed % 2 === 0) { try { txns.push(X.buildYearEndCloseTxn({ accounts: ACCOUNTS, txns, year: 2025 }).txn); } catch (e) { } }
  return txns;
}

const sumType = (L, type) => ACCOUNTS.filter(a => a.type === type).reduce((s, a) => s + X.accountBalance(a, L), 0);
const periods = r => { const out = []; for (let i = 0; i < 6; i++) { const a = new Date(2025, Math.floor(r() * 20), 1); const b = new Date(a.getFullYear(), a.getMonth() + 1 + Math.floor(r() * 6), 0); const f = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push([f(a), f(b)]); } return out; };

console.log("▸ seeded books × random periods");
for (let seed = 1; seed <= 12; seed++) {
  const txns = buildBook(seed);
  if (process.env.SHOW_BOOK) { const m = {}; txns.forEach(t => { const k = t.isVoid ? "void" : t.reversesTxnId ? "reversal" : (t.tags || "").includes("year-end-close") ? "close" : t.txnType; m[k] = (m[k] || 0) + 1; }); console.log(seed, JSON.stringify(m)); }
  const r = rng(seed * 97);
  // Trial balance (all history): Σdebits = Σcredits
  const live = txns.filter(t => !t.isVoid);
  eq(live.reduce((s, t) => s + t.lines.reduce((ss, l) => ss + (l.debit || 0) - (l.credit || 0), 0), 0), 0, `seed ${seed}: trial balance foots`);
  for (const [from, to] of periods(r)) {
    const toDate = X.buildLedger(txns.filter(t => t.date <= to), ACCOUNTS);
    const opening = X.buildLedger(txns.filter(t => t.date < from), ACCOUNTS);
    const period = txns.filter(t => t.date >= from && t.date <= to);
    const filtered = X.buildLedger(X.withoutClosing(period), ACCOUNTS);
    // Balance sheet
    const assets = sumType(toDate, "Asset"), liab = sumType(toDate, "Liability"), equity = sumType(toDate, "Equity");
    const profit = sumType(toDate, "Revenue") - sumType(toDate, "Expense");
    eq(assets, liab + equity + profit, `seed ${seed} ${to}: balance sheet balances`);
    // Cash flow
    eq(X.computeCashFlow({ accounts: ACCOUNTS, txns: period, openingLedger: opening, toDateLedger: toDate }).difference, 0, `seed ${seed} ${from}→${to}: cash flow reconciles`);
    // Equity statement
    eq(X.computeEquityStatement({ accounts: ACCOUNTS, openingLedger: opening, filteredLedger: filtered, toDateLedger: toDate }).difference, 0, `seed ${seed} ${from}→${to}: equity ties to balance sheet`);
    // VAT report vs ledger movement (settlements excluded)
    const J = X.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
    const vat = J.getVATReport({ fromDate: from, toDate: to });
    const nonSettle = X.buildLedger(period.filter(t => !t.isVoid && !X.isVATSettlementTxn(t, ACCOUNTS)), ACCOUNTS);
    const mv = X.accountBalance(ACCOUNTS.find(a => a.code === "2101"), nonSettle) - X.accountBalance(ACCOUNTS.find(a => a.code === "1201"), nonSettle);
    eq(vat.netVat, mv, `seed ${seed} ${from}→${to}: VAT report = ledger movement`);
  }
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — reports: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
