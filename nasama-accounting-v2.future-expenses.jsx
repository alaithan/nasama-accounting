/* ══════════════════════════════════════════════════
   FUTURE FIXED EXPENSES — Planning & Reminder Module
   Non-ledger · Cash-basis compliant · No AP/AR
   Becomes accounting only upon actual payment
   ══════════════════════════════════════════════════ */

// ── CONSTANTS ──────────────────────────────────────
const FE_STATUSES = ["Planned", "Due Soon", "Overdue", "Paid", "Skipped", "Cancelled"];
const FE_EXPENSE_TYPES = ["recurring", "one-time"];
const FE_FREQUENCIES = ["monthly", "quarterly", "yearly", "custom"];
const FE_STATUS_BADGE = {
  Planned: "info",
  "Due Soon": "warning",
  Overdue: "danger",
  Paid: "success",
  Skipped: "neutral",
  Cancelled: "neutral"
};
const FE_STATUS_ICON = {
  Planned: "📋",
  "Due Soon": "⏰",
  Overdue: "🔴",
  Paid: "✅",
  Skipped: "⏭️",
  Cancelled: "❌"
};

// ── CATEGORIES (matches existing Chart of Accounts) ──
const FE_CATEGORIES = [
  // Office & Operations
  { code: "5100", label: "Office Rent" },
  { code: "5101", label: "Warehouse / Storage Rent" },
  { code: "5102", label: "Parking Fees" },
  { code: "5103", label: "Security Deposit" },
  // Utilities
  { code: "5110", label: "DEWA — Electricity & Water" },
  { code: "5120", label: "Empower — Cooling" },
  { code: "5130", label: "Internet & Wi-Fi" },
  { code: "5131", label: "Landline / Telephone" },
  { code: "5140", label: "Mobile Communication" },
  // Office Supplies & Maintenance
  { code: "5150", label: "Cleaning Fees" },
  { code: "5151", label: "Pest Control" },
  { code: "5160", label: "Office Supplies & Stationery" },
  { code: "5161", label: "Furniture & Equipment" },
  { code: "5162", label: "Office Maintenance & Repairs" },
  { code: "5163", label: "Printing & Photocopying" },
  // Marketing & Advertising
  { code: "5200", label: "Property Finder Subscription" },
  { code: "5210", label: "Bayut Advertising" },
  { code: "5211", label: "Dubizzle Advertising" },
  { code: "5220", label: "Marketing & Promotions" },
  { code: "5221", label: "Social Media Advertising" },
  { code: "5222", label: "Signage & Branding" },
  { code: "5223", label: "Website Hosting & Domain" },
  { code: "5224", label: "Photography & Videography" },
  // Software & Technology
  { code: "5230", label: "CRM Software" },
  { code: "5231", label: "Accounting Software" },
  { code: "5232", label: "Microsoft / Google Workspace" },
  { code: "5233", label: "IT Support & Maintenance" },
  { code: "5234", label: "Cloud Storage & Backup" },
  // Salaries & HR
  { code: "5300", label: "Salaries & Wages" },
  { code: "5301", label: "Commission Payouts" },
  { code: "5302", label: "End of Service Benefits (EOSB)" },
  { code: "5303", label: "Staff Health Insurance" },
  { code: "5304", label: "DEWS / Pension Contribution" },
  { code: "5305", label: "Staff Training & Development" },
  { code: "5306", label: "Recruitment & HR Services" },
  // Transportation & Travel
  { code: "5310", label: "Transportation / Fuel" },
  { code: "5311", label: "Vehicle Maintenance & Repair" },
  { code: "5312", label: "Vehicle Insurance" },
  { code: "5313", label: "Salik (Road Toll)" },
  { code: "5314", label: "Vehicle Lease / Rental" },
  { code: "5315", label: "Travel & Accommodation" },
  // Professional Services
  { code: "5400", label: "Accountant Registration" },
  { code: "5410", label: "Accountant Services" },
  { code: "5411", label: "Audit Fees" },
  { code: "5412", label: "Consultancy Fees" },
  { code: "5420", label: "PRO Services" },
  // Government & Licensing
  { code: "5430", label: "Trakheesi & Licensing" },
  { code: "5431", label: "Trade License Renewal" },
  { code: "5432", label: "RERA Registration" },
  { code: "5433", label: "DLD Fees" },
  { code: "5434", label: "Immigration & Visa Fees" },
  { code: "5435", label: "Labour Card & Work Permit" },
  { code: "5436", label: "Emirates ID Renewal" },
  { code: "5437", label: "Municipality Fees" },
  { code: "5438", label: "Chamber of Commerce" },
  // Insurance
  { code: "5500", label: "General Insurance" },
  { code: "5501", label: "Professional Indemnity Insurance" },
  { code: "5502", label: "Property Insurance" },
  // Banking & Financial
  { code: "5600", label: "Bank Fees & Charges" },
  { code: "5601", label: "Credit Card Fees" },
  { code: "5602", label: "Payment Gateway Fees" },
  { code: "5603", label: "Loan / Finance Repayment" },
  // Legal
  { code: "6000", label: "Legal Services" },
  { code: "6001", label: "Court / Litigation Fees" },
  { code: "6002", label: "Notary & Attestation" },
  // Entertainment & Events
  { code: "6100", label: "Client Entertainment" },
  { code: "6101", label: "Corporate Events" },
  { code: "6102", label: "Gifts & Donations" },
  // Miscellaneous
  { code: "6200", label: "Courier & Postage" },
  { code: "6201", label: "Subscriptions & Memberships" },
  { code: "6202", label: "Penalties & Fines" },
  { code: "OTHER", label: "Other — Custom" },
];

// ── HELPERS ─────────────────────────────────────────
const feEmpty = () => ({
  id: "", title: "", category: "5100", expenseType: "recurring",
  frequency: "monthly", startDate: todayStr(), nextDueDate: todayStr(),
  amountExpected: "", vatApplicable: false, vatRate: 5, amountIncludesVat: true,
  paymentMethod: "bank", preferredAccountCode: "1002", payeeName: "",
  status: "Planned", lastPaidDate: "", lastPaidTxnId: "",
  nextReminderDate: "", notes: "", createdBy: "", updatedBy: "",
  createdAt: "", updatedAt: ""
});

const feComputeStatus = (item, today) => {
  if (item.status === "Paid" || item.status === "Skipped" || item.status === "Cancelled") return item.status;
  if (!item.nextDueDate) return "Planned";
  const due = new Date(item.nextDueDate + "T12:00:00");
  const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays <= 7) return "Due Soon";
  return "Planned";
};

const feAdvanceNextDueDate = (item) => {
  if (item.expenseType !== "recurring" || !item.nextDueDate) return null;
  const d = new Date(item.nextDueDate + "T12:00:00");
  switch (item.frequency) {
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().split("T")[0];
};

const feComputeMonthlyEquivalent = (item) => {
  const amt = item.amountExpected || 0;
  switch (item.frequency) {
    case "quarterly": return Math.round(amt / 3);
    case "yearly": return Math.round(amt / 12);
    default: return amt;
  }
};

// ── FUTURE EXPENSES PAGE ────────────────────────────
function FutureExpensesPage({ accounts, ledger, plannedExpenses, setPlannedExpenses, journal, persistTxn, userRole, userEmail, dark }) {
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [payItem, setPayItem] = useState(null);
  const [filter, setFilter] = useState("Active");
  const [searchText, setSearchText] = useState("");
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    const h = () => { setEditItem(null); setShowModal(true); };
    document.addEventListener("add-planned-expense", h);
    return () => document.removeEventListener("add-planned-expense", h);
  }, []);

  // Auto-compute statuses
  const enriched = useMemo(() => {
    const today = new Date(todayStr() + "T12:00:00");
    return (plannedExpenses || []).map(item => ({
      ...item,
      computedStatus: feComputeStatus(item, today)
    }));
  }, [plannedExpenses]);

  // Summary KPIs
  const kpis = useMemo(() => {
    const today = new Date(todayStr() + "T12:00:00");
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);

    const active = enriched.filter(e => !["Paid", "Skipped", "Cancelled"].includes(e.status));
    const overdue = active.filter(e => e.computedStatus === "Overdue");
    const dueThisMonth = active.filter(e => {
      if (!e.nextDueDate) return false;
      const d = new Date(e.nextDueDate + "T12:00:00");
      return d >= today && d <= thisMonthEnd;
    });
    const dueNext30 = active.filter(e => {
      if (!e.nextDueDate) return false;
      const d = new Date(e.nextDueDate + "T12:00:00");
      return d >= today && d <= next30;
    });

    const annualCommitments = active
      .filter(e => e.expenseType === "recurring")
      .reduce((sum, e) => sum + feComputeMonthlyEquivalent(e) * 12, 0);

    return {
      overdueCount: overdue.length,
      overdueTotal: overdue.reduce((s, e) => s + (e.amountExpected || 0), 0),
      dueThisMonthCount: dueThisMonth.length,
      dueThisMonthTotal: dueThisMonth.reduce((s, e) => s + (e.amountExpected || 0), 0),
      dueNext30Count: dueNext30.length,
      dueNext30Total: dueNext30.reduce((s, e) => s + (e.amountExpected || 0), 0),
      annualCommitments,
      activeCount: active.length
    };
  }, [enriched]);

  // Filtering
  const filtered = useMemo(() => {
    let list = enriched;
    if (filter === "Active") list = list.filter(e => !["Paid", "Skipped", "Cancelled"].includes(e.status));
    else if (filter === "Overdue") list = list.filter(e => e.computedStatus === "Overdue");
    else if (filter === "Paid") list = list.filter(e => e.status === "Paid");
    else if (filter === "Recurring") list = list.filter(e => e.expenseType === "recurring" && !["Paid", "Skipped", "Cancelled"].includes(e.status));

    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      list = list.filter(e =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.payeeName || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const statusOrder = { Overdue: 0, "Due Soon": 1, Planned: 2, Paid: 3, Skipped: 4, Cancelled: 5 };
      const sa = statusOrder[a.computedStatus] ?? 9;
      const sb = statusOrder[b.computedStatus] ?? 9;
      if (sa !== sb) return sa - sb;
      return (a.nextDueDate || "").localeCompare(b.nextDueDate || "");
    });
  }, [enriched, filter, searchText]);

  // CRUD
  const handleSave = (item) => {
    const now = new Date().toISOString();
    if (item.id) {
      setPlannedExpenses(prev => prev.map(e => e.id === item.id ? { ...item, updatedBy: userEmail, updatedAt: now } : e));
      toast("Planned expense updated", "success");
      logAudit("planned_expense_update", { itemId: item.id, title: item.title }, userRole, userEmail);
    } else {
      const newItem = { ...item, id: uid(), createdBy: userEmail, createdAt: now, updatedBy: userEmail, updatedAt: now };
      setPlannedExpenses(prev => [...prev, newItem]);
      toast("Planned expense created", "success");
      logAudit("planned_expense_create", { itemId: newItem.id, title: newItem.title }, userRole, userEmail);
    }
    setShowModal(false);
    setEditItem(null);
  };

  const handleDelete = (item) => {
    if (!confirm(`Delete "${item.title || "Untitled"}"?\n\nThis removes the planned expense. No accounting entries will be affected.`)) return;
    setPlannedExpenses(prev => prev.filter(e => e.id !== item.id));
    toast("Planned expense deleted", "success");
    logAudit("planned_expense_delete", { itemId: item.id, title: item.title }, userRole, userEmail);
  };

  const handleSkip = (item) => {
    const now = new Date().toISOString();
    if (item.expenseType === "recurring") {
      const nextDate = feAdvanceNextDueDate(item);
      setPlannedExpenses(prev => prev.map(e => e.id === item.id ? { ...e, nextDueDate: nextDate, status: "Planned", updatedBy: userEmail, updatedAt: now } : e));
      toast(`Skipped — next due date: ${fmtDate(nextDate)}`, "info");
    } else {
      setPlannedExpenses(prev => prev.map(e => e.id === item.id ? { ...e, status: "Skipped", updatedBy: userEmail, updatedAt: now } : e));
      toast("Expense marked as skipped", "info");
    }
    logAudit("planned_expense_skip", { itemId: item.id, title: item.title }, userRole, userEmail);
  };

  const handlePaymentComplete = (item, txnId) => {
    const now = new Date().toISOString();
    if (item.expenseType === "recurring") {
      const nextDate = feAdvanceNextDueDate(item);
      setPlannedExpenses(prev => prev.map(e => e.id === item.id ? {
        ...e, lastPaidDate: todayStr(), lastPaidTxnId: txnId,
        nextDueDate: nextDate, status: "Planned",
        updatedBy: userEmail, updatedAt: now
      } : e));
      toast(`Payment recorded — next due: ${fmtDate(nextDate)}`, "success");
    } else {
      setPlannedExpenses(prev => prev.map(e => e.id === item.id ? {
        ...e, status: "Paid", lastPaidDate: todayStr(), lastPaidTxnId: txnId,
        updatedBy: userEmail, updatedAt: now
      } : e));
      toast("Payment recorded — expense marked as Paid", "success");
    }
    logAudit("planned_expense_payment", { itemId: item.id, title: item.title, txnId }, userRole, userEmail);
    setShowPayModal(false);
    setPayItem(null);
  };

  const getCategoryLabel = (code) => {
    const cat = FE_CATEGORIES.find(c => c.code === code);
    return cat ? cat.label : code;
  };

  // Summary cards
  const summaryCards = [
    { label: "Due This Month", count: kpis.dueThisMonthCount, total: kpis.dueThisMonthTotal, color: "#2563EB", icon: "📅" },
    { label: "Overdue", count: kpis.overdueCount, total: kpis.overdueTotal, color: "#DC2626", icon: "🔴" },
    { label: "Next 30 Days", count: kpis.dueNext30Count, total: kpis.dueNext30Total, color: "#D97706", icon: "⏰" },
    { label: "Annual Fixed Costs", count: null, total: kpis.annualCommitments, color: "#059669", icon: "📊" },
  ];

  return <div>
    <PageHeader title="Future Fixed Expenses" sub={`${kpis.activeCount} active planned expenses — operational reminders only, no accounting impact`}>
      <Sel value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="Active">Active (Due / Planned)</option>
        <option value="Overdue">Overdue Only</option>
        <option value="Recurring">Recurring Only</option>
        <option value="Paid">Paid History</option>
        <option value="All">All</option>
      </Sel>
    {hasPermission(userRole, 'planning.create') && <button style={C.btn()} onClick={() => { setEditItem(null); setShowModal(true); }}>+ New Expense</button>}
    </PageHeader>

    {/* Info banner */}
    <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #2563EB", background: "#EFF6FF", color: "#1D4ED8", fontSize: 13 }}>
      📋 This module tracks future and recurring obligations as operational reminders. <strong>No journal entries are created</strong> until you click "Record Payment" — preserving cash-basis accounting.
    </div>

    {/* Summary Cards */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
      {summaryCards.map((card, i) => <div key={i} style={{ ...C.card, padding: "16px 18px", borderTop: `4px solid ${card.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{card.icon}</span>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", fontWeight: 700 }}>{card.label}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: dark ? "#E8E8F0" : NAVY }}>{fmtAED(card.total)}</div>
        {card.count !== null && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{card.count} expense{card.count !== 1 ? "s" : ""}</div>}
      </div>)}
    </div>

    {/* Search Bar */}
    <div style={{ marginBottom: 14 }}>
      <Inp value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search by title, payee, notes..." />
    </div>

    {/* Table */}
    <div style={{ ...C.card, overflowX: "auto", overflowY: "visible" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={C.th}>Status</th>
          <th style={C.th}>Title</th>
          <th style={C.th}>Category</th>
          <th style={C.th}>Type</th>
          <th style={C.th}>Due Date</th>
          <th style={{ ...C.th, textAlign: "right" }}>Amount</th>
          <th style={C.th}>Payee</th>
          <th style={C.th}>Actions</th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={8} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>
            {filter === "Overdue" ? "No overdue expenses. 🎉" : "No planned expenses found. Click \"+ New Expense\" to add one."}
          </td></tr>}
          {filtered.map(item => {
            const status = item.computedStatus;
            return <tr key={item.id} style={{ background: status === "Overdue" ? "#FEF2F2" : "transparent" }}>
              <td style={C.td}>
                <span style={C.badge(FE_STATUS_BADGE[status] || "neutral")}>
                  {FE_STATUS_ICON[status] || ""} {status}
                </span>
              </td>
              <td style={C.td}>
                <div style={{ fontWeight: 600, color: NAVY }}>{item.title || "Untitled"}</div>
                {item.notes && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{item.notes.substring(0, 60)}{item.notes.length > 60 ? "…" : ""}</div>}
              </td>
              <td style={C.td}>{getCategoryLabel(item.category)}</td>
              <td style={C.td}>
                <span style={C.badge(item.expenseType === "recurring" ? "info" : "neutral")}>
                  {item.expenseType === "recurring" ? `🔄 ${item.frequency || "monthly"}` : "One-time"}
                </span>
              </td>
              <td style={{ ...C.td, color: status === "Overdue" ? "#DC2626" : "#374151", fontWeight: status === "Overdue" ? 700 : 400 }}>
                {item.nextDueDate ? fmtDate(item.nextDueDate) : "—"}
              </td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>
                {fmtAED(item.amountExpected || 0)}
                {item.vatApplicable && <div style={{ fontSize: 10, color: "#6B7280" }}>incl. VAT {item.vatRate || 5}%</div>}
              </td>
              <td style={C.td}>{item.payeeName || "—"}</td>
              <td style={C.td}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {hasPermission(userRole, 'expenses.create') && status !== "Paid" && status !== "Cancelled" && 
                    <button style={C.btn("success", true)} onClick={() => { setPayItem(item); setShowPayModal(true); }}>💰 Pay</button>
                  }
                  {hasPermission(userRole, 'planning.edit') && status !== "Paid" &&
                    <button style={C.btn("secondary", true)} onClick={() => handleSkip(item)}>⏭️</button>
                  }
                  {hasPermission(userRole, 'planning.edit') &&
                    <button style={C.btn("secondary", true)} onClick={() => { setEditItem(item); setShowModal(true); }}>✏️</button>
                  }
                  {hasPermission(userRole, 'planning.edit') && status !== "Paid" &&
                    <button style={C.btn("danger", true)} onClick={() => handleDelete(item)}>🗑️</button>
                  }
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {/* Paid History Link */}
    {filter !== "Paid" && enriched.some(e => e.status === "Paid") && <div style={{ marginTop: 12, textAlign: "center" }}>
      <button style={C.btn("ghost")} onClick={() => setFilter("Paid")}>View Payment History ({enriched.filter(e => e.status === "Paid").length})</button>
    </div>}

    {/* Add/Edit Modal */}
    {showModal && <FutureExpenseModal
      item={editItem}
      accounts={accounts}
      onSave={handleSave}
      onClose={() => { setShowModal(false); setEditItem(null); }}
    />}

    {/* Record Payment Modal */}
    {showPayModal && payItem && <RecordPaymentModal
      item={payItem}
      accounts={accounts}
      ledger={ledger}
      journal={journal}
      persistTxn={persistTxn}
      userRole={userRole}
      userEmail={userEmail}
      onComplete={(txnId) => handlePaymentComplete(payItem, txnId)}
      onClose={() => { setShowPayModal(false); setPayItem(null); }}
    />}
  </div>;
}

// ── ADD/EDIT MODAL ──────────────────────────────────
function FutureExpenseModal({ item, accounts, onSave, onClose }) {
  const [form, setForm] = useState(() => item ? { ...item } : feEmpty());
  const up = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");
  const isEdit = !!(item && item.id);

  const handleSubmit = () => {
    if (!form.title.trim()) { toast("Title is required", "warning"); return; }
    if (!form.nextDueDate) { toast("Next due date is required", "warning"); return; }
    if (!form.amountExpected || form.amountExpected <= 0) { toast("Amount must be greater than zero", "warning"); return; }
    onSave(form);
  };

  return <div style={C.modal} onClick={onClose}>
    <div style={C.mbox(640)} onClick={e => e.stopPropagation()}>
      <div style={C.mhdr}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{isEdit ? "✏️ Edit Planned Expense" : "📅 New Planned Expense"}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      <div style={C.mbdy}>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
          {isEdit ? "Update the details of this planned expense. No accounting entries are created until payment." : "Schedule a future or recurring expense. This is a planning entry only — no journal posting until you record a payment."}
        </p>

        <div style={C.fg}>
          <div style={{ gridColumn: "span 2" }}><label style={C.label}>Title *</label><Inp value={form.title} onChange={e => up("title", e.target.value)} placeholder="e.g. Office Rent — March 2026" /></div>

          <div><label style={C.label}>Category</label>
            <Sel value={form.category} onChange={e => up("category", e.target.value)}>
              {[...FE_CATEGORIES].sort((a, b) => a.code === "OTHER" ? 1 : b.code === "OTHER" ? -1 : a.label.localeCompare(b.label)).map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </Sel>
          </div>

          <div><label style={C.label}>Expense Type</label>
            <Sel value={form.expenseType} onChange={e => up("expenseType", e.target.value)}>
              <option value="recurring">Recurring</option>
              <option value="one-time">One-Time</option>
            </Sel>
          </div>

          {form.expenseType === "recurring" && <div><label style={C.label}>Frequency</label>
            <Sel value={form.frequency} onChange={e => up("frequency", e.target.value)}>
              {FE_FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </Sel>
          </div>}

          <div><label style={C.label}>Next Due Date *</label>
            <Inp type="date" value={form.nextDueDate} onChange={e => up("nextDueDate", e.target.value)} />
          </div>

          <div><label style={C.label}>Amount Expected (AED) *</label>
            <Inp type="number" step="0.01" value={form.amountExpected ? fromCents(form.amountExpected) : ""} onChange={e => up("amountExpected", toCents(e.target.value))} placeholder="e.g. 15000" />
          </div>

          <div><label style={C.label}>VAT Applicable</label>
            <Sel value={form.vatApplicable ? "yes" : "no"} onChange={e => up("vatApplicable", e.target.value === "yes")}>
              <option value="no">No</option>
              <option value="yes">Yes (5%)</option>
            </Sel>
          </div>

          {form.vatApplicable && <div><label style={C.label}>VAT Rate %</label>
            <Inp type="number" step="0.1" value={form.vatRate} onChange={e => up("vatRate", parseFloat(e.target.value) || 5)} />
          </div>}

          {form.vatApplicable && <div><label style={C.label}>Amount Includes VAT?</label>
            <Sel value={form.amountIncludesVat ? "yes" : "no"} onChange={e => up("amountIncludesVat", e.target.value === "yes")}>
              <option value="yes">Yes — VAT inclusive</option>
              <option value="no">No — VAT exclusive</option>
            </Sel>
          </div>}

          <div><label style={C.label}>Payee / Vendor</label>
            <Inp value={form.payeeName} onChange={e => up("payeeName", e.target.value)} placeholder="e.g. Landlord, DEWA, etc." />
          </div>

          <div><label style={C.label}>Preferred Payment Account</label>
            <Sel value={form.preferredAccountCode} onChange={e => up("preferredAccountCode", e.target.value)}>
              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Sel>
          </div>

          {isEdit && <div><label style={C.label}>Status</label>
            <Sel value={form.status} onChange={e => up("status", e.target.value)}>
              {FE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </div>}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={C.label}>Notes</label>
          <textarea style={{ ...C.input, minHeight: 60, resize: "vertical" }} value={form.notes || ""} onChange={e => up("notes", e.target.value)} placeholder="Any additional details..." />
        </div>

        {/* Preview */}
        {form.amountExpected > 0 && <div style={{ marginTop: 16, padding: 14, background: "#F9FAFB", borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: NAVY }}>Preview</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Amount:</span><span style={{ fontWeight: 600 }}>{fmtAED(form.amountExpected)}</span></div>
          {form.vatApplicable && form.amountIncludesVat && <><div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
            <span>Net (excl. VAT):</span><span>{fmtAED(Math.round(form.amountExpected / (1 + (form.vatRate || 5) / 100)))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
            <span>VAT ({form.vatRate || 5}%):</span><span>{fmtAED(form.amountExpected - Math.round(form.amountExpected / (1 + (form.vatRate || 5) / 100)))}</span>
          </div></>}
          {form.expenseType === "recurring" && <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280", borderTop: "1px solid #E5E7EB", paddingTop: 6, marginTop: 6 }}>
            <span>Annual cost ({form.frequency}):</span><span style={{ fontWeight: 600 }}>{fmtAED(feComputeMonthlyEquivalent(form) * 12)}</span>
          </div>}
        </div>}
      </div>
      <div style={C.mftr}>
        <button style={C.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={C.btn()} onClick={handleSubmit}>💾 {isEdit ? "Save Changes" : "Add Expense"}</button>
      </div>
    </div>
  </div>;
}

// ── RECORD PAYMENT MODAL ────────────────────────────
function RecordPaymentModal({ item, accounts, ledger, journal, persistTxn, userRole, userEmail, onComplete, onClose }) {
  const [form, setForm] = useState(() => {
    const grossAED = item.amountExpected ? fromCents(item.amountExpected) : "";
    return {
      date: todayStr(),
      gross: grossAED,
      vatRate: item.vatApplicable ? (item.vatRate || 5) : 0,
      expenseCode: item.category !== "OTHER" ? item.category : "",
      paidFromCode: item.preferredAccountCode || "1002",
      counterparty: item.payeeName || "",
      memo: item.title || ""
    };
  });
  const [preview, setPreview] = useState(null);
  const [posting, setPosting] = useState(false);

  const bankAccounts = accounts.filter(a => a.isBank || a.code === "1001");
  const expenseAccounts = accounts.filter(a => a.type === "Expense").sort((a, b) => a.code.localeCompare(b.code));

  const selectedAccount = accounts.find(a => a.code === form.paidFromCode);
  const balance = selectedAccount ? accountBalance(selectedAccount, ledger) : 0;
  const amountC = toCents(form.gross);
  const isInsufficient = amountC > balance;

  const handlePreview = () => {
    if (!form.expenseCode) { toast("Select an expense account", "warning"); return; }
    const gross = parseFloat(form.gross);
    if (!gross || gross <= 0) { toast("Enter a valid amount", "warning"); return; }
    if (isInsufficient) { toast(`Insufficient funds in ${selectedAccount?.name || 'account'}`, "error"); return; }
    try {
      const txn = journal.postPayment({
        date: form.date, memo: form.memo || item.title,
        gross, vatRate: form.vatRate,
        expenseCode: form.expenseCode,
        paidFromCode: form.paidFromCode,
        counterparty: form.counterparty,
        tags: "planned-settlement",
        commit: false
      });
      setPreview(txn);
    } catch (err) { toast(err.message, "error"); }
  };

  const handleConfirm = async () => {
    if (posting) return;
    if (isInsufficient) { toast("Cannot post: Insufficient funds", "error"); return; }
    setPosting(true);
    try {
      const txn = journal.postPayment({
        date: form.date, memo: form.memo || item.title,
        gross: parseFloat(form.gross),
        vatRate: form.vatRate,
        expenseCode: form.expenseCode,
        paidFromCode: form.paidFromCode,
        counterparty: form.counterparty,
        tags: "planned-settlement",
        commit: false
      });
      const savedTxn = await persistTxn({ ...txn, planned_expense_id: item.id });
      onComplete(savedTxn.id);
    } catch (err) {
      toast(err.message, "error");
      setPosting(false);
    }
  };

  return <div style={C.modal} onClick={onClose}>
    <div style={C.mbox(620)} onClick={e => e.stopPropagation()}>
      <div style={C.mhdr}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>💰 Record Payment</span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      <div style={C.mbdy}>
        {/* Context Banner */}
        <div style={{ padding: 14, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#065F46" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Converting planned expense to cash payment</div>
          <div>This will create a <strong>real journal entry</strong> (DR Expense / CR Bank) using the existing accounting engine. The planned item will be marked as Paid.</div>
        </div>

        {/* Source reference */}
        <div style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 600, color: NAVY }}>{item.title}</div>
          <div style={{ color: "#6B7280", marginTop: 4 }}>Expected: {fmtAED(item.amountExpected || 0)} — Due: {fmtDate(item.nextDueDate)} — Payee: {item.payeeName || "—"}</div>
        </div>

        <div style={C.fg}>
          <div><label style={C.label}>Payment Date</label>
            <Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div><label style={C.label}>Gross Amount (AED)</label>
            <Inp type="number" step="0.01" value={form.gross} onChange={e => setForm(p => ({ ...p, gross: e.target.value }))} />
          </div>
          <div><label style={C.label}>Expense Account</label>
            <Sel value={form.expenseCode} onChange={e => setForm(p => ({ ...p, expenseCode: e.target.value }))}>
              <option value="">— Select Account —</option>
              {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </Sel>
          </div>
          <div><label style={C.label}>VAT Rate %</label>
            <Sel value={form.vatRate} onChange={e => setForm(p => ({ ...p, vatRate: parseFloat(e.target.value) }))}>
              <option value={0}>0% (No VAT)</option>
              <option value={5}>5% (Standard)</option>
            </Sel>
          </div>
          <div><label style={C.label}>Pay From</label>
            <Sel value={form.paidFromCode} onChange={e => setForm(p => ({ ...p, paidFromCode: e.target.value }))}>
              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Sel>
              <div style={{ fontSize: 11, marginTop: 4, color: isInsufficient ? "#DC2626" : "#059669", fontWeight: 600 }}>
                Available Balance: {fmtAED(balance)}
                {isInsufficient && " ⚠️ Insufficient Funds"}
              </div>
          </div>
          <div><label style={C.label}>Counterparty</label>
            <Inp value={form.counterparty} onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "span 2" }}><label style={C.label}>Memo</label>
            <Inp value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
          </div>
        </div>

        {/* Live breakdown */}
        {form.gross && parseFloat(form.gross) > 0 && <div style={{ marginTop: 16, padding: 14, background: "#F9FAFB", borderRadius: 8, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Gross:</span><span style={{ fontWeight: 600 }}>AED {parseFloat(form.gross).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
          {form.vatRate > 0 && <><div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
            <span>Net (excl. VAT):</span><span>AED {(parseFloat(form.gross) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
            <span>Input VAT ({form.vatRate}%):</span><span>AED {(parseFloat(form.gross) - parseFloat(form.gross) / (1 + form.vatRate / 100)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div></>}
        </div>}
      </div>
      <div style={C.mftr}>
        <button style={C.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={C.btn()} onClick={handlePreview}>Preview Journal →</button>
      </div>
    </div>

    {/* Posting Preview overlay */}
    {preview && <PostingPreview
      open={true}
      lines={preview.lines}
      accounts={accounts}
      header={{ date: preview.date, ref: preview.ref, counterparty: preview.counterparty }}
      onClose={() => setPreview(null)}
      onConfirm={handleConfirm}
    />}
  </div>;
}
