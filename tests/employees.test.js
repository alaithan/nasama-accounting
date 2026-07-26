// ─────────────────────────────────────────────────────────────────────────────
//  Employee subledger engine — regression spec
//
//  Zero dependencies (uses the vendored Babel to load the .jsx). Run with:
//      node tests/employees.test.js
//  Exits non-zero if any assertion fails.
//
//  Pins down the rules the Employees module relies on. All amounts are integer
//  CENTS (AED × 100), matching how money is stored throughout the app.
//
//    • The control total ALWAYS ties: attributed + own-account + unattributed
//      == GL movement on the payroll accounts. This is what makes the register a
//      subledger rather than a dashboard.
//    • Resolution order is tagged → provisional (narration) → own-account →
//      unattributed. The name match must beat the own-account test, because
//      Nasama's own account appears in outgoing narrations as the SENDER.
//    • Arabic transliteration is matched on the consonant skeleton, never on edit
//      distance: FOAD/FOUAD → Faoud, TARIQ/TAREQ → Tarek, AHMED → Ahmad.
//    • Ambiguous text is never guessed at.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));

// Load the module's pure functions. Component bodies never run, so the browser
// globals they close over only need to exist as names.
const code = babel.transform(fs.readFileSync(path.join(ROOT, "nasama-accounting-v2.employees.jsx"), "utf8"),
  { presets: ["react", "env"] }).code;
const NAMES = ["React", "uid", "usePersistedState", "usePersistedDateFilter", "C", "NAVY", "GOLD", "toast",
  "fmtAED", "fmtDate", "toCents", "todayStr", "xlsxExport", "XlsxSignBtn", "xAED", "hasPermission",
  "PageHeader", "DateFilterBar", "Inp", "Sel", "useState", "useEffect", "useMemo"];
let seq = 0;
const ENG = new Function(...NAMES, code + "\n; return { buildEmployeeLedger, buildEmployeeRoster, makeEmployeeMatcher, empSkel };")
  .apply(null, NAMES.map(n => n === "uid" ? (() => "_u" + (++seq)) : (() => undefined)));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${expected}, got ${actual}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }

// ── fixtures ────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: "aBank", code: "1002", name: "Bank", type: "Asset", isBank: true },
  { id: "a5010", code: "5010", name: "Employee Salaries", type: "Expense" },
  { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },   // NOT a payroll account
];
const ROSTER = [
  { id: "EMP-1", broker_id: "BR003", name: "Faoud Dada", role: "Broker", status: "Active", aliases: [], bank_accounts: ["019101860154"] },
  { id: "EMP-2", broker_id: "BR008", name: "Tarek Momneh", role: "Broker", status: "Active", aliases: [], bank_accounts: [] },
  { id: "EMP-3", broker_id: "", name: "Nisadi Sandunika Fernando", role: "Admin", status: "Active", aliases: [], bank_accounts: [] },
  // Shares the skeleton "TRK" with Tarek Momneh — used to prove ambiguity is refused.
  { id: "EMP-4", broker_id: "BR014", name: "Tarek Salhani", role: "Broker", status: "Active", aliases: [], bank_accounts: [] },
];
const line = (accountId, debit, memo, extra) => Object.assign({ accountId, debit, credit: 0, memo }, extra || {});
const txn = (id, date, desc, lines, extra) => Object.assign({ id, date, description: desc, ref: id, lines }, extra || {});

const run = (txns, deals) => ENG.buildEmployeeLedger({ roster: ROSTER, deals: deals || [], txns, accounts: ACCOUNTS, from: "", to: "" });
const person = (led, name) => led.rows.find(r => r.person.name === name);

// ── 1. skeleton matching survives bank transliteration ──────────────────────
console.log("\n▸ consonant skeleton");
eq(ENG.empSkel("FOAD"), ENG.empSkel("FAOUD"), "FOAD and FAOUD share a skeleton");
eq(ENG.empSkel("FOUAD"), ENG.empSkel("FAOUD"), "FOUAD and FAOUD share a skeleton");
eq(ENG.empSkel("TARIQ"), ENG.empSkel("TAREK"), "TARIQ and TAREK share a skeleton (Q→K)");
eq(ENG.empSkel("AHMED"), ENG.empSkel("AHMAD"), "AHMED and AHMAD share a skeleton");
eq(ENG.empSkel("KHAIRI"), ENG.empSkel("KHIARI"), "KHAIRI and KHIARI share a skeleton");
ok(ENG.empSkel("DADA").length >= 2, "DADA does not collapse to a single letter (regression: it once did, which lost the largest broker)");

// ── 2. matcher ──────────────────────────────────────────────────────────────
console.log("▸ matcher");
const match = ENG.makeEmployeeMatcher(ROSTER);
ok(match("IPP TRANSFER AE96 - FOAD DADA - /REF/ COMMISSION").person.name === "Faoud Dada", "matches FOAD DADA to Faoud Dada");
ok(match("FUND TRANSFER - 019101860154 - SOMEONE ELSE").person.name === "Faoud Dada", "matches on a registered bank account number");
eq(match("Commission payment TOC-UAE-014795633"), null, "no name, no account → no match");
// One name part is enough ONLY when it belongs to exactly one person on the roster.
eq(match("payment to DADA").via, "partial", "a single distinctive name part gives a partial (provisional) match");
// "TAREK" reduces to TRK, shared by Tarek Momneh and Tarek Salhani — never guess between them.
eq(match("Commission payment to TAREK"), null, "a name part shared by two people is refused as ambiguous");
eq(match("TAREQ MOMNEA EBILAEADXXX").person.name, "Tarek Momneh", "a confirmed bank alias resolves the ambiguity");

// ── 3. control total always ties ────────────────────────────────────────────
console.log("▸ control total");
{
  const led = run([
    txn("t1", "2026-01-05", "Commission FOAD DADA", [line("a5500", 100000, "comm"), line("aBank", 0, "", { credit: 100000 })]),
    txn("t2", "2026-01-06", "Salary", [line("a5010", 50000, "salary", { broker_id: "BR008" }), line("aBank", 0, "", { credit: 50000 })]),
    txn("t3", "2026-01-07", "IPP TRANSFER AE360351646005642164001 - FAB MY ACCOUNT", [line("a5500", 70000, "x"), line("aBank", 0, "", { credit: 70000 })]),
    txn("t4", "2026-01-08", "Commission payment ref only", [line("a5500", 30000, "x"), line("aBank", 0, "", { credit: 30000 })]),
  ]);
  eq(led.control.glTotal, 250000, "GL total counts only payroll accounts");
  eq(led.control.taggedTotal, 50000, "explicit broker_id tag wins");
  eq(led.control.provisionalTotal, 100000, "narration match is provisional");
  eq(led.control.ownTotal, 70000, "own-account line is not a person");
  eq(led.control.noneTotal, 30000, "nothing to go on → unattributed");
  eq(led.control.sum, led.control.glTotal, "sum equals GL");
  ok(led.control.ties, "control total ties");
}

// ── 4. non-payroll accounts and voided transactions are excluded ────────────
console.log("▸ scope");
{
  const led = run([
    txn("t1", "2026-01-05", "Office rent", [line("a5100", 90000, "rent"), line("aBank", 0, "", { credit: 90000 })]),
    txn("t2", "2026-01-06", "Voided salary FOAD DADA", [line("a5010", 40000, "x")], { isVoid: true }),
  ]);
  eq(led.control.glTotal, 0, "office rent is not payroll; voided transactions are ignored");
}

// ── 5. ORDER: name match must beat the own-account test ─────────────────────
//  Nasama's own account appears in outgoing narrations as the SENDER, so testing
//  for it first silently swallows real payments to real people.
console.log("▸ resolution order (regression)");
{
  const led = run([
    txn("t1", "2026-01-05", "NASAMA PROPERTIES L L C Acct to Acct FUND TRANSFER - 019101846426 - NISADI SANDUNIKA FERNANDO",
      [line("a5010", 500000, "salary"), line("aBank", 0, "", { credit: 500000 })]),
  ]);
  eq(person(led, "Nisadi Sandunika Fernando").costTotal, 500000,
    "a payee named alongside Nasama's own account is attributed to the PERSON, not to own-account");
  eq(led.control.ownTotal, 0, "own-account bucket stays empty when a payee is identifiable");
}

// ── 6. reversals are negative, and must not be mistaken for salary ──────────
console.log("▸ reversals");
{
  const led = run([
    txn("t1", "2026-01-05", "Salary", [line("a5010", 60000, "s", { broker_id: "BR008" })]),
    txn("t2", "2026-02-05", "Reversal", [Object.assign(line("a5010", 0, "r", { broker_id: "BR008" }), { credit: 90000 })]),
  ]);
  const p = person(led, "Tarek Momneh");
  eq(p.costTotal, -30000, "contra entries net off against payments");
  ok(p.lines.some(l => l.isReversal), "the credit line is flagged as a reversal for the UI");
  eq(p.transferCount, 1, "a reversal is not counted as a transfer");
}

// ── 7. revenue, contribution and outstanding commission ─────────────────────
console.log("▸ revenue side");
{
  const deals = [
    { id: "d1", broker_id: "BR003", property_name: "Unit 1", stage: "Commission Collected", expected_commission_net: 400000, transaction_value: 8000000, created_at: "2026-01-02", broker_paid_amount: 0 },
    { id: "d2", broker_id: "BR003", property_name: "Unit 2", stage: "MOU Signed", expected_commission_net: 200000, transaction_value: 4000000, created_at: "2026-01-03" },
  ];
  const led = run([txn("t1", "2026-01-10", "Commission FOAD DADA", [line("a5500", 150000, "c")])], deals);
  const p = person(led, "Faoud Dada");
  eq(p.generated, 400000, "collected deals with no receipt fall back to expected commission");
  eq(p.pipeline, 200000, "open deals count as pipeline, not generated");
  eq(p.dealCount, 2, "both deals are attached");
  eq(p.net, 250000, "net contribution = generated − cost");
  eq(p.outstanding.length, 1, "a collected deal with no broker payment is flagged as owed");
  eq(p.outstandingTotal, 400000, "outstanding total sums the unpaid collected commission");
}

// ── 8. period filter ────────────────────────────────────────────────────────
console.log("▸ period filter");
{
  const txns = [
    txn("t1", "2025-06-01", "Commission FOAD DADA", [line("a5500", 10000, "c")]),
    txn("t2", "2026-06-01", "Commission FOAD DADA", [line("a5500", 20000, "c")]),
  ];
  const led = ENG.buildEmployeeLedger({ roster: ROSTER, deals: [], txns, accounts: ACCOUNTS, from: "2026-01-01", to: "2026-12-31" });
  eq(led.control.glTotal, 20000, "lines outside the period are excluded from the GL total too, so the control still ties");
  ok(led.control.ties, "control ties within a filtered period");
}

// ── 9. roster derivation ────────────────────────────────────────────────────
console.log("▸ roster");
{
  const derived = ENG.buildEmployeeRoster([], [{ id: "BR001", name: "Abdulsalam Alaithan", phone: "1" }, { id: "BR013", name: "0000" }]);
  ok(derived.some(r => r.name === "Abdulsalam Alaithan"), "brokers become employees when nothing is persisted");
  ok(!derived.some(r => r.name === "0000"), "junk roster records with no real name are skipped");
  ok(derived.some(r => r.name === "Mohammed Shouman" && r.status === "Left"), "a confirmed leaver stays on the roster");
  const persisted = ENG.buildEmployeeRoster([{ id: "X", name: "Only Me" }], [{ id: "BR001", name: "Someone" }]);
  eq(persisted.length, 1, "a persisted employees collection wins over derivation");
}

console.log(`\n${failed ? "✗" : "✓"} employees engine: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
