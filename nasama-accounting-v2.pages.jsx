/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       PAGE COMPONENTS
       â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  DASHBOARD
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function Dashboard({ accounts, txns, deals, kpis, ledger, setPage, dark }) {
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth <= 1120;
      const recentTxns = [...txns].filter(t => !t.isVoid).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
      const cashAccounts = accounts.filter(a => a.isBank || a.code === "1001");
      const maxCashFlow = Math.max(1, ...kpis.cashFlowSeries.map(item => Math.max(item.inflow, item.outflow, Math.abs(item.net))));
      const maxPerformance = Math.max(1, ...kpis.monthlyPerformance.map(item => Math.max(item.revenue, item.expense, Math.abs(item.net))));
      const sectionTitle = (title, sub, actionLabel, actionPage) => <div style={{ padding: "15px 18px 12px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: dark ? "#F3F4F6" : NAVY }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{sub}</div>}
        </div>
        {actionLabel && <button style={C.btn("ghost", true)} onClick={() => setPage(actionPage)}>{actionLabel}</button>}
      </div>;

      return <div>
        <PageHeader title="Dashboard" sub={`Nasama Properties - ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}>
          <button style={C.btn("ghost", true)} onClick={() => setPage("reports")}>Open Financial Reports</button>
          <button style={C.btn("ghost", true)} onClick={() => setPage("banking")}>Review Cash Movement</button>
        </PageHeader>

        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.35fr 1fr", gap: 16, marginBottom: 18 }}>
          <div style={{ ...C.card, padding: 22, background: "linear-gradient(135deg, #1C1C2E 0%, #2D2D45 55%, #3C3C66 100%)", color: "#FFFFFF", border: "none" }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "#D6C27A", fontWeight: 700, marginBottom: 10 }}>CEO Financial Snapshot</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>Cash is {kpis.currentMonth.cashNet >= 0 ? "improving" : "under pressure"} this month.</div>
            <div style={{ fontSize: 14, color: "#E5E7EB", maxWidth: 760, lineHeight: 1.6 }}>
              Net cash movement for {kpis.currentMonth.label} is <strong>{fmtAED(kpis.currentMonth.cashNet)}</strong>, while year-to-date net income is <strong>{fmtAED(kpis.rev - kpis.exp)}</strong>.
              Pending commission in the active pipeline stands at <strong>{fmtAED(kpis.pendingPipelineCommission)}</strong>.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 18 }}>
              {[
                { label: "Cash and bank", value: fmtAED(kpis.cash), tone: "#93C5FD" },
                { label: "Runway", value: kpis.runwayMonths === Infinity ? "Healthy" : `${kpis.runwayMonths.toFixed(1)} months`, tone: "#86EFAC" },
                { label: "Net worth", value: fmtAED(kpis.netWorth), tone: "#FDE68A" },
                { label: "Net VAT", value: fmtAED(kpis.vat), tone: kpis.vat >= 0 ? "#FCA5A5" : "#86EFAC" },
              ].map((item, i) => <div key={i} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#CBD5E1", fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, color: item.tone }}>{item.value}</div>
              </div>)}
            </div>
          </div>

          <div style={C.card}>
            {sectionTitle("Financial Health", "Quick interpretation of the current balance sheet and operating trend")}
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              {[
                { label: "This month result", value: fmtAED(kpis.currentMonth.net), note: kpis.currentMonth.net >= 0 ? "Profitable month so far" : "Loss this month", color: kpis.currentMonth.net >= 0 ? "#059669" : "#DC2626" },
                { label: "Liabilities", value: fmtAED(kpis.totalLiabilities), note: `${Math.max(0, Math.round((kpis.totalLiabilities / Math.max(kpis.totalAssets, 1)) * 100))}% of assets`, color: "#DC2626" },
                { label: "Broker payout YTD", value: fmtAED(kpis.brokerPayoutYTD), note: "Commission expense paid to brokers", color: "#D97706" },
                { label: "Collected deals", value: `${kpis.collectedDealsCount} / ${deals.length}`, note: `${kpis.openDealsCount} deals still open`, color: "#2563EB" },
              ].map((row, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", paddingBottom: 10, borderBottom: i < 3 ? "1px solid #F3F4F6" : "none" }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6B7280", fontWeight: 700 }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{row.note}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: row.color, whiteSpace: "nowrap" }}>{row.value}</div>
              </div>)}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Cash and Bank", v: fmtAED(kpis.cash), s: "Available liquidity", c: "#2563EB" },
            { l: "Net Worth", v: fmtAED(kpis.netWorth), s: "Assets minus liabilities", c: "#0F766E" },
            { l: "Revenue YTD", v: fmtAED(kpis.rev), s: "Current calendar year", c: "#059669" },
            { l: "Expenses YTD", v: fmtAED(kpis.exp), s: "Current calendar year", c: "#D97706" },
            { l: "Net Income YTD", v: fmtAED(kpis.rev - kpis.exp), s: "Current calendar year", c: (kpis.rev - kpis.exp) >= 0 ? NAVY : "#DC2626" },
            { l: "Pending Pipeline", v: fmtAED(kpis.pendingPipelineCommission), s: "Uncollected expected commission", c: GOLD },
            { l: "Open Deals", v: kpis.openDealsCount, s: "Not yet collected", c: "#7C3AED" },
            { l: "Runway", v: kpis.runwayMonths === Infinity ? "Healthy" : `${kpis.runwayMonths.toFixed(1)} months`, s: "Cash divided by avg monthly expense", c: "#475569" },
          ].map((k, i) => <div key={i} style={{ ...C.card, padding: "16px 18px", borderTop: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", fontWeight: 700, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: dark ? "#E8E8F0" : NAVY }}>{k.v}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{k.s}</div>
          </div>)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.1fr 1.1fr 0.9fr", gap: 16, marginBottom: 16 }}>
          <div style={C.card}>
            {sectionTitle("Cash Flow Trend", "Last 6 months - bank and cash movement")}
            <div style={{ padding: 18 }}>
              {kpis.cashFlowSeries.map((item, i) => <div key={item.key} style={{ marginBottom: i < kpis.cashFlowSeries.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: item.net >= 0 ? "#059669" : "#DC2626", fontWeight: 700 }}>{fmtAED(item.net)}</div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}><span>Cash in</span><span>{fmtAED(item.inflow)}</span></div>
                    <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.inflow / maxCashFlow) * 100)}%`, height: "100%", background: "#059669" }} /></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}><span>Cash out</span><span>{fmtAED(item.outflow)}</span></div>
                    <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.outflow / maxCashFlow) * 100)}%`, height: "100%", background: "#DC2626" }} /></div>
                  </div>
                </div>
              </div>)}
            </div>
          </div>

          <div style={C.card}>
            {sectionTitle("Revenue vs Expense", "Last 6 months - operating performance")}
            <div style={{ padding: 18 }}>
              {kpis.monthlyPerformance.map((item, i) => <div key={item.key} style={{ marginBottom: i < kpis.monthlyPerformance.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: item.net >= 0 ? "#059669" : "#DC2626", fontWeight: 700 }}>{fmtAED(item.net)}</div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}><span>Revenue</span><span>{fmtAED(item.revenue)}</span></div>
                    <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.revenue / maxPerformance) * 100)}%`, height: "100%", background: "#0EA5E9" }} /></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}><span>Expense</span><span>{fmtAED(item.expense)}</span></div>
                    <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (item.expense / maxPerformance) * 100)}%`, height: "100%", background: "#F59E0B" }} /></div>
                  </div>
                </div>
              </div>)}
            </div>
          </div>

          <div style={C.card}>
            {sectionTitle("Cash by Account", "Live balances from bank and cash ledger", "Go to Banking", "banking")}
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
            {sectionTitle("Pipeline by Type", "Expected commission still in the business pipeline", "Open Deals", "deals")}
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
            {sectionTitle("Pipeline by Stage", "Where expected commission is currently sitting")}
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
            {sectionTitle("Top Expense Categories", "Year-to-date spend concentration", "Open Payments", "payments")}
            <div style={{ padding: 18 }}>
              {kpis.topExpenseCategories.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "18px 0" }}>No expense activity recorded yet.</div>}
              {kpis.topExpenseCategories.map((row, i) => {
                const topBase = Math.max(kpis.topExpenseCategories[0]?.amount || 1, 1);
                return <div key={row.id} style={{ marginBottom: i < kpis.topExpenseCategories.length - 1 ? 14 : 0 }}>
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
          {sectionTitle("Recent Transactions", "Latest journal activity across the company", "Open Journal", "journal")}
          <div style={{ padding: "4px 18px 12px" }}>
            {recentTxns.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF", fontSize: 13 }}>No transactions yet. Start by recording a sale receipt or payment.</div>}
            {recentTxns.map((t, i) => {
              const typeInfo = TXN_TYPES[t.txnType] || { label: t.txnType || "JV" };
              const total = (t.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0);
              return <div key={t.id || i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr auto auto", gap: 12, alignItems: "center", padding: "11px 0", borderBottom: i < recentTxns.length - 1 ? "1px solid #F3F4F6" : "none", fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 700, color: NAVY }}>{t.description || "Manual journal entry"}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{fmtDate(t.date)} - {typeInfo.label} - {t.counterparty || "Internal"}</div>
                </div>
                <span style={{ ...C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "info"), justifySelf: isMobile ? "start" : "center" }}>{t.ref}</span>
                <div style={{ fontWeight: 700, color: "#374151", textAlign: isMobile ? "left" : "right" }}>{fmtAED(total || 0)}</div>
              </div>;
            })}
          </div>
        </div>
      </div>;

      return <div>
        <PageHeader title="Dashboard" sub={`Nasama Properties â€” ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`} />

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14, marginBottom: 22 }}>
          {[
            { l: "Bank Balance", v: fmtAED(kpis.cash), s: "All bank + cash accounts", c: "#2563EB" },
            { l: "Net VAT Payable", v: fmtAED(kpis.vat), s: "Output âˆ’ Input VAT", c: "#7C3AED" },
            { l: "Revenue YTD", v: fmtAED(kpis.rev), s: "This year", c: "#059669" },
            { l: "Expenses YTD", v: fmtAED(kpis.exp), s: "This year", c: "#D97706" },
            { l: "Net Income YTD", v: fmtAED(kpis.rev - kpis.exp), s: "Revenue âˆ’ Expenses", c: NAVY },
            { l: "Active Deals", v: deals.length, s: "Pipeline", c: GOLD },
          ].map((k, i) => <div key={i} style={{ ...C.card, padding: "15px 18px", borderTop: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", fontWeight: 600, marginBottom: 5 }}>{k.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: dark ? "#E8E8F0" : NAVY }}>{k.v}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 3 }}>{k.s}</div>
          </div>)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Deal Pipeline */}
          <div style={C.card}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>ðŸ¤ Deal Pipeline</span>
              <button style={C.btn("ghost", true)} onClick={() => setPage("deals")}>View All â†’</button>
            </div>
            <div style={{ padding: "8px 18px" }}>
              {DEAL_STAGES.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < DEAL_STAGES.length - 1 ? "1px solid #F3F4F6" : "none", fontSize: 13 }}>
                <span style={{ color: "#374151" }}>{s}</span>
                <span style={C.badge(stageCounts[s] > 0 ? (s.includes("Collected") ? "success" : s.includes("Earned") ? "gold" : "info") : "neutral")}>{stageCounts[s]}</span>
              </div>)}
            </div>
          </div>

          {/* Recent Transactions */}
          <div style={C.card}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>ðŸ“’ Recent Transactions</span>
              <button style={C.btn("ghost", true)} onClick={() => setPage("journal")}>View All â†’</button>
            </div>
            <div style={{ padding: "4px 18px" }}>
              {recentTxns.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#9CA3AF", fontSize: 13 }}>No transactions yet. Start by recording a sale receipt or payment.</div>}
              {recentTxns.map((t, i) => {
                const typeInfo = TXN_TYPES[t.txnType] || { label: t.txnType || "JV" };
                return <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < recentTxns.length - 1 ? "1px solid #F3F4F6" : "none", fontSize: 13 }}>
                  <div><div style={{ fontWeight: 500 }}>{t.description?.substring(0, 40)}{t.description?.length > 40 ? "â€¦" : ""}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(t.date)} Â· {typeInfo.label}</div></div>
                  <span style={C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "info")}>{t.ref}</span>
                </div>;
              })}
            </div>
          </div>
        </div>

        {/* Cash Position */}
        <div style={C.card}>
          <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>ðŸ’° Cash Position</div>
          <div style={{ padding: "8px 18px" }}>
            {accounts.filter(a => a.isBank || a.code === "1001").map((a, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
              <span style={{ color: "#374151" }}>{a.name}</span>
              <span style={{ fontWeight: 600, color: accountBalance(a, ledger) >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(accountBalance(a, ledger))}</span>
            </div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14, fontWeight: 700 }}>
              <span>Total Cash & Bank</span>
              <span style={{ color: "#2563EB" }}>{fmtAED(kpis.cash)}</span>
            </div>
          </div>
        </div>
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  USER MANUAL PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function ManualPage() {
      return <div>
        <PageHeader title="User Manual" sub="Complete guide to using the accounting system" />
        <div style={{ ...C.card, padding: 24, maxWidth: 800 }}>
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: GOLD }}>ðŸ“ How to Enter Sales (Receipts)</h3>
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
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: GOLD }}>ðŸ’³ How to Enter Expenses (Payments)</h3>
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
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: GOLD }}>ðŸ—‚ï¸ Chart of Accounts Definitions</h3>
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

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  DEALS PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      const sortLabel = key => sortKey === key ? (sortDir === "asc" ? " â–²" : " â–¼") : " â†•";
      const SortTh = ({ sortBy, align = "left", children }) => <th style={{ ...C.th, textAlign: align }}>
        <button onClick={() => toggleSort(sortBy)} style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, textTransform: "inherit", letterSpacing: "inherit" }}>
          <span>{children}</span>
          <span style={{ fontSize: 10, color: sortKey === sortBy ? GOLD_D : "#9CA3AF" }}>{sortLabel(sortBy)}</span>
        </button>
      </th>;

      return <div>
        <PageHeader title="Deals / Pipeline" sub={`${deals.length} deals total${duplicateDealCount ? ` â€¢ ${duplicateDealCount} suspected duplicates` : ""}`}>
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
                <td style={C.td}><div style={{ fontWeight: 500 }}>{d.property_name || "â€”"}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{d.unit_no && `Unit ${d.unit_no}`}</div></td>
                <td style={C.td}><span style={C.badge(d.type === "Off-Plan" ? "info" : d.type === "Secondary" ? "gold" : "success")}>{d.type}</span></td>
                <td style={C.td}><span style={C.badge(d.stage?.includes("Collected") ? "success" : d.stage?.includes("Earned") ? "gold" : "neutral")}>{d.stage}</span></td>
                <td style={C.td}>{d.client_name || "â€”"}</td>
                <td style={C.td}>{d.broker_name || "â€”"}</td>
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
            <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>{edit?.id ? "Edit Deal" : "New Deal"}</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <DealForm initial={normalizeLinkedDealRefs(edit || empty)} onSave={save} onCancel={() => setShow(false)} customers={customers} brokers={brokers} developers={developers} />
          </div>
        </div>}
      </div>;
    }

    function DealForm({ initial, onSave, onCancel, customers, brokers, developers }) {
      const [d, setD] = useState({ ...initial });
      const up = (k, v) => setD(p => {
        const next = { ...p, [k]: v };
        // Auto-calc commission
        if (k === "transaction_value" || k === "commission_pct") {
          const val = k === "transaction_value" ? v : next.transaction_value;
          const pct = k === "commission_pct" ? v : next.commission_pct;
          if (val && pct) next.expected_commission_net = Math.round(val * parseFloat(pct) / 100);
        }
        return next;
      });

      return <div>
        <div style={C.mbdy}>
          <div style={C.fg}>
            <div><label style={C.label}>Deal Type</label><Sel value={d.type} onChange={e => up("type", e.target.value)}>{DEAL_TYPES.map(t => <option key={t}>{t}</option>)}</Sel></div>
            <div><label style={C.label}>Stage</label><Sel value={d.stage} onChange={e => up("stage", e.target.value)}>{DEAL_STAGES.map(s => <option key={s}>{s}</option>)}</Sel></div>
            <div><label style={C.label}>Property Name</label><Inp value={d.property_name} onChange={e => up("property_name", e.target.value)} /></div>
            <div><label style={C.label}>Unit No.</label><Inp value={d.unit_no} onChange={e => up("unit_no", e.target.value)} /></div>
            <div><label style={C.label}>Developer</label><Sel value={d.developer_id} onChange={e => { const dev = developers.find(x => x.id === e.target.value); up("developer_id", e.target.value); up("developer", dev ? dev.name : ""); }}>
              <option value="">â€” Select â€”</option>
              {developers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Sel></div>
            <div><label style={C.label}>Broker</label><Sel value={d.broker_id} onChange={e => { const br = brokers.find(x => x.id === e.target.value); up("broker_id", e.target.value); up("broker_name", br ? br.name : ""); }}>
              <option value="">â€” Select â€”</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Sel></div>
            <div><label style={C.label}>Client</label><Sel value={d.customer_id} onChange={e => { const c = customers.find(x => x.id === e.target.value); up("customer_id", e.target.value); up("client_name", c ? c.name : ""); }}>
              <option value="">â€” Select â€”</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel></div>
            <div><label style={C.label}>Transaction Value (AED)</label><Inp type="number" step="0.01" value={d.transaction_value ? fromCents(d.transaction_value) : ""} onChange={e => up("transaction_value", toCents(e.target.value))} placeholder="Optional if you only know the commission amount" /></div>
            <div><label style={C.label}>Commission %</label><Inp type="number" step="0.01" value={d.commission_pct} onChange={e => up("commission_pct", e.target.value)} placeholder="Optional" /></div>
            <div><label style={C.label}>Expected Net Commission (AED)</label><Inp type="number" step="0.01" value={d.expected_commission_net ? fromCents(d.expected_commission_net) : ""} onChange={e => up("expected_commission_net", toCents(e.target.value))} placeholder="You can enter this directly from your sheet" /></div>
            <div><label style={C.label}>VAT Applicable</label><Sel value={d.vat_applicable ? "yes" : "no"} onChange={e => up("vat_applicable", e.target.value === "yes")}><option value="yes">Yes (5%)</option><option value="no">No</option></Sel></div>
            <div><label style={C.label}>Date Created</label><Inp type="date" value={d.created_at} onChange={e => up("created_at", e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 14 }}><label style={C.label}>Notes</label><textarea style={{ ...C.input, minHeight: 60, resize: "vertical" }} value={d.notes || ""} onChange={e => up("notes", e.target.value)} /></div>
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={onCancel}>Cancel</button><button style={C.btn()} onClick={() => onSave(d)}>ðŸ’¾ Save Deal</button></div>
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  SALE RECEIPTS (replaces Invoices â€” cash-settled)
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

      const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");

      return <div>
        <PageHeader title="Sale Receipts" sub={`Cash-settled commission collections â€” ${saleReceipts.length} receipts`}>
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
            <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>ðŸ’° New Sale Receipt</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <div style={C.mbdy}>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>Record a commission collected. This posts a single journal entry: DR Bank / CR Revenue / CR Output VAT.</p>
              <div style={C.fg}>
                <div><label style={C.label}>Deal</label><Sel value={form.deal_id} onChange={e => setForm(p => ({ ...p, deal_id: e.target.value }))}>
                  <option value="">â€” Select Deal â€”</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.property_name} ({d.type})</option>)}
                </Sel></div>
                <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
                <div><label style={C.label}>Gross Amount (AED)</label><Inp type="number" value={form.grossAmount} onChange={e => setForm(p => ({ ...p, grossAmount: e.target.value }))} placeholder="e.g. 52500" /></div>
                <div><label style={C.label}>VAT Rate %</label><Sel value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: parseFloat(e.target.value) }))}>
                  <option value={5}>5% (Standard)</option><option value={0}>0% (Exempt)</option>
                </Sel></div>
                <div><label style={C.label}>Receive Into</label><Sel value={form.bankCode} onChange={e => setForm(p => ({ ...p, bankCode: e.target.value }))}>
                  {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                </Sel></div>
              </div>
              {form.grossAmount && parseFloat(form.grossAmount) > 0 && <div style={{ marginTop: 16, padding: 14, background: "#F9FAFB", borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Gross:</span><span style={{ fontWeight: 600 }}>AED {parseFloat(form.grossAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
                {form.vatRate > 0 && <><div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}><span>Net (excl. VAT):</span><span>AED {(parseFloat(form.grossAmount) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}><span>VAT ({form.vatRate}%):</span><span>AED {(parseFloat(form.grossAmount) - parseFloat(form.grossAmount) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></>}
              </div>}
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={handlePreview}>Preview Journal â†’</button></div>
          </div>
        </div>}

        {preview && <PostingPreview open={true} lines={preview.lines} accounts={accounts} header={{ date: preview.date, ref: preview.ref, counterparty: preview.counterparty }} onClose={() => setPreview(null)} onConfirm={handleConfirm} />}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  PAYMENTS PAGE (replaces Expenses & Bills â€” cash-settled)
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      const expenseAccounts = accounts.filter(a => a.type === "Expense").sort((a, b) => a.code.localeCompare(b.code));
      const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");

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
        <PageHeader title="Payments" sub={`Cash-settled expense payments â€” ${payments.length} payments`}>
          {hasPermission(userRole, 'expenses.create') && <button style={C.btn()} onClick={() => setShow(true)}>+ New Payment</button>}
        </PageHeader>

        <div style={C.card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Description</th><th style={C.th}>Vendor</th><th style={C.th}>Type</th><th style={{ ...C.th, textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No payments yet.</td></tr>}
              {payments.sort((a, b) => b.date?.localeCompare(a.date)).map(t => {
                const gross = t.lines.reduce((s, l) => s + (l.credit || 0), 0);
                return <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}><span style={C.badge("warning")}>{t.ref}</span></td><td style={C.td}>{t.description}</td><td style={C.td}>{t.counterparty || "â€”"}</td><td style={C.td}><span style={C.badge(t.txnType === "BP" ? "gold" : "neutral")}>{TXN_TYPES[t.txnType]?.label || t.txnType}</span></td><td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(gross)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>

        {show && <div style={C.modal} onClick={() => setShow(false)}>
          <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>ðŸ’³ New Payment</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <div style={C.mbdy}>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>Record an expense paid. Posts: DR Expense / DR Input VAT / CR Bank.</p>
              <div style={C.fg}>
                <div><label style={C.label}>Date</label><Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
                <div><label style={C.label}>Expense Account</label><Sel value={form.expenseCode} onChange={e => setForm(p => ({ ...p, expenseCode: e.target.value }))}>
                  <option value="">â€” Select â€”</option>
                  {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} â€” {a.name}</option>)}
                </Sel></div>
                <div><label style={C.label}>Description</label><Inp value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="e.g. Office rent March 2026" /></div>
                <div><label style={C.label}>Gross Amount (AED)</label><Inp type="number" value={form.gross} onChange={e => setForm(p => ({ ...p, gross: e.target.value }))} /></div>
                <div><label style={C.label}>VAT Rate %</label><Sel value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: e.target.value }))}>
                  <option value={0}>0% (No VAT)</option><option value={5}>5% (Standard)</option>
                </Sel></div>
                <div><label style={C.label}>Paid From</label><Sel value={form.paidFromCode} onChange={e => setForm(p => ({ ...p, paidFromCode: e.target.value }))}>
                  {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                </Sel></div>
                <div><label style={C.label}>Vendor / Payee</label><Sel value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))}>
                  <option value="">â€” Optional â€”</option>
                  {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                </Sel></div>
              </div>
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={handlePreview}>Preview Journal â†’</button></div>
          </div>
        </div>}

        {preview && <PostingPreview open={true} lines={preview.lines} accounts={accounts} header={{ date: preview.date, ref: preview.ref, counterparty: preview.counterparty }} onClose={() => setPreview(null)} onConfirm={handleConfirm} />}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  CUSTOMERS / BROKERS / DEVELOPERS / VENDORS
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Searchâ€¦" style={{ maxWidth: 200 }} />
          {hasPermission(userRole, createPerm) && <button style={C.btn()} onClick={() => { setEdit(null); setShow(true); }}>+ Add</button>}
        </PageHeader>

        <div style={C.card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{fields.filter(f => f.showInTable !== false).map(f => <th key={f.key} style={C.th}>{f.label}</th>)}<th style={C.th}>Actions</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={fields.filter(f => f.showInTable !== false).length + 1} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No records found.</td></tr>}
              {filtered.map(item => <tr key={item.id}>
                {fields.filter(f => f.showInTable !== false).map(f => <td key={f.key} style={C.td}>{String(item[f.key] || "â€”")}</td>)}
                <td style={C.td}>{hasPermission(userRole, editPerm) && <button style={C.btn("secondary", true)} onClick={() => { setEdit(item); setShow(true); }}>Edit</button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>

        {show && <div style={C.modal} onClick={() => setShow(false)}>
          <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>{edit?.id ? "Edit" : "New"} {title.replace(/s$/, "")}</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <div style={C.mbdy}>
              <div style={C.fg}>
                {fields.map(f => <div key={f.key}><label style={C.label}>{f.label}</label><Inp value={(edit || {})[f.key] || ""} onChange={e => setEdit(p => ({ ...(p || {}), [f.key]: e.target.value }))} placeholder={f.placeholder || ""} /></div>)}
              </div>
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={() => save(edit || {})}>ðŸ’¾ Save</button></div>
          </div>
        </div>}
      </div>;
    }

    function CustomersPage(p) { return <CRUDPage title="Customers" icon="ðŸ‘¥" items={p.customers} setItems={p.setCustomers} eventName="add-customer" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
      { key: "name", label: "Full Name" }, { key: "nationality", label: "Nationality" },
      { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
      { key: "trn", label: "TRN", showInTable: false }, { key: "address", label: "Address", showInTable: false }
    ]} />; }

    function BrokersPage(p) { return <CRUDPage title="Brokers" icon="ðŸ‘”" items={p.brokers} setItems={p.setBrokers} eventName="add-broker" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
      { key: "name", label: "Name" }, { key: "nationality", label: "Nationality" },
      { key: "phone", label: "Phone" }, { key: "rera_no", label: "RERA No." }, { key: "rera_exp", label: "RERA Expiry" }
    ]} />; }

    function DevelopersPage(p) { return <CRUDPage title="Developers" icon="ðŸ—ï¸" items={p.developers} setItems={p.setDevelopers} eventName="add-developer" userRole={p.userRole} createPerm="sales.create" editPerm="sales.edit" fields={[
      { key: "name", label: "Name" }, { key: "contact_person", label: "Contact Person" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
      { key: "expiry_date", label: "Agreement Expiry" }
    ]} />; }

    function VendorsPage(p) { return <CRUDPage title="Vendors" icon="ðŸ­" items={p.vendors} setItems={p.setVendors} eventName="add-vendor" userRole={p.userRole} createPerm="expenses.create" editPerm="expenses.edit" fields={[
      { key: "name", label: "Name" }, { key: "category", label: "Category" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "trn", label: "TRN" }
    ]} />; }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  BANKING PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
          {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShowTransfer(true)}>â†” Transfer</button>}
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
          <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>ðŸ“‹ Recent Bank Activity</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Description</th><th style={{ ...C.th, textAlign: "right" }}>In</th><th style={{ ...C.th, textAlign: "right" }}>Out</th></tr></thead>
            <tbody>
              {txns.filter(t => !t.isVoid).sort((a, b) => b.date?.localeCompare(a.date)).slice(0, 20).map(t => {
                const bankLines = t.lines.filter(l => bankAccounts.some(ba => ba.id === l.accountId));
                if (bankLines.length === 0) return null;
                const inAmt = bankLines.reduce((s, l) => s + (l.debit || 0), 0);
                const outAmt = bankLines.reduce((s, l) => s + (l.credit || 0), 0);
                return <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}>{t.ref}</td><td style={C.td}>{t.description}</td>
                  <td style={{ ...C.td, textAlign: "right", color: inAmt > 0 ? "#059669" : "#9CA3AF" }}>{inAmt > 0 ? fmtAED(inAmt) : "ï¿½"}</td>
                  <td style={{ ...C.td, textAlign: "right", color: outAmt > 0 ? "#DC2626" : "#9CA3AF" }}>{outAmt > 0 ? fmtAED(outAmt) : "ï¿½"}</td></tr>;
              })}
            </tbody>
          </table>
        </div>

        {showTransfer && <div style={C.modal} onClick={() => setShowTransfer(false)}>
          <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700 }}>â†” Bank Transfer</span><button onClick={() => setShowTransfer(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <div style={C.mbdy}>
              <div style={C.fg}>
                <div><label style={C.label}>Date</label><Inp type="date" value={tf.date} onChange={e => setTf(p => ({ ...p, date: e.target.value }))} /></div>
                <div><label style={C.label}>From</label><Sel value={tf.fromCode} onChange={e => setTf(p => ({ ...p, fromCode: e.target.value }))}><option value="">â€” Select â€”</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
                <div><label style={C.label}>To</label><Sel value={tf.toCode} onChange={e => setTf(p => ({ ...p, toCode: e.target.value }))}><option value="">â€” Select â€”</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
                <div><label style={C.label}>Amount (AED)</label><Inp type="number" value={tf.amount} onChange={e => setTf(p => ({ ...p, amount: e.target.value }))} /></div>
              </div>
              <div style={{ marginTop: 12 }}><label style={C.label}>Memo</label><Inp value={tf.memo} onChange={e => setTf(p => ({ ...p, memo: e.target.value }))} /></div>
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShowTransfer(false)}>Cancel</button><button style={C.btn()} onClick={handleTransfer}>Post Transfer</button></div>
          </div>
        </div>}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  CHART OF ACCOUNTS
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function BankingPageV2({ accounts, setAccounts, txns, setTxns, ledger, persistTxn, journal, userRole }) {
      const [showTransfer, setShowTransfer] = useState(false);
      const [showImport, setShowImport] = useState(false);
      const [editTxnId, setEditTxnId] = useState("");
      const [sortKey, setSortKey] = useState("date");
      const [sortDir, setSortDir] = useState("desc");
      const [tf, setTf] = useState({ date: todayStr(), fromCode: "", toCode: "", amount: "", memo: "Bank transfer" });
      const [importFileName, setImportFileName] = useState("");
      const [importCsvText, setImportCsvText] = useState("");
      const [narrationMap, setNarrationMap] = useState(() => ({ ...BANK_IMPORT_DEFAULT_MAP }));
      const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");
      const editTxn = useMemo(() => txns.find(t => t.id === editTxnId) || null, [txns, editTxnId]);
      const importAccounts = useMemo(() => mergeImportAccounts(accounts || []), [accounts]);
      const importAnalysis = useMemo(() => importCsvText ? analyzeBankImport({ csvText: importCsvText, accounts: importAccounts, txns, narrationMap }) : null, [importCsvText, importAccounts, txns, narrationMap]);
      const escapeExcel = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
      const bankRows = useMemo(() => {
        const rows = txns
          .filter(t => !t.isVoid)
          .map(t => {
            const bankLines = (t.lines || []).filter(l => bankAccounts.some(ba => ba.id === l.accountId));
            if (bankLines.length === 0) return null;
            return {
              id: t.id,
              date: t.date || "",
              ref: t.ref || "",
              description: t.description || "",
              counterparty: t.counterparty || "",
              txnType: TXN_TYPES[t.txnType]?.label || t.txnType || "",
              bankAccounts: bankLines.map(l => bankAccounts.find(ba => ba.id === l.accountId)?.name || l.accountId).join(", "),
              inAmt: bankLines.reduce((s, l) => s + (l.debit || 0), 0),
              outAmt: bankLines.reduce((s, l) => s + (l.credit || 0), 0),
            };
          })
          .filter(Boolean);
        const getVal = (row) => {
          switch (sortKey) {
            case "date": return row.date || "";
            case "ref": return row.ref || "";
            case "description": return row.description || "";
            case "in": return row.inAmt || 0;
            case "out": return row.outAmt || 0;
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
      }, [txns, bankAccounts, sortKey, sortDir]);
      const handleExportBankRows = () => {
        if (!bankRows.length) { toast("No bank transactions to export", "warning"); return; }
        const exportRows = [...bankRows].sort((a, b) => {
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
            <td>${escapeExcel(row.bankAccounts)}</td>
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

      return <div>
        <PageHeader title="Banking" sub="Bank account balances, transfers, and CSV import">
          <button style={C.btn("secondary")} onClick={handleExportBankRows}>Export Excel</button>
          {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn("secondary")} onClick={() => setShowImport(true)}>Import Bank CSV</button>}
          {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShowTransfer(true)}>Transfer</button>}
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

        <div style={C.card}>
          <div style={{ padding: "13px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>Recent Bank Activity</div>
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <SortTh label="Date" sortKey={sortKey} activeKey="date" sortDir={sortDir} onToggle={toggleSort} />
                <SortTh label="Ref" sortKey={sortKey} activeKey="ref" sortDir={sortDir} onToggle={toggleSort} />
                <SortTh label="Description" sortKey={sortKey} activeKey="description" sortDir={sortDir} onToggle={toggleSort} />
                <SortTh label="In" sortKey={sortKey} activeKey="in" sortDir={sortDir} onToggle={toggleSort} align="right" />
                <SortTh label="Out" sortKey={sortKey} activeKey="out" sortDir={sortDir} onToggle={toggleSort} align="right" />
                <th style={C.th}>Actions</th>
              </tr></thead>
              <tbody>
                {bankRows.length === 0 && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>No bank transactions found.</td></tr>}
                {bankRows.map(row => <tr key={row.id}><td style={C.td}>{fmtDate(row.date)}</td><td style={C.td}>{row.ref}</td><td style={C.td}>{row.description}</td>
                  <td style={{ ...C.td, textAlign: "right", color: row.inAmt > 0 ? "#059669" : "#9CA3AF" }}>{row.inAmt > 0 ? fmtAED(row.inAmt) : "â€”"}</td>
                  <td style={{ ...C.td, textAlign: "right", color: row.outAmt > 0 ? "#DC2626" : "#9CA3AF" }}>{row.outAmt > 0 ? fmtAED(row.outAmt) : "â€”"}</td>
                  <td style={C.td}>{hasPermission(userRole, 'canEditTxns') && <button style={C.btn("secondary", true)} onClick={() => setEditTxnId(row.id)}>Edit</button>}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {showImport && <div style={C.modal} onClick={() => setShowImport(false)}>
          <div style={C.mbox(980)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Import Bank CSV</span><button onClick={() => setShowImport(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>Ã—</button></div>
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
                              <option value="">â€” Select account â€”</option>
                              {importAccounts.filter(a => !a.isBank).map(a => <option key={a.id} value={a.code}>{a.code} â€” {a.name}</option>)}
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
                          <td style={C.td}>{item.offsetAccount ? `${item.offsetAccount.code} â€” ${item.offsetAccount.name}` : "â€”"}</td>
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
            <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Bank Transfer</span><button onClick={() => setShowTransfer(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>Ã—</button></div>
            <div style={C.mbdy}>
              <div style={C.fg}>
                <div><label style={C.label}>Date</label><Inp type="date" value={tf.date} onChange={e => setTf(p => ({ ...p, date: e.target.value }))} /></div>
                <div><label style={C.label}>From</label><Sel value={tf.fromCode} onChange={e => setTf(p => ({ ...p, fromCode: e.target.value }))}><option value="">â€” Select â€”</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
                <div><label style={C.label}>To</label><Sel value={tf.toCode} onChange={e => setTf(p => ({ ...p, toCode: e.target.value }))}><option value="">â€” Select â€”</option>{bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</Sel></div>
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
      const empty = { code: "", name: "", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false };

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
        <PageHeader title="Chart of Accounts" sub={`${accounts.length} accounts â€” Clean COA (no AR/AP)`}>
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
                const flags = [a.isBank && "Bank", a.isOutputVAT && "Out VAT", a.isInputVAT && "In VAT"].filter(Boolean);
                return <tr key={a.id}>
                  <td style={{ ...C.td, fontFamily: "monospace", fontWeight: 600 }}>{a.code}</td>
                  <td style={C.td}>{a.name}</td>
                  <td style={C.td}><span style={C.badge(a.type === "Asset" || a.type === "Revenue" ? "success" : a.type === "Liability" ? "danger" : a.type === "Expense" ? "warning" : "info")}>{a.type}</span></td>
                  <td style={C.td}>{flags.length > 0 ? flags.map((f, i) => <span key={i} style={{ ...C.badge("gold"), marginRight: 4 }}>{f}</span>) : "â€”"}</td>
                  <td style={{ ...C.td, textAlign: "right", fontWeight: 600, color: bal !== 0 ? (bal > 0 ? "#059669" : "#DC2626") : "#9CA3AF" }}>{fmtAED(bal)}</td>
                  <td style={C.td}>{hasPermission(userRole, 'canManageAccounts') && <button style={C.btn("secondary", true)} onClick={() => { setEdit(a); setShow(true); }}>Edit</button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        {show && <div style={C.modal} onClick={() => setShow(false)}>
          <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700 }}>{edit?.id ? "Edit" : "New"} Account</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
            <div style={C.mbdy}>
              <div style={C.fg}>
                <div><label style={C.label}>Account Code</label><Inp value={(edit || empty).code} onChange={e => setEdit(p => ({ ...(p || empty), code: e.target.value }))} /></div>
                <div><label style={C.label}>Account Name</label><Inp value={(edit || empty).name} onChange={e => setEdit(p => ({ ...(p || empty), name: e.target.value }))} /></div>
                <div><label style={C.label}>Type</label><Sel value={(edit || empty).type} onChange={e => setEdit(p => ({ ...(p || empty), type: e.target.value }))}>{ACCT_TYPES.map(t => <option key={t}>{t}</option>)}</Sel></div>
                <div><label style={C.label}>Bank Account?</label><Sel value={(edit || empty).isBank ? "yes" : "no"} onChange={e => setEdit(p => ({ ...(p || empty), isBank: e.target.value === "yes" }))}><option value="no">No</option><option value="yes">Yes</option></Sel></div>
              </div>
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn()} onClick={() => save(edit || empty)}>ðŸ’¾ Save</button></div>
          </div>
        </div>}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  JOURNAL ENTRIES
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

      return <div>
        <PageHeader title="Journal Entries" sub={`${txns.length} entries â€” General Ledger`}>
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
                  <td style={C.td}>{t.description?.substring(0, 50)}{t.description?.length > 50 ? "â€¦" : ""}</td>
                  <td style={C.td}>{t.counterparty || "â€”"}</td>
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
            <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>ðŸ“’ Manual Journal Entry</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
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
                      <option value="">â€” Select â€”</option>
                      {accounts.sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} â€” {a.name}</option>)}
                    </Sel></td>
                    <td style={C.td}><Inp type="number" value={l.debit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], debit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                    <td style={C.td}><Inp type="number" value={l.credit || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], credit: parseFloat(e.target.value) || 0 }; setForm(p => ({ ...p, lines })); }} /></td>
                    <td style={C.td}><Inp value={l.memo || ""} onChange={e => { const lines = [...form.lines]; lines[i] = { ...lines[i], memo: e.target.value }; setForm(p => ({ ...p, lines })); }} /></td>
                    <td style={C.td}>{form.lines.length > 2 && <button style={C.btn("ghost", true)} onClick={() => setForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}>âœ•</button>}</td>
                  </tr>)}
                </tbody>
              </table>
              <button style={{ ...C.btn("secondary", true), marginTop: 8 }} onClick={() => setForm(p => ({ ...p, lines: [...p.lines, { accountId: "", debit: 0, credit: 0, memo: "" }] }))}>+ Add Line</button>
              <div style={{ marginTop: 12, padding: 10, background: "#F9FAFB", borderRadius: 7, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span>Total Debit: {form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2)}</span>
                <span>Total Credit: {form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2)}</span>
                <span style={{ color: Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "#059669" : "#DC2626" }}>
                  {Math.abs(form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? "âœ… Balanced" : "âŒ Unbalanced"}
                </span>
              </div>
            </div>
            <div style={C.mftr}><button style={C.btn("secondary")} onClick={() => setShow(false)}>Cancel</button><button style={C.btn("success")} onClick={handlePost}>âœ… Post Journal</button></div>
          </div>
        </div>}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  REPORTS PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function JournalPageV2({ accounts, txns, setTxns, saveTxn, persistTxn, journal, userRole }) {
      const [show, setShow] = useState(false);
      const [editTxnId, setEditTxnId] = useState("");
      const [filter, setFilter] = useState("All");
      const [sortKey, setSortKey] = useState("date");
      const [sortDir, setSortDir] = useState("desc");
      const [form, setForm] = useState({ date: todayStr(), description: "", counterparty: "", lines: [{ accountId: "", debit: 0, credit: 0, memo: "" }, { accountId: "", debit: 0, credit: 0, memo: "" }] });
      const editTxn = useMemo(() => txns.find(t => t.id === editTxnId) || null, [txns, editTxnId]);

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
          actionLabel: t.isVoid ? "" : [hasPermission(userRole, 'canEditTxns') ? "Edit" : "", hasPermission(userRole, 'canVoidTxns') ? "Void" : ""].filter(Boolean).join(" / ")
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
      }, [filter, txns, sortKey, sortDir, userRole]);

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

      return <div>
        <PageHeader title="Journal Entries" sub={`${txns.length} entries â€” General Ledger`}>
          <Sel value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="All">All Types</option>
            {Object.entries(TXN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Sel>
          {hasPermission(userRole, 'canCreateTxns') && <button style={C.btn()} onClick={() => setShow(true)}>+ Manual Journal</button>}
        </PageHeader>

        <div style={C.card}>
          <div style={{ overflowX: "auto", overflowY: "visible" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                    <td style={C.td}>{fmtDate(t.date)}</td>
                    <td style={C.td}><span style={C.badge("info")}>{t.ref}</span></td>
                    <td style={C.td}><span style={C.badge(t.txnType === "SR" ? "success" : t.txnType === "PV" || t.txnType === "BP" ? "warning" : "neutral")}>{typeInfo.label}</span></td>
                    <td style={C.td}>{t.description?.substring(0, 50)}{t.description?.length > 50 ? "..." : ""}</td>
                    <td style={C.td}>{t.counterparty || "â€”"}</td>
                    <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(t.totalDr)}</td>
                    <td style={C.td}>{t.isVoid ? <span style={C.badge("danger")}>VOID</span> : <span style={C.badge("success")}>Posted</span>}</td>
                    <td style={C.td}>
                      {!t.isVoid && hasPermission(userRole, 'canEditTxns') && <button style={{ ...C.btn("secondary", true), marginRight: hasPermission(userRole, 'canVoidTxns') ? 6 : 0 }} onClick={() => setEditTxnId(t.id)}>Edit</button>}
                      {!t.isVoid && hasPermission(userRole, 'canVoidTxns') && <button style={C.btn("danger", true)} onClick={() => handleVoid(t.id)}>Void</button>}
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
                        <option value="">â€” Select â€”</option>
                        {accounts.slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} â€” {a.name}</option>)}
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

    function ReportsPage({ accounts, txns, ledger, deals }) {
      const [tab, setTab] = useState("pnl");
      const tabs = [
        { id: "pnl", label: "Profit & Loss" }, { id: "bs", label: "Balance Sheet" },
        { id: "tb", label: "Trial Balance" }, { id: "gl", label: "General Ledger" }
      ];

      const ym = new Date().getFullYear().toString();

      // P&L
      const revenues = accounts.filter(a => a.type === "Revenue");
      const expenses = accounts.filter(a => a.type === "Expense");
      const totalRev = revenues.reduce((s, a) => s + accountBalance(a, ledger), 0);
      const totalExp = expenses.reduce((s, a) => s + accountBalance(a, ledger), 0);

      // Balance Sheet
      const assets = accounts.filter(a => a.type === "Asset");
      const liabilities = accounts.filter(a => a.type === "Liability");
      const equity = accounts.filter(a => a.type === "Equity");
      const totalAssets = assets.reduce((s, a) => s + accountBalance(a, ledger), 0);
      const totalLiabilities = liabilities.reduce((s, a) => s + accountBalance(a, ledger), 0);
      const totalEquity = equity.reduce((s, a) => s + accountBalance(a, ledger), 0);
      const netIncome = totalRev - totalExp;

      return <div>
        <PageHeader title="Reports" sub="Financial statements" />

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {tabs.map(t => <button key={t.id} style={{ ...C.btn(tab === t.id ? "primary" : "secondary"), fontSize: 13 }} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {tab === "pnl" && <div style={C.card}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16 }}>Profit & Loss Statement â€” YTD {new Date().getFullYear()}</div>
          <div style={{ padding: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#059669", marginBottom: 10 }}>REVENUE</div>
            {revenues.filter(a => accountBalance(a, ledger) !== 0).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span>{a.code} â€” {a.name}</span><span style={{ fontWeight: 600 }}>{fmtAED(accountBalance(a, ledger))}</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E5E7EB", marginTop: 8, fontWeight: 700 }}><span>Total Revenue</span><span style={{ color: "#059669" }}>{fmtAED(totalRev)}</span></div>

            <div style={{ fontWeight: 700, fontSize: 14, color: "#D97706", marginTop: 20, marginBottom: 10 }}>EXPENSES</div>
            {expenses.filter(a => accountBalance(a, ledger) !== 0).sort((a, b) => accountBalance(b, ledger) - accountBalance(a, ledger)).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span>{a.code} â€” {a.name}</span><span style={{ fontWeight: 600 }}>{fmtAED(accountBalance(a, ledger))}</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E5E7EB", marginTop: 8, fontWeight: 700 }}><span>Total Expenses</span><span style={{ color: "#D97706" }}>{fmtAED(totalExp)}</span></div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderTop: "3px double #1C1C2E", marginTop: 16, fontWeight: 700, fontSize: 16 }}><span>NET INCOME</span><span style={{ color: netIncome >= 0 ? "#059669" : "#DC2626" }}>{fmtAED(netIncome)}</span></div>
          </div>
        </div>}

        {tab === "bs" && <div style={C.card}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16 }}>Balance Sheet â€” as of {fmtDate(todayStr())}</div>
          <div style={{ padding: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#2563EB", marginBottom: 10 }}>ASSETS</div>
            {assets.filter(a => accountBalance(a, ledger) !== 0).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span>{a.code} â€” {a.name}</span><span style={{ fontWeight: 600 }}>{fmtAED(accountBalance(a, ledger))}</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E5E7EB", marginTop: 8, fontWeight: 700 }}><span>Total Assets</span><span style={{ color: "#2563EB" }}>{fmtAED(totalAssets)}</span></div>

            <div style={{ fontWeight: 700, fontSize: 14, color: "#DC2626", marginTop: 20, marginBottom: 10 }}>LIABILITIES</div>
            {liabilities.filter(a => accountBalance(a, ledger) !== 0).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span>{a.code} â€” {a.name}</span><span style={{ fontWeight: 600 }}>{fmtAED(accountBalance(a, ledger))}</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E5E7EB", marginTop: 8, fontWeight: 700 }}><span>Total Liabilities</span><span style={{ color: "#DC2626" }}>{fmtAED(totalLiabilities)}</span></div>

            <div style={{ fontWeight: 700, fontSize: 14, color: "#7C3AED", marginTop: 20, marginBottom: 10 }}>EQUITY</div>
            {equity.filter(a => accountBalance(a, ledger) !== 0).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span>{a.code} â€” {a.name}</span><span style={{ fontWeight: 600 }}>{fmtAED(accountBalance(a, ledger))}</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span style={{ fontStyle: "italic" }}>Current Period Net Income</span><span style={{ fontWeight: 600 }}>{fmtAED(netIncome)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E5E7EB", marginTop: 8, fontWeight: 700 }}><span>Total Equity + Net Income</span><span style={{ color: "#7C3AED" }}>{fmtAED(totalEquity + netIncome)}</span></div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderTop: "3px double #1C1C2E", marginTop: 16, fontWeight: 700, fontSize: 16 }}><span>L + E</span><span>{fmtAED(totalLiabilities + totalEquity + netIncome)}</span></div>
            <div style={{ marginTop: 8, fontSize: 12, color: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) <= 1 ? "#059669" : "#DC2626", fontWeight: 600 }}>
              {Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) <= 1 ? "âœ… Balance sheet is balanced" : "âŒ Balance sheet is NOT balanced â€” investigate"}
            </div>
          </div>
        </div>}

        {tab === "tb" && <div style={C.card}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16 }}>Trial Balance</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={C.th}>Code</th><th style={C.th}>Account</th><th style={C.th}>Type</th><th style={{ ...C.th, textAlign: "right" }}>Debit</th><th style={{ ...C.th, textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>
              {accounts.sort((a, b) => a.code.localeCompare(b.code)).filter(a => { const e = ledger[a.id] || { debit: 0, credit: 0 }; return e.debit > 0 || e.credit > 0; }).map(a => {
                const e = ledger[a.id] || { debit: 0, credit: 0 };
                const nb = NORMAL_BAL[a.type];
                const bal = nb === "debit" ? (e.debit - e.credit) : (e.credit - e.debit);
                return <tr key={a.id}><td style={{ ...C.td, fontFamily: "monospace" }}>{a.code}</td><td style={C.td}>{a.name}</td><td style={C.td}>{a.type}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{nb === "debit" && bal !== 0 ? fmtAED(bal) : "â€”"}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{nb === "credit" && bal !== 0 ? fmtAED(bal) : "â€”"}</td></tr>;
              })}
            </tbody>
            <tfoot><tr style={{ background: "#F9FAFB" }}><td colSpan={3} style={{ ...C.td, fontWeight: 700 }}>TOTALS</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(accounts.reduce((s, a) => { const nb = NORMAL_BAL[a.type]; const bal = accountBalance(a, ledger); return s + (nb === "debit" ? bal : 0); }, 0))}</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(accounts.reduce((s, a) => { const nb = NORMAL_BAL[a.type]; const bal = accountBalance(a, ledger); return s + (nb === "credit" ? bal : 0); }, 0))}</td>
            </tr></tfoot>
          </table>
        </div>}

        {tab === "gl" && <div style={C.card}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 16 }}>General Ledger</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Account</th><th style={C.th}>Description</th><th style={{ ...C.th, textAlign: "right" }}>Debit</th><th style={{ ...C.th, textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>
              {txns.filter(t => !t.isVoid).sort((a, b) => (a.date || "").localeCompare(b.date || "")).flatMap(t => (t.lines || []).map(l => {
                const a = accounts.find(x => x.id === l.accountId);
                return { date: t.date, ref: t.ref, account: a ? `${a.code} ${a.name}` : l.accountId, desc: l.memo || t.description, debit: l.debit, credit: l.credit, key: `${t.id}-${l.id}` };
              })).map(row => <tr key={row.key}><td style={C.td}>{fmtDate(row.date)}</td><td style={C.td}>{row.ref}</td><td style={C.td}>{row.account}</td><td style={C.td}>{row.desc}</td><td style={{ ...C.td, textAlign: "right" }}>{row.debit ? fmtAED(row.debit) : "â€”"}</td><td style={{ ...C.td, textAlign: "right" }}>{row.credit ? fmtAED(row.credit) : "â€”"}</td></tr>)}
            </tbody>
          </table>
        </div>}
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  VAT PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function VATPage({ accounts, txns, ledger, settings }) {
      const outputVATA = accounts.find(a => a.isOutputVAT);
      const inputVATA = accounts.find(a => a.isInputVAT);
      const settlementRows = txns
        .filter(t => !t.isVoid && isVATSettlementTxn(t, accounts))
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map(t => {
          const outAmt = (t.lines || []).filter(l => l.accountId === outputVATA?.id).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
          const inAmt = (t.lines || []).filter(l => l.accountId === inputVATA?.id).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
          return { ...t, outAmt, inAmt };
        });
      const vatRows = txns
        .filter(t => !t.isVoid && !isVATSettlementTxn(t, accounts) && t.lines?.some(l => l.accountId === outputVATA?.id || l.accountId === inputVATA?.id))
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

      return <div>
        <PageHeader title="VAT / Taxes" sub={`TRN: ${settings.trn || "Not set"} Â· UAE VAT 5%`} />
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
              {vatRows.map(t => <tr key={t.id}><td style={C.td}>{fmtDate(t.date)}</td><td style={C.td}>{t.ref}</td><td style={C.td}>{t.description}</td><td style={{ ...C.td, textAlign: "right", color: t.outAmt > 0 ? "#DC2626" : t.outAmt < 0 ? "#059669" : "#9CA3AF" }}>{t.outAmt !== 0 ? fmtAED(t.outAmt) : "â€”"}</td><td style={{ ...C.td, textAlign: "right", color: t.inAmt > 0 ? "#059669" : t.inAmt < 0 ? "#DC2626" : "#9CA3AF" }}>{t.inAmt !== 0 ? fmtAED(t.inAmt) : "â€”"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  SETTINGS PAGE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function SettingsPage({ settings, setSettings, userRole, accounts, txns, saveTxn, persistTxn }) {
      const [s, setS] = useState({ ...settings });
      const save = () => {
        setSettings(s);
        // Create opening balance transaction if amount > 0
        if (s.openingBalance > 0 && accounts && saveTxn) {
          const bankA = accounts.find(a => a.code === "1002");
          const capitalA = accounts.find(a => a.code === "3000");
          if (bankA && capitalA) {
            const existingOB = txns?.find(t => t.tags?.includes("opening-balance"));
            if (!existingOB) {
              const amountCents = toCents(s.openingBalance);
              const lines = [
                { id: uid(), accountId: bankA.id, debit: amountCents, credit: 0, memo: `Opening Balance â€” Bank deposit`, deal_id: null, broker_id: null, developer_id: null },
                { id: uid(), accountId: capitalA.id, debit: 0, credit: amountCents, memo: `Opening Balance â€” Capital Injection`, deal_id: null, broker_id: null, developer_id: null }
              ];
              const txn = { id: uid(), date: s.openingBalanceDate || todayStr(), description: "Opening Balance", ref: `OB-${Date.now().toString(36).toUpperCase()}`, counterparty: "Opening Balance", tags: "opening-balance", txnType: "JV", isVoid: false, lines, createdAt: new Date().toISOString() };
              saveTxn(txn);
            }
          }
        }
        toast("Settings saved", "success");
      };

      return <div>
        <PageHeader title="Settings" sub="Company configuration" />
        <div style={{ ...C.card, padding: 22, maxWidth: 600 }}>
          <div style={C.fg}>
            <div><label style={C.label}>Company Name</label><Inp value={s.company || ""} onChange={e => setS(p => ({ ...p, company: e.target.value }))} /></div>
            <div><label style={C.label}>TRN (Tax Registration No.)</label><Inp value={s.trn || ""} onChange={e => setS(p => ({ ...p, trn: e.target.value }))} /></div>
            <div><label style={C.label}>VAT Rate %</label><Inp type="number" value={s.vatRate || 5} onChange={e => setS(p => ({ ...p, vatRate: parseInt(e.target.value) || 5 }))} /></div>
            <div><label style={C.label}>Currency</label><Inp value={s.currency || "AED"} onChange={e => setS(p => ({ ...p, currency: e.target.value }))} /></div>
          </div>
          <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 20, paddingTop: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>ðŸ¦ Opening Balance</div>
            <div style={C.fg}>
              <div><label style={C.label}>Opening Balance (AED)</label><Inp type="number" step="0.01" value={s.openingBalance || 0} onChange={e => setS(p => ({ ...p, openingBalance: parseFloat(e.target.value) || 0 }))} placeholder="e.g., 95548.02" /></div>
              <div><label style={C.label}>As of Date</label><Inp type="date" value={s.openingBalanceDate || todayStr()} onChange={e => setS(p => ({ ...p, openingBalanceDate: e.target.value }))} /></div>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>This will create an opening balance journal entry (OB) debiting Bank and crediting Capital Injection on save.</div>
          </div>
          <div style={{ marginTop: 20 }}><button style={C.btn()} onClick={save}>ðŸ’¾ Save Settings</button></div>

          <div style={{ marginTop: 30, padding: 16, background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#DC2626", marginBottom: 6 }}>ðŸ—‘ï¸ Architecture Note</div>
            <div style={{ fontSize: 13, color: "#7F1D1D" }}>This system uses a <strong>cash-settled</strong> model. There are no Accounts Receivable, no Accounts Payable, no invoices, and no bills. Every transaction is settled immediately at the point of recording.</div>
          </div>
        </div>
      </div>;
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  USER MANAGEMENT
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
              {users.map(u => <tr key={u.id}><td style={C.td}>{u.email}</td><td style={C.td}><span style={C.badge(u.role === "admin" ? "danger" : u.role === "accountant" ? "info" : "neutral")}>{u.role}</span></td><td style={C.td}>{u.addedBy || "â€”"}</td></tr>)}
            </tbody>
          </table>
        </div>

        {show && <div style={C.modal} onClick={() => setShow(false)}>
          <div style={C.mbox(420)} onClick={e => e.stopPropagation()}>
            <div style={C.mhdr}><span style={{ fontWeight: 700 }}>Add User</span><button onClick={() => setShow(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>âœ•</button></div>
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

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  AUTH GATE
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
        return () => unsubs.forEach(unsub => { try { unsub(); } catch {} });
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
                <div><label style={C.label}>Legacy App Role</label><Sel value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="secretary">Secretary</option></Sel></div>
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
                <div><label style={C.label}>Legacy App Role</label><Sel value={roleForm.legacyRole} onChange={e => setRoleForm(p => ({ ...p, legacyRole: e.target.value }))}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="secretary">Secretary</option></Sel></div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={C.label}>Description</label><textarea style={{ ...C.input, minHeight: 70, resize: "vertical" }} value={roleForm.description || ""} onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={C.th}>Section</th><th style={C.th}>Allowed Actions</th></tr></thead>
                  <tbody>
                    {SECURITY_MODULES.map(module => <tr key={module.id}><td style={C.td}><div style={{ fontWeight: 600 }}>{module.label}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{module.pages.join(" Â· ")}</div></td><td style={C.td}><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{module.actions.map(action => { const inputId = `perm-${module.id}-${action}`; return <label key={action} htmlFor={inputId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px", border: "1px solid #E5E7EB", borderRadius: 999 }}><input id={inputId} type="checkbox" checked={!!roleForm.permissions?.[`${module.id}.${action}`]} onChange={e => setRoleForm(prev => ({ ...prev, permissions: { ...(prev?.permissions || {}), [`${module.id}.${action}`]: e.target.checked } }))} /><span>{action}</span></label>; })}</div></td></tr>)}
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

      const ensureBackendSession = async () => {
        if (typeof auth === 'undefined') return;
        if (auth.currentUser || !auth?.signInAnonymously) return;
        try { await auth.signInAnonymously(); } catch (err) { console.warn("Anonymous auth unavailable:", err?.message || err); }
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
            } catch {}
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
          setError(err.message || "Could not sign in.");
        } finally {
          setAuthBusy(false);
        }
      };

      if (loading) return <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Logo size={64} /><div style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>NASAMA PROPERTIES</div>
        <div style={{ color: "#8B8BA8", fontSize: 13 }}>Loadingâ€¦</div>
      </div>;

      if (!user) return <div style={{ position: "fixed", inset: 0, background: `linear-gradient(135deg, ${NAVY} 0%, #2D2D45 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}><Logo size={48} /><div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginTop: 8 }}>Nasama Properties</div><div style={{ fontSize: 13, color: "#6B7280" }}>Accounting System v2 Â· Clean Backend</div></div>
          {error && <div style={C.err}>{error}</div>}
          <div style={{ marginBottom: 12 }}><label style={C.label}>Email</label><Inp value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="your@email.com" /></div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>Use the access code set by the admin. If this is the very first login, this screen creates the first admin user.</div>
          <div style={{ marginBottom: 16 }}><label style={C.label}>Password</label><input type="password" style={C.input} value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
          <button style={{ ...C.btn(), width: "100%", justifyContent: "center", padding: "12px 0" }} onClick={handleLogin}>{authBusy ? "Signing In..." : "Sign In"}</button>
          <div style={{ marginTop: 12, fontSize: 12, color: "#6B7280", textAlign: "center" }}>If someone forgets the code, an admin can reset it from User Management.</div>
        </div>
      </div>;

      return React.Children.map(children, child => React.cloneElement(child, { userRole, userAccess, userEmail: user.email, signOut }));
    }

    // â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    //  MAIN APP
    // â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function App({ userRole, userAccess, userEmail, signOut }) {
      ACTIVE_USER_ACCESS = userAccess || null;
      const accessSubject = userAccess || userRole;
      const [accounts, setAccounts] = useState(() => ls_get("accounts", SEED_ACCOUNTS));
      const [txns, setTxns] = useState(() => ls_get("transactions", SEED_TXNS));
      const [deals, setDeals] = useState([]);
      const [customers, setCustomers] = useState(() => ls_get("customers", SEED_CUSTOMERS));
      const [vendors, setVendors] = useState(() => ls_get("vendors", SEED_VENDORS));
      const [brokers, setBrokers] = useState(() => ls_get("brokers", SEED_BROKERS));
      const [developers, setDevelopers] = useState(() => ls_get("developers", SEED_DEVELOPERS));
      const [settings, setSettings] = useState(() => ls_get("settings", { company: "Nasama Properties Company LLC", trn: "", vatRate: 5, currency: "AED", openingBalance: 0, openingBalanceDate: todayStr() }));
      const [page, setPage] = useState(() => canAccessPage(userAccess || userRole, "dashboard") ? "dashboard" : "deals");
      const [dark, setDark] = useState(false);
      const [fbLoaded, setFbLoaded] = useState(false);
      const [syncing, setSyncing] = useState(false);
      const [syncError, setSyncError] = useState(false);
      const [writeMeta, setWriteMeta] = useState({});
      const syncCount = useRef(0);
      const [isMobile, setIsMobile] = useState(false);
      const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

        let loaded = 0; const total = 7;
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

        // Settings (single doc) â€” always counts toward done()
        const u8 = db.collection('settings').doc('company').onSnapshot(snap => {
          setConnected(true); // Connected
          if (!mounted) return;
          if (snap.exists) { const d = snap.data(); setSettings(d); ls_set('settings', d); }
          else { fsSaveSettings({ company: "Nasama Properties Company LLC", trn: "", vatRate: 5, currency: "AED" }).catch(console.error); }
          done();
        }, err => { 
          console.error('settings', err); 
          setConnected(false); // Disconnected
          done(); 
        });
        unsubs.push(u8);

        return () => { mounted = false; clearTimeout(safety); unsubs.forEach(u => { try { u(); } catch {} }); };
      }, []);

      const showSync = () => { setSyncing(true); syncCount.current++; const n = syncCount.current; setTimeout(() => { if (syncCount.current === n) setSyncing(false); }, 1800); };

      // Firestore write wrappers
      const fsUpdate = (col, setter, cacheKey) => (updater) => {
        setter(prev => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          if (!navigator.onLine) { toast("Offline â€” changes not saved", "error"); return prev; }
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
      const setSettingsFS = (s) => { setSettings(s); ls_set('settings', s); showSync(); fsSaveSettings(s).catch(e => toast(`Settings error: ${e.message}`, "error")); };

      // Ledger & Journal
      const ledger = useMemo(() => buildLedger(txns, accounts), [txns, accounts]);
      const persistTxn = useCallback(async (txn) => {
        if (!txn?.id) throw new Error("Transaction id is required");
        if (!navigator.onLine) throw new Error("Offline â€” changes not saved");
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
      const journal = useMemo(() => createJournalEngine({ accounts, txns, saveTxn }), [accounts, txns, saveTxn]);

      // KPIs
      const kpis = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentYearKey = String(currentYear);
        const currentMonthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const accountById = new Map(accounts.map(a => [a.id, a]));
        const banks = accounts.filter(a => a.isBank || a.code === "1001");
        const cash = banks.reduce((s, a) => s + accountBalance(a, ledger), 0);
        const outputVATA = accounts.find(a => a.isOutputVAT);
        const inputVATA = accounts.find(a => a.isInputVAT);
        const vat = (outputVATA ? accountBalance(outputVATA, ledger) : 0) - (inputVATA ? accountBalance(inputVATA, ledger) : 0);
        const totalAssets = accounts.filter(a => a.type === "Asset").reduce((s, a) => s + accountBalance(a, ledger), 0);
        const totalLiabilities = accounts.filter(a => a.type === "Liability").reduce((s, a) => s + accountBalance(a, ledger), 0);
        const totalEquity = accounts.filter(a => a.type === "Equity").reduce((s, a) => s + accountBalance(a, ledger), 0);
        const netWorth = totalAssets - totalLiabilities;
        let rev = 0, exp = 0;
        let brokerPayoutYTD = 0;
        const expenseYTDByAccount = new Map();

        const makeMonthKey = dateStr => (dateStr || "").slice(0, 7);
        const monthLabel = key => {
          const [year, month] = key.split("-").map(Number);
          return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
        };
        const last6MonthKeys = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(currentYear, now.getMonth() - (5 - i), 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        });
        const perfMap = new Map(last6MonthKeys.map(key => [key, { revenue: 0, expense: 0 }]));
        const cashMap = new Map(last6MonthKeys.map(key => [key, { inflow: 0, outflow: 0 }]));

        txns.filter(t => !t.isVoid).forEach(t => {
          const monthKey = makeMonthKey(t.date);
          const lines = t.lines || [];
          const inCurrentYear = (t.date || "").startsWith(currentYearKey);
          const monthPerf = perfMap.get(monthKey);
          let txnRevenue = 0;
          let txnExpense = 0;

          lines.forEach(l => {
            const a = accountById.get(l.accountId);
            if (!a) return;
            if (a.type === "Revenue") {
              const amount = (l.credit || 0) - (l.debit || 0);
              txnRevenue += amount;
              if (inCurrentYear) rev += amount;
            }
            if (a.type === "Expense") {
              const amount = (l.debit || 0) - (l.credit || 0);
              txnExpense += amount;
              if (inCurrentYear) {
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

          const cashBucket = cashMap.get(monthKey);
          if (cashBucket) {
            const bankLines = lines.filter(l => {
              const a = accountById.get(l.accountId);
              return a && (a.isBank || a.code === "1001");
            });
            const nonBankOperationalLines = lines.filter(l => {
              const a = accountById.get(l.accountId);
              return a && !(a.isBank || a.code === "1001");
            });
            const isInternalTransfer = bankLines.length > 0 && nonBankOperationalLines.length === 0;
            if (!isInternalTransfer) {
              bankLines.forEach(l => {
                cashBucket.inflow += (l.debit || 0);
                cashBucket.outflow += (l.credit || 0);
              });
            }
          }
        });

        const monthlyPerformance = last6MonthKeys.map(key => {
          const item = perfMap.get(key) || { revenue: 0, expense: 0 };
          return { key, label: monthLabel(key), revenue: item.revenue, expense: item.expense, net: item.revenue - item.expense };
        });
        const cashFlowSeries = last6MonthKeys.map(key => {
          const item = cashMap.get(key) || { inflow: 0, outflow: 0 };
          return { key, label: monthLabel(key), inflow: item.inflow, outflow: item.outflow, net: item.inflow - item.outflow };
        });
        const currentMonthPerf = monthlyPerformance.find(item => item.key === currentMonthKey) || { label: monthLabel(currentMonthKey), revenue: 0, expense: 0, net: 0 };
        const currentMonthCash = cashFlowSeries.find(item => item.key === currentMonthKey) || { inflow: 0, outflow: 0, net: 0 };
        const avgMonthlyExpense = monthlyPerformance.reduce((sum, item) => sum + item.expense, 0) / Math.max(monthlyPerformance.length, 1);
        const runwayMonths = avgMonthlyExpense > 0 ? (cash / avgMonthlyExpense) : Infinity;

        const pendingPipelineDeals = (deals || []).filter(d => d.stage !== "Commission Collected");
        const pendingPipelineCommission = pendingPipelineDeals.reduce((sum, d) => sum + (d.expected_commission_net || 0), 0);
        const pipelineByType = DEAL_TYPES.map(type => {
          const group = pendingPipelineDeals.filter(d => d.type === type);
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
          pendingPipelineCommission,
          pipelineByType,
          pipelineStageValue,
          collectedDealsCount,
          openDealsCount,
          brokerPayoutYTD,
          topExpenseCategories,
        };
      }, [accounts, txns, deals, ledger]);

      // Loading
      if (!fbLoaded || !userRole) return <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Logo size={64} /><div style={{ color: GOLD, fontSize: 18, fontWeight: 700, letterSpacing: "0.05em" }}>NASAMA PROPERTIES</div>
        <div style={{ color: "#8B8BA8", fontSize: 13 }}>{!fbLoaded ? 'Connecting to Firebaseâ€¦' : 'Loading permissionsâ€¦'}</div>
        <div style={{ width: 200, height: 3, background: "#2D2D45", borderRadius: 3, overflow: "hidden", marginTop: 8 }}><div style={{ height: "100%", background: GOLD, borderRadius: 3, animation: "npLoad 1.4s ease-in-out infinite" }} /></div>
        <style>{`@keyframes npLoad{0%{width:0%}60%{width:90%}100%{width:100%}}`}</style>
      </div>;

      const shared = { accounts, setAccounts: setAccountsFS, txns, setTxns: setTxnsFS, deals, setDeals: setDealsFS, customers, setCustomers: setCustomersFS, vendors, setVendors: setVendorsFS, brokers, setBrokers: setBrokersFS, developers, setDevelopers: setDevelopersFS, settings, setSettings: setSettingsFS, ledger, saveTxn, persistTxn, journal, dark, setDark, setPage, userRole: accessSubject, userEmail, writeMeta };

      const addMap = { deals: () => document.dispatchEvent(new CustomEvent("add-deal")), receipts: () => document.dispatchEvent(new CustomEvent("add-receipt")), payments: () => document.dispatchEvent(new CustomEvent("add-payment")), journal: () => document.dispatchEvent(new CustomEvent("add-txn")), customers: () => document.dispatchEvent(new CustomEvent("add-customer")), brokers: () => document.dispatchEvent(new CustomEvent("add-broker")), developers: () => document.dispatchEvent(new CustomEvent("add-developer")), vendors: () => document.dispatchEvent(new CustomEvent("add-vendor")), coa: () => document.dispatchEvent(new CustomEvent("add-account")) };

      const renderPage = () => {
        if (!canAccessPage(accessSubject, page)) {
          return <div style={{ ...C.card, padding: 24 }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8 }}>Access restricted</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>This screen is not available for the current role.</div>
          </div>;
        }
        switch (page) {
          case "dashboard": return <Dashboard {...shared} kpis={kpis} />;
          case "deals": return <DealsPage {...shared} />;
          case "receipts": return <ReceiptsPage {...shared} />;
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
          case "users": return <SecurityAdminPage userRole={userRole} userEmail={userEmail} settings={settings} />;
          default: return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>ðŸš§ Coming soon</div>;
        }
      };

      const navBg = dark ? "#0A0A14" : NAVY;
      const mainBg = dark ? "#111120" : "#F4F5F7";
      const headerBg = dark ? "#1A1A2E" : "#ffffff";
      const borderClr = dark ? "#2D2D45" : "#E5E7EB";
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
          <span>âš ï¸ DATABASE CONNECTION LOST â€” Working offline. Changes will sync when connection returns.</span>
          <button style={{ background: "#FFFFFF", color: "#DC2626", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => window.location.reload()}>Retry</button>
        </div>}

        {/* Sidebar */}
        {(!isMobile || mobileMenuOpen) && <div style={{ width: isMobile ? "80%" : 230, background: navBg, display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0, position: isMobile ? "fixed" : "relative", top: 0, left: 0, bottom: 0, zIndex: isMobile ? 1001 : 1, boxShadow: isMobile ? "4px 0 20px rgba(0,0,0,.3)" : "none" }}>
          <div style={{ padding: "18px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <Logo size={28} /><div><div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>NASAMA</div><div style={{ color: "#6B7280", fontSize: 10, letterSpacing: "0.1em" }}>ACCOUNTING v2</div></div>
          </div>
          <div style={{ flex: 1, padding: "8px 0" }}>
            {NAV.map((item, i) => {
              if (item.s) return sectionHasVisiblePage(i) ? <div key={i} style={{ padding: "10px 20px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#6B7280", textTransform: "uppercase" }}>{item.s}</div> : null;
              if (!canAccessPage(accessSubject, item.id)) return null;
              const active = page === item.id;
              return <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 13px", cursor: "pointer", borderRadius: 7, margin: "1px 8px", color: active ? "#fff" : "#9090B8", background: active ? `linear-gradient(135deg,${GOLD},${GOLD_D})` : "transparent", fontSize: 13, transition: "all .15s", userSelect: "none" }} onClick={() => { setPage(item.id); if (isMobile) setMobileMenuOpen(false); }}>
                <span>{item.icon}</span><span style={{ fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </div>;
            })}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11, color: "#6B7280" }}>
            <div style={{ marginBottom: 4 }}>{userEmail}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={C.badge(userRole === "admin" ? "danger" : userRole === "accountant" ? "info" : "neutral")}>{userRole}</span>
              <button style={{ background: "none", border: "none", color: "#DC2626", fontSize: 11, cursor: "pointer" }} onClick={signOut}>Sign Out</button>
            </div>
          </div>
        </div>}

        {isMobile && mobileMenuOpen && <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999 }} />}

        {/* Main Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>

          {/* Header */}
          <div style={{ height: isMobile ? 48 : 58, background: headerBg, borderBottom: `1px solid ${borderClr}`, display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, padding: isMobile ? "0 10px" : "0 20px", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
            {isMobile && <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ width: 20, height: 2, background: GOLD, borderRadius: 2 }}></div>
              <div style={{ width: 20, height: 2, background: GOLD, borderRadius: 2 }}></div>
              <div style={{ width: 20, height: 2, background: GOLD, borderRadius: 2 }}></div>
            </button>}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, flexShrink: 0 }}>
              {!isMobile && <button style={C.btn()} onClick={() => (addMap[page] || (() => toast("Navigate to a module first", "info")))()}>+ Add New</button>}
              {isMobile && <button style={{ ...C.btn(), padding: '8px 12px', fontSize: 13 }} onClick={() => (addMap[page] || (() => toast("Navigate first", "info")))()}>+</button>}
              <button style={{ ...C.btn("secondary"), padding: isMobile ? '8px 10px' : undefined }} onClick={() => setDark(d => !d)}>{dark ? "â˜€ï¸" : "ðŸŒ™"}</button>
              {syncing && !isMobile && <span style={{ fontSize: 11, background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", borderRadius: 20, padding: "3px 10px" }}>â˜ï¸ Savingâ€¦</span>}
              {!syncing && syncError && <span style={{ fontSize: 11, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 20, padding: "3px 10px" }}>âš ï¸ Sync Error</span>}
              {!syncing && !syncError && !isMobile && <span style={{ fontSize: 11, color: "#059669" }}>âœ… Synced</span>}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isMobile ? 8 : 22, paddingBottom: isMobile ? 70 : 22, background: mainBg }}>
            {renderPage()}
          </div>
        </div>

        {/* Mobile bottom nav */}
        {isMobile && <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 60, background: dark ? "#0A0A14" : "#fff", borderTop: `1px solid ${borderClr}`, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 1000, boxShadow: "0 -2px 10px rgba(0,0,0,.1)" }}>
          {[
            { id: "dashboard", icon: "ðŸ ", label: "Home" },
            { id: "deals", icon: "ðŸ¤", label: "Deals" },
            { id: "banking", icon: "ðŸ¦", label: "Bank" },
            { id: "reports", icon: "ðŸ“Š", label: "Reports" },
            { id: "more", icon: "â‹¯", label: "More" }
          ].map(item => {
            const isActive = item.id === "more" ? false : page === item.id;
            return <div key={item.id} onClick={() => item.id === "more" ? setMobileMenuOpen(true) : setPage(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", padding: "8px 4px", color: isActive ? GOLD : "#6B7280" }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
            </div>;
          })}
        </div>}

        <ToastHost />
      </div>
    );
    }

    // â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (typeof React !== 'undefined' && typeof ReactDOM !== 'undefined' && typeof firebase !== 'undefined') {
      ReactDOM.createRoot(document.getElementById("root")).render(<AuthGate><App /></AuthGate>);
    } else {
      document.body.innerHTML = '<div style="padding:20px;color:#DC2626"><h2>Loading Error</h2><p>Required libraries failed to load.</p></div>';
    }
