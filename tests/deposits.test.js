// ─────────────────────────────────────────────────────────────────────────────
//  Deposit receipt — regression spec
//
//  Zero dependencies (uses the vendored Babel to load the .jsx). Run with:
//      node tests/deposits.test.js
//  Exits non-zero if any assertion fails.
//
//  Covers the pure parts of the deposits module: the receipt number series and
//  the amount-in-words wording that goes on a document handed to a client.
//
//  Amount in words is the classic place fils go missing, and it is the one field
//  on a receipt a client reads to check the figure. It is tested down to the fils.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));

const code = babel.transform(fs.readFileSync(path.join(ROOT, "nasama-accounting-v2.deposits.jsx"), "utf8"),
  { presets: ["react", "env"] }).code;
// Component bodies never run, so the globals they close over only need names.
const NAMES = ["React", "useState", "useEffect", "useMemo", "db", "firebase", "C", "NAVY", "toast",
  "fmtAED", "fmtDate", "todayStr", "toCents", "hasPermission", "PageHeader", "Inp", "Sel",
  "buildClientFundsLedger", "clientFundsHeldTotal", "clientFundsMovement", "depositCloseoutPlan",
  "dealCollection",
  "isVatInclusive", "invExportPDF", "NASAMA_STAMP_SRC"];
const DEP = new Function(...NAMES, code + `
  ; return { depAmountInWords, depWordsInt, depWordsChunk, depPad, DEP_RECEIPT_START };`)
  .apply(null, NAMES.map(() => () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}\n           got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }

// ── 1. Receipt numbering ────────────────────────────────────────────────────
console.log("receipt numbering");
eq(DEP.DEP_RECEIPT_START, 1, "the series starts at 1");
eq(DEP.depPad(1), "RCP-00001", "first receipt is RCP-00001");
eq(DEP.depPad(42), "RCP-00042", "numbers are zero-padded to 5 digits");
eq(DEP.depPad(99999), "RCP-99999", "the padding width holds to 99,999");
eq(DEP.depPad(123456), "RCP-123456", "and does not truncate beyond it");
ok(DEP.depPad(2) > DEP.depPad(1), "padded numbers still sort in issue order as strings");

// ── 2. Whole dirhams ────────────────────────────────────────────────────────
console.log("amount in words — dirhams");
eq(DEP.depAmountInWords(0), "AED Zero Only", "zero");
eq(DEP.depAmountInWords(100), "AED One Only", "one dirham");
eq(DEP.depAmountInWords(1500), "AED Fifteen Only", "fifteen");
eq(DEP.depAmountInWords(2000), "AED Twenty Only", "twenty");
eq(DEP.depAmountInWords(2100), "AED Twenty-One Only", "compound tens are hyphenated");
eq(DEP.depAmountInWords(10000), "AED One Hundred Only", "one hundred");
eq(DEP.depAmountInWords(11500), "AED One Hundred Fifteen Only", "no stray 'and' inside hundreds");
eq(DEP.depAmountInWords(100000), "AED One Thousand Only", "one thousand");
eq(DEP.depAmountInWords(1000000), "AED Ten Thousand Only", "ten thousand");
eq(DEP.depAmountInWords(100000000), "AED One Million Only", "one million");

// The figures from the owner's own worked example.
eq(DEP.depAmountInWords(12100000), "AED One Hundred Twenty-One Thousand Only",
  "AED 121,000.00 — the commission deducted under INCLUSIVE terms");
eq(DEP.depAmountInWords(20000000), "AED Two Hundred Thousand Only",
  "AED 200,000.00 — the security deposit");
eq(DEP.depAmountInWords(7900000), "AED Seventy-Nine Thousand Only",
  "AED 79,000.00 — the refund due");

// ── 3. Fils ─────────────────────────────────────────────────────────────────
console.log("amount in words — fils");
eq(DEP.depAmountInWords(1), "AED Zero and One Fils Only", "a single fils is not lost");
eq(DEP.depAmountInWords(50), "AED Zero and Fifty Fils Only", "fils only, no dirhams");
eq(DEP.depAmountInWords(150), "AED One and Fifty Fils Only", "dirhams and fils");
eq(DEP.depAmountInWords(11523810), "AED One Hundred Fifteen Thousand Two Hundred Thirty-Eight and Ten Fils Only",
  "AED 115,238.10 — TVI-126's net commission, to the fils");
eq(DEP.depAmountInWords(576190), "AED Five Thousand Seven Hundred Sixty-One and Ninety Fils Only",
  "AED 5,761.90 — the VAT remainder");
eq(DEP.depAmountInWords(99), "AED Zero and Ninety-Nine Fils Only", "99 fils");
eq(DEP.depAmountInWords(101), "AED One and One Fils Only", "1.01");

// ── 4. Edge cases a real document can hit ───────────────────────────────────
console.log("amount in words — edges");
eq(DEP.depAmountInWords(-12100000), "Minus AED One Hundred Twenty-One Thousand Only",
  "a negative reads as Minus rather than silently dropping the sign");
eq(DEP.depAmountInWords(null), "AED Zero Only", "null is treated as zero, not NaN");
eq(DEP.depAmountInWords(undefined), "AED Zero Only", "undefined likewise");
ok(!/NaN|undefined/.test(DEP.depAmountInWords(123456789)), "no NaN leaks into the wording");
eq(DEP.depAmountInWords(12345678901), "AED One Hundred Twenty-Three Million Four Hundred Fifty-Six Thousand Seven Hundred Eighty-Nine and One Fils Only",
  "AED 123,456,789.01 — millions, thousands and fils in one string");
eq(DEP.depAmountInWords(100000000000), "AED One Billion Only", "one billion");

// Every receipt must end "Only" — it is what closes the amount against alteration.
[0, 1, 150, 12100000, 999999999].forEach(c =>
  ok(/ Only$/.test(DEP.depAmountInWords(c)), `wording for ${c} fils ends with "Only"`));
// And must always name the currency.
[0, 1, 12100000].forEach(c =>
  ok(/AED/.test(DEP.depAmountInWords(c)), `wording for ${c} fils names AED`));

// Rounding: fractional fils cannot survive onto a document.
eq(DEP.depAmountInWords(150.4), "AED One and Fifty Fils Only", "a fractional fils rounds down");
eq(DEP.depAmountInWords(150.6), "AED One and Fifty-One Fils Only", "and rounds up");

// ── 5. Internal helpers stay sane ───────────────────────────────────────────
console.log("helpers");
eq(DEP.depWordsChunk(0), "", "an empty chunk contributes nothing");
eq(DEP.depWordsChunk(7), "Seven", "units");
eq(DEP.depWordsChunk(70), "Seventy", "exact tens carry no hyphen");
eq(DEP.depWordsChunk(77), "Seventy-Seven", "compound tens do");
eq(DEP.depWordsChunk(700), "Seven Hundred", "exact hundreds");
eq(DEP.depWordsChunk(707), "Seven Hundred Seven", "hundreds with units");
eq(DEP.depWordsInt(0), "Zero", "zero is spelled, not blank");
eq(DEP.depWordsInt(1000000), "One Million", "scale words are singular");
ok(!/\s{2}/.test(DEP.depWordsInt(1000001)), "no double spaces where a scale is skipped");

// ── done ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
