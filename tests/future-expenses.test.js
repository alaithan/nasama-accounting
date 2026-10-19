// ─────────────────────────────────────────────────────────────────────────────
//  Future expenses — regression spec (implementation plan 8.4)
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/future-expenses.test.js
//  core.jsx + future-expenses.jsx in one scope. Covers the due-date helpers and
//  the full accrual lifecycle of a RECURRING planned expense: accrue → pay
//  (with true-up) → next cycle accrues → reversal re-opens.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + ";\n" + compile("nasama-accounting-v2.future-expenses.jsx") + `
  ; return { createJournalEngine, buildLedger, accountBalance, accrualStatus, feAdvanceNextDueDate, feDueAnchorDay, feComputeStatus,
             feComputeMonthlyEquivalent, fePaidPatch };`)
  .apply(null, NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
const section = s => console.log("▸ " + s);
const ACCOUNTS = [
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "aIn", code: "1201", name: "Input VAT", type: "Asset", isInputVAT: true },
  { id: "aRnd", code: "2105", name: "Rounding", type: "Liability" },
  { id: "aAcc", code: "2210", name: "Accrued Expenses Payable", type: "Liability" },
  { id: "a5110", code: "5110", name: "DEWA", type: "Expense" },
];
const J = txns => X.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
const bal = (code, txns) => X.accountBalance(ACCOUNTS.find(a => a.code === code), X.buildLedger(txns, ACCOUNTS));

section("due dates and status");
{
  const q = { expenseType: "recurring", frequency: "quarterly", nextDueDate: "2026-01-31" };
  eq(X.feAdvanceNextDueDate(q), "2026-04-30", "quarterly from 31 Jan → 30 Apr");
  eq(X.feAdvanceNextDueDate({ ...q, nextDueDate: "2026-04-30", dueDay: 31 }), "2026-07-31", "anchor day restores the 31st");
  eq(X.feAdvanceNextDueDate({ expenseType: "recurring", frequency: "yearly", nextDueDate: "2026-06-15" }), "2027-06-15", "yearly");
  const today = new Date("2026-10-20T12:00:00");
  eq(X.feComputeStatus({ nextDueDate: "2026-10-01" }, today), "Overdue", "past due → Overdue");
  eq(X.feComputeStatus({ nextDueDate: "2026-10-25" }, today), "Due Soon", "within 7 days → Due Soon");
  eq(X.feComputeStatus({ nextDueDate: "2026-12-01" }, today), "Planned", "later → Planned");
  eq(X.feComputeStatus({ nextDueDate: "2026-10-01", status: "Paid" }, today), "Paid", "paid stays paid");
  eq(X.feComputeMonthlyEquivalent({ frequency: "quarterly", amountExpected: 300000 }), 100000, "quarterly → monthly equivalent");
  eq(X.feComputeMonthlyEquivalent({ frequency: "yearly", amountExpected: 1200000 }), 100000, "yearly → monthly equivalent");
}

section("recurring accrual lifecycle");
{
  let item = { id: "pe1", title: "DEWA", expenseType: "recurring", frequency: "monthly", nextDueDate: "2026-01-31", amountExpected: 105000, vatApplicable: true, amountIncludesVat: true };
  // January: accrue (VAT taken at payment), then pay a little more than accrued.
  const jan = J([]).postAccrual({ date: item.nextDueDate, memo: "DEWA", gross: 1050, vatRate: 5, expenseCode: "5110", plannedExpenseId: item.id, commit: false });
  let txns = [jan];
  eq(X.accrualStatus(jan, txns), "unpaid", "January accrued, unpaid");
  const janPay = J(txns).postAccrualSettlement({ date: "2026-02-05", memo: "DEWA", gross: 1102.5, vatRate: 5, plannedExpenseId: item.id, accrualTxnId: jan.id, commit: false });
  txns = [jan, janPay];
  eq(X.accrualStatus(jan, txns), "settled", "January settled");
  eq(bal("2210", txns), 0, "payable cleared exactly");
  eq(bal("5110", txns), 105000, "expense = actual net paid (1,000 accrued + 50 true-up)");
  eq(bal("1201", txns), 5250, "input VAT recognised at payment");
  // The item rolls to February.
  item = { ...item, ...X.fePaidPatch(item, janPay.id, "u@x", janPay.date) };
  eq(item.nextDueDate, "2026-02-28", "next cycle due end of February");
  eq(item.accrualTxnId, "", "accrual link cleared for the new cycle");
  // February: accrue → must read UNPAID (the January settlement must not count).
  const feb = J(txns).postAccrual({ date: item.nextDueDate, memo: "DEWA", gross: 1050, vatRate: 5, expenseCode: "5110", plannedExpenseId: item.id, commit: false });
  txns = [jan, janPay, feb];
  eq(X.accrualStatus(feb, txns), "unpaid", "February accrual is unpaid");
  eq(bal("2210", txns), 100000, "February owed in 2210");
  // Reversing February's accrual re-opens nothing and owes nothing.
  const rev = J(txns).reverseTransaction(feb.id, "2026-03-01", "Reversal", false);
  txns = [...txns, rev];
  eq(X.accrualStatus(feb, txns), "reversed", "reversed accrual reads Reversed");
  eq(X.accrualStatus(rev, txns), null, "the reversal is not an accrual");
  eq(bal("2210", txns), 0, "nothing owed after the reversal");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — future expenses: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
