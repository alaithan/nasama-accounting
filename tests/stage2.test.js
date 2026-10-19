// ─────────────────────────────────────────────────────────────────────────────
//  Stage 2 — ledger integrity and controls — regression spec
//
//  Zero dependencies (uses the vendored Babel to load the .jsx). Run with:
//      node tests/stage2.test.js
//  Exits non-zero if any assertion fails.
//
//  Drives the REAL code out of core.jsx, future-expenses.jsx and invoices.jsx.
//  All ledger amounts are integer CENTS. Covers (implementation-plan-2026-10-18):
//    2.1  period lock               2.6  chart-of-accounts guards
//    2.2  reversal propagation      2.9  accrual settlement true-up
//    2.4  accrual ↔ settlement      2.10 recurring due dates
//    2.5  VAT follows the deal
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };

const CORE_NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage",
  "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const CORE = new Function(...CORE_NAMES, compile("nasama-accounting-v2.core.jsx") + `
  ; return { createJournalEngine, buildLedger, accountBalance, toCents,
             assertPeriodOpen, isDateLocked, isTxnLocked, periodLockDate, normalizeLockDate,
             reversedTxnIds, isInReversedPair, isAccrualTxn, accrualStatus,
             dealCollection, buildClientFundsLedger, clientFundsHeldByAccount,
             dealReceiptVatRate, invLineCommissionCents,
             accountUsage, validateAccountSave, validateAccountDelete, ENGINE_ACCOUNT_CODES,
             approvalScopeOfTxn, approvalAmountCents, postingLimitCents, needsApproval,
             assertWithinPostingLimit, approvalDecisionBlocker,
             provisionalRefPrefix, planSequentialRefs, txnKeepsRef };`)
  .apply(null, CORE_NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

// future-expenses.jsx: pure date helpers only (components never run).
const FE_NAMES = ["React", "useState", "useEffect", "useMemo", "useRef", "useCallback", "C", "toast", "uid", "todayStr", "fmtDate", "fmtAED", "toCents", "fromCents"];
const FE = new Function(...FE_NAMES, compile("nasama-accounting-v2.future-expenses.jsx") + "; return { feAdvanceNextDueDate, feDueAnchorDay, fePaidPatch };")
  .apply(null, FE_NAMES.map(n => n === "React" ? REACT_STUB : () => undefined));

// invoices.jsx: line math only.
const INV_NAMES = ["React", "C", "toast", "uid", "todayStr", "fmtDate", "fmtAED", "db", "hasPermission", "logAudit"];
const INV = new Function(...INV_NAMES, compile("nasama-accounting-v2.invoices.jsx") + "; return { invSplitVat, invLineCalc, invTotals, invLineCents, invPctForAmount, invVatLabel };")
  .apply(null, INV_NAMES.map(n => n === "React" ? REACT_STUB : () => undefined));

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
  { id: "aCash", code: "1001", name: "Cash", type: "Asset", isCash: true },
  { id: "aBank", code: "1002", name: "Bank — Mashreq", type: "Asset", isBank: true },
  { id: "aIn",   code: "1201", name: "Input VAT", type: "Asset", isInputVAT: true },
  { id: "aVAT",  code: "2101", name: "Output VAT Payable", type: "Liability", isOutputVAT: true },
  { id: "aRnd",  code: "2105", name: "VAT Rounding", type: "Liability" },
  { id: "aAcc",  code: "2210", name: "Accrued Expenses Payable", type: "Liability" },
  { id: "aCF",   code: "2230", name: "Client Funds Held", type: "Liability" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5600", code: "5600", name: "Bank Fees", type: "Expense" },
  { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense" },
];
const DEAL = { id: "d1", type: "Off-Plan", property_name: "The View", client_name: "Acme LLC", vat_applicable: true, expected_commission_net: 10000000 };
const engine = txns => CORE.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
const bal = (code, txns) => CORE.accountBalance(ACCOUNTS.find(a => a.code === code), CORE.buildLedger(txns, ACCOUNTS));
const balanced = t => (t.lines || []).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) === 0;

// ═════════════════════════════════════════════════════════════════════════════
section("2.1 period lock");
{
  const S = { lockedThrough: "2026-03-31" };
  eq(CORE.periodLockDate(S), "2026-03-31", "lock date read from settings");
  eq(CORE.periodLockDate({ lockedThrough: "31/03/2026" }), "", "malformed lock date is ignored, not half-applied");
  ok(CORE.isDateLocked("2026-03-31", S), "the lock date itself is closed (inclusive)");
  ok(CORE.isDateLocked("2026-01-15", S), "earlier dates are closed");
  ok(!CORE.isDateLocked("2026-04-01", S), "the day after is open");
  ok(!CORE.isDateLocked("2026-01-15", {}), "no lock → nothing closed");

  const march = { id: "t1", date: "2026-03-15", lines: [] };
  throws(() => CORE.assertPeriodOpen({ prev: null, next: march, settings: S }), "Period closed", "cannot post into a closed month");
  throws(() => CORE.assertPeriodOpen({ prev: march, next: { ...march, description: "x" }, settings: S }), "Period closed", "cannot edit a closed-month entry");
  throws(() => CORE.assertPeriodOpen({ prev: march, next: { ...march, date: "2026-04-10" }, settings: S }), "Period closed", "cannot move an entry OUT of a closed month");
  throws(() => CORE.assertPeriodOpen({ prev: { id: "t2", date: "2026-04-10" }, next: { id: "t2", date: "2026-03-10" }, settings: S }), "Period closed", "cannot move an entry INTO a closed month");
  throws(() => CORE.assertPeriodOpen({ prev: march, next: null, settings: S }), "Period closed", "cannot delete a closed-month entry");
  throws(() => CORE.assertPeriodOpen({ prev: march, next: { isVoid: true }, settings: S }), "Period closed", "a partial patch (no date) keeps the stored date → still refused");
  CORE.assertPeriodOpen({ prev: null, next: { id: "t3", date: "2026-04-02" }, settings: S }); passed++;  // open month posts
  CORE.assertPeriodOpen({ prev: march, next: { ...march, description: "x" }, settings: {} }); passed++; // no lock → allowed
  // The approved correction path: a reversal dated today, in the open period.
  const rev = engine([march]).reverseTransaction("t1", "2026-04-05", "Reversal", false);
  CORE.assertPeriodOpen({ prev: null, next: rev, settings: S }); passed++;
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.2 reversal propagation");
{
  const e0 = engine([]);
  const sr = e0.postSaleReceipt({ date: "2026-05-01", deal: DEAL, gross: 105000, vatRate: 5, invoiceId: "inv1", invoiceNo: "101", commit: false });
  let txns = [sr];
  eq(CORE.dealCollection(DEAL, txns, ACCOUNTS).collectedCents, 10500000, "receipt counts as collected");
  const rev = engine(txns).reverseTransaction(sr.id, "2026-05-10", "Bounced cheque", false);
  txns = [sr, rev];
  ok(balanced(rev), "reversal balances");
  eq(rev.deal_id, "d1", "reversal carries the deal_id");
  eq(rev.invoice_id, "inv1", "reversal carries the invoice_id");
  eq(rev.reversesTxnId, sr.id, "reversal links its original");
  eq(CORE.dealCollection(DEAL, txns, ACCOUNTS).collectedCents, 0, "a reversed receipt is NOT collected (was 105,000 before the fix)");
  eq(bal("1002", txns), 0, "bank nets to zero");
  ok(CORE.isInReversedPair(sr, CORE.reversedTxnIds(txns)) && CORE.isInReversedPair(rev, CORE.reversedTxnIds(txns)), "both sides are recognised as a reversed pair");
  // a voided reversal no longer offsets
  const revVoid = { ...rev, isVoid: true };
  eq(CORE.dealCollection(DEAL, [sr, revVoid], ACCOUNTS).collectedCents, 10500000, "a VOID reversal does not cancel the original");

  // Accrual reversal must not read as an unpaid accrual
  const acc = e0.postAccrual({ date: "2026-05-01", memo: "May rent", gross: 10000, expenseCode: "5100", plannedExpenseId: "pe1", commit: false });
  const accRev = engine([acc]).reverseTransaction(acc.id, "2026-05-02", "Reversal", false);
  ok(!CORE.isAccrualTxn(accRev), "the reversal of an accrual is not itself an accrual");
  eq(CORE.accrualStatus(accRev, [acc, accRev]), null, "…so it has no Unpaid pill");
  eq(CORE.accrualStatus(acc, [acc, accRev]), "reversed", "the original reads Reversed");

  // Client funds: reversing a deposit nets inside the SAME party (no phantom party)
  const dep = e0.postClientFunds({ date: "2026-05-01", amount: 50000, receivedFrom: "Mr Tenant", deal_id: "d1", commit: false });
  const depRev = engine([dep]).reverseTransaction(dep.id, "2026-05-03", "Reversal", false);
  let cfl = CORE.buildClientFundsLedger({ txns: [dep, depRev], accounts: ACCOUNTS });
  eq(cfl.parties.length, 1, "one party, not an extra phantom row");
  eq(cfl.parties[0].held, 0, "nothing still held after the reversal");
  // Legacy reversal written before ids were copied: no deal_id on it
  const legacyRev = { ...depRev, deal_id: undefined, customer_id: undefined, counterparty: "Mr Tenant" };
  cfl = CORE.buildClientFundsLedger({ txns: [dep, legacyRev], accounts: ACCOUNTS });
  eq(cfl.parties.length, 1, "legacy reversal (no deal_id) joins its original's party");
  eq(cfl.parties[0].held, 0, "legacy reversal nets to zero too");
  eq(CORE.clientFundsHeldByAccount(cfl.parties[0], ACCOUNTS).length, 0, "no money left in any bucket for the party");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.4 accrual ↔ settlement (recurring)");
{
  // January accrual + settlement, then February accrual still unpaid.
  const jan = engine([]).postAccrual({ date: "2026-01-31", memo: "Rent", gross: 10000, expenseCode: "5100", plannedExpenseId: "pe1", commit: false });
  const janPay = engine([jan]).postAccrualSettlement({ date: "2026-02-03", memo: "Rent", gross: 10000, plannedExpenseId: "pe1", accrualTxnId: jan.id, commit: false });
  eq(janPay.accrual_txn_id, jan.id, "settlement stamps the accrual it clears");
  const feb = engine([jan, janPay]).postAccrual({ date: "2026-02-28", memo: "Rent", gross: 10000, expenseCode: "5100", plannedExpenseId: "pe1", commit: false });
  let all = [jan, janPay, feb];
  eq(CORE.accrualStatus(jan, all), "settled", "January settled");
  eq(CORE.accrualStatus(feb, all), "unpaid", "February is UNPAID (read 'Settled' before the fix)");
  eq(bal("2210", all), 1000000, "2210 still carries February");

  // Legacy data: settlements without accrual_txn_id are paired first-in-first-out.
  const lj = { ...jan, id: "LJ" }, lf = { ...feb, id: "LF", createdAt: "2026-02-28T10:00:00Z" };
  const lpay = { ...janPay, id: "LP" }; delete lpay.accrual_txn_id;
  all = [lj, lpay, lf];
  eq(CORE.accrualStatus(lj, all), "settled", "legacy: the oldest accrual takes the one legacy settlement");
  eq(CORE.accrualStatus(lf, all), "unpaid", "legacy: the next cycle stays unpaid");
  // A reversed settlement settles nothing
  const payRev = engine([jan, janPay]).reverseTransaction(janPay.id, "2026-02-05", "Reversal", false);
  eq(CORE.accrualStatus(jan, [jan, janPay, payRev]), "unpaid", "reversing the settlement re-opens the accrual");
  // Double settlement is refused
  throws(() => engine([jan, janPay]).postAccrualSettlement({ date: "2026-02-04", memo: "Rent", gross: 10000, plannedExpenseId: "pe1", accrualTxnId: jan.id, commit: false }),
    "already been settled", "an accrual cannot be settled twice");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.9 accrual settlement true-up");
{
  // Accrued 1,000 incl. 5% VAT → 952.38 net in 2210.
  const acc = engine([]).postAccrual({ date: "2026-03-31", memo: "DEWA", gross: 1000, vatRate: 5, expenseCode: "5100", plannedExpenseId: "pe2", commit: false });
  eq(bal("2210", [acc]), 95238, "accrued net 952.38");
  // Paid 1,000 at 0% VAT: old code debited 2210 1,000 → −47.62 left behind.
  const pay = engine([acc]).postAccrualSettlement({ date: "2026-04-05", memo: "DEWA", gross: 1000, vatRate: 0, plannedExpenseId: "pe2", accrualTxnId: acc.id, commit: false });
  ok(balanced(pay), "settlement balances");
  eq(bal("2210", [acc, pay]), 0, "2210 cleared to exactly zero");
  eq(pay.accrual_true_up, 4762, "true-up = 47.62 paid above the accrual");
  eq(bal("5100", [acc, pay]), 100000, "expense ends at what was actually paid (952.38 + 47.62)");
  eq(bal("1002", [acc, pay]), -100000, "bank paid 1,000");
  // Paid LESS than accrued → expense credited
  const acc2 = engine([]).postAccrual({ date: "2026-03-31", memo: "Cleaning", gross: 500, expenseCode: "5100", plannedExpenseId: "pe3", commit: false });
  const pay2 = engine([acc2]).postAccrualSettlement({ date: "2026-04-05", memo: "Cleaning", gross: 450, plannedExpenseId: "pe3", accrualTxnId: acc2.id, commit: false });
  eq(bal("2210", [acc2, pay2]), 0, "under-payment also clears 2210");
  eq(bal("5100", [acc2, pay2]), 45000, "expense reduced to the 450 actually paid");
  // Without an accrual id the old behaviour is kept (back-compat)
  const pay3 = engine([acc2]).postAccrualSettlement({ date: "2026-04-05", memo: "x", gross: 500, plannedExpenseId: "pe3", commit: false });
  eq(pay3.lines[0].debit, 50000, "no accrualTxnId → 2210 debited with the payment net, as before");
  throws(() => engine([]).postAccrualSettlement({ date: "2026-04-05", memo: "x", gross: 5, accrualTxnId: "nope", commit: false }), "not found", "unknown accrual is refused");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.5 VAT follows the deal");
{
  eq(CORE.dealReceiptVatRate({ vat_applicable: true }), 5, "VAT deal → 5%");
  eq(CORE.dealReceiptVatRate({ vat_applicable: false }), 0, "No-VAT deal → 0%");
  eq(CORE.dealReceiptVatRate({}), 0, "flag absent → 0%, matching how the deal card and dealVatCents read it");
  eq(CORE.dealReceiptVatRate(null), 5, "no deal yet → 5% (old default)");

  const line = { dealValue: 1000000, commissionPct: 2 };            // 20,000
  eq(INV.invLineCalc(line).vat, 1000, "VAT line: 5% on top");
  eq(INV.invLineCalc({ ...line, noVat: true }).vat, 0, "no-VAT line: zero VAT");
  eq(INV.invLineCalc({ ...line, noVat: true }).total, 20000, "no-VAT line total = the fee");
  eq(INV.invLineCalc({ ...line, noVat: true, vatInclusive: true }).commissionAmount, 20000, "no-VAT wins over 'inclusive' (no VAT to back out)");
  eq(INV.invTotals([{ ...line, noVat: true }, line]).vat, 1000, "mixed invoice sums VAT per line");
  eq(CORE.invLineCommissionCents({ dealValue: "1000000", commissionPct: 2, vatInclusive: true, noVat: true }), 2000000, "core's commission reader does not back VAT out of a no-VAT line");
  eq(INV.invVatLabel([{ noVat: true }], "Vat"), "Vat (0%)", "label says 0% when no line carries VAT");
  eq(INV.invVatLabel([{}, {}], "Vat"), "Vat (5%)", "label unchanged for normal invoices");
  eq(INV.invVatLabel([{ noVat: true }, {}], "Vat"), "Vat", "mixed → no rate claimed");
  const pct = INV.invPctForAmount(100000000, 2380952, null, false, true);
  eq(INV.invLineCents({ dealValue: 1000000, commissionPct: pct, noVat: true }), 2380952, "percentage solver lands on the exact target for a no-VAT line");
  // receipt posts with no VAT line at 0%
  const sr = engine([]).postSaleReceipt({ date: "2026-05-01", deal: { ...DEAL, vat_applicable: false }, gross: 20000, vatRate: 0, commit: false });
  ok(!sr.lines.some(l => l.accountId === "aVAT"), "0% receipt books no output VAT");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.6 chart-of-accounts guards");
{
  const used = { lines: [{ accountId: "a5100", debit: 1 }, { accountId: "aBank", credit: 1 }] };
  const usage = CORE.accountUsage([used, { isVoid: true, lines: [{ accountId: "a5600", debit: 1 }] }]);
  eq(usage.get("a5600"), 1, "void entries still count as references");
  const v = (draft, original) => CORE.validateAccountSave({ draft, original, accounts: ACCOUNTS, usage });
  ok(v({ code: "5100", name: "Dup", type: "Expense" }, null).includes("already used"), "duplicate code refused (it would overwrite the doc)");
  eq(v({ code: "5700", name: "New", type: "Expense" }, null), "", "fresh code accepted");
  const rent = ACCOUNTS.find(a => a.code === "5100");
  ok(v({ ...rent, code: "5101" }, rent).includes("Code cannot change"), "code frozen once lines post to it");
  ok(v({ ...rent, type: "Asset" }, rent).includes("Type cannot change"), "type frozen once lines post to it");
  eq(v({ ...rent, name: "Office Rent — JVC" }, rent), "", "renaming is fine");
  const accrued = ACCOUNTS.find(a => a.code === "2210");
  ok(v({ ...accrued, code: "2211" }, accrued).includes("system account"), "unused system account still cannot be renumbered");
  ok(CORE.validateAccountDelete({ account: ACCOUNTS.find(a => a.code === "5600"), usage }).includes("Cannot delete"), "account with (void) lines cannot be deleted");
  ok(CORE.validateAccountDelete({ account: accrued, usage }).includes("system account"), "system account cannot be deleted");
  eq(CORE.validateAccountDelete({ account: { id: "aX", code: "5999" }, usage }), "", "unused, non-system account can be deleted");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.10 recurring due dates");
{
  const mon = (d, extra = {}) => ({ expenseType: "recurring", frequency: "monthly", nextDueDate: d, ...extra });
  eq(FE.feAdvanceNextDueDate(mon("2026-01-31")), "2026-02-28", "31 Jan → 28 Feb (was 3 Mar)");
  eq(FE.feAdvanceNextDueDate(mon("2026-02-28", { dueDay: 31 })), "2026-03-31", "anchor brings it back to the 31st");
  eq(FE.feAdvanceNextDueDate(mon("2026-03-31", { dueDay: 31 })), "2026-04-30", "…and clamps to 30 in April");
  eq(FE.feAdvanceNextDueDate(mon("2028-01-31")), "2028-02-29", "leap February");
  eq(FE.feAdvanceNextDueDate({ expenseType: "recurring", frequency: "yearly", nextDueDate: "2028-02-29" }), "2029-02-28", "yearly from 29 Feb → 28 Feb (was 1 Mar)");
  eq(FE.feAdvanceNextDueDate({ expenseType: "recurring", frequency: "quarterly", nextDueDate: "2026-11-30" }), "2027-02-28", "quarterly across the year end (was 2 Mar)");
  eq(FE.feAdvanceNextDueDate(mon("2026-12-15")), "2027-01-15", "December rolls into January");
  eq(FE.feDueAnchorDay(mon("2026-02-28", { dueDay: "" })), 28, "cleared anchor falls back to the date's own day");
  eq(FE.feAdvanceNextDueDate({ expenseType: "one-off", nextDueDate: "2026-01-31" }), null, "one-off items do not advance");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.11 approval workflow");
{
  const pv = engine([]).postPayment({ date: "2026-05-01", memo: "Fit-out", gross: 60000, expenseCode: "5100", commit: false });
  const jv = engine([]).post({ date: "2026-05-01", description: "Adj", ref: "JV-1", txnType: "JV", commit: false,
    lines: [{ id: "l1", accountId: "a5100", debit: 2000000, credit: 0 }, { id: "l2", accountId: "aBank", debit: 0, credit: 2000000 }] });
  eq(CORE.approvalScopeOfTxn(pv), "payments", "PV → payments scope");
  eq(CORE.approvalScopeOfTxn(jv), "journal", "JV → journal scope");
  eq(CORE.approvalScopeOfTxn({ ...jv, reversesTxnId: "x" }), null, "reversals are never held for approval");
  eq(CORE.approvalScopeOfTxn({ txnType: "SR", lines: [] }), null, "receipts are out of scope");
  eq(CORE.approvalAmountCents([pv]), 6000000, "amount = total debits");

  const admin = { roleId: "admin", legacyRole: "admin", permissions: {} };
  const acct = { roleId: "accountant", legacyRole: "accountant", permissions: {}, approvalLimits: { payments: 50000, journalEntries: "" } };
  const noLimits = { roleId: "accountant", legacyRole: "accountant", permissions: {} };
  eq(CORE.postingLimitCents(admin, "payments"), Infinity, "admin is never limited");
  eq(CORE.postingLimitCents(noLimits, "payments"), Infinity, "no limits set → unlimited (today's behaviour)");
  eq(CORE.postingLimitCents(acct, "journal"), Infinity, "blank limit → unlimited");
  eq(CORE.postingLimitCents(acct, "payments"), 5000000, "limit read in AED, compared in cents");
  ok(CORE.needsApproval({ access: acct, scope: "payments", amountCents: 6000000 }), "60,000 > 50,000 needs approval");
  ok(!CORE.needsApproval({ access: acct, scope: "payments", amountCents: 5000000 }), "exactly at the limit does not");
  ok(!CORE.needsApproval({ access: noLimits, scope: "payments", amountCents: 9e12 }), "unlimited user never needs approval");

  throws(() => CORE.assertWithinPostingLimit({ next: pv, access: acct }), "above your posting limit", "backstop refuses an over-limit post");
  CORE.assertWithinPostingLimit({ next: { ...pv, approval_request_id: "r1" }, access: acct }); passed++;     // approved → allowed
  CORE.assertWithinPostingLimit({ prev: pv, next: { ...pv, description: "renamed" }, access: acct }); passed++; // edit, same amount
  CORE.assertWithinPostingLimit({ prev: pv, next: { ...pv, isVoid: true }, access: acct }); passed++;          // voiding
  const small = engine([]).postPayment({ date: "2026-05-01", memo: "x", gross: 100, expenseCode: "5100", commit: false });
  throws(() => CORE.assertWithinPostingLimit({ prev: small, next: { ...small, lines: pv.lines }, access: acct }), "above your posting limit", "an edit that RAISES the amount over the limit is refused");

  const req = { id: "r1", scope: "payments", amountCents: 6000000, status: "pending", requestedBy: "acc@x.com" };
  const policies = [
    { module: "expenses",   roleId: "manager", approvalLimit: 100000, active: true },
    { module: "expenses",   roleId: "lowmgr",  approvalLimit: 10000,  active: true },
    { module: "accounting", roleId: "manager", approvalLimit: null,   active: false },
  ];
  const mgr = { roleId: "manager", legacyRole: "accountant", permissions: {} };
  const low = { roleId: "lowmgr", legacyRole: "accountant", permissions: {} };
  eq(CORE.approvalDecisionBlocker({ access: mgr, email: "m@x.com", request: req, policies }), "", "manager policy covers 60,000");
  ok(CORE.approvalDecisionBlocker({ access: low, email: "l@x.com", request: req, policies }).includes("no approval policy"), "a 10,000 limit cannot approve 60,000");
  ok(CORE.approvalDecisionBlocker({ access: mgr, email: "ACC@x.com ", request: req, policies }).includes("own request"), "no self-approval (email compared case-insensitively)");
  eq(CORE.approvalDecisionBlocker({ access: admin, email: "boss@x.com", request: req, policies: [] }), "", "admin can approve without a policy");
  ok(CORE.approvalDecisionBlocker({ access: admin, email: "boss@x.com", request: { ...req, status: "approved" }, policies }).includes("Already"), "a decided request cannot be decided again");
  ok(CORE.approvalDecisionBlocker({ access: mgr, email: "m@x.com", request: { ...req, scope: "journal" }, policies }).includes("no approval policy"), "an INACTIVE policy grants nothing");

  // planned-expense follow-up applied on approval
  const item = { id: "pe9", expenseType: "recurring", frequency: "monthly", nextDueDate: "2026-01-31", accrualTxnId: "a1" };
  const patch = FE.fePaidPatch(item, "t9", "m@x.com", "2026-02-02");
  eq(patch.nextDueDate, "2026-02-28", "approval advances the recurring item");
  eq(patch.lastPaidDate, "2026-02-02", "paid date = the payment's date, not the approval day");
  eq(patch.accrualTxnId, "", "accrual link cleared for the next cycle");
  eq(FE.fePaidPatch({ id: "o", expenseType: "one-off" }, "t", "", "2026-02-02").status, "Paid", "one-off item becomes Paid");
}

// ═════════════════════════════════════════════════════════════════════════════
section("2.12 sequential references");
{
  const e = engine([]);
  const pv = e.postPayment({ date: "2026-05-01", memo: "x", gross: 10, expenseCode: "5100", commit: false });
  const sr = e.postSaleReceipt({ date: "2026-05-01", deal: DEAL, gross: 105, commit: false });
  const bp = e.postBrokerPayment({ date: "2026-05-01", deal: { ...DEAL, broker_id: "B1" }, brokerAmount: 5, refSuffix: "B", commit: false });
  const cfe = e.postClientFunds({ date: "2026-05-01", amount: 5, receivedFrom: "T", commit: false });
  eq(CORE.provisionalRefPrefix(pv.ref), "PV", "engine PV ref is provisional");
  eq(CORE.provisionalRefPrefix(sr.ref), "SR", "engine SR ref is provisional");
  eq(CORE.provisionalRefPrefix(bp.ref), "BP", "broker ref with -B suffix is provisional");
  eq(CORE.provisionalRefPrefix(cfe.ref), "CF", "client-funds ref is provisional");
  eq(CORE.provisionalRefPrefix("CFE-MGX3K2AB"), "CFE", "CFE prefix recognised (not cut to CF)");
  eq(CORE.provisionalRefPrefix("REV-PV-2026-00001"), "", "reversal refs are not renumbered");
  eq(CORE.provisionalRefPrefix("OB-MGX3K2AB"), "", "opening balance keeps its ref");
  eq(CORE.provisionalRefPrefix("FT2612345678"), "", "imported bank refs untouched");
  eq(CORE.provisionalRefPrefix("PV-2026-00007"), "", "an already-numbered ref is never renumbered");

  const plan = CORE.planSequentialRefs([
    { id: "a", ref: pv.ref, date: "2026-05-01" },
    { id: "b", ref: "PV-MGX3K2AC", date: "2026-05-02" },
    { id: "c", ref: sr.ref, date: "2026-05-01" },
    { id: "d", ref: "PV-MGX3K2AD", date: "2025-12-31" },
    { id: "e", ref: "FT2612345678", date: "2026-05-01" },
  ], { "PV-2026": 41 });
  eq(plan.refs.get("a"), "PV-2026-00042", "continues the stored PV series");
  eq(plan.refs.get("b"), "PV-2026-00043", "next entry in the same save gets the next number");
  eq(plan.refs.get("c"), "SR-2026-00001", "each prefix has its own series");
  eq(plan.refs.get("d"), "PV-2025-00001", "the series is per year of the entry date");
  ok(!plan.refs.has("e"), "non-provisional refs are left alone");
  eq(JSON.stringify(plan.counters), JSON.stringify({ "PV-2026": 43, "SR-2026": 1, "PV-2025": 1 }), "only moved counters are written back");
}

// ═════════════════════════════════════════════════════════════════════════════
section("review fixes: approval edit bypass · imported refs · scopes");
{
  const acct = { roleId: "accountant", legacyRole: "accountant", permissions: {}, approvalLimits: { payments: 50000 } };
  const approved = { ...engine([]).postPayment({ date: "2026-05-01", memo: "x", gross: 60000, expenseCode: "5100", commit: false }), approval_request_id: "r1" };
  CORE.assertWithinPostingLimit({ prev: null, next: approved, access: acct }); passed++;   // first post of an approved entry
  const raised = { ...approved, lines: engine([]).postPayment({ date: "2026-05-01", memo: "x", gross: 200000, expenseCode: "5100", commit: false }).lines };
  throws(() => CORE.assertWithinPostingLimit({ prev: approved, next: raised, access: acct }), "above your posting limit", "editing an approved entry UPWARDS is checked again");
  CORE.assertWithinPostingLimit({ prev: approved, next: { ...approved, description: "renamed" }, access: acct }); passed++;
  const bk = { txnType: "BK", ref: "BT-7HG2K9QW1", date: "2026-05-01", tags: "bank-import" };
  ok(CORE.txnKeepsRef(bk), "an imported bank line keeps the bank reference");
  eq(CORE.planSequentialRefs([{ id: "b", ...bk }], {}).refs.size, 0, "...and is never renumbered (it is the import de-dup key)");
  eq(CORE.approvalScopeOfTxn({ txnType: "CF", tags: "client-funds-paid", lines: [] }), "payments", "a client-money refund is cash leaving -> payments scope");
  eq(CORE.approvalScopeOfTxn({ txnType: "CF", tags: "client-funds-received", lines: [] }), null, "receiving a deposit is not spending");
  eq(CORE.approvalScopeOfTxn({ txnType: "AC", tags: "accrual", lines: [] }), "journal", "an accrual is a journal commitment");
  eq(CORE.approvalScopeOfTxn({ txnType: "BT", lines: [] }), null, "a transfer between our own accounts is not limited");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
