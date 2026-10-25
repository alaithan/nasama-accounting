/* ══════════════════════════════════════════════════
   QUARTERLY COMPARATIVE FINANCIAL REPORTS — Arabic / RTL
   التقارير المالية ربع السنوية المقارنة (ربع مقابل الربع السابق)

   Everything here derives from the GENERAL LEDGER through the same primitives
   the Reports page uses (buildLedger, accountBalance, computeCashFlow,
   withoutClosing — all core.jsx globals), so the quarter figures tie to the
   English statements to the fils. All amounts are integer CENTS (AED × 100).

   Layout of this file
     1. Period helpers            qtrRange / qtrPrevOf / qtrListYears
     2. Account classification    cost of revenue, current vs non-current, AR/AP
     3. computeQuarterSnapshot    one quarter → the QuarterSnapshot record (schema below)
     4. compareQuarters           snapshot × snapshot → comparison rows (Δ, %, arrow)
     5. qtrInsights               rule-based Arabic narrative ("ملخص وتوضيح النتائج ببساطة")
     6. Export                    Excel (SheetJS, RTL) and PDF (print iframe, RTL)
     7. QuarterlyReportsPage      the React page (filters · KPI cards · tabs)

   Access: `quarterly` is bridged to accounting.read (same audience as Reports).

   ── QuarterSnapshot schema (what the UI consumes; see tests/quarterly.test.js) ──
   {
     period:   { year, quarter, from: "YYYY-MM-DD", to, label, short, days },
     income:   { revenue, costOfRevenue, grossProfit, opex, netProfit,
                 lines: { revenue: [{code,name,amount}], costOfRevenue: [...], opex: [...] } },
     balance:  { currentAssets, nonCurrentAssets, totalAssets,
                 currentLiabilities, longTermLiabilities, totalLiabilities,
                 equityAccounts, cumulativeProfit, equity, totalLiabilitiesAndEquity, check,
                 lines: { currentAssets: [...], nonCurrentAssets: [...], currentLiabilities: [...],
                          longTermLiabilities: [...], equity: [...] } },
     cashflow: { operating, investing, financing, clientFunds, netChange,
                 openingCash, closingCash, difference },
     aging:    { receivables, payables, cash, dso, dpo,
                 buckets: null | { current, d30, d60, d90, d90p, total, count } },
     ratios:   { grossMargin, netMargin, currentRatio, cashConversion }   // fractions, null when undefined
   }
   ══════════════════════════════════════════════════ */

// ── 1. PERIODS ─────────────────────────────────────
const QTR_LABELS_AR = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
const QTR_MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function qtrYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
/** Calendar quarter `q` (1–4) of `year` → { year, quarter, from, to, label, short, days }. */
function qtrRange(year, q) {
  year = Number(year); q = Math.min(4, Math.max(1, Number(q) || 1));
  const m0 = (q - 1) * 3;
  const s = new Date(year, m0, 1), e = new Date(year, m0 + 3, 0);
  return {
    year, quarter: q, from: qtrYmd(s), to: qtrYmd(e),
    label: `${QTR_LABELS_AR[q - 1]} ${year}`,
    months: `${QTR_MONTHS_AR[m0]} – ${QTR_MONTHS_AR[m0 + 2]} ${year}`,
    short: `Q${q} ${year}`,
    days: Math.round((e - s) / 86400000) + 1,
  };
}
function qtrPrevOf(year, q) { return Number(q) === 1 ? { year: Number(year) - 1, quarter: 4 } : { year: Number(year), quarter: Number(q) - 1 }; }
function qtrOfDate(ymd) { const [y, m] = String(ymd || qtrYmd(new Date())).split("-").map(Number); return { year: y, quarter: Math.floor((m - 1) / 3) + 1 }; }
/** Years offered in the filter: from the earliest posted entry (or reporting start) to this year. */
function qtrListYears(txns, settings) {
  const thisYear = new Date().getFullYear();
  const start = Number(String((settings && settings.openingBalanceDate) || (typeof DEFAULT_REPORTING_START_DATE !== "undefined" ? DEFAULT_REPORTING_START_DATE : "2025-01-01")).slice(0, 4));
  const first = (txns || []).reduce((m, t) => t && t.date && !t.isVoid && t.date.slice(0, 4) < m ? t.date.slice(0, 4) : m, String(thisYear));
  const lo = Math.min(start || thisYear, Number(first) || thisYear);
  const out = []; for (let y = thisYear; y >= lo; y--) out.push(y); return out;
}

// ── 2. ACCOUNT CLASSIFICATION ──────────────────────
// Direct cost of earning a commission (paid out of the deal's commission).
const QTR_COST_OF_REVENUE_CODES = ["5030", "5040", "5500", "5510"];
const qtrCode = a => String((a && a.code) || "");
const qtrIsCostOfRevenue = a => !!a && a.type === "Expense" && (QTR_COST_OF_REVENUE_CODES.includes(qtrCode(a)) || /commission|override|incentive|secondary agent/i.test(a.name || ""));
const qtrIsMoney = a => !!a && (!!a.isBank || !!a.isCash || qtrCode(a) === "1001");
const qtrIsNonCurrentAsset = a => !!a && a.type === "Asset" && (qtrCode(a) >= "1500" || /fixed|equipment|furniture|computer|vehicle|machinery|depreciation|long-term|long term/i.test(a.name || ""));
const qtrIsLongTermLiability = a => !!a && a.type === "Liability" && (["2200", "2250"].includes(qtrCode(a)) || /loan|borrow|end-of-service|end of service|long-term|long term/i.test(a.name || ""));
const qtrIsReceivable = a => !!a && a.type === "Asset" && (qtrCode(a) === (typeof AR_ACCOUNT_CODE !== "undefined" ? AR_ACCOUNT_CODE : "1100") || /receivable/i.test(a.name || ""));
// Trade-type payables: accrued expenses, salaries payable, any "payable" that is not
// VAT (2101), not client money held in trust (2230) and not a long-term loan.
const qtrIsPayable = a => !!a && a.type === "Liability" && !a.isOutputVAT && !["2105", "2230"].includes(qtrCode(a)) && !qtrIsLongTermLiability(a)
  && (["2210", "2240"].includes(qtrCode(a)) || /payable|accrued|supplier|vendor/i.test(a.name || ""));

// ── 3. ONE QUARTER → SNAPSHOT ──────────────────────
function computeQuarterSnapshot({ accounts, txns, year, quarter, invoices }) {
  const period = qtrRange(year, quarter);
  const A = accounts || [];
  const live = (txns || []).filter(t => t && !t.isVoid && t.date);
  const inPeriod = live.filter(t => t.date >= period.from && t.date <= period.to);
  const opening = buildLedger(live.filter(t => t.date < period.from), A);
  const toDate = buildLedger(live.filter(t => t.date <= period.to), A);
  const periodLedger = buildLedger(typeof withoutClosing === "function" ? withoutClosing(inPeriod) : inPeriod, A);
  const line = (a, L) => ({ code: a.code, name: a.name, amount: accountBalance(a, L) });
  const linesOf = (pred, L) => A.filter(pred).map(a => line(a, L)).filter(x => x.amount !== 0).sort((a, b) => qtrCode(a) < qtrCode(b) ? -1 : 1);
  const sum = arr => arr.reduce((s, x) => s + x.amount, 0);

  // Income statement (period movement, closing entries excluded)
  const revenueLines = linesOf(a => a.type === "Revenue", periodLedger);
  const corLines = linesOf(a => qtrIsCostOfRevenue(a), periodLedger);
  const opexLines = linesOf(a => a.type === "Expense" && !qtrIsCostOfRevenue(a), periodLedger);
  const revenue = sum(revenueLines), costOfRevenue = sum(corLines), opex = sum(opexLines);
  const grossProfit = revenue - costOfRevenue, netProfit = grossProfit - opex;

  // Balance sheet (position at quarter end)
  const caLines = linesOf(a => a.type === "Asset" && !qtrIsNonCurrentAsset(a), toDate);
  const ncaLines = linesOf(a => qtrIsNonCurrentAsset(a), toDate);
  const clLines = linesOf(a => a.type === "Liability" && !qtrIsLongTermLiability(a), toDate);
  const ltlLines = linesOf(a => qtrIsLongTermLiability(a), toDate);
  const eqLines = linesOf(a => a.type === "Equity", toDate);
  const currentAssets = sum(caLines), nonCurrentAssets = sum(ncaLines), totalAssets = currentAssets + nonCurrentAssets;
  const currentLiabilities = sum(clLines), longTermLiabilities = sum(ltlLines), totalLiabilities = currentLiabilities + longTermLiabilities;
  const equityAccounts = sum(eqLines);
  const cumulativeProfit = A.reduce((s, a) => a.type === "Revenue" ? s + accountBalance(a, toDate) : a.type === "Expense" ? s - accountBalance(a, toDate) : s, 0);
  const equity = equityAccounts + cumulativeProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + equity;

  // Cash flow — the same engine as the English statement
  const cf = computeCashFlow({ accounts: A, txns: inPeriod, openingLedger: opening, toDateLedger: toDate });
  const cashflow = {
    operating: cf.sections.operating.total, investing: cf.sections.investing.total,
    financing: cf.sections.financing.total, clientFunds: cf.sections.clientFunds.total,
    netChange: cf.netMovement, openingCash: cf.openingCash, closingCash: cf.closingCash, difference: cf.difference,
  };

  // Receivables / payables / liquidity
  const receivables = A.filter(qtrIsReceivable).reduce((s, a) => s + accountBalance(a, toDate), 0);
  const payables = A.filter(qtrIsPayable).reduce((s, a) => s + accountBalance(a, toDate), 0);
  const cash = A.filter(qtrIsMoney).reduce((s, a) => s + accountBalance(a, toDate), 0);
  const dso = revenue > 0 ? Math.round(receivables / revenue * period.days) : null;      // days of sales outstanding
  const dpo = (costOfRevenue + opex) > 0 ? Math.round(payables / (costOfRevenue + opex) * period.days) : null;
  const buckets = qtrAgingBuckets({ invoices, txns: live, accounts: A, asOf: period.to });

  const ratio = (n, d) => d > 0 ? n / d : null;
  return {
    period,
    income: { revenue, costOfRevenue, grossProfit, opex, netProfit, lines: { revenue: revenueLines, costOfRevenue: corLines, opex: opexLines } },
    balance: { currentAssets, nonCurrentAssets, totalAssets, currentLiabilities, longTermLiabilities, totalLiabilities, equityAccounts, cumulativeProfit, equity, totalLiabilitiesAndEquity,
      check: totalAssets - totalLiabilitiesAndEquity, lines: { currentAssets: caLines, nonCurrentAssets: ncaLines, currentLiabilities: clLines, longTermLiabilities: ltlLines, equity: eqLines } },
    cashflow,
    aging: { receivables, payables, cash, dso, dpo, buckets },
    ratios: {
      grossMargin: ratio(grossProfit, revenue), netMargin: ratio(netProfit, revenue),
      currentRatio: ratio(currentAssets, currentLiabilities),
      cashConversion: netProfit > 0 ? cashflow.operating / netProfit : null,
    },
  };
}
/** Invoice aging as of `asOf`, when the invoices module is loaded. Receipts dated after asOf are ignored. */
function qtrAgingBuckets({ invoices, txns, accounts, asOf }) {
  if (!invoices || !invoices.length || typeof insInvoiceMeta !== "function" || typeof invAgingBucket !== "function") return null;
  try {
    const meta = insInvoiceMeta(invoices.filter(i => (i.invoiceDate || "") <= asOf), (txns || []).filter(t => (t.date || "") <= asOf), accounts);
    const b = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0, count: 0 };
    meta.forEach(m => {
      if (m.due <= 50) return;
      const days = m.dueDate && m.dueDate < asOf ? Math.round((new Date(asOf) - new Date(m.dueDate)) / 86400000) : 0;
      b[invAgingBucket(days)] += m.due; b.total += m.due; b.count++;
    });
    return b;
  } catch (e) { console.warn("qtrAgingBuckets", e); return null; }
}

// ── 4. COMPARISON ROWS ─────────────────────────────
// goodWhenUp: an increase is favourable (revenue, profit, assets, cash) or not
// (costs, liabilities, receivables). Drives the arrow colour, not its direction.
const QTR_ROWS = {
  income: [
    ["revenue", "الإيرادات", true], ["costOfRevenue", "تكلفة الإيرادات (عمولات الوسطاء والحوافز)", false], ["grossProfit", "مجمل الربح", true, "subtotal"],
    ["opex", "المصروفات التشغيلية والإدارية", false], ["netProfit", "صافي الربح", true, "total"],
  ],
  balance: [
    ["currentAssets", "الأصول المتداولة", true], ["nonCurrentAssets", "الأصول غير المتداولة", true], ["totalAssets", "إجمالي الأصول", true, "subtotal"],
    ["currentLiabilities", "الالتزامات المتداولة", false], ["longTermLiabilities", "الالتزامات طويلة الأجل", false], ["totalLiabilities", "إجمالي الالتزامات", false, "subtotal"],
    ["equity", "حقوق الملكية (شاملة الأرباح المتراكمة)", true], ["totalLiabilitiesAndEquity", "إجمالي الالتزامات وحقوق الملكية", true, "total"],
  ],
  cashflow: [
    ["openingCash", "النقدية أول الفترة", true, "opening"],
    ["operating", "التدفقات النقدية من الأنشطة التشغيلية", true], ["investing", "التدفقات النقدية من الأنشطة الاستثمارية", true],
    ["financing", "التدفقات النقدية من الأنشطة التمويلية", true], ["clientFunds", "حركة أمانات العملاء (أموال محتجزة)", true],
    ["netChange", "صافي التغير في النقدية", true, "subtotal"], ["closingCash", "النقدية آخر الفترة", true, "total"],
  ],
  aging: [
    ["receivables", "إجمالي مستحقات العملاء (الذمم المدينة)", false], ["payables", "إجمالي مستحقات الموردين والمصروفات المستحقة (الذمم الدائنة)", false],
    ["cash", "النقدية وما في حكمها", true, "total"],
  ],
};
function qtrSectionOf(snap, section) { return section === "income" ? snap.income : section === "balance" ? snap.balance : section === "cashflow" ? snap.cashflow : snap.aging; }
/** One comparison row. pct is null when the previous value is zero (no meaningful %). */
function qtrCompareValue(key, label, prev, cur, goodWhenUp, kind) {
  const delta = cur - prev;
  const pct = prev !== 0 ? delta / Math.abs(prev) : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone = direction === "flat" ? "neutral" : (direction === "up") === !!goodWhenUp ? "good" : "bad";
  return { key, label, prev, cur, delta, pct, direction, tone, goodWhenUp: !!goodWhenUp, kind: kind || "line" };
}
function compareQuarters(cur, prev) {
  const out = {};
  Object.keys(QTR_ROWS).forEach(section => {
    const c = qtrSectionOf(cur, section), p = qtrSectionOf(prev, section);
    out[section] = QTR_ROWS[section].map(([key, label, good, kind]) => qtrCompareValue(key, label, p[key] || 0, c[key] || 0, good, kind));
  });
  // Account-level detail (income statement + balance sheet), union of both quarters' lines.
  const detail = (getLines, goodWhenUp) => {
    const byCode = new Map();
    (getLines(prev) || []).forEach(l => byCode.set(l.code, { label: `${l.code} · ${l.name}`, prev: l.amount, cur: 0 }));
    (getLines(cur) || []).forEach(l => { const r = byCode.get(l.code) || { label: `${l.code} · ${l.name}`, prev: 0, cur: 0 }; r.cur = l.amount; byCode.set(l.code, r); });
    return [...byCode.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([code, r]) => qtrCompareValue(code, r.label, r.prev, r.cur, goodWhenUp, "detail"));
  };
  out.detail = {
    revenue: detail(s => s.income.lines.revenue, true), costOfRevenue: detail(s => s.income.lines.costOfRevenue, false), opex: detail(s => s.income.lines.opex, false),
    currentAssets: detail(s => s.balance.lines.currentAssets, true), nonCurrentAssets: detail(s => s.balance.lines.nonCurrentAssets, true),
    currentLiabilities: detail(s => s.balance.lines.currentLiabilities, false), longTermLiabilities: detail(s => s.balance.lines.longTermLiabilities, false), equity: detail(s => s.balance.lines.equity, true),
  };
  out.kpis = [
    { key: "grossMargin", label: "هامش مجمل الربح", prev: prev.ratios.grossMargin, cur: cur.ratios.grossMargin, fmt: "pct", goodWhenUp: true,
      hint: "نسبة ما يتبقى من كل درهم إيراد بعد خصم عمولات الوسطاء والتكاليف المباشرة للصفقة." },
    { key: "netMargin", label: "هامش صافي الربح", prev: prev.ratios.netMargin, cur: cur.ratios.netMargin, fmt: "pct", goodWhenUp: true,
      hint: "نسبة الربح الصافي من كل درهم إيراد بعد خصم جميع المصروفات التشغيلية والإدارية." },
    { key: "currentRatio", label: "نسبة التداول (السيولة)", prev: prev.ratios.currentRatio, cur: cur.ratios.currentRatio, fmt: "x", goodWhenUp: true,
      hint: "توضح هذه النسبة قدرة الشركة على سداد التزاماتها قصيرة الأجل من السيولة والأصول المتداولة المتوفرة حالياً." },
    { key: "cashConversion", label: "تحويل الربح إلى نقد", prev: prev.ratios.cashConversion, cur: cur.ratios.cashConversion, fmt: "pct", goodWhenUp: true,
      hint: "كم درهماً من النقد التشغيلي حُصِّل فعلياً مقابل كل درهم ربح دفتري. أقل من 100% يعني أن جزءاً من الربح ما زال مستحقاً لدى العملاء." },
  ].map(k => ({ ...k, delta: k.prev != null && k.cur != null ? k.cur - k.prev : null }));
  return out;
}

// ── 5. RULE-BASED ARABIC INSIGHTS ──────────────────
// Returns [{ section, tone: "good"|"bad"|"warn"|"neutral", text }]. Pure text, no JSX.
function qtrFmtPctAr(frac, digits = 1) { if (frac == null || !isFinite(frac)) return "—"; return `${(Math.abs(frac) * 100).toLocaleString("en-US", { maximumFractionDigits: digits })}%`; }
function qtrFmtAr(cents) {
  const v = Math.abs(cents || 0) / 100;
  const s = v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${s} درهم`;
}
function qtrInsights(cur, prev, cmp) {
  const out = [];
  const push = (section, tone, text) => out.push({ section, tone, text });
  const I = cur.income, P = prev.income, CF = cur.cashflow, B = cur.balance, AG = cur.aging;
  const dir = (delta, up = "ارتفع", down = "انخفض", same = "لم يتغير") => delta > 0 ? up : delta < 0 ? down : same;
  const pctOr = (row) => row.pct != null ? `بنسبة ${qtrFmtPctAr(row.pct)}` : (row.prev === 0 && row.cur !== 0 ? "مقارنةً بصفر في الربع السابق" : "");

  // ── Profitability
  const rNP = cmp.income.find(r => r.key === "netProfit"), rRev = cmp.income.find(r => r.key === "revenue"), rOpex = cmp.income.find(r => r.key === "opex"), rCOR = cmp.income.find(r => r.key === "costOfRevenue");
  if (I.revenue === 0 && P.revenue === 0) push("income", "neutral", `لم تُسجَّل أي إيرادات في ${cur.period.label} ولا في ${prev.period.label}؛ لذلك يعكس صافي النتيجة المصروفات فقط.`);
  else {
    const state = I.netProfit >= 0 ? "ربحاً صافياً" : "خسارة صافية";
    let s = `حققت الشركة ${state} قدره ${qtrFmtAr(I.netProfit)} في ${cur.period.label}، أي أن صافي الربح ${dir(rNP.delta)} ${pctOr(rNP)} مقارنةً بـ${prev.period.label} (${qtrFmtAr(P.netProfit)}${P.netProfit < 0 ? " خسارة" : ""}).`;
    // Why? Decompose Δ net profit into revenue, cost of revenue and opex contributions.
    const parts = [
      { k: "rev", d: rRev.delta, text: `${dir(rRev.delta, "زيادة", "تراجع")} الإيرادات بمقدار ${qtrFmtAr(rRev.delta)}` },
      { k: "cor", d: -rCOR.delta, text: `${dir(rCOR.delta, "ارتفاع", "انخفاض")} تكلفة الإيرادات (عمولات الوسطاء) بمقدار ${qtrFmtAr(rCOR.delta)}` },
      { k: "opex", d: -rOpex.delta, text: `${dir(rOpex.delta, "ارتفاع", "انخفاض")} المصروفات التشغيلية والإدارية بمقدار ${qtrFmtAr(rOpex.delta)}` },
    ].filter(p => p.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    if (parts.length) {
      const main = parts[0];
      const sameSign = rNP.delta === 0 ? true : Math.sign(main.d) === Math.sign(rNP.delta);
      s += ` السبب الرئيسي ${sameSign ? "لهذا التغير" : "الذي خفّف من هذا التغير"} هو ${main.text}` + (parts[1] ? `، يليه ${parts[1].text}.` : ".");
    }
    push("income", rNP.delta >= 0 ? "good" : "bad", s);
    if (rRev.delta > 0 && rOpex.delta > 0 && rOpex.pct != null && rRev.pct != null && rOpex.pct > rRev.pct)
      push("income", "warn", `تنبيه: المصروفات التشغيلية نمت (${qtrFmtPctAr(rOpex.pct)}) أسرع من نمو الإيرادات (${qtrFmtPctAr(rRev.pct)})؛ إذا استمر هذا النمط سيتآكل هامش الربح في الأرباع القادمة.`);
    if (cur.ratios.grossMargin != null)
      push("income", "neutral", `هامش مجمل الربح ${qtrFmtPctAr(cur.ratios.grossMargin)}: من كل 100 درهم عمولة تحصّلها الشركة يبقى لها ${Math.round(cur.ratios.grossMargin * 100)} درهماً بعد دفع حصص الوسطاء والحوافز.` +
        (prev.ratios.grossMargin != null ? ` كان الهامش ${qtrFmtPctAr(prev.ratios.grossMargin)} في الربع السابق.` : ""));
  }

  // ── Liquidity: book profit vs. operating cash
  if (I.netProfit > 0 && CF.operating < I.netProfit * 0.5)
    push("cashflow", "warn", `ملاحظة: الشركة تحقق أرباحاً دفترية ${I.netProfit > 0 && CF.operating < 0 ? "جيدة" : "ممتازة"} (${qtrFmtAr(I.netProfit)})، لكن السيولة النقدية المحصلة من التشغيل ${CF.operating < 0 ? `سالبة (${qtrFmtAr(CF.operating)} خرجت)` : `أقل بكثير (${qtrFmtAr(CF.operating)})`} بسبب تأخر تحصيل مستحقات العملاء أو زيادة المدفوعات خلال الربع.` +
      (AG.receivables > 0 ? ` يوجد حالياً ${qtrFmtAr(AG.receivables)} مستحقة لدى العملاء لم تُحصَّل بعد.` : ""));
  else if (I.netProfit > 0 && CF.operating >= I.netProfit)
    push("cashflow", "good", `الأرباح تتحول إلى نقد فعلي: التدفق النقدي التشغيلي (${qtrFmtAr(CF.operating)}) يساوي أو يفوق صافي الربح الدفتري (${qtrFmtAr(I.netProfit)})، وهو مؤشر صحي على جودة التحصيل.`);
  else if (I.netProfit > 0)
    push("cashflow", "neutral", `التدفق النقدي التشغيلي (${qtrFmtAr(CF.operating)}) يغطي ${qtrFmtPctAr(CF.operating / I.netProfit, 0)} من صافي الربح الدفتري؛ الفارق ما زال في ذمم العملاء أو ذهب لسداد التزامات سابقة.`);
  else if (I.netProfit <= 0 && CF.operating > 0)
    push("cashflow", "neutral", `رغم أن النتيجة الدفترية ${I.netProfit < 0 ? "خسارة" : "صفر"}، فإن التشغيل ولّد نقداً موجباً (${qtrFmtAr(CF.operating)})، غالباً من تحصيل مستحقات أرباع سابقة.`);
  else if (I.netProfit < 0 && CF.operating < 0)
    push("cashflow", "bad", `الربع خاسر دفترياً ونقدياً معاً: خرج من التشغيل ${qtrFmtAr(CF.operating)} وبلغت الخسارة ${qtrFmtAr(I.netProfit)}. يُنصح بمراجعة المصروفات الثابتة وتسريع التحصيل.`);
  push("cashflow", CF.netChange >= 0 ? "good" : "bad", `${dir(CF.netChange, "زادت", "نقصت")} النقدية خلال الربع بمقدار ${qtrFmtAr(CF.netChange)} لتصبح ${qtrFmtAr(CF.closingCash)} في ${cur.period.to.slice(8, 10)}/${cur.period.to.slice(5, 7)}/${cur.period.year}` +
    (CF.investing < 0 ? `، منها ${qtrFmtAr(CF.investing)} أُنفقت على شراء أصول ثابتة` : "") +
    (CF.financing !== 0 ? `، و${CF.financing > 0 ? "دخلت" : "خرجت"} ${qtrFmtAr(CF.financing)} عبر أنشطة التمويل (رأس مال، قروض، مسحوبات)` : "") +
    (CF.clientFunds !== 0 ? `. كما ${CF.clientFunds > 0 ? "استُلمت" : "رُدَّت"} أمانات عملاء بقيمة ${qtrFmtAr(CF.clientFunds)} وهي ليست من أموال الشركة` : "") + ".");

  // ── Balance sheet
  const cr = cur.ratios.currentRatio;
  if (cr != null) {
    const level = cr < 1 ? ["bad", "أقل من 1، أي أن الالتزامات قصيرة الأجل تفوق الأصول المتداولة؛ قد تواجه الشركة ضغطاً في السداد إذا طُلبت كل الالتزامات دفعة واحدة"]
      : cr < 1.5 ? ["neutral", "في النطاق المقبول؛ الشركة قادرة على سداد التزاماتها القريبة لكن دون هامش أمان كبير"]
        : ["good", "مريحة؛ لكل درهم التزام قصير الأجل يوجد ما يزيد على درهم ونصف من الأصول المتداولة"];
    push("balance", level[0], `نسبة التداول ${cr.toLocaleString("en-US", { maximumFractionDigits: 2 })}x وهي ${level[1]}.` + (prev.ratios.currentRatio != null ? ` كانت ${prev.ratios.currentRatio.toLocaleString("en-US", { maximumFractionDigits: 2 })}x في الربع السابق.` : ""));
  } else if (B.currentLiabilities === 0) push("balance", "good", "لا توجد التزامات قصيرة الأجل قائمة في نهاية الربع.");
  const rEq = cmp.balance.find(r => r.key === "equity");
  push("balance", rEq.delta >= 0 ? "good" : "bad", `${dir(rEq.delta, "ارتفعت", "انخفضت")} حقوق الملكية ${pctOr(rEq)} لتصل إلى ${qtrFmtAr(B.equity)}؛ وهي تمثل صافي ما يملكه الشركاء بعد سداد كل الالتزامات (إجمالي الأصول ${qtrFmtAr(B.totalAssets)} ناقص الالتزامات ${qtrFmtAr(B.totalLiabilities)}).`);
  if (B.longTermLiabilities > 0) push("balance", "neutral", `الالتزامات طويلة الأجل (قروض ومخصصات نهاية الخدمة) تبلغ ${qtrFmtAr(B.longTermLiabilities)} وتمثل ${qtrFmtPctAr(B.longTermLiabilities / (B.totalAssets || 1), 0)} من إجمالي الأصول.`);
  if (Math.abs(B.check) > 0) push("balance", "warn", `تنبيه فني: الميزانية لا تتوازن بفارق ${qtrFmtAr(B.check)} — راجع القيود غير المتوازنة في دفتر اليومية.`);

  // ── Receivables / payables
  const rAR = cmp.aging.find(r => r.key === "receivables"), rAP = cmp.aging.find(r => r.key === "payables");
  if (AG.receivables > 0 || rAR.prev > 0) {
    let s = `مستحقات العملاء ${dir(rAR.delta, "ارتفعت", "انخفضت", "ثابتة")} ${pctOr(rAR)} وتبلغ ${qtrFmtAr(AG.receivables)}`;
    if (AG.dso != null) s += `، أي ما يعادل نحو ${AG.dso} يوماً من إيرادات الربع (كلما قلّ هذا الرقم كان التحصيل أسرع)`;
    if (AG.buckets && AG.buckets.d90p > 0) s += `. منها ${qtrFmtAr(AG.buckets.d90p)} متأخرة أكثر من 90 يوماً وتحتاج متابعة عاجلة`;
    push("aging", rAR.delta > 0 && AG.dso != null && AG.dso > 60 ? "warn" : rAR.delta > 0 ? "neutral" : "good", s + ".");
  } else push("aging", "good", "لا توجد مستحقات قائمة لدى العملاء في نهاية الربع؛ كل الإيرادات المسجلة حُصِّلت.");
  if (AG.payables > 0 || rAP.prev > 0)
    push("aging", rAP.delta > 0 ? "neutral" : "good", `مستحقات الموردين والمصروفات المستحقة ${dir(rAP.delta, "ارتفعت", "انخفضت", "ثابتة")} ${pctOr(rAP)} إلى ${qtrFmtAr(AG.payables)}` +
      (AG.cash >= AG.payables ? `، والنقدية المتوفرة (${qtrFmtAr(AG.cash)}) تغطيها بالكامل.` : `، وهي تفوق النقدية المتوفرة (${qtrFmtAr(AG.cash)})؛ يلزم تحصيل جزء من مستحقات العملاء قبل السداد.`));
  else push("aging", "good", "لا توجد مصروفات مستحقة أو ذمم دائنة قائمة في نهاية الربع.");
  return out;
}

// ── 6. FORMATTING + EXPORT ─────────────────────────
function qtrMoney(cents, { blankZero = false } = {}) {
  if (blankZero && !cents) return "—";
  const v = (cents || 0) / 100;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}
function qtrPct(frac) { if (frac == null || !isFinite(frac)) return "—"; const s = (Math.abs(frac) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"; return frac < 0 ? `(${s})` : s; }
function qtrKpiText(v, fmt) { if (v == null || !isFinite(v)) return "—"; return fmt === "x" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "x" : (v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"; }
const QTR_ARROW = { up: "▲", down: "▼", flat: "•" };
const QTR_TONE_COLOR = { good: "#027A48", bad: "#B42318", neutral: "#667085", warn: "#B54708" };
const QTR_SECTIONS = [["income", "قائمة الدخل"], ["balance", "المركز المالي"], ["cashflow", "التدفقات النقدية"], ["aging", "الذمم والسيولة"]];
const QTR_SECTION_TITLE = { income: "قائمة الدخل (الأرباح والخسائر)", balance: "قائمة المركز المالي (الميزانية العمومية)", cashflow: "قائمة التدفقات النقدية", aging: "ملخص أعمار الديون والسيولة" };

/** Table header + rows for one section — shared by the Excel export and the test. */
function qtrTableAoa(rows, cur, prev) {
  const head = ["البند", prev.period.label, cur.period.label, "قيمة التغير", "نسبة التغير %", "الاتجاه"];
  const body = rows.map(r => [r.label, r.prev / 100, r.cur / 100, r.delta / 100, r.pct == null ? "" : Math.round(r.pct * 1000) / 10, QTR_ARROW[r.direction]]);
  return [head, ...body];
}
function qtrExportExcel({ cur, prev, cmp, insights, company }) {
  if (typeof XLSX === "undefined") { toast("مكتبة Excel غير محمّلة", "error"); return; }
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const title = [[`${company} — التقرير المالي ربع السنوي المقارن`], [`${cur.period.label} مقارنةً بـ${prev.period.label}`], [`المبالغ بالدرهم الإماراتي · أُعدّ في ${new Date().toLocaleDateString("en-GB")}`], []];
  const sheet = (name, rows, extra) => {
    const aoa = [...title, ...qtrTableAoa(rows, cur, prev), ...(extra || [])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 52 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 8 }];
    for (let r = title.length + 1; r < aoa.length; r++) [1, 2, 3].forEach(c => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && typeof cell.v === "number") cell.z = "#,##0.00;(#,##0.00)"; });
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const note = section => [[], ["ملخص وتوضيح النتائج ببساطة"], ...insights.filter(i => i.section === section).map(i => [i.text])];
  sheet("قائمة الدخل", [...cmp.income, ...cmp.detail.revenue, ...cmp.detail.costOfRevenue, ...cmp.detail.opex], note("income"));
  sheet("المركز المالي", [...cmp.balance, ...cmp.detail.currentAssets, ...cmp.detail.nonCurrentAssets, ...cmp.detail.currentLiabilities, ...cmp.detail.longTermLiabilities, ...cmp.detail.equity], note("balance"));
  sheet("التدفقات النقدية", cmp.cashflow, note("cashflow"));
  sheet("الذمم والسيولة", cmp.aging, note("aging"));
  const kpi = XLSX.utils.aoa_to_sheet([...title, ["المؤشر", prev.period.label, cur.period.label, "التغير", "التوضيح"],
    ...cmp.kpis.map(k => [k.label, qtrKpiText(k.prev, k.fmt), qtrKpiText(k.cur, k.fmt), k.delta == null ? "" : qtrKpiText(k.delta, k.fmt === "x" ? "x" : "pct"), k.hint])]);
  kpi["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, kpi, "المؤشرات المالية");
  XLSX.writeFile(wb, `nasama-quarterly-${cur.period.short.replace(" ", "-")}-vs-${prev.period.short.replace(" ", "-")}.xlsx`);
  toast("تم تصدير التقرير إلى Excel", "success");
}

/** Build the printable (A4, RTL) document and open the browser's print dialog ("Save as PDF"). */
function qtrPrintHtml({ cur, prev, cmp, insights, company, trn }) {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cls = r => r.kind === "total" ? "total" : r.kind === "subtotal" ? "subtotal" : r.kind === "detail" ? "detail" : r.kind === "opening" ? "opening" : "";
  const rowHtml = r => `<tr class="${cls(r)}"><td class="lbl">${esc(r.label)}</td><td class="num">${qtrMoney(r.prev)}</td><td class="num">${qtrMoney(r.cur)}</td><td class="num ${r.tone}">${qtrMoney(r.delta)}</td><td class="num ${r.tone}">${qtrPct(r.pct)}</td><td class="arr ${r.tone}">${QTR_ARROW[r.direction]}</td></tr>`;
  const table = rows => `<table><thead><tr><th class="lbl">البند</th><th>${esc(prev.period.label)}</th><th>${esc(cur.period.label)}</th><th>قيمة التغير</th><th>نسبة التغير</th><th>المؤشر</th></tr></thead><tbody>${rows.map(rowHtml).join("")}</tbody></table>`;
  const notes = section => { const list = insights.filter(i => i.section === section); return list.length ? `<div class="notes"><div class="notes-h">ملخص وتوضيح النتائج ببساطة</div>${list.map(i => `<p class="${i.tone}">${esc(i.text)}</p>`).join("")}</div>` : ""; };
  const withDetail = (summary, groups) => groups.reduce((acc, [heading, rows]) => rows.length ? acc.concat([{ label: heading, prev: 0, cur: 0, delta: 0, pct: null, direction: "flat", tone: "neutral", kind: "group" }], rows) : acc, summary.slice());
  const groupAware = rows => rows.map(r => r.kind === "group" ? `<tr class="group"><td colspan="6">${esc(r.label)}</td></tr>` : rowHtml(r)).join("");
  const tableG = rows => `<table><thead><tr><th class="lbl">البند</th><th>${esc(prev.period.label)}</th><th>${esc(cur.period.label)}</th><th>قيمة التغير</th><th>نسبة التغير</th><th>المؤشر</th></tr></thead><tbody>${groupAware(rows)}</tbody></table>`;
  const kpis = `<div class="kpis">${cmp.kpis.map(k => `<div class="kpi"><div class="k-l">${esc(k.label)}</div><div class="k-v">${qtrKpiText(k.cur, k.fmt)}</div><div class="k-p">الربع السابق: ${qtrKpiText(k.prev, k.fmt)}</div><div class="k-h">${esc(k.hint)}</div></div>`).join("")}</div>`;
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(company)} — التقرير ربع السنوي ${esc(cur.period.short)}</title>
<style>
@page { size: A4 portrait; margin: 14mm 14mm 20mm; }
*,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff;color:#0C0F1E;font-family:"Segoe UI","Tahoma","Noto Naskh Arabic","Noto Sans Arabic","Geeza Pro","Arial",sans-serif;font-size:10.5pt;line-height:1.55}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2pt solid #C9A044;padding-bottom:8pt;margin-bottom:12pt}
.hdr .co{font-size:16pt;font-weight:700}.hdr .ti{font-size:12pt;color:#344054;margin-top:2pt}.hdr .meta{font-size:8.5pt;color:#667085;text-align:left}
h2{font-size:12.5pt;margin:16pt 0 6pt;color:#0C0F1E;border-right:4pt solid #C9A044;padding-right:7pt;page-break-after:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:6pt;page-break-inside:auto}
th{background:#F2F4F7;color:#475467;font-size:8.5pt;font-weight:600;padding:5pt 6pt;border-bottom:1pt solid #D0D5DD;text-align:center}
th.lbl,td.lbl{text-align:right}
td{padding:4.5pt 6pt;border-bottom:0.5pt solid #EAECF0;font-size:9.5pt}
td.num{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
td.arr{text-align:center;font-size:9pt}
tr{page-break-inside:avoid}
tr.subtotal td{font-weight:600;background:#FCFCFD;border-top:1pt solid #D0D5DD}
tr.total td{font-weight:700;background:#FFF8E6;border-top:1.5pt solid #C9A044;border-bottom:1.5pt solid #C9A044}
tr.opening td{color:#667085}
tr.group td{background:#F8F9FB;color:#475467;font-weight:600;font-size:8.5pt;padding-top:6pt}
tr.detail td{color:#475467;font-size:8.8pt}tr.detail td.lbl{padding-right:18pt}
.good{color:#027A48}.bad{color:#B42318}.neutral{color:#475467}.warn{color:#B54708}
.notes{background:#F8F9FB;border:0.75pt solid #E4E7EC;border-radius:6pt;padding:8pt 11pt;margin:4pt 0 10pt;page-break-inside:avoid}
.notes-h{font-weight:700;font-size:10pt;margin-bottom:4pt;color:#0C0F1E}.notes p{margin:3pt 0;font-size:9.5pt}
.notes p.warn{background:#FFFAEB;border-right:3pt solid #F79009;padding:3pt 6pt;border-radius:3pt}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7pt;margin:6pt 0 4pt;page-break-inside:avoid}
.kpi{border:0.75pt solid #E4E7EC;border-radius:6pt;padding:7pt 9pt}.k-l{font-size:8.5pt;color:#667085}.k-v{font-size:15pt;font-weight:700;direction:ltr;text-align:right}.k-p{font-size:8pt;color:#98A2B3}.k-h{font-size:7.8pt;color:#475467;margin-top:3pt;line-height:1.4}
.foot{position:fixed;bottom:0;left:0;right:0;border-top:0.5pt solid #E4E7EC;padding-top:3pt;font-size:7.5pt;color:#98A2B3;display:flex;justify-content:space-between}
.sign{margin-top:22pt;display:flex;justify-content:space-between;page-break-inside:avoid}.sign div{width:30%;border-top:0.75pt solid #98A2B3;padding-top:4pt;font-size:8.5pt;color:#475467;text-align:center}
.basis{font-size:8pt;color:#667085;margin-top:10pt}
</style></head><body>
<div class="hdr"><div><div class="co">${esc(company)}</div><div class="ti">التقرير المالي ربع السنوي المقارن — ${esc(cur.period.label)} مقارنةً بـ${esc(prev.period.label)}</div><div class="ti" style="font-size:9.5pt;color:#667085">الفترة من ${esc(cur.period.from)} إلى ${esc(cur.period.to)} · الربع المقارن من ${esc(prev.period.from)} إلى ${esc(prev.period.to)}</div></div>
<div class="meta">${trn ? `الرقم الضريبي: ${esc(trn)}<br>` : ""}العملة: درهم إماراتي (AED)<br>تاريخ الإعداد: ${esc(generated)}</div></div>
<h2>المؤشرات المالية الرئيسية</h2>${kpis}
<h2>${QTR_SECTION_TITLE.income}</h2>${tableG(withDetail(cmp.income, [["تفصيل الإيرادات", cmp.detail.revenue], ["تفصيل تكلفة الإيرادات", cmp.detail.costOfRevenue], ["تفصيل المصروفات التشغيلية والإدارية", cmp.detail.opex]]))}${notes("income")}
<h2>${QTR_SECTION_TITLE.balance}</h2>${tableG(withDetail(cmp.balance, [["الأصول المتداولة", cmp.detail.currentAssets], ["الأصول غير المتداولة", cmp.detail.nonCurrentAssets], ["الالتزامات المتداولة", cmp.detail.currentLiabilities], ["الالتزامات طويلة الأجل", cmp.detail.longTermLiabilities], ["حقوق الملكية", cmp.detail.equity]]))}${notes("balance")}
<h2>${QTR_SECTION_TITLE.cashflow}</h2>${table(cmp.cashflow)}${notes("cashflow")}
<h2>${QTR_SECTION_TITLE.aging}</h2>${table(cmp.aging)}${notes("aging")}
<div class="basis">أساس الإعداد: أُعدّت هذه القوائم من دفتر الأستاذ العام على أساس الاستحقاق للفواتير الصادرة والمصروفات المستحقة، والمبالغ بين قوسين سالبة. أرقام الميزانية هي أرصدة نهاية الربع، وأرقام الدخل والتدفقات هي حركة الربع فقط. نسبة التغير محسوبة على أساس القيمة المطلقة لرقم الربع السابق.</div>
<div class="sign"><div>أعدّه</div><div>راجعه</div><div>اعتمده</div></div>
<div class="foot"><span>${esc(company)} · نظام المحاسبة v2</span><span>${esc(cur.period.short)} مقابل ${esc(prev.period.short)}</span></div>
</body></html>`;
}
function qtrPrint(html) {
  const old = document.getElementById("__qtr_iframe__"); if (old) old.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__qtr_iframe__";
  iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { console.error(e); toast("تعذّر فتح نافذة الطباعة", "error"); } }, 350);
}

// ── 7. PAGE ────────────────────────────────────────
function QtrCompareTable({ rows, cur, prev, groups }) {
  const R = { textAlign: "left", direction: "ltr", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const th = { ...C.th, textAlign: "center", fontSize: 12 };
  const rowStyle = r => r.kind === "total" ? { fontWeight: 700, background: "#FFF8E6", borderTop: `1.5px solid ${GOLD}` } : r.kind === "subtotal" ? { fontWeight: 600, background: "#FCFCFD" } : r.kind === "opening" ? { color: "#667085" } : r.kind === "detail" ? { color: "#475467", fontSize: 12.5 } : {};
  const Row = r => <tr key={r.key} style={rowStyle(r)}>
    <td style={{ ...C.td, textAlign: "right", paddingRight: r.kind === "detail" ? 28 : 14 }}>{r.label}</td>
    <td style={{ ...C.td, ...R }}>{qtrMoney(r.prev)}</td>
    <td style={{ ...C.td, ...R, fontWeight: r.kind === "detail" ? 400 : 600 }}>{qtrMoney(r.cur)}</td>
    <td style={{ ...C.td, ...R, color: QTR_TONE_COLOR[r.tone] }}>{qtrMoney(r.delta)}</td>
    <td style={{ ...C.td, ...R, color: QTR_TONE_COLOR[r.tone] }}>{qtrPct(r.pct)}</td>
    <td style={{ ...C.td, textAlign: "center" }}><span title={r.direction === "up" ? "ارتفاع" : r.direction === "down" ? "انخفاض" : "بدون تغيير"} style={{ display: "inline-block", minWidth: 28, padding: "2px 6px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: QTR_TONE_COLOR[r.tone], background: r.tone === "good" ? "#ECFDF3" : r.tone === "bad" ? "#FEF3F2" : "#F2F4F7" }}>{QTR_ARROW[r.direction]}</span></td>
  </tr>;
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
    <thead><tr><th style={{ ...th, textAlign: "right" }}>البند</th><th style={th}>{prev.period.label}</th><th style={th}>{cur.period.label}</th><th style={th}>قيمة التغير</th><th style={th}>نسبة التغير %</th><th style={th}>المؤشر</th></tr></thead>
    <tbody>
      {rows.map(Row)}
      {(groups || []).map(([heading, list]) => list.length ? [<tr key={"g" + heading}><td colSpan={6} style={{ ...C.td, background: "#F8F9FB", color: "#475467", fontWeight: 600, fontSize: 12, textAlign: "right" }}>{heading}</td></tr>, ...list.map(Row)] : null)}
    </tbody>
  </table></div>;
}
function QtrInsightsBox({ items }) {
  if (!items.length) return null;
  const icon = { good: "✅", bad: "🔻", warn: "⚠️", neutral: "ℹ️" };
  return <div style={{ marginTop: 16, background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: 12, padding: "14px 18px" }}>
    <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8, fontSize: 14 }}>ملخص وتوضيح النتائج ببساطة</div>
    {items.map((i, k) => <p key={k} style={{ margin: "6px 0", fontSize: 13.5, lineHeight: 1.8, color: "#344054", display: "flex", gap: 8, alignItems: "flex-start", ...(i.tone === "warn" ? { background: "#FFFAEB", borderRight: "3px solid #F79009", padding: "6px 10px", borderRadius: 6 } : {}) }}>
      <span style={{ flexShrink: 0 }}>{icon[i.tone]}</span><span>{i.text}</span></p>)}
  </div>;
}
function QtrKpiCard({ k }) {
  const tone = k.delta == null || k.delta === 0 ? "neutral" : (k.delta > 0) === k.goodWhenUp ? "good" : "bad";
  return <div style={{ ...C.card, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ fontSize: 12.5, color: "#667085", fontWeight: 600 }}>{k.label}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, direction: "ltr", justifyContent: "flex-end" }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: NAVY, fontVariantNumeric: "tabular-nums" }}>{qtrKpiText(k.cur, k.fmt)}</span>
      {k.delta != null && <span style={{ fontSize: 12, fontWeight: 700, color: QTR_TONE_COLOR[tone] }}>{QTR_ARROW[k.delta > 0 ? "up" : k.delta < 0 ? "down" : "flat"]} {k.fmt === "x" ? Math.abs(k.delta).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "x" : (Math.abs(k.delta) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " نقطة"}</span>}
    </div>
    <div style={{ fontSize: 11.5, color: "#98A2B3" }}>الربع السابق: <span style={{ direction: "ltr", display: "inline-block" }}>{qtrKpiText(k.prev, k.fmt)}</span></div>
    <div style={{ fontSize: 12, color: "#475467", lineHeight: 1.6, marginTop: 2 }}>{k.hint}</div>
  </div>;
}

function QuarterlyReportsPage({ accounts, txns, settings }) {
  const today = qtrOfDate(todayStr());
  const defaultSel = qtrPrevOf(today.year, today.quarter);  // the last COMPLETED quarter
  const [year, setYear] = usePersistedState("qtr_year", defaultSel.year);
  const [quarter, setQuarter] = usePersistedState("qtr_quarter", defaultSel.quarter);
  const [tab, setTab] = usePersistedState("qtr_tab", "income");
  const [showDetail, setShowDetail] = usePersistedState("qtr_detail", true);
  const [invoices, setInvoices] = useState(() => (typeof ls_get === "function" ? ls_get("invoices", []) : []));
  useEffect(() => {
    if (typeof db === "undefined" || !db) return;
    const unsub = db.collection("invoices").onSnapshot(snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("invoices", err));
    return () => unsub();
  }, []);
  const years = useMemo(() => qtrListYears(txns, settings), [txns, settings]);
  const prevSel = qtrPrevOf(year, quarter);
  const { cur, prev, cmp, insights } = useMemo(() => {
    const cur = computeQuarterSnapshot({ accounts, txns, year, quarter, invoices });
    const prev = computeQuarterSnapshot({ accounts, txns, year: prevSel.year, quarter: prevSel.quarter, invoices });
    const cmp = compareQuarters(cur, prev);
    return { cur, prev, cmp, insights: qtrInsights(cur, prev, cmp) };
  }, [accounts, txns, year, quarter, invoices]);
  const company = (settings && settings.company) || "Nasama Properties";
  const trn = settings && settings.trn;
  const sectionInsights = insights.filter(i => i.section === tab);
  const groups = !showDetail ? [] : tab === "income"
    ? [["تفصيل الإيرادات", cmp.detail.revenue], ["تفصيل تكلفة الإيرادات", cmp.detail.costOfRevenue], ["تفصيل المصروفات التشغيلية والإدارية", cmp.detail.opex]]
    : tab === "balance" ? [["الأصول المتداولة", cmp.detail.currentAssets], ["الأصول غير المتداولة", cmp.detail.nonCurrentAssets], ["الالتزامات المتداولة", cmp.detail.currentLiabilities], ["الالتزامات طويلة الأجل", cmp.detail.longTermLiabilities], ["حقوق الملكية", cmp.detail.equity]] : [];
  const empty = !cur.income.revenue && !cur.income.opex && !cur.income.costOfRevenue && !cur.balance.totalAssets;
  const selStyle = { ...C.select, width: "auto", minWidth: 150, fontFamily: "inherit" };
  const bk = cur.aging.buckets;
  return <div dir="rtl" lang="ar" style={{ fontFamily: '"Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Naskh Arabic", "Geeza Pro", Arial, sans-serif', textAlign: "right" }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY }}>التقارير المالية ربع السنوية المقارنة</h1>
        <div style={{ color: "#667085", fontSize: 13, marginTop: 4 }}>مقارنة {cur.period.label} <span style={{ color: "#98A2B3" }}>({cur.period.months})</span> بالربع السابق له {prev.period.label} — الأرقام مستخرجة تلقائياً من دفتر الأستاذ العام بالدرهم الإماراتي.</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={C.btn("secondary")} onClick={() => qtrExportExcel({ cur, prev, cmp, insights, company })}>📗 تصدير Excel</button>
        <button style={C.btn("primary")} onClick={() => qtrPrint(qtrPrintHtml({ cur, prev, cmp, insights, company, trn }))}>🖨️ تصدير PDF للطباعة</button>
      </div>
    </div>

    <div style={{ ...C.card, padding: "14px 18px", marginBottom: 18, display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div><label style={C.label}>السنة المالية</label><select style={selStyle} value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
      <div><label style={C.label}>الربع الحالي</label><select style={selStyle} value={quarter} onChange={e => setQuarter(Number(e.target.value))}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>{QTR_LABELS_AR[q - 1]} ({qtrRange(year, q).months.replace(` ${year}`, "")})</option>)}</select></div>
      <div><label style={C.label}>الربع المقارن به (تلقائياً)</label><div style={{ ...C.input, width: "auto", minWidth: 190, background: "#F8F9FB", color: "#475467" }}>{prev.period.label} · {prev.period.months}</div></div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#344054", paddingBottom: 8, cursor: "pointer" }}><input type="checkbox" checked={!!showDetail} onChange={e => setShowDetail(e.target.checked)} /> إظهار تفصيل الحسابات</label>
    </div>

    {empty && <div style={{ ...C.err, background: "#FFFAEB", border: "1px solid #FEDF89", color: "#B54708" }}>لا توجد قيود مرحّلة في {cur.period.label}. اختر ربعاً آخر أو تأكد من ترحيل القيود.</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginBottom: 18 }}>
      {cmp.kpis.map(k => <QtrKpiCard key={k.key} k={k} />)}
    </div>

    <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid #E4E7EC", flexWrap: "wrap" }}>
      {QTR_SECTIONS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: tab === id ? `2.5px solid ${GOLD}` : "2.5px solid transparent", padding: "10px 16px", fontSize: 14, fontWeight: tab === id ? 700 : 500, color: tab === id ? NAVY : "#667085", cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>{label}</button>)}
    </div>

    <div style={{ ...C.card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #EAECF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{QTR_SECTION_TITLE[tab]}</div>
        <div style={{ fontSize: 12, color: "#98A2B3" }}>{tab === "balance" || tab === "aging" ? `أرصدة نهاية الفترة · ${prev.period.to} مقابل ${cur.period.to}` : `حركة الفترة · ${cur.period.from} إلى ${cur.period.to}`}</div>
      </div>
      <QtrCompareTable rows={cmp[tab]} cur={cur} prev={prev} groups={groups} />
      {tab === "balance" && Math.abs(cur.balance.check) > 0 && <div style={{ ...C.err, margin: 14 }}>الميزانية غير متوازنة بفارق {qtrMoney(cur.balance.check)} — راجع دفتر اليومية.</div>}
      {tab === "cashflow" && Math.abs(cur.cashflow.difference) > 0 && <div style={{ ...C.err, margin: 14 }}>قائمة التدفقات لا تتطابق مع أرصدة النقدية بفارق {qtrMoney(cur.cashflow.difference)}.</div>}
      {tab === "aging" && <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, borderTop: "1px solid #EAECF0" }}>
        <div><div style={{ fontSize: 12, color: "#667085" }}>متوسط فترة التحصيل (DSO)</div><div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{cur.aging.dso == null ? "—" : `${cur.aging.dso} يوماً`}</div><div style={{ fontSize: 11.5, color: "#98A2B3" }}>الربع السابق: {prev.aging.dso == null ? "—" : `${prev.aging.dso} يوماً`}</div></div>
        <div><div style={{ fontSize: 12, color: "#667085" }}>متوسط فترة السداد (DPO)</div><div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{cur.aging.dpo == null ? "—" : `${cur.aging.dpo} يوماً`}</div><div style={{ fontSize: 11.5, color: "#98A2B3" }}>الربع السابق: {prev.aging.dpo == null ? "—" : `${prev.aging.dpo} يوماً`}</div></div>
        {bk && <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, color: "#667085", marginBottom: 6 }}>أعمار مستحقات العملاء حسب الفواتير الصادرة (كما في {cur.period.to})</div>
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}><thead><tr>{["غير مستحقة بعد", "1–30 يوم", "31–60 يوم", "61–90 يوم", "أكثر من 90 يوم", "الإجمالي"].map(h => <th key={h} style={{ ...C.th, textAlign: "center" }}>{h}</th>)}</tr></thead>
            <tbody><tr>{["current", "d30", "d60", "d90", "d90p", "total"].map(k => <td key={k} style={{ ...C.td, textAlign: "center", direction: "ltr", color: k === "d90p" && bk[k] ? "#B42318" : undefined, fontWeight: k === "total" ? 700 : 400 }}>{qtrMoney(bk[k], { blankZero: true })}</td>)}</tr></tbody></table>
        </div>}
      </div>}
    </div>
    <QtrInsightsBox items={sectionInsights} />
    <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 14, lineHeight: 1.7 }}>
      أساس الإعداد: تكلفة الإيرادات = حسابات العمولات والحوافز المدفوعة للوسطاء ومديري المبيعات ({QTR_COST_OF_REVENUE_CODES.join("، ")}). الأصول غير المتداولة = الحسابات 1500 فأعلى. الالتزامات طويلة الأجل = القروض (2200) ومخصص نهاية الخدمة (2250). حقوق الملكية تشمل أرباح الفترات المتراكمة غير المقفلة حتى تتوازن الميزانية. نسبة التغير محسوبة على القيمة المطلقة لرقم الربع السابق، وتظهر «—» إذا كان صفراً.
    </div>
  </div>;
}
