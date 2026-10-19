// ╔═══════════════════════════════════════════════════════════════════╗
//  nasama-accounting-v2.insights.jsx
//  Decision reports (implementation plan, Stage 7): cash forecast,
//  receivables aging, broker payables, break-even, VAT return by FTA
//  period, earned vs collected, budget vs actual, expense trend,
//  management alerts and pipeline scenarios.
//
//  Every figure is DERIVED from the ledger, deals, invoices and planned
//  expenses — nothing here posts or stores anything. The calculations are
//  pure functions (ins*) so they are unit-tested (tests/stage7.test.js).
//  Loads after core, future-expenses and invoices (uses their helpers).
// ╚═══════════════════════════════════════════════════════════════════╝

// ── shared helpers ─────────────────────────────────────────────────
const insYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const insMonday = iso => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return insYmd(d); };
const insDays = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
const insMonthKey = iso => String(iso || "").slice(0, 7);
const insAddMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const insLive = txns => (txns || []).filter(t => t && !t.isVoid);
const insAcctMap = accounts => new Map((accounts || []).map(a => [a.id, a]));

// Stage probabilities for a weighted pipeline (EXPECTED case). Conservative
// and optimistic scale them; every probability is capped at 100 %.
const INS_STAGE_PROB = { "Lead": 0.05, "EOI": 0.15, "Booking Form Signed": 0.35, "First Payment Paid": 0.5, "MOU Signed": 0.65, "SPA Signed": 0.75, "Handover": 0.85, "Commission Earned": 0.95 };
const INS_SCENARIOS = [["conservative", "Conservative", 0.6], ["expected", "Expected", 1], ["optimistic", "Optimistic", 1.25]];

// Per issued invoice: total / paid / due in CENTS. Receipts are linked by
// invoice_id; a reversed receipt (and its reversal) pays nothing.
function insInvoiceMeta(invoices, txns, accounts) {
  const reversed = reversedTxnIds(txns);
  const rcs = new Map();
  insLive(txns).forEach(t => {
    if (!t.invoice_id || isInvoiceOwnedTxn(t) || isInReversedPair(t, reversed)) return;
    if (!rcs.has(t.invoice_id)) rcs.set(t.invoice_id, []);
    rcs.get(t.invoice_id).push(t);
  });
  const m = new Map();
  (invoices || []).filter(inv => inv.status === "issued").forEach(inv => {
    const list = rcs.get(inv.id) || [];
    const total = Math.round((inv.totals?.incl || 0) * 100);
    const paid = list.reduce((s, t) => s + Math.round(srReceivedAED(t, accounts) * 100), 0);
    const lastReceipt = list.map(t => t.date || "").sort().pop() || "";
    m.set(inv.id, { inv, total, paid, due: Math.max(0, total - paid), receipts: list, lastReceipt, dueDate: invDueDateOf(inv) });
  });
  return m;
}

// A broker's share of a deal's net commission: the broker's employee record
// (commission_split_pct) when there is one, else the 50 % the Pay Broker
// screen proposes — flagged as assumed.
function insBrokerShareOf(deal, employees) {
  const e = (employees || []).find(x => x.broker_id && x.broker_id === deal.broker_id);
  const pct = e && parseFloat(e.commission_split_pct) > 0 ? parseFloat(e.commission_split_pct) : 50;
  return { pct, assumed: !(e && parseFloat(e.commission_split_pct) > 0) };
}

// ── 7.3 Broker payables — what brokers are owed on cash already collected ──
function insBrokerPayables({ deals, txns, accounts, employees }) {
  const byId = insAcctMap(accounts);
  const reversed = reversedTxnIds(txns);
  const payable = (accounts || []).find(a => a.code === "2210");
  const paidByDeal = new Map(), accruedByDeal = new Map();
  insLive(txns).forEach(t => {
    if (isInReversedPair(t, reversed)) return;
    if (t.txnType === "BP") (t.lines || []).forEach(l => {
      const a = byId.get(l.accountId);
      if (!l.deal_id || !l.broker_id || !a || isMoneyAccount(a)) return;
      if (a.type === "Expense" || (payable && a.id === payable.id)) paidByDeal.set(l.deal_id, (paidByDeal.get(l.deal_id) || 0) + (l.debit || 0) - (l.credit || 0));
    });
    if (t.accrual_leg === "broker" && accrualStatus(t, txns) === "unpaid" && payable)
      accruedByDeal.set(t.deal_id, (accruedByDeal.get(t.deal_id) || 0) + (t.lines || []).reduce((s, l) => l.accountId === payable.id ? s + (l.credit || 0) - (l.debit || 0) : s, 0));
  });
  return (deals || []).filter(d => d.broker_id && d.stage !== "Cancelled").map(d => {
    const coll = dealCollection(d, txns, accounts);
    const collectedRatio = coll.grossExpected > 0 ? Math.min(1, coll.collectedCents / coll.grossExpected) : (d.stage === "Commission Collected" ? 1 : 0);
    if (!(collectedRatio > 0)) return null;
    const { pct, assumed } = insBrokerShareOf(d, employees);
    const expected = Math.round((d.expected_commission_net || 0) * pct / 100);
    const dueOnCash = Math.round(expected * collectedRatio);
    const paidTxn = paidByDeal.get(d.id) || 0;
    const paid = paidTxn > 0 ? paidTxn : (!d.broker_accrued ? (d.broker_paid_amount || 0) : 0);
    const accrued = accruedByDeal.get(d.id) || 0;
    const owed = Math.max(0, dueOnCash - paid);
    const prepaid = Math.max(0, paid - dueOnCash);    // paid ahead of collection — nets off future shares
    return { deal: d, broker: d.broker_name || d.broker_id, pct, assumed, expected, dueOnCash, collectedRatio, paid, accrued, owed, prepaid };
  }).filter(r => r && (r.owed > 0 || r.prepaid > 0)).sort((a, b) => b.owed - a.owed);
}
const insBrokerOwedRows = args => insBrokerPayables(args).filter(r => r.owed > 0);

// ── VAT quarters (UAE tax periods) ──
// settings.vatQuarterStartMonth: 1 (Jan–Mar …), 2 (Feb–Apr …) or 3 (Mar–May …).
function insVatQuarterOf(iso, startMonth = 1) {
  const [y, m] = iso.split("-").map(Number);
  const off = ((m - startMonth) % 3 + 3) % 3;
  const qs = new Date(y, m - 1 - off, 1);
  const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0);
  return { from: insYmd(qs), to: insYmd(qe), label: `${qs.toLocaleString("en-GB", { month: "short" })}–${qe.toLocaleString("en-GB", { month: "short" })} ${qe.getFullYear()}` };
}
function insVatQuarterList(startMonth, asOf, count = 6) {
  const out = [];
  let q = insVatQuarterOf(asOf, startMonth);
  for (let i = 0; i < count; i++) { out.push(q); q = insVatQuarterOf(isoAddDays(q.from, -1), startMonth); }
  return out;
}

// ── 7.5 VAT return by FTA period (boxes 1, 8, 9, 14) ──
function insVatReturn({ txns, accounts, from, to }) {
  const byId = insAcctMap(accounts);
  const outA = (accounts || []).find(a => a.isOutputVAT), inA = (accounts || []).find(a => a.isInputVAT);
  const r = { from, to, stdSupplies: 0, outputVat: 0, zeroExempt: 0, stdExpenses: 0, inputVat: 0, settled: 0, settlements: [] };
  insLive(txns).forEach(t => {
    const d = t.date || "";
    if (typeof isClosingTxn === "function" && isClosingTxn(t)) return;   // not a supply
    if (isVATSettlementTxn(t, accounts)) {
      if (d > to && d <= isoAddDays(to, 120)) { r.settled += (t.lines || []).reduce((s, l) => outA && l.accountId === outA.id ? s + (l.debit || 0) - (l.credit || 0) : s, 0) - (t.lines || []).reduce((s, l) => inA && l.accountId === inA.id ? s + (l.credit || 0) - (l.debit || 0) : s, 0); r.settlements.push(t); }
      return;
    }
    if (d < from || d > to) return;
    let ov = 0, iv = 0, rev = 0, exp = 0;
    (t.lines || []).forEach(l => {
      const a = byId.get(l.accountId);
      if (!a) return;
      if (outA && a.id === outA.id) ov += (l.credit || 0) - (l.debit || 0);
      else if (inA && a.id === inA.id) iv += (l.debit || 0) - (l.credit || 0);
      else if (a.type === "Revenue") rev += (l.credit || 0) - (l.debit || 0);
      else if (a.type === "Expense" || isFixedAssetAcct(a)) exp += (l.debit || 0) - (l.credit || 0);
    });
    if (ov !== 0) { r.stdSupplies += rev; r.outputVat += ov; } else if (rev !== 0) r.zeroExempt += rev;
    if (iv !== 0) { r.stdExpenses += exp; r.inputVat += iv; }
  });
  r.netPayable = r.outputVat - r.inputVat;
  r.dueDate = isoAddDays(to, 28);
  r.outstanding = r.netPayable - r.settled;
  return r;
}

// ── 7.1 13-week cash forecast ──
function insCashForecast({ asOf, openingCash, deals, txns, accounts, invoices, plannedExpenses, employees, settings, weeks = 13 }) {
  const start = insMonday(asOf);
  const horizonEnd = isoAddDays(start, weeks * 7 - 1);
  const W = Array.from({ length: weeks }, (_, i) => ({ i, from: isoAddDays(start, i * 7), to: isoAddDays(start, i * 7 + 6), inflow: 0, outflow: 0 }));
  const items = [];
  const weekOf = date => !date || date < start ? 0 : date > horizonEnd ? null : Math.floor(insDays(start, date) / 7);
  const add = (date, kind, label, amountC, extra = {}) => {
    if (!(amountC > 0)) return;
    const w = weekOf(date);
    if (w == null) return;
    items.push({ week: w, date, kind, label, amountC, overdue: !!date && date < start, ...extra });
    if (kind === "in") W[w].inflow += amountC; else W[w].outflow += amountC;
  };
  // A broker already paid ahead of collection has that much of the future
  // shares covered — net it off the first future shares of that deal.
  const payables = insBrokerPayables({ deals, txns, accounts, employees });
  const prepaidLeft = new Map(payables.filter(r => r.prepaid > 0).map(r => [r.deal.id, r.prepaid]));
  const brokerCut = (deal, grossC) => {
    if (!deal || !deal.broker_id) return 0;
    const net = deal.vat_applicable ? Math.round(grossC / 1.05) : grossC;
    let cut = Math.round(net * insBrokerShareOf(deal, employees).pct / 100);
    const pre = prepaidLeft.get(deal.id) || 0;
    if (pre > 0) { const use = Math.min(pre, cut); prepaidLeft.set(deal.id, pre - use); cut -= use; }
    return cut;
  };
  // Inflows: installment schedules first (they are the most specific) …
  const scheduled = new Set();
  (deals || []).filter(d => d.stage !== "Cancelled" && Array.isArray(d.installment_schedule) && d.installment_schedule.length).forEach(d => {
    scheduled.add(d.id);
    const st = installmentStatus(d, dealCollection(d, txns, accounts).collectedCents);
    st.rows.filter(r => r.dueCents > 0).forEach(r => {
      add(r.dueDate || start, "in", `${d.property_name || "Deal"} — ${r.label || `instalment ${r.index}`}`, r.dueCents, { source: "installment" });
      add(r.dueDate || start, "out", `Broker share — ${d.broker_name || ""} · ${d.property_name || ""}`.trim(), brokerCut(d, r.dueCents), { source: "broker" });
    });
  });
  // … then open invoices whose deals have no schedule.
  const meta = insInvoiceMeta(invoices, txns, accounts);
  meta.forEach(m => {
    if (m.due <= 50) return;
    const lineDeals = [...new Set((m.inv.lineItems || []).map(li => li.dealId).filter(Boolean).concat(m.inv.dealId || m.inv.deal_id || []))];
    if (lineDeals.length && lineDeals.every(id => scheduled.has(id))) return;
    add(m.dueDate, "in", `Inv #${m.inv.invoiceNumber} — ${(m.inv.invoicedTo && m.inv.invoicedTo.companyName) || ""}`, m.due, { source: "invoice" });
    const deal = lineDeals.length === 1 ? (deals || []).find(x => x.id === lineDeals[0]) : null;
    if (deal && !scheduled.has(deal.id)) add(m.dueDate, "out", `Broker share — ${deal.broker_name || ""} · ${deal.property_name || ""}`.trim(), brokerCut(deal, m.due), { source: "broker" });
  });
  // Brokers already owed on cash collected → now.
  payables.filter(r => r.owed > 0).forEach(r => add(start, "out", `Broker owed — ${r.broker} · ${r.deal.property_name || ""}`, r.owed, { source: "broker" }));
  // Planned expenses, recurring ones repeated through the horizon.
  (plannedExpenses || []).filter(p => p && p.nextDueDate && !["Paid", "Cancelled", "Skipped"].includes(p.status)).forEach(p => {
    const gross = Math.round((p.amountExpected || 0) * (p.vatApplicable && !p.amountIncludesVat ? 1 + (p.vatRate || 5) / 100 : 1));
    let date = p.nextDueDate, guard = 0, item = { ...p };
    while (date && date <= horizonEnd && guard++ < 60) {
      add(date, "out", p.title || "Planned expense", gross, { source: "planned" });
      if (p.expenseType !== "recurring") break;
      date = feAdvanceNextDueDate({ ...item, nextDueDate: date });
      item = { ...item, dueDay: item.dueDay || feDueAnchorDay(p) };
    }
  });
  // VAT: unpaid VAT of the previous quarter, and the current quarter so far.
  const outA = (accounts || []).find(a => a.isOutputVAT), inA = (accounts || []).find(a => a.isInputVAT);
  if (outA && inA) {
    const sm = parseInt(settings && settings.vatQuarterStartMonth, 10) || 1;
    const cur = insVatQuarterOf(asOf, sm);
    const L = buildLedger(insLive(txns).filter(t => (t.date || "") <= asOf), accounts);
    const balance = accountBalance(outA, L) - accountBalance(inA, L);       // still owed to the FTA
    const curNet = insVatReturn({ txns, accounts, from: cur.from, to: asOf }).netPayable;
    const prior = balance - curNet;
    if (prior > 0) add(isoAddDays(isoAddDays(cur.from, -1), 28), "out", "VAT — previous quarter (unpaid)", prior, { source: "vat" });
    if (curNet > 0) add(isoAddDays(cur.to, 28), "out", `VAT — ${cur.label} (so far)`, curNet, { source: "vat" });
  }
  let bal = openingCash || 0;
  W.forEach(w => { w.opening = bal; w.net = w.inflow - w.outflow; bal += w.net; w.closing = bal; });
  const lowest = W.reduce((m, w) => w.closing < m.closing ? w : m, W[0]);
  const firstNegative = W.find(w => w.closing < 0) || null;
  const unscheduled = (deals || []).filter(d => isOpenDeal(d) && !scheduled.has(d.id) &&
    ![...meta.values()].some(m => (m.inv.lineItems || []).some(li => li.dealId === d.id))).reduce((s, d) => s + (d.expected_commission_net || 0), 0);
  return { start, end: horizonEnd, weeks: W, items: items.sort((a, b) => a.week - b.week || String(a.date).localeCompare(String(b.date))), lowest, firstNegative,
    totalIn: W.reduce((s, w) => s + w.inflow, 0), totalOut: W.reduce((s, w) => s + w.outflow, 0), unscheduledPipelineC: unscheduled };
}

// ── 7.2 Receivables aging by developer / client ──
function insReceivablesAging({ invoices, txns, accounts, asOf }) {
  const meta = insInvoiceMeta(invoices, txns, accounts);
  const parties = new Map();
  meta.forEach(m => {
    if (m.due <= 50) return;
    const key = invPartyKey(m.inv);
    if (!parties.has(key)) parties.set(key, { key, name: (m.inv.invoicedTo && m.inv.invoicedTo.companyName) || "(no name)", current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0, count: 0, oldestDays: 0 });
    const p = parties.get(key);
    const days = m.dueDate && m.dueDate < asOf ? insDays(m.dueDate, asOf) : 0;
    p[invAgingBucket(days)] += m.due; p.total += m.due; p.count++; p.oldestDays = Math.max(p.oldestDays, days);
  });
  const rows = [...parties.values()].sort((a, b) => b.total - a.total);
  const totals = rows.reduce((t, r) => { ["current", "d30", "d60", "d90", "d90p", "total"].forEach(k => { t[k] += r[k]; }); return t; }, { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 });
  return { rows, totals };
}

// ── 7.4 Break-even ──
function insBreakEven({ deals, txns, accounts, fixedOverheadC, asOf, months = 12 }) {
  const byId = insAcctMap(accounts);
  const from = isoAddDays(asOf, -Math.round(months * 30.44));
  const rev = new Map(), cost = new Map();
  insLive(txns).filter(t => (t.date || "") >= from && (t.date || "") <= asOf && !(typeof isClosingTxn === "function" && isClosingTxn(t))).forEach(t => (t.lines || []).forEach(l => {
    const a = byId.get(l.accountId); const dealId = l.deal_id || t.deal_id;
    if (!a || !dealId) return;
    if (a.type === "Revenue") rev.set(dealId, (rev.get(dealId) || 0) + (l.credit || 0) - (l.debit || 0));
    if (isVariableCommissionExpense(a)) cost.set(dealId, (cost.get(dealId) || 0) + (l.debit || 0) - (l.credit || 0));
  }));
  const dealIds = [...rev.keys()].filter(id => rev.get(id) > 0);
  const totalRev = dealIds.reduce((s, id) => s + rev.get(id), 0);
  const totalRetained = dealIds.reduce((s, id) => s + rev.get(id) - (cost.get(id) || 0), 0);
  const avgRetained = dealIds.length ? totalRetained / dealIds.length : 0;
  return {
    months, dealCount: dealIds.length, totalRev, totalRetained,
    avgRetained, retentionRatio: totalRev > 0 ? totalRetained / totalRev : 0,
    dealsPerMonth: dealIds.length / months,
    dealsNeededPerMonth: avgRetained > 0 && fixedOverheadC > 0 ? fixedOverheadC / avgRetained : null,
    fixedOverheadC,
  };
}

// ── 7.10 Pipeline scenarios ──
function insPipelineScenarios({ deals, availableCashC, fixedOverheadC, retentionRatio }) {
  const open = (deals || []).filter(isOpenDeal);
  const retain = retentionRatio > 0 ? retentionRatio : 0.5;
  return INS_SCENARIOS.map(([key, label, factor]) => {
    const weighted = open.reduce((s, d) => s + (d.expected_commission_net || 0) * Math.min(1, (INS_STAGE_PROB[d.stage] || 0) * factor), 0);
    const retained = Math.round(weighted * retain);
    return { key, label, factor, weighted: Math.round(weighted), retained,
      runwayMonths: fixedOverheadC > 0 ? (availableCashC + retained) / fixedOverheadC : Infinity };
  });
}

// ── 7.6 Earned vs collected (and collection lag by developer) ──
function insEarnedVsCollected({ txns, accounts, invoices, asOf, months = 12 }) {
  const byId = insAcctMap(accounts);
  const reversed = reversedTxnIds(txns);
  const endKey = insMonthKey(asOf);
  const keys = Array.from({ length: months }, (_, i) => insAddMonths(endKey, i - months + 1));
  const series = new Map(keys.map(k => [k, { key: k, earned: 0, collected: 0 }]));
  insLive(txns).forEach(t => {
    if (typeof isClosingTxn === "function" && isClosingTxn(t)) return;
    const s = series.get(insMonthKey(t.date));
    if (!s) return;
    (t.lines || []).forEach(l => { const a = byId.get(l.accountId); if (a && a.type === "Revenue") s.earned += (l.credit || 0) - (l.debit || 0); });
    // Commission cash in: Sale Receipts and deal-linked bank imports alike (as
    // dealCollection counts them), reversed pairs and client money excluded.
    const cashIn = txnCashNet(t, byId);
    if (cashIn > 0 && (t.txnType === "SR" || t.deal_id) && !isInReversedPair(t, reversed) && !isClientFundsTxn(t)) s.collected += cashIn;
  });
  const meta = insInvoiceMeta(invoices, txns, accounts);
  const devs = new Map();
  meta.forEach(m => {
    const key = invPartyKey(m.inv);
    if (!devs.has(key)) devs.set(key, { key, name: (m.inv.invoicedTo && m.inv.invoicedTo.companyName) || "(no name)", invoiced: 0, collected: 0, outstanding: 0, lags: [] });
    const d = devs.get(key);
    d.invoiced += m.total; d.collected += m.paid; d.outstanding += m.due;
    if (m.due <= 50 && m.lastReceipt && m.inv.invoiceDate) d.lags.push(insDays(m.inv.invoiceDate, m.lastReceipt));
  });
  const developers = [...devs.values()].map(d => ({ ...d, avgLagDays: d.lags.length ? Math.round(d.lags.reduce((s, x) => s + x, 0) / d.lags.length) : null, paidCount: d.lags.length }))
    .sort((a, b) => b.invoiced - a.invoiced);
  return { months: [...series.values()], developers };
}

// ── 7.7 Budget vs actual (revenue, expense, net income) ──
function insBudgetVsActual({ budgets, accounts, txns, year, asOf }) {
  const byId = insAcctMap(accounts);
  const byCode = new Map((accounts || []).map(a => [a.code, a]));
  const curYear = Number(String(asOf).slice(0, 4)), curMonth = Number(String(asOf).slice(5, 7));
  const dim = new Date(curYear, curMonth, 0).getDate();
  const monthsElapsed = year < curYear ? 12 : year > curYear ? 0 : (curMonth - 1) + Number(String(asOf).slice(8, 10)) / dim;
  const elapsedFrac = q => Math.max(0, Math.min(1, (monthsElapsed - (q - 1) * 3) / 3));
  const rows = new Map();
  const row = code => { if (!rows.has(code)) { const a = byCode.get(code); rows.set(code, { code, account: a, type: a ? a.type : "", budgetYear: 0, budgetYTD: 0, budgetRest: 0, actualYTD: 0 }); } return rows.get(code); };
  [1, 2, 3, 4].forEach(q => {
    const b = (budgets || []).find(x => x.id === `budget-${year}-Q${q}`);
    (b ? b.lines : []).forEach(l => {
      const r = row(l.accountCode);
      r.budgetYear += l.amount || 0;
      r.budgetYTD += Math.round((l.amount || 0) * elapsedFrac(q));
      r.budgetRest += Math.round((l.amount || 0) * (1 - elapsedFrac(q)));
    });
  });
  insLive(txns).filter(t => String(t.date || "").slice(0, 4) === String(year) && (t.date || "") <= asOf && !(typeof isClosingTxn === "function" && isClosingTxn(t))).forEach(t => (t.lines || []).forEach(l => {
    const a = byId.get(l.accountId);
    if (!a || (a.type !== "Revenue" && a.type !== "Expense")) return;
    row(a.code).actualYTD += a.type === "Revenue" ? (l.credit || 0) - (l.debit || 0) : (l.debit || 0) - (l.credit || 0);
  }));
  const list = [...rows.values()].filter(r => r.type === "Revenue" || r.type === "Expense").map(r => ({
    ...r, variance: r.actualYTD - r.budgetYTD,
    // Full year: actual to date + the budget for the rest of the year; where
    // there is no budget, the run-rate so far.
    projection: r.budgetYear ? r.actualYTD + r.budgetRest : (monthsElapsed > 0 ? Math.round(r.actualYTD / monthsElapsed * 12) : 0),
  })).sort((a, b) => a.type.localeCompare(b.type) * -1 || a.code.localeCompare(b.code));
  const sum = (type, k) => list.filter(r => r.type === type).reduce((s, r) => s + r[k], 0);
  const tot = k => ({ revenue: sum("Revenue", k), expense: sum("Expense", k), ni: sum("Revenue", k) - sum("Expense", k) });
  return { year, monthsElapsed, rows: list, budgetYear: tot("budgetYear"), budgetYTD: tot("budgetYTD"), actualYTD: tot("actualYTD"), projection: tot("projection"),
    hasRevenueBudget: list.some(r => r.type === "Revenue" && r.budgetYear > 0) };
}

// ── 7.8 12-month expense trend ──
function insExpenseTrend({ txns, accounts, asOf, months = 12 }) {
  const byId = insAcctMap(accounts);
  const lastComplete = insAddMonths(insMonthKey(asOf), -1);
  const keys = Array.from({ length: months }, (_, i) => insAddMonths(lastComplete, i - months + 1));
  const yoyKey = insAddMonths(lastComplete, -12);
  const want = new Set([...keys, yoyKey]);
  const m = new Map();
  insLive(txns).forEach(t => {
    if (typeof isClosingTxn === "function" && isClosingTxn(t)) return;
    const k = insMonthKey(t.date);
    if (!want.has(k)) return;
    (t.lines || []).forEach(l => {
      const a = byId.get(l.accountId);
      if (!a || a.type !== "Expense") return;
      if (!m.has(a.id)) m.set(a.id, new Map());
      const mm = m.get(a.id); mm.set(k, (mm.get(k) || 0) + (l.debit || 0) - (l.credit || 0));
    });
  });
  const rows = [...m.entries()].map(([id, mm]) => {
    const series = keys.map(k => mm.get(k) || 0);
    const total = series.reduce((s, v) => s + v, 0);
    const runRate = Math.round(series.slice(-3).reduce((s, v) => s + v, 0) / 3);
    const last = series[series.length - 1], prior = mm.get(yoyKey) || 0;
    return { account: byId.get(id), series, total, runRate, last, yoyBase: prior, yoyPct: prior > 0 ? (last - prior) / prior * 100 : null,
      trendPct: series[0] + series[1] + series[2] > 0 ? ((series.slice(-3).reduce((s, v) => s + v, 0)) / (series[0] + series[1] + series[2]) - 1) * 100 : null };
  }).filter(r => r.total !== 0).sort((a, b) => b.total - a.total);
  return { keys, rows, totals: keys.map((k, i) => rows.reduce((s, r) => s + r.series[i], 0)) };
}

// ── 7.9 Management alerts ──
function insAlerts({ asOf, kpis, deals, txns, accounts, invoices, employees, settings }) {
  const out = [];
  const push = (level, title, detail, page) => out.push({ level, title, detail, page });
  const runway = kpis && kpis.runwayMonths;
  if (runway !== undefined && runway !== Infinity && runway < 3)
    push(runway < 1 ? "critical" : "warning", `Cash runway ${runway.toFixed(1)} months`, `Available cash ${fmtAED(kpis.availableCash)} covers ${runway.toFixed(1)} months of fixed overhead (${fmtAED(kpis.avgMonthlyFixedOverhead)}/month).`, "dashboard");
  const meta = insInvoiceMeta(invoices, txns, accounts);
  const over60 = [...meta.values()].filter(m => m.due > 50 && m.dueDate && insDays(m.dueDate, asOf) > 60);
  if (over60.length) push("warning", `${over60.length} invoice(s) overdue more than 60 days`, `${fmtAED(over60.reduce((s, m) => s + m.due, 0))} — ${over60.slice(0, 4).map(m => `#${m.inv.invoiceNumber}`).join(", ")}${over60.length > 4 ? "…" : ""}`, "invoices");
  let instOver = 0, instCount = 0;
  (deals || []).filter(d => d.stage !== "Cancelled" && Array.isArray(d.installment_schedule) && d.installment_schedule.length).forEach(d => {
    installmentStatus(d, dealCollection(d, txns, accounts).collectedCents).rows
      .filter(r => r.dueCents > 0 && r.dueDate && insDays(r.dueDate, asOf) > 60).forEach(r => { instOver += r.dueCents; instCount++; });
  });
  if (instCount) push("warning", `${instCount} instalment(s) overdue more than 60 days`, `${fmtAED(instOver)} still to collect on payment plans.`, "deals");
  const owed = insBrokerOwedRows({ deals, txns, accounts, employees });
  if (owed.length) push("info", `Brokers owed ${fmtAED(owed.reduce((s, r) => s + r.owed, 0))} on cash already collected`, `${owed.length} deal(s): ${owed.slice(0, 3).map(r => r.broker).join(", ")}${owed.length > 3 ? "…" : ""}`, "deals");
  const stale = (deals || []).filter(d => d.stage === "Commission Earned" && dealCollection(d, txns, accounts).collectedCents === 0 &&
    insDays(String(d.updated_at || d.created_at || asOf).slice(0, 10), asOf) > 30);
  if (stale.length) push("warning", `${stale.length} deal(s) at "Commission Earned" with nothing collected for 30+ days`, stale.slice(0, 4).map(d => d.property_name || d.id).join(", "), "deals");
  const unpaidAcc = insLive(txns).filter(t => isAccrualTxn(t) && accrualStatus(t, txns) === "unpaid" && insDays(t.date || asOf, asOf) > 30);
  if (unpaidAcc.length) push("info", `${unpaidAcc.length} accrual(s) unpaid for 30+ days`, `${fmtAED(unpaidAcc.reduce((s, t) => s + (t.lines || []).reduce((ss, l) => ss + (l.debit || 0), 0), 0))} owed in Accrued Expenses.`, "futureExpenses");
  const sm = parseInt(settings && settings.vatQuarterStartMonth, 10) || 1;
  const prevQ = insVatQuarterOf(isoAddDays(insVatQuarterOf(asOf, sm).from, -1), sm);
  const ret = insVatReturn({ txns, accounts, from: prevQ.from, to: prevQ.to });
  const daysToDue = insDays(asOf, ret.dueDate);
  if (ret.outstanding > 0 && daysToDue <= 14) push(daysToDue < 0 ? "critical" : "warning", daysToDue < 0 ? `VAT return ${prevQ.label} is ${-daysToDue} day(s) late` : `VAT return ${prevQ.label} due in ${daysToDue} day(s)`, `${fmtAED(ret.outstanding)} payable, due ${fmtDate(ret.dueDate)}.`, "vat");
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// ═══════════════════════════════════════════════════════════════════
//  InsightsPage
// ═══════════════════════════════════════════════════════════════════
function InsightsPage({ accounts, txns, deals, ledger, settings, setSettings, plannedExpenses, budgets, employees, setPage, userRole }) {
  const [tab, setTab] = usePersistedState("insights_tab", "alerts");
  const [invoices, setInvoices] = useState(() => ls_get("invoices", []));
  useEffect(() => {
    const unsub = db.collection("invoices").onSnapshot(snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("invoices", err));
    return () => unsub();
  }, []);
  const asOf = todayStr();
  const kpis = useMemo(() => calculateAppKpis({ accounts, txns, deals, ledger, settings }), [accounts, txns, deals, ledger, settings]);
  const vatStart = parseInt(settings && settings.vatQuarterStartMonth, 10) || 1;
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  const [vatIdx, setVatIdx] = useState(1);
  const [conversion, setConversion] = useState("expected");

  const forecast = useMemo(() => tab === "forecast" ? insCashForecast({ asOf, openingCash: kpis.availableCash, deals, txns, accounts, invoices, plannedExpenses, employees, settings }) : null, [tab, kpis.availableCash, deals, txns, accounts, invoices, plannedExpenses, employees, settings]);
  const aging = useMemo(() => tab === "aging" ? insReceivablesAging({ invoices, txns, accounts, asOf }) : null, [tab, invoices, txns, accounts]);
  const payables = useMemo(() => tab === "brokers" ? insBrokerOwedRows({ deals, txns, accounts, employees }) : null, [tab, deals, txns, accounts, employees]);
  const be = useMemo(() => (tab === "breakeven" || tab === "scenarios") ? insBreakEven({ deals, txns, accounts, fixedOverheadC: kpis.avgMonthlyFixedOverhead, asOf }) : null, [tab, deals, txns, accounts, kpis.avgMonthlyFixedOverhead]);
  const quarters = useMemo(() => insVatQuarterList(vatStart, asOf, 6), [vatStart]);
  const vat = useMemo(() => tab === "vat" && quarters[vatIdx] ? insVatReturn({ txns, accounts, ...quarters[vatIdx] }) : null, [tab, txns, accounts, quarters, vatIdx]);
  const evc = useMemo(() => tab === "collection" ? insEarnedVsCollected({ txns, accounts, invoices, asOf }) : null, [tab, txns, accounts, invoices]);
  const bva = useMemo(() => tab === "budget" ? insBudgetVsActual({ budgets, accounts, txns, year: budgetYear, asOf }) : null, [tab, budgets, accounts, txns, budgetYear]);
  const trend = useMemo(() => tab === "trend" ? insExpenseTrend({ txns, accounts, asOf }) : null, [tab, txns, accounts]);
  const alerts = useMemo(() => insAlerts({ asOf, kpis, deals, txns, accounts, invoices, employees, settings }), [kpis, deals, txns, accounts, invoices, employees, settings]);
  const scenarios = useMemo(() => tab === "scenarios" && be ? insPipelineScenarios({ deals, availableCashC: kpis.availableCash, fixedOverheadC: kpis.avgMonthlyFixedOverhead, retentionRatio: be.retentionRatio }) : null, [tab, be, deals, kpis]);

  const TABS = [["alerts", "🚨 Alerts" + (alerts.length ? ` (${alerts.length})` : "")], ["forecast", "📈 13-week cash"], ["aging", "⏳ Receivables"], ["brokers", "🤝 Broker payables"],
    ["breakeven", "⚖️ Break-even"], ["scenarios", "🎯 Pipeline scenarios"], ["vat", "🧾 VAT return"], ["collection", "💵 Earned vs collected"],
    ["budget", "📊 Budget vs actual"], ["trend", "📉 Expense trend"]];
  const card = { ...C.card, padding: 16, marginBottom: 14 };
  const R = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const money = c => fmtAED(c || 0);
  const note = t => <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>{t}</div>;
  const tile = (label, value, sub, color) => <div style={{ ...C.card, padding: "12px 14px", borderTop: `3px solid ${color || GOLD}` }}>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}</div>;
  const tiles = arr => <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 14 }}>{arr}</div>;

  return <div>
    <PageHeader title="Insights" sub="Decision reports derived from the books — nothing here posts anything" />
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {TABS.map(([id, l]) => <button key={id} style={C.btn(tab === id ? "primary" : "secondary", true)} onClick={() => setTab(id)}>{l}</button>)}
    </div>

    {tab === "alerts" && <div style={card}>
      {alerts.length === 0 ? <div style={{ color: "#047857", fontWeight: 600 }}>✓ Nothing needs attention right now.</div> :
        alerts.map((a, i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: i ? "1px solid #F2F4F7" : "none" }}>
          <span style={C.badge(a.level === "critical" ? "danger" : a.level === "warning" ? "warning" : "info")}>{a.level}</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: NAVY }}>{a.title}</div><div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2 }}>{a.detail}</div></div>
          {a.page && setPage && <button style={C.btn("secondary", true)} onClick={() => setPage(a.page)}>Open →</button>}
        </div>)}
    </div>}

    {tab === "forecast" && forecast && <>
      {tiles([
        tile("Available cash now", money(kpis.availableCash), "bank + cash − client money held", "#1D4ED8"),
        tile("Expected in (13 wk)", money(forecast.totalIn), "instalments + open invoices", "#059669"),
        tile("Expected out (13 wk)", money(forecast.totalOut), "planned, brokers, VAT", "#DC2626"),
        tile("Lowest point", money(forecast.lowest.closing), `week of ${fmtDate(forecast.lowest.from)}`, forecast.lowest.closing < 0 ? "#DC2626" : "#059669"),
      ])}
      {forecast.firstNegative && <div style={{ ...card, background: "#FEF2F2", borderLeft: "4px solid #DC2626", color: "#991B1B", fontWeight: 600 }}>Cash goes negative in the week of {fmtDate(forecast.firstNegative.from)} ({money(forecast.firstNegative.closing)}).</div>}
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Week", "Opening", "In", "Out", "Closing"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
          <tbody>{forecast.weeks.map(w => <tr key={w.i}>
            <td style={C.td}>{fmtDate(w.from)}{w.i === 0 ? " · incl. overdue" : ""}</td>
            <td style={{ ...C.td, ...R }}>{money(w.opening)}</td>
            <td style={{ ...C.td, ...R, color: "#059669" }}>{w.inflow ? money(w.inflow) : "—"}</td>
            <td style={{ ...C.td, ...R, color: "#DC2626" }}>{w.outflow ? money(w.outflow) : "—"}</td>
            <td style={{ ...C.td, ...R, fontWeight: 700, color: w.closing < 0 ? "#DC2626" : NAVY }}>{money(w.closing)}</td>
          </tr>)}</tbody>
        </table>
        {note(`Inflows: payment-plan instalments and open invoice balances by due date (overdue items land in week 1). Outflows: planned expenses (recurring ones repeat), brokers' share of each inflow and what brokers are already owed, and VAT 28 days after each quarter. Open pipeline with no schedule or invoice (${money(forecast.unscheduledPipelineC)}) is NOT included.`)}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>What drives it</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><tbody>
          {forecast.items.slice(0, 80).map((it, i) => <tr key={i}>
            <td style={C.td}>{fmtDate(forecast.weeks[it.week].from)}</td><td style={C.td}>{it.overdue && <span style={{ ...C.badge("danger"), marginRight: 6 }}>overdue</span>}{it.label}</td>
            <td style={{ ...C.td, ...R, color: it.kind === "in" ? "#059669" : "#DC2626" }}>{it.kind === "in" ? "+" : "−"}{money(it.amountC)}</td>
          </tr>)}
        </tbody></table>
      </div>
    </>}

    {tab === "aging" && aging && <div style={card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr>{["Developer / client", "Not yet due", "1–30", "31–60", "61–90", "90+", "Total", "Oldest"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
        <tbody>
          {aging.rows.length === 0 && <tr><td colSpan={8} style={{ ...C.td, textAlign: "center", color: "#9CA3AF", padding: 20 }}>No open invoices.</td></tr>}
          {aging.rows.map(r => <tr key={r.key}><td style={C.td}>{r.name} <span style={{ color: "#9CA3AF" }}>({r.count})</span></td>
            {["current", "d30", "d60", "d90", "d90p"].map(k => <td key={k} style={{ ...C.td, ...R, color: k === "d90p" && r[k] ? "#DC2626" : undefined }}>{r[k] ? money(r[k]) : "—"}</td>)}
            <td style={{ ...C.td, ...R, fontWeight: 700 }}>{money(r.total)}</td><td style={{ ...C.td, ...R }}>{r.oldestDays ? `${r.oldestDays} d` : "—"}</td></tr>)}
        </tbody>
        <tfoot><tr><td style={{ ...C.td, fontWeight: 800 }}>Total</td>{["current", "d30", "d60", "d90", "d90p", "total"].map(k => <td key={k} style={{ ...C.td, ...R, fontWeight: 800 }}>{money(aging.totals[k])}</td>)}<td style={C.td} /></tr></tfoot>
      </table>
      {note("Issued tax invoices less linked receipts, aged by days past each invoice's due date.")}
    </div>}

    {tab === "brokers" && payables && <div style={card}>
      {tiles([tile("Owed to brokers", money(payables.reduce((s, r) => s + r.owed, 0)), `${payables.length} deal(s)`, "#B45309")])}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr>{["Deal", "Broker", "Share", "Due on cash collected", "Paid", "Of which accrued", "Owed"].map((h, i) => <th key={h} style={{ ...C.th, ...(i > 1 ? R : {}) }}>{h}</th>)}</tr></thead>
        <tbody>
          {payables.length === 0 && <tr><td colSpan={7} style={{ ...C.td, textAlign: "center", color: "#9CA3AF", padding: 20 }}>No broker is owed anything on collected cash.</td></tr>}
          {payables.map(r => <tr key={r.deal.id}><td style={C.td}>{r.deal.property_name || r.deal.id}<div style={{ fontSize: 11, color: "#9CA3AF" }}>{Math.round(r.collectedRatio * 100)}% collected</div></td><td style={C.td}>{r.broker}</td>
            <td style={{ ...C.td, ...R }}>{r.pct}%{r.assumed && <span title="No split on the broker's employee record — the 50 % default is assumed" style={{ color: "#B45309" }}> *</span>}</td>
            <td style={{ ...C.td, ...R }}>{money(r.dueOnCash)}</td><td style={{ ...C.td, ...R }}>{money(r.paid)}</td><td style={{ ...C.td, ...R }}>{r.accrued ? money(r.accrued) : "—"}</td>
            <td style={{ ...C.td, ...R, fontWeight: 700, color: "#B45309" }}>{money(r.owed)}</td></tr>)}
        </tbody>
      </table>
      {note("Broker share × net commission × the fraction already collected, less broker payments booked on the deal. * = no split set on the broker's employee record; 50 % assumed.")}
    </div>}

    {tab === "breakeven" && be && <>
      {tiles([
        tile("Fixed overhead / month", money(be.fixedOverheadC), "complete months, commissions excluded", "#DC2626"),
        tile("Avg retained per deal", money(Math.round(be.avgRetained)), `${be.dealCount} deals, last 12 months`, "#059669"),
        tile("Deals needed / month", be.dealsNeededPerMonth == null ? "—" : be.dealsNeededPerMonth.toFixed(1), "to cover fixed overhead", NAVY),
        tile("Deals actually closed / month", be.dealsPerMonth.toFixed(1), be.dealsNeededPerMonth != null ? (be.dealsPerMonth >= be.dealsNeededPerMonth ? "above break-even" : "below break-even") : "", be.dealsNeededPerMonth != null && be.dealsPerMonth >= be.dealsNeededPerMonth ? "#059669" : "#B45309"),
      ])}
      <div style={card}>{note(`Retained = deal revenue (excl. VAT) less broker commission, manager override and incentives, over the last ${be.months} months. The company keeps ${(be.retentionRatio * 100).toFixed(0)}% of commission revenue on average.`)}</div>
    </>}

    {tab === "scenarios" && scenarios && <div style={card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr>{["Scenario", "Weighted pipeline", "Retained after brokers", "Runway incl. pipeline"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
        <tbody>{scenarios.map(s => <tr key={s.key} style={{ background: s.key === conversion ? "#FBF6EC" : undefined, cursor: "pointer" }} onClick={() => setConversion(s.key)}>
          <td style={{ ...C.td, fontWeight: 700 }}>{s.label} <span style={{ color: "#9CA3AF", fontWeight: 400 }}>× {s.factor}</span></td>
          <td style={{ ...C.td, ...R }}>{money(s.weighted)}</td><td style={{ ...C.td, ...R }}>{money(s.retained)}</td>
          <td style={{ ...C.td, ...R, fontWeight: 700 }}>{s.runwayMonths === Infinity ? "✓" : `${s.runwayMonths.toFixed(1)} months`}</td></tr>)}</tbody>
      </table>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {Object.entries(INS_STAGE_PROB).map(([st, p]) => <span key={st} style={C.badge("neutral")}>{st}: {Math.round(Math.min(1, p * (INS_SCENARIOS.find(x => x[0] === conversion) || [0, 0, 1])[2]) * 100)}%</span>)}
      </div>
      {note("Each open deal's expected net commission × the probability of its stage (scaled per scenario), × the share the company keeps after broker costs; runway = (available cash + that) ÷ fixed monthly overhead.")}
    </div>}

    {tab === "vat" && vat && <div style={card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <Sel value={String(vatIdx)} onChange={e => setVatIdx(parseInt(e.target.value, 10))}>{quarters.map((q, i) => <option key={i} value={i}>{q.label}{i === 0 ? " (current)" : ""}</option>)}</Sel>
        <Sel value={String(vatStart)} onChange={e => setSettings && setSettings({ ...(settings || {}), vatQuarterStartMonth: parseInt(e.target.value, 10) })}>
          <option value="1">Tax periods: Jan–Mar …</option><option value="2">Tax periods: Feb–Apr …</option><option value="3">Tax periods: Mar–May …</option>
        </Sel>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><tbody>
        {[["Box 1 — Standard-rated supplies (amount)", vat.stdSupplies], ["Box 1 — Output VAT", vat.outputVat], ["Box 4/5 — Zero-rated / exempt supplies", vat.zeroExempt],
          ["Box 9 — Standard-rated expenses (amount)", vat.stdExpenses], ["Box 9 — Recoverable input VAT", vat.inputVat]].map(([l, v]) =>
          <tr key={l}><td style={C.td}>{l}</td><td style={{ ...C.td, ...R }}>{money(v)}</td></tr>)}
        <tr><td style={{ ...C.td, fontWeight: 800 }}>Box 14 — Net VAT {vat.netPayable >= 0 ? "payable" : "refundable"}</td><td style={{ ...C.td, ...R, fontWeight: 800 }}>{money(Math.abs(vat.netPayable))}</td></tr>
        <tr><td style={C.td}>Due date (28 days after the period)</td><td style={{ ...C.td, ...R }}>{fmtDate(vat.dueDate)}</td></tr>
        <tr><td style={C.td}>Settled after the period ({vat.settlements.length} entr{vat.settlements.length === 1 ? "y" : "ies"})</td><td style={{ ...C.td, ...R }}>{money(vat.settled)}</td></tr>
        <tr><td style={{ ...C.td, fontWeight: 700 }}>Still to pay / (to receive)</td><td style={{ ...C.td, ...R, fontWeight: 700, color: vat.outstanding > 0 ? "#DC2626" : "#047857" }}>{money(vat.outstanding)}</td></tr>
      </tbody></table>
      {note("Figures come from the 2101 / 1201 lines of every entry dated in the period (settlement entries excluded). Prepare the FTA return from these boxes; Box 1 is shown for the whole UAE — split it by emirate on the return if needed.")}
    </div>}

    {tab === "collection" && evc && <>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Month", "Revenue earned (excl. VAT)", "Commission cash collected", "Collected ÷ earned"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
          <tbody>{evc.months.map(m => <tr key={m.key}><td style={C.td}>{m.key}</td><td style={{ ...C.td, ...R }}>{money(m.earned)}</td><td style={{ ...C.td, ...R }}>{money(m.collected)}</td>
            <td style={{ ...C.td, ...R }}>{m.earned > 0 ? `${Math.round(m.collected / m.earned * 100)}%` : "—"}</td></tr>)}</tbody>
        </table>
        {note("Collected includes VAT; earned does not — a fully collected month reads about 105%.")}
      </div>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Developer / client", "Invoiced", "Collected", "Outstanding", "Avg days to pay"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
          <tbody>{evc.developers.map(d => <tr key={d.key}><td style={C.td}>{d.name}</td><td style={{ ...C.td, ...R }}>{money(d.invoiced)}</td><td style={{ ...C.td, ...R }}>{money(d.collected)}</td>
            <td style={{ ...C.td, ...R, color: d.outstanding ? "#B45309" : undefined }}>{money(d.outstanding)}</td>
            <td style={{ ...C.td, ...R, fontWeight: 700 }}>{d.avgLagDays == null ? "—" : `${d.avgLagDays} d (${d.paidCount})`}</td></tr>)}</tbody>
        </table>
        {note("Days to pay = invoice date → last receipt, over invoices paid in full.")}
      </div>
    </>}

    {tab === "budget" && bva && <div style={card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <Sel value={String(budgetYear)} onChange={e => setBudgetYear(parseInt(e.target.value, 10))}>{[0, 1, 2].map(i => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</Sel>
        <span style={{ fontSize: 12, color: "#6B7280" }}>{bva.monthsElapsed.toFixed(1)} of 12 months elapsed{!bva.hasRevenueBudget ? " · no revenue targets set (add them in Budget)" : ""}</span>
      </div>
      {tiles(["revenue", "expense", "ni"].map(k => tile(k === "ni" ? "Net income" : k === "revenue" ? "Revenue" : "Expenses",
        money(bva.actualYTD[k]), `budget YTD ${money(bva.budgetYTD[k])} · full-year projection ${money(bva.projection[k])}`, k === "expense" ? "#DC2626" : "#059669")))}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr>{["Account", "Budget (year)", "Budget YTD", "Actual YTD", "Variance", "Full-year projection"].map((h, i) => <th key={h} style={{ ...C.th, ...(i ? R : {}) }}>{h}</th>)}</tr></thead>
        <tbody>{bva.rows.map(r => {
          const bad = r.type === "Expense" ? r.variance > 0 : r.variance < 0;
          return <tr key={r.code}><td style={C.td}>{r.code} · {r.account ? r.account.name : ""} {r.type === "Revenue" && <span style={C.badge("success")}>revenue</span>}</td>
            <td style={{ ...C.td, ...R }}>{r.budgetYear ? money(r.budgetYear) : "—"}</td><td style={{ ...C.td, ...R }}>{r.budgetYTD ? money(r.budgetYTD) : "—"}</td>
            <td style={{ ...C.td, ...R }}>{money(r.actualYTD)}</td>
            <td style={{ ...C.td, ...R, color: r.budgetYTD ? (bad ? "#DC2626" : "#047857") : "#9CA3AF" }}>{r.budgetYTD ? money(r.variance) : "—"}</td>
            <td style={{ ...C.td, ...R }}>{money(r.projection)}</td></tr>;
        })}</tbody>
      </table>
      {note("Budget YTD prorates the current quarter by months elapsed. Projection = actual to date + remaining budget; accounts without a budget project their run-rate.")}
    </div>}

    {tab === "trend" && trend && <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 1100 }}>
        <thead><tr><th style={C.th}>Expense account</th>{trend.keys.map(k => <th key={k} style={{ ...C.th, ...R }}>{k.slice(2)}</th>)}<th style={{ ...C.th, ...R }}>12-mo total</th><th style={{ ...C.th, ...R }}>Run-rate</th><th style={{ ...C.th, ...R }}>YoY</th></tr></thead>
        <tbody>{trend.rows.map(r => <tr key={r.account.id}><td style={C.td}>{r.account.code} · {r.account.name}</td>
          {r.series.map((v, i) => <td key={i} style={{ ...C.td, ...R, color: v ? undefined : "#D0D5DD" }}>{v ? Math.round(v / 100).toLocaleString("en-US") : "·"}</td>)}
          <td style={{ ...C.td, ...R, fontWeight: 700 }}>{money(r.total)}</td><td style={{ ...C.td, ...R }}>{money(r.runRate)}</td>
          <td style={{ ...C.td, ...R, color: r.yoyPct == null ? "#9CA3AF" : r.yoyPct > 10 ? "#DC2626" : r.yoyPct < -10 ? "#047857" : undefined }}>{r.yoyPct == null ? "—" : `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct.toFixed(0)}%`}</td></tr>)}</tbody>
        <tfoot><tr><td style={{ ...C.td, fontWeight: 800 }}>Total</td>{trend.totals.map((v, i) => <td key={i} style={{ ...C.td, ...R, fontWeight: 700 }}>{Math.round(v / 100).toLocaleString("en-US")}</td>)}<td colSpan={3} style={C.td} /></tr></tfoot>
      </table>
      {note("Last 12 complete months, AED. Run-rate = average of the last 3 months. YoY = last month vs the same month a year earlier.")}
    </div>}
  </div>;
}
