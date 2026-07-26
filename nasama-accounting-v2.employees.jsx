/* ══════════════════════════════════════════════════
   EMPLOYEES — per-person financial subledger
   Spec + Phase 0 findings: employee-section-plan.md
   Diagnostic tool:          tools/phase0-attribution.js

   Treats every person (broker, sales manager, admin) as BOTH a cost centre and a
   revenue centre, and reconciles the result back to the general ledger.

   Visibility: FULL ADMIN ONLY. This is enforced by *omission* — `employees` is
   deliberately absent from PAGE_ACCESS_BRIDGE and from the legacy role map, so
   canAccessPage() returns true for admin on its first line and falls through to
   false for everyone else. Do not add it to either map.

   Every figure here derives from the GENERAL LEDGER, never from a stored salary
   field. `base_salary` is planning reference only.
   ══════════════════════════════════════════════════ */

// Payroll / commission accounts, grouped by the nature of the spend.
const EMP_PAYROLL_ACCOUNTS = {
  "5000": { kind: "salary", label: "Admin Salary" },
  "5010": { kind: "salary", label: "Employee Salaries" },
  "5020": { kind: "salary", label: "Manager Salary" },
  "5030": { kind: "incentive", label: "Broker Incentive" },
  "5040": { kind: "override", label: "Sales Manager Override" },
  "5500": { kind: "commission", label: "Broker Commission" },
  "5510": { kind: "commission", label: "Secondary Agent" },
  "5420": { kind: "employcost", label: "Recruitment Fees" },
  "5430": { kind: "employcost", label: "Trakheesi & Licensing" },
};
const EMP_COST_KINDS = ["salary", "commission", "override", "incentive", "employcost"];
const EMP_KIND_LABEL = { salary: "Salary", commission: "Commission", override: "Mgr Override", incentive: "Incentive", employcost: "Visa / Licensing" };

// Bank spelling variants, confirmed by the owner 2026-07-25. Banks transliterate Arabic
// names inconsistently, and a plain edit-distance matcher silently drops the largest broker.
// Keyed by roster name. Extend this rather than loosening the matcher — loosening trades
// false negatives for false positives on real money.
const EMP_ALIASES = {
  "Tarek Momneh": ["TAREQ MOMNEA", "TAREK MOUMNEH", "TAREK MOUMNEHTOC", "TAREQ MOMNEATOC"],
  "Ahmad Ibrahim": ["AHMAD MOHAMAD IBRAHIM", "AHMED IBRAHIM"],
};

// Literal job titles. These bypass skeleton matching because a short title reduces to a
// single letter ("CEO" → "K") and gets filtered out. Owner ruling 2026-07-25: the CEO is
// the same person as the sales manager — there is no separate CEO record.
const EMP_TITLE_HINTS = [{ re: /\bCEO\b/i, name: "Ahmad Ibrahim" }];

// Nasama's own bank accounts. Money moved here was NOT paid to a person.
const EMP_OWN_ACCOUNTS = [
  { re: /AE360351646005642164001|FAB MY ACCOUNT/i, label: "FAB MY ACCOUNT" },
  { re: /AE930330000019101303277|NASAMA PROPERTIES/i, label: "NASAMA PROPERTIES L L C" },
];

// Paid through payroll but absent from `brokers`. Confirmed by the owner 2026-07-25.
const EMP_EXTRA_STAFF = [
  { id: "EMP-NISADI", broker_id: "", name: "Nisadi Sandunika Fernando", role: "Admin", status: "Active",
    aliases: ["SALPADORUGE NISADI SANDUNIKA FERNANDO", "NISADI SANDUNIKA FERNANDO", "NISADI SANDUNIKA FERNANDOTOC", "SALPADORUGE NISADI SANDUNIKA FERNAN"] },
  // Left during 2025. He must stay on the roster: his 2025 payments are real, and removing
  // him would stop the 2025 period reconciling to the general ledger.
  { id: "EMP-SHOUMAN", broker_id: "", name: "Mohammed Shouman", role: "Broker", status: "Left",
    leave_date: "2025-12-31", aliases: ["MOHAMMED SHOUMAN", "MOHAMED SHOUMAN"] },
];

const EMP_ROLES = ["Broker", "Sales Manager", "Admin", "Management", "Owner"];
const EMP_STATUSES = ["Active", "Inactive", "Left"];

// ── name matching ────────────────────────────────────────────────
/** Consonant skeleton: collapse doubles, keep first letter, drop remaining vowels, Q/C→K. */
function empSkel(word) {
  let s = String(word || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  s = s.replace(/Q/g, "K").replace(/C/g, "K").replace(/PH/g, "F").replace(/Y/g, "I").replace(/W/g, "U");
  s = s.replace(/(.)\1+/g, "$1");
  return s[0] + s.slice(1).replace(/[AEIOU]/g, "");
}
const empWords = s => String(s || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(w => w.length >= 3);
const EMP_ACCTNO_RE = /\b0\d{11}\b/g;

/** Text of a transaction + line, used for provisional attribution. */
const empTextOf = (t, l) => [t.description, t.ref, t.counterparty, l && l.memo].filter(Boolean).join(" ");

/** Flexible date parse — the roster holds RERA expiry as dd.mm.yyyy, deals use yyyy-mm-dd. */
function empParseDate(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}
const empDaysUntil = (v) => {
  const d = empParseDate(v);
  if (!d) return null;
  return Math.round((d - new Date()) / 86400000);
};

/**
 * Builds a text→person matcher over the roster.
 * Each person carries several name "variants" (legal name + confirmed bank aliases); a
 * variant matches independently, so an alias never has to resemble the roster spelling.
 * Returns null when nothing matches or when the text is ambiguous between two people.
 */
function makeEmployeeMatcher(roster) {
  const mkVariants = (name, aliases) => [name].concat(aliases || [])
    .map(v => empWords(v).map(empSkel).filter(x => x.length >= 2)).filter(v => v.length);
  const people = roster.map(p => ({ p, variants: mkVariants(p.name, (p.aliases || []).concat(EMP_ALIASES[p.name] || [])) }));
  const skCount = new Map();
  people.forEach(x => new Set(x.variants.reduce((a, v) => a.concat(v), [])).forEach(s => skCount.set(s, (skCount.get(s) || 0) + 1)));
  const acctMap = new Map();
  roster.forEach(p => (p.bank_accounts || []).forEach(n => acctMap.set(String(n), p)));

  return function match(text) {
    const titled = EMP_TITLE_HINTS.filter(h => h.re.test(text)).map(h => roster.find(r => r.name === h.name)).filter(Boolean);
    if (titled.length === 1) return { person: titled[0], via: "title" };

    const tsk = new Set(empWords(text).map(empSkel));
    const scored = people.map(x => ({
      p: x.p,
      hits: x.variants.reduce((best, v) => { const h = v.filter(s => tsk.has(s)); return h.length > best.length ? h : best; }, []),
    })).filter(x => x.hits.length > 0);

    const strong = scored.filter(x => x.hits.length >= 2);
    if (strong.length === 1) return { person: strong[0].p, via: "name" };
    if (strong.length > 1) return null;                       // ambiguous — never guess

    const byAcct = [...new Set((text.match(EMP_ACCTNO_RE) || []).filter(n => acctMap.has(n)).map(n => acctMap.get(n)))];
    if (byAcct.length === 1) return { person: byAcct[0], via: "account" };

    const weak = scored.filter(x => x.hits.length === 1 && skCount.get(x.hits[0]) === 1);
    if (weak.length === 1) return { person: weak[0].p, via: "partial" };
    return null;
  };
}

/**
 * Derives the working roster. When the `employees` collection is empty the roster is
 * synthesised in memory from `brokers` + the confirmed non-broker staff, so the page is
 * useful before anything is persisted. Nothing is written without an explicit action.
 */
function buildEmployeeRoster(employees, brokers) {
  if (employees && employees.length) return employees;
  const fromBrokers = (brokers || [])
    .filter(b => String(b.name || "").replace(/[^A-Za-z]/g, "").length >= 3)
    .map(b => ({
      id: "EMP-" + (b.id || uid()), broker_id: b.id || "", name: b.name, role: "Broker", status: "Active",
      phone: b.phone || "", nationality: b.nationality || "", rera_no: b.rera_no || "", rera_exp: b.rera_exp || "",
      manager_id: b.manager_id ? "EMP-" + b.manager_id : "", aliases: EMP_ALIASES[b.name] || [], bank_accounts: [],
      base_salary: 0, commission_split_pct: 0, join_date: "", leave_date: "", iban: "", email: "", visa_expiry: "", notes: "",
      __derived: true,
    }));
  return fromBrokers.concat(EMP_EXTRA_STAFF.map(s => Object.assign({
    phone: "", nationality: "", rera_no: "", rera_exp: "", manager_id: "", bank_accounts: [],
    base_salary: 0, commission_split_pct: 0, join_date: "", leave_date: "", iban: "", email: "", visa_expiry: "", notes: "",
    __derived: true,
  }, s)));
}

/**
 * THE ENGINE. Pure — no React, no globals beyond the module constants — so every tab reads
 * one consistent set of numbers and the maths can be unit-tested the way tests/commission.test.js
 * covers the commission model.
 *
 * Each payroll line is resolved in strict priority order:
 *   1. `tagged`       — an explicit broker_id / manager_id on the ledger line (ground truth)
 *   2. `provisional`  — a payee recovered from the bank narration; NOT confirmed by a human
 *   3. `own`          — paid to a Nasama account, so not a person at all
 *   4. `unattributed` — nothing to go on
 *
 * The name match MUST be tried before the own-account test. Nasama's own account appears in
 * the narration of outgoing transfers as the *sending* party — e.g.
 * "Acct to Acct FUND TRANSFER - 019101860154 - ABDULSALAM ALAITHAN" — so testing for it first
 * silently swallows real payments to real people.
 * Provisional figures are surfaced separately in the UI and must never be presented as fact.
 * Provisional figures are surfaced separately in the UI and must never be presented as fact.
 */
function buildEmployeeLedger({ roster, deals, txns, accounts, from, to }) {
  const acctById = new Map((accounts || []).map(a => [a.id, a]));
  const inRange = d => (!from || String(d || "") >= from) && (!to || String(d || "") <= to);
  const match = makeEmployeeMatcher(roster);

  const byBrokerId = new Map();
  roster.forEach(p => { if (p.broker_id) byBrokerId.set(p.broker_id, p); });
  const byId = new Map(roster.map(p => [p.id, p]));

  const blank = () => EMP_COST_KINDS.reduce((o, k) => { o[k] = 0; return o; }, {});
  const people = new Map(roster.map(p => [p.id, {
    person: p,
    cost: blank(), costTotal: 0, provisionalTotal: 0, taggedTotal: 0,
    lines: [], deals: [], outstanding: [],
    generated: 0, dealCount: 0, collectedCount: 0, pipeline: 0,
    firstPaid: "", lastPaid: "", transferCount: 0,
  }]));

  const unattributed = [], ownAccount = [];
  let glTotal = 0;

  (txns || []).forEach(t => {
    if (t.isVoid || !inRange(t.date)) return;
    (t.lines || []).forEach(l => {
      const a = acctById.get(l.accountId);
      if (!a) return;
      const spec = EMP_PAYROLL_ACCOUNTS[a.code];
      if (!spec) return;
      const amt = (l.debit || 0) - (l.credit || 0);
      glTotal += amt;
      const row = {
        txnId: t.id, date: t.date || "", ref: t.ref || "", txnType: t.txnType || "",
        code: a.code, acctName: a.name, kind: spec.kind, amt,
        desc: t.description || "", counterparty: t.counterparty || "", memo: (l && l.memo) || "",
        isReversal: amt < 0,
      };

      const tagId = l.broker_id || l.manager_id || t.broker_id || "";
      const tagged = tagId ? (byBrokerId.get(tagId) || byId.get(tagId)) : null;
      if (tagged) return add(tagged, row, "tagged");

      const text = empTextOf(t, l);
      const m = match(text);
      if (m) return add(m.person, row, "provisional", m.via);

      const own = EMP_OWN_ACCOUNTS.find(o => o.re.test(text));
      if (own) { ownAccount.push(Object.assign({ source: "own", who: own.label }, row)); return; }

      unattributed.push(Object.assign({ source: "none" }, row));
    });
  });

  function add(person, row, source, via) {
    const rec = people.get(person.id);
    if (!rec) { unattributed.push(Object.assign({ source: "none" }, row)); return; }
    const line = Object.assign({ source: source, via: via || "" }, row);
    rec.lines.push(line);
    rec.cost[row.kind] += row.amt;
    rec.costTotal += row.amt;
    if (source === "provisional") rec.provisionalTotal += row.amt; else rec.taggedTotal += row.amt;
    if (row.amt > 0) {
      rec.transferCount++;
      if (!rec.firstPaid || row.date < rec.firstPaid) rec.firstPaid = row.date;
      if (!rec.lastPaid || row.date > rec.lastPaid) rec.lastPaid = row.date;
    }
  }

  // ── revenue side ───────────────────────────────────────────────
  const srByDeal = new Map();
  (txns || []).forEach(t => {
    if (t.isVoid || t.txnType !== "SR" || !t.deal_id) return;
    const cash = (t.lines || []).reduce((s, l) => {
      const a = acctById.get(l.accountId);
      return s + (a && (a.isBank || a.isCash || a.code === "1001" || a.code === "1002") ? (l.debit || 0) : 0);
    }, 0);
    srByDeal.set(t.deal_id, (srByDeal.get(t.deal_id) || 0) + cash);
  });

  (deals || []).forEach(d => {
    const p = d.broker_id ? byBrokerId.get(d.broker_id) : null;
    if (!p || !inRange(d.created_at)) return;
    const rec = people.get(p.id);
    if (!rec) return;
    const collected = d.stage === "Commission Collected";
    // No linked receipt? For deals already marked collected the cash came in before the
    // system existed, so fall back to the expected commission — a reporting figure only,
    // no bank transaction, no double count. Mirrors PerformancePage.
    const cashIn = srByDeal.get(d.id) || (collected ? (d.expected_commission_net || 0) : 0);
    rec.dealCount++;
    rec.deals.push({ id: d.id, name: d.property_name || d.id, stage: d.stage, type: d.type,
      value: d.transaction_value || 0, commission: d.expected_commission_net || 0, cashIn,
      brokerPaid: d.broker_paid_amount || 0, date: d.created_at || "" });
    if (collected) { rec.collectedCount++; rec.generated += cashIn; }
    else rec.pipeline += (d.expected_commission_net || 0);
    // Collected but nothing paid out to the broker → an unrecorded or unpaid obligation.
    if (collected && !(d.broker_paid_amount > 0)) {
      const paidByTxn = (txns || []).some(t => !t.isVoid && t.deal_id === d.id && t.txnType === "BP");
      if (!paidByTxn) rec.outstanding.push({ id: d.id, name: d.property_name || d.id, commission: d.expected_commission_net || 0, date: d.created_at || "" });
    }
  });

  const rows = [...people.values()].map(r => {
    r.outstandingTotal = r.outstanding.reduce((s, o) => s + o.commission, 0);
    r.net = r.generated - r.costTotal;
    r.margin = r.generated > 0 ? (r.net / r.generated) * 100 : null;
    r.payback = r.costTotal > 0 ? r.generated / r.costTotal : null;
    r.payBasis = describePayBasis(r.cost);
    return r;
  });

  const attributed = rows.reduce((s, r) => s + r.costTotal, 0);
  const ownTotal = ownAccount.reduce((s, r) => s + r.amt, 0);
  const noneTotal = unattributed.reduce((s, r) => s + r.amt, 0);

  return {
    rows: rows.sort((a, b) => b.costTotal - a.costTotal),
    unattributed, ownAccount,
    control: {
      attributed, ownTotal, noneTotal, glTotal,
      sum: attributed + ownTotal + noneTotal,
      ties: Math.abs(attributed + ownTotal + noneTotal - glTotal) < 1,
      taggedTotal: rows.reduce((s, r) => s + r.taggedTotal, 0),
      provisionalTotal: rows.reduce((s, r) => s + r.provisionalTotal, 0),
    },
  };
}

/** Pay basis read from what the ledger actually shows, not from a settings field. */
function describePayBasis(cost) {
  const has = k => Math.abs(cost[k] || 0) > 0;
  const parts = [];
  if (has("salary")) parts.push("Salary");
  if (has("commission")) parts.push("Commission");
  if (has("override")) parts.push("Override");
  if (has("incentive")) parts.push("Incentive");
  if (!parts.length) return { label: "No payments recorded", tone: "warning" };
  return { label: parts.join(" + "), tone: parts.length > 1 ? "info" : "neutral" };
}

// ╔══════════════════════════════════════════════════╗
//  PAGE
// ╚══════════════════════════════════════════════════╝
function EmployeesPage(p) {
  const { employees, setEmployees, brokers, deals, txns, accounts, userRole } = p;
  const [tab, setTab] = usePersistedState("emp_tab", "roster");
  const [dateFilter, setDateFilter] = usePersistedDateFilter("emp_period", "this_year");
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const roster = useMemo(() => buildEmployeeRoster(employees, brokers), [employees, brokers]);
  const isDerived = !(employees && employees.length);
  const led = useMemo(
    () => buildEmployeeLedger({ roster, deals, txns, accounts, from: dateFilter.from, to: dateFilter.to }),
    [roster, deals, txns, accounts, dateFilter.from, dateFilter.to]);
  const rowById = useMemo(() => new Map(led.rows.map(r => [r.person.id, r])), [led]);
  const selected = selectedId ? rowById.get(selectedId) : null;

  const openPerson = (id) => { setSelectedId(id); setTab("person"); };

  const seedRoster = () => {
    if (!setEmployees) return;
    const seeded = roster.map(r => { const c = Object.assign({}, r); delete c.__derived; return c; });
    setEmployees(seeded);
    toast(`Created ${seeded.length} employee records`, "success");
  };

  const TABS = [
    { id: "roster", label: "Roster", icon: "👤" },
    { id: "person", label: "Employee 360", icon: "💳" },
    { id: "register", label: "Payroll Register", icon: "📋" },
    { id: "league", label: "Contribution", icon: "📊" },
    { id: "exceptions", label: "Exceptions", icon: "🚨" },
  ];

  return <div>
    <PageHeader title="Employees" sub={`${roster.length} people · every figure derived from the general ledger`}>
      <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
    </PageHeader>

    {isDerived && <div style={{ ...C.card, padding: "14px 18px", marginBottom: 16, borderLeft: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, color: "#344054" }}>
        <strong>Provisional roster.</strong> Derived in memory from {(brokers || []).length} broker records plus {EMP_EXTRA_STAFF.length} confirmed staff.
        Nothing has been saved yet — create the records to edit roles, salaries and aliases.
      </div>
      {hasPermission(userRole, 'accounting.create') && <button style={C.btn()} onClick={seedRoster}>Create employee records</button>}
    </div>}

    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{
        ...C.btn(tab === t.id ? "primary" : "secondary", true), padding: "7px 14px",
      }}>{t.icon} {t.label}</button>)}
    </div>

    {tab === "roster" && <RosterTab led={led} search={search} setSearch={setSearch} onOpen={openPerson} onEdit={setEditing} isDerived={isDerived} userRole={userRole} />}
    {tab === "person" && <PersonTab rec={selected} led={led} onPick={openPerson} />}
    {tab === "register" && <RegisterTab led={led} dateFilter={dateFilter} />}
    {tab === "league" && <LeagueTab led={led} onOpen={openPerson} />}
    {tab === "exceptions" && <ExceptionsTab led={led} deals={deals} />}

    {editing && <EmployeeEditor emp={editing} roster={roster} onClose={() => setEditing(null)}
      onSave={(next) => {
        const list = employees && employees.length ? employees : roster.map(r => { const c = Object.assign({}, r); delete c.__derived; return c; });
        const exists = list.some(e => e.id === next.id);
        setEmployees(exists ? list.map(e => e.id === next.id ? next : e) : list.concat([next]));
        setEditing(null);
        toast("Employee saved", "success");
      }} />}
  </div>;
}

// ── Tab 1: Roster ────────────────────────────────────────────────
function RosterTab({ led, search, setSearch, onOpen, onEdit, isDerived, userRole }) {
  const q = search.trim().toLowerCase();
  const rows = led.rows.filter(r => !q || r.person.name.toLowerCase().includes(q) || (r.person.role || "").toLowerCase().includes(q));
  const active = led.rows.filter(r => r.person.status !== "Left").length;

  const exportRoster = () => {
    const aoa = [["Name", "Role", "Status", "Pay basis", "Cost (AED)", "Generated (AED)", "Net (AED)", "Deals", "RERA expiry", "Phone"]];
    rows.forEach(r => aoa.push([r.person.name, r.person.role || "", r.person.status || "", r.payBasis.label,
      xAED(r.costTotal), xAED(r.generated), xAED(r.net), r.dealCount, r.person.rera_exp || "", r.person.phone || ""]));
    xlsxExport("Roster", `nasama-employees-${todayStr()}.xlsx`, aoa, [4, 5, 6]);
  };

  return <div>
    <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ maxWidth: 260, flex: "1 1 200px" }}><Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or role…" /></div>
      <div style={{ fontSize: 12, color: "#667085" }}>{active} active · {led.rows.length - active} left</div>
      <div style={{ flex: 1 }} />
      <XlsxSignBtn onExport={exportRoster} title="Export roster" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
      {rows.map(r => {
        const days = empDaysUntil(r.person.rera_exp);
        const reraTone = days === null ? null : days < 0 ? "danger" : days < 60 ? "warning" : "success";
        const reraText = days === null ? null : days < 0 ? `RERA expired ${Math.abs(days)}d ago` : `RERA ${days}d left`;
        const left = r.person.status === "Left";
        return <div key={r.person.id} style={{ ...C.card, padding: 16, opacity: left ? .72 : 1, cursor: "pointer" }} onClick={() => onOpen(r.person.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.person.name}</div>
              <div style={{ fontSize: 11.5, color: "#667085", marginTop: 2 }}>{r.person.role || "—"}{left ? " · Left" : ""}</div>
            </div>
            {!isDerived && hasPermission(userRole, 'accounting.edit') &&
              <button style={C.btn("ghost", true)} onClick={e => { e.stopPropagation(); onEdit(r.person); }}>Edit</button>}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 12px" }}>
            <span style={C.badge(r.payBasis.tone)}>{r.payBasis.label}</span>
            {reraText && <span style={C.badge(reraTone)}>{reraText}</span>}
            {r.provisionalTotal !== 0 && <span style={C.badge("warning")}>provisional</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
            <Metric label="Cost" value={fmtAED(r.costTotal)} />
            <Metric label="Generated" value={fmtAED(r.generated)} />
            <Metric label="Net" value={fmtAED(r.net)} tone={r.net >= 0 ? "#027A48" : "#B42318"} />
            <Metric label="Deals" value={`${r.dealCount} (${r.collectedCount} closed)`} />
          </div>
        </div>;
      })}
      {!rows.length && <div style={{ ...C.card, padding: 40, textAlign: "center", color: "#9CA3AF", gridColumn: "1/-1" }}>No people match that search.</div>}
    </div>
  </div>;
}

function Metric({ label, value, tone }) {
  return <div>
    <div style={{ fontSize: 10.5, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    <div style={{ fontWeight: 600, color: tone || "#344054", marginTop: 1 }}>{value}</div>
  </div>;
}

// ── Tab 2: Employee 360 ──────────────────────────────────────────
function PersonTab({ rec, led, onPick }) {
  if (!rec) return <div style={{ ...C.card, padding: 40, textAlign: "center", color: "#6B7280" }}>
    <div style={{ marginBottom: 12 }}>Pick a person to see their full financial dossier.</div>
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
      {led.rows.slice(0, 8).map(r => <button key={r.person.id} style={C.btn("secondary", true)} onClick={() => onPick(r.person.id)}>{r.person.name}</button>)}
    </div>
  </div>;

  const isRevenue = rec.dealCount > 0 || rec.generated !== 0;
  const exportLines = () => {
    const aoa = [["Date", "Ref", "Type", "Account", "Nature", "Amount (AED)", "Source", "Description"]];
    rec.lines.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(l =>
      aoa.push([l.date, l.ref, l.txnType, `${l.code} ${l.acctName}`, EMP_KIND_LABEL[l.kind] || l.kind, xAED(l.amt), l.source, l.desc]));
    xlsxExport("Payments", `nasama-${rec.person.name.replace(/\s+/g, "-").toLowerCase()}-${todayStr()}.xlsx`, aoa, [5]);
  };

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ ...C.card, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{rec.person.name}</div>
          <div style={{ fontSize: 12.5, color: "#667085", marginTop: 3 }}>
            {rec.person.role || "—"}{rec.person.status === "Left" ? " · Left" : ""}
            {rec.person.phone ? ` · ${rec.person.phone}` : ""}{rec.person.rera_no ? ` · RERA ${rec.person.rera_no}` : ""}
          </div>
        </div>
        <XlsxSignBtn onExport={exportLines} title="Export this person's payments" />
      </div>

      {rec.provisionalTotal !== 0 && <div style={{ marginTop: 14, background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, color: "#B54708" }}>
        <strong>{fmtAED(rec.provisionalTotal)} is provisional</strong> — recovered from bank narrations, not yet confirmed against a tagged ledger entry. Treat as an estimate until Phase 0 attribution is applied.
      </div>}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
      <BigStat label="Total cost of this person" value={fmtAED(rec.costTotal)} sub={`${rec.transferCount} transfers · last ${rec.lastPaid ? fmtDate(rec.lastPaid) : "—"}`} />
      <BigStat label="Revenue generated" value={fmtAED(rec.generated)} sub={`${rec.collectedCount} of ${rec.dealCount} deals collected`} />
      <BigStat label="Net contribution" value={fmtAED(rec.net)} tone={rec.net >= 0 ? "#027A48" : "#B42318"}
        sub={rec.margin === null ? "no revenue attributed" : `${rec.margin.toFixed(1)}% margin`} />
      <BigStat label="Owed to them" value={fmtAED(rec.outstandingTotal)} sub={`${rec.outstanding.length} collected deals unpaid`} />
    </div>

    {/* break-even */}
    <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Payback</SectionTitle>
      {!isRevenue
        ? <div style={{ fontSize: 13, color: "#667085" }}>
            <strong>Support cost — no direct revenue.</strong> This person is not attached to any deal, so a margin
            would be meaningless. Their {fmtAED(rec.costTotal)} is an operating cost of the business.
          </div>
        : <div>
            <div style={{ fontSize: 13, color: "#344054", marginBottom: 10 }}>
              Generated <strong>{fmtAED(rec.generated)}</strong> against a cost of <strong>{fmtAED(rec.costTotal)}</strong>
              {rec.payback !== null && rec.costTotal > 0 ? <> → <strong>{rec.payback.toFixed(2)}×</strong> payback</> : null}
            </div>
            <div style={{ height: 12, background: "#F2F4F7", borderRadius: 6, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${Math.min(100, rec.generated > 0 ? (Math.max(0, rec.costTotal) / rec.generated) * 100 : 100)}%`, background: "#F59E0B" }} title="cost" />
              <div style={{ flex: 1, background: "#34D399" }} title="retained" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#667085", marginTop: 5 }}>
              <span>■ cost {fmtAED(rec.costTotal)}</span><span>■ retained by company {fmtAED(rec.net)}</span>
            </div>
          </div>}
    </div>

    {/* cost breakdown */}
    <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Money out — by nature</SectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {EMP_COST_KINDS.filter(k => Math.abs(rec.cost[k]) > 0).map(k =>
            <tr key={k}><td style={C.td}>{EMP_KIND_LABEL[k]}</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 600, color: rec.cost[k] < 0 ? "#B42318" : "#344054" }}>{fmtAED(rec.cost[k])}</td></tr>)}
          <tr><td style={{ ...C.td, fontWeight: 700 }}>Total</td>
            <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(rec.costTotal)}</td></tr>
        </tbody>
      </table>
    </div>

    {/* bank transactions */}
    <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Bank transactions ({rec.lines.length})</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
          <thead><tr><th style={C.th}>Date</th><th style={C.th}>Ref</th><th style={C.th}>Account</th><th style={C.th}>Nature</th><th style={{ ...C.th, textAlign: "right" }}>Amount</th><th style={C.th}>Source</th></tr></thead>
          <tbody>
            {rec.lines.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((l, i) =>
              <tr key={i}>
                <td style={C.td}>{fmtDate(l.date)}</td>
                <td style={{ ...C.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.ref}>{l.ref || "—"}</td>
                <td style={C.td}>{l.code} {l.acctName}</td>
                <td style={C.td}>{EMP_KIND_LABEL[l.kind] || l.kind}</td>
                <td style={{ ...C.td, textAlign: "right", fontWeight: 600, color: l.amt < 0 ? "#B42318" : "#344054" }}>{fmtAED(l.amt)}</td>
                <td style={C.td}>
                  {l.isReversal
                    ? <span style={C.badge("info")} title="Contra entry — a reversal, not negative salary">reversal</span>
                    : l.source === "tagged" ? <span style={C.badge("success")}>tagged</span>
                    : <span style={C.badge("warning")} title={`Recovered from the narration via ${l.via}`}>provisional</span>}
                </td>
              </tr>)}
            {!rec.lines.length && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 30, color: "#9CA3AF" }}>No payroll or commission payments in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {/* deals + outstanding */}
    {!!rec.deals.length && <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Deals ({rec.deals.length})</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
          <thead><tr><th style={C.th}>Property</th><th style={C.th}>Stage</th><th style={{ ...C.th, textAlign: "right" }}>Deal value</th><th style={{ ...C.th, textAlign: "right" }}>Commission</th><th style={{ ...C.th, textAlign: "right" }}>Broker paid</th></tr></thead>
          <tbody>
            {rec.deals.slice().sort((a, b) => b.commission - a.commission).map(d =>
              <tr key={d.id}>
                <td style={C.td}>{d.name}</td>
                <td style={C.td}><span style={C.badge(d.stage === "Commission Collected" ? "success" : "neutral")}>{d.stage}</span></td>
                <td style={{ ...C.td, textAlign: "right" }}>{fmtAED(d.value)}</td>
                <td style={{ ...C.td, textAlign: "right" }}>{fmtAED(d.commission)}</td>
                <td style={{ ...C.td, textAlign: "right" }}>{d.brokerPaid ? fmtAED(d.brokerPaid) : "—"}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {!!rec.outstanding.length && <div style={{ ...C.card, padding: 18, borderLeft: "3px solid #F59E0B" }}>
      <SectionTitle>Collected deals with no broker payment recorded</SectionTitle>
      <div style={{ fontSize: 12, color: "#667085", marginBottom: 10 }}>
        Commission was collected but nothing was paid out to this person. Either an unpaid obligation, or a payment made outside the system.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <tbody>{rec.outstanding.map(o => <tr key={o.id}>
          <td style={C.td}>{o.name}</td><td style={C.td}>{fmtDate(o.date)}</td>
          <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(o.commission)}</td></tr>)}
        </tbody>
      </table>
    </div>}
  </div>;
}

function BigStat({ label, value, sub, tone }) {
  return <div style={{ ...C.card, padding: 16 }}>
    <div style={{ fontSize: 11, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: tone || NAVY, marginTop: 6, letterSpacing: "-.02em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: "#667085", marginTop: 4 }}>{sub}</div>}
  </div>;
}
function SectionTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{children}</div>;
}

// ── Tab 3: Payroll & Commission Register ─────────────────────────
function RegisterTab({ led, dateFilter }) {
  const codes = Object.keys(EMP_PAYROLL_ACCOUNTS).sort();
  const c = led.control;
  const cellOf = (rec, code) => rec.lines.reduce((s, l) => s + (l.code === code ? l.amt : 0), 0);

  const exportRegister = () => {
    const aoa = [["Person", "Role"].concat(codes.map(k => `${k} ${EMP_PAYROLL_ACCOUNTS[k].label}`)).concat(["Total (AED)", "Transfers", "Last paid"])];
    led.rows.forEach(r => aoa.push([r.person.name, r.person.role || ""]
      .concat(codes.map(k => xAED(cellOf(r, k)))).concat([xAED(r.costTotal), r.transferCount, r.lastPaid || ""])));
    xlsxExport("Register", `nasama-payroll-register-${todayStr()}.xlsx`, aoa, codes.map((_, i) => i + 2).concat([codes.length + 2]));
  };

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ ...C.card, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
        <SectionTitle>Register — person × account</SectionTitle>
        <XlsxSignBtn onExport={exportRegister} title="Export register" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
          <thead><tr>
            <th style={C.th}>Person</th>
            {codes.map(k => <th key={k} style={{ ...C.th, textAlign: "right" }} title={EMP_PAYROLL_ACCOUNTS[k].label}>{k}</th>)}
            <th style={{ ...C.th, textAlign: "right" }}>Total</th>
            <th style={{ ...C.th, textAlign: "right" }}>Transfers</th>
          </tr></thead>
          <tbody>
            {led.rows.filter(r => r.lines.length).map(r => <tr key={r.person.id}>
              <td style={C.td}>{r.person.name}{r.person.status === "Left" ? <span style={{ ...C.badge("neutral"), marginLeft: 6 }}>left</span> : null}</td>
              {codes.map(k => { const v = cellOf(r, k); return <td key={k} style={{ ...C.td, textAlign: "right", color: v < 0 ? "#B42318" : "#344054" }}>{v ? fmtAED(v).replace("AED ", "") : "—"}</td>; })}
              <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(r.costTotal).replace("AED ", "")}</td>
              <td style={{ ...C.td, textAlign: "right" }}>{r.transferCount}</td>
            </tr>)}
          </tbody>
          <tfoot><tr style={{ background: "#F9FAFB" }}>
            <td style={{ ...C.td, fontWeight: 700 }}>ATTRIBUTED</td>
            {codes.map(k => <td key={k} style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>
              {fmtAED(led.rows.reduce((s, r) => s + cellOf(r, k), 0)).replace("AED ", "")}</td>)}
            <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(c.attributed).replace("AED ", "")}</td>
            <td style={C.td} />
          </tr></tfoot>
        </table>
      </div>
    </div>

    {/* CONTROL TOTAL — what makes this a subledger rather than a dashboard */}
    <div style={{ ...C.card, padding: 18, borderLeft: `3px solid ${c.ties ? "#039855" : "#D92D20"}` }}>
      <SectionTitle>Control total — must tie to the general ledger</SectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, maxWidth: 560 }}>
        <tbody>
          <ControlRow label="Tagged in the ledger" value={c.taggedTotal} />
          <ControlRow label="Provisional (from narrations)" value={c.provisionalTotal} tone="#B54708" />
          <ControlRow label="Paid to own accounts — not a person" value={c.ownTotal} tone="#B54708" />
          <ControlRow label="Unattributed" value={c.noneTotal} tone={c.noneTotal ? "#B42318" : undefined} />
          <tr><td style={{ ...C.td, fontWeight: 700 }}>Sum</td><td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(c.sum)}</td></tr>
          <tr><td style={{ ...C.td, fontWeight: 700 }}>GL movement (payroll accounts)</td><td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(c.glTotal)}</td></tr>
          <tr><td style={{ ...C.td, fontWeight: 700 }}>Difference</td>
            <td style={{ ...C.td, textAlign: "right", fontWeight: 700, color: c.ties ? "#027A48" : "#B42318" }}>
              {fmtAED(c.sum - c.glTotal)} {c.ties ? "✓ ties" : "✗ does not tie"}</td></tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: "#667085", marginTop: 10 }}>
        Period {dateFilter.from || "—"} → {dateFilter.to || "—"}. Any difference means payroll left the bank without
        landing on a person record.
      </div>
    </div>
  </div>;
}
function ControlRow({ label, value, tone }) {
  return <tr><td style={C.td}>{label}</td><td style={{ ...C.td, textAlign: "right", color: tone || "#344054", fontWeight: 600 }}>{fmtAED(value)}</td></tr>;
}

// ── Tab 4: Contribution league ───────────────────────────────────
function LeagueTab({ led, onOpen }) {
  const rows = led.rows.slice().sort((a, b) => b.net - a.net);
  const max = Math.max(1, ...rows.map(r => Math.abs(r.net)));
  const exportLeague = () => {
    const aoa = [["Person", "Role", "Generated (AED)", "Cost (AED)", "Net contribution (AED)", "Margin %", "Payback ×"]];
    rows.forEach(r => aoa.push([r.person.name, r.person.role || "", xAED(r.generated), xAED(r.costTotal), xAED(r.net),
      r.margin === null ? "" : Number(r.margin.toFixed(1)), r.payback === null ? "" : Number(r.payback.toFixed(2))]));
    xlsxExport("Contribution", `nasama-contribution-${todayStr()}.xlsx`, aoa, [2, 3, 4]);
  };

  return <div style={{ ...C.card, padding: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <SectionTitle>Ranked by net contribution, not revenue</SectionTitle>
      <XlsxSignBtn onExport={exportLeague} title="Export contribution" />
    </div>
    <div style={{ fontSize: 12, color: "#667085", marginBottom: 14 }}>
      Revenue generated minus everything that person cost. Support staff with no deals show as pure cost — that is correct, not an error.
    </div>
    {rows.map(r => <div key={r.person.id} style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => onOpen(r.person.id)}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: NAVY }}>{r.person.name} <span style={{ color: "#98A2B3", fontWeight: 400 }}>{r.person.role}</span></span>
        <span style={{ fontWeight: 700, color: r.net >= 0 ? "#027A48" : "#B42318" }}>{fmtAED(r.net)}</span>
      </div>
      <div style={{ height: 8, background: "#F2F4F7", borderRadius: 4, overflow: "hidden", display: "flex", justifyContent: r.net < 0 ? "flex-end" : "flex-start" }}>
        <div style={{ width: `${(Math.abs(r.net) / max) * 100}%`, background: r.net >= 0 ? "#34D399" : "#F97066" }} />
      </div>
      <div style={{ fontSize: 11, color: "#667085", marginTop: 3 }}>
        generated {fmtAED(r.generated)} · cost {fmtAED(r.costTotal)}
        {r.margin !== null ? ` · ${r.margin.toFixed(1)}% margin` : " · no revenue attributed"}
      </div>
    </div>)}
  </div>;
}

// ── Tab 5: Exceptions ────────────────────────────────────────────
function ExceptionsTab({ led, deals }) {
  const issues = useMemo(() => {
    const out = [];
    if (led.control.noneTotal !== 0)
      out.push({ tone: "danger", title: "Unattributed payroll", detail: `${fmtAED(led.control.noneTotal)} across ${led.unattributed.length} lines left the bank on a payroll account without landing on a person.` });
    if (led.control.ownTotal !== 0)
      out.push({ tone: "danger", title: "Paid to the company's own accounts", detail: `${fmtAED(led.control.ownTotal)} across ${led.ownAccount.length} lines was booked as payroll/commission expense but paid to a Nasama account. Either misclassified (belongs in a bank transfer) or a cash drawdown whose real payee was never recorded.` });
    if (led.control.provisionalTotal !== 0)
      out.push({ tone: "warning", title: "Provisional attribution not yet confirmed", detail: `${fmtAED(led.control.provisionalTotal)} was matched from bank narrations rather than a tagged ledger entry. Confirm before relying on per-person figures.` });
    led.rows.forEach(r => {
      if (r.outstanding.length)
        out.push({ tone: "warning", title: `${r.person.name} — commission collected, nothing paid out`, detail: `${r.outstanding.length} deal(s), ${fmtAED(r.outstandingTotal)} of collected commission with no broker payment recorded.` });
      const days = empDaysUntil(r.person.rera_exp);
      if (days !== null && days < 0) {
        const after = (deals || []).filter(d => d.broker_id && d.broker_id === r.person.broker_id && empParseDate(d.created_at) > empParseDate(r.person.rera_exp));
        out.push({ tone: after.length ? "danger" : "warning", title: `${r.person.name} — RERA expired`, detail: `Expired ${Math.abs(days)} days ago${after.length ? `, and ${after.length} deal(s) are dated after the expiry.` : "."}` });
      }
      if (r.costTotal < 0)
        out.push({ tone: "warning", title: `${r.person.name} — net negative payroll`, detail: `Total is ${fmtAED(r.costTotal)}. Reversals exceed payments in this period; check the contra entries before reading the margin.` });
    });
    return out;
  }, [led, deals]);

  return <div style={{ display: "grid", gap: 12 }}>
    {!issues.length && <div style={{ ...C.card, padding: 40, textAlign: "center", color: "#027A48" }}>✅ No exceptions in this period.</div>}
    {issues.map((i, n) => <div key={n} style={{ ...C.card, padding: 16, borderLeft: `3px solid ${i.tone === "danger" ? "#D92D20" : "#F59E0B"}` }}>
      <div style={{ fontWeight: 700, color: NAVY, fontSize: 13.5, marginBottom: 4 }}>{i.title}</div>
      <div style={{ fontSize: 12.5, color: "#475467" }}>{i.detail}</div>
    </div>)}

    {!!led.unattributed.length && <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Unattributed lines ({led.unattributed.length})</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
          <thead><tr><th style={C.th}>Date</th><th style={C.th}>Acct</th><th style={{ ...C.th, textAlign: "right" }}>Amount</th><th style={C.th}>Narration</th></tr></thead>
          <tbody>{led.unattributed.slice().sort((a, b) => b.amt - a.amt).slice(0, 40).map((l, i) => <tr key={i}>
            <td style={C.td}>{fmtDate(l.date)}</td><td style={C.td}>{l.code}</td>
            <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(l.amt)}</td>
            <td style={{ ...C.td, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.desc}>{l.desc}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}

    {!!led.ownAccount.length && <div style={{ ...C.card, padding: 18 }}>
      <SectionTitle>Paid to own accounts ({led.ownAccount.length})</SectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <tbody>{led.ownAccount.slice().sort((a, b) => b.amt - a.amt).map((l, i) => <tr key={i}>
          <td style={C.td}>{fmtDate(l.date)}</td><td style={C.td}>{l.code}</td><td style={C.td}>{l.who}</td>
          <td style={{ ...C.td, textAlign: "right", fontWeight: 600 }}>{fmtAED(l.amt)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── Editor ───────────────────────────────────────────────────────
function EmployeeEditor({ emp, roster, onClose, onSave }) {
  const [f, setF] = useState(() => Object.assign({}, emp, { aliases: (emp.aliases || []).join(", "), bank_accounts: (emp.bank_accounts || []).join(", ") }));
  const set = (k, v) => setF(p => Object.assign({}, p, { [k]: v }));
  const save = () => {
    if (!String(f.name || "").trim()) { toast("Name is required", "warning"); return; }
    onSave(Object.assign({}, f, {
      aliases: String(f.aliases || "").split(",").map(s => s.trim()).filter(Boolean),
      bank_accounts: String(f.bank_accounts || "").split(",").map(s => s.trim()).filter(Boolean),
      base_salary: toCents(f.base_salary || 0),
    }));
  };
  return <div style={C.modal} onClick={onClose}>
    <div style={C.mbox(640)} onClick={e => e.stopPropagation()}>
      <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>🧑‍💼 {emp.name}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
      <div style={C.mbdy}>
        <div style={C.fg}>
          <div><label style={C.label}>Name</label><Inp value={f.name} onChange={e => set("name", e.target.value)} /></div>
          <div><label style={C.label}>Role</label><Sel value={f.role} onChange={e => set("role", e.target.value)}>{EMP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</Sel></div>
          <div><label style={C.label}>Status</label><Sel value={f.status} onChange={e => set("status", e.target.value)}>{EMP_STATUSES.map(r => <option key={r} value={r}>{r}</option>)}</Sel></div>
          <div><label style={C.label}>Reports to</label><Sel value={f.manager_id} onChange={e => set("manager_id", e.target.value)}>
            <option value="">— None —</option>{roster.filter(r => r.id !== f.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Sel></div>
          <div><label style={C.label}>Phone</label><Inp value={f.phone} onChange={e => set("phone", e.target.value)} /></div>
          <div><label style={C.label}>Email</label><Inp value={f.email} onChange={e => set("email", e.target.value)} /></div>
          <div><label style={C.label}>Join date</label><Inp type="date" value={f.join_date} onChange={e => set("join_date", e.target.value)} /></div>
          <div><label style={C.label}>Leave date</label><Inp type="date" value={f.leave_date} onChange={e => set("leave_date", e.target.value)} /></div>
          <div><label style={C.label}>RERA no.</label><Inp value={f.rera_no} onChange={e => set("rera_no", e.target.value)} /></div>
          <div><label style={C.label}>RERA expiry</label><Inp value={f.rera_exp} onChange={e => set("rera_exp", e.target.value)} placeholder="dd.mm.yyyy" /></div>
          <div><label style={C.label}>IBAN</label><Inp value={f.iban} onChange={e => set("iban", e.target.value)} /></div>
          <div><label style={C.label}>Base salary (planning only)</label><Inp type="number" value={f.base_salary} onChange={e => set("base_salary", e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={C.label}>Bank aliases — comma separated</label>
          <Inp value={f.aliases} onChange={e => set("aliases", e.target.value)} placeholder="TAREQ MOMNEA, TAREK MOUMNEH" />
          <div style={{ fontSize: 11.5, color: "#667085", marginTop: 5 }}>
            Spellings the bank uses for this person. Adding an alias here is always safer than loosening the name matcher.
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={C.label}>Bank account numbers — comma separated</label>
          <Inp value={f.bank_accounts} onChange={e => set("bank_accounts", e.target.value)} placeholder="019120282831" />
          <div style={{ fontSize: 11.5, color: "#667085", marginTop: 5 }}>
            The bare account numbers that appear in "FUND TRANSFER - … - NAME" narrations.
          </div>
        </div>
      </div>
      <div style={C.mftr}><button style={C.btn("secondary")} onClick={onClose}>Cancel</button><button style={C.btn()} onClick={save}>Save</button></div>
    </div>
  </div>;
}
