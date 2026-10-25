// ─────────────────────────────────────────────────────────────────────────────
//  Quarterly Comparative Reports (Arabic) — regression spec
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/quarterly.test.js
//
//  Part A — the mock book (tools/quarterly-mock-data.js): every headline figure
//           of Q1 and Q2 2026 equals the hand-computed value, the comparison
//           rows carry the right Δ / % / arrow, and the insight engine fires
//           the rules the storyline was designed to trigger.
//  Part B — seeded random balanced books: for many random quarters the
//           identities hold — assets = liabilities + equity, opening + net
//           change = closing cash, revenue − COR − opex = net profit, and the
//           period-end balance sheets chain (Q(n) closing is Q(n+1)'s base).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };

// Real ledger primitives from core.jsx (what the module calls in the browser).
const CORE_NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const CORE = new Function(...CORE_NAMES, compile("nasama-accounting-v2.core.jsx") + "; return { buildLedger, accountBalance, computeCashFlow, withoutClosing, reversedTxnIds, AR_ACCOUNT_CODE, DEFAULT_REPORTING_START_DATE };")
  .apply(null, CORE_NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : () => undefined));

const Q_NAMES = ["React", "useState", "useEffect", "useMemo", "C", "NAVY", "GOLD", "toast", "todayStr", "usePersistedState", "ls_get", "db", "XLSX", "document", "console",
  "buildLedger", "accountBalance", "computeCashFlow", "withoutClosing", "reversedTxnIds", "AR_ACCOUNT_CODE", "DEFAULT_REPORTING_START_DATE"];
const Q = new Function(...Q_NAMES, compile("nasama-accounting-v2.quarterly.jsx") +
  "; return { qtrRange, qtrPrevOf, qtrOfDate, qtrListYears, computeQuarterSnapshot, compareQuarters, qtrInsights, qtrTableAoa, qtrPrintHtml, qtrMoney, qtrPct, QTR_ROWS, qtrCompareTarget, computeYearQuarters, qtrYearRows, qtrYearTotals, qtrYearInsights, qtrYearAoa, qtrRowQuarterValues, qtrLineAmount, qtrPayablesBreakdown };")
  .apply(null, Q_NAMES.map(n => n === "React" ? REACT_STUB : n === "console" ? console : n in CORE ? CORE[n] : n === "C" ? {} : () => undefined));

const MOCK = require(path.join(ROOT, "tools", "quarterly-mock-data.js"));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; if (failed < 25) console.error(`  ✗ ${msg}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
const ok = (cond, msg) => eq(!!cond, true, msg);

// ── Periods ──────────────────────────────────────────────────────────────────
console.log("▸ periods");
eq(Q.qtrRange(2026, 1).from, "2026-01-01", "Q1 starts 1 Jan"); eq(Q.qtrRange(2026, 1).to, "2026-03-31", "Q1 ends 31 Mar"); eq(Q.qtrRange(2026, 1).days, 90, "Q1 2026 has 90 days");
eq(Q.qtrRange(2026, 2).to, "2026-06-30", "Q2 ends 30 Jun"); eq(Q.qtrRange(2026, 2).days, 91, "Q2 has 91 days");
eq(Q.qtrRange(2026, 4).to, "2026-12-31", "Q4 ends 31 Dec"); eq(Q.qtrRange(2024, 1).days, 91, "leap-year Q1 has 91 days");
eq(Q.qtrRange(2026, 3).label, "الربع الثالث 2026", "Arabic label");
eq(JSON.stringify(Q.qtrPrevOf(2026, 1)), JSON.stringify({ year: 2025, quarter: 4 }), "previous of Q1 is Q4 of the prior year");
eq(JSON.stringify(Q.qtrPrevOf(2026, 3)), JSON.stringify({ year: 2026, quarter: 2 }), "previous of Q3 is Q2");
eq(JSON.stringify(Q.qtrOfDate("2026-10-25")), JSON.stringify({ year: 2026, quarter: 4 }), "25 Oct is Q4");
eq(Q.qtrListYears(MOCK.txns, {})[Q.qtrListYears(MOCK.txns, {}).length - 1], 2025, "year list reaches the earliest entry / reporting start");

// ── Part A: the mock book ─────────────────────────────────────────────────────
console.log("▸ mock book — Q1 2026 and Q2 2026 headline figures");
const q1 = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2026, quarter: 1 });
const q2 = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2026, quarter: 2 });
const checkSnap = (snap, exp, tag) => {
  ["revenue", "costOfRevenue", "grossProfit", "opex", "netProfit"].forEach(k => eq(snap.income[k], exp[k], `${tag} income.${k}`));
  ["operating", "investing", "financing", "clientFunds", "netChange", "openingCash", "closingCash"].forEach(k => eq(snap.cashflow[k], exp[k], `${tag} cashflow.${k}`));
  ["currentAssets", "nonCurrentAssets", "currentLiabilities", "longTermLiabilities", "equity"].forEach(k => eq(snap.balance[k], exp[k], `${tag} balance.${k}`));
  eq(snap.aging.receivables, exp.receivables, `${tag} receivables`); eq(snap.aging.payables, exp.payables, `${tag} payables`);
  eq(snap.balance.check, 0, `${tag} balance sheet balances`); eq(snap.cashflow.difference, 0, `${tag} cash flow reconciles`);
  eq(snap.balance.totalAssets, snap.balance.currentAssets + snap.balance.nonCurrentAssets, `${tag} total assets foots`);
  eq(snap.balance.totalLiabilitiesAndEquity, snap.balance.totalLiabilities + snap.balance.equity, `${tag} L+E foots`);
  eq(snap.aging.cash, snap.cashflow.closingCash, `${tag} aging.cash = closing cash`);
};
checkSnap(q1, MOCK.expected.q1, "Q1"); checkSnap(q2, MOCK.expected.q2, "Q2");
eq(q2.aging.dso, MOCK.expected.q2.dso, "Q2 DSO ≈ 60 days (377,500 / 570,000 × 91)");
eq(q1.aging.dso, 0, "Q1 DSO is 0 — everything collected");
eq(q2.cashflow.openingCash, q1.cashflow.closingCash, "Q2 opens with Q1's closing cash");
eq(q2.aging.buckets, null, "no invoice module loaded → no aging buckets, GL figure still shown");
ok(Math.abs(q2.ratios.grossMargin - 325000 / 570000) < 1e-12, "Q2 gross margin 57.0%");
ok(Math.abs(q2.ratios.netMargin - 182500 / 570000) < 1e-12, "Q2 net margin 32.0%");
ok(Math.abs(q2.ratios.currentRatio - 914500 / 83000) < 1e-12, "Q2 current ratio 11.02x");
ok(q2.ratios.cashConversion < 0, "Q2 cash conversion negative (profit, no cash)");
// The voided entry must leave no trace.
ok(!q2.income.lines.opex.some(l => l.amount === 9999900), "voided entry ignored");
// Account detail lines
eq(q2.income.lines.revenue.map(l => l.code).join(","), "4000,4010,4020", "Q2 revenue lines sorted by code");
eq(q2.income.lines.costOfRevenue.map(l => l.code).join(","), "5040,5500", "manager override + broker commission are cost of revenue");
ok(!q2.income.lines.opex.some(l => l.code === "5500"), "broker commission is not opex");
eq(q2.balance.lines.longTermLiabilities.map(l => l.code).join(","), "2200", "loan is long-term");
ok(q2.balance.lines.currentLiabilities.map(l => l.code).includes("2230"), "client deposits held are a current liability");

console.log("▸ comparison rows");
const cmp = Q.compareQuarters(q2, q1);
const row = (section, key) => cmp[section].find(r => r.key === key);
eq(row("income", "revenue").delta, 24000000, "revenue Δ = +240,000");
ok(Math.abs(row("income", "revenue").pct - 240000 / 330000) < 1e-12, "revenue +72.7%");
eq(row("income", "revenue").direction, "up", "revenue arrow up"); eq(row("income", "revenue").tone, "good", "revenue up is good");
eq(row("income", "opex").direction, "up", "opex arrow up"); eq(row("income", "opex").tone, "bad", "opex up is bad");
eq(row("income", "costOfRevenue").tone, "bad", "cost of revenue up is bad");
eq(row("income", "netProfit").kind, "total", "net profit is the total row");
ok(Math.abs(row("income", "netProfit").pct - 88500 / 94000) < 1e-12, "net profit +94.1%");
eq(row("aging", "receivables").pct, null, "receivables % is null when previous is zero");
eq(row("aging", "receivables").tone, "bad", "receivables up is unfavourable");
eq(row("cashflow", "operating").tone, "bad", "operating cash flow fell");
eq(row("balance", "longTermLiabilities").delta, -1000000, "loan repaid 10,000");
eq(row("balance", "longTermLiabilities").tone, "good", "lower liabilities is good");
eq(row("cashflow", "clientFunds").cur, 5000000, "client funds movement shown separately");
// % uses |prev| so a swing from a loss is read correctly
const neg = Q.compareQuarters({ income: { netProfit: 1000, lines: { revenue: [], costOfRevenue: [], opex: [] } }, balance: { lines: {} , equity: 0 }, cashflow: {}, aging: {}, ratios: {} },
  { income: { netProfit: -500, lines: { revenue: [], costOfRevenue: [], opex: [] } }, balance: { lines: {}, equity: 0 }, cashflow: {}, aging: {}, ratios: {} });
eq(neg.income.find(r => r.key === "netProfit").pct, 3, "loss −500 → profit 1,000 is +300%, not −300%");
// Detail rows are the union of both quarters
ok(cmp.detail.revenue.some(r => r.key === "4010" && r.prev === 0 && r.cur === 15000000), "4010 appears only in Q2 and shows prev 0");
eq(cmp.kpis.length, 4, "four KPI cards");
eq(cmp.kpis.map(k => k.key).join(","), "grossMargin,netMargin,currentRatio,cashConversion", "KPI order");
ok(cmp.kpis.every(k => typeof k.hint === "string" && k.hint.length > 20), "every KPI has an explanatory line");

console.log("▸ insight engine (rule-based Arabic narrative)");
const ins = Q.qtrInsights(q2, q1, cmp);
const texts = s => ins.filter(i => i.section === s).map(i => i.text).join("\n");
["income", "balance", "cashflow", "aging"].forEach(s => ok(ins.some(i => i.section === s), `insights exist for ${s}`));
ok(ins.every(i => ["good", "bad", "warn", "neutral"].includes(i.tone) && typeof i.text === "string" && i.text.length > 10), "every insight has a tone and text");
ok(/ارتفع/.test(texts("income")) && /94\.1%/.test(texts("income")), "profitability: net profit rose 94.1%");
ok(/السبب الرئيسي/.test(texts("income")) && /الإيرادات/.test(texts("income")), "profitability: names the main driver (revenue)");
ok(/أرباحاً دفترية/.test(texts("cashflow")) && /تأخر تحصيل مستحقات العملاء/.test(texts("cashflow")), "liquidity warning: book profit vs negative operating cash");
ok(ins.some(i => i.section === "cashflow" && i.tone === "warn"), "liquidity warning carries the warn tone");
ok(/377,500/.test(texts("cashflow")) || /377,500/.test(texts("aging")), "mentions the uncollected 377,500");
ok(/نسبة التداول/.test(texts("balance")) && /مريحة/.test(texts("balance")), "balance: current ratio is comfortable");
ok(/60 يوماً/.test(texts("aging")), "aging: DSO of 60 days explained");
ok(/أمانات عملاء/.test(texts("cashflow")), "cash: client deposit called out as not company money");
ok(!/تنبيه فني/.test(texts("balance")), "no technical imbalance warning on a balanced book");
// Reverse direction: Q1 vs Q4 2025 (empty prior quarter)
const q4 = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2025, quarter: 4 });
eq(q4.income.revenue, 0, "Q4 2025 has no revenue"); eq(q4.balance.equity, 50000000, "Q4 2025 equity = capital only"); eq(q4.balance.check, 0, "Q4 2025 balances");
const insQ1 = Q.qtrInsights(q1, q4, Q.compareQuarters(q1, q4));
ok(/مقارنةً بصفر/.test(insQ1.filter(i => i.section === "income").map(i => i.text).join()) || /ارتفع/.test(insQ1.filter(i => i.section === "income").map(i => i.text).join()), "Q1 vs empty quarter still narrates");
ok(/الأرباح تتحول إلى نقد/.test(insQ1.filter(i => i.section === "cashflow").map(i => i.text).join()), "Q1: profit converts to cash (operating cash ≥ profit)");
const insEmpty = Q.qtrInsights(q4, Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2025, quarter: 3 }), Q.compareQuarters(q4, q4));
ok(/لم تُسجَّل أي إيرادات/.test(insEmpty.map(i => i.text).join()), "two empty quarters: 'no revenue' message, no crash");

console.log("▸ formatting + export payloads");
eq(Q.qtrMoney(123456789), "1,234,567.89", "money"); eq(Q.qtrMoney(-5000), "(50.00)", "negative in parentheses"); eq(Q.qtrMoney(0), "0.00", "zero"); eq(Q.qtrMoney(0, { blankZero: true }), "—", "blank zero");
eq(Q.qtrPct(0.7272), "72.7%", "pct"); eq(Q.qtrPct(-0.05), "(5%)", "negative pct"); eq(Q.qtrPct(null), "—", "null pct");
const aoa = Q.qtrTableAoa(cmp.income, q2, q1);
eq(aoa[0][1], "الربع الأول 2026", "Excel header: previous quarter column"); eq(aoa[0][2], "الربع الثاني 2026", "Excel header: current quarter column");
eq(aoa[1][2], 570000, "Excel values are AED decimals, not cents"); eq(aoa[1][4], 72.7, "Excel % rounded to 0.1"); eq(aoa[1][5], "▲", "Excel arrow");
const html = Q.qtrPrintHtml({ cur: q2, prev: q1, cmp, insights: ins, company: "Nasama Properties", trn: "100000000000003" });
ok(/<html lang="ar" dir="rtl">/.test(html), "print doc is RTL Arabic");
ok(/size: A4 portrait/.test(html), "print doc is A4");
ok(html.includes("ملخص وتوضيح النتائج ببساطة"), "print doc includes the plain-language summary");
ok(html.includes("الرقم الضريبي: 100000000000003"), "print doc shows the TRN");
ok(html.split("<h2>").length - 1 === 5, "print doc has KPI + 4 statements");
ok(html.includes("&lt;") || !/<script/i.test(html), "print doc escapes content and carries no script");

console.log("▸ comparison modes + full-year view");
eq(JSON.stringify(Q.qtrCompareTarget(2026, 3, "qoq")), JSON.stringify({ year: 2026, quarter: 2 }), "qoq: Q3 → Q2");
eq(JSON.stringify(Q.qtrCompareTarget(2026, 3, "yoy")), JSON.stringify({ year: 2025, quarter: 3 }), "yoy: Q3 2026 → Q3 2025");
eq(JSON.stringify(Q.qtrCompareTarget(2026, 1, "yoy")), JSON.stringify({ year: 2025, quarter: 1 }), "yoy: Q1 → Q1 of last year (not Q4)");
const ys = Q.computeYearQuarters({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2026 });
eq(ys.length, 4, "four quarter snapshots"); eq(ys.map(s => s.period.quarter).join(","), "1,2,3,4", "in order");
const yIncome = Q.qtrYearRows("income", ys), yBal = Q.qtrYearRows("balance", ys), yCash = Q.qtrYearRows("cashflow", ys);
const yrow = (rows, k) => rows.find(r => r.key === k);
eq(yrow(yIncome, "revenue").total, 90000000, "annual revenue = Q1 + Q2 (330,000 + 570,000)");
eq(yrow(yIncome, "netProfit").total, 27650000, "annual net profit = 94,000 + 182,500");
eq(yrow(yIncome, "revenue").values.join(","), "33000000,57000000,0,0", "quarter columns");
eq(yrow(yBal, "equity").total, yBal && ys[3].balance.equity, "balance sheet year column = Q4 position");
eq(yrow(yBal, "totalAssets").total, ys[3].balance.totalAssets, "year-end total assets = Q4");
eq(yrow(yCash, "openingCash").total, ys[0].cashflow.openingCash, "year opening cash = Q1 opening");
eq(yrow(yCash, "closingCash").total, ys[3].cashflow.closingCash, "year closing cash = Q4 closing");
eq(yrow(yCash, "netChange").total, ys[3].cashflow.closingCash - ys[0].cashflow.openingCash, "annual net change ties opening to closing");
eq(yrow(yCash, "operating").total, 11240000 - 18205000, "annual operating cash = Q1 + Q2 (Q3 has client money only)");
const yT = Q.qtrYearTotals(ys);
ok(Math.abs(yT.grossMargin - (90000000 - 34500000) / 90000000) < 1e-12, "annual gross margin from annual totals");
const yI = Q.qtrYearInsights(ys, 2026);
ok(yI.length >= 3 && yI.every(i => i.section === "year" && !/undefined|NaN/.test(i.text)), "year insights present and clean");
ok(/أفضل ربع كان الربع الثاني/.test(yI.map(i => i.text).join()), "names Q2 as the best quarter");
const yAoa = Q.qtrYearAoa("income", ys);
eq(yAoa[0].length, 6, "year sheet: label + 4 quarters + total"); eq(yAoa[0][5], "إجمالي السنة", "flow header says annual total");
eq(Q.qtrYearAoa("balance", ys)[0][5], "نهاية السنة", "position header says year end");
const htmlY = Q.qtrPrintHtml({ cur: q2, prev: q1, cmp, insights: ins, company: "X", cmpMode: "yoy", yearSnaps: ys, yearInsights: yI });
ok(htmlY.includes("الأرباع الأربعة جنباً إلى جنب") && htmlY.includes("page-break-before:always"), "PDF appends the four-quarter section on a new page");
ok(htmlY.includes("بالربع نفسه من العام السابق"), "PDF header names the year-on-year mode");
const emptyYear = Q.qtrYearInsights(Q.computeYearQuarters({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2024 }), 2024);
ok(emptyYear.length === 1 && /لا توجد قيود/.test(emptyYear[0].text), "empty year: single 'no entries' line");

console.log("▸ per-quarter columns inside the comparison tables");
eq(Q.qtrRowQuarterValues(row("income", "revenue"), "income", ys).join(","), "33000000,57000000,0,0", "summary row: four quarter values");
eq(Q.qtrRowQuarterValues(cmp.detail.revenue.find(r => r.key === "4010"), "income", ys).join(","), "0,15000000,0,0", "detail row: account 4010 per quarter");
eq(Q.qtrRowQuarterValues(cmp.detail.currentLiabilities.find(r => r.key === "2230"), "balance", ys).join(","), "0,5000000,0,0", "balance detail: client deposit held at Q2 end, refunded in Q3");
eq(Q.qtrLineAmount(ys[1], "income", "9999"), 0, "unknown account → 0");
eq(Q.qtrRowQuarterValues(row("cashflow", "operating"), "cashflow", ys).join(","), "11240000,-18205000,0,0", "cash flow row per quarter");

console.log("▸ accrued expenses split by what was accrued");
const ap1 = q1.aging.lines.payables, ap2 = q2.aging.lines.payables;
eq(ap1.length, 1, "Q1: one open accrual"); eq(ap1[0].code, "5110", "Q1: it is the DEWA accrual"); eq(ap1[0].amount, 400000, "Q1: 4,000 open");
eq(ap2.length, 1, "Q2: March DEWA settled, June DEWA open"); eq(ap2[0].amount, 450000, "Q2: 4,500 open");
eq(ap2.reduce((s, l) => s + l.amount, 0), q2.aging.payables, "breakdown sums to the payables figure");
ok(/مستحق غير مدفوع/.test(ap2[0].name), "label says accrued, unpaid");
// A manual journal into 2210 shows up as 'other' so the breakdown still ties to the ledger
const manual = { id: "mj", date: "2026-06-29", txnType: "JV", isVoid: false, lines: [{ accountId: "a5100", debit: 100000, credit: 0 }, { accountId: "a2210", debit: 0, credit: 100000 }] };
const q2m = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: [...MOCK.txns, manual], year: 2026, quarter: 2 });
eq(q2m.aging.payables, 550000, "manual journal raises 2210 to 5,500");
eq(q2m.aging.lines.payables.find(l => l.code === "2210").amount, 100000, "untraceable 1,000 reported as 'other'");
eq(q2m.aging.lines.payables.reduce((s, l) => s + l.amount, 0), q2m.aging.payables, "still ties");
// Rent + manager salary accrued in the same quarter → two named lines
const rentAcc = { id: "acR", date: "2026-05-30", txnType: "AC", isVoid: false, lines: [{ accountId: "a5100", debit: 3000000, credit: 0 }, { accountId: "a2210", debit: 0, credit: 3000000 }] };
const q2r = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: [...MOCK.txns, rentAcc], year: 2026, quarter: 2 });
eq(q2r.aging.lines.payables.map(l => l.code).join(","), "5100,5110", "rent and DEWA listed separately, sorted by code");
eq(q2r.aging.lines.payables[0].amount, 3000000, "rent accrual 30,000 open");
const cmpR = Q.compareQuarters(q2r, q1);
ok(cmpR.detail.payableLines.some(r => r.key === "5100" && r.cur === 3000000 && r.prev === 0), "comparison detail row for the rent accrual");
ok(/أكبر بند: Office Rent/.test(Q.qtrInsights(q2r, q1, cmpR).filter(i => i.section === "aging").map(i => i.text).join()), "narrative names the biggest accrued item");
eq(Q.qtrRowQuarterValues(cmpR.detail.payableLines.find(r => r.key === "5100"), "aging", Q.computeYearQuarters({ accounts: MOCK.accounts, txns: [...MOCK.txns, rentAcc], year: 2026 })).join(","), "0,3000000,3000000,3000000", "accrued rent per quarter column");

console.log("▸ unpaid (accrued, unsettled) tag on expense rows");
eq(cmpR.detail.opex.find(r => r.key === "5100").unpaid, 3000000, "rent row tagged with the 30,000 still unpaid");
eq(cmpR.detail.opex.find(r => r.key === "5110").unpaid, 450000, "June DEWA row tagged 4,500");
eq(cmpR.detail.opex.find(r => r.key === "5010").unpaid, undefined, "salaries paid in cash carry no tag");
eq(cmpR.income.find(r => r.key === "opex").unpaid, 3450000, "summary opex row: of which unpaid = 34,500");
eq(cmpR.income.find(r => r.key === "costOfRevenue").unpaid, undefined, "nothing accrued in cost of revenue");
eq(cmp.detail.opex.find(r => r.key === "5110").unpaid, 450000, "base book: only the June DEWA accrual is unpaid at Q2 end");
ok(Q.qtrPrintHtml({ cur: q2r, prev: q1, cmp: cmpR, insights: ins, company: "X" }).includes('class="unpaid">غير مدفوع 30,000.00'), "PDF shows the red unpaid tag");
eq(Q.qtrTableAoa(cmpR.detail.opex, q2r, q1)[0][6], "منه غير مدفوع (مستحق)", "Excel has the unpaid column");
eq(Q.qtrTableAoa(cmpR.detail.opex, q2r, q1).find(r => r[0].startsWith("5100"))[6], 30000, "Excel unpaid value in AED");

console.log("▸ client money: gross in / out, not just net");
const q3 = Q.computeQuarterSnapshot({ accounts: MOCK.accounts, txns: MOCK.txns, year: 2026, quarter: 3 });
eq(q3.cashflow.clientFundsIn, 6300000, "Q3: 63,000 received"); eq(q3.cashflow.clientFundsOut, -11300000, "Q3: 50,000 refund + 63,000 passed on");
eq(q3.cashflow.clientFunds, -5000000, "Q3 net = −50,000"); eq(q3.cashflow.difference, 0, "Q3 cash flow still reconciles");
eq(q2.cashflow.clientFundsIn, 5000000, "Q2: 50,000 received"); eq(q2.cashflow.clientFundsOut, 0, "Q2: nothing out");
eq(q3.balance.lines.currentLiabilities.find(l => l.code === "2230"), undefined, "Q3 end: no client money held");
const cmp3 = Q.compareQuarters(q3, q2);
eq(cmp3.cashflow.map(r => r.key).join(","), "openingCash,operating,investing,financing,clientFundsIn,clientFundsOut,clientFunds,netChange,closingCash", "cash flow rows incl. gross client lines");
ok(/63,000/.test(Q.qtrInsights(q3, q2, cmp3).filter(i => i.section === "cashflow").map(i => i.text).join()), "narrative states the 63,000 received");
eq(q3.income.revenue, 0, "client money is never revenue");

// ── Part B: seeded random books ──────────────────────────────────────────────
console.log("▸ seeded random balanced books × quarters — identities");
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
for (let seed = 1; seed <= 10; seed++) {
  const r = rng(seed * 131);
  const A = MOCK.accounts;
  const pick = () => A[Math.floor(r() * A.length)];
  const txns = [];
  for (let i = 0; i < 400; i++) {
    const d = new Date(2025, Math.floor(r() * 24), 1 + Math.floor(r() * 28));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const a = pick(); let b = pick(); if (b.id === a.id) b = A[(A.indexOf(a) + 1) % A.length];
    const c = Math.round(r() * 5000000);
    const t = { id: "r" + seed + "_" + i, date, isVoid: r() < 0.05, txnType: r() < 0.1 ? "CI" : "JV", tags: r() < 0.05 ? "year-end-close" : "", lines: [{ accountId: a.id, debit: c, credit: 0 }, { accountId: b.id, debit: 0, credit: c }] };
    txns.push(t);
  }
  let prevSnap = null;
  for (const [y, q] of [[2025, 1], [2025, 2], [2025, 3], [2025, 4], [2026, 1], [2026, 2], [2026, 3], [2026, 4]]) {
    const s = Q.computeQuarterSnapshot({ accounts: A, txns, year: y, quarter: q });
    eq(s.balance.check, 0, `seed ${seed} ${s.period.short}: assets = liabilities + equity`);
    eq(s.cashflow.difference, 0, `seed ${seed} ${s.period.short}: opening + net change = closing cash`);
    eq(s.income.grossProfit, s.income.revenue - s.income.costOfRevenue, `seed ${seed} ${s.period.short}: gross profit`);
    eq(s.income.netProfit, s.income.grossProfit - s.income.opex, `seed ${seed} ${s.period.short}: net profit`);
    eq(s.cashflow.netChange, s.cashflow.operating + s.cashflow.investing + s.cashflow.financing + s.cashflow.clientFunds, `seed ${seed} ${s.period.short}: net change is the sum of the sections`);
    if (prevSnap) {
      eq(s.cashflow.openingCash, prevSnap.cashflow.closingCash, `seed ${seed} ${s.period.short}: cash chains from the prior quarter`);
      const c2 = Q.compareQuarters(s, prevSnap);
      c2.income.concat(c2.balance, c2.cashflow, c2.aging).forEach(rw => {
        eq(rw.delta, rw.cur - rw.prev, `seed ${seed} ${s.period.short} ${rw.key}: Δ`);
        if (rw.prev === 0) eq(rw.pct, null, `seed ${seed} ${rw.key}: no % on zero base`); else ok(Math.abs(rw.pct - rw.delta / Math.abs(rw.prev)) < 1e-9, `seed ${seed} ${rw.key}: %`);
        eq(rw.direction, rw.delta > 0 ? "up" : rw.delta < 0 ? "down" : "flat", `seed ${seed} ${rw.key}: direction`);
      });
      const text = Q.qtrInsights(s, prevSnap, c2);
      ok(text.length >= 4 && text.every(i => i.text && !/undefined|NaN|null/.test(i.text)), `seed ${seed} ${s.period.short}: insights never leak undefined/NaN`);
    }
    prevSnap = s;
  }
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — quarterly: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
