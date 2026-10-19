// ─────────────────────────────────────────────────────────────────────────────
//  Stage 5 — bank reconciliation — regression spec (also plan item 8.3)
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/stage5.test.js
//  core.jsx + reconcile.jsx are compiled into one scope, as the browser loads them.
//  Covers: 5.1 PDF signs · 5.2 book balance as of statement end + carry-forward
//  · 5.3 reconciled entries locked · 5.5 manual pair / unpair · 5.6 date order,
//  number formats, dateless lines.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const X = new Function(...NAMES, compile("nasama-accounting-v2.core.jsx") + ";\n" + compile("nasama-accounting-v2.reconcile.jsx") + `
  ; return { reconParseAmount, reconNormDate, reconDetectDateOrder, reconPdfLinesToRows, reconRowsToLines, reconMatch,
             reconBookBankTxns, reconBookBalanceAsOf, reconOpenBook, reconOutstanding, reconCellToString,
             reconFindDuplicates, assertNotReconciled, isTxnReconciled };`)
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

// ═════════════════════════════════════════════════════════════════════════════
section("5.6 amounts");
{
  eq(X.reconParseAmount("1,234.56"), 1234.56, "comma thousands");
  eq(X.reconParseAmount("1.234,56"), 1234.56, "European thousands + decimal comma");
  eq(X.reconParseAmount("123,45"), 123.45, "decimal comma");
  eq(X.reconParseAmount("1000.00-"), -1000, "trailing minus");
  eq(X.reconParseAmount("(250.00)"), -250, "brackets");
  eq(X.reconParseAmount("500.00 DR"), -500, "DR marker");
  eq(X.reconParseAmount("500.00 CR"), 500, "CR marker");
  eq(X.reconParseAmount("-75"), -75, "leading minus");
  eq(X.reconParseAmount(42.5), 42.5, "a number cell (Excel raw) passes through");
  eq(X.reconParseAmount(""), null, "blank → null");
}

// ═════════════════════════════════════════════════════════════════════════════
section("5.6 dates");
{
  eq(X.reconDetectDateOrder(["03/04/2026", "15/04/2026"]), "dmy", "a day > 12 in first place → day-first");
  eq(X.reconDetectDateOrder(["03/04/2026", "04/15/2026"]), "mdy", "a day > 12 in second place → month-first");
  eq(X.reconDetectDateOrder(["03/04/2026", "05/06/2026"]), "dmy", "all ambiguous → day-first (UAE)");
  eq(X.reconNormDate("03/04/2026", "dmy"), "2026-04-03", "day-first");
  eq(X.reconNormDate("03/04/2026", "mdy"), "2026-03-04", "month-first");
  eq(X.reconNormDate("2026-05-07T00:00:00"), "2026-05-07", "ISO passes through");
  eq(X.reconNormDate("13/13/2026", "dmy"), "", "impossible date → blank, never guessed");
  eq(X.reconNormDate("", "dmy"), "", "blank stays blank");
  eq(X.reconCellToString(new Date(Date.UTC(2026, 2, 4))), "2026-03-04", "Excel Date cell (UTC midnight) → that day");
  eq(X.reconCellToString(new Date(2026, 2, 4)), "2026-03-04", "Excel Date cell (local midnight) → that day");
  const lines = X.reconRowsToLines([{ D: "03/04/2026", A: "10" }, { D: "04/15/2026", A: "20" }], { date: "D", amount: "A" });
  eq(lines[0].date, "2026-03-04", "one order for the whole file: 03/04 read month-first like its neighbour 04/15");
}

// ═════════════════════════════════════════════════════════════════════════════
section("5.1 PDF signs");
{
  const rows = X.reconPdfLinesToRows([
    "Opening Balance 100,000.00",
    "01/03/2026 SALARY TRANSFER 50,000.00 50,000.00",
    "05/03/2026 COMMISSION RECEIVED 20,000.00 70,000.00",
    "07/03/2026 BANK CHARGE (52.50) 69,947.50",
    "08/03/2026 MYSTERY 1,000.00",
  ]);
  eq(rows.length, 4, "opening-balance line is not a transaction");
  eq(Number(rows[0].Amount), -50000, "withdrawal signed NEGATIVE from the balance drop (was +50,000)");
  eq(rows[0]._signSource, "balance", "…sign source recorded");
  eq(Number(rows[1].Amount), 20000, "deposit signed positive from the balance rise");
  eq(Number(rows[2].Amount), -52.5, "explicit brackets kept");
  ok(rows[3]._signUnknown, "a line with no balance to prove its sign is flagged");
  const desc = X.reconPdfLinesToRows([
    "05/03/2026 B 20,000.00 70,000.00",
    "01/03/2026 A 50,000.00 50,000.00",
  ]);
  ok(desc[1]._signUnknown, "newest-first statement: the oldest line has no prior balance → unknown");
  eq(Number(desc[0].Amount), 20000, "…and the next is signed from the walk in date order");
  const lns = X.reconRowsToLines(rows, { date: "Date", desc: "Description", amount: "Amount", balance: "Balance" });
  ok(lns[3].signUnknown, "unknown sign carried onto the statement line");
}

// ═════════════════════════════════════════════════════════════════════════════
section("5.5 / 5.6 matching");
{
  const L = (id, date, amountC, extra = {}) => ({ id, date, desc: id, amountC, ...extra });
  const B = (id, date, amountC) => ({ id, date, ref: id, desc: id, amountC });
  const lines = [L("s1", "2026-03-01", -50000), L("s2", "", 7000), L("s3", "2026-03-05", 2000, { signUnknown: true }), L("s4", "2026-03-09", -1000)];
  const book = [B("b1", "2026-03-02", -50000), B("b2", "2026-01-01", 7000), B("b3", "2026-03-05", 2000), B("b4", "2026-03-20", -990)];
  const r = X.reconMatch(lines, book, 3, 0);
  eq(r.matched.length, 1, "only the dated, signed line auto-matches");
  ok(r.statementOnly.some(l => l.id === "s2"), "dateless line never matches (it used to match any same-amount entry)");
  ok(r.statementOnly.some(l => l.id === "s3"), "unsigned line never matches");
  const r2 = X.reconMatch(lines, book, 3, 0, { manualPairs: [{ lineId: "s4", bookId: "b4" }] });
  eq(r2.manual.length, 1, "manual pair applied");
  eq(r2.manual[0].diffC, -10, "…with its difference carried");
  ok(!r2.bookOnly.some(b => b.id === "b4"), "paired book entry leaves outstanding");
  const r3 = X.reconMatch(lines, book, 3, 0, { unmatchLineIds: new Set(["s1"]) });
  eq(r3.matched.length, 0, "an un-paired line is not auto-matched again");
  ok(r3.statementOnly.some(l => l.id === "s1"), "…it is back in Unrecorded");
}

// ═════════════════════════════════════════════════════════════════════════════
section("5.2 balance as of statement end, carry-forward, already-reconciled");
{
  const bank = "aBank";
  const t = (id, date, amt, extra = {}) => ({ id, date, ref: id, description: id, isVoid: false, lines: [{ accountId: bank, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0 }], ...extra });
  const txns = [t("a", "2026-01-15", 100000), t("b", "2026-02-10", -20000, { reconciled_at: "x" }), t("c", "2026-02-25", -5000), t("d", "2026-04-05", 30000)];
  const book = X.reconBookBankTxns(txns, bank);
  eq(X.reconBookBalanceAsOf(book, "2026-03-31"), 75000, "balance at 31 Mar ignores the 5 April 30,000");
  const open = X.reconOpenBook(book, "2026-03-31", 2);
  ok(!open.some(b => b.id === "b"), "already-reconciled entries are not matched again");
  ok(!open.some(b => b.id === "d"), "entries after statement end + tolerance are not candidates");
  const out = X.reconOutstanding(open, { from: "2026-03-01", to: "2026-03-31" }, [{ from: "2026-01-01", to: "2026-02-28", status: "final" }]);
  ok(out.some(b => b.id === "c"), "February's uncleared cheque carries forward into March");
  const outFirst = X.reconOutstanding(open, { from: "2026-03-01", to: "2026-03-31" }, []);
  ok(!outFirst.some(b => b.id === "c"), "with no saved reconciliation, only the statement window counts");
}

// ═════════════════════════════════════════════════════════════════════════════
section("5.3 reconciled entries are locked");
{
  const prev = { id: "x", ref: "PV-1", date: "2026-03-01", isVoid: false, reconciled_at: "2026-04-01", statement_to: "2026-03-31",
    lines: [{ accountId: "a", debit: 100, credit: 0 }, { accountId: "b", debit: 0, credit: 100 }] };
  throws(() => X.assertNotReconciled({ prev, next: { ...prev, isVoid: true } }), "reconciled", "cannot void a reconciled entry");
  throws(() => X.assertNotReconciled({ prev, next: { ...prev, date: "2026-03-02" } }), "reconciled", "cannot re-date it");
  throws(() => X.assertNotReconciled({ prev, next: { ...prev, lines: [{ accountId: "a", debit: 200, credit: 0 }, { accountId: "b", debit: 0, credit: 200 }] } }), "reconciled", "cannot change the amount");
  throws(() => X.assertNotReconciled({ prev, next: null }), "reconciled", "cannot delete it");
  X.assertNotReconciled({ prev, next: { ...prev, description: "renamed", deal_id: "d1" } }); passed++;
  X.assertNotReconciled({ prev: { ...prev, reconciled_at: "" }, next: { ...prev, isVoid: true, reconciled_at: "" } }); passed++;
}

// ═════════════════════════════════════════════════════════════════════════════
section("review fixes: opening line anywhere · same-day newest-first");
{
  const rows = X.reconPdfLinesToRows([
    "05/03/2026 COMMISSION 20,000.00 70,000.00",
    "01/03/2026 SALARY 50,000.00 50,000.00",
    "Balance brought forward 100,000.00",
  ]);
  eq(rows.length, 2, "a brought-forward line at the END of a newest-first PDF is still the opening balance");
  eq(Number(rows[1].Amount), -50000, "...so the oldest line is signed from it");
  eq(Number(rows[0].Amount), 20000, "...and the walk continues in date order");
  const same = X.reconPdfLinesToRows(["Opening balance 0.00", "01/03/2026 B 100.00 200.00", "01/03/2026 A 100.00 100.00"]);
  eq(Number(same[1].Amount), 100, "single-day statement printed newest-first: balances decide the order (A was +100, not -100)");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 5: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
