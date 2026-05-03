/* ══════════════════════════════════════════════════
       PAGE COMPONENTS
       ══════════════════════════════════════════════════ */

// ╔══════════════════════════════════════════════════╗
//  DATE FILTER UTILITIES (shared across pages)
// ╚══════════════════════════════════════════════════╝
function computeDateRange(preset) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const fmt = d => d.toISOString().slice(0, 10);
  const fd = (yr, mo) => new Date(yr, mo, 1);
  const ld = (yr, mo) => new Date(yr, mo + 1, 0);
  switch (preset) {
    case "this_month": return { from: fmt(fd(y, m)), to: fmt(today) };
    case "last_month": return { from: fmt(fd(y, m - 1)), to: fmt(ld(y, m - 1)) };
    case "last_quarter": {
      const curQStart = Math.floor(m / 3) * 3;
      const prevQMo = curQStart - 3;
      const pqYear = prevQMo < 0 ? y - 1 : y;
      const pqMo = prevQMo < 0 ? prevQMo + 12 : prevQMo;
      return { from: fmt(fd(pqYear, pqMo)), to: fmt(ld(pqYear, pqMo + 2)) };
    }
    case "last_half": return { from: fmt(fd(y, m - 5)), to: fmt(today) };
    case "this_year": return { from: `${y}-01-01`, to: fmt(today) };
    case "last_year": return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: return { from: "", to: "" };
  }
}
function DateFilterBar({ dateFilter, setDateFilter }) {
  const PRESETS = [
    { id: "this_month", label: "This Month" },
    { id: "last_month", label: "Last Month" },
    { id: "last_quarter", label: "Last Quarter" },
    { id: "last_half", label: "Last 6 Months" },
    { id: "this_year", label: "This Year" },
    { id: "last_year", label: "Last Year" },
    { id: "custom", label: "Custom" },
  ];
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: window.innerWidth <= 768 ? "nowrap" : "wrap", overflowX: window.innerWidth <= 768 ? "auto" : "visible", WebkitOverflowScrolling: "touch", msOverflowStyle: "none", scrollbarWidth: "none", alignItems: "center", marginBottom: 18, padding: "7px 8px", background: "#ffffff", borderRadius: 12, border: "1px solid #EAECF0", boxShadow: "0 1px 3px rgba(16,24,40,.05)" }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#98A2B3", letterSpacing: "0.12em", marginRight: 6, paddingLeft: 6, flexShrink: 0 }}>Period</span>
      {PRESETS.map(p => {
        const active = dateFilter.preset === p.id;
        return <button key={p.id} onClick={() => {
          if (p.id !== "custom") {
            const range = computeDateRange(p.id);
            setDateFilter({ preset: p.id, ...range });
          } else {
            setDateFilter(prev => ({ ...prev, preset: "custom" }));
          }
        }} style={{
          padding: "5px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          border: "none",
          background: active ? GOLD : "transparent",
          color: active ? "#ffffff" : "#667085",
          transition: "all .15s",
          letterSpacing: active ? "-0.01em" : "0",
          whiteSpace: "nowrap",
        }}>{p.label}</button>;
      })}
      {dateFilter.preset === "custom" && <>
        <Inp type="date" value={dateFilter.from} onChange={e => setDateFilter(prev => ({ ...prev, from: e.target.value }))} style={{ width: 138, marginLeft: 4 }} />
        <span style={{ fontSize: 13, color: "#98A2B3" }}>→</span>
        <Inp type="date" value={dateFilter.to} onChange={e => setDateFilter(prev => ({ ...prev, to: e.target.value }))} style={{ width: 138 }} />
      </>}
      {dateFilter.preset !== "custom" && dateFilter.from && (
        <span style={{ fontSize: 11, color: "#98A2B3", marginLeft: 6, letterSpacing: "0.01em" }}>{dateFilter.from} → {dateFilter.to}</span>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════╗
//  DASHBOARD
// ╚══════════════════════════════════════════════════╝
function Dashboard({ accounts, txns, deals, kpis, ledger, setPage, dark, plannedExpenses }) {
  const isMobile = window.innerWidth <= 768;
  const isTablet = window.innerWidth <= 1120;
  const reportingStartLabel = fmtDate(kpis.reportingStartDate || DEFAULT_REPORTING_START_DATE);
  const [dateFilter, setDateFilter] = useState(() => { const r = computeDateRange("this_month"); return { preset: "this_month", ...r }; });
  const inRange = t => (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to);
  const recentTxns = [...txns].filter(t => !t.isVoid && inRange(t)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
  const cashAccounts = accounts.filter(a => a.isBank || a.code === "1001");
  const maxCashFlow = Math.max(1, ...kpis.cashFlowSeries.map(item => Math.max(item.inflow, item.outflow, Math.abs(item.net))));
  const maxPerformance = Math.max(1, ...kpis.monthlyPerformance.map(item => Math.max(item.revenue, item.expense, Math.abs(item.net))));
  const [includePending, setIncludePending] = useState(false);
  const [showRecentTxns, setShowRecentTxns] = useState(false);

  // Projected Runway assuming 50% collection of pipeline
  const projectedRunway = useMemo(() => {
    const effectiveCash = kpis.cash + (includePending ? (kpis.pendingPipelineCommission * 0.5) : 0);
    return kpis.avgMonthlyExpense > 0 ? effectiveCash / kpis.avgMonthlyExpense : Infinity;
  }, [kpis.cash, kpis.pendingPipelineCommission, kpis.avgMonthlyExpense, includePending]);
  const runwayAlertLevel = projectedRunway === Infinity ? null : projectedRunway < 1 ? "critical" : projectedRunway < 3 ? "warning" : null;

  // KPIs recomputed for the selected date period (responds to date filter)
  const filteredKpis = useMemo(() => {
    const ft = txns.filter(t => !t.isVoid && (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to));
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const outputVATA = accounts.find(a => a.isOutputVAT);
    const inputVATA = accounts.find(a => a.isInputVAT);
    let rev = 0, exp = 0, brokerPayout = 0, opCashIn = 0, opCashOut = 0;
    const expByAccount = new Map();
    for (const t of ft) {
      const lines = t.lines || [];
      for (const l of lines) {
        const a = accountById.get(l.accountId);
        if (!a) continue;
        if (a.type === "Revenue") rev += (l.credit || 0) - (l.debit || 0);
        if (a.type === "Expense") {
          const amt = (l.debit || 0) - (l.credit || 0);
          exp += amt;
          expByAccount.set(a.id, (expByAccount.get(a.id) || 0) + amt);
          if ((a.name || "").toLowerCase().includes("broker") || (a.code || "").startsWith("55")) brokerPayout += amt;
        }
      }
      const bankLines = lines.filter(l => { const a = accountById.get(l.accountId); return a && (a.isBank || a.code === "1001"); });
      const nonBankLines = lines.filter(l => { const a = accountById.get(l.accountId); return a && !(a.isBank || a.code === "1001"); });
      const isTransfer = bankLines.length > 0 && nonBankLines.length === 0;
      const isOp = bankLines.length > 0 && !isTransfer && !["CI", "OD", "BT"].includes(t.txnType) && !(t.tags || "").includes("opening-balance");
      if (isOp) {
        opCashIn += bankLines.reduce((s, l) => s + (l.debit || 0), 0);
        opCashOut += bankLines.reduce((s, l) => s + (l.credit || 0), 0);
      }
    }
    const vat = ft.filter(t => !isVATSettlementTxn(t, accounts)).reduce((sum, t) => {
      const out = (t.lines || []).filter(l => l.accountId === outputVATA?.id).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
      const inp = (t.lines || []).filter(l => l.accountId === inputVATA?.id).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
      return sum + (out - inp);
    }, 0);
    const topExpenseCategories = accounts.filter(a => a.type === "Expense")
      .map(a => ({ id: a.id, name: a.name, amount: expByAccount.get(a.id) || 0 }))
      .filter(e => e.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return {
      rev, exp,
      grossCommissionCollected: rev,
      brokerShare: brokerPayout,
      companyNetCommissionRetained: rev - brokerPayout,
      operatingCashFlow: opCashIn - opCashOut,
      vat, topExpenseCategories,
    };
  }, [txns, accounts, dateFilter]);

  // ── Prior-year same period (YoY comparator) ──────────────────────────────
  const priorDateRange = useMemo(() => {
    const shiftY = d => d ? `${parseInt(d.slice(0, 4)) - 1}${d.slice(4)}` : null;
    return { from: shiftY(dateFilter.from), to: shiftY(dateFilter.to) };
  }, [dateFilter.from, dateFilter.to]);

  const priorFilteredKpis = useMemo(() => {
    if (!priorDateRange.from || !priorDateRange.to)
      return { rev: 0, exp: 0, brokerShare: 0, companyNetCommissionRetained: 0, operatingCashFlow: 0 };
    const ft = txns.filter(t => !t.isVoid && (t.date || "") >= priorDateRange.from && (t.date || "") <= priorDateRange.to);
    const accountById = new Map(accounts.map(a => [a.id, a]));
    let rev = 0, exp = 0, brokerPayout = 0, opCashIn = 0, opCashOut = 0;
    for (const t of ft) {
      const lines = t.lines || [];
      for (const l of lines) {
        const a = accountById.get(l.accountId);
        if (!a) continue;
        if (a.type === "Revenue") rev += (l.credit || 0) - (l.debit || 0);
        if (a.type === "Expense") {
          const amt = (l.debit || 0) - (l.credit || 0);
          exp += amt;
          if ((a.name || "").toLowerCase().includes("broker") || (a.code || "").startsWith("55")) brokerPayout += amt;
        }
      }
      const bankLines = lines.filter(l => { const a = accountById.get(l.accountId); return a && (a.isBank || a.code === "1001"); });
      const nonBankLines = lines.filter(l => { const a = accountById.get(l.accountId); return a && !(a.isBank || a.code === "1001"); });
      const isTransfer = bankLines.length > 0 && nonBankLines.length === 0;
      const isOp = bankLines.length > 0 && !isTransfer && !["CI", "OD", "BT"].includes(t.txnType) && !(t.tags || "").includes("opening-balance");
      if (isOp) {
        opCashIn += bankLines.reduce((s, l) => s + (l.debit || 0), 0);
        opCashOut += bankLines.reduce((s, l) => s + (l.credit || 0), 0);
      }
    }
    return { rev, exp, brokerShare: brokerPayout, companyNetCommissionRetained: rev - brokerPayout, operatingCashFlow: opCashIn - opCashOut };
  }, [txns, accounts, priorDateRange.from, priorDateRange.to]);

  const priorCash = useMemo(() => {
    if (!priorDateRange.to) return null;
    const accountById = new Map(accounts.map(a => [a.id, a]));
    let cash = 0;
    txns.filter(t => !t.isVoid && (t.date || "") <= priorDateRange.to).forEach(t => {
      (t.lines || []).forEach(l => {
        const a = accountById.get(l.accountId);
        if (!a || !(a.isBank || a.isCash || a.code === "1001")) return;
        cash += (l.debit || 0) - (l.credit || 0);
      });
    });
    return cash;
  }, [txns, accounts, priorDateRange.to]);

  // Planned expenses KPIs for CEO snapshot
  const avgMonthlyFixed = (plannedExpenses || []).filter(e => e.expenseType === "recurring").reduce((s, e) => s + feComputeMonthlyEquivalent(e), 0);
  const feKpis = useMemo(() => {
    const today = new Date(todayStr() + "T12:00:00");
    const next30 = new Date(today); next30.setDate(next30.getDate() + 30);
    const active = (plannedExpenses || []).filter(e => !["Paid", "Skipped", "Cancelled"].includes(e.status));
    const overdue = active.filter(e => { if (!e.nextDueDate) return false; return new Date(e.nextDueDate + "T12:00:00") < today; });
    const due30 = active.filter(e => { if (!e.nextDueDate) return false; const d = new Date(e.nextDueDate + "T12:00:00"); return d >= today && d <= next30; });
    const totalObligations = overdue.reduce((s, e) => s + (e.amountExpected || 0), 0) + due30.reduce((s, e) => s + (e.amountExpected || 0), 0);
    
    const availableFunds = kpis.cash + (includePending ? (kpis.pendingPipelineCommission * 0.5) : 0);

    // Calculate historical coverage trend
    let runningFunds = availableFunds;
    const coverageSeries = [...kpis.cashFlowSeries].reverse().map((m, i) => {
      const closingCash = i === 0 ? runningFunds : (runningFunds -= kpis.cashFlowSeries[kpis.cashFlowSeries.length - i].net);
      const ratio = avgMonthlyFixed > 0 ? closingCash / avgMonthlyFixed : 0;
      return { label: m.label, ratio };
    }).reverse();

    const currentCoverage = totalObligations > 0 ? (availableFunds / totalObligations) : Infinity;

    return {
      overdueCount: overdue.length, overdueTotal: overdue.reduce((s, e) => s + (e.amountExpected || 0), 0),
      next30Count: due30.length, next30Total: due30.reduce((s, e) => s + (e.amountExpected || 0), 0),
      coverageRatio: currentCoverage,
      coverageSeries,
      maxRatio: Math.max(2, ...coverageSeries.map(s => s.ratio))
    };
  }, [plannedExpenses, includePending, kpis.cash, kpis.pendingPipelineCommission, kpis.cashFlowSeries]);
  const sectionTitle = (title, sub, actionLabel, actionPage) => <div style={{ padding: "16px 20px 13px", borderBottom: "1px solid #EAECF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
    <div>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: dark ? "#F1F3F9" : NAVY, letterSpacing: "-0.01em" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 3 }}>{sub}</div>}
    </div>
    {actionLabel && <button style={C.btn("ghost", true)} onClick={() => setPage(actionPage)}>{actionLabel}</button>}
  </div>;
  const categoryDivider = (title, sub, color) => <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 14px", padding: "0 2px" }}>
    <div style={{ width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
    <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.13em", color }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: "#EAECF0" }} />
    <span style={{ fontSize: 11, color: "#98A2B3", maxWidth: 340, textAlign: "right", lineHeight: 1.4, display: isTablet ? "none" : "block" }}>{sub}</span>
  </div>;
  const metricTile = ({ label, value, sub, accent, onClick, rawValue, prevValue, higherIsBetter, alertLevel, timeBasis }) => {
    const COMPANY_START = "2025-01-01"; // company did not exist before this date
    const priorRangeValid = priorDateRange.from && priorDateRange.to &&
      priorDateRange.to >= COMPANY_START; // hide comparator if prior period is entirely before company start
    const hasComp = priorRangeValid && prevValue !== null && prevValue !== undefined && rawValue !== null && rawValue !== undefined;
    const variance = hasComp ? rawValue - prevValue : 0;
    const pct = hasComp && prevValue !== 0 ? (variance / Math.abs(prevValue)) * 100 : null;
    const varGood = higherIsBetter !== undefined ? (higherIsBetter ? variance >= 0 : variance <= 0) : variance >= 0;
    const varColor = variance === 0 ? "#98A2B3" : (varGood ? "#059669" : "#DC2626");
    const varArrow = variance === 0 ? "●" : (variance > 0 ? "▲" : "▼");
    // Show full prior date range so user knows exactly what dates are being compared
    const shortDate = d => { if (!d) return ""; const p = d.split("-"); return `${p[2] || ""}/${p[1] || ""}/${(p[0] || "").slice(2)}`; };
    const priorFromY = priorDateRange.from ? priorDateRange.from.slice(0, 4) : "";
    const priorToY = priorDateRange.to ? priorDateRange.to.slice(0, 4) : "";
    const priorLabel = priorFromY === priorToY
      ? `${shortDate(priorDateRange.from)} – ${shortDate(priorDateRange.to)}`
      : `${shortDate(priorDateRange.from)} – ${shortDate(priorDateRange.to)}`;
    // Alert-level overrides
    const isCritical = alertLevel === "critical";
    const isWarning = alertLevel === "warning";
    const bgColor = isCritical ? "#FFF1F1" : isWarning ? "#FFFBEB" : "#ffffff";
    const borderColor = isCritical ? "#FECACA" : isWarning ? "#FDE68A" : "#EAECF0";
    const accentBar = isCritical ? "#DC2626" : isWarning ? "#F59E0B" : accent;
    const valueColor = isCritical ? "#991B1B" : isWarning ? "#92400E" : (dark ? "#E8EAF2" : NAVY);
    return <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 14, boxShadow: isCritical ? "0 0 0 2px #DC262620" : "0 1px 3px rgba(16,24,40,.06)", padding: "20px 20px 16px", position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "box-shadow .2s, transform .2s" }} onClick={onClick || undefined} onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = "0 8px 24px rgba(16,24,40,.12)"; e.currentTarget.style.transform = "translateY(-1px)"; } }} onMouseLeave={e => { e.currentTarget.style.boxShadow = isCritical ? "0 0 0 2px #DC262620" : "0 1px 3px rgba(16,24,40,.06)"; e.currentTarget.style.transform = "none"; }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentBar, borderRadius: "14px 14px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.09em", color: isCritical ? "#EF4444" : isWarning ? "#D97706" : "#98A2B3", fontWeight: 600 }}>{label}</div>
        {timeBasis && <span style={{ fontSize: 9.5, color: timeBasis === "balance" ? "#6B7280" : "#2563EB", background: timeBasis === "balance" ? "#F3F4F6" : "#EFF6FF", padding: "2px 6px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap" }}>{timeBasis === "balance" ? "As of today" : "Period"}</span>}
        {(isCritical || isWarning) && <span style={{ fontSize: 11, marginLeft: 4 }}>{isCritical ? "🔴" : "⚠️"}</span>}
      </div>
      <div style={{ fontSize: 25, fontWeight: 700, color: valueColor, lineHeight: 1.1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hasComp && <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${isCritical ? "#FECACA" : "#EAECF0"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: "#98A2B3", fontVariantNumeric: "tabular-nums" }}>Prior ({priorLabel}): {fmtAED(prevValue)}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: varColor, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {varArrow} {variance >= 0 ? "+" : ""}{fmtAED(variance)}
            {pct !== null && <span style={{ fontSize: 9.5, marginLeft: 4, opacity: 0.85 }}>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
          </span>
        </div>
      </div>}
      <div style={{ fontSize: 12, color: isCritical ? "#DC2626" : isWarning ? "#B45309" : "#98A2B3", marginTop: 8, lineHeight: 1.5 }}>{sub}</div>
    </div>;
  };
  const liabilitiesRatio = Math.max(0, Math.round((kpis.totalLiabilities / Math.max(kpis.totalAssets, 1)) * 100));
  const collectedRatio = deals.length ? Math.round((kpis.collectedDealsCount / deals.length) * 100) : 0;
  const avgOpenDealCommission = kpis.openDealsCount > 0 ? fmtAED(Math.round(kpis.pendingPipelineCommission / kpis.openDealsCount)) : "AED 0.00";
  const obligationCoverageLabel = feKpis.coverageRatio === Infinity ? "Fully covered" : `${feKpis.coverageRatio.toFixed(1)}x`;
  const periodLabel = dateFilter.from && dateFilter.to ? `${dateFilter.from} → ${dateFilter.to}` : "Selected period";
  const liquidityMetrics = [
    { label: "Cash & Bank", value: fmtAED(kpis.cash), sub: "Available liquidity — current balance", accent: "#2563EB", rawValue: kpis.cash, prevValue: priorCash, higherIsBetter: true, timeBasis: "balance" },
    { label: "Operating Cash Flow", value: fmtAED(filteredKpis.operatingCashFlow), sub: periodLabel, accent: filteredKpis.operatingCashFlow >= 0 ? "#059669" : "#DC2626", rawValue: filteredKpis.operatingCashFlow, prevValue: priorFilteredKpis.operatingCashFlow, higherIsBetter: true, timeBasis: "period" },
    { label: "Gross Commission", value: fmtAED(filteredKpis.rev), sub: periodLabel, accent: filteredKpis.rev >= 0 ? "#0F766E" : "#B91C1C", rawValue: filteredKpis.rev, prevValue: priorFilteredKpis.rev, higherIsBetter: true, timeBasis: "period" },
    { label: includePending ? "Projected Runway" : "Cash Runway", value: projectedRunway === Infinity ? "✓ Healthy" : `${projectedRunway.toFixed(1)} months`, sub: projectedRunway !== Infinity && projectedRunway < 3 ? (projectedRunway < 1 ? "Immediate action required — less than 1 month left" : "Below safe threshold — target 3+ months") : (includePending ? "Assumes 50% pipeline collection" : "Cash ÷ avg monthly expense"), accent: runwayAlertLevel === "critical" ? "#DC2626" : runwayAlertLevel === "warning" ? "#F59E0B" : "#059669", alertLevel: runwayAlertLevel, timeBasis: "balance" },
  ];
  const profitabilityMetrics = [
    { label: "Broker Share", value: fmtAED(filteredKpis.brokerShare), sub: "Commission paid to brokers — period", accent: "#D97706", rawValue: filteredKpis.brokerShare, prevValue: priorFilteredKpis.brokerShare, higherIsBetter: false, timeBasis: "period" },
    { label: "Net Company Commission", value: fmtAED(filteredKpis.companyNetCommissionRetained), sub: "Gross commission retained — before overhead", accent: filteredKpis.companyNetCommissionRetained >= 0 ? "#059669" : "#DC2626", rawValue: filteredKpis.companyNetCommissionRetained, prevValue: priorFilteredKpis.companyNetCommissionRetained, higherIsBetter: true, timeBasis: "period" },
    { label: "Total Expenses", value: fmtAED(filteredKpis.exp), sub: periodLabel, accent: "#6B7280", rawValue: filteredKpis.exp, prevValue: priorFilteredKpis.exp, higherIsBetter: false, timeBasis: "period" },
    { label: "Net Income", value: fmtAED(filteredKpis.rev - filteredKpis.exp), sub: periodLabel, accent: (filteredKpis.rev - filteredKpis.exp) >= 0 ? NAVY : "#DC2626", rawValue: filteredKpis.rev - filteredKpis.exp, prevValue: priorFilteredKpis.rev - priorFilteredKpis.exp, higherIsBetter: true, timeBasis: "period" },
  ];
  const controlMetrics = [
    { label: "Net VAT Position", value: fmtAED(filteredKpis.vat), sub: filteredKpis.vat >= 0 ? "Payable to FTA — review before filing" : "Recoverable from FTA", accent: filteredKpis.vat >= 0 ? "#DC2626" : "#059669", timeBasis: "period" },
    { label: "Liabilities Load", value: liabilitiesRatio > 0 ? `${liabilitiesRatio}%` : "—", sub: liabilitiesRatio > 0 ? "Share of total assets funded by liabilities" : "No liabilities recorded yet", accent: liabilitiesRatio > 60 ? "#DC2626" : "#2563EB", timeBasis: "balance" },
    { label: "Overdue Expenses", value: feKpis.overdueCount > 0 ? fmtAED(feKpis.overdueTotal) : "None", sub: feKpis.overdueCount > 0 ? `${feKpis.overdueCount} planned item${feKpis.overdueCount > 1 ? "s" : ""} past due date` : "All planned expenses on schedule", accent: feKpis.overdueCount > 0 ? "#DC2626" : "#059669", alertLevel: feKpis.overdueCount > 0 ? "warning" : null, onClick: () => setPage("futureExpenses") },
    { label: "Due Next 30 Days", value: feKpis.next30Count > 0 ? fmtAED(feKpis.next30Total) : "None", sub: `${feKpis.next30Count} item${feKpis.next30Count !== 1 ? "s" : ""} due — Coverage ${obligationCoverageLabel}`, accent: feKpis.next30Count > 0 ? "#F59E0B" : "#059669", onClick: () => setPage("futureExpenses") },
  ];
  const pipelineMetrics = [
    { label: "Pending Pipeline", value: fmtAED(kpis.pendingPipelineCommission), sub: "Projected — not yet collected", accent: GOLD, timeBasis: "balance" },
    { label: "Open Deals", value: kpis.openDealsCount, sub: "Deals progressing through the funnel", accent: "#7C3AED", timeBasis: "balance" },
    { label: "Collected Ratio", value: `${collectedRatio}%`, sub: `${kpis.collectedDealsCount} of ${deals.length} deals fully collected`, accent: collectedRatio >= 50 ? "#059669" : "#2563EB" },
    { label: "Avg. Pending / Deal", value: avgOpenDealCommission, sub: "Avg. expected commission per open deal", accent: "#2563EB" },
  ];

  return <div>
    <PageHeader title="Dashboard" sub={`Nasama Properties — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}>
      <button style={C.btn("ghost", true)} onClick={() => setPage("reports")}>Financial Reports</button>
      <button style={C.btn("ghost", true)} onClick={() => setPage("banking")}>Cash Movement</button>
    </PageHeader>
    <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />

    {/* ── Alert Strip ── */}
    {(() => {
      const alerts = [];
      if (runwayAlertLevel === "critical") alerts.push({ level: "critical", msg: `Cash Runway: ${projectedRunway.toFixed(1)} months — immediate action required. Review expenses or secure funding.`, action: { label: "Review Expenses", page: "futureExpenses" } });
      else if (runwayAlertLevel === "warning") alerts.push({ level: "warning", msg: `Cash Runway: ${projectedRunway.toFixed(1)} months — below safe threshold of 3 months.`, action: { label: "Review Expenses", page: "futureExpenses" } });
      if (kpis.cash < 0) alerts.push({ level: "critical", msg: `Negative total cash balance: ${fmtAED(kpis.cash)}. Check account entries immediately.` });
      if (feKpis.overdueCount > 0) alerts.push({ level: "warning", msg: `${feKpis.overdueCount} planned expense${feKpis.overdueCount > 1 ? "s" : ""} are overdue — ${fmtAED(feKpis.overdueTotal)} total unpaid.`, action: { label: "View Overdue", page: "futureExpenses" } });
      if (alerts.length === 0) return null;
      const hasCritical = alerts.some(a => a.level === "critical");
      return <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${hasCritical ? "#FECACA" : "#FDE68A"}`, background: hasCritical ? "#FEF2F2" : "#FFFBEB" }}>
        {alerts.map((a, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < alerts.length - 1 ? `1px solid ${a.level === "critical" ? "#FECACA" : "#FDE68A"}` : "none" }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>{a.level === "critical" ? "🔴" : "⚠️"}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: a.level === "critical" ? "#991B1B" : "#92400E", flex: 1 }}>{a.msg}</span>
          {a.action && <button onClick={() => setPage(a.action.page)} style={{ flexShrink: 0, fontSize: 11, padding: "4px 12px", borderRadius: 6, border: `1px solid ${a.level === "critical" ? "#DC2626" : "#D97706"}`, background: "white", color: a.level === "critical" ? "#DC2626" : "#D97706", cursor: "pointer", fontWeight: 700 }}>{a.action.label}</button>}
        </div>)}
      </div>;
    })()}

    {/* ── Hero ── */}
    <div style={{ ...C.card, marginBottom: 20, padding: "24px 28px", background: "linear-gradient(140deg, #080C1A 0%, #0F2748 52%, #0A4D44 100%)", color: "#FFFFFF", border: "none", position: "relative", overflow: "hidden", boxShadow: "0 12px 36px rgba(8,12,26,.28)" }}>
      <div style={{ position: "absolute", top: -60, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(201,160,68,.07)" }} />
      <div style={{ position: "absolute", bottom: -50, left: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,.03)" }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: GOLD, fontWeight: 700, marginBottom: 10, opacity: 0.85 }}>Management Cockpit — {periodLabel}</div>
        <div style={{ fontSize: isTablet ? 22 : 27, fontWeight: 700, lineHeight: 1.18, marginBottom: 10, letterSpacing: "-0.02em" }}>
          {filteredKpis.rev - filteredKpis.exp >= 0 ? "Operations are profitable this period." : "Expenses are exceeding revenue this period."}
          {runwayAlertLevel === "critical" && <span style={{ marginLeft: 14, fontSize: 14, fontWeight: 600, color: "#FCA5A5" }}>⚠ Runway critical</span>}
          {runwayAlertLevel === "warning" && <span style={{ marginLeft: 14, fontSize: 14, fontWeight: 600, color: "#FCD34D" }}>⚠ Runway low</span>}
        </div>
        {isMobile
          ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 16 }}>
              {[
                { label: "Net Income", value: fmtAED(filteredKpis.rev - filteredKpis.exp), color: (filteredKpis.rev - filteredKpis.exp) >= 0 ? "#6EE7B7" : "#FCA5A5" },
                { label: "Cash Flow", value: fmtAED(filteredKpis.operatingCashFlow), color: filteredKpis.operatingCashFlow >= 0 ? "#6EE7B7" : "#FCA5A5" },
                { label: "Pipeline", value: fmtAED(kpis.pendingPipelineCommission), color: GOLD },
                { label: "Net Commission", value: fmtAED(filteredKpis.companyNetCommissionRetained), color: "#93C5FD" },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,.5)", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
                </div>
              ))}
            </div>
          : <div style={{ fontSize: 13.5, color: "#D1D5DB", maxWidth: 820, lineHeight: 1.72, marginBottom: 16 }}>
              Cash flow from operations: <strong style={{ color: filteredKpis.operatingCashFlow >= 0 ? "#6EE7B7" : "#FCA5A5" }}>{fmtAED(filteredKpis.operatingCashFlow)}</strong>. Net commission retained: <strong style={{ color: "#93C5FD" }}>{fmtAED(filteredKpis.companyNetCommissionRetained)}</strong>. Net income: <strong style={{ color: (filteredKpis.rev - filteredKpis.exp) >= 0 ? "#6EE7B7" : "#FCA5A5" }}>{fmtAED(filteredKpis.rev - filteredKpis.exp)}</strong>. Pipeline: <strong style={{ color: GOLD }}>{fmtAED(kpis.pendingPipelineCommission)}</strong> projected.
            </div>
        }
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ label: "Liquidity", tone: "#93C5FD" }, { label: "Profitability", tone: "#6EE7B7" }, { label: "Control", tone: "#FCA5A5" }, { label: "Pipeline", tone: GOLD }].map(item => <span key={item.label} style={{ padding: "4px 11px", borderRadius: 999, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.06)", color: item.tone, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>{item.label}</span>)}
        </div>
      </div>
    </div>

    {categoryDivider("Liquidity", "Can the business fund itself and keep cash moving in the right direction?", "#2563EB")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
      {liquidityMetrics.map(item => <div key={item.label}>{metricTile({ ...item })}</div>)}
    </div>

    {categoryDivider("Profitability", "What the brokerage collects, pays out to brokers, and retains.", "#059669")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
      {profitabilityMetrics.map(item => <div key={item.label}>{metricTile({ ...item })}</div>)}
    </div>

    {categoryDivider("Control / Compliance", "VAT exposure, liabilities, and upcoming obligations.", "#DC2626")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
      {controlMetrics.map(item => <div key={item.label}>{metricTile({ ...item })}</div>)}
    </div>

    {categoryDivider("Pipeline Quality", "Commission funnel health and conversion into collected revenue.", "#7C3AED")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
      {pipelineMetrics.map(item => <div key={item.label}>{metricTile({ ...item })}</div>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.1fr 1.1fr 0.9fr", gap: 16, marginBottom: 16 }}>
      <div style={C.card}>
        {sectionTitle("Cash Flow Trend", "6 months · inflow vs outflow · net highlighted")}
        <div style={{ padding: "10px 18px 18px" }}>
          {kpis.cashFlowSeries.map((item, i) => <div key={item.key} style={{ marginBottom: i < kpis.cashFlowSeries.length - 1 ? 18 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{item.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98A2B3", fontWeight: 500 }}>Net</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: item.net >= 0 ? "#059669" : "#DC2626", fontVariantNumeric: "tabular-nums" }}>{item.net >= 0 ? "+" : ""}{fmtAED(item.net)}</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#6B7280", marginBottom: 4 }}><span>↑ Cash in</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtAED(item.inflow)}</span></div>
                <div style={{ height: 10, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.inflow / maxCashFlow) * 100)}%`, height: "100%", background: "#34D399", transition: "width .4s" }} /></div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#6B7280", marginBottom: 4 }}><span>↓ Cash out</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtAED(item.outflow)}</span></div>
                <div style={{ height: 10, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.outflow / maxCashFlow) * 100)}%`, height: "100%", background: item.outflow > item.inflow ? "#F87171" : "#FCA5A5", transition: "width .4s" }} /></div>
              </div>
            </div>
          </div>)}
        </div>
      </div>

      <div style={C.card}>
        {sectionTitle("Revenue vs Expense", "6 months · profit highlighted in green, loss in red")}
        <div style={{ padding: "10px 18px 18px" }}>
          {kpis.monthlyPerformance.map((item, i) => <div key={item.key} style={{ marginBottom: i < kpis.monthlyPerformance.length - 1 ? 18 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{item.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98A2B3", fontWeight: 500 }}>Net</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: item.net >= 0 ? "#059669" : "#DC2626", fontVariantNumeric: "tabular-nums" }}>{item.net >= 0 ? "+" : ""}{fmtAED(item.net)}</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#6B7280", marginBottom: 4 }}><span>Revenue</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtAED(item.revenue)}</span></div>
                <div style={{ height: 10, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.revenue / maxPerformance) * 100)}%`, height: "100%", background: "#38BDF8", transition: "width .4s" }} /></div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#6B7280", marginBottom: 4 }}><span>Expenses</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtAED(item.expense)}</span></div>
                <div style={{ height: 10, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.expense / maxPerformance) * 100)}%`, height: "100%", background: item.expense > item.revenue ? "#F87171" : "#FBD38D", transition: "width .4s" }} /></div>
              </div>
            </div>
          </div>)}
        </div>
      </div>

      <div style={C.card}>
        {sectionTitle("Liquidity - Cash Coverage Trend", "Liquidity vs average fixed costs over the last 6 months")}
        <div style={{ padding: "0 18px", display: "flex", alignItems: "center", gap: 8, marginTop: -5, marginBottom: 5 }}>
          <input id="toggle-pending" type="checkbox" checked={includePending} onChange={e => setIncludePending(e.target.checked)} style={{ cursor: "pointer" }} />
          <label htmlFor="toggle-pending" style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>
            Include Pending Commission (50% Collection Projection)
          </label>
        </div>
        <div style={{ padding: 18, display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 180, gap: 10 }}>
          {feKpis.coverageSeries.map((s, i) => {
            const heightPct = Math.min(100, (s.ratio / feKpis.maxRatio) * 100);
            const isHealthy = s.ratio >= 1.2;
            const isWarning = s.ratio > 0 && s.ratio < 1.1;
            return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: isHealthy ? "#059669" : isWarning ? "#DC2626" : "#6B7280" }}>
                {s.ratio.toFixed(1)}x
              </div>
              <div style={{ 
                width: "100%", 
                height: `${heightPct}%`, 
                minHeight: 4,
                background: isHealthy ? "#86EFAC" : isWarning ? "#FCA5A5" : "#CBD5E1", 
                borderRadius: "4px 4px 0 0",
                transition: "height 0.5s ease"
              }} />
              <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>{s.label}</div>
            </div>;
          })}
        </div>
      </div>

      <div style={C.card}>
        {sectionTitle("Liquidity - Cash by Account", "Live balances from bank and cash ledger", "Go to Banking", "banking")}
        <div style={{ padding: "8px 18px" }}>
          {cashAccounts.map((a, i) => {
            const bal = accountBalance(a, ledger);
            return <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < cashAccounts.length - 1 ? "1px solid #F3F4F6" : "none", fontSize: 13, gap: 12 }}>
              <span style={{ color: "#374151" }}>{a.name}</span>
              <span style={{ fontWeight: 700, color: bal >= 0 ? "#059669" : "#DC2626", whiteSpace: "nowrap" }}>{fmtAED(bal)}</span>
            </div>;
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 8px", fontSize: 14, fontWeight: 800 }}>
            <span>Total Cash</span>
            <span style={{ color: "#2563EB" }}>{fmtAED(kpis.cash)}</span>
          </div>
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr 1.1fr", gap: 16, marginBottom: 16 }}>
      <div style={C.card}>
        {sectionTitle("Pipeline Quality - By Type", "Expected commission still in the business pipeline", "Open Deals", "deals")}
        <div style={{ padding: 18 }}>
          {kpis.pipelineByType.map((row, i) => <div key={row.type} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", paddingBottom: 10, marginBottom: 10, borderBottom: i < kpis.pipelineByType.length - 1 ? "1px solid #F3F4F6" : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{row.type}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{row.count} deals</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{fmtAED(row.expected)}</div>
          </div>)}
        </div>
      </div>

      <div style={C.card}>
        {sectionTitle("Pipeline Quality - By Stage", "Where expected commission is currently sitting")}
        <div style={{ padding: 18 }}>
          {kpis.pipelineStageValue.map((row, i) => <div key={row.stage} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", paddingBottom: 10, marginBottom: 10, borderBottom: i < kpis.pipelineStageValue.length - 1 ? "1px solid #F3F4F6" : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{row.stage}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{row.count} deals</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: row.stage === "Commission Collected" ? "#059669" : "#2563EB" }}>{fmtAED(row.expected)}</div>
          </div>)}
        </div>
      </div>

      <div style={C.card}>
        {sectionTitle("Control / Profitability - Top Expense Categories", `Spend concentration — ${periodLabel}`, "Open Payments", "payments")}
        <div style={{ padding: 18 }}>
          {filteredKpis.topExpenseCategories.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "18px 0" }}>No expense activity for this period.</div>}
          {filteredKpis.topExpenseCategories.map((row, i) => {
            const topBase = Math.max(filteredKpis.topExpenseCategories[0]?.amount || 1, 1);
            return <div key={row.id} style={{ marginBottom: i < filteredKpis.topExpenseCategories.length - 1 ? 14 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 5 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{row.name}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706" }}>{fmtAED(row.amount)}</div>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "#F3F4F6", overflow: "hidden" }}><div style={{ width: `${Math.max(6, (row.amount / topBase) * 100)}%`, height: "100%", background: "#D97706" }} /></div>
            </div>;
          })}
        </div>
      </div>
    </div>

    <div style={C.card}>
      <div style={{ padding: "14px 20px 13px", borderBottom: showRecentTxns ? "1px solid #EAECF0" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setShowRecentTxns(v => !v)}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: NAVY, letterSpacing: "-0.01em" }}>Recent Transactions</div>
          <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 3 }}>{recentTxns.length} latest entries for {periodLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={C.btn("ghost", true)} onClick={e => { e.stopPropagation(); setPage("journal"); }}>Open Journal</button>
          <span style={{ fontSize: 18, color: "#98A2B3", userSelect: "none", lineHeight: 1 }}>{showRecentTxns ? "▲" : "▼"}</span>
        </div>
      </div>
      {showRecentTxns && <div style={{ padding: "4px 18px 12px" }}>
        {recentTxns.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF", fontSize: 13 }}>No transactions yet. Start by recording a sale receipt or payment.</div>}
        {recentTxns.map((t, i) => {
          const typeInfo = TXN_TYPES[t.txnType] || { label: t.txnType || "JV" };
          const total = (t.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0);
          return <div key={t.id || i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr auto auto", gap: 12, alignItems: "center", padding: "11px 0", borderBottom: i < recentTxns.length - 1 ? "1px solid #F3F4F6" : "none", fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 700, color: NAVY }}>{t.description || "Manual journal entry"}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{fmtDate(t.date)} · {typeInfo.label} · {t.counterparty || "Internal"}</div>
            </div>
            <span style={{ ...C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "info"), justifySelf: isMobile ? "start" : "center" }}>{t.ref}</span>
            <div style={{ fontWeight: 700, color: "#374151", textAlign: isMobile ? "left" : "right" }}>{fmtAED(total || 0)}</div>
          </div>;
        })}
      </div>}
    </div>
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  USER MANUAL PAGE
// ╚══════════════════════════════════════════════════╝
function ManualPage() {
  return <div>
    <PageHeader title="User Manual" sub="Complete guide to using the accounting system" />
    <div style={{ ...C.card, padding: 24, maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: GOLD }}>📝 How to Enter Sales (Receipts)</h3>
        <ol style={{ paddingLeft: 24, lineHeight: 1.6 }}>
          <li>Navigate to the <strong>Receipts</strong> page from the sidebar.</li>
          <li>Click <strong>+ Add New</strong> to create a new sale receipt.</li>
          <li>Select an existing <strong>Deal</strong> from the dropdown (or create a new deal first).</li>
          <li>Enter the <strong>Gross Amount</strong> received from the client.</li>
          <li>The system automatically calculates VAT (5%) and net revenue.</li>
          <li>Choose the <strong>Bank Account</strong> where the money was deposited.</li>
          <li>Add a <strong>Memo</strong> for reference.</li>
          <li>Click <strong>Save Receipt</strong> to post the transaction.</li>
          <li>The system creates a journal entry: DR Bank, CR Revenue, CR Output VAT.</li>
        </ol>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: GOLD }}>💳 How to Enter Expenses (Payments)</h3>
        <ol style={{ paddingLeft: 24, lineHeight: 1.6 }}>
          <li>Navigate to the <strong>Payments</strong> page from the sidebar.</li>
          <li>Click <strong>+ Add New</strong> to create a new payment voucher.</li>
          <li>Select the <strong>Expense Account</strong> from the dropdown (e.g., Office Rent, Salaries).</li>
          <li>Enter the <strong>Gross Amount</strong> of the expense.</li>
          <li>If applicable, enter the <strong>VAT Rate</strong> (usually 5% for recoverable VAT).</li>
          <li>Choose the <strong>Bank Account</strong> to pay from.</li>
          <li>Select the <strong>Counterparty</strong> (vendor or employee).</li>
          <li>Add a <strong>Memo</strong> describing the expense.</li>
          <li>Click <strong>Save Payment</strong> to post the transaction.</li>
          <li>The system creates: DR Expense (net), DR Input VAT (if applicable), CR Bank.</li>
        </ol>
      </div>

      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: GOLD }}>🗂️ Chart of Accounts Definitions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#2563EB" }}>Assets (1000s)</h4>
            <p style={{ fontSize: 13, marginBottom: 12, color: "#6B7280" }}>Resources owned by the company.</p>
            <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
              <li><strong>1001 Cash:</strong> Physical cash on hand.</li>
              <li><strong>1002 Bank:</strong> Bank account balances.</li>
              <li><strong>1004 Prepaid Expenses:</strong> Payments made for future services.</li>
              <li><strong>1201 Input VAT:</strong> VAT paid on purchases, recoverable from government.</li>
              <li><strong>1500-1510 Fixed Assets:</strong> Long-term tangible assets like furniture and computers.</li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#7C3AED" }}>Liabilities (2000s)</h4>
            <p style={{ fontSize: 13, marginBottom: 12, color: "#6B7280" }}>Amounts owed to others.</p>
            <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
              <li><strong>2101 Output VAT:</strong> VAT collected on sales, payable to government.</li>
              <li><strong>2105 VAT Rounding:</strong> Adjustment for VAT calculation rounding.</li>
              <li><strong>2200 Loan Payable:</strong> Outstanding loan balances.</li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#059669" }}>Equity (3000s)</h4>
            <p style={{ fontSize: 13, marginBottom: 12, color: "#6B7280" }}>Owner's stake in the company.</p>
            <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
              <li><strong>3000 Capital Injection:</strong> Money invested by owners.</li>
              <li><strong>3002 Retained Earnings:</strong> Accumulated profits.</li>
              <li><strong>3100 Owner Drawings:</strong> Money taken out by owners.</li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#D97706" }}>Revenue (4000s)</h4>
            <p style={{ fontSize: 13, marginBottom: 12, color: "#6B7280" }}>Income from business activities.</p>
            <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
              <li><strong>4000 Developer Commission:</strong> Fees from off-plan property sales.</li>
              <li><strong>4010 Seller Commission:</strong> Fees from secondary market sales.</li>
              <li><strong>4020 Rental Commission:</strong> Fees from rental property transactions.</li>
            </ul>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#DC2626" }}>Expenses (5000s-6000s)</h4>
            <p style={{ fontSize: 13, marginBottom: 12, color: "#6B7280" }}>Costs of running the business.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
              <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
                <li><strong>5000-5020 Salaries:</strong> Compensation for employees and managers.</li>
                <li><strong>5030 Broker Incentive:</strong> Bonuses for top performers.</li>
                <li><strong>5100-5160 Office Expenses:</strong> Rent, utilities, supplies, cleaning.</li>
                <li><strong>5200-5220 Marketing:</strong> Advertising and promotional costs.</li>
              </ul>
              <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
                <li><strong>5300 Transportation:</strong> Travel and vehicle expenses.</li>
                <li><strong>5400-5410 Accounting:</strong> Professional accounting services.</li>
                <li><strong>5500-5510 Broker Payments:</strong> Commissions paid to external brokers.</li>
                <li><strong>5600 Bank Fees:</strong> Charges from banking services.</li>
                <li><strong>6000 Legal Services:</strong> Legal fees and consultations.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  DEALS PAGE
// ╚══════════════════════════════════════════════════╝
function DealsPage({ deals, setDeals, customers, brokers, developers, txns, userRole, userEmail, writeMeta }) {
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState("All");
  const [sortKey, setSortKey] = useState("property");
  const [sortDir, setSortDir] = useState("asc");
  const [dealMutationLabel, setDealMutationLabel] = useState("");
  const empty = { type: "Off-Plan", stage: "Lead", property_name: "", developer: "", developer_id: "", broker_id: "", broker_name: "", customer_id: "", client_name: "", transaction_value: 0, commission_pct: "", expected_commission_net: 0, vat_applicable: true, unit_no: "", notes: "", created_at: todayStr() };
  const pipelineSeedDeals = window.PASTED_DEALS || [];
  const dealWriteState = writeMeta?.deals || { status: "idle" };
  const missingPipelineDeals = useMemo(() => findMissingPipelineDeals(deals, pipelineSeedDeals), [deals, pipelineSeedDeals]);
  const duplicateGroups = useMemo(() => {
    const groups = new Map();
    (deals || []).forEach(deal => {
      const key = dealImportKey(deal);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(deal);
    });
    return [...groups.values()].filter(group => group.length > 1);
  }, [deals]);
  const duplicateDealCount = duplicateGroups.reduce((sum, group) => sum + (group.length - 1), 0);
  const dedupePreview = useMemo(() => dedupeDealsByImportKey(deals, txns), [deals, txns]);
  const targetCountsMatch = ["Off-Plan", "Secondary", "Rental"].every(type => (dedupePreview.counts[type] || 0) === TARGET_DEAL_COUNTS[type]);

  useEffect(() => {
    const h = () => { setEdit(null); setShow(true); };
    document.addEventListener("add-deal", h);
    return () => document.removeEventListener("add-deal", h);
  }, []);

  const inferLinkedRecord = (items, id, fallbackName) => {
    if (id) {
      const byId = items.find(x => x.id === id);
      if (byId) return byId;
    }
    const wanted = normDealText(fallbackName);
    if (!wanted) return null;
    const matches = items.filter(x => normDealText(x.name) === wanted);
    return matches.length === 1 ? matches[0] : null;
  };

  const normalizeLinkedDealRefs = (deal) => {
    const normalized = { ...deal };
    const selectedDeveloper = inferLinkedRecord(developers, normalized.developer_id, normalized.developer);
    const selectedBroker = inferLinkedRecord(brokers, normalized.broker_id, normalized.broker_name);
    const selectedCustomer = inferLinkedRecord(customers, normalized.customer_id, normalized.client_name);

    normalized.developer_id = selectedDeveloper ? selectedDeveloper.id : "";
    normalized.developer = selectedDeveloper ? selectedDeveloper.name : "";
    normalized.broker_id = selectedBroker ? selectedBroker.id : "";
    normalized.broker_name = selectedBroker ? selectedBroker.name : "";
    normalized.customer_id = selectedCustomer ? selectedCustomer.id : "";
    normalized.client_name = selectedCustomer ? selectedCustomer.name : "";
    return normalized;
  };

  const normalizedDeals = useMemo(() => (deals || []).map(normalizeLinkedDealRefs), [deals, customers, brokers, developers]);
  const corruptedLinkCount = useMemo(() => (deals || []).reduce((count, deal, index) => {
    const normalized = normalizedDeals[index];
    if (!normalized) return count;
    const changed =
      (deal.developer_id || "") !== (normalized.developer_id || "") ||
      (deal.developer || "") !== (normalized.developer || "") ||
      (deal.broker_id || "") !== (normalized.broker_id || "") ||
      (deal.broker_name || "") !== (normalized.broker_name || "") ||
      (deal.customer_id || "") !== (normalized.customer_id || "") ||
      (deal.client_name || "") !== (normalized.client_name || "");
    return count + (changed ? 1 : 0);
  }, 0), [deals, normalizedDeals]);

  const save = (d) => {
    const normalized = normalizeLinkedDealRefs(d);
    const actionLabel = normalized.id ? "Deal update" : "Deal creation";
    setDealMutationLabel(actionLabel);
    if (normalized.id) setDeals(prev => prev.map(x => x.id === normalized.id ? normalized : x));
    else setDeals(prev => [...prev, { ...normalized, id: uid() }]);
    setShow(false); setEdit(null);
    toast(normalized.id ? "Deal updated" : "Deal created", "success");
    logAudit(normalized.id ? "deal_update" : "deal_create", { dealId: normalized.id || null, deal: normalized }, userRole, userEmail);
  };
  const seedMissingPipelineDeals = () => {
    if (!DEAL_RESEED_ENABLED) { toast("Deal reseed is disabled. Firestore is now the source of truth for deals.", "warning"); return; }
    if (!pipelineSeedDeals.length) { toast("No pipeline seed data loaded", "warning"); return; }
    if (!missingPipelineDeals.length) { toast("All pasted pipeline deals are already in the database", "success"); return; }
    setDealMutationLabel("Deal reseed");
    setDeals(prev => [...prev, ...findMissingPipelineDeals(prev, pipelineSeedDeals)]);
    toast(`Seeded ${missingPipelineDeals.length} missing deals to Firestore`, "success");
    logAudit("deal_reseed", { inserted: missingPipelineDeals.length }, userRole, userEmail);
  };
  const handleDelete = async (deal) => {
    const linkedTxns = (txns || []).filter(t => t.deal_id === deal.id && !t.isVoid);
    const warningMessage = [
      "Permanently delete this deal from the backend database?",
      `${deal.property_name || "Unnamed deal"}${deal.client_name ? ` | ${deal.client_name}` : ""}`,
      linkedTxns.length
        ? `Warning: ${linkedTxns.length} linked transaction(s) will NOT be deleted and may become orphaned.`
        : "Warning: this action cannot be undone."
    ].join("\n\n");
    if (!confirm(warningMessage)) return;
    try {
      await archiveDeletedDeals([deal], "manual-delete", userRole, userEmail, { linked_transaction_ids: linkedTxns.map(t => t.id) });
    } catch (err) {
      toast(`Delete archive failed: ${err.message}`, "error");
      return;
    }
    setDealMutationLabel("Deal deletion");
    setDeals(prev => prev.filter(x => x.id !== deal.id));
    if (edit?.id === deal.id) { setEdit(null); setShow(false); }
    toast("Deal permanently deleted", "success");
    logAudit("deal_delete", { dealId: deal.id, linkedTransactionIds: linkedTxns.map(t => t.id) }, userRole, userEmail);
  };
  const handleDeduplicate = async () => {
    if (!duplicateDealCount) { toast("No duplicate deals found", "success"); return; }
    const preview = dedupeDealsByImportKey(deals, txns);
    const projectedCounts = formatDealCounts(preview.counts);
    const targetCounts = formatDealCounts(TARGET_DEAL_COUNTS);
    if (!["Off-Plan", "Secondary", "Rental"].every(type => (preview.counts[type] || 0) === TARGET_DEAL_COUNTS[type])) {
      toast(`Deduplication blocked. Projected counts are ${projectedCounts}, but target counts are ${targetCounts}.`, "warning");
      return;
    }
    const linkedRemoved = preview.removed.filter(deal => (txns || []).some(t => !t.isVoid && t.deal_id === deal.id)).length;
    const warningMessage = [
      `Deduplicate ${preview.duplicateGroups.length} duplicate deal groups?`,
      `This will permanently remove ${preview.removed.length} duplicate deal record(s) from Firestore.`,
      `Projected final counts: ${projectedCounts}.`,
      linkedRemoved
        ? `Warning: ${linkedRemoved} duplicate deal(s) have linked transactions. The dedupe logic keeps the deal records with the strongest transaction links first.`
        : "Only duplicate deal records will be removed.",
    ].join("\n\n");
    if (!confirm(warningMessage)) return;
    try {
      await archiveDeletedDeals(preview.removed, "deduplicate", userRole, userEmail, { duplicate_group_count: preview.duplicateGroups.length });
    } catch (err) {
      toast(`Deduplication archive failed: ${err.message}`, "error");
      return;
    }
    setDealMutationLabel("Deal deduplication");
    setDeals(preview.deduped);
    toast(`Deduplicated deals. Final counts: ${projectedCounts}.`, "success");
    logAudit("deal_deduplicate", { removedIds: preview.removed.map(d => d.id), finalCounts: preview.counts }, userRole, userEmail);
  };
  const handleRepairLinkedRecords = () => {
    if (!corruptedLinkCount) { toast("All linked deal names already match the master records", "success"); return; }
    const warningMessage = [
      `Repair ${corruptedLinkCount} deal record(s) with corrupted broker, customer, or developer fields?`,
      "This will rewrite the deal names from the linked master records in Firestore.",
      "Linked IDs are treated as the source of truth, with exact-name recovery only when an ID is missing."
    ].join("\n\n");
    if (!confirm(warningMessage)) return;
    setDealMutationLabel("Deal link repair");
    setDeals(normalizedDeals);
    toast(`Repaired ${corruptedLinkCount} deal record(s) from linked master data.`, "success");
    logAudit("deal_repair_links", { repairedCount: corruptedLinkCount }, userRole, userEmail);
  };
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = filter === "All" ? normalizedDeals : normalizedDeals.filter(d => d.type === filter || d.stage === filter);
  const sortedDeals = useMemo(() => {
    const getSortValue = (deal, key) => {
      switch (key) {
        case "property": return `${deal.property_name || ""} ${deal.unit_no || ""}`.toLowerCase();
        case "type": return (deal.type || "").toLowerCase();
        case "stage": return (deal.stage || "").toLowerCase();
        case "date": return deal.created_at || "";
        case "client": return (deal.client_name || "").toLowerCase();
        case "broker": return (deal.broker_name || "").toLowerCase();
        case "value": return deal.transaction_value || 0;
        case "commission": return deal.expected_commission_net || 0;
        default: return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir]);
  const sortLabel = key => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";
  const SortTh = ({ sortBy, align = "left", children }) => <th style={{ ...C.th, textAlign: align }}>
    <button onClick={() => toggleSort(sortBy)} style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, textTransform: "inherit", letterSpacing: "inherit" }}>
      <span>{children}</span>
      <span style={{ fontSize: 10, color: sortKey === sortBy ? GOLD_D : "#9CA3AF" }}>{sortLabel(sortBy)}</span>
    </button>
  </th>;

  return <div>
    <PageHeader title="Deals / Pipeline" sub={`${deals.length} deals total${duplicateDealCount ? ` • ${duplicateDealCount} suspected duplicates` : ""}`}>
      <Sel value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="All">All Deals</option>
        {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </Sel>
      {hasPermission(userRole, 'sales.edit') && corruptedLinkCount > 0 && <button style={C.btn("secondary")} onClick={handleRepairLinkedRecords}>Repair Linked Names ({corruptedLinkCount})</button>}
      {hasPermission(userRole, 'sales.edit') && duplicateDealCount > 0 && <button style={C.btn(targetCountsMatch ? "danger" : "secondary")} onClick={handleDeduplicate}>{targetCountsMatch ? `Deduplicate to ${formatDealCounts(TARGET_DEAL_COUNTS)}` : `Review Duplicates (${duplicateDealCount})`}</button>}
      {hasPermission(userRole, 'sales.edit') && DEAL_RESEED_ENABLED && !!pipelineSeedDeals.length && <button style={C.btn("secondary")} onClick={seedMissingPipelineDeals}>Seed Missing Deals ({missingPipelineDeals.length})</button>}
      {hasPermission(userRole, 'sales.create') && <button style={C.btn()} onClick={() => { setEdit(null); setShow(true); }}>+ New Deal</button>}
    </PageHeader>

    <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #2563EB", background: "#EFF6FF", color: "#1D4ED8", fontSize: 13 }}>
      Deal reseeding from pasted data is disabled. Firestore is now the only source of truth for deal create, edit, delete, and repair actions.
    </div>

    {dealMutationLabel && dealWriteState.status === "saving" && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #2563EB", background: "#EFF6FF", color: "#1D4ED8", fontSize: 13 }}>
      {dealMutationLabel} is being saved to Firestore now.
    </div>}

    {dealMutationLabel && dealWriteState.status === "saved" && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #059669", background: "#ECFDF5", color: "#047857", fontSize: 13 }}>
      {dealMutationLabel} was saved to Firestore at {dealWriteState.completedAt ? new Date(dealWriteState.completedAt).toLocaleString("en-GB") : "just now"}. Reloading the page should show the same result.
    </div>}

    {dealMutationLabel && dealWriteState.status === "error" && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #DC2626", background: "#FEF2F2", color: "#991B1B", fontSize: 13 }}>
      {dealMutationLabel} did not save to Firestore. Error: {dealWriteState.error || "Unknown error"}.
    </div>}

    {corruptedLinkCount > 0 && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #DC2626", background: "#FEF2F2", color: "#991B1B", fontSize: 13 }}>
      {corruptedLinkCount} deal record{corruptedLinkCount === 1 ? "" : "s"} have mismatched broker, customer, or developer fields. The table now resolves names from linked IDs first, and "Repair Linked Names" will rewrite the stored deal records from the master lists.
    </div>}

    {duplicateDealCount > 0 && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #D97706", background: "#FFF7ED", color: "#9A3412", fontSize: 13 }}>
      Firestore currently contains {duplicateDealCount} suspected duplicate deal records across {duplicateGroups.length} duplicate group{duplicateGroups.length === 1 ? "" : "s"}. This usually happens when old seed deals were written into the database. Projected post-dedup counts: {formatDealCounts(dedupePreview.counts)}. Target counts: {formatDealCounts(TARGET_DEAL_COUNTS)}. New deleted deals should no longer come back after the sync fix.
    </div>}

    <div style={{ ...C.card, overflowX: "auto", overflowY: "visible" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <SortTh sortBy="date">Date</SortTh><SortTh sortBy="property">Property</SortTh><SortTh sortBy="type">Type</SortTh><SortTh sortBy="stage">Stage</SortTh>
          <SortTh sortBy="client">Client</SortTh><SortTh sortBy="broker">Broker</SortTh>
          <SortTh sortBy="value" align="right">Value</SortTh><SortTh sortBy="commission" align="right">Commission</SortTh>
          <th style={C.th}>Actions</th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={9} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No deals found. Click "+ New Deal" to create one.</td></tr>}
          {sortedDeals.map(d => <tr key={d.id} style={{ cursor: hasPermission(userRole, 'sales.edit') ? "pointer" : "default" }} onClick={() => { if (hasPermission(userRole, 'sales.edit')) { setEdit(d); setShow(true); } }}>
            <td style={C.td}>{d.created_at ? fmtDate(d.created_at) : "--"}</td>
            <td style={C.td}><div style={{ fontWeight: 500 }}>{d.property_name || "—"}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{d.unit_no && `Unit ${d.unit_no}`}</div></td>
            <td style={C.td}><span style={C.badge(d.type === "Off-Plan" ? "info" : d.type === "Secondary" ? "gold" : "success")}>{d.type}</span></td>
            <td style={C.td}><span style={C.badge(d.stage?.includes("Collected") ? "success" : d.stage?.includes("Earned") ? "gold" : "neutral")}>{d.stage}</span></td>
            <td style={C.td}>{d.client_name || "—"}</td>
            <td style={C.td}>{d.broker_name || "—"}</td>
            <td style={{ ...C.td, textAlign: "right" }}>{d.transaction_value ? fmtAED(d.transaction_value) : "--"}</td>
            <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(d.expected_commission_net || 0)}</td>
            <td style={C.td}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {hasPermission(userRole, 'sales.edit') && <button style={C.btn("secondary", true)} onClick={e => { e.stopPropagation(); setEdit(d); setShow(true); }}>Edit</button>}
                {hasPermission(userRole, 'sales.edit') && <button style={C.btn("danger", true)} onClick={e => { e.stopPropagation(); handleDelete(d); }}>Delete</button>}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {/* Deal Modal */}
    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(700)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>{edit?.id ? "Edit Deal" : "New Deal"}</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <DealForm initial={normalizeLinkedDealRefs(edit || empty)} onSave={save} onCancel={() => setShow(false)} customers={customers} brokers={brokers} developers={developers} />
      </div>
    </div>}
  </div>;
}

function DealForm({ initial, onSave, onCancel, customers, brokers, developers }) {
  const [d, setD] = useState({ ...initial });
  const up = (k, v) => setD(p => {
    const next = { ...p, [k]: v };
    if (next.type === "Secondary") {
      const val = next.transaction_value || 0;
      const buyerPct = parseFloat(next.commission_pct) || 0;
      const sellerPct = parseFloat(next.seller_commission_pct) || 0;
      const disc = next.discount || 0;
      const buyerComm = val && buyerPct ? Math.round(val * buyerPct / 100) : 0;
      const sellerComm = val && sellerPct ? Math.round(val * sellerPct / 100) : 0;
      next.seller_commission = sellerComm;
      next.expected_commission_net = buyerComm + sellerComm - disc;
    } else if (k === "transaction_value" || k === "commission_pct" || k === "type") {
      const val = next.transaction_value;
      const pct = next.commission_pct;
      if (val && pct) next.expected_commission_net = Math.round(val * parseFloat(pct) / 100);
    }
    return next;
  });
  const isSecondary = d.type === "Secondary";

  return <div>
    <div style={C.mbdy}>
      <div style={C.fg}>
        <div><label style={C.label}>Deal Type</label><Sel value={d.type} onChange={e => up("type", e.target.value)}>{DEAL_TYPES.map(t => <option key={t}>{t}</option>)}</Sel></div>
        <div><label style={C.label}>Stage</label><Sel value={d.stage} onChange={e => up("stage", e.target.value)}>{DEAL_STAGES.map(s => <option key={s}>{s}</option>)}</Sel></div>
        <div><label style={C.label}>Property Name</label><Inp value={d.property_name} onChange={e => up("property_name", e.target.value)} /></div>
        <div><label style={C.label}>Unit No.</label><Inp value={d.unit_no} onChange={e => up("unit_no", e.target.value)} /></div>
        <div><label style={C.label}>Developer</label><Sel value={d.developer_id} onChange={e => { const dev = developers.find(x => x.id === e.target.value); up("developer_id", e.target.value); up("developer", dev ? dev.name : ""); }}>
          <option value="">— Select —</option>
          {developers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Sel></div>
        <div><label style={C.label}>Broker</label><Sel value={d.broker_id} onChange={e => { const br = brokers.find(x => x.id === e.target.value); up("broker_id", e.target.value); up("broker_name", br ? br.name : ""); }}>
          <option value="">— Select —</option>
          {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Sel></div>
        <div><label style={C.label}>{isSecondary ? "Buyer Client" : "Client"}</label><Sel value={d.customer_id} onChange={e => { const c = customers.find(x => x.id === e.target.value); up("customer_id", e.target.value); up("client_name", c ? c.name : ""); }}>
          <option value="">— Select —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Sel></div>
        {isSecondary && <div><label style={C.label}>Seller Client</label><Sel value={d.seller_customer_id || ""} onChange={e => { const c = customers.find(x => x.id === e.target.value); up("seller_customer_id", e.target.value); up("seller_name", c ? c.name : ""); }}>
          <option value="">— Select —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Sel></div>}
        <div><label style={C.label}>Transaction Value (AED)</label><Inp type="number" step="0.01" value={d.transaction_value ? parseFloat(fromCents(d.transaction_value)) : ""} onChange={e => up("transaction_value", toCents(e.target.value))} placeholder="Optional if you only know the commission amount" /></div>
        <div><label style={C.label}>{isSecondary ? "Buyer Commission %" : "Commission %"}</label><Inp type="number" step="0.01" value={d.commission_pct} onChange={e => up("commission_pct", e.target.value)} placeholder="Optional" /></div>
        {isSecondary && <div><label style={C.label}>Seller Commission %</label><Inp type="number" step="0.01" value={d.seller_commission_pct} onChange={e => up("seller_commission_pct", e.target.value)} placeholder="Optional" /></div>}
        {isSecondary && <div><label style={C.label}>Seller Commission (AED)</label><Inp type="number" step="0.01" value={d.seller_commission ? fromCents(d.seller_commission) : ""} disabled style={{ background: "#F3F4F6", color: "#374151", opacity: 1 }} placeholder="Auto-calculated" /></div>}
        {isSecondary && <div><label style={C.label}>Discount (AED)</label><Inp type="number" step="0.01" value={d.discount ? parseFloat(fromCents(d.discount)) : ""} onChange={e => up("discount", toCents(e.target.value))} placeholder="Optional" /></div>}
        <div><label style={C.label}>Expected Net Commission (AED)</label><Inp type="number" step="0.01" value={d.expected_commission_net ? fromCents(d.expected_commission_net) : ""} onChange={e => up("expected_commission_net", toCents(e.target.value))} placeholder="You can enter this directly from your sheet" /></div>
        <div><label style={C.label}>VAT Applicable</label><Sel value={d.vat_applicable ? "yes" : "no"} onChange={e => up("vat_applicable", e.target.value === "yes")}><option value="yes">Yes (5%)</option><option value="no">No</option></Sel></div>
        <div><label style={C.label}>Date Created</label><Inp type="date" value={d.created_at} onChange={e => up("created_at", e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 14 }}><label style={C.label}>Notes</label><textarea style={{ ...C.input, minHeight: 60, resize: "vertical" }} value={d.notes || ""} onChange={e => up("notes", e.target.value)} /></div>
    </div>
    <div style={C.mftr}><button style={C.btn("secondary")} onClick={onCancel}>Cancel</button><button style={C.btn()} onClick={() => onSave(d)}>💾 Save Deal</button></div>
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  SALE RECEIPTS (replaces Invoices — cash-settled)
// ╚══════════════════════════════════════════════════╝
function ReceiptsPage({ accounts, txns, deals, saveTxn, persistTxn, journal, userRole, setPage }) {
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ deal_id: "", date: todayStr(), bankCode: "1002", vatRate: 5, grossAmount: "" });

  useEffect(() => {
    const h = () => setShow(true);
    document.addEventListener("add-receipt", h);
    return () => document.removeEventListener("add-receipt", h);
  }, []);

  const saleReceipts = txns.filter(t => t.txnType === "SR" && !t.isVoid);

  const handlePreview = () => {
    const deal = deals.find(d => d.id === form.deal_id);
    if (!deal) { toast("Select a deal first", "warning"); return; }
    const gross = parseFloat(form.grossAmount);
    if (!gross || gross <= 0) { toast("Enter a valid amount", "warning"); return; }
    try {
      const txn = journal.postSaleReceipt({ date: form.date, deal, gross, vatRate: form.vatRate, bankCode: form.bankCode, commit: false });
      setPreview(txn);
    } catch (err) { toast(err.message, "error"); }
  };

  const handleConfirm = async () => {
    const deal = deals.find(d => d.id === form.deal_id);
    try {
      const txn = journal.postSaleReceipt({ date: form.date, deal, gross: parseFloat(form.grossAmount), vatRate: form.vatRate, bankCode: form.bankCode, commit: false });
      await persistTxn(txn);
      toast("Sale receipt posted!", "success");
      setShow(false); setPreview(null);
      setForm({ deal_id: "", date: todayStr(), bankCode: "1002", vatRate: 5, grossAmount: "" });
    } catch (err) { toast(err.message, "error"); }
  };

  const bankAccounts  = accounts.filter(a => a.isBank);
  const cashAccounts  = accounts.filter(a => a.isCash || (!a.isBank && a.type === "Asset" && a.code === "1001"));
  const allLiquidAccts = [...bankAccounts, ...cashAccounts];

  return <div>
    <PageHeader title="Sale Receipts" sub={`Cash-settled commission collections — ${saleReceipts.length} receipts`}>
      {hasPermission(userRole, 'sales.create') && <button style={C.btn()} onClick={() => setShow(true)}>+ New Receipt</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Deal / Description</th><th style={C.th}>Client</th><th style={{ ...C.th, textAlign: "right" }}>Gross Amount</th></tr></thead>
        <tbody>
          {saleReceipts.length === 0 && <tr><td colSpan={5} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No sale receipts yet. Collect a commission to get started.</td></tr>}
          {saleReceipts.sort((a, b) => b.date?.localeCompare(a.date)).map(t => {
            const gross = t.lines.reduce((s, l) => s + (l.debit || 0), 0);
            return <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}><span style={C.badge("success")}>{t.ref}</span></td><td style={C.td}>{t.description}</td><td style={C.td}>{t.counterparty}</td><td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(gross)}</td></tr>;
          })}
        </tbody>
      </table>
    </div>

    {/* New Receipt Modal */}
    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>💰 New Sale Receipt</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>Record a commission collected. This posts a single journal entry: DR Bank / CR Revenue / CR Output VAT.</p>
          <div style={C.fg}>
            <div><label style={C.label}>Deal</label><Sel value={form.deal_id} onChange={e => setForm(p => ({ ...p, deal_id: e.target.value }))}>
              <option value="">— Select Deal —</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.property_name} ({d.type})</option>)}
            </Sel></div>
            <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>Gross Amount (AED)</label><Inp type="number" value={form.grossAmount} onChange={e => setForm(p => ({ ...p, grossAmount: e.target.value }))} placeholder="e.g. 52500" /></div>
            <div><label style={C.label}>VAT Rate %</label><Sel value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: parseFloat(e.target.value) }))}>
              <option value={5}>5% (Standard)</option><option value={0}>0% (Exempt)</option>
            </Sel></div>
            <div><label style={C.label}>Receive Into</label><Sel value={form.bankCode} onChange={e => setForm(p => ({ ...p, bankCode: e.target.value }))}>
              {bankAccounts.length > 0 && <optgroup label="Bank Accounts">{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
              {cashAccounts.length  > 0 && <optgroup label="Cash Accounts">{cashAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
            </Sel></div>
          </div>
          {form.grossAmount && parseFloat(form.grossAmount) > 0 && <div style={{ marginTop: 16, padding: 14, background: "#F9FAFB", borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Gross:</span><span style={{ fontWeight: 600 }}>AED {parseFloat(form.grossAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
            {form.vatRate > 0 && <><div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}><span>Net (excl. VAT):</span><span>AED {(parseFloat(form.grossAmount) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}><span>VAT ({form.vatRate}%):</span><span>AED {(parseFloat(form.grossAmount) - parseFloat(form.grossAmount) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></>}
          </div>}
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={handlePreview}>Preview Journal →</button></div>
      </div>
    </div>}

    {preview && <PostingPreview open={true} lines={preview.lines} accounts={accounts} header={{ date: preview.date, ref: preview.ref, counterparty: preview.counterparty }} onClose={() => setPreview(null)} onConfirm={handleConfirm} />}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  PAYMENTS PAGE (replaces Expenses & Bills — cash-settled)
// ╚══════════════════════════════════════════════════╝
function PaymentsPage({ accounts, txns, saveTxn, persistTxn, journal, vendors, userRole }) {
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ date: todayStr(), memo: "", gross: "", vatRate: 0, expenseCode: "", paidFromCode: "1002", counterparty: "" });

  useEffect(() => {
    const h = () => setShow(true);
    document.addEventListener("add-payment", h);
    return () => document.removeEventListener("add-payment", h);
  }, []);

  const payments = txns.filter(t => (t.txnType === "PV" || t.txnType === "BP") && !t.isVoid);
  const expenseAccounts  = accounts.filter(a => a.type === "Expense").sort((a, b) => a.code.localeCompare(b.code));
  const bankAccounts     = accounts.filter(a => a.isBank);
  const cashAccountsPmt  = accounts.filter(a => a.isCash || (!a.isBank && a.type === "Asset" && a.code === "1001"));

  const handlePreview = () => {
    if (!form.expenseCode) { toast("Select an expense account", "warning"); return; }
    if (!form.gross || parseFloat(form.gross) <= 0) { toast("Enter a valid amount", "warning"); return; }
    try {
      const txn = journal.postPayment({ ...form, gross: parseFloat(form.gross), vatRate: parseFloat(form.vatRate), commit: false });
      setPreview(txn);
    } catch (err) { toast(err.message, "error"); }
  };

  const handleConfirm = async () => {
    try {
      const txn = journal.postPayment({ ...form, gross: parseFloat(form.gross), vatRate: parseFloat(form.vatRate), commit: false });
      await persistTxn(txn);
      toast("Payment posted!", "success");
      setShow(false); setPreview(null);
      setForm({ date: todayStr(), memo: "", gross: "", vatRate: 0, expenseCode: "", paidFromCode: "1002", counterparty: "" });
    } catch (err) { toast(err.message, "error"); }
  };

  return <div>
    <PageHeader title="Payments" sub={`Cash-settled expense payments — ${payments.length} payments`}>
      {hasPermission(userRole, 'expenses.create') && <button style={C.btn()} onClick={() => setShow(true)}>+ New Payment</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Description</th><th style={C.th}>Vendor</th><th style={C.th}>Type</th><th style={{ ...C.th, textAlign: "right" }}>Amount</th></tr></thead>
        <tbody>
          {payments.length === 0 && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No payments yet.</td></tr>}
          {payments.sort((a, b) => b.date?.localeCompare(a.date)).map(t => {
            const gross = t.lines.reduce((s, l) => s + (l.credit || 0), 0);
            return <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}><span style={C.badge("warning")}>{t.ref}</span></td><td style={C.td}>{t.description}</td><td style={C.td}>{t.counterparty || "—"}</td><td style={C.td}><span style={C.badge(t.txnType === "BP" ? "gold" : "neutral")}>{TXN_TYPES[t.txnType]?.label || t.txnType}</span></td><td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(gross)}</td></tr>;
          })}
        </tbody>
      </table>
    </div>

    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>💳 New Payment</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>Record an expense paid. Posts: DR Expense / DR Input VAT / CR Bank.</p>
          <div style={C.fg}>
            <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>Expense Account</label><Sel value={form.expenseCode} onChange={e => setForm(p => ({ ...p, expenseCode: e.target.value }))}>
              <option value="">— Select —</option>
              {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </Sel></div>
            <div><label style={C.label}>Description</label><Inp value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="e.g. Office rent March 2026" /></div>
            <div><label style={C.label}>Gross Amount (AED)</label><Inp type="number" value={form.gross} onChange={e => setForm(p => ({ ...p, gross: e.target.value }))} /></div>
            <div><label style={C.label}>VAT Rate %</label><Sel value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: e.target.value }))}>
              <option value={0}>0% (No VAT)</option><option value={5}>5% (Standard)</option>
            </Sel></div>
            <div><label style={C.label}>Paid From</label><Sel value={form.paidFromCode} onChange={e => setForm(p => ({ ...p, paidFromCode: e.target.value }))}>
              {bankAccounts.length    > 0 && <optgroup label="Bank Accounts">{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
              {cashAccountsPmt.length > 0 && <optgroup label="Cash Accounts">{cashAccountsPmt.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
            </Sel></div>
            <div><label style={C.label}>Vendor / Payee</label><Sel value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))}>
              <option value="">— Optional —</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </Sel></div>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={handlePreview}>Preview Journal →</button></div>
      </div>
    </div>}

    {preview && <PostingPreview open={true} lines={preview.lines} accounts={accounts} header={{ date: preview.date, ref: preview.ref, counterparty: preview.counterparty }} onClose={() => setPreview(null)} onConfirm={handleConfirm} />}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  CUSTOMERS / BROKERS / DEVELOPERS / VENDORS
// ╚══════════════════════════════════════════════════╝
function CRUDPage({ title, icon, items, setItems, fields, eventName, userRole, createPerm, editPerm }) {
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const h = () => { setEdit(null); setShow(true); };
    document.addEventListener(eventName, h);
    return () => document.removeEventListener(eventName, h);
  }, [eventName]);

  const save = (item) => {
    if (item.id) setItems(prev => prev.map(x => x.id === item.id ? item : x));
    else setItems(prev => [...prev, { ...item, id: uid() }]);
    setShow(false); setEdit(null);
    toast(`${title.replace(/s$/, "")} saved`, "success");
  };

  const filtered = items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return fields.some(f => String(i[f.key] || "").toLowerCase().includes(s));
  });

  return <div>
    <PageHeader title={`${icon} ${title}`} sub={`${items.length} records`}>
      <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ maxWidth: 200 }} />
      {hasPermission(userRole, createPerm) && <button style={C.btn()} onClick={() => { setEdit(null); setShow(true); }}>+ Add</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>{fields.filter(f => f.showInTable !== false).map(f => <th key={f.key} style={C.th}>{f.label}</th>)}<th style={C.th}>Actions</th></tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={fields.filter(f => f.showInTable !== false).length + 1} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No records found.</td></tr>}
          {filtered.map(item => <tr key={item.id}>
            {fields.filter(f => f.showInTable !== false).map(f => <td key={f.key} style={C.td}>{String(item[f.key] || "—")}</td>)}
            <td style={C.td}>{hasPermission(userRole, editPerm) && <button style={C.btn("secondary", true)} onClick={() => { setEdit(item); setShow(true); }}>Edit</button>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>{edit?.id ? "Edit" : "New"} {title.replace(/s$/, "")}</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <div style={C.fg}>
            {fields.map(f => <div key={f.key}><label style={C.label}>{f.label}</label><Inp value={(edit || {})[f.key] || ""} onChange={e => setEdit(p => ({ ...(p || {}), [f.key]: e.target.value }))} placeholder={f.placeholder || ""} /></div>)}
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={() => save(edit || {})}>💾 Save</button></div>
      </div>
    </div>}
  </div>;
}

function CustomersPage(p) {
  return <CRUDPage title="Customers" icon="👥" items={p.customers} setItems={p.setCustomers} eventName="add-customer" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
    { key: "name", label: "Full Name" }, { key: "nationality", label: "Nationality" },
    { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
    { key: "trn", label: "TRN", showInTable: false }, { key: "address", label: "Address", showInTable: false }
  ]} />;
}

function BrokersPage(p) {
  return <CRUDPage title="Brokers" icon="👔" items={p.brokers} setItems={p.setBrokers} eventName="add-broker" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
    { key: "name", label: "Name" }, { key: "nationality", label: "Nationality" },
    { key: "phone", label: "Phone" }, { key: "rera_no", label: "RERA No." }, { key: "rera_exp", label: "RERA Expiry" }
  ]} />;
}

function DevelopersPage(p) {
  return <CRUDPage title="Developers" icon="🏗️" items={p.developers} setItems={p.setDevelopers} eventName="add-developer" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
    { key: "name", label: "Name" }, { key: "contact_person", label: "Contact Person" },
    { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
    { key: "address", label: "Address", showInTable: false }, { key: "trn", label: "TRN", showInTable: false },
    { key: "expiry_date", label: "Agreement Expiry" }
  ]} />;
}

function VendorsPage(p) {
  return <CRUDPage title="Vendors" icon="🏭" items={p.vendors} setItems={p.setVendors} eventName="add-vendor" userRole={p.userRole} createPerm="expenses.create" editPerm="expenses.edit" fields={[
    { key: "name", label: "Name" }, { key: "category", label: "Category" },
    { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "trn", label: "TRN" }
  ]} />;
}

// ╔══════════════════════════════════════════════════╗
//  BANKING PAGE
// ╚══════════════════════════════════════════════════╝
function BankingPage({ accounts, txns, ledger, persistTxn, journal, userRole }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [tf, setTf] = useState({ date: todayStr(), fromCode: "", toCode: "", amount: "", memo: "Bank transfer" });
  const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");

  const handleTransfer = async () => {
    if (!tf.fromCode || !tf.toCode || tf.fromCode === tf.toCode) { toast("Select two different accounts", "warning"); return; }
    if (!tf.amount || parseFloat(tf.amount) <= 0) { toast("Enter a valid amount", "warning"); return; }
    try {
      const txn = journal.postBankTransfer({ date: tf.date, fromCode: tf.fromCode, toCode: tf.toCode, amount: parseFloat(tf.amount), memo: tf.memo, commit: false });
      await persistTxn(txn);
      toast("Transfer posted!", "success");
      setShowTransfer(false);
      setTf({ date: todayStr(), fromCode: "", toCode: "", amount: "", memo: "Bank transfer" });
    } catch (err) { toast(err.message, "error"); }
  };

  // Bank transactions grouped by account
  return <div>
    <PageHeader title="Banking" sub="Bank account balances and transfers">
      {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShowTransfer(true)}>↔ Transfer</button>}
    </PageHeader>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginBottom: 22 }}>
      {bankAccounts.map(a => {
        const bal = accountBalance(a, ledger);
        return <div key={a.id} style={{ ...C.card, padding: "18px 20px", borderLeft: `4px solid ${bal >= 0 ? "#059669" : "#DC2626"}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{a.name}</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Account {a.code}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: bal >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(bal)}</div>
        </div>;
      })}
    </div>

    {/* Recent bank transactions */}
    <div style={C.card}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>📋 Recent Bank Activity</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Description</th><th style={{ ...C.th, textAlign: "right" }}>In</th><th style={{ ...C.th, textAlign: "right" }}>Out</th></tr></thead>
        <tbody>
          {txns.filter(t => !t.isVoid).sort((a, b) => b.date?.localeCompare(a.date)).slice(0, 20).map(t => {
            const bankLines = t.lines.filter(l => bankAccounts.some(ba => ba.id === l.accountId));
            if (bankLines.length === 0) return null;
            const inAmt = bankLines.reduce((s, l) => s + (l.debit || 0), 0);
            const outAmt = bankLines.reduce((s, l) => s + (l.credit || 0), 0);
            return <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}>{t.ref}</td><td style={C.td}>{t.description}</td>
              <td style={{ ...C.td, textAlign: "right", color: inAmt > 0 ? "#059669" : "#9CA3AF" }}>{inAmt > 0 ? fmtAED(inAmt) : "�"}</td>
              <td style={{ ...C.td, textAlign: "right", color: outAmt > 0 ? "#DC2626" : "#9CA3AF" }}>{outAmt > 0 ? fmtAED(outAmt) : "�"}</td></tr>;
          })}
        </tbody>
      </table>
    </div>

    {showTransfer && <div style={C.modal} onClick={() => setShowTransfer(false)}>
      <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>↔ Bank Transfer</span><button onClick={() => setShowTransfer(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <div style={C.fg}>
            <div><label style={C.label}>Date</label><Inp type="date" value={tf.date} onChange={e => setTf(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>From</label><Sel value={tf.fromCode} onChange={e => setTf(p => ({ ...p, fromCode: e.target.value }))}><option value="">— Select —</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
            <div><label style={C.label}>To</label><Sel value={tf.toCode} onChange={e => setTf(p => ({ ...p, toCode: e.target.value }))}><option value="">— Select —</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
            <div><label style={C.label}>Amount (AED)</label><Inp type="number" value={tf.amount} onChange={e => setTf(p => ({ ...p, amount: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={C.label}>Memo</label><Inp value={tf.memo} onChange={e => setTf(p => ({ ...p, memo: e.target.value }))} /></div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShowTransfer(false)}>Cancel</button><button style={C.btn()} onClick={handleTransfer}>Post Transfer</button></div>
      </div>
    </div>}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  CHART OF ACCOUNTS
// ╚══════════════════════════════════════════════════╝
function BankingPageV2({ accounts, setAccounts, txns, setTxns, ledger, persistTxn, journal, userRole }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTxnId, setEditTxnId] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [dateFilter, setDateFilter] = useState(() => { const r = computeDateRange("this_month"); return { preset: "this_month", ...r }; });
  const [tf, setTf] = useState({ date: todayStr(), fromCode: "", toCode: "", amount: "", memo: "Bank transfer" });
  const [importFileName, setImportFileName] = useState("");
  const [importCsvText, setImportCsvText] = useState("");
  const [narrationMap, setNarrationMap] = useState(() => ({ ...BANK_IMPORT_DEFAULT_MAP }));
  // Separate bank accounts (isBank:true) from cash accounts (isCash or code 1001)
  const bankOnlyAccts = accounts.filter(a => a.isBank);
  const cashOnlyAccts = accounts.filter(a => a.isCash || (!a.isBank && a.type === "Asset" && a.code === "1001"));
  const allLiquidAccts = [...bankOnlyAccts, ...cashOnlyAccts];

  const editTxn = useMemo(() => txns.find(t => t.id === editTxnId) || null, [txns, editTxnId]);
  const importAccounts = useMemo(() => mergeImportAccounts(accounts || []), [accounts]);
  const importAnalysis = useMemo(() => importCsvText ? analyzeBankImport({ csvText: importCsvText, accounts: importAccounts, txns, narrationMap }) : null, [importCsvText, importAccounts, txns, narrationMap]);
  const escapeExcel = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

  // Build activity rows for a given set of target accounts
  const buildRows = (targetAccts) => {
    // Opening balance: sum of all non-void transactions BEFORE the period start for these accounts
    const openingBalance = dateFilter.from
      ? txns
          .filter(t => !t.isVoid && (t.date || "") < dateFilter.from)
          .reduce((sum, t) => {
            const lines = (t.lines || []).filter(l => targetAccts.some(a => a.id === l.accountId));
            return sum + lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
          }, 0)
      : 0;

    const rows = txns
      .filter(t => !t.isVoid && (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to))
      .map(t => {
        const lines = (t.lines || []).filter(l => targetAccts.some(a => a.id === l.accountId));
        if (lines.length === 0) return null;
        return {
          id: t.id, date: t.date || "", ref: t.ref || "",
          description: t.description || "", counterparty: t.counterparty || "",
          txnType: TXN_TYPES[t.txnType]?.label || t.txnType || "",
          acctName: lines.map(l => targetAccts.find(a => a.id === l.accountId)?.name || "").join(", "),
          inAmt: lines.reduce((s, l) => s + (l.debit || 0), 0),
          outAmt: lines.reduce((s, l) => s + (l.credit || 0), 0),
          balance: 0,
        };
      })
      .filter(Boolean);

    // Compute running balance in chronological order (always date ASC)
    const dateSorted = [...rows].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.ref.localeCompare(b.ref);
    });
    let running = openingBalance;
    dateSorted.forEach(row => {
      running += (row.inAmt || 0) - (row.outAmt || 0);
      row.balance = running;
    });

    const getVal = (row) => {
      switch (sortKey) {
        case "date": return row.date || ""; case "ref": return row.ref || "";
        case "description": return row.description || "";
        case "in": return row.inAmt || 0; case "out": return row.outAmt || 0;
        default: return "";
      }
    };
    rows.sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      let cmp = (typeof av === "number" || typeof bv === "number") ? Number(av || 0) - Number(bv || 0) : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  };

  const bankRows = useMemo(() => buildRows(bankOnlyAccts), [txns, bankOnlyAccts, sortKey, sortDir, dateFilter]);
  const cashRows = useMemo(() => buildRows(cashOnlyAccts), [txns, cashOnlyAccts, sortKey, sortDir, dateFilter]);
  const handleExportBankRows = () => {
    const allRows = [...bankRows, ...cashRows];
    if (!allRows.length) { toast("No bank or cash transactions to export", "warning"); return; }
    const exportRows = [...allRows].sort((a, b) => {
      const dateCmp = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCmp !== 0) return dateCmp;
      return String(a.ref || "").localeCompare(String(b.ref || ""));
    });
    let runningC = 0;
    const body = exportRows.map((row, idx) => {
      runningC += (row.inAmt || 0) - (row.outAmt || 0);
      return `<tr>
            <td>${idx + 1}</td>
            <td>${escapeExcel(row.date)}</td>
            <td>${escapeExcel(row.ref)}</td>
            <td>${escapeExcel(row.description)}</td>
            <td>${escapeExcel(row.counterparty)}</td>
            <td>${escapeExcel(row.txnType)}</td>
            <td>${escapeExcel(row.acctName)}</td>
            <td style="mso-number-format:'0.00';">${((row.inAmt || 0) / 100).toFixed(2)}</td>
            <td style="mso-number-format:'0.00';">${((row.outAmt || 0) / 100).toFixed(2)}</td>
            <td style="mso-number-format:'0.00';">${(((row.inAmt || 0) - (row.outAmt || 0)) / 100).toFixed(2)}</td>
            <td style="mso-number-format:'0.00';">${(runningC / 100).toFixed(2)}</td>
            <td>${escapeExcel(row.id)}</td>
          </tr>`;
    }).join("");
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
  <thead>
    <tr>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">No.</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Date</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Ref</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Description</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Counterparty</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Type</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Bank Account</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">In (AED)</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Out (AED)</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Net (AED)</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Running Balance (AED)</th>
      <th style="border:1px solid #D1D5DB;padding:6px 8px;background:#F3F4F6;font-weight:700;">Transaction ID</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nasama-bank-transactions-${todayStr()}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Exported ${exportRows.length} bank transactions to Excel`, "success");
  };

  const handleTransfer = async () => {
    if (!tf.fromCode || !tf.toCode || tf.fromCode === tf.toCode) { toast("Select two different accounts", "warning"); return; }
    if (!tf.amount || parseFloat(tf.amount) <= 0) { toast("Enter a valid amount", "warning"); return; }
    try {
      const txn = journal.postBankTransfer({ date: tf.date, fromCode: tf.fromCode, toCode: tf.toCode, amount: parseFloat(tf.amount), memo: tf.memo, commit: false });
      await persistTxn(txn);
      toast("Transfer posted!", "success");
      setShowTransfer(false);
      setTf({ date: todayStr(), fromCode: "", toCode: "", amount: "", memo: "Bank transfer" });
    } catch (err) { toast(err.message, "error"); }
  };

  const handleImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportFileName(file.name);
      setImportCsvText(String(reader.result || ""));
    };
    reader.onerror = () => toast("Could not read the CSV file", "error");
    reader.readAsText(file);
  };

  const handleCommitImport = () => {
    if (!importAnalysis) { toast("Choose the bank CSV file first", "warning"); return; }
    if (importAnalysis.unresolved.length) { toast("Resolve all unmapped rows before importing", "warning"); return; }
    if (!importAnalysis.ready.length) {
      toast(importAnalysis.duplicates.length ? "All rows already exist in the database" : "No rows are ready to import", "info");
      return;
    }
    if (!confirm(`Import ${importAnalysis.ready.length} bank transactions to the backend database? This permanently writes to Firestore.`)) return;

    const mappedCodes = new Set(importAnalysis.categories.map(c => c.accountCode).filter(Boolean));
    const missingAccounts = BANK_IMPORT_REQUIRED_ACCOUNTS.filter(a => mappedCodes.has(a.code) && !accounts.some(x => x.code === a.code));
    if (missingAccounts.length) setAccounts(prev => mergeImportAccounts([...(prev || []), ...missingAccounts]));
    setTxns(prev => [...prev, ...importAnalysis.ready.map(r => r.txn)]);
    toast(`Imported ${importAnalysis.ready.length} bank transactions`, "success");
    setShowImport(false);
  };
  const toggleSort = (key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir(key === "date" ? "desc" : "asc");
      return key;
    });
  };

  const handleSaveEdit = (updatedTxn) => {
    setTxns(prev => prev.map(t => t.id === updatedTxn.id ? updatedTxn : t));
    setEditTxnId("");
    toast("Bank transaction updated", "success");
  };

  // Shared activity table renderer
  const ActivityTable = (rows, emptyMsg) => (
    <div style={{ overflowX: "auto", overflowY: "visible" }}>
      <table style={{ width: "100%", minWidth: 1060, borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 110 }} /><col style={{ width: 100 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 150 }} /><col style={{ width: 70 }} />
        </colgroup>
        <thead><tr>
          <SortTh label="Date"        sortKey={sortKey} activeKey="date"        sortDir={sortDir} onToggle={toggleSort} />
          <SortTh label="Ref"         sortKey={sortKey} activeKey="ref"         sortDir={sortDir} onToggle={toggleSort} />
          <SortTh label="Description" sortKey={sortKey} activeKey="description" sortDir={sortDir} onToggle={toggleSort} />
          <SortTh label="In (AED)"    sortKey={sortKey} activeKey="in"          sortDir={sortDir} onToggle={toggleSort} align="right" />
          <SortTh label="Out (AED)"   sortKey={sortKey} activeKey="out"         sortDir={sortDir} onToggle={toggleSort} align="right" />
          <th style={{ ...C.th, textAlign: "right", background: "#F0FDF4", color: "#065F46", letterSpacing: "0.04em" }}>Balance (AED)</th>
          <th style={C.th}>Actions</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} style={{ ...C.td, textAlign: "center", padding: 32, color: "#9CA3AF" }}>{emptyMsg}</td></tr>}
          {rows.map(row => <tr key={row.id}>
            <td style={C.td}>{fmtDate(row.date)}</td>
            <td style={C.td}>{row.ref}</td>
            <td style={{ ...C.td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 }} title={row.description}>{row.description}</td>
            <td style={{ ...C.td, textAlign: "right", color: row.inAmt  > 0 ? "#059669" : "#9CA3AF" }}>{row.inAmt  > 0 ? fmtAED(row.inAmt)  : "—"}</td>
            <td style={{ ...C.td, textAlign: "right", color: row.outAmt > 0 ? "#DC2626" : "#9CA3AF" }}>{row.outAmt > 0 ? fmtAED(row.outAmt) : "—"}</td>
            <td style={{ ...C.td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", background: "#F0FDF4", color: row.balance >= 0 ? "#065F46" : "#DC2626", whiteSpace: "nowrap" }}>{fmtAED(row.balance)}</td>
            <td style={C.td}>{hasPermission(userRole, 'canEditTxns') && <button style={C.btn("secondary", true)} onClick={() => setEditTxnId(row.id)}>Edit</button>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );

  return <div>
    <PageHeader title="Banking" sub="Bank accounts and cash — kept separate">
      <button style={C.btn("secondary")} onClick={handleExportBankRows}>Export Excel</button>
      {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn("secondary")} onClick={() => setShowImport(true)}>Import Bank CSV</button>}
      {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShowTransfer(true)}>Transfer</button>}
    </PageHeader>
    <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />

    {/* ══ BANK ACCOUNTS SECTION ═══════════════════════════════════════ */}
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: "#1D4ED8" }} />
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151" }}>Bank Accounts</span>
      </div>

      {bankOnlyAccts.length === 0
        ? <div style={{ ...C.card, padding: "18px 20px", color: "#9CA3AF", fontSize: 13 }}>No bank accounts found. Go to Chart of Accounts and mark an account as "Bank account".</div>
        : <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginBottom: 16 }}>
              {bankOnlyAccts.map(a => {
                const bal = accountBalance(a, ledger);
                return <div key={a.id} style={{ ...C.card, padding: "18px 20px", borderLeft: "4px solid #1D4ED8" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Account {a.code}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: bal >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(bal)}</div>
                </div>;
              })}
            </div>
            <div style={C.card}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 13, color: "#1D4ED8" }}>Bank Transactions</div>
              {ActivityTable(bankRows, "No bank transactions in this period.")}
            </div>
          </>
      }
    </div>

    {/* ══ CASH ACCOUNTS SECTION ════════════════════════════════════════ */}
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: "#D97706" }} />
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151" }}>Cash Accounts</span>
      </div>

      {cashOnlyAccts.length === 0
        ? <div style={{ ...C.card, padding: "18px 20px", color: "#9CA3AF", fontSize: 13 }}>No cash accounts found. Go to Chart of Accounts and mark an account as "Cash / Petty Cash".</div>
        : <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginBottom: 16 }}>
              {cashOnlyAccts.map(a => {
                const bal = accountBalance(a, ledger);
                return <div key={a.id} style={{ ...C.card, padding: "18px 20px", borderLeft: "4px solid #D97706" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Account {a.code}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: bal >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(bal)}</div>
                </div>;
              })}
            </div>
            <div style={C.card}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 13, color: "#D97706" }}>Cash Transactions</div>
              {ActivityTable(cashRows, "No cash transactions in this period.")}
            </div>
          </>
      }
    </div>

    {showImport && <div style={C.modal} onClick={() => setShowImport(false)}>
      <div style={C.mbox(980)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Import Bank CSV</span><button onClick={() => setShowImport(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button></div>
        <div style={C.mbdy}>
          <div style={{ ...C.card, padding: 16, marginBottom: 16, background: "#FFFBEB", borderColor: "#FDE68A" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Recommended file</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>Choose either <b>bank_transactions_import_clean_unique.csv</b> or the latest Mashreq bank statement <b>.txt</b> export. The importer skips rows already posted by using <code>external_id</code> and a backup duplicate check on reference + date + amount.</div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={C.label}>CSV / TXT File</label>
            <input type="file" accept=".csv,text/csv,.txt,text/plain" onChange={e => handleImportFile(e.target.files?.[0])} style={{ ...C.input, padding: 8 }} />
            {importFileName && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>Loaded: {importFileName}</div>}
          </div>

          {importAnalysis && <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
              <div style={{ ...C.card, padding: 14 }}><div style={{ fontSize: 12, color: "#6B7280" }}>Rows in file</div><div style={{ fontSize: 22, fontWeight: 700 }}>{importAnalysis.rows.length}</div></div>
              <div style={{ ...C.card, padding: 14 }}><div style={{ fontSize: 12, color: "#6B7280" }}>Ready to import</div><div style={{ fontSize: 22, fontWeight: 700, color: "#059669" }}>{importAnalysis.ready.length}</div></div>
              <div style={{ ...C.card, padding: 14 }}><div style={{ fontSize: 12, color: "#6B7280" }}>Duplicates skipped</div><div style={{ fontSize: 22, fontWeight: 700, color: "#D97706" }}>{importAnalysis.duplicates.length}</div></div>
              <div style={{ ...C.card, padding: 14 }}><div style={{ fontSize: 12, color: "#6B7280" }}>Need review</div><div style={{ fontSize: 22, fontWeight: 700, color: importAnalysis.unresolved.length ? "#DC2626" : "#059669" }}>{importAnalysis.unresolved.length}</div></div>
            </div>

            <div style={{ ...C.card, marginBottom: 18 }}>
              <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>Narration Mapping</div>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={C.th}>Narration</th><th style={{ ...C.th, textAlign: "right" }}>Rows</th><th style={C.th}>Account</th></tr></thead>
                  <tbody>
                    {importAnalysis.categories.map(cat => <tr key={cat.narration}>
                      <td style={C.td}>{cat.narration}</td>
                      <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{cat.count}</td>
                      <td style={C.td}>
                        <Sel value={narrationMap[cat.narration] || ""} onChange={e => setNarrationMap(prev => ({ ...prev, [cat.narration]: e.target.value }))}>
                          <option value="">— Select account —</option>
                          {importAccounts.filter(a => !a.isBank).map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                        </Sel>
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={C.card}>
              <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>Preview</div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Narration</th><th style={C.th}>Mapped To</th><th style={{ ...C.th, textAlign: "right" }}>Amount</th><th style={C.th}>Status</th></tr></thead>
                  <tbody>
                    {importAnalysis.rows.slice(0, 20).map(item => <tr key={item.externalId}>
                      <td style={C.td}>{fmtDate(item.date)}</td>
                      <td style={C.td}>{item.row.reference}</td>
                      <td style={C.td}>{item.row.narration}</td>
                      <td style={C.td}>{item.offsetAccount ? `${item.offsetAccount.code} — ${item.offsetAccount.name}` : "—"}</td>
                      <td style={{ ...C.td, textAlign: "right", fontWeight: 600, color: item.amountC >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(Math.abs(item.amountC))}</td>
                      <td style={C.td}>
                        {item.issue ? <span style={C.badge("danger")}>{item.issue}</span> : item.duplicate ? <span style={C.badge("warning")}>Duplicate</span> : <span style={C.badge("success")}>Ready</span>}
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </>}
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setShowImport(false)}>Cancel</button>
          <button style={C.btn()} onClick={handleCommitImport}>Import {importAnalysis ? importAnalysis.ready.length : 0} Transactions</button>
        </div>
      </div>
    </div>}

    {showTransfer && <div style={C.modal} onClick={() => setShowTransfer(false)}>
      <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Transfer</span><button onClick={() => setShowTransfer(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button></div>
        <div style={C.mbdy}>
          <div style={C.fg}>
            <div><label style={C.label}>Date</label><Inp type="date" value={tf.date} onChange={e => setTf(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>From</label>
              <Sel value={tf.fromCode} onChange={e => setTf(p => ({ ...p, fromCode: e.target.value }))}>
                <option value="">— Select —</option>
                {bankOnlyAccts.length > 0 && <optgroup label="Bank Accounts">{bankOnlyAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
                {cashOnlyAccts.length > 0 && <optgroup label="Cash Accounts">{cashOnlyAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
              </Sel>
            </div>
            <div><label style={C.label}>To</label>
              <Sel value={tf.toCode} onChange={e => setTf(p => ({ ...p, toCode: e.target.value }))}>
                <option value="">— Select —</option>
                {bankOnlyAccts.length > 0 && <optgroup label="Bank Accounts">{bankOnlyAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
                {cashOnlyAccts.length > 0 && <optgroup label="Cash Accounts">{cashOnlyAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
              </Sel>
            </div>
            <div><label style={C.label}>Amount (AED)</label><Inp type="number" value={tf.amount} onChange={e => setTf(p => ({ ...p, amount: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={C.label}>Memo</label><Inp value={tf.memo} onChange={e => setTf(p => ({ ...p, memo: e.target.value }))} /></div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShowTransfer(false)}>Cancel</button><button style={C.btn()} onClick={handleTransfer}>Post Transfer</button></div>
      </div>
    </div>}

    <TxnEditModal open={!!editTxn} txn={editTxn} accounts={accounts} requireBankLine={true} onClose={() => setEditTxnId("")} onSave={handleSaveEdit} />
  </div>;
}

function COAPage({ accounts, setAccounts, ledger, userRole }) {
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState("All");
  const empty = { code: "", name: "", type: "Expense", isBank: false, isCash: false, isOutputVAT: false, isInputVAT: false };

  useEffect(() => {
    const h = () => { setEdit(null); setShow(true); };
    document.addEventListener("add-account", h);
    return () => document.removeEventListener("add-account", h);
  }, []);

  const save = (a) => {
    if (!a.code || !a.name) { toast("Code and name required", "warning"); return; }
    if (a.id) setAccounts(prev => prev.map(x => x.id === a.id ? a : x));
    else setAccounts(prev => [...prev, { ...a, id: "a" + a.code }]);
    setShow(false); setEdit(null);
    toast("Account saved", "success");
  };

  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const filtered = filter === "All" ? sorted : sorted.filter(a => a.type === filter);

  return <div>
    <PageHeader title="Chart of Accounts" sub={`${accounts.length} accounts — Clean COA (no AR/AP)`}>
      <Sel value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="All">All Types</option>
        {ACCT_TYPES.map(t => <option key={t}>{t}</option>)}
      </Sel>
      {hasPermission(userRole, 'canManageAccounts') && <button style={C.btn()} onClick={() => { setEdit(null); setShow(true); }}>+ Add Account</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Code</th><th style={C.th}>Name</th><th style={C.th}>Type</th><th style={C.th}>Flags</th><th style={{ ...C.th, textAlign: "right" }}>Balance</th><th style={C.th}>Actions</th></tr></thead>
        <tbody>
          {filtered.map(a => {
            const bal = accountBalance(a, ledger);
            const flags = [a.isBank && "Bank", a.isCash && "Cash", a.isOutputVAT && "Out VAT", a.isInputVAT && "In VAT"].filter(Boolean);
            return <tr key={a.id}>
              <td style={{ ...C.td, fontFamily: "monospace", fontWeight: 600 }}>{a.code}</td>
              <td style={C.td}>{a.name}</td>
              <td style={C.td}><span style={C.badge(a.type === "Asset" || a.type === "Revenue" ? "success" : a.type === "Liability" ? "danger" : a.type === "Expense" ? "warning" : "info")}>{a.type}</span></td>
              <td style={C.td}>{flags.length > 0 ? flags.map((f, i) => <span key={i} style={{ ...C.badge("gold"), marginRight: 4 }}>{f}</span>) : "—"}</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 600, color: bal !== 0 ? (bal > 0 ? "#059669" : "#DC2626") : "#9CA3AF" }}>{fmtAED(bal)}</td>
              <td style={C.td}>{hasPermission(userRole, 'canManageAccounts') && <button style={C.btn("secondary", true)} onClick={() => { setEdit(a); setShow(true); }}>Edit</button>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{edit?.id ? "Edit" : "New"} Account</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <div style={C.fg}>
            <div><label style={C.label}>Account Code</label><Inp value={(edit || empty).code} onChange={e => setEdit(p => ({ ...(p || empty), code: e.target.value }))} /></div>
            <div><label style={C.label}>Account Name</label><Inp value={(edit || empty).name} onChange={e => setEdit(p => ({ ...(p || empty), name: e.target.value }))} /></div>
            <div><label style={C.label}>Type</label><Sel value={(edit || empty).type} onChange={e => setEdit(p => ({ ...(p || empty), type: e.target.value }))}>{ACCT_TYPES.map(t => <option key={t}>{t}</option>)}</Sel></div>
            <div><label style={C.label}>Account Type Flag</label>
              <Sel value={(edit || empty).isBank ? "bank" : (edit || empty).isCash ? "cash" : "none"}
                onChange={e => setEdit(p => ({ ...(p || empty), isBank: e.target.value === "bank", isCash: e.target.value === "cash" }))}>
                <option value="none">Regular account</option>
                <option value="bank">Bank account (appears in Banking · bank section)</option>
                <option value="cash">Cash / Petty Cash (appears in Banking · cash section)</option>
              </Sel>
            </div>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={() => save(edit || empty)}>💾 Save</button></div>
      </div>
    </div>}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  JOURNAL ENTRIES
// ╚══════════════════════════════════════════════════╝
function JournalPage({ accounts, txns, setTxns, saveTxn, persistTxn, journal, userRole }) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("All");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [form, setForm] = useState({ date: todayStr(), description: "", counterparty: "", lines: [{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }] });

  useEffect(() => {
    const h = () => setShow(true);
    document.addEventListener("add-txn", h);
    return () => document.removeEventListener("add-txn", h);
  }, []);

  const filtered = useMemo(() => {
    const rows = (filter === "All" ? txns : txns.filter(t => t.txnType === filter)).map(t => ({
      ...t,
      totalDr: t.lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0,
      typeLabel: TXN_TYPES[t.txnType]?.label || t.txnType || "?",
      statusLabel: t.isVoid ? "VOID" : "Posted",
      actionLabel: t.isVoid ? "No Action" : "Void"
    }));
    const getVal = (row) => {
      switch (sortKey) {
        case "date": return row.date || "";
        case "ref": return row.ref || "";
        case "type": return row.typeLabel || "";
        case "description": return row.description || "";
        case "counterparty": return row.counterparty || "";
        case "totalDr": return row.totalDr || 0;
        case "status": return row.statusLabel || "";
        case "actions": return row.actionLabel || "";
        default: return "";
      }
    };
    rows.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      let cmp = 0;
      if (typeof av === "number" || typeof bv === "number") cmp = Number(av || 0) - Number(bv || 0);
      else cmp = String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filter, txns, sortKey, sortDir]);

  const handlePost = async () => {
    const lines = form.lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0));
    if (lines.length < 2) { toast("Need at least 2 lines", "warning"); return; }
    try {
      const txn = journal.post({ date: form.date, description: form.description, ref: `JV-${Date.now().toString(36).toUpperCase()}`, counterparty: form.counterparty, tags: "manual", txnType: "JV", commit: false, lines: lines.map(l => ({ id: uid(), accountId: l.accountId, debit: toCents(l.debit || 0), credit: toCents(l.credit || 0), memo: l.memo || "" })) });
      await persistTxn(txn);
      toast("Journal entry posted!", "success");
      setShow(false);
      setForm({ date: todayStr(), description: "", counterparty: "", lines: [{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }] });
    } catch (err) { toast(err.message, "error"); }
  };

  const handleVoid = (txnId) => {
    if (!confirm("Void this transaction? A reversal entry will be created.")) return;
    try {
      journal.reverseTransaction(txnId);
      setTxns(prev => prev.map(t => t.id === txnId ? { ...t, isVoid: true } : t));
      toast("Transaction voided and reversed", "success");
    } catch (err) { toast(err.message, "error"); }
  };
  const toggleSort = (key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir(key === "date" ? "desc" : "asc");
      return key;
    });
  };

  const journalCol = {
    date: { width: 92, whiteSpace: "nowrap", verticalAlign: "top" },
    ref: { width: 360, verticalAlign: "top" },
    type: { width: 132, whiteSpace: "nowrap", verticalAlign: "top" },
    description: { width: 280, verticalAlign: "top", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.45 },
    party: { width: 180, verticalAlign: "top", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.45 },
    amount: { width: 120, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" },
    status: { width: 92, whiteSpace: "nowrap", verticalAlign: "top" },
    actions: { width: 130, whiteSpace: "nowrap", verticalAlign: "top" },
  };

  return <div>
    <PageHeader title="Journal Entries" sub={`${txns.length} entries — General Ledger`}>
      <Sel value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="All">All Types</option>
        {Object.entries(TXN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Sel>
      {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShow(true)}>+ Manual Journal</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Type</th><th style={C.th}>Description</th><th style={C.th}>Party</th><th style={{ ...C.th, textAlign: "right" }}>Total DR</th><th style={C.th}>Status</th><th style={C.th}>Actions</th></tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={8} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No journal entries found.</td></tr>}
          {filtered.map(t => {
            const totalDr = t.lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0;
            const typeInfo = TXN_TYPES[t.txnType] || { label: t.txnType || "?" };
            return <tr key={t.id} style={{ opacity: t.isVoid ? 0.5 : 1 }}>
              <td style={C.td}>{fmtDate(t.date)}</td>
              <td style={C.td}><span style={C.badge("info")}>{t.ref}</span></td>
              <td style={C.td}><span style={C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "neutral")}>{typeInfo.label}</span></td>
              <td style={C.td}>{t.description?.substring(0, 50)}{t.description?.length > 50 ? "…" : ""}</td>
              <td style={C.td}>{t.counterparty || "—"}</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(totalDr)}</td>
              <td style={C.td}>{t.isVoid ? <span style={C.badge("danger")}>VOID</span> : <span style={C.badge("success")}>Posted</span>}</td>
              <td style={C.td}>{!t.isVoid && hasPermission(userRole, 'canVoidTxns') && <button style={C.btn("danger", true)} onClick={() => handleVoid(t.id)}>Void</button>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {/* Manual Journal Entry Modal */}
    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(760)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>📒 Manual Journal Entry</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>Description</label><Inp value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><label style={C.label}>Counterparty</label><Inp value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))} /></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={C.th}>Account</th><th style={{ ...C.th, width: 120 }}>Debit (AED)</th><th style={{ ...C.th, width: 120 }}>Credit (AED)</th><th style={{ ...C.th, width: 180 }}>Memo</th><th style={{ ...C.th, width: 40 }}></th></tr></thead>
            <tbody>
              {form.lines.map((l, i) => <tr key={i}>
                <td style={C.td}><Sel value={l.accountId} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], accountId: e.target.value }; setForm(p => ({ ...p, lines })); }}>
                  <option value="">— Select —</option>
                  {accounts.sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Sel></td>
                <td style={C.td}><Inp type="number" value={l.debit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], debit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                <td style={C.td}><Inp type="number" value={l.credit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], credit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                <td style={C.td}><Inp value={l.memo || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], memo: e.target.value }; setForm(p => ({ ...p, lines })); }} /></td>
                <td style={C.td}>{form.lines.length > 2 && <button style={C.btn("ghost", true)} onClick={() => setForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}>✕</button>}</td>
              </tr>)}
            </tbody>
          </table>
          <button style={{ ...C.btn("secondary", true), marginTop: 8 }} onClick={() => setForm(p => ({ ...p, lines: [...p.lines, { accountId: "", debit: 0, credit: 0, memo: "" }] }))}>+ Add Line</button>
          <div style={{ marginTop: 12, padding: 10, background: "#F9FAFB", borderRadius: 7, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
            <span>Total Debit: {form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2)}</span>
            <span>Total Credit: {form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2)}</span>
            <span style={{ color: Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "#059669" : "#DC2626" }}>
              {Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "✅ Balanced" : "❌ Unbalanced"}
            </span>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn("success")} onClick={handlePost}>✅ Post Journal</button></div>
      </div>
    </div>}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  REPORTS PAGE
// ╚══════════════════════════════════════════════════╝
function JournalPageV2({ accounts, txns, setTxns, saveTxn, persistTxn, deleteTxn, journal, userRole }) {
  const [show, setShow] = useState(false);
  const [editTxnId, setEditTxnId] = useState("");
  const [filter, setFilter] = useState("All");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [dateFilter, setDateFilter] = useState(() => { const r = computeDateRange("this_month"); return { preset: "this_month", ...r }; });
  const [form, setForm] = useState({ date: todayStr(), description: "", counterparty: "", lines: [{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }] });
  const editTxn = useMemo(() => txns.find(t => t.id === editTxnId) || null, [txns, editTxnId]);

  useEffect(() => {
    const h = () => setShow(true);
    document.addEventListener("add-txn", h);
    return () => document.removeEventListener("add-txn", h);
  }, []);

  const filtered = useMemo(() => {
    const dateTxns = txns.filter(t => (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to));
    const rows = (filter === "All" ? dateTxns : dateTxns.filter(t => t.txnType === filter)).map(t => ({
      ...t,
      totalDr: t.lines?.reduce((s, l) => s + (l.debit || 0), 0) || 0,
      typeLabel: TXN_TYPES[t.txnType]?.label || t.txnType || "?",
      statusLabel: t.isVoid ? "VOID" : "Posted",
      actionLabel: t.isVoid ? "" : [hasPermission(userRole, 'canEditTxns') ? "Edit" : "", hasPermission(userRole, 'canVoidTxns') ? "Reverse / Delete" : ""].filter(Boolean).join(" / ")
    }));
    const getVal = (row) => {
      switch (sortKey) {
        case "date": return row.date || "";
        case "ref": return row.ref || "";
        case "type": return row.typeLabel || "";
        case "description": return row.description || "";
        case "counterparty": return row.counterparty || "";
        case "totalDr": return row.totalDr || 0;
        case "status": return row.statusLabel || "";
        case "actions": return row.actionLabel || "";
        default: return "";
      }
    };
    rows.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      let cmp = 0;
      if (typeof av === "number" || typeof bv === "number") cmp = Number(av || 0) - Number(bv || 0);
      else cmp = String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filter, txns, sortKey, sortDir, userRole, dateFilter]);

  const handlePost = async () => {
    const lines = form.lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0));
    if (lines.length < 2) { toast("Need at least 2 lines", "warning"); return; }
    try {
      const txn = journal.post({ date: form.date, description: form.description, ref: `JV-${Date.now().toString(36).toUpperCase()}`, counterparty: form.counterparty, tags: "manual", txnType: "JV", commit: false, lines: lines.map(l => ({ id: uid(), accountId: l.accountId, debit: toCents(l.debit || 0), credit: toCents(l.credit || 0), memo: l.memo || "" })) });
      await persistTxn(txn);
      toast("Journal entry posted!", "success");
      setShow(false);
      setForm({ date: todayStr(), description: "", counterparty: "", lines: [{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }] });
    } catch (err) { toast(err.message, "error"); }
  };

  const handleReverse = async (txnId) => {
    if (!confirm("Create a reversal entry? The original will be marked as VOID.")) return;
    try {
      const reversalTxn = journal.reverseTransaction(txnId, todayStr(), "Reversal", false);
      const original = txns.find(t => t.id === txnId);
      await persistTxn({ ...original, isVoid: true });
      await persistTxn(reversalTxn);
      toast("Transaction reversed and voided", "success");
    } catch (err) { toast(err.message, "error"); }
  };
  const handleDelete = async (txnId) => {
    if (!confirm("Permanently delete this transaction? This cannot be undone.")) return;
    try {
      await deleteTxn(txnId);
      toast("Transaction deleted", "success");
    } catch (err) { toast(err.message, "error"); }
  };
  const handleSaveEdit = (updatedTxn) => {
    setTxns(prev => prev.map(t => t.id === updatedTxn.id ? updatedTxn : t));
    setEditTxnId("");
    toast("Journal entry updated", "success");
  };

  const toggleSort = (key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir(key === "date" ? "desc" : "asc");
      return key;
    });
  };

  const journalCol = {
    date: { width: 92, whiteSpace: "nowrap", verticalAlign: "top" },
    ref: { width: 360, verticalAlign: "top" },
    type: { width: 132, whiteSpace: "nowrap", verticalAlign: "top" },
    description: { width: 280, verticalAlign: "top", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.45 },
    party: { width: 180, verticalAlign: "top", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.45 },
    amount: { width: 120, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" },
    status: { width: 92, whiteSpace: "nowrap", verticalAlign: "top" },
    actions: { width: 190, whiteSpace: "nowrap", verticalAlign: "top" },
  };

  return <div>
    <PageHeader title="Journal Entries" sub={`${filtered.length} of ${txns.length} entries — General Ledger`}>
      <Sel value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="All">All Types</option>
        {Object.entries(TXN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Sel>
      {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShow(true)}>+ Manual Journal</button>}
    </PageHeader>
    <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />

    <div style={C.card}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead><tr>
            <SortTh label="Date" sortKey={sortKey} activeKey="date" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Ref" sortKey={sortKey} activeKey="ref" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Type" sortKey={sortKey} activeKey="type" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Description" sortKey={sortKey} activeKey="description" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Party" sortKey={sortKey} activeKey="counterparty" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Total DR" sortKey={sortKey} activeKey="totalDr" sortDir={sortDir} onToggle={toggleSort} align="right" />
            <SortTh label="Status" sortKey={sortKey} activeKey="status" sortDir={sortDir} onToggle={toggleSort} />
            <SortTh label="Actions" sortKey={sortKey} activeKey="actions" sortDir={sortDir} onToggle={toggleSort} />
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No journal entries found.</td></tr>}
            {filtered.map(t => {
              const typeInfo = TXN_TYPES[t.txnType] || { label: t.txnType || "?" };
              return <tr key={t.id} style={{ opacity: t.isVoid ? 0.5 : 1 }}>
                <td style={{ ...C.td, ...journalCol.date }}>{fmtDate(t.date)}</td>
                <td style={{ ...C.td, ...journalCol.ref }}>
                  <span title={t.ref || ""} style={{ ...C.badge("info"), display: "inline-block", maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.45 }}>
                    {t.ref || "—"}
                  </span>
                </td>
                <td style={{ ...C.td, ...journalCol.type }}><span style={C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "neutral")}>{typeInfo.label}</span></td>
                <td style={{ ...C.td, ...journalCol.description }} title={t.description || ""}>{t.description || "—"}</td>
                <td style={{ ...C.td, ...journalCol.party }} title={t.counterparty || ""}>{t.counterparty || "—"}</td>
                <td style={{ ...C.td, ...journalCol.amount }}>{fmtAED(t.totalDr)}</td>
                <td style={{ ...C.td, ...journalCol.status }}>{t.isVoid ? <span style={C.badge("danger")}>VOID</span> : <span style={C.badge("success")}>Posted</span>}</td>
                <td style={{ ...C.td, ...journalCol.actions }}>
                  {!t.isVoid && hasPermission(userRole, 'canEditTxns') && <button style={{ ...C.btn("secondary", true), marginRight: 4 }} onClick={() => setEditTxnId(t.id)}>Edit</button>}
                  {!t.isVoid && hasPermission(userRole, 'canVoidTxns') && <>
                    <button style={{ ...C.btn("danger", true), marginRight: 4, background: "#D97706" }} onClick={() => handleReverse(t.id)}>Reverse</button>
                    <button style={C.btn("danger", true)} onClick={() => handleDelete(t.id)}>Delete</button>
                  </>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>

    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(760)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>Manual Journal Entry</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>Description</label><Inp value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><label style={C.label}>Counterparty</label><Inp value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))} /></div>
          </div>
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={C.th}>Account</th><th style={{ ...C.th, width: 120 }}>Debit (AED)</th><th style={{ ...C.th, width: 120 }}>Credit (AED)</th><th style={{ ...C.th, width: 180 }}>Memo</th><th style={{ ...C.th, width: 40 }}></th></tr></thead>
              <tbody>
                {form.lines.map((l, i) => <tr key={i}>
                  <td style={C.td}><Sel value={l.accountId} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], accountId: e.target.value }; setForm(p => ({ ...p, lines })); }}>
                    <option value="">— Select —</option>
                    {accounts.slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </Sel></td>
                  <td style={C.td}><Inp type="number" value={l.debit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], debit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                  <td style={C.td}><Inp type="number" value={l.credit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], credit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                  <td style={C.td}><Inp value={l.memo || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], memo: e.target.value }; setForm(p => ({ ...p, lines })); }} /></td>
                  <td style={C.td}>{form.lines.length > 2 && <button style={C.btn("ghost", true)} onClick={() => setForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}>x</button>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <button style={{ ...C.btn("secondary", true), marginTop: 8 }} onClick={() => setForm(p => ({ ...p, lines: [...p.lines, { accountId: "", debit: 0, credit: 0, memo: "" }] }))}>+ Add Line</button>
          <div style={{ marginTop: 12, padding: 10, background: "#F9FAFB", borderRadius: 7, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
            <span>Total Debit: {form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2)}</span>
            <span>Total Credit: {form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2)}</span>
            <span style={{ color: Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "#059669" : "#DC2626" }}>
              {Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "Balanced" : "Unbalanced"}
            </span>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn("success")} onClick={handlePost}>Post Journal</button></div>
      </div>
    </div>}

    <TxnEditModal open={!!editTxn} txn={editTxn} accounts={accounts} requireBankLine={!!editTxn && (editTxn.lines || []).some(l => isBankAccount(accounts.find(a => a.id === l.accountId)))} onClose={() => setEditTxnId("")} onSave={handleSaveEdit} />
  </div>;
}

function ReportsPage({ accounts, txns, settings }) {
  const [tab, setTab] = useState("pnl");
  const [dateFilter, setDateFilter] = useState(() => { const r = computeDateRange("this_month"); return { preset: "this_month", ...r }; });
  const tabs = [
    { id: "pnl", label: "Profit & Loss" }, { id: "bs", label: "Balance Sheet" },
    { id: "tb", label: "Trial Balance" }, { id: "gl", label: "General Ledger" },
    { id: "cf", label: "Cash Flow" }, { id: "equity", label: "Changes in Equity" },
    { id: "notes", label: "Notes to FS" },
  ];

  // Date-filtered transactions and ledger (P&L, TB, GL) — within the from→to range
  const filteredTxns = useMemo(() => txns.filter(t => (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to)), [txns, dateFilter]);
  const filteredLedger = useMemo(() => buildLedger(filteredTxns, accounts), [filteredTxns, accounts]);

  // To-date ledger — all transactions UP TO the selected end date (Balance Sheet)
  const toDateTxns = useMemo(() => txns.filter(t => !dateFilter.to || (t.date || "") <= dateFilter.to), [txns, dateFilter.to]);
  const toDateLedger = useMemo(() => buildLedger(toDateTxns, accounts), [toDateTxns, accounts]);

  // Opening ledger — all transactions BEFORE the start of the period (for CF, Equity opening balances)
  const openingTxns = useMemo(() => txns.filter(t => !dateFilter.from || (t.date || "") < dateFilter.from), [txns, dateFilter.from]);
  const openingLedger = useMemo(() => buildLedger(openingTxns, accounts), [openingTxns, accounts]);

  // P&L totals
  const revenues = accounts.filter(a => a.type === "Revenue");
  const expenses = accounts.filter(a => a.type === "Expense");
  const totalRev = revenues.reduce((s, a) => s + accountBalance(a, filteredLedger), 0);
  const totalExp = expenses.reduce((s, a) => s + accountBalance(a, filteredLedger), 0);

  // Balance Sheet totals
  const assets      = accounts.filter(a => a.type === "Asset");
  const liabilities = accounts.filter(a => a.type === "Liability");
  const equity      = accounts.filter(a => a.type === "Equity");
  const totalAssets      = assets.reduce((s, a) => s + accountBalance(a, toDateLedger), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + accountBalance(a, toDateLedger), 0);
  const totalEquity      = equity.reduce((s, a) => s + accountBalance(a, toDateLedger), 0);
  const bsNetRev  = revenues.reduce((s, a) => s + accountBalance(a, toDateLedger), 0);
  const bsNetExp  = expenses.reduce((s, a) => s + accountBalance(a, toDateLedger), 0);
  const netIncome = bsNetRev - bsNetExp;

  // GL and TB look better in landscape (wider columns)
  const isWide = tab === "gl" || tab === "tb";
  const handlePrint = () => rptPrint(isWide);
  const handlePDF   = () => rptPrint(isWide);

  return <div>
    <PageHeader title="Reports" sub="Financial statements" />

    {/* Controls — hidden during print */}
    <div className="no-print">
      <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map(t => <button key={t.id} style={{ ...C.btn(tab === t.id ? "primary" : "secondary"), fontSize: 13 }} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        <RptActions onPrint={handlePrint} onPDF={handlePDF} />
      </div>
    </div>

    {/* ── Screen view — card/dashboard UI, hidden during print */}
    <div className="no-print">
      {tab === "pnl" && <PLReport
        accounts={accounts}
        filteredLedger={filteredLedger}
        totalRev={totalRev}
        totalExp={totalExp}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "bs" && <BSReport
        accounts={accounts}
        toDateLedger={toDateLedger}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        totalEquity={totalEquity}
        netIncome={netIncome}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "tb" && <TBReport
        accounts={accounts}
        filteredLedger={filteredLedger}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "gl" && <GLReport
        accounts={accounts}
        txns={txns}
        filteredTxns={filteredTxns}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "cf" && <CFReport
        accounts={accounts}
        filteredTxns={filteredTxns}
        openingLedger={openingLedger}
        toDateLedger={toDateLedger}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "equity" && <EquityReport
        accounts={accounts}
        filteredLedger={filteredLedger}
        openingLedger={openingLedger}
        toDateLedger={toDateLedger}
        totalRev={totalRev}
        totalExp={totalExp}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "notes" && <NotesReport
        accounts={accounts}
        filteredLedger={filteredLedger}
        toDateLedger={toDateLedger}
        filteredTxns={filteredTxns}
        totalRev={totalRev}
        totalExp={totalExp}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        totalEquity={totalEquity}
        dateFilter={dateFilter}
        settings={settings}
      />}
    </div>

    {/* ── Print document — hidden on screen (display:none), shown only in @media print */}
    <div id="rpt-print-area">
      {tab === "pnl" && <PLPrintDoc
        accounts={accounts}
        filteredLedger={filteredLedger}
        totalRev={totalRev}
        totalExp={totalExp}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "bs" && <BSPrintDoc
        accounts={accounts}
        toDateLedger={toDateLedger}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        totalEquity={totalEquity}
        netIncome={netIncome}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "tb" && <TBPrintDoc
        accounts={accounts}
        filteredLedger={filteredLedger}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "gl" && <GLPrintDoc
        accounts={accounts}
        txns={txns}
        filteredTxns={filteredTxns}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "cf" && <CFPrintDoc
        accounts={accounts}
        filteredTxns={filteredTxns}
        openingLedger={openingLedger}
        toDateLedger={toDateLedger}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "equity" && <EquityPrintDoc
        accounts={accounts}
        filteredLedger={filteredLedger}
        openingLedger={openingLedger}
        toDateLedger={toDateLedger}
        totalRev={totalRev}
        totalExp={totalExp}
        dateFilter={dateFilter}
        settings={settings}
      />}
      {tab === "notes" && <NotesPrintDoc
        accounts={accounts}
        filteredLedger={filteredLedger}
        toDateLedger={toDateLedger}
        filteredTxns={filteredTxns}
        totalRev={totalRev}
        totalExp={totalExp}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        totalEquity={totalEquity}
        dateFilter={dateFilter}
        settings={settings}
      />}
    </div>
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  VAT PAGE
// ╚══════════════════════════════════════════════════╝
function VATPage({ accounts, txns, ledger, settings }) {
  const [dateFilter, setDateFilter] = useState(() => { const r = computeDateRange("this_month"); return { preset: "this_month", ...r }; });
  const outputVATA = accounts.find(a => a.isOutputVAT);
  const inputVATA = accounts.find(a => a.isInputVAT);
  const inDateRange = t => (!dateFilter.from || (t.date || "") >= dateFilter.from) && (!dateFilter.to || (t.date || "") <= dateFilter.to);
  const settlementRows = txns
    .filter(t => !t.isVoid && inDateRange(t) && isVATSettlementTxn(t, accounts))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(t => {
      const outAmt = (t.lines || []).filter(l => l.accountId === outputVATA?.id).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
      const inAmt = (t.lines || []).filter(l => l.accountId === inputVATA?.id).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
      return { ...t, outAmt, inAmt };
    });
  const vatRows = txns
    .filter(t => !t.isVoid && inDateRange(t) && !isVATSettlementTxn(t, accounts) && t.lines?.some(l => l.accountId === outputVATA?.id || l.accountId === inputVATA?.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(t => {
      const outAmt = (t.lines || []).filter(l => l.accountId === outputVATA?.id).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
      const inAmt = (t.lines || []).filter(l => l.accountId === inputVATA?.id).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
      return { ...t, outAmt, inAmt };
    });
  const outputVAT = vatRows.reduce((sum, row) => sum + row.outAmt, 0);
  const inputVAT = vatRows.reduce((sum, row) => sum + row.inAmt, 0);
  const netVAT = outputVAT - inputVAT;
  const netVatLabel = netVAT > 0 ? "Payable" : netVAT < 0 ? "Refundable" : "Settled";

  // ── VAT Report HTML builder — Sovereign Auditor design ───
  function buildVATReportHTML() {
    var NAVY = "#0F1C2C", GREEN = "#006C49", GREEN_BG = "#6CF8BB", GREEN_TEXT = "#00714D";
    var RED = "#BA1A1A", RED_BG = "#FFDADA", RED_TEXT = "#F83256";
    var SURF = "#F7F9FB", SURF_LO = "#F2F4F6", SURF_HI = "#E6E8EA", SURF_MAX = "#E0E3E5";
    var INK = "#191C1E", INK_VAR = "#44474C", WHITE = "#FFFFFF";
    var company = (settings && settings.company) || "Nasama Properties";
    var trn = (settings && settings.trn) || "Not Set";
    var periodLabel = dateFilter.from && dateFilter.to
      ? fmtDate(dateFilter.from) + " \u2014 " + fmtDate(dateFilter.to)
      : dateFilter.from ? "From " + fmtDate(dateFilter.from)
      : dateFilter.to   ? "Up to " + fmtDate(dateFilter.to)
      : "All Dates";
    var printedOn = new Date().toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
    var netColor = netVAT > 0 ? RED : netVAT < 0 ? GREEN : INK_VAR;
    var netBadgeBg = netVAT > 0 ? RED_BG : netVAT < 0 ? GREEN_BG : SURF_HI;
    var netBadgeText = netVAT > 0 ? RED_TEXT : netVAT < 0 ? GREEN_TEXT : INK_VAR;
    var netStatus = netVAT > 0 ? "PAYABLE TO FTA" : netVAT < 0 ? "REFUND DUE" : "SETTLED";
    function fmt(v) { return fmtAED(v); }
    function numOnly(v) { return fmt(Math.abs(v)).replace(/^AED\s*/, ""); }

    // Output / input split rows
    var outRows = vatRows.filter(function(r) { return r.outAmt > 0; });
    var inRows  = vatRows.filter(function(r) { return r.inAmt  > 0; });

    function txTableRows(rows, amtKey, color) {
      if (!rows.length) return '<tr><td colspan="3" style="padding:14px 12px;text-align:center;color:' + INK_VAR + ';font-size:10pt;">No transactions found.</td></tr>';
      return rows.map(function(row, i) {
        var bg = i % 2 === 0 ? WHITE : SURF_LO;
        return '<tr style="background:' + bg + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
          '<td style="padding:9px 12px;font-size:10pt;font-weight:500;color:' + INK + ';">' + (row.description || row.ref || "\u2014") + '</td>' +
          '<td style="padding:9px 12px;font-size:9.5pt;text-align:right;color:' + INK_VAR + ';">' + fmtDate(row.date) + '</td>' +
          '<td style="padding:9px 12px;font-size:10pt;text-align:right;font-weight:700;color:' + color + ';">' + fmt(row[amtKey]) + '</td>' +
          '</tr>';
      }).join("");
    }

    // Checklist
    var checks = [
      { done: true,  title: "Entity Information Verified",    sub: "TRN and legal name confirmed." },
      { done: true,  title: "VAT Transactions Reconciled",    sub: vatRows.length + " transaction" + (vatRows.length !== 1 ? "s" : "") + " matched to ledger." },
      { done: settlementRows.length > 0, title: "VAT Settlement Recorded", sub: settlementRows.length > 0 ? settlementRows.length + " settlement entr" + (settlementRows.length === 1 ? "y" : "ies") + " recorded." : "No settlement entries this period." },
      { done: false, title: "Final Executive Sign-off",       sub: "Pending internal review." },
    ];
    var checkHTML = checks.map(function(c) {
      var icon = c.done
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + GREEN + '" style="flex-shrink:0;margin-top:1px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09 1.41 1.41L10 16.5z"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' + INK_VAR + '" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/></svg>';
      return '<li style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px;">' + icon +
        '<div><div style="font-size:9.5pt;font-weight:700;color:' + INK + ';line-height:1.3;">' + c.title + '</div>' +
        '<div style="font-size:8pt;color:' + INK_VAR + ';margin-top:2px;">' + c.sub + '</div></div></li>';
    }).join("");

    // Settlement section
    var settlHTML = "";
    if (settlementRows.length > 0) {
      var sRows = settlementRows.map(function(row, i) {
        var bg = i % 2 === 0 ? WHITE : SURF_LO;
        return '<tr style="background:' + bg + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
          '<td style="padding:8px 10px;font-size:9.5pt;color:' + INK + ';">' + fmtDate(row.date) + '</td>' +
          '<td style="padding:8px 10px;font-size:9.5pt;color:' + INK + ';">' + (row.ref || '') + '</td>' +
          '<td style="padding:8px 10px;font-size:9.5pt;color:' + INK + ';">' + (row.description || '') + '</td>' +
          '<td style="padding:8px 10px;font-size:9.5pt;text-align:right;">' + (row.outAmt !== 0 ? fmt(row.outAmt) : "\u2014") + '</td>' +
          '<td style="padding:8px 10px;font-size:9.5pt;text-align:right;">' + (row.inAmt  !== 0 ? fmt(row.inAmt)  : "\u2014") + '</td>' +
          '</tr>';
      }).join("");
      settlHTML = '<div style="margin-top:22px;page-break-inside:avoid;">' +
        '<h3 style="font-size:7.5pt;text-transform:uppercase;letter-spacing:0.15em;font-weight:900;color:' + INK + ';margin-bottom:10px;">VAT Settlement Entries</h3>' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:' + SURF_MAX + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
            '<th style="padding:8px 10px;font-size:7.5pt;text-transform:uppercase;font-weight:700;text-align:left;">Date</th>' +
            '<th style="padding:8px 10px;font-size:7.5pt;text-transform:uppercase;font-weight:700;text-align:left;">Ref</th>' +
            '<th style="padding:8px 10px;font-size:7.5pt;text-transform:uppercase;font-weight:700;text-align:left;">Description</th>' +
            '<th style="padding:8px 10px;font-size:7.5pt;text-transform:uppercase;font-weight:700;text-align:right;">Output Cleared</th>' +
            '<th style="padding:8px 10px;font-size:7.5pt;text-transform:uppercase;font-weight:700;text-align:right;">Input Cleared</th>' +
          '</tr></thead><tbody>' + sRows + '</tbody>' +
        '</table>' +
        '<div style="margin-top:8px;padding:8px 12px;background:#FFF7ED;border-left:3px solid #D97706;font-size:8.5pt;color:#92400E;">Settlement entries clear previously reported VAT balances and are excluded from the totals above.</div>' +
      '</div>';
    }

    return (
      '<div style="font-family:Inter,Arial,Helvetica,sans-serif;background:' + SURF + ';padding:18mm 16mm;color:' + INK + ';min-height:100%;box-sizing:border-box;position:relative;">' +

      // Decorative corner
      '<div style="position:absolute;top:0;right:0;width:72px;height:72px;background:rgba(15,28,44,0.06);border-bottom-left-radius:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;pointer-events:none;"></div>' +

      // ══ HEADER ══
      '<header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:34px;height:34px;background:' + NAVY + ';border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill="white"/><rect x="14" y="3" width="7" height="7" rx="1" fill="white"/><rect x="3" y="14" width="7" height="7" rx="1" fill="white"/><rect x="14" y="14" width="7" height="7" rx="1" fill="rgba(255,255,255,0.45)"/></svg>' +
            '</div>' +
            '<span style="font-size:15pt;font-weight:900;letter-spacing:-0.03em;text-transform:uppercase;color:' + INK + ';">' + company.toUpperCase() + '</span>' +
          '</div>' +
          '<div style="margin-top:12px;">' +
            '<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.2em;font-weight:700;color:' + INK_VAR + ';">Tax Registration Number</div>' +
            '<div style="font-size:10pt;font-weight:600;margin-top:2px;">TRN: ' + trn + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<h1 style="font-size:20pt;font-weight:900;letter-spacing:-0.03em;text-transform:uppercase;color:' + NAVY + ';line-height:1.1;">VAT Return<br/>Report</h1>' +
          '<div style="margin-top:8px;">' +
            '<div style="font-size:9.5pt;font-weight:700;color:' + INK + ';">Period: ' + periodLabel + '</div>' +
            '<div style="font-size:8pt;color:' + INK_VAR + ';margin-top:3px;">Generated: ' + printedOn + '</div>' +
            '<div style="display:inline-flex;align-items:center;gap:5px;background:' + GREEN_BG + ';padding:3px 10px;border-radius:9999px;margin-top:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<svg width="9" height="9" viewBox="0 0 24 24" fill="' + GREEN_TEXT + '"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09 1.41 1.41L10 16.5z"/></svg>' +
              '<span style="font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:' + GREEN_TEXT + ';">UAE VAT 5%</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>' +

      // ══ HERO SUMMARY ══
      '<section style="margin-bottom:28px;">' +
        '<h3 style="font-size:7pt;text-transform:uppercase;letter-spacing:0.22em;font-weight:900;color:' + INK_VAR + ';margin-bottom:12px;display:flex;align-items:center;gap:8px;">' +
          '<span style="display:inline-block;width:24px;height:2px;background:' + NAVY + ';"></span>VAT Summary Narrative' +
        '</h3>' +
        '<div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;">' +
          // Hero card
          '<div style="background:' + WHITE + ';padding:24px 28px;border-radius:8px;outline:1px solid rgba(196,198,204,0.18);position:relative;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
            '<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.18em;font-weight:800;color:' + INK_VAR + ';margin-bottom:6px;">Total Net VAT ' + netVatLabel + '</div>' +
            '<div style="display:flex;align-items:baseline;gap:7px;">' +
              '<span style="font-size:13pt;font-weight:500;color:' + INK_VAR + ';">AED</span>' +
              '<span style="font-size:38pt;font-weight:900;letter-spacing:-0.04em;color:' + netColor + ';line-height:1;">' + numOnly(netVAT) + '</span>' +
            '</div>' +
            '<div style="display:inline-flex;align-items:center;background:' + netBadgeBg + ';padding:4px 12px;border-radius:9999px;margin-top:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<span style="font-size:7.5pt;font-weight:700;color:' + netBadgeText + ';text-transform:uppercase;letter-spacing:0.1em;">' + netStatus + '</span>' +
            '</div>' +
            '<div style="font-size:8pt;color:' + INK_VAR + ';margin-top:10px;line-height:1.6;max-width:340px;">This is the net VAT position for the reporting period. Ensure timely settlement with the Federal Tax Authority via EmaraTax.</div>' +
          '</div>' +
          // Side cards
          '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '<div style="background:' + WHITE + ';padding:14px 16px;border-radius:8px;border-left:4px solid ' + NAVY + ';flex:1;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.15em;font-weight:800;color:' + INK_VAR + ';margin-bottom:6px;">Output VAT</div>' +
              '<div><span style="font-size:7.5pt;font-weight:700;color:' + INK_VAR + ';">AED </span><span style="font-size:16pt;font-weight:900;letter-spacing:-0.02em;color:' + RED + ';">' + numOnly(outputVAT) + '</span></div>' +
            '</div>' +
            '<div style="background:' + WHITE + ';padding:14px 16px;border-radius:8px;border-left:4px solid ' + GREEN + ';flex:1;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.15em;font-weight:800;color:' + INK_VAR + ';margin-bottom:6px;">Recoverable Input</div>' +
              '<div><span style="font-size:7.5pt;font-weight:700;color:' + GREEN + ';">AED </span><span style="font-size:16pt;font-weight:900;letter-spacing:-0.02em;color:' + GREEN + ';">' + numOnly(inputVAT) + '</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      // ══ PAGE 1: Output VAT + Compliance Sidebar ══
      '<div style="display:flex;gap:24px;">' +
        '<div style="flex:2;min-width:0;">' +
          '<h3 style="font-size:7.5pt;text-transform:uppercase;letter-spacing:0.15em;font-weight:900;color:' + INK + ';margin-bottom:10px;">Output VAT Breakdown</h3>' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<thead><tr style="background:' + NAVY + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#fff;text-align:left;">Description</th>' +
              '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#fff;text-align:right;">Date</th>' +
              '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#fff;text-align:right;">VAT Amount</th>' +
            '</tr></thead>' +
            '<tbody>' + txTableRows(outRows, "outAmt", RED) + '</tbody>' +
            '<tfoot><tr style="background:' + SURF_HI + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
              '<td colspan="2" style="padding:9px 12px;font-size:7.5pt;font-weight:900;text-transform:uppercase;color:' + INK + ';">Total Output Tax</td>' +
              '<td style="padding:9px 12px;text-align:right;font-size:10pt;font-weight:900;color:' + RED + ';">' + fmt(outputVAT) + '</td>' +
            '</tr></tfoot>' +
          '</table>' +
        '</div>' +
        '<aside style="flex:1;min-width:0;">' +
          '<div style="background:' + SURF_LO + ';padding:18px;border-radius:8px;outline:1px solid rgba(196,198,204,0.15);">' +
            '<h4 style="font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:' + NAVY + ';margin-bottom:18px;">Compliance Checklist</h4>' +
            '<ul style="list-style:none;padding:0;margin:0;">' + checkHTML + '</ul>' +
            '<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(196,198,204,0.3);text-align:center;">' +
              '<img src="./nasama-stamp.png" alt="Company Stamp" style="width:150px;height:150px;object-fit:contain;display:block;margin:0 auto 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />' +
              '<div style="font-size:7pt;font-weight:700;text-transform:uppercase;color:' + INK + ';">Company Stamp</div>' +
              '<div style="font-size:7pt;color:' + INK_VAR + ';margin-top:2px;">' + company + '</div>' +
            '</div>' +
          '</div>' +
        '</aside>' +
      '</div>' +

      // ══ PAGE BREAK ══
      '<div style="page-break-before:always;"></div>' +

      // ══ PAGE 2: Input VAT table (full width) ══
      '<div>' +
        '<h3 style="font-size:7.5pt;text-transform:uppercase;letter-spacing:0.15em;font-weight:900;color:' + INK + ';margin-bottom:10px;">Input VAT Details</h3>' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:' + SURF_MAX + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
            '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:' + INK + ';text-align:left;">Description</th>' +
            '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:' + INK + ';text-align:right;">Date</th>' +
            '<th style="padding:9px 12px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:' + INK + ';text-align:right;">Recoverable VAT</th>' +
          '</tr></thead>' +
          '<tbody>' + txTableRows(inRows, "inAmt", GREEN) + '</tbody>' +
          '<tfoot><tr style="background:' + SURF_HI + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
            '<td colspan="2" style="padding:9px 12px;font-size:7.5pt;font-weight:900;text-transform:uppercase;color:' + INK + ';">Total Input Tax</td>' +
            '<td style="padding:9px 12px;text-align:right;font-size:10pt;font-weight:900;color:' + GREEN + ';">' + fmt(inputVAT) + '</td>' +
          '</tr></tfoot>' +
        '</table>' +
        settlHTML +
      '</div>' +

      // ══ FOOTER ══
      '<footer style="margin-top:24px;padding-top:14px;border-top:1px solid ' + SURF_HI + ';display:flex;justify-content:space-between;align-items:flex-end;">' +
        '<div>' +
          '<div style="font-size:7.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;color:' + INK + ';">' + company + ' \u00b7 Accounting System v2</div>' +
          '<div style="display:flex;gap:14px;margin-top:4px;">' +
            '<span style="font-size:7pt;font-weight:600;text-transform:uppercase;color:' + INK_VAR + ';">Confidential</span>' +
            '<span style="font-size:7pt;font-weight:600;text-transform:uppercase;color:' + INK_VAR + ';">UAE VAT 5%</span>' +
            '<span style="font-size:7pt;font-weight:600;text-transform:uppercase;color:' + INK_VAR + ';">FTA Registered</span>' +
          '</div>' +
          '<div style="font-size:7pt;color:#74777D;font-style:italic;margin-top:4px;">Electronically generated. No physical signature required for standard filing.</div>' +
        '</div>' +
        '<img src="./nasama-stamp.png" alt="Company Stamp" style="width:150px;height:150px;object-fit:contain;flex-shrink:0;margin-left:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />' +
      '</footer>' +
    '</div>'
    );
  }

  function triggerVATPrint() {
    var old = document.getElementById("__vat_print_iframe__");
    if (old) old.remove();
    var iframe = document.createElement("iframe");
    iframe.id = "__vat_print_iframe__";
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<base href="' + document.baseURI + '">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,600;14..32,700;14..32,800&display=swap">' +
      '<style>*,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;margin:0;padding:0;}' +
      'html,body{background:#F7F9FB;color:#191C1E;font-family:"Inter",Arial,Helvetica,sans-serif;}' +
      '@page{margin:0;size:A4 portrait;}' +
      'table{border-collapse:collapse;width:100%;}thead{display:table-header-group;}tfoot{display:table-footer-group;}tr{page-break-inside:avoid;}' +
      '</style></head><body style="margin:0;padding:0;">' +
      buildVATReportHTML() +
      '</body></html>';
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    function doprint() {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(function() { var f = document.getElementById("__vat_print_iframe__"); if (f) f.remove(); }, 8000);
    }
    try { iframe.contentDocument.fonts.ready.then(function() { doprint(); }); }
    catch(e) { setTimeout(doprint, 700); }
  }

  function handlePrintVAT() { triggerVATPrint(); }
  function handleExportPDFVAT() { triggerVATPrint(); }

  return <div>
    <PageHeader title="VAT / Taxes" sub={`TRN: ${settings.trn || "Not set"} · UAE VAT 5%`}>
      <button onClick={handlePrintVAT} style={{ ...C.btn("secondary"), display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
      <button onClick={handleExportPDFVAT} style={{ ...C.btn(), display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export PDF
      </button>
    </PageHeader>
    <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
    {settlementRows.length > 0 && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #D97706", background: "#FFF7ED", color: "#9A3412", fontSize: 13 }}>
      {settlementRows.length} VAT settlement {settlementRows.length === 1 ? "entry is" : "entries are"} excluded from Output VAT, Input VAT, and Net VAT totals because {settlementRows.length === 1 ? "it settles" : "they settle"} previously reported VAT balances.
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 22 }}>
      <div style={{ ...C.card, padding: "18px 20px", borderTop: "3px solid #DC2626" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6B7280", fontWeight: 600 }}>Output VAT Collected</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#DC2626" }}>{fmtAED(outputVAT)}</div>
      </div>
      <div style={{ ...C.card, padding: "18px 20px", borderTop: "3px solid #059669" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6B7280", fontWeight: 600 }}>Input VAT Recoverable</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#059669" }}>{fmtAED(inputVAT)}</div>
      </div>
      <div style={{ ...C.card, padding: "18px 20px", borderTop: `3px solid ${netVAT > 0 ? "#DC2626" : netVAT < 0 ? "#059669" : "#6B7280"}` }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6B7280", fontWeight: 600 }}>Net VAT {netVatLabel}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: netVAT > 0 ? "#DC2626" : netVAT < 0 ? "#059669" : "#6B7280" }}>{fmtAED(Math.abs(netVAT))}</div>
      </div>
    </div>

    <div style={C.card}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 14 }}>VAT Transactions</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Description</th><th style={{ ...C.th, textAlign: "right" }}>Output VAT</th><th style={{ ...C.th, textAlign: "right" }}>Input VAT</th></tr></thead>
        <tbody>
          {!vatRows.length && <tr><td style={{ ...C.td, textAlign: "center", color: "#6B7280" }} colSpan="5">No VAT transactions found.</td></tr>}
          {vatRows.map(t => <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}>{t.ref}</td><td style={C.td}>{t.description}</td><td style={{ ...C.td, textAlign: "right", color: t.outAmt > 0 ? "#DC2626" : t.outAmt < 0 ? "#059669" : "#9CA3AF" }}>{t.outAmt !== 0 ? fmtAED(t.outAmt) : "—"}</td><td style={{ ...C.td, textAlign: "right", color: t.inAmt > 0 ? "#059669" : t.inAmt < 0 ? "#DC2626" : "#9CA3AF" }}>{t.inAmt !== 0 ? fmtAED(t.inAmt) : "—"}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  SETTINGS PAGE
// ╚══════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════╗
//  PERFORMANCE PAGE
// ╚══════════════════════════════════════════════════╝
function PerformancePage({ deals, setPage }) {
  const DEAL_STAGES = ["Lead", "EOI", "Booking Form Signed", "First Payment Paid", "MOU Signed", "SPA Signed", "Handover", "Commission Earned", "Commission Collected", "Cancelled"];
  const STAGE_COLOR = { "Lead": "#94A3B8", "EOI": "#60A5FA", "Booking Form Signed": "#818CF8", "First Payment Paid": "#A78BFA", "MOU Signed": "#F59E0B", "SPA Signed": "#F97316", "Handover": "#FB923C", "Commission Earned": "#34D399", "Commission Collected": "#059669", "Cancelled": "#EF4444" };
  const TYPE_COLOR = { "Off-Plan": "#2563EB", "Secondary": "#D97706", "Rental": "#059669" };

  // ── Core KPIs ────────────────────────────────────
  const totalDeals = deals.length;
  const collected = deals.filter(d => d.stage === "Commission Collected");
  const earned = deals.filter(d => ["Commission Earned", "Commission Collected"].includes(d.stage));
  const open = deals.filter(d => !["Commission Collected"].includes(d.stage));
  const totalTV = deals.reduce((s, d) => s + (d.transaction_value || 0), 0);
  const totalEC = deals.reduce((s, d) => s + (d.expected_commission_net || 0), 0);
  const collectedEC = collected.reduce((s, d) => s + (d.expected_commission_net || 0), 0);
  const pendingEC = open.reduce((s, d) => s + (d.expected_commission_net || 0), 0);
  const convRate = totalDeals > 0 ? Math.round((collected.length / totalDeals) * 100) : 0;
  const avgTV = totalDeals > 0 ? totalTV / totalDeals : 0;
  const avgCommPct = totalDeals > 0 ? deals.reduce((s, d) => s + parseFloat(d.commission_pct || 0), 0) / totalDeals : 0;

  // ── By Stage ────────────────────────────────────
  const byStage = DEAL_STAGES.map(stage => {
    const ds = deals.filter(d => d.stage === stage);
    return { stage, count: ds.length, commission: ds.reduce((s, d) => s + (d.expected_commission_net || 0), 0) };
  });
  const maxStageCount = Math.max(1, ...byStage.map(r => r.count));

  // ── By Type ─────────────────────────────────────
  const byType = ["Off-Plan", "Secondary", "Rental"].map(type => {
    const ds = deals.filter(d => d.type === type);
    return { type, count: ds.length, value: ds.reduce((s, d) => s + (d.transaction_value || 0), 0), commission: ds.reduce((s, d) => s + (d.expected_commission_net || 0), 0) };
  }).filter(r => r.count > 0);
  const maxTypeCount = Math.max(1, ...byType.map(r => r.count));

  // ── Broker Performance ───────────────────────────
  const brokerMap = new Map();
  deals.forEach(d => {
    const key = d.broker_id || d.broker_name || "__unassigned__";
    const name = d.broker_name || "— Unassigned —";
    if (!brokerMap.has(key)) brokerMap.set(key, { name, deals: 0, value: 0, commission: 0, collected: 0 });
    const b = brokerMap.get(key);
    b.deals++; b.value += (d.transaction_value || 0); b.commission += (d.expected_commission_net || 0);
    if (d.stage === "Commission Collected") b.collected++;
  });
  const allBrokerPerf = [...brokerMap.values()].sort((a, b) => b.commission - a.commission);
  const brokerPerf = allBrokerPerf.filter(b => b.name !== "— Unassigned —").slice(0, 10);
  const maxBrokerComm = Math.max(1, ...brokerPerf.map(b => b.commission));

  // ── Developer Leaderboard ───────────────────────
  const devMap = new Map();
  deals.forEach(d => {
    if (!d.developer) return;
    if (!devMap.has(d.developer)) devMap.set(d.developer, { name: d.developer, deals: 0, value: 0, commission: 0 });
    const dv = devMap.get(d.developer);
    dv.deals++; dv.value += (d.transaction_value || 0); dv.commission += (d.expected_commission_net || 0);
  });
  const devPerf = [...devMap.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  const maxDevValue = Math.max(1, ...devPerf.map(d => d.value));

  // ── Top Deals ───────────────────────────────────
  const topDeals = [...deals].sort((a, b) => (b.expected_commission_net || 0) - (a.expected_commission_net || 0)).slice(0, 6);

  const kpiTile = (label, value, sub, accent, wide) => (
    <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, boxShadow: "0 1px 3px rgba(16,24,40,.06)", padding: "20px 20px 16px", position: "relative", overflow: "hidden", gridColumn: wide ? "span 2" : undefined }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "14px 14px 0 0" }} />
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.09em", color: "#98A2B3", fontWeight: 600, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: NAVY, lineHeight: 1.1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 8 }}>{sub}</div>
    </div>
  );

  const sectionCard = (title, sub, children, action) => (
    <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, boxShadow: "0 1px 3px rgba(16,24,40,.06)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #EAECF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: NAVY }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 3 }}>{sub}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Performance" sub="Deal pipeline, broker output, and commission analytics" />

      {/* ── Hero Banner ── */}
      <div style={{ ...C.card, marginBottom: 24, padding: 28, background: "linear-gradient(140deg, #0C0F1E 0%, #1a2a6c 50%, #1a4734 100%)", color: "#fff", border: "none", position: "relative", overflow: "hidden", boxShadow: "0 20px 48px rgba(8,12,26,.3)" }}>
        <div style={{ position: "absolute", top: -60, right: -20, width: 220, height: 220, borderRadius: "50%", background: "rgba(201,160,68,.07)" }} />
        <div style={{ position: "absolute", bottom: -50, left: -30, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,.03)" }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: GOLD, fontWeight: 700, marginBottom: 12, opacity: 0.9 }}>Performance Intelligence</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 10, letterSpacing: "-0.02em" }}>
              {convRate >= 50 ? "Pipeline is converting well." : convRate >= 25 ? "Pipeline needs stronger closing." : "Pipeline is early-stage heavy."}
            </div>
            <div style={{ fontSize: 13.5, color: "#E5E7EB", lineHeight: 1.7 }}>
              <strong>{totalDeals}</strong> total deals tracked · <strong>{collected.length}</strong> collected · <strong>{convRate}%</strong> conversion rate. Total pipeline commission expected: <strong>{fmtAED(totalEC)}</strong>.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Total Commission", value: fmtAED(totalEC), tone: GOLD },
              { label: "Collected", value: fmtAED(collectedEC), tone: "#6EE7B7" },
              { label: "Pending Pipeline", value: fmtAED(pendingEC), tone: "#93C5FD" },
              { label: "Conversion Rate", value: `${convRate}%`, tone: convRate >= 50 ? "#6EE7B7" : "#FCA5A5" },
            ].map(item => (
              <div key={item.label} style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.10)" }}>
                <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,.5)", fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: item.tone, marginTop: 8, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 22 }}>
        {kpiTile("Total Deals", totalDeals, "All time across all stages", "#2563EB")}
        {kpiTile("Total Transaction Value", fmtAED(totalTV), "Sum of all property values", "#7C3AED")}
        {kpiTile("Expected Commission", fmtAED(totalEC), "Gross commission expected", GOLD)}
        {kpiTile("Commission Collected", fmtAED(collectedEC), `${collected.length} deals fully closed`, "#059669")}
        {kpiTile("Pending Pipeline", fmtAED(pendingEC), `${open.length} deals still progressing`, "#0EA5E9")}
        {kpiTile("Conversion Rate", `${convRate}%`, `${collected.length} of ${totalDeals} deals collected`, convRate >= 50 ? "#059669" : "#F59E0B")}
        {kpiTile("Avg. Deal Value", fmtAED(Math.round(avgTV)), "Average property transaction size", "#475569")}
        {kpiTile("Avg. Commission %", `${avgCommPct.toFixed(1)}%`, "Average commission rate across all deals", "#DC2626")}
      </div>

      {/* ── Stage Funnel + Deal Type ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
        {sectionCard("Pipeline Funnel", "Deals by stage — from lead to collected",
          <div>
            {byStage.map(row => (
              <div key={row.stage} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{row.stage}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{fmtAED(row.commission)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: STAGE_COLOR[row.stage], minWidth: 22, textAlign: "right" }}>{row.count}</span>
                  </div>
                </div>
                <div style={{ height: 9, borderRadius: 999, background: "#F3F4F6", overflow: "hidden" }}>
                  <div style={{ width: row.count === 0 ? "0%" : `${Math.max(4, (row.count / maxStageCount) * 100)}%`, height: "100%", background: STAGE_COLOR[row.stage], borderRadius: 999, transition: "width .5s ease" }} />
                </div>
              </div>
            ))}
          </div>,
          <button style={C.btn("ghost", true)} onClick={() => setPage("deals")}>View Deals →</button>
        )}

        {sectionCard("Deal Type Breakdown", "Splits by Off-Plan, Secondary, Rental",
          <div>
            {byType.map(row => (
              <div key={row.type} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ ...C.badge(row.type === "Off-Plan" ? "info" : row.type === "Secondary" ? "gold" : "success") }}>{row.type}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLOR[row.type] }}>{row.count} deals</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#F3F4F6", overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${Math.max(4, (row.count / maxTypeCount) * 100)}%`, height: "100%", background: TYPE_COLOR[row.type], borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280" }}>
                  <span>Value: {fmtAED(row.value)}</span>
                  <span>Commission: {fmtAED(row.commission)}</span>
                </div>
              </div>
            ))}
            {byType.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No deals yet.</div>}
          </div>
        )}
      </div>

      {/* ── Broker Performance Bar Chart ── */}
      {sectionCard("Broker Performance — Commission Generated", `Top ${brokerPerf.length} brokers ranked by expected commission`,
        <div>
          {brokerPerf.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No broker data available.</div>}
          {brokerPerf.map((b, i) => (
            <div key={b.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? GOLD : i === 1 ? "#94A3B8" : i === 2 ? "#D97706" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? "#fff" : "#6B7280", flexShrink: 0 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{b.deals} deal{b.deals !== 1 ? "s" : ""} · {b.collected} collected</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmtAED(b.commission)}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{fmtAED(b.value)} sold</div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "#F3F4F6", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(2, (b.commission / maxBrokerComm) * 100)}%`, height: "100%", background: i === 0 ? GOLD : i === 1 ? "#94A3B8" : i === 2 ? "#D97706" : "#2563EB", borderRadius: 999, transition: "width .5s ease" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }} />

      {/* ── Developer Leaderboard + Top Deals ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 16, marginBottom: 16 }}>
        {sectionCard("Developer Leaderboard", "Ranked by total transaction value",
          <div>
            {devPerf.map((d, i) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < devPerf.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: i === 0 ? "linear-gradient(135deg, #C9A044, #F5D78E)" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : "#6B7280", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ height: 5, borderRadius: 999, background: "#F3F4F6", overflow: "hidden", marginTop: 5 }}>
                    <div style={{ width: `${Math.max(3, (d.value / maxDevValue) * 100)}%`, height: "100%", background: i === 0 ? GOLD : "#2563EB", borderRadius: 999 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB" }}>{d.deals} deal{d.deals !== 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{fmtAED(d.value)}</div>
                </div>
              </div>
            ))}
            {devPerf.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No developer data.</div>}
          </div>
        )}

        {sectionCard("Top Deals by Commission", "Highest expected commission deals",
          <div>
            {topDeals.map((d, i) => (
              <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: i < topDeals.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: i === 0 ? "linear-gradient(135deg, #C9A044, #F5D78E)" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : "#6B7280", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.property_name || "—"}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{d.broker_name || "—"} · {d.client_name || "—"}</div>
                  <div style={{ marginTop: 4 }}><span style={C.badge(d.stage?.includes("Collected") ? "success" : d.stage?.includes("Earned") ? "gold" : "neutral")}>{d.stage}</span></div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmtAED(d.expected_commission_net || 0)}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{d.type}</div>
                </div>
              </div>
            ))}
            {topDeals.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No deals yet.</div>}
          </div>
        )}
      </div>

      {/* ── Additional KPIs: Broker Summary Table ── */}
      {sectionCard("Broker Summary Table", "Full breakdown of all active brokers",
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["Broker", "Deals", "Collected", "Conv. Rate", "Transaction Value", "Expected Commission"].map(h => (
                  <th key={h} style={{ ...C.th, textAlign: h === "Broker" ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allBrokerPerf.map((b, i) => (
                <tr key={b.name} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                  <td style={{ ...C.td, fontWeight: 600, color: b.name === "— Unassigned —" ? "#9CA3AF" : "inherit" }}>{b.name}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{b.deals}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{b.collected}</td>
                  <td style={{ ...C.td, textAlign: "right", color: b.deals > 0 && Math.round((b.collected / b.deals) * 100) >= 50 ? "#059669" : "#D97706", fontWeight: 600 }}>
                    {b.deals > 0 ? `${Math.round((b.collected / b.deals) * 100)}%` : "—"}
                  </td>
                  <td style={{ ...C.td, textAlign: "right" }}>{fmtAED(b.value)}</td>
                  <td style={{ ...C.td, textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmtAED(b.commission)}</td>
                </tr>
              ))}
              {allBrokerPerf.length === 0 && (
                <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 30, color: "#9CA3AF" }}>No broker data available.</td></tr>
              )}
            </tbody>
            {allBrokerPerf.length > 0 && (
              <tfoot>
                <tr style={{ background: "#F9FAFB", fontWeight: 700 }}>
                  <td style={C.td}>TOTAL</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{allBrokerPerf.reduce((s, b) => s + b.deals, 0)}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{allBrokerPerf.reduce((s, b) => s + b.collected, 0)}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>—</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{fmtAED(allBrokerPerf.reduce((s, b) => s + b.value, 0))}</td>
                  <td style={{ ...C.td, textAlign: "right", color: "#059669" }}>{fmtAED(allBrokerPerf.reduce((s, b) => s + b.commission, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsPage({ settings, setSettings, userRole, accounts, txns, saveTxn, persistTxn }) {
  const [s, setS] = useState(() => normalizeSettings(settings));
  const [backupStatus, setBackupStatus]     = useState("idle"); // idle | loading | done | error
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreStatus, setRestoreStatus]   = useState("idle"); // idle | loading | done | error
  const fileRef = React.useRef();

  // ── localStorage helpers (local to this component) ──
  const lsGet = (k, fb) => { try { const v = localStorage.getItem("na2_" + k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const lsSet = (k, v) => { try { localStorage.setItem("na2_" + k, JSON.stringify(v)); } catch {} };

  // ── Weekly backup reminder ──
  const lastBackupDate = lsGet("last_backup_date", null);
  const daysSinceBackup = lastBackupDate
    ? Math.floor((Date.now() - new Date(lastBackupDate + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const showBackupWarning = daysSinceBackup === null || daysSinceBackup >= 7;

  const save = () => {
    const nextSettings = normalizeSettings(s);
    setSettings(nextSettings);
    if (nextSettings.openingBalance > 0 && accounts && saveTxn) {
      const bankA = accounts.find(a => a.code === "1002");
      const capitalA = accounts.find(a => a.code === "3000");
      if (bankA && capitalA) {
        const existingOB = txns?.find(t => t.tags?.includes("opening-balance"));
        if (!existingOB) {
          const amountCents = toCents(nextSettings.openingBalance);
          const lines = [
            { id: uid(), accountId: bankA.id, debit: amountCents, credit: 0, memo: "Opening Balance — Bank deposit", deal_id: null, broker_id: null, developer_id: null },
            { id: uid(), accountId: capitalA.id, debit: 0, credit: amountCents, memo: "Opening Balance — Capital Injection", deal_id: null, broker_id: null, developer_id: null }
          ];
          const txn = { id: uid(), date: nextSettings.openingBalanceDate, description: "Opening Balance", ref: `OB-${Date.now().toString(36).toUpperCase()}`, counterparty: "Opening Balance", tags: "opening-balance", txnType: "JV", isVoid: false, lines, createdAt: new Date().toISOString() };
          saveTxn(txn);
        }
      }
    }
    toast("Settings saved", "success");
  };

  // ── Backup: read all collections from Firestore → JSON file ──
  const BACKUP_COLS = ["accounts", "transactions", "deals", "customers", "vendors", "brokers", "developers", "planned_expenses"];

  const handleBackup = async () => {
    setBackupStatus("loading");
    try {
      const snaps = await Promise.all([
        ...BACKUP_COLS.map(c => db.collection(c).get()),
        db.collection("settings").doc("company").get()
      ]);
      const backup = {
        version: "2.0",
        app: "Nasama Accounting",
        company: settings.company || "Nasama Properties",
        exportedAt: new Date().toISOString(),
        settings: snaps[BACKUP_COLS.length].exists ? snaps[BACKUP_COLS.length].data() : {},
        collections: {}
      };
      BACKUP_COLS.forEach((col, i) => {
        backup.collections[col] = snaps[i].docs.map(d => ({ _id: d.id, ...d.data() }));
      });
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nasama-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      lsSet("last_backup_date", new Date().toISOString().slice(0, 10));
      setBackupStatus("done");
      toast("Backup downloaded — store it in a safe location", "success");
      setTimeout(() => setBackupStatus("idle"), 4000);
    } catch (err) {
      setBackupStatus("error");
      toast("Backup failed: " + err.message, "error");
      setTimeout(() => setBackupStatus("idle"), 4000);
    }
  };

  // ── Restore: parse uploaded JSON → write to Firestore ──
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.collections || !data.version) throw new Error("Not a valid Nasama backup file");
        setRestorePreview(data);
      } catch (err) {
        toast("Invalid file: " + err.message, "error");
        setRestorePreview(null);
        setRestoreFileName("");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRestore = async () => {
    if (!restorePreview) return;
    setRestoreConfirm(false);
    setRestoreStatus("loading");
    try {
      if (restorePreview.settings) {
        await db.collection("settings").doc("company").set(restorePreview.settings);
      }
      for (const [col, docs] of Object.entries(restorePreview.collections || {})) {
        for (let i = 0; i < docs.length; i += 400) {
          const batch = db.batch();
          docs.slice(i, i + 400).forEach(doc => {
            const { _id, ...data } = doc;
            batch.set(db.collection(col).doc(_id), data);
          });
          await batch.commit();
        }
      }
      setRestoreStatus("done");
      toast("Restore complete — page will reload in 3 seconds", "success");
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      setRestoreStatus("error");
      toast("Restore failed: " + err.message, "error");
      setTimeout(() => setRestoreStatus("idle"), 4000);
    }
  };

  const totalRestoreRecords = restorePreview
    ? Object.values(restorePreview.collections || {}).reduce((s, a) => s + a.length, 0)
    : 0;

  return <div>
    <PageHeader title="Settings" sub="Company configuration" />

    {/* ── Weekly backup reminder banner ── */}
    {showBackupWarning && <div style={{ marginBottom: 16, padding: "12px 18px", borderRadius: 10, background: "#FFFBEB", border: "1.5px solid #FDE68A", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 18 }}>💾</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E" }}>
          {lastBackupDate ? `Last backup was ${daysSinceBackup} day${daysSinceBackup !== 1 ? "s" : ""} ago — weekly backup recommended` : "No backup on record — back up your database now"}
        </div>
        <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>Regular backups protect against accidental data loss. Download a backup file and store it safely.</div>
      </div>
      <button style={{ ...C.btn(), background: "#D97706", borderColor: "#D97706", fontSize: 12, padding: "7px 14px" }} onClick={handleBackup}>
        {backupStatus === "loading" ? "Backing up…" : "Back Up Now"}
      </button>
    </div>}

    <div style={{ ...C.card, padding: 22, maxWidth: 600 }}>
      {/* ── Company Settings ── */}
      <div style={C.fg}>
        <div><label style={C.label}>Company Name</label><Inp value={s.company || ""} onChange={e => setS(p => ({ ...p, company: e.target.value }))} /></div>
        <div><label style={C.label}>TRN (Tax Registration No.)</label><Inp value={s.trn || ""} onChange={e => setS(p => ({ ...p, trn: e.target.value }))} /></div>
        <div><label style={C.label}>VAT Rate %</label><Inp type="number" value={s.vatRate || 5} onChange={e => setS(p => ({ ...p, vatRate: parseInt(e.target.value) || 5 }))} /></div>
        <div><label style={C.label}>Currency</label><Inp value={s.currency || "AED"} onChange={e => setS(p => ({ ...p, currency: e.target.value }))} /></div>
      </div>

      {/* ── Opening Balance ── */}
      <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 20, paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🏦 Opening Balance</div>
        <div style={C.fg}>
          <div><label style={C.label}>Opening Balance (AED)</label><Inp type="number" step="0.01" value={s.openingBalance || 0} onChange={e => setS(p => ({ ...p, openingBalance: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 95548.02" /></div>
          <div><label style={C.label}>As of Date</label><Inp type="date" value={normalizeReportingStartDate(s.openingBalanceDate)} min={DEFAULT_REPORTING_START_DATE} onChange={e => setS(p => ({ ...p, openingBalanceDate: e.target.value }))} /></div>
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>This will create an opening balance journal entry (OB) debiting Bank and crediting Capital Injection on save.</div>
      </div>
      <div style={{ marginTop: 20 }}><button style={C.btn()} onClick={save}>💾 Save Settings</button></div>

      {/* ── Database Backup ── */}
      <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 28, paddingTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: NAVY }}>🗄️ Database Backup</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14, lineHeight: 1.6 }}>
          Downloads a complete snapshot of all your data — accounts, transactions, deals, customers, brokers, vendors, planned expenses — as a single JSON file. Store the file in Google Drive, email it to yourself, or keep it on a USB drive.
          {lastBackupDate && <span style={{ color: "#059669", fontWeight: 600 }}> Last backup: {lastBackupDate}.</span>}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={{ ...C.btn(), background: backupStatus === "done" ? "#059669" : NAVY, borderColor: backupStatus === "done" ? "#059669" : NAVY, minWidth: 180 }} onClick={handleBackup} disabled={backupStatus === "loading"}>
            {backupStatus === "loading" ? "⏳ Reading data…" : backupStatus === "done" ? "✅ Backup downloaded" : backupStatus === "error" ? "❌ Failed — retry" : "⬇️ Download Backup"}
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {BACKUP_COLS.map(c => <span key={c} style={{ fontSize: 10, color: "#98A2B3", fontFamily: "monospace" }}>{c}</span>)}
          </div>
        </div>
      </div>

      {/* ── Restore from Backup ── */}
      <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 28, paddingTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#DC2626" }}>♻️ Restore from Backup</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14, lineHeight: 1.6 }}>
          Upload a previously downloaded backup file to restore your database. <strong style={{ color: "#DC2626" }}>This will overwrite all current data.</strong> Only use this if you need to recover from data loss.
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileChange} />
        <button style={{ ...C.btn("secondary"), marginBottom: 12 }} onClick={() => fileRef.current?.click()}>
          📂 Choose Backup File
        </button>
        {restorePreview && <div style={{ padding: 14, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#166534", marginBottom: 8 }}>✅ Backup file loaded — ready to restore</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, color: "#374151" }}>
            <span>File:</span><span style={{ fontWeight: 600 }}>{restoreFileName}</span>
            <span>Company:</span><span style={{ fontWeight: 600 }}>{restorePreview.company || "—"}</span>
            <span>Exported:</span><span style={{ fontWeight: 600 }}>{restorePreview.exportedAt ? restorePreview.exportedAt.slice(0, 10) : "—"}</span>
            <span>Total records:</span><span style={{ fontWeight: 600 }}>{totalRestoreRecords.toLocaleString()}</span>
            {Object.entries(restorePreview.collections || {}).map(([col, docs]) =>
              <React.Fragment key={col}><span style={{ color: "#6B7280" }}>{col}:</span><span>{docs.length} records</span></React.Fragment>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button style={{ ...C.btn(), background: "#DC2626", borderColor: "#DC2626" }} onClick={() => setRestoreConfirm(true)} disabled={restoreStatus === "loading"}>
              {restoreStatus === "loading" ? "⏳ Restoring…" : restoreStatus === "done" ? "✅ Restored" : "🔄 Restore Database"}
            </button>
            <button style={C.btn("secondary")} onClick={() => { setRestorePreview(null); setRestoreFileName(""); }}>Cancel</button>
          </div>
        </div>}
      </div>

      {/* ── Architecture Note ── */}
      <div style={{ marginTop: 28, padding: 16, background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#DC2626", marginBottom: 6 }}>📐 Architecture Note</div>
        <div style={{ fontSize: 13, color: "#7F1D1D" }}>This system uses a <strong>cash-settled</strong> model. There are no Accounts Receivable, no Accounts Payable, no invoices, and no bills. Every transaction is settled immediately at the point of recording.</div>
      </div>
    </div>

    {/* ── Restore confirmation modal ── */}
    {restoreConfirm && <div style={C.modal} onClick={() => setRestoreConfirm(false)}>
      <div style={C.mbox(440)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#DC2626" }}>⚠️ Confirm Database Restore</span>
          <button onClick={() => setRestoreConfirm(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, marginBottom: 12 }}>
            You are about to restore <strong>{totalRestoreRecords.toLocaleString()} records</strong> from the backup exported on <strong>{restorePreview?.exportedAt?.slice(0, 10)}</strong>.
          </p>
          <div style={{ padding: 12, background: "#FEF2F2", borderRadius: 6, border: "1px solid #FECACA", fontSize: 13, color: "#991B1B", fontWeight: 600 }}>
            ⚠️ This will overwrite ALL current data in the database. This cannot be undone. Make sure you have a backup of your current data first.
          </div>
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setRestoreConfirm(false)}>Cancel — keep current data</button>
          <button style={{ ...C.btn(), background: "#DC2626", borderColor: "#DC2626" }} onClick={handleRestore}>Yes, restore now</button>
        </div>
      </div>
    </div>}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  USER MANAGEMENT
// ╚══════════════════════════════════════════════════╝
function UsersPage({ userRole, userEmail }) {
  const [users, setUsers] = useState([]);
  const [show, setShow] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", role: "secretary" });

  useEffect(() => {
    db.collection('authorized_users').onSnapshot(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const addUser = async () => {
    if (!newUser.email) { toast("Enter an email", "warning"); return; }
    try {
      await db.collection('authorized_users').doc(newUser.email.toLowerCase()).set({ email: newUser.email.toLowerCase(), role: newUser.role, addedBy: userEmail, addedAt: new Date().toISOString() });
      toast("User added", "success");
      setShow(false); setNewUser({ email: "", role: "secretary" });
    } catch (err) { toast(err.message, "error"); }
  };

  return <div>
    <PageHeader title="User Management" sub="Manage authorized users and roles">
      {userRole === 'admin' && <button style={C.btn()} onClick={() => setShow(true)}>+ Add User</button>}
    </PageHeader>

    <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Email</th><th style={C.th}>Role</th><th style={C.th}>Added By</th></tr></thead>
        <tbody>
          {users.map(u => <tr key={u.id}><td style={C.td}>{u.email}</td><td style={C.td}><span style={C.badge(u.role === "admin" ? "danger" : u.role === "accountant" ? "info" : "neutral")}>{u.role}</span></td><td style={C.td}>{u.addedBy || "—"}</td></tr>)}
        </tbody>
      </table>
    </div>

    {show && <div style={C.modal} onClick={() => setShow(false)}>
      <div style={C.mbox(420)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Add User</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
        <div style={C.mbdy}>
          <div><label style={C.label}>Email</label><Inp value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} /></div>
          <div style={{ marginTop: 12 }}><label style={C.label}>Role</label><Sel value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
            <option value="admin">Admin</option><option value="accountant">Accountant</option><option value="secretary">Secretary</option>
          </Sel></div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={addUser}>Add User</button></div>
      </div>
    </div>}
  </div>;
}

// ╔══════════════════════════════════════════════════╗
//  AUTH GATE
// ╚══════════════════════════════════════════════════╝
function SecurityAdminPage({ userRole, userEmail, settings }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [showUser, setShowUser] = useState(false);
  const [showRole, setShowRole] = useState(false);
  const [showBranch, setShowBranch] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [userForm, setUserForm] = useState(null);
  const [roleForm, setRoleForm] = useState(null);
  const [branchForm, setBranchForm] = useState(null);
  const [policyForm, setPolicyForm] = useState(null);
  const [previewRoleId, setPreviewRoleId] = useState("admin");
  const seededRef = useRef({ roles: false, branches: false });

  const companyName = settings?.company || "Nasama Properties Company LLC";
  const defaultCompanyId = (companyName || "default-company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default-company";
  const slugify = (value, fallback = "item") => ((value || fallback).toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || fallback;
  const parseBranchIds = (value) => (value || "").split(",").map(x => x.trim()).filter(Boolean);
  const fmtLimit = (value) => value || value === 0 ? fmtAED(Number(value) || 0) : "Not set";
  const roleMap = roles.reduce((acc, role) => { acc[role.id] = role; return acc; }, {});
  const branchMap = branches.reduce((acc, branch) => { acc[branch.id] = branch; return acc; }, {});
  const selectedPreviewRole = roles.find(r => r.id === previewRoleId) || DEFAULT_SECURITY_ROLE_TEMPLATES.find(r => r.id === previewRoleId) || null;

  const emptyUserForm = () => ({ id: "", email: "", role: "secretary", roleId: "secretary", companyId: defaultCompanyId, branchIdsText: "main", paymentApprovalLimit: "", journalApprovalLimit: "", active: true, accessCode: "" });
  const emptyRoleForm = () => ({ id: "", name: "", description: "", legacyRole: "secretary", permissions: {} });
  const emptyBranchForm = () => ({ id: "", name: "", companyId: defaultCompanyId, active: true });
  const emptyPolicyForm = () => ({ id: "", module: "expenses", roleId: "accountant", branchId: "main", companyId: defaultCompanyId, approvalLimit: "", sequence: "1", active: true });

  useEffect(() => {
    const unsubs = [];
    unsubs.push(db.collection('authorized_users').onSnapshot(snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.email || "").localeCompare(b.email || "")))));
    unsubs.push(db.collection('security_roles').onSnapshot(async snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRoles(rows.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || "")));
      if (snap.empty && userRole === 'admin' && !seededRef.current.roles) {
        seededRef.current.roles = true;
        try {
          await Promise.all(DEFAULT_SECURITY_ROLE_TEMPLATES.map(role => db.collection('security_roles').doc(role.id).set({ ...role, createdAt: new Date().toISOString(), createdBy: userEmail || "system" }, { merge: true })));
        } catch (err) { toast(err.message, "error"); }
      }
    }));
    unsubs.push(db.collection('company_branches').onSnapshot(async snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBranches(rows.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || "")));
      if (snap.empty && userRole === 'admin' && !seededRef.current.branches) {
        seededRef.current.branches = true;
        try {
          await db.collection('company_branches').doc('main').set({ id: 'main', name: 'Main Branch', companyId: defaultCompanyId, active: true, createdAt: new Date().toISOString(), createdBy: userEmail || "system" }, { merge: true });
        } catch (err) { toast(err.message, "error"); }
      }
    }));
    unsubs.push(db.collection('approval_policies').onSnapshot(snap => setPolicies(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((a.module || "") + (a.sequence || 0)).localeCompare((b.module || "") + (b.sequence || 0))))));
    return () => unsubs.forEach(unsub => { try { unsub(); } catch { } });
  }, [defaultCompanyId, userEmail, userRole]);

  useEffect(() => {
    if (!roles.find(r => r.id === previewRoleId) && roles[0]?.id) setPreviewRoleId(roles[0].id);
  }, [roles, previewRoleId]);

  if (userRole !== 'admin') {
    return <div>
      <PageHeader title="User Management" sub="Only administrators can manage access, roles, branches, and approvals." />
      <div style={{ ...C.card, padding: 18, borderColor: "#FDE68A", background: "#FFFBEB" }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#92400E" }}>Access restricted</div>
        <div style={{ fontSize: 13, color: "#78350F" }}>Use an admin account to manage users, role templates, branch restrictions, and approval rules.</div>
      </div>
    </div>;
  }

  const saveUser = async () => {
    if (!userForm?.email) { toast("Enter user email", "warning"); return; }
    const email = normalizeUserEmail(userForm.email);
    const accessCode = normalizeAccessCode(userForm.accessCode);
    if (!userForm.id && !accessCode) { toast("Set an access code for the new user", "warning"); return; }
    const selectedRole = roleMap[userForm.roleId] || DEFAULT_SECURITY_ROLE_TEMPLATES.find(r => r.id === userForm.roleId);
    try {
      const userPayload = {
        email,
        role: userForm.role || selectedRole?.legacyRole || "secretary",
        roleId: userForm.roleId || userForm.role || "secretary",
        companyId: userForm.companyId || defaultCompanyId,
        branchIds: parseBranchIds(userForm.branchIdsText),
        approvalLimits: {
          payments: userForm.paymentApprovalLimit === "" ? null : Number(userForm.paymentApprovalLimit),
          journalEntries: userForm.journalApprovalLimit === "" ? null : Number(userForm.journalApprovalLimit)
        },
        active: userForm.active !== false,
        updatedBy: userEmail,
        updatedAt: new Date().toISOString(),
        ...(accessCode ? { accessCode, accessCodeUpdatedAt: new Date().toISOString(), accessCodeUpdatedBy: userEmail } : {})
      };
      if (!userForm.id) {
        userPayload.addedBy = userEmail;
        userPayload.addedAt = new Date().toISOString();
      }
      await db.collection('authorized_users').doc(email).set(userPayload, { merge: true });
      toast(userForm.id ? "User updated" : "User added", "success");
      setShowUser(false); setUserForm(null);
    } catch (err) { toast(err.message, "error"); }
  };

  const saveRole = async () => {
    if (!roleForm?.name) { toast("Enter role name", "warning"); return; }
    const roleId = roleForm.id || slugify(roleForm.name, "role");
    const normalizedPermissions = roleId === "admin" || roleForm.legacyRole === "admin"
      ? sanitizeRolePermissions(getDefaultSecurityTemplate("admin")?.permissions || {})
      : sanitizeRolePermissions(roleForm.permissions || {});
    try {
      await db.collection('security_roles').doc(roleId).set({
        id: roleId, name: roleForm.name, description: roleForm.description || "", legacyRole: roleForm.legacyRole || "secretary",
        permissions: normalizedPermissions, updatedAt: new Date().toISOString(), updatedBy: userEmail, createdAt: roleForm.createdAt || new Date().toISOString()
      }, { merge: true });
      setPreviewRoleId(roleId);
      toast(roleForm.id ? "Role updated" : "Role created", "success");
      setShowRole(false); setRoleForm(null);
    } catch (err) { toast(err.message, "error"); }
  };

  const saveBranch = async () => {
    if (!branchForm?.name) { toast("Enter branch name", "warning"); return; }
    const branchId = branchForm.id || slugify(branchForm.name, "branch");
    try {
      await db.collection('company_branches').doc(branchId).set({
        id: branchId, name: branchForm.name, companyId: branchForm.companyId || defaultCompanyId,
        active: branchForm.active !== false, updatedAt: new Date().toISOString(), updatedBy: userEmail, createdAt: branchForm.createdAt || new Date().toISOString()
      }, { merge: true });
      toast(branchForm.id ? "Branch updated" : "Branch created", "success");
      setShowBranch(false); setBranchForm(null);
    } catch (err) { toast(err.message, "error"); }
  };

  const savePolicy = async () => {
    if (!policyForm?.module || !policyForm?.roleId) { toast("Select module and approval role", "warning"); return; }
    const policyId = policyForm.id || `${policyForm.module}-${policyForm.roleId}-${policyForm.branchId || 'all'}-${policyForm.sequence || '1'}`;
    try {
      await db.collection('approval_policies').doc(policyId).set({
        id: policyId, module: policyForm.module, roleId: policyForm.roleId, branchId: policyForm.branchId || "all",
        companyId: policyForm.companyId || defaultCompanyId, approvalLimit: policyForm.approvalLimit === "" ? null : Number(policyForm.approvalLimit),
        sequence: Number(policyForm.sequence || 1), active: policyForm.active !== false, updatedAt: new Date().toISOString(), updatedBy: userEmail,
        createdAt: policyForm.createdAt || new Date().toISOString()
      }, { merge: true });
      toast(policyForm.id ? "Approval policy updated" : "Approval policy created", "success");
      setShowPolicy(false); setPolicyForm(null);
    } catch (err) { toast(err.message, "error"); }
  };

  const tabBtn = (id, label, count) => <button key={id} onClick={() => setTab(id)} style={{ ...C.btn(tab === id ? undefined : "secondary", true), padding: "8px 12px", minWidth: 120 }}>{label} ({count})</button>;
  const summary = [
    { label: "Active Users", value: users.filter(u => u.active !== false).length, tone: "danger" },
    { label: "Codes Ready", value: users.filter(u => normalizeAccessCode(u.accessCode)).length, tone: "success" },
    { label: "Role Templates", value: roles.length, tone: "info" },
    { label: "Branches", value: branches.filter(b => b.active !== false).length, tone: "warning" },
    { label: "Approval Rules", value: policies.filter(p => p.active !== false).length, tone: "warning" }
  ];

  return <div>
    <PageHeader title="User Management" sub="Admin control center for users, roles, branches, and approval matrix">
      {tab === "users" && <button style={C.btn()} onClick={() => { setUserForm(emptyUserForm()); setShowUser(true); }}>+ Add User</button>}
      {tab === "roles" && <button style={C.btn()} onClick={() => { setRoleForm(emptyRoleForm()); setShowRole(true); }}>+ Add Role</button>}
      {tab === "branches" && <button style={C.btn()} onClick={() => { setBranchForm(emptyBranchForm()); setShowBranch(true); }}>+ Add Branch</button>}
      {tab === "approvals" && <button style={C.btn()} onClick={() => { setPolicyForm(emptyPolicyForm()); setShowPolicy(true); }}>+ Add Approval Rule</button>}
    </PageHeader>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
      {summary.map(card => <div key={card.label} style={{ ...C.card, padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{card.label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: NAVY }}>{card.value}</div>
          <span style={C.badge(card.tone)}>{card.label}</span>
        </div>
      </div>)}
    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {tabBtn("users", "Users", users.length)}
      {tabBtn("roles", "Roles", roles.length)}
      {tabBtn("branches", "Branches", branches.length)}
      {tabBtn("approvals", "Approvals", policies.length)}
    </div>

    {tab === "users" && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 16 }}>
      <div style={C.card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr><th style={C.th}>Email</th><th style={C.th}>Access Role</th><th style={C.th}>Branches</th><th style={C.th}>Status</th><th style={C.th}>Login</th><th style={C.th}>Action</th></tr></thead>
          <tbody>
            {users.length === 0 && <tr><td style={C.td} colSpan={6}>No users found yet.</td></tr>}
            {users.map(u => <tr key={u.id}>
              <td style={C.td}><div style={{ fontWeight: 600 }}>{u.email}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{u.companyId || defaultCompanyId}</div></td>
              <td style={C.td}><div><span style={C.badge(u.role === "admin" ? "danger" : u.role === "accountant" ? "info" : "neutral")}>{u.role || "secretary"}</span></div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{roleMap[u.roleId]?.name || u.roleId || "-"}</div></td>
              <td style={C.td}>{(u.branchIds || []).length ? (u.branchIds || []).map(id => branchMap[id]?.name || id).join(", ") : "All"}</td>
              <td style={C.td}><span style={C.badge(u.active === false ? "neutral" : "success")}>{u.active === false ? "Inactive" : "Active"}</span></td>
              <td style={C.td}><span style={C.badge(normalizeAccessCode(u.accessCode) ? "success" : "warning")}>{normalizeAccessCode(u.accessCode) ? "Code set" : "Needs code"}</span></td>
              <td style={C.td}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={C.btn("secondary", true)} onClick={() => { setUserForm({ id: u.id, email: u.email || "", role: u.role || "secretary", roleId: u.roleId || u.role || "secretary", companyId: u.companyId || defaultCompanyId, branchIdsText: (u.branchIds || []).join(", ") || "main", paymentApprovalLimit: u.approvalLimits?.payments ?? "", journalApprovalLimit: u.approvalLimits?.journalEntries ?? "", active: u.active !== false, accessCode: "" }); setShowUser(true); }}>Edit / Reset Code</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{ ...C.card, padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Role Preview</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>For this small team, login is handled with simple admin-set access codes. If someone forgets theirs, open the user record and set a new one.</div>
        <label style={C.label}>Template / Role</label>
        <Sel value={previewRoleId} onChange={e => setPreviewRoleId(e.target.value)}>
          {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </Sel>
        {selectedPreviewRole && <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, color: NAVY }}>{selectedPreviewRole.name}</div>
          <div style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 12px" }}>{selectedPreviewRole.description || "No description"}</div>
          <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={C.th}>Section</th><th style={C.th}>Pages</th><th style={C.th}>Enabled Actions</th></tr></thead>
              <tbody>
                {SECURITY_MODULES.map(module => <tr key={module.id}><td style={C.td}>{module.label}</td><td style={C.td}>{module.pages.join(", ")}</td><td style={C.td}>{module.actions.filter(action => selectedPreviewRole.permissions?.[`${module.id}.${action}`]).join(", ") || "No access"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>}
      </div>
    </div>}

    {tab === "roles" && <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Role</th><th style={C.th}>Legacy Access</th><th style={C.th}>Enabled Permissions</th><th style={C.th}>Action</th></tr></thead>
        <tbody>
          {roles.length === 0 && <tr><td style={C.td} colSpan={4}>No roles found yet.</td></tr>}
          {roles.map(role => <tr key={role.id}>
            <td style={C.td}><div style={{ fontWeight: 600 }}>{role.name}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{role.description || role.id}</div></td>
            <td style={C.td}><span style={C.badge(role.legacyRole === "admin" ? "danger" : role.legacyRole === "accountant" ? "info" : "neutral")}>{role.legacyRole || "secretary"}</span></td>
            <td style={C.td}>{countRolePermissions(role.permissions || {})} permissions</td>
            <td style={C.td}><button style={C.btn("secondary", true)} onClick={() => { setRoleForm({ ...emptyRoleForm(), ...role, permissions: sanitizeRolePermissions(role.permissions || {}) }); setShowRole(true); }}>Edit</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {tab === "branches" && <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Branch</th><th style={C.th}>Company</th><th style={C.th}>Status</th><th style={C.th}>Action</th></tr></thead>
        <tbody>
          {branches.length === 0 && <tr><td style={C.td} colSpan={4}>No branches found yet.</td></tr>}
          {branches.map(branch => <tr key={branch.id}><td style={C.td}><div style={{ fontWeight: 600 }}>{branch.name}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{branch.id}</div></td><td style={C.td}>{branch.companyId || defaultCompanyId}</td><td style={C.td}><span style={C.badge(branch.active === false ? "neutral" : "success")}>{branch.active === false ? "Inactive" : "Active"}</span></td><td style={C.td}><button style={C.btn("secondary", true)} onClick={() => { setBranchForm({ ...emptyBranchForm(), ...branch }); setShowBranch(true); }}>Edit</button></td></tr>)}
        </tbody>
      </table>
    </div>}

    {tab === "approvals" && <div style={C.card}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style={C.th}>Section</th><th style={C.th}>Approver Role</th><th style={C.th}>Scope</th><th style={C.th}>Limit</th><th style={C.th}>Sequence</th><th style={C.th}>Status</th><th style={C.th}>Action</th></tr></thead>
        <tbody>
          {policies.length === 0 && <tr><td style={C.td} colSpan={7}>No approval rules found yet.</td></tr>}
          {policies.map(policy => <tr key={policy.id}><td style={C.td}>{APPROVAL_POLICY_MODULE_LABELS[policy.module] || policy.module}</td><td style={C.td}>{roleMap[policy.roleId]?.name || policy.roleId}</td><td style={C.td}><div>{branchMap[policy.branchId]?.name || policy.branchId || "All branches"}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{policy.companyId || defaultCompanyId}</div></td><td style={C.td}>{fmtLimit(policy.approvalLimit)}</td><td style={C.td}>{policy.sequence || 1}</td><td style={C.td}><span style={C.badge(policy.active === false ? "neutral" : "success")}>{policy.active === false ? "Inactive" : "Active"}</span></td><td style={C.td}><button style={C.btn("secondary", true)} onClick={() => { setPolicyForm({ ...emptyPolicyForm(), ...policy, approvalLimit: policy.approvalLimit ?? "", sequence: String(policy.sequence ?? "1") }); setShowPolicy(true); }}>Edit</button></td></tr>)}
        </tbody>
      </table>
    </div>}

    {showUser && userForm && <div style={C.modal} onClick={() => { setShowUser(false); setUserForm(null); }}>
      <div style={C.mbox(720)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{userForm.id ? "Edit User" : "Add User"}</span><button onClick={() => { setShowUser(false); setUserForm(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={C.label}>Email</label><Inp value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label style={C.label}>Company ID</label><Inp value={userForm.companyId} onChange={e => setUserForm(p => ({ ...p, companyId: e.target.value }))} /></div>
            <div><label style={C.label}>Legacy App Role</label><Sel value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="secretary">Secretary</option><option value="sales">Sales</option></Sel></div>
            <div><label style={C.label}>Custom Role Template</label><Sel value={userForm.roleId} onChange={e => { const selected = roleMap[e.target.value] || DEFAULT_SECURITY_ROLE_TEMPLATES.find(r => r.id === e.target.value); setUserForm(p => ({ ...p, roleId: e.target.value, role: selected?.legacyRole || p.role })); }}>{[...DEFAULT_SECURITY_ROLE_TEMPLATES.filter(t => !roleMap[t.id]), ...roles].map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</Sel></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={C.label}>Allowed Branch IDs</label><Inp value={userForm.branchIdsText} onChange={e => setUserForm(p => ({ ...p, branchIdsText: e.target.value }))} placeholder="main, marina, abu-dhabi" /></div>
            <div><label style={C.label}>Payments Approval Limit</label><Inp type="number" value={userForm.paymentApprovalLimit} onChange={e => setUserForm(p => ({ ...p, paymentApprovalLimit: e.target.value }))} /></div>
            <div><label style={C.label}>Journal Approval Limit</label><Inp type="number" value={userForm.journalApprovalLimit} onChange={e => setUserForm(p => ({ ...p, journalApprovalLimit: e.target.value }))} /></div>
            <div><label style={C.label}>Access Code</label><Inp value={userForm.accessCode} onChange={e => setUserForm(p => ({ ...p, accessCode: e.target.value }))} placeholder={userForm.id ? "Leave blank to keep current code" : "Set a login code"} /></div>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button style={{ ...C.btn("ghost"), width: "100%", justifyContent: "center" }} onClick={() => { const nextCode = generateAccessCode(); setUserForm(p => ({ ...p, accessCode: nextCode })); toast(`Temporary code: ${nextCode}`, "info"); }}>Generate Temporary Code</button></div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>Users sign in with their email and this access code. No reset email is needed.</div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <input id="security-user-active" type="checkbox" checked={userForm.active !== false} onChange={e => setUserForm(p => ({ ...p, active: e.target.checked }))} />
            <label htmlFor="security-user-active" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>User is active</label>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => { setShowUser(false); setUserForm(null); }}>Cancel</button><button style={C.btn()} onClick={saveUser}>Save User</button></div>
      </div>
    </div>}

    {showRole && roleForm && <div style={C.modal} onClick={() => { setShowRole(false); setRoleForm(null); }}>
      <div style={C.mbox(980)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{roleForm.id ? "Edit Role Template" : "Add Role Template"}</span><button onClick={() => { setShowRole(false); setRoleForm(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div><label style={C.label}>Role ID</label><Inp value={roleForm.id} onChange={e => setRoleForm(p => ({ ...p, id: slugify(e.target.value, "role") }))} placeholder="auto from name if blank" /></div>
            <div><label style={C.label}>Role Name</label><Inp value={roleForm.name} onChange={e => setRoleForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label style={C.label}>Legacy App Role</label><Sel value={roleForm.legacyRole} onChange={e => setRoleForm(p => ({ ...p, legacyRole: e.target.value }))}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="secretary">Secretary</option><option value="sales">Sales</option></Sel></div>
          </div>
          <div style={{ marginBottom: 16 }}><label style={C.label}>Description</label><textarea style={{ ...C.input, minHeight: 70, resize: "vertical" }} value={roleForm.description || ""} onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={C.th}>Section</th><th style={C.th}>Allowed Actions</th></tr></thead>
              <tbody>
                {SECURITY_MODULES.map(module => <tr key={module.id}><td style={C.td}><div style={{ fontWeight: 600 }}>{module.label}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{module.pages.join(" · ")}</div></td><td style={C.td}><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{module.actions.map(action => { const inputId = `perm-${module.id}-${action}`; return <label key={action} htmlFor={inputId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px", border: "1px solid #E5E7EB", borderRadius: 999 }}><input id={inputId} type="checkbox" checked={!!roleForm.permissions?.[`${module.id}.${action}`]} onChange={e => setRoleForm(prev => ({ ...prev, permissions: { ...(prev?.permissions || {}), [`${module.id}.${action}`]: e.target.checked } }))} /><span>{action}</span></label>; })}</div></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => { setShowRole(false); setRoleForm(null); }}>Cancel</button><button style={C.btn()} onClick={saveRole}>Save Role</button></div>
      </div>
    </div>}

    {showBranch && branchForm && <div style={C.modal} onClick={() => { setShowBranch(false); setBranchForm(null); }}>
      <div style={C.mbox(520)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{branchForm.id ? "Edit Branch" : "Add Branch"}</span><button onClick={() => { setShowBranch(false); setBranchForm(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={C.label}>Branch ID</label><Inp value={branchForm.id} onChange={e => setBranchForm(p => ({ ...p, id: slugify(e.target.value, "branch") }))} placeholder="auto from name if blank" /></div>
            <div><label style={C.label}>Company ID</label><Inp value={branchForm.companyId} onChange={e => setBranchForm(p => ({ ...p, companyId: e.target.value }))} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={C.label}>Branch Name</label><Inp value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <input id="security-branch-active" type="checkbox" checked={branchForm.active !== false} onChange={e => setBranchForm(p => ({ ...p, active: e.target.checked }))} />
            <label htmlFor="security-branch-active" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Branch is active</label>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => { setShowBranch(false); setBranchForm(null); }}>Cancel</button><button style={C.btn()} onClick={saveBranch}>Save Branch</button></div>
      </div>
    </div>}

    {showPolicy && policyForm && <div style={C.modal} onClick={() => { setShowPolicy(false); setPolicyForm(null); }}>
      <div style={C.mbox(660)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{policyForm.id ? "Edit Approval Rule" : "Add Approval Rule"}</span><button onClick={() => { setShowPolicy(false); setPolicyForm(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button></div>
        <div style={C.mbdy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={C.label}>Module</label><Sel value={policyForm.module} onChange={e => setPolicyForm(p => ({ ...p, module: e.target.value }))}>{APPROVAL_POLICY_MODULES.map(module => <option key={module.id} value={module.id}>{module.label}</option>)}</Sel></div>
            <div><label style={C.label}>Approver Role</label><Sel value={policyForm.roleId} onChange={e => setPolicyForm(p => ({ ...p, roleId: e.target.value }))}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</Sel></div>
            <div><label style={C.label}>Branch</label><Sel value={policyForm.branchId} onChange={e => setPolicyForm(p => ({ ...p, branchId: e.target.value }))}><option value="all">All Branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Sel></div>
            <div><label style={C.label}>Company ID</label><Inp value={policyForm.companyId} onChange={e => setPolicyForm(p => ({ ...p, companyId: e.target.value }))} /></div>
            <div><label style={C.label}>Approval Limit</label><Inp type="number" value={policyForm.approvalLimit} onChange={e => setPolicyForm(p => ({ ...p, approvalLimit: e.target.value }))} placeholder="Leave blank for no explicit cap" /></div>
            <div><label style={C.label}>Sequence</label><Inp type="number" value={policyForm.sequence} onChange={e => setPolicyForm(p => ({ ...p, sequence: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <input id="security-policy-active" type="checkbox" checked={policyForm.active !== false} onChange={e => setPolicyForm(p => ({ ...p, active: e.target.checked }))} />
            <label htmlFor="security-policy-active" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Approval rule is active</label>
          </div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => { setShowPolicy(false); setPolicyForm(null); }}>Cancel</button><button style={C.btn()} onClick={savePolicy}>Save Approval Rule</button></div>
      </div>
    </div>}
  </div>;
}

function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userAccess, setUserAccess] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const explainBackendAccessError = (err) => {
    const code = err?.code || "";
    const host = window.location.hostname || window.location.host || "this site";
    if (code === "auth/unauthorized-domain") {
      return `Firebase Authentication does not trust ${host} yet. Add this domain in Firebase Authentication > Settings > Authorized domains.`;
    }
    if (code === "auth/operation-not-allowed") {
      return "Firebase Anonymous Authentication is disabled. Enable Anonymous sign-in in Firebase Authentication > Sign-in method, or sign in once with the old Firebase password.";
    }
    if (code === "permission-denied" || /Missing or insufficient permissions/i.test(err?.message || "")) {
      return `Firebase blocked access to login records for ${host}. On the hosted site, allow the domain in Firebase Authentication and make sure Anonymous sign-in is enabled for access-code login.`;
    }
    return err?.message || "Could not connect to Firebase authentication.";
  };

  const ensureBackendSession = async () => {
    if (typeof auth === 'undefined') return null;
    if (auth.currentUser) return auth.currentUser;
    if (!auth?.signInAnonymously) throw new Error("Firebase Anonymous Authentication is not available in this build.");
    try {
      await auth.signInAnonymously();
    } catch (err) {
      console.warn("Anonymous auth unavailable:", err?.message || err);
      throw new Error(explainBackendAccessError(err));
    }
    if (!auth.currentUser) throw new Error("Firebase could not create a backend session for access-code login.");
    return auth.currentUser;
  };

  const resolveUserAccess = async (sessionUser) => {
    const roleId = sessionUser?.roleId || sessionUser?.role || "secretary";
    const defaultTemplate = getDefaultSecurityTemplate(roleId);
    let template = defaultTemplate;
    if (typeof db !== 'undefined') {
      try {
        const roleSnap = await db.collection('security_roles').doc(roleId).get();
        if (roleSnap.exists) {
          const roleData = roleSnap.data() || {};
          template = {
            ...(defaultTemplate || {}),
            ...roleData,
            id: roleId,
            permissions: sanitizeRolePermissions(roleData.permissions || {})
          };
        }
      } catch (err) {
        console.error("Role template lookup failed:", err);
      }
    }
    const legacyRole = sessionUser?.role || template?.legacyRole || defaultTemplate?.legacyRole || "secretary";
    const permissions = roleId === "admin" || legacyRole === "admin"
      ? sanitizeRolePermissions(getDefaultSecurityTemplate("admin")?.permissions || {})
      : sanitizeRolePermissions(sessionUser?.permissions || template?.permissions || {});
    return { email: normalizeUserEmail(sessionUser?.email), roleId, legacyRole, permissions, templateName: template?.name || roleId };
  };

  const finishLogin = (sessionUser) => {
    const email = normalizeUserEmail(sessionUser?.email);
    const role = sessionUser?.role || "secretary";
    if (!email) return;
    ls_set(AUTH_SESSION_KEY, { email, role, loggedInAt: new Date().toISOString() });
    setUser({ email });
    setUserRole(role);
  };

  const signOut = () => {
    ls_remove(AUTH_SESSION_KEY);
    ACTIVE_USER_ACCESS = null;
    setUser(null);
    setUserRole(null);
    setUserAccess(null);
    setLoginPass("");
    setError("");
  };

  useEffect(() => {
    let alive = true;
    const restoreSession = async () => {
      if (typeof db === 'undefined') {
        setUser({ email: 'test@example.com' });
        setUserRole('admin');
        setLoading(false);
        return;
      }
      try {
        await ensureBackendSession();
        const saved = ls_get(AUTH_SESSION_KEY, null);
        const email = normalizeUserEmail(saved?.email);
        if (!email) return;
        const doc = await db.collection('authorized_users').doc(email).get();
        if (!doc.exists || doc.data()?.active === false) {
          ls_remove(AUTH_SESSION_KEY);
          return;
        }
        const access = await resolveUserAccess({ email, ...doc.data() });
        ACTIVE_USER_ACCESS = access;
        if (alive) {
          finishLogin({ email, ...doc.data() });
          setUserAccess(access);
        }
      } catch (err) {
        console.error('Session restore error:', err);
        ls_remove(AUTH_SESSION_KEY);
      } finally {
        if (alive) setLoading(false);
      }
    };
    restoreSession();
    return () => { alive = false; };
  }, []);

  const tryLegacyPasswordMigration = async (email, accessCode) => {
    if (typeof auth === 'undefined' || !auth?.signInWithEmailAndPassword) return false;
    try {
      await auth.signInWithEmailAndPassword(email, accessCode);
      await db.collection('authorized_users').doc(email).set({
        accessCode,
        accessCodeUpdatedAt: new Date().toISOString(),
        accessCodeUpdatedBy: email,
        migratedFromLegacyAuthAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (err) {
      return false;
    }
  };

  const handleLogin = async () => {
    const email = normalizeUserEmail(loginEmail);
    const accessCode = normalizeAccessCode(loginPass);
    setError("");
    if (!email || !accessCode) { setError("Enter email and access code."); return; }
    try {
      setAuthBusy(true);
      let legacySignedIn = false;
      if (typeof auth !== 'undefined' && auth?.signInWithEmailAndPassword) {
        try {
          await auth.signInWithEmailAndPassword(email, accessCode);
          legacySignedIn = true;
        } catch { }
      }
      if (!legacySignedIn) await ensureBackendSession();
      const userRef = db.collection('authorized_users').doc(email);
      const doc = await userRef.get();
      if (doc.exists) {
        const userData = doc.data() || {};
        if (userData.active === false) throw new Error("This user is inactive.");
        let savedCode = normalizeAccessCode(userData.accessCode);
        if (!savedCode) {
          if (legacySignedIn) {
            await userRef.set({
              accessCode,
              accessCodeUpdatedAt: new Date().toISOString(),
              accessCodeUpdatedBy: email,
              migratedFromLegacyAuthAt: new Date().toISOString()
            }, { merge: true });
            savedCode = accessCode;
          } else {
            const migrated = await tryLegacyPasswordMigration(email, accessCode);
            if (migrated) savedCode = accessCode;
          }
        }
        if (!savedCode) throw new Error("This user needs an admin to set an access code in User Management.");
        if (savedCode !== accessCode) throw new Error("Incorrect access code.");
        const access = await resolveUserAccess({ email, ...userData, accessCode: savedCode });
        ACTIVE_USER_ACCESS = access;
        finishLogin({ email, ...userData, accessCode: savedCode });
        setUserAccess(access);
        setLoginPass("");
        return;
      }

      const existingUsers = await db.collection('authorized_users').limit(1).get();
      if (!existingUsers.empty) throw new Error("This email is not authorized. Ask admin to add it and set an access code.");

      const firstUser = {
        email,
        role: 'admin',
        roleId: 'admin',
        branchIds: ['main'],
        active: true,
        accessCode,
        addedAt: new Date().toISOString(),
        addedBy: 'first-login',
        accessCodeUpdatedAt: new Date().toISOString(),
        accessCodeUpdatedBy: email
      };
      await userRef.set(firstUser, { merge: true });
      const access = await resolveUserAccess(firstUser);
      ACTIVE_USER_ACCESS = access;
      finishLogin(firstUser);
      setUserAccess(access);
      setLoginPass("");
    } catch (err) {
      setError(explainBackendAccessError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  if (loading) return <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
    <Logo size={64} /><div style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>NASAMA PROPERTIES</div>
    <div style={{ color: "#8B8BA8", fontSize: 13 }}>Loading…</div>
  </div>;

  if (!user) return <div style={{ position: "fixed", inset: 0, background: `linear-gradient(135deg, ${NAVY} 0%, #2D2D45 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ background: "#fff", borderRadius: 16, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}><Logo size={48} /><div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginTop: 8 }}>Nasama Properties</div><div style={{ fontSize: 13, color: "#6B7280" }}>Accounting System v2 · Clean Backend</div></div>
      {error && <div style={C.err}>{error}</div>}
      <div style={{ marginBottom: 12 }}><label style={C.label}>Email</label><Inp value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="your@email.com" /></div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>Use the access code set by the admin. If this is the very first login, this screen creates the first admin user.</div>
      <div style={{ marginBottom: 16 }}><label style={C.label}>Password</label><input type="password" style={C.input} value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
      <button style={{ ...C.btn(), width: "100%", justifyContent: "center", padding: "12px 0" }} onClick={handleLogin}>{authBusy ? "Signing In..." : "Sign In"}</button>
      <div style={{ marginTop: 12, fontSize: 12, color: "#6B7280", textAlign: "center" }}>If someone forgets the code, an admin can reset it from User Management.</div>
    </div>
  </div>;

  return React.Children.map(children, child => React.cloneElement(child, { userRole, userAccess, userEmail: user.email, signOut }));
}

// ╔══════════════════════════════════════════════════╗
//  SIDEBAR ICON — Lucide-style 18 × 18, round caps
// ╚══════════════════════════════════════════════════╝
function SidebarIcon({ id, active }) {
  const c = active ? "#C9A044" : "#4E5E8A";
  const p = { width: 18, height: 18, fill: "none", stroke: c, strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", style: { flexShrink: 0, display: "block" } };
  const icons = {
    dashboard:      <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    deals:          <svg {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>,
    receipts:       <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>,
    invoices:       <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="9" x2="12" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>,
    customers:      <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    brokers:        <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    developers:     <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    payments:       <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    vendors:        <svg {...p}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
    futureExpenses: <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="12.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/><line x1="8" y1="18" x2="8.01" y2="18"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
    banking:        <svg {...p}><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 2 7 22 7"/></svg>,
    journal:        <svg {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>,
    coa:            <svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    reports:        <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    vat:            <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/><line x1="9" y1="16" x2="15" y2="12"/></svg>,
    manual:         <svg {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/><line x1="9" y1="17" x2="11" y2="17"/></svg>,
    users:          <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    settings:       <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    banana2:        <svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  };
  return icons[id] || <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
}

// ╔══════════════════════════════════════════════════╗
//  MAIN APP
// ╚══════════════════════════════════════════════════╝
function App({ userRole, userAccess, userEmail, signOut }) {
  ACTIVE_USER_ACCESS = userAccess || null;
  const accessSubject = userAccess || userRole;
  const [accounts, setAccounts] = useState(() => ls_get("accounts", SEED_ACCOUNTS));
  const [txns, setTxns] = useState(() => ls_get("transactions", SEED_TXNS));
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState(() => ls_get("customers", SEED_CUSTOMERS));
  const [vendors, setVendors] = useState(() => ls_get("vendors", SEED_VENDORS));
  const [brokers, setBrokers] = useState(() => ls_get("brokers", SEED_BROKERS));
  const [plannedExpenses, setPlannedExpenses] = useState(() => ls_get("planned_expenses", []));
  const [developers, setDevelopers] = useState(() => ls_get("developers", SEED_DEVELOPERS));
  const [settings, setSettings] = useState(() => ls_get("settings", { company: "Nasama Properties Company LLC", trn: "", vatRate: 5, currency: "AED", openingBalance: 0, openingBalanceDate: DEFAULT_REPORTING_START_DATE }));
  const [page, setPage] = useState(() => canAccessPage(userAccess || userRole, "dashboard") ? "dashboard" : "deals");
  const [dark, setDark] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [writeMeta, setWriteMeta] = useState({});
  const syncCount = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("na2_sidebar_collapsed") === "true");
  const [connected, setConnected] = useState(true);

  // Mobile detection
  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth <= 768); if (window.innerWidth > 768) setMobileMenuOpen(false); };
    h(); window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (canAccessPage(accessSubject, page)) return;
    const fallbackPage = NAV.filter(item => item.id).map(item => item.id).find(id => canAccessPage(accessSubject, id)) || "manual";
    if (fallbackPage !== page) setPage(fallbackPage);
  }, [page, userRole, userAccess]);

  // Firestore real-time listeners
  useEffect(() => {
    let mounted = true;
    const unsubs = [];
    const safety = setTimeout(() => { if (mounted) setFbLoaded(true); }, 10000);

    let loaded = 0; const total = 8;
    const done = () => { loaded++; if (loaded >= total && mounted) setFbLoaded(true); };

    const listen = (col, setter, cacheKey, seed) => {
      return db.collection(col).onSnapshot(snap => {
        setConnected(true); // Connected if snapshot received
        if (snap.empty) {
          setter(seed); ls_set(cacheKey, seed);
          if (seed.length > 0) fsSetCollection(col, seed).catch(console.error);
        } else {
          const data = snap.docs.map(d => d.data());
          setter(data); ls_set(cacheKey, data);
        }
        done();
      }, err => {
        console.error(col, err);
        setConnected(false); // Disconnected on error
        done();
      });
    };

    unsubs.push(listen('accounts', setAccounts, 'accounts', SEED_ACCOUNTS));
    unsubs.push(listen('transactions', setTxns, 'transactions', SEED_TXNS));
    unsubs.push(listen('deals', setDeals, 'deals', []));
    unsubs.push(listen('customers', setCustomers, 'customers', SEED_CUSTOMERS));
    unsubs.push(listen('vendors', setVendors, 'vendors', SEED_VENDORS));
    unsubs.push(listen('brokers', setBrokers, 'brokers', SEED_BROKERS));
    unsubs.push(listen('developers', setDevelopers, 'developers', SEED_DEVELOPERS));
    unsubs.push(listen('planned_expenses', setPlannedExpenses, 'planned_expenses', []));

    // Settings (single doc) — always counts toward done()
    const u8 = db.collection('settings').doc('company').onSnapshot(snap => {
      setConnected(true); // Connected
      if (!mounted) return;
      if (snap.exists) { const d = normalizeSettings(snap.data()); setSettings(d); ls_set('settings', d); }
      else { fsSaveSettings({ company: "Nasama Properties Company LLC", trn: "", vatRate: 5, currency: "AED", openingBalance: 0, openingBalanceDate: DEFAULT_REPORTING_START_DATE }).catch(console.error); }
      done();
    }, err => {
      console.error('settings', err);
      setConnected(false); // Disconnected
      done();
    });
    unsubs.push(u8);

    return () => { mounted = false; clearTimeout(safety); unsubs.forEach(u => { try { u(); } catch { } }); };
  }, []);

  const showSync = () => { setSyncing(true); syncCount.current++; const n = syncCount.current; setTimeout(() => { if (syncCount.current === n) setSyncing(false); }, 1800); };

  // Firestore write wrappers
  const fsUpdate = (col, setter, cacheKey) => (updater) => {
    setter(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!navigator.onLine) { toast("Offline — changes not saved", "error"); return prev; }
      const startedAt = new Date().toISOString();
      setWriteMeta(meta => ({ ...meta, [col]: { status: "saving", startedAt, completedAt: meta[col]?.completedAt || "", error: "" } }));
      ls_set(cacheKey, next); showSync();
      fsSetCollection(col, next).then(() => {
        setSyncError(false);
        setWriteMeta(meta => ({ ...meta, [col]: { status: "saved", startedAt, completedAt: new Date().toISOString(), error: "" } }));
      }).catch(e => {
        toast(`Save error: ${e.message}`, "error");
        setSyncError(true);
        setWriteMeta(meta => ({ ...meta, [col]: { status: "error", startedAt, completedAt: meta[col]?.completedAt || "", error: e.message } }));
      });
      return next;
    });
  };

  const setAccountsFS = fsUpdate('accounts', setAccounts, 'accounts');
  const setTxnsFS = fsUpdate('transactions', setTxns, 'transactions');
  const setDealsFS = fsUpdate('deals', setDeals, 'deals');
  const setCustomersFS = fsUpdate('customers', setCustomers, 'customers');
  const setVendorsFS = fsUpdate('vendors', setVendors, 'vendors');
  const setBrokersFS = fsUpdate('brokers', setBrokers, 'brokers');
  const setDevelopersFS = fsUpdate('developers', setDevelopers, 'developers');
  const setPlannedExpensesFS = fsUpdate('planned_expenses', setPlannedExpenses, 'planned_expenses');
  const setSettingsFS = (s) => {
    const nextSettings = normalizeSettings(s);
    setSettings(nextSettings);
    ls_set('settings', nextSettings);
    showSync();
    fsSaveSettings(nextSettings).catch(e => toast(`Settings error: ${e.message}`, "error"));
  };

  // Ledger & Journal
  const ledger = useMemo(() => buildLedger(txns, accounts), [txns, accounts]);
  const persistTxn = useCallback(async (txn) => {
    if (!txn?.id) throw new Error("Transaction id is required");
    if (!navigator.onLine) throw new Error("Offline — changes not saved");
    const cleanTxn = JSON.parse(JSON.stringify(txn));

    const startedAt = new Date().toISOString();
    setWriteMeta(meta => ({ ...meta, transactions: { status: "saving", startedAt, completedAt: meta.transactions?.completedAt || "", error: "" } }));
    showSync();

    try {
      await fsSetDoc('transactions', cleanTxn.id, cleanTxn);
      setSyncError(false);
      setTxns(prev => {
        const exists = prev.some(item => item.id === cleanTxn.id);
        const next = exists ? prev.map(item => item.id === cleanTxn.id ? cleanTxn : item) : [...prev, cleanTxn];
        ls_set('transactions', next);
        return next;
      });
      setWriteMeta(meta => ({ ...meta, transactions: { status: "saved", startedAt, completedAt: new Date().toISOString(), error: "" } }));
      return cleanTxn;
    } catch (e) {
      setSyncError(true);
      setWriteMeta(meta => ({ ...meta, transactions: { status: "error", startedAt, completedAt: meta.transactions?.completedAt || "", error: e.message } }));
      throw e;
    }
  }, []);
  const saveTxn = useCallback((txn) => { persistTxn(txn).catch(e => toast(`Save error: ${e.message}`, "error")); }, [persistTxn]);
  const deleteTxn = useCallback(async (txnId) => {
    if (!navigator.onLine) throw new Error("Offline — changes not saved");
    await window.fsDeleteDoc('transactions', txnId);
    setTxns(prev => {
      const next = prev.filter(t => t.id !== txnId);
      ls_set('transactions', next);
      return next;
    });
  }, []);
  const journal = useMemo(() => createJournalEngine({ accounts, txns, saveTxn }), [accounts, txns, saveTxn]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const reportingStartDate = normalizeReportingStartDate(settings?.openingBalanceDate);
    const reportingStartMonthKey = reportingStartDate.slice(0, 7);
    const currentYear = now.getFullYear();
    const currentMonthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const banks = accounts.filter(a => a.isBank || a.code === "1001");
    const cash = banks.reduce((s, a) => s + accountBalance(a, ledger), 0);
    const outputVATA = accounts.find(a => a.isOutputVAT);
    const inputVATA = accounts.find(a => a.isInputVAT);
    const vat = txns
      .filter(t => !t.isVoid && !isVATSettlementTxn(t, accounts) && t.lines?.some(l => l.accountId === outputVATA?.id || l.accountId === inputVATA?.id))
      .reduce((sum, t) => {
        const outAmt = (t.lines || []).filter(l => l.accountId === outputVATA?.id).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
        const inAmt = (t.lines || []).filter(l => l.accountId === inputVATA?.id).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
        return sum + (outAmt - inAmt);
      }, 0);
    const totalAssets = accounts.filter(a => a.type === "Asset").reduce((s, a) => s + accountBalance(a, ledger), 0);
    const totalLiabilities = accounts.filter(a => a.type === "Liability").reduce((s, a) => s + accountBalance(a, ledger), 0);
    const totalEquity = accounts.filter(a => a.type === "Equity").reduce((s, a) => s + accountBalance(a, ledger), 0);
    const netWorth = totalAssets - totalLiabilities;
    let rev = 0, exp = 0;
    let brokerPayoutYTD = 0;
    let operatingCashFlowMTD = 0;
    let operatingCashFlowYTD = 0;
    const expenseYTDByAccount = new Map();

    const makeMonthKey = dateStr => (dateStr || "").slice(0, 7);
    const monthLabel = key => {
      const [year, month] = key.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    };
    const last6MonthKeys = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(currentYear, now.getMonth() - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }).filter(key => key >= reportingStartMonthKey);
    const perfMap = new Map(last6MonthKeys.map(key => [key, { revenue: 0, expense: 0 }]));
    const cashMap = new Map(last6MonthKeys.map(key => [key, { inflow: 0, outflow: 0 }]));

    for (let i = 0; i < txns.length; i++) {
      const t = txns[i];
      if (t.isVoid) continue;

      const monthKey = makeMonthKey(t.date);
      const lines = t.lines || [];
      const inReportingPeriod = (t.date || "") >= reportingStartDate;
      const monthPerf = perfMap.get(monthKey);
      let txnRevenue = 0;
      let txnExpense = 0;

      lines.forEach(l => {
        const a = accountById.get(l.accountId);
        if (!a) return;
        if (a.type === "Revenue") {
          const amount = (l.credit || 0) - (l.debit || 0);
          txnRevenue += amount;
          if (inReportingPeriod) rev += amount;
        }
        if (a.type === "Expense") {
          const amount = (l.debit || 0) - (l.credit || 0);
          txnExpense += amount;
          if (inReportingPeriod) {
            exp += amount;
            expenseYTDByAccount.set(a.id, (expenseYTDByAccount.get(a.id) || 0) + amount);
            if ((a.name || "").toLowerCase().includes("broker") || (a.code || "").startsWith("55")) brokerPayoutYTD += amount;
          }
        }
      });
      if (monthPerf) {
        monthPerf.revenue += txnRevenue;
        monthPerf.expense += txnExpense;
      }

      const financingTagText = (t.tags || "").toLowerCase();
      const cashBucket = cashMap.get(monthKey);
      const bankLines = lines.filter(l => {
        const a = accountById.get(l.accountId);
        return a && (a.isBank || a.code === "1001");
      });
      const nonBankOperationalLines = lines.filter(l => {
        const a = accountById.get(l.accountId);
        return a && !(a.isBank || a.code === "1001");
      });
      const isInternalTransfer = bankLines.length > 0 && nonBankOperationalLines.length === 0;
      if (cashBucket) {
        if (!isInternalTransfer) {
          bankLines.forEach(l => {
            cashBucket.inflow += (l.debit || 0);
            cashBucket.outflow += (l.credit || 0);
          });
        }
      }

      const isOperatingCashTxn = bankLines.length > 0
        && !isInternalTransfer
        && !["CI", "OD", "BT"].includes(t.txnType)
        && !financingTagText.includes("opening-balance");
      if (isOperatingCashTxn) {
        const operatingNet = bankLines.reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0);
        if (monthKey === currentMonthKey) operatingCashFlowMTD += operatingNet;
        if (inReportingPeriod) operatingCashFlowYTD += operatingNet;
      }
    }

    const monthlyPerformance = last6MonthKeys.map(key => {
      const item = perfMap.get(key) || { revenue: 0, expense: 0 };
      return { key, label: monthLabel(key), revenue: item.revenue, expense: item.expense, net: item.revenue - item.expense };
    });
    const cashFlowSeries = last6MonthKeys.map(key => {
      const item = cashMap.get(key) || { inflow: 0, outflow: 0 };
      return { key, label: monthLabel(key), inflow: item.inflow, outflow: item.outflow, net: item.inflow - item.outflow };
    });

    const operatingMargin = rev > 0 ? ((rev - exp) / rev) * 100 : 0;
    const grossCommissionCollected = rev;
    const brokerShare = brokerPayoutYTD;
    const companyNetCommissionRetained = grossCommissionCollected - brokerShare;

    const currentMonthPerf = monthlyPerformance.find(item => item.key === currentMonthKey) || { revenue: 0, expense: 0, net: 0 };
    const currentMonthCash = cashFlowSeries.find(item => item.key === currentMonthKey) || { inflow: 0, outflow: 0, net: 0 };

    const avgMonthlyExpense = monthlyPerformance.length > 0 ? monthlyPerformance.reduce((sum, item) => sum + item.expense, 0) / monthlyPerformance.length : 0;
    const runwayMonths = avgMonthlyExpense > 0 ? cash / avgMonthlyExpense : Infinity;

    const pendingPipelineCommission = (deals || []).filter(d => d.stage !== "Commission Collected").reduce((sum, d) => sum + (d.expected_commission_net || 0), 0);
    const pipelineByType = DEAL_TYPES.map(type => {
      const group = (deals || []).filter(d => d.type === type && d.stage !== "Commission Collected");
      return { type, count: group.length, expected: group.reduce((sum, d) => sum + (d.expected_commission_net || 0), 0) };
    });
    const pipelineStageValue = DEAL_STAGES.map(stage => {
      const group = (deals || []).filter(d => d.stage === stage);
      return { stage, count: group.length, expected: group.reduce((sum, d) => sum + (d.expected_commission_net || 0), 0) };
    }).filter(row => row.count > 0 || row.expected > 0);
    const collectedDealsCount = (deals || []).filter(d => d.stage === "Commission Collected").length;
    const openDealsCount = (deals || []).filter(d => d.stage !== "Commission Collected").length;
    const topExpenseCategories = [...expenseYTDByAccount.entries()]
      .map(([id, amount]) => ({ id, name: accountById.get(id)?.name || id, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      cash,
      vat,
      rev,
      exp,
      totalAssets,
      operatingMargin,
      grossCommissionCollected,
      brokerShare,
      companyNetCommissionRetained,
      totalLiabilities,
      totalEquity,
      netWorth,
      monthlyPerformance,
      cashFlowSeries,
      currentMonth: {
        label: currentMonthPerf.label,
        revenue: currentMonthPerf.revenue,
        expense: currentMonthPerf.expense,
        net: currentMonthPerf.net,
        cashIn: currentMonthCash.inflow,
        cashOut: currentMonthCash.outflow,
        cashNet: currentMonthCash.net,
      },
      avgMonthlyExpense,
      runwayMonths,
      operatingCashFlowMTD,
      operatingCashFlowYTD,
      pendingPipelineCommission,
      pipelineByType,
      pipelineStageValue,
      collectedDealsCount,
      openDealsCount,
      brokerPayoutYTD,
      topExpenseCategories,
      reportingStartDate,
    };
  }, [accounts, txns, deals, ledger, settings]);

  // Loading
  if (!fbLoaded || !userRole) return <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
    <Logo size={64} /><div style={{ color: GOLD, fontSize: 18, fontWeight: 700, letterSpacing: "0.05em" }}>NASAMA PROPERTIES</div>
    <div style={{ color: "#8B8BA8", fontSize: 13 }}>{!fbLoaded ? 'Connecting to Firebase…' : 'Loading permissions…'}</div>
    <div style={{ width: 200, height: 3, background: "#2D2D45", borderRadius: 3, overflow: "hidden", marginTop: 8 }}><div style={{ height: "100%", background: GOLD, borderRadius: 3, animation: "npLoad 1.4s ease-in-out infinite" }} /></div>
    <style>{`@keyframes npLoad{0%{width:0%}60%{width:90%}100%{width:100%}}`}</style>
  </div>;

  const shared = { accounts, setAccounts: setAccountsFS, txns, setTxns: setTxnsFS, deals, setDeals: setDealsFS, customers, setCustomers: setCustomersFS, vendors, setVendors: setVendorsFS, brokers, setBrokers: setBrokersFS, developers, setDevelopers: setDevelopersFS, plannedExpenses, setPlannedExpenses: setPlannedExpensesFS, settings, setSettings: setSettingsFS, ledger, saveTxn, persistTxn, deleteTxn, journal, dark, setDark, setPage, userRole: accessSubject, userEmail, writeMeta };

  const addMap = { deals: () => document.dispatchEvent(new CustomEvent("add-deal")), receipts: () => document.dispatchEvent(new CustomEvent("add-receipt")), payments: () => document.dispatchEvent(new CustomEvent("add-payment")), journal: () => document.dispatchEvent(new CustomEvent("add-txn")), customers: () => document.dispatchEvent(new CustomEvent("add-customer")), brokers: () => document.dispatchEvent(new CustomEvent("add-broker")), developers: () => document.dispatchEvent(new CustomEvent("add-developer")), vendors: () => document.dispatchEvent(new CustomEvent("add-vendor")), coa: () => document.dispatchEvent(new CustomEvent("add-account")), futureExpenses: () => document.dispatchEvent(new CustomEvent("add-planned-expense")), banana2: () => toast("Banana 2 action triggered!", "success") };

  const renderPage = () => {
    if (!canAccessPage(accessSubject, page)) {
      return <div style={{ ...C.card, padding: 24 }}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8 }}>Access restricted</div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>This screen is not available for the current role.</div>
      </div>;
    }
    switch (page) {
      case "dashboard": return <Dashboard {...shared} kpis={kpis} plannedExpenses={plannedExpenses} />;
      case "deals": return <DealsPage {...shared} />;
      case "receipts": return <ReceiptsPage {...shared} />;
      case "invoices": return <InvoicePage customers={customers} developers={developers} deals={deals} settings={settings} userEmail={userEmail} userRole={accessSubject} />;
      case "payments": return <PaymentsPage {...shared} />;
      case "customers": return <CustomersPage {...shared} />;
      case "brokers": return <BrokersPage {...shared} />;
      case "developers": return <DevelopersPage {...shared} />;
      case "vendors": return <VendorsPage {...shared} />;
      case "banking": return <BankingPageV2 {...shared} />;
      case "coa": return <COAPage {...shared} />;
      case "journal": return <JournalPageV2 {...shared} />;
      case "reports": return <ReportsPage {...shared} />;
      case "vat": return <VATPage {...shared} />;
      case "manual": return <ManualPage />;
      case "settings": return <SettingsPage {...shared} />;
      case "futureExpenses": return <FutureExpensesPage {...shared} />;
      case "users": return <SecurityAdminPage userRole={userRole} userEmail={userEmail} settings={settings} />;
      case "banana2": return <PerformancePage deals={deals} setPage={setPage} />;
      default: return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>🚧 Coming soon</div>;
    }
  };

  const navBg = dark ? "#060912" : "#080C1A";
  const mainBg = dark ? "#0E1120" : "#F1F3F8";
  const headerBg = dark ? "#111425" : "#ffffff";
  const borderClr = dark ? "#1E2440" : "#EAECF0";
  const sectionHasVisiblePage = (index) => {
    for (let i = index + 1; i < NAV.length; i++) {
      if (NAV[i].s) break;
      if (NAV[i].id && canAccessPage(accessSubject, NAV[i].id)) return true;
    }
    return false;
  };

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0, background: mainBg, overflow: "hidden" }}>
      {/* Connection Status Banner */}
      {!connected && <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#DC2626", color: "#FFFFFF", padding: "8px 16px", fontSize: 13, fontWeight: 600, zIndex: 1000, textAlign: "center", boxShadow: "0 2px 8px rgba(220,38,38,.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>⚠️ DATABASE CONNECTION LOST — Working offline. Changes will sync when connection returns.</span>
        <button style={{ background: "#FFFFFF", color: "#DC2626", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => window.location.reload()}>Retry</button>
      </div>}

      {/* Sidebar */}
      {(!isMobile || mobileMenuOpen) && <div style={{ width: isMobile ? "82%" : (sidebarCollapsed ? 64 : 260), minWidth: isMobile ? undefined : (sidebarCollapsed ? 64 : 260), background: "#07090F", display: "flex", flexDirection: "column", flexShrink: 0, position: isMobile ? "fixed" : "relative", top: 0, left: 0, bottom: 0, zIndex: isMobile ? 1001 : 1, boxShadow: isMobile ? "4px 0 40px rgba(0,0,0,.7)" : "none", borderRight: "1px solid rgba(255,255,255,.06)", transition: isMobile ? "none" : "width 0.22s cubic-bezier(.4,0,.2,1)", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ padding: sidebarCollapsed ? "20px 0 16px" : "20px 16px 16px", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", gap: 8, flexShrink: 0 }}>
          {sidebarCollapsed
            ? <Logo size={28} />
            : <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Logo size={30} />
                <div>
                  <div style={{ color: "#C9A044", fontWeight: 800, fontSize: 14, letterSpacing: "0.1em", lineHeight: 1.2 }}>NASAMA</div>
                  <div style={{ color: "#1E2848", fontSize: 9, letterSpacing: "0.2em", marginTop: 2, textTransform: "uppercase" }}>Accounting</div>
                </div>
              </div>
          }
          {!isMobile && (
            <button
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => { const v = !sidebarCollapsed; setSidebarCollapsed(v); localStorage.setItem("na2_sidebar_collapsed", v); }}
              style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#4E5E8A", transition: "background .15s, color .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.09)"; e.currentTarget.style.color = "#90A0C8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.color = "#4E5E8A"; }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
              </svg>
            </button>
          )}
        </div>

        {/* Gold accent rule */}
        <div style={{ height: 1, flexShrink: 0, background: sidebarCollapsed ? "rgba(255,255,255,.05)" : "linear-gradient(to right, rgba(201,160,68,.35) 0%, rgba(201,160,68,.06) 55%, transparent 100%)", margin: sidebarCollapsed ? "0 14px 6px" : "0 18px 6px" }} />

        {/* ── Nav items ── */}
        <div style={{ flex: 1, padding: "4px 0 8px", overflowY: "auto", overflowX: "hidden" }}>
          {NAV.map((item, i) => {
            // Section header
            if (item.s) {
              if (!sectionHasVisiblePage(i)) return null;
              if (sidebarCollapsed) return i > 0 ? <div key={i} style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "6px 13px" }} /> : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px 5px" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", color: "#252E50", textTransform: "uppercase", whiteSpace: "nowrap" }}>{item.s}</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.04)" }} />
                </div>
              );
            }
            if (!canAccessPage(accessSubject, item.id)) return null;
            const active = page === item.id;

            // Collapsed mode: icon-only pill
            if (sidebarCollapsed) return (
              <div
                key={item.id}
                title={item.label}
                onClick={() => { setPage(item.id); if (isMobile) setMobileMenuOpen(false); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, margin: "2px auto", borderRadius: 8, cursor: "pointer", background: active ? "rgba(201,160,68,.10)" : "transparent", borderLeft: active ? "2.5px solid #C9A044" : "2.5px solid transparent", transition: "background .15s" }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.05)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <SidebarIcon id={item.id} active={active} />
              </div>
            );

            // Expanded mode: full row
            return (
              <div
                key={item.id}
                className="nav-item"
                onClick={() => { setPage(item.id); if (isMobile) setMobileMenuOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 12, height: 44, padding: "0 14px 0 16px", margin: "1px 10px", cursor: "pointer", borderRadius: 8, fontSize: 13.5, fontWeight: active ? 600 : 400, letterSpacing: "0.01em", color: active ? "#EDE6D4" : "#617098", background: active ? "rgba(201,160,68,.09)" : "transparent", borderLeft: active ? "2.5px solid #C9A044" : "2.5px solid transparent", transition: "background .15s, color .15s", userSelect: "none", whiteSpace: "nowrap", overflow: "hidden" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.color = "#8998C8"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#617098"; } }}
              >
                <SidebarIcon id={item.id} active={active} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* ── Footer: user profile ── */}
        <div style={{ padding: sidebarCollapsed ? "8px 0 16px" : "8px 10px 16px", flexShrink: 0 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: sidebarCollapsed ? "0 14px 10px" : "0 4px 10px" }} />
          {sidebarCollapsed
            ? <div style={{ display: "flex", justifyContent: "center" }}>
                <div title={`${userEmail} · ${userRole}`} style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #C9A044 0%, #6E4912 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "default", letterSpacing: "0.02em" }}>
                  {userEmail ? userEmail[0].toUpperCase() : "?"}
                </div>
              </div>
            : <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.05)" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #C9A044 0%, #6E4912 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0, letterSpacing: "0.02em" }}>
                  {userEmail ? userEmail[0].toUpperCase() : "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#5A6888", fontSize: 11.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{userEmail}</div>
                  <span style={C.badge(userRole === "admin" ? "danger" : userRole === "accountant" ? "info" : "neutral")}>{userRole}</span>
                </div>
                <button
                  title="Sign Out"
                  onClick={signOut}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, display: "flex", alignItems: "center", flexShrink: 0, color: "#2E3A5E", transition: "color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#8090B8"}
                  onMouseLeave={e => e.currentTarget.style.color = "#2E3A5E"}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </div>
          }
        </div>
      </div>}

      {isMobile && mobileMenuOpen && <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999 }} />}

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>

        {/* Header */}
        <div style={{ height: isMobile ? 54 : 60, background: headerBg, borderBottom: `1px solid ${borderClr}`, display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, padding: isMobile ? "0 10px" : "0 24px", flexShrink: 0, boxShadow: "0 1px 0 " + borderClr }}>
          {isMobile && <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4.5, flexShrink: 0 }}>
            <div style={{ width: 20, height: 2, background: GOLD, borderRadius: 2 }}></div>
            <div style={{ width: 13, height: 2, background: GOLD, borderRadius: 2 }}></div>
            <div style={{ width: 20, height: 2, background: GOLD, borderRadius: 2 }}></div>
          </button>}
          {isMobile
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Logo size={22} />
                  <span style={{ color: GOLD, fontWeight: 800, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase" }}>NASAMA</span>
                </div>
              </div>
            : <div style={{ flex: 1 }} />
          }
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 10, flexShrink: 0 }}>
            {!isMobile && <button style={C.btn()} onClick={() => (addMap[page] || (() => toast("Navigate to a module first", "info")))()}>+ Add New</button>}
            {isMobile && <button style={{ ...C.btn(), padding: '7px 11px', fontSize: 13, minHeight: 36 }} onClick={() => (addMap[page] || (() => toast("Navigate first", "info")))()}>+</button>}
            <button style={{ ...C.btn("secondary"), padding: isMobile ? '7px 9px' : undefined, minHeight: isMobile ? 36 : undefined }} onClick={() => setDark(d => !d)}>{dark ? "☀️" : "🌙"}</button>
            {syncing && isMobile && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", flexShrink: 0, display: "block" }} title="Saving…" />}
            {syncing && !isMobile && <span style={{ fontSize: 11, background: "#ECFDF3", color: "#027A48", border: "1px solid #A6F4C5", borderRadius: 20, padding: "3px 11px", fontWeight: 500 }}>Saving…</span>}
            {!syncing && syncError && <span style={{ fontSize: 11, background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA", borderRadius: 20, padding: "3px 11px", fontWeight: 500 }}>Sync Error</span>}
            {!syncing && !syncError && !isMobile && <span style={{ fontSize: 11, color: "#039855", fontWeight: 500 }}>Synced</span>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isMobile ? 10 : 24, paddingBottom: isMobile ? 80 : 24, background: mainBg }}>
          {renderPage()}
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: dark ? "rgba(8,12,26,0.95)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: `1px solid ${dark ? "rgba(255,255,255,.06)" : "#EAECF0"}`, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "6px 6px 10px", zIndex: 1000, boxShadow: "0 -4px 24px rgba(0,0,0,.08)" }}>
        {[
          { id: "dashboard", label: "Home" },
          { id: "deals", label: "Deals" },
          { id: "banking", label: "Bank" },
          { id: "reports", label: "Reports" },
          { id: "more", label: "More" }
        ].map(item => {
          const isActive = item.id === "more" ? false : page === item.id;
          return (
            <div
              key={item.id}
              onClick={() => item.id === "more" ? setMobileMenuOpen(true) : setPage(item.id)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", padding: "7px 2px 6px", borderRadius: 12, background: isActive ? (dark ? "rgba(201,160,68,.13)" : "rgba(201,160,68,.10)") : "transparent", transition: "background .18s", margin: "0 2px" }}
            >
              {item.id === "more"
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2" fill={isActive ? GOLD : (dark ? "#617098" : "#9CA3AF")}/><circle cx="12" cy="12" r="2" fill={isActive ? GOLD : (dark ? "#617098" : "#9CA3AF")}/><circle cx="19" cy="12" r="2" fill={isActive ? GOLD : (dark ? "#617098" : "#9CA3AF")}/></svg>
                : <SidebarIcon id={item.id} active={isActive} />
              }
              <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 500, color: isActive ? GOLD : (dark ? "#617098" : "#9CA3AF"), letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1.1, marginTop: 1 }}>{item.label}</span>
            </div>
          );
        })}
      </div>}

      <ToastHost />
    </div>
  );
}

// ── RENDER ─────────────────────────────────────────
if (typeof React !== 'undefined' && typeof ReactDOM !== 'undefined' && typeof firebase !== 'undefined') {
  ReactDOM.createRoot(document.getElementById("root")).render(<AuthGate><App /></AuthGate>);
} else {
  document.body.innerHTML = '<div style="padding:20px;color:#DC2626"><h2>Loading Error</h2><p>Required libraries failed to load.</p></div>';
}
