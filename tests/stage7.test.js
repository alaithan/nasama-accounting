// ─────────────────────────────────────────────────────────────────────────────
//  Stage 7 — decision reports (Insights) — regression spec
//
//  Zero dependencies (uses the vendored Babel). Run with:
//      node tests/stage7.test.js
//  core + future-expenses + invoices + insights compiled into one scope, as the
//  browser loads them. Covers 7.1–7.10.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));
const compile = f => babel.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), { presets: ["react", "env"] }).code;
const REACT_STUB = { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) };
const NAMES = ["React", "ReactDOM", "firebase", "db", "auth", "window", "document", "localStorage", "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console", "xlsxExport"];
const X = new Function(...NAMES,
  compile("nasama-accounting-v2.core.jsx") + ";\n" + compile("nasama-accounting-v2.future-expenses.jsx") + ";\n" +
  compile("nasama-accounting-v2.invoices.jsx") + ";\n" + compile("nasama-accounting-v2.insights.jsx") + `
  ; return { insMonday, insVatQuarterOf, insVatQuarterList, insVatReturn, insCashForecast, insReceivablesAging, insBrokerPayables,
             insBreakEven, insPipelineScenarios, insBudgetVsActual, insExpenseTrend, insAlerts, insEarnedVsCollected, insInvoiceMeta };`)
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
  { id: "aVAT", code: "2101", name: "Output VAT", type: "Liability", isOutputVAT: true },
  { id: "aRnd", code: "2105", name: "Rounding", type: "Liability" },
  { id: "aAcc", code: "2210", name: "Accrued Expenses Payable", type: "Liability" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a5100", code: "5100", name: "Office Rent", type: "Expense" },
  { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense" },
];
let n = 0;
const T = (date, lines, extra = {}) => ({ id: "t" + (++n), date, isVoid: false, txnType: "JV", lines: lines.map(([accountId, debit, credit, x]) => ({ accountId, debit, credit, ...(x || {}) })), ...extra });
const ASOF = "2026-10-21";   // a Wednesday

// ═════════════════════════════════════════════════════════════════════════════
section("helpers: weeks and VAT quarters");
{
  eq(X.insMonday(ASOF), "2026-10-19", "week starts Monday");
  const q = X.insVatQuarterOf(ASOF, 1);
  eq(q.from + "→" + q.to, "2026-10-01→2026-12-31", "Jan-cycle quarter");
  const q2 = X.insVatQuarterOf(ASOF, 2);
  eq(q2.from + "→" + q2.to, "2026-08-01→2026-10-31", "Feb-cycle quarter (Aug–Oct)");
  const list = X.insVatQuarterList(1, ASOF, 3);
  eq(list[1].from, "2026-07-01", "previous quarter");
  eq(list[2].to, "2026-06-30", "quarter before that");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.5 VAT return");
{
  const sale = T("2026-08-10", [["aBank", 1050000, 0], ["a4000", 0, 1000000], ["aVAT", 0, 50000]], { txnType: "SR" });
  const rent = T("2026-08-15", [["a5100", 200000, 0], ["aIn", 10000, 0], ["aBank", 0, 210000]], { txnType: "PV" });
  const rental = T("2026-09-01", [["aBank", 300000, 0], ["a4000", 0, 300000]], { txnType: "SR" });
  const settle = T("2026-10-20", [["aVAT", 50000, 0], ["aIn", 0, 10000], ["aBank", 0, 40000]]);
  const r = X.insVatReturn({ txns: [sale, rent, rental, settle], accounts: ACCOUNTS, from: "2026-07-01", to: "2026-09-30" });
  eq(r.stdSupplies, 1000000, "Box 1 standard-rated supplies");
  eq(r.outputVat, 50000, "Box 1 output VAT");
  eq(r.zeroExempt, 300000, "no-VAT supply reported separately");
  eq(r.stdExpenses, 200000, "Box 9 expenses");
  eq(r.inputVat, 10000, "Box 9 input VAT");
  eq(r.netPayable, 40000, "Box 14 net payable");
  eq(r.dueDate, "2026-10-28", "due 28 days after the period");
  eq(r.settled, 40000, "settlement after the period found");
  eq(r.outstanding, 0, "nothing left to pay");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.1 13-week cash forecast");
{
  const deal = { id: "d1", type: "Off-Plan", stage: "SPA Signed", property_name: "Sky", broker_id: "BR1", broker_name: "Ali", vat_applicable: true,
    expected_commission_net: 10000000, installment_schedule: [
      { id: "i1", label: "1st", dueDate: "2026-10-01", amountCents: 5250000 },     // overdue
      { id: "i2", label: "2nd", dueDate: "2026-11-05", amountCents: 5250000 },
      { id: "i3", label: "3rd", dueDate: "2027-06-01", amountCents: 1000000 },     // beyond the horizon
    ] };
  const employees = [{ id: "e1", broker_id: "BR1", commission_split_pct: 40 }];
  const planned = [{ id: "pe1", title: "Office rent", expenseType: "recurring", frequency: "monthly", nextDueDate: "2026-11-01", amountExpected: 1500000, status: "Planned" }];
  const f = X.insCashForecast({ asOf: ASOF, openingCash: 2000000, deals: [deal], txns: [], accounts: ACCOUNTS, invoices: [], plannedExpenses: planned, employees, settings: {} });
  eq(f.weeks.length, 13, "13 weeks");
  eq(f.weeks[0].inflow, 5250000, "overdue instalment lands in week 1");
  ok(f.items.some(i => i.overdue && i.kind === "in"), "…flagged overdue");
  const wk = f.weeks.find(w => w.from <= "2026-11-05" && w.to >= "2026-11-05");
  eq(wk.inflow, 5250000, "2nd instalment in its week");
  ok(!f.items.some(i => i.label.includes("3rd")), "instalment beyond 13 weeks excluded");
  const brokerOut = f.items.filter(i => i.source === "broker").reduce((s, i) => s + i.amountC, 0);
  eq(brokerOut, 2 * Math.round(Math.round(5250000 / 1.05) * 0.4), "broker share = 40% of the net of each inflow");
  eq(f.items.filter(i => i.source === "planned").length, 3, "monthly rent repeats: Nov, Dec, Jan");
  eq(f.weeks[12].closing, 2000000 + f.totalIn - f.totalOut, "closing = opening + in − out");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.2 receivables aging · 7.6 collection lag");
{
  const inv = (id, num, date, due, total, dev) => ({ id, status: "issued", invoiceNumber: num, invoiceDate: date, dueDate: due, totals: { incl: total }, invoicedTo: { companyName: dev, developerId: dev } });
  const invoices = [inv("i1", "101", "2026-05-01", "2026-05-31", 10000, "Emaar"), inv("i2", "102", "2026-09-01", "2026-10-01", 5000, "Emaar"),
    inv("i3", "103", "2026-01-01", "2026-01-31", 2000, "Damac"), { id: "i4", status: "credited", invoiceNumber: "104", totals: { incl: 999 }, invoicedTo: { companyName: "Emaar", developerId: "Emaar" } }];
  const pay = T("2026-02-20", [["aBank", 200000, 0], ["a4000", 0, 200000]], { txnType: "SR", invoice_id: "i3" });
  const a = X.insReceivablesAging({ invoices, txns: [pay], accounts: ACCOUNTS, asOf: ASOF });
  eq(a.rows.length, 1, "Damac is paid; credited invoice excluded");
  eq(a.rows[0].d90p, 1000000, "May invoice is 90+ days");
  eq(a.rows[0].d30, 500000, "Oct invoice is 1–30 days");
  const e = X.insEarnedVsCollected({ txns: [pay], accounts: ACCOUNTS, invoices, asOf: ASOF });
  const damac = e.developers.find(d => d.name === "Damac");
  eq(damac.avgLagDays, 50, "Damac paid 50 days after invoicing");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.3 broker payables · 7.4 break-even · 7.10 scenarios");
{
  const deal = { id: "d1", type: "Off-Plan", stage: "Commission Collected", property_name: "Sky", broker_id: "BR1", broker_name: "Ali", vat_applicable: true, expected_commission_net: 10000000 };
  const sr = T("2026-06-01", [["aBank", 10500000, 0, { deal_id: "d1" }], ["a4000", 0, 10000000, { deal_id: "d1" }], ["aVAT", 0, 500000, { deal_id: "d1" }]], { txnType: "SR", deal_id: "d1" });
  const bp = T("2026-06-05", [["a5500", 3000000, 0, { deal_id: "d1", broker_id: "BR1" }], ["aBank", 0, 3000000, { deal_id: "d1", broker_id: "BR1" }]], { txnType: "BP", deal_id: "d1" });
  const employees = [{ id: "e1", broker_id: "BR1", commission_split_pct: 40 }];
  const p = X.insBrokerPayables({ deals: [deal], txns: [sr, bp], accounts: ACCOUNTS, employees });
  eq(p.length, 1, "one broker owed");
  eq(p[0].owed, 1000000, "40% of 100,000 = 40,000; 30,000 paid → 10,000 owed");
  ok(!p[0].assumed, "split read from the employee record");
  const be = X.insBreakEven({ deals: [deal], txns: [sr, bp], accounts: ACCOUNTS, fixedOverheadC: 3500000, asOf: ASOF });
  eq(be.avgRetained, 7000000, "retained 100,000 − 30,000");
  eq(be.dealsNeededPerMonth, 0.5, "35,000 overhead ÷ 70,000 = 0.5 deals a month");
  eq(Math.round(be.retentionRatio * 100), 70, "70% retention");
  const sc = X.insPipelineScenarios({ deals: [{ id: "x", stage: "SPA Signed", expected_commission_net: 1000000 }, { id: "y", stage: "Cancelled", expected_commission_net: 9e9 }],
    availableCashC: 0, fixedOverheadC: 100000, retentionRatio: 0.5 });
  eq(sc.find(s => s.key === "expected").weighted, 750000, "SPA signed weighted at 75%; cancelled excluded");
  eq(sc.find(s => s.key === "optimistic").weighted, 937500, "optimistic scales the probability (×1.25)");
  eq(sc.find(s => s.key === "expected").runwayMonths, 3.75, "runway = retained ÷ overhead");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.7 budget vs actual · 7.8 expense trend");
{
  const budgets = [1, 2, 3, 4].map(q => ({ id: `budget-2026-Q${q}`, lines: [{ accountCode: "5100", amount: 3000000 }, { accountCode: "4000", amount: 30000000 }] }));
  const txns = ["2026-01-15", "2026-04-15", "2026-07-15"].map(d => T(d, [["a5100", 3500000, 0], ["aBank", 0, 3500000]]))
    .concat([T("2026-05-01", [["aBank", 20000000, 0], ["a4000", 0, 20000000]])]);
  const b = X.insBudgetVsActual({ budgets, accounts: ACCOUNTS, txns, year: 2026, asOf: "2026-09-30" });
  const rent = b.rows.find(r => r.code === "5100");
  eq(rent.budgetYTD, 9000000, "three quarters elapsed → 90,000 budget to date");
  eq(rent.actualYTD, 10500000, "actual 105,000");
  eq(rent.variance, 1500000, "15,000 over budget");
  eq(rent.projection, 10500000 + 3000000, "projection = actual + Q4 budget");
  ok(b.hasRevenueBudget, "revenue targets are read");
  eq(b.actualYTD.ni, 20000000 - 10500000, "net income to date");
  const tr = X.insExpenseTrend({ txns, accounts: ACCOUNTS, asOf: "2026-08-10" });
  eq(tr.keys[tr.keys.length - 1], "2026-07", "last complete month is July");
  eq(tr.rows[0].last, 3500000, "July expense");
  eq(tr.rows[0].runRate, Math.round(3500000 / 3), "run-rate = average of the last 3 months");
}

// ═════════════════════════════════════════════════════════════════════════════
section("7.9 alerts");
{
  const invoices = [{ id: "i1", status: "issued", invoiceNumber: "101", invoiceDate: "2026-05-01", dueDate: "2026-05-31", totals: { incl: 10000 }, invoicedTo: { companyName: "Emaar" } }];
  const a = X.insAlerts({ asOf: ASOF, kpis: { runwayMonths: 0.8, availableCash: 100000, avgMonthlyFixedOverhead: 125000 }, deals: [], txns: [], accounts: ACCOUNTS, invoices, employees: [], settings: {} });
  eq(a[0].level, "critical", "runway under 1 month is critical and listed first");
  ok(a.some(x => /overdue more than 60 days/.test(x.title)), "60+ day overdue invoice flagged");
  const none = X.insAlerts({ asOf: ASOF, kpis: { runwayMonths: Infinity }, deals: [], txns: [], accounts: ACCOUNTS, invoices: [], employees: [], settings: {} });
  eq(none.length, 0, "a clean book raises nothing");
}

console.log(`\n${failed ? "✗ FAIL" : "✓ PASS"} — stage 7: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
