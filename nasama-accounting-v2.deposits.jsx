/* ══════════════════════════════════════════════════════════════════════════
   NASAMA — CLIENT SECURITY DEPOSITS  (account 2230)

   Money a client pays in that is NOT ours. It is held as a REFUNDABLE security
   deposit until the deal closes, then either refunded in full or the commission
   is deducted from it and the balance refunded.

   THE VAT RULE (owner, 2026-08-13): the deposit receipt carries NO VAT —
   holding refundable security is not a supply, so there is nothing to tax yet.
   VAT arises on the commission only, and only at the moment it is deducted.
   That is why this module can never emit a tax document: the commission's tax
   invoice comes from the existing invoice module, not from here.

   All money is integer fils. Every posting goes through the journal engine in
   core.jsx (postClientFunds / postClientFundsEarned / postClientFundsPayout);
   nothing in this file writes a ledger line of its own.
   ══════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════
//  A. RECEIPT NUMBERING + AMOUNT IN WORDS  (pure — see tests/deposits.test.js)
// ═══════════════════════════════════════════════════════════════════
const DEP_RECEIPT_START = 1;
const DEP_A4_PX = 794;                  // A4 width at 96dpi
const depPad = n => "RCP-" + String(n).padStart(5, "0");

const DEP_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const DEP_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–999 in words. No internal "and" — it piles up unreadably once the fils clause is appended. */
function depWordsChunk(x) {
  let s = "";
  if (x >= 100) { s += DEP_ONES[Math.floor(x / 100)] + " Hundred"; x %= 100; if (x) s += " "; }
  if (x >= 20)     { s += DEP_TENS[Math.floor(x / 10)]; if (x % 10) s += "-" + DEP_ONES[x % 10]; }
  else if (x > 0)  { s += DEP_ONES[x]; }
  return s;
}
function depWordsInt(n) {
  if (!n) return "Zero";
  let out = [], rem = Math.floor(n);
  [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]].forEach(([v, name]) => {
    if (rem >= v) { out.push(depWordsChunk(Math.floor(rem / v)) + " " + name); rem %= v; }
  });
  if (rem > 0) out.push(depWordsChunk(rem));
  return out.join(" ").replace(/\s+/g, " ").trim();
}
/** Fils → the legal wording a receipt must carry, e.g. "AED One Hundred Twenty-One Thousand Only". */
function depAmountInWords(cents) {
  const neg = (cents || 0) < 0;
  const abs = Math.abs(Math.round(cents || 0));
  const dirhams = Math.floor(abs / 100), fils = abs % 100;
  let s = "AED " + depWordsInt(dirhams);
  if (fils > 0) s += " and " + depWordsInt(fils) + " Fils";
  return (neg ? "Minus " : "") + s + " Only";
}

function depTs() {
  try { return firebase.firestore.FieldValue.serverTimestamp(); }
  catch (err) { return new Date().toISOString(); }
}

/* Receipt numbers use an atomic Firestore transaction counter at
   meta/receiptCounter.lastNumber, so two people issuing at once cannot collide.
   A receipt series must be gapless for audit, which is why the number is
   assigned on ISSUE and a voided receipt keeps its number for good.

   A failure here deliberately THROWS rather than falling back to an invented
   number: a made-up number can collide with one already issued or jump the
   series forward, and the caller aborts before writing the receipt document, so
   failing loudly leaves the series intact. */
async function depGenReceiptNumber() {
  const ref = db.collection("meta").doc("receiptCounter");
  let num = DEP_RECEIPT_START;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    num = snap.exists ? Math.max((snap.data().lastNumber || 0) + 1, DEP_RECEIPT_START) : DEP_RECEIPT_START;
    tx.set(ref, { lastNumber: num }, { merge: true });
  });
  return { formatted: depPad(num), raw: num };
}

// ═══════════════════════════════════════════════════════════════════
//  B. DepositReceiptDoc — A4 document handed to the client
//     Deliberately has NO VAT block and NO tax-invoice wording.
// ═══════════════════════════════════════════════════════════════════
function DepositReceiptDoc({ receipt, settings }) {
  const R = receipt || {};
  const GOLDC = "#C9A044", INK = "#0C0F1E";
  const co = {
    name:    settings?.company   || "NASAMA PROPERTIES LLC",
    address: settings?.address   || "Office 218, Binghatti Emerald, JVC, District 15, Dubai, UAE",
    email:   settings?.email     || "info@nasamaproperties.com",
    phone:   settings?.contactNo || "971 502757603",
    trn:     settings?.trn       || "",
  };
  const S = {
    page:    { width: DEP_A4_PX, minHeight: 1000, background: "#fff", color: INK, padding: "38px 44px",
               fontFamily: "Georgia, 'Times New Roman', serif", boxSizing: "border-box", position: "relative" },
    hdr:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${GOLDC}`, paddingBottom: 14 },
    coName:  { fontSize: 19, fontWeight: 800, letterSpacing: "0.02em" },
    coLine:  { fontSize: 9.5, color: "#4B5563", marginTop: 3, lineHeight: 1.5, maxWidth: 330 },
    title:   { textAlign: "right" },
    titleTx: { fontSize: 21, fontWeight: 800, letterSpacing: "0.06em", color: GOLDC, textTransform: "uppercase" },
    titleSub:{ fontSize: 9, color: "#6B7280", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4 },
    meta:    { display: "flex", gap: 26, marginTop: 18, fontSize: 10.5 },
    metaK:   { color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 8.5 },
    metaV:   { fontWeight: 700, marginTop: 2 },
    box:     { border: "1px solid #E5E7EB", borderRadius: 4, marginTop: 22 },
    row:     { display: "flex", borderBottom: "1px solid #F3F4F6" },
    lbl:     { width: 168, padding: "11px 14px", fontSize: 9.5, color: "#6B7280", letterSpacing: "0.05em",
               textTransform: "uppercase", background: "#FCFAF6", borderRight: "1px solid #F3F4F6" },
    val:     { flex: 1, padding: "11px 14px", fontSize: 11.5, fontWeight: 600 },
    amtBox:  { marginTop: 22, border: `2px solid ${GOLDC}`, borderRadius: 4, padding: "16px 18px", background: "#FDFBF5" },
    amtK:    { fontSize: 8.5, color: "#6B7280", letterSpacing: "0.14em", textTransform: "uppercase" },
    amtV:    { fontSize: 25, fontWeight: 800, marginTop: 4, letterSpacing: "-0.01em" },
    words:   { fontSize: 10.5, fontStyle: "italic", color: "#374151", marginTop: 8, lineHeight: 1.5 },
    note:    { marginTop: 20, padding: "12px 14px", background: "#F9FAFB", borderLeft: `3px solid ${GOLDC}`,
               fontSize: 9.5, color: "#374151", lineHeight: 1.65 },
    foot:    { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 },
    stampTx: { fontSize: 9, color: "#6B7280", letterSpacing: "0.1em", textTransform: "uppercase" },
    line:    { width: 190, borderTop: "1px solid #9CA3AF", marginTop: 6 },
    voidMark:{ position: "absolute", top: 300, left: 0, right: 0, textAlign: "center", fontSize: 86,
               fontWeight: 800, color: "rgba(220,38,38,0.14)", letterSpacing: "0.1em", transform: "rotate(-18deg)" },
  };
  const money = c => "AED " + ((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = [
    ["Received From",   R.receivedFrom || "—"],
    ["Being",           R.purpose || "Security Deposit"],
    ["Property / Unit", R.propertyLabel || "—"],
    ["Payment Method",  R.method || "—"],
    ["Reference",       R.reference || "—"],
    ["Received Into",   R.intoAccountName || "—"],
  ];

  return <div id="dep-receipt-doc" style={S.page}>
    {R.status === "void" && <div style={S.voidMark}>VOID</div>}

    <div style={S.hdr}>
      <div>
        <div style={S.coName}>{co.name}</div>
        <div style={S.coLine}>{co.address}</div>
        <div style={S.coLine}>{co.email} · {co.phone}{co.trn ? ` · TRN ${co.trn}` : ""}</div>
      </div>
      <div style={S.title}>
        <div style={S.titleTx}>Receipt Voucher</div>
        {/* Says outright what it is not, so it can never be mistaken for the
            commission's tax invoice or used to claim input VAT. */}
        <div style={S.titleSub}>Security Deposit · Not a Tax Invoice</div>
      </div>
    </div>

    <div style={S.meta}>
      <div><div style={S.metaK}>Receipt No.</div><div style={S.metaV}>{R.receiptNumber || "DRAFT"}</div></div>
      <div><div style={S.metaK}>Date</div><div style={S.metaV}>{R.receiptDate ? fmtDate(R.receiptDate) : "—"}</div></div>
      {R.dealRef && <div><div style={S.metaK}>Deal Ref.</div><div style={S.metaV}>{R.dealRef}</div></div>}
    </div>

    <div style={S.box}>
      {rows.map(([k, v], i) => <div key={k} style={{ ...S.row, borderBottom: i === rows.length - 1 ? "none" : S.row.borderBottom }}>
        <div style={S.lbl}>{k}</div><div style={S.val}>{v}</div>
      </div>)}
    </div>

    <div style={S.amtBox}>
      <div style={S.amtK}>Amount Received</div>
      <div style={S.amtV}>{money(R.amount)}</div>
      <div style={S.words}>{depAmountInWords(R.amount)}</div>
    </div>

    {/* The load-bearing paragraph. It states the deposit is refundable (which is
        what makes charging no VAT correct), and says "held on your behalf" rather
        than "escrow" — the funds are not segregated, so claiming escrow would
        claim a separation that does not exist. */}
    <div style={S.note}>
      This amount is received as a <strong>refundable security deposit</strong> and is held on your behalf
      pending completion of the transaction above. It is not consideration for a supply, and
      <strong> no VAT is charged on this receipt</strong>.
      <br />
      On completion the deposit is refunded in full, or our agreed commission is deducted from it and the
      balance refunded. Where commission is deducted, VAT at 5% applies to that commission and a separate
      <strong> tax invoice</strong> will be issued for it.
    </div>

    <div style={S.foot}>
      <div style={{ fontSize: 9, color: "#9CA3AF", maxWidth: 300, lineHeight: 1.5 }}>
        Computer-generated receipt issued by {co.name}.
        {R.receiptNumber ? ` Valid only as ${R.receiptNumber}.` : ""}
      </div>
      <div style={{ textAlign: "center" }}>
        <img src={typeof NASAMA_STAMP_SRC !== "undefined" ? NASAMA_STAMP_SRC : "./nasama-stamp.png"}
          alt="Company Stamp" style={{ width: 132, height: 132, objectFit: "contain", display: "block" }} />
        <div style={S.line} />
        <div style={{ ...S.stampTx, marginTop: 6 }}>Authorized Signatory</div>
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
//  C. DepositsPage
// ═══════════════════════════════════════════════════════════════════
function DepositsPage({ accounts, txns, deals, customers, ledger, journal, persistTxn, settings, userRole }) {
  const [receipts, setReceipts]   = useState([]);
  const [showNew, setShowNew]     = useState(false);
  const [closing, setClosing]     = useState(null);   // the party row being closed out
  const [refunding, setRefunding] = useState(null);
  const [preview, setPreview]     = useState(null);   // receipt doc being previewed
  const [busy, setBusy]           = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({
    date: todayStr(), receivedFrom: "", amount: "", bankCode: "1002",
    deal_id: "", customer_id: "", purpose: "Security Deposit", method: "Bank Transfer", reference: "", memo: "",
  });

  const canCreate = hasPermission(userRole, "sales.create");
  // Closing out and refunding move money and recognise revenue, so they sit
  // behind the accounting permission rather than the sales one.
  const canSettle = hasPermission(userRole, "accounting.create");

  // Own listener on `receipts`, same as invoices.jsx — keeps this module
  // self-contained and leaves the App loader's collection count untouched.
  useEffect(() => {
    if (typeof db === "undefined" || !db) return;
    const unsub = db.collection("receipts").onSnapshot(
      snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error("Receipts listener:", err));
    return () => unsub();
  }, []);

  const acctByCode = useMemo(() => new Map((accounts || []).map(a => [a.code, a])), [accounts]);
  const dealById   = useMemo(() => new Map((deals || []).map(d => [d.id, d])), [deals]);
  const bankAccts  = (accounts || []).filter(a => a.isBank);
  const cashAccts  = (accounts || []).filter(a => a.isCash || (!a.isBank && a.type === "Asset" && a.code === "1001"));

  const sub    = useMemo(() => buildClientFundsLedger({ txns, accounts }), [txns, accounts]);
  const held   = clientFundsHeldTotal(accounts, ledger);
  const missingAcct = !acctByCode.has("2230");

  // Every client-funds receipt, newest first — the rows a receipt is issued from.
  const depositTxns = useMemo(() => (txns || [])
    .filter(t => !t.isVoid && clientFundsMovement(t) === "received")
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")), [txns]);
  const receiptByTxn = useMemo(() => {
    const m = new Map();
    (receipts || []).forEach(r => { if (r.txn_id && r.status !== "void") m.set(r.txn_id, r); });
    return m;
  }, [receipts]);

  const money = c => fmtAED(c);
  const dealLabel = d => d ? `${d.property_name || "—"}${d.unit_no ? ` · Unit ${d.unit_no}` : ""}` : "";

  // ── record a new deposit ──────────────────────────────────────────
  const handleSaveDeposit = async () => {
    const amt = parseFloat(form.amount);
    if (!form.receivedFrom.trim()) { toast("Who paid this? Enter the payer's name", "warning"); return; }
    if (!amt || amt <= 0)          { toast("Enter a valid amount", "warning"); return; }
    setBusy(true);
    try {
      const txn = journal.postClientFunds({
        date: form.date, amount: amt, bankCode: form.bankCode, receivedFrom: form.receivedFrom.trim(),
        customer_id: form.customer_id, deal_id: form.deal_id, purpose: form.purpose, memo: form.memo, commit: false,
      });
      // The receipt document needs these; they are not accounting data, so they
      // ride on the transaction rather than in the ledger lines.
      txn.method = form.method; txn.payment_reference = form.reference;
      await persistTxn(txn);
      toast(`${form.purpose} of ${money(Math.round(amt * 100))} recorded — no VAT, no revenue`, "success");
      setShowNew(false);
      setForm({ date: todayStr(), receivedFrom: "", amount: "", bankCode: "1002", deal_id: "", customer_id: "",
        purpose: "Security Deposit", method: "Bank Transfer", reference: "", memo: "" });
    } catch (err) { toast(err.message, "error"); }
    finally { setBusy(false); }
  };

  // ── issue / reprint the receipt ───────────────────────────────────
  const buildReceiptFrom = (txn, existing) => {
    const deal = txn.deal_id ? dealById.get(txn.deal_id) : null;
    const cfA  = acctByCode.get("2230");
    const amount = (txn.lines || []).reduce((s, l) => l.accountId === cfA?.id ? s + (l.credit || 0) : s, 0);
    const intoLine = (txn.lines || []).find(l => (l.debit || 0) > 0);
    const intoAcct = (accounts || []).find(a => a.id === intoLine?.accountId);
    return {
      ...(existing || {}),
      receiptNumber: existing?.receiptNumber || "",
      receiptDate:   existing?.receiptDate   || txn.date,
      status:        existing?.status        || "draft",
      receivedFrom:  txn.counterparty || "",
      purpose:       txn.purpose || "Security Deposit",
      method:        txn.method || "—",
      reference:     txn.payment_reference || "",
      intoAccountName: intoAcct ? `${intoAcct.code} — ${intoAcct.name}` : "—",
      propertyLabel: dealLabel(deal) || "—",
      dealRef:       deal?.unit_no || "",
      amount, txn_id: txn.id, deal_id: txn.deal_id || "", customer_id: txn.customer_id || "",
    };
  };

  const handleIssueReceipt = async (txn) => {
    const existing = receiptByTxn.get(txn.id);
    if (existing) { setPreview(existing); return; }          // already issued → reprint the same document
    setBusy(true);
    try {
      const { formatted } = await depGenReceiptNumber();
      const doc = { ...buildReceiptFrom(txn), receiptNumber: formatted, status: "issued", issuedAt: depTs() };
      const ref = await db.collection("receipts").add(doc);
      // Stamp the transaction so the list shows ✓ and a second receipt cannot be
      // issued for the same money — mirrors the invoice ↔ receipt link.
      await persistTxn({ ...txn, receipt_id: ref.id, receipt_no: formatted });
      setPreview({ id: ref.id, ...doc });
      toast(`Receipt ${formatted} issued`, "success");
    } catch (err) { toast("Could not issue receipt: " + err.message, "error"); }
    finally { setBusy(false); }
  };

  const handleExportPDF = async () => {
    if (!preview) return;
    const name = `Nasama_Receipt_${preview.receiptNumber || "draft"}.pdf`;
    await invExportPDF("dep-receipt-doc", preview.receiptNumber, name);
  };

  // ── close a deposit out against its deal ──────────────────────────
  const plan = useMemo(() => {
    if (!closing) return null;
    const deal = closing.deal_id ? dealById.get(closing.deal_id) : null;
    // What the deal has already collected elsewhere (Sale Receipt, paid invoice).
    // dealCollection excludes deposits received and refunded, so this is real
    // commission cash only — without it a deal already paid for would have its
    // commission recognised a second time out of the deposit.
    const already = deal ? dealCollection(deal, txns || [], accounts || []).collectedCents : 0;
    return { deal, ...depositCloseoutPlan(deal, closing.held, already) };
  }, [closing, dealById, txns, accounts]);

  const handleCloseout = async () => {
    if (!plan || !closing) return;
    setBusy(true);
    try {
      if (plan.applied > 0) {
        const earned = journal.postClientFundsEarned({
          date: todayStr(), deal: plan.deal, gross: plan.applied / 100, vatRate: plan.vat > 0 ? 5 : 0,
          netCents: plan.vat > 0 ? plan.net : null,   // post the split the user just approved
          commit: false });
        await persistTxn(earned);
      }
      if (plan.refundDue > 0) {
        try {
          const pay = journal.postClientFundsPayout({
            date: todayStr(), amount: plan.refundDue / 100, bankCode: "1002",
            paidTo: closing.counterparty || "Client", deal_id: closing.deal_id,
            customer_id: closing.customer_id,   // must match the deposit's subledger key
            commit: false });
          await persistTxn(pay);
        } catch (payErr) {
          // The two postings are not atomic. Say exactly where it stopped rather
          // than leaving the user to guess whether the commission went through.
          toast(`Commission of ${money(plan.applied)} was recognised, but the ${money(plan.refundDue)} refund FAILED: ${payErr.message}. Post the refund on its own.`, "error");
          setClosing(null); setBusy(false); return;
        }
      }
      toast(plan.applied > 0
        ? `Closed out: ${money(plan.applied)} commission (incl. ${money(plan.vat)} VAT), ${money(plan.refundDue)} refunded`
        : `Refunded ${money(plan.refundDue)} in full — no VAT`, "success");
      setClosing(null);
    } catch (err) { toast(err.message, "error"); }
    finally { setBusy(false); }
  };

  const handleRefundFull = async () => {
    if (!refunding) return;
    setBusy(true);
    try {
      const pay = journal.postClientFundsPayout({
        date: todayStr(), amount: refunding.held / 100, bankCode: "1002",
        paidTo: refunding.counterparty || "Client", deal_id: refunding.deal_id,
        customer_id: refunding.customer_id,   // must match the deposit's subledger key
        commit: false });
      await persistTxn(pay);
      toast(`Refunded ${money(refunding.held)} in full — no VAT, no revenue`, "success");
      setRefunding(null);
    } catch (err) { toast(err.message, "error"); }
    finally { setBusy(false); }
  };

  // ── render ────────────────────────────────────────────────────────
  // A deposit that has been refunded or closed out holds nothing, but the record
  // of having held it must not disappear — "we returned that money" is exactly
  // what someone comes to this page to prove. Settled parties are kept as
  // history, behind a toggle so they never crowd out what is actually open.
  const openParties = sub.parties.filter(p => p.held !== 0);
  const lastActivity = p => (p.txns || []).reduce((mx, t) => (t.date || "") > mx ? (t.date || "") : mx, "");
  const settledParties = useMemo(() => sub.parties.filter(p => p.held === 0)
    .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))), [sub]);

  const partyRow = (p, isHistory) => {
    const deal = p.deal_id ? dealById.get(p.deal_id) : null;
    const muted = isHistory ? { color: "#98A2B3" } : null;
    return <tr key={p.key} style={isHistory ? { background: "#FCFCFD" } : null}>
      <td style={{ ...C.td, fontWeight: 600, ...muted }}>{p.counterparty || "—"}</td>
      <td style={{ ...C.td, ...muted }}>{deal ? <div>
          <div style={{ fontWeight: 600, fontSize: 12, color: isHistory ? "#98A2B3" : "#059669" }}>{deal.property_name}</div>
          {deal.unit_no && <div style={{ fontSize: 11, color: "#9CA3AF" }}>Unit {deal.unit_no}</div>}
        </div> : <span style={{ fontSize: 11, color: isHistory ? "#9CA3AF" : "#D97706" }}>Not linked to a deal</span>}</td>
      <td style={{ ...C.td, textAlign: "right", ...muted }}>{money(p.received)}</td>
      <td style={{ ...C.td, textAlign: "right", color: isHistory ? "#98A2B3" : p.applied ? "#059669" : "#9CA3AF" }}>{money(p.applied)}</td>
      <td style={{ ...C.td, textAlign: "right", color: isHistory ? "#98A2B3" : p.refunded ? "#2563EB" : "#9CA3AF" }}>{money(p.refunded)}</td>
      <td style={{ ...C.td, textAlign: "right", fontWeight: 800, color: "#B91C1C" }}>
        {isHistory
          ? <span style={C.badge("neutral")}>{p.applied > 0 ? "Closed out" : "Refunded"}</span>
          : money(p.held)}
      </td>
      {canSettle && <td style={C.td}>
        {isHistory
          ? <span style={{ fontSize: 11, color: "#C4C7CF" }}>—</span>
          : <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {deal && <button style={{ ...C.btn("secondary", true), fontSize: 11 }} onClick={() => setClosing(p)}>Close deposit</button>}
              <button style={{ ...C.btn("secondary", true), fontSize: 11, borderColor: "#2563EB", color: "#1D4ED8" }} onClick={() => setRefunding(p)}>Refund all</button>
            </div>}
      </td>}
    </tr>;
  };

  return <div>
    <PageHeader title="Client Security Deposits"
      sub={`${money(held)} held on behalf of clients · ${openParties.length} open · account 2230 — not company money`}>
      {canCreate && <button style={C.btn()} onClick={() => setShowNew(true)}>+ New Deposit</button>}
    </PageHeader>

    {missingAcct && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #DC2626", background: "#FEF2F2", color: "#991B1B", fontSize: 13 }}>
      Account <strong>2230 Client Security Deposits Held</strong> is missing from your chart of accounts, so
      deposits cannot be recorded. It is normally created automatically on load — reload the app, or add it
      manually on the Chart of Accounts page as a <strong>Liability</strong> (not bank, not cash).
    </div>}

    {sub.untracked !== 0 && <div style={{ ...C.card, padding: "12px 16px", marginBottom: 14, borderLeft: "4px solid #D97706", background: "#FFFBEB", color: "#92400E", fontSize: 13 }}>
      <strong>{money(sub.untracked)}</strong> of movement on account 2230 is not tagged as a client-funds
      entry, so it does not belong to any client below. That is usually a manual journal posted straight to
      2230 — find it on the Journal Entries page and re-post it as a deposit, or the per-client figures here
      will not add up to the {money(held)} total.
    </div>}

    {/* Held / applied / refunded summary */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
      {[
        ["Still Held", held, "#B91C1C", "Owed back to clients — excluded from available cash"],
        ["Received (all time)", sub.received, "#374151", "Total deposits ever taken in"],
        ["Applied to Commission", sub.applied, "#059669", "Became our revenue at closeout, with VAT"],
        ["Refunded", sub.refunded, "#2563EB", "Returned to clients — no VAT"],
      ].map(([label, val, colour, hint]) => <div key={label} style={{ ...C.card, padding: "14px 16px" }}>
        <div style={{ fontSize: 9.5, color: "#98A2B3", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: colour, marginTop: 5 }}>{money(val)}</div>
        <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
      </div>)}
    </div>

    {/* Open deposits by client / deal */}
    <div style={{ ...C.card, marginBottom: 16, overflowX: "auto" }}>
      <div style={{ padding: "16px 20px 13px", borderBottom: "1px solid #EAECF0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: NAVY }}>
          Deposits — by client / deal
          <span style={{ fontWeight: 400, color: "#98A2B3", fontSize: 12 }}>
            {" — "}{openParties.length} open{settledParties.length > 0 ? `, ${settledParties.length} settled` : ""}
          </span>
        </div>
        {settledParties.length > 0 && <button style={{ ...C.btn("secondary", true), fontSize: 11 }} onClick={() => setShowHistory(v => !v)}>
          {showHistory ? "Hide settled" : `Show ${settledParties.length} settled`}
        </button>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={C.th}>Client</th>
          <th style={C.th}>Deal</th>
          <th style={{ ...C.th, textAlign: "right" }}>Received</th>
          <th style={{ ...C.th, textAlign: "right" }}>Applied</th>
          <th style={{ ...C.th, textAlign: "right" }}>Refunded</th>
          <th style={{ ...C.th, textAlign: "right" }}>Still Held</th>
          {canSettle && <th style={C.th}>Close Out</th>}
        </tr></thead>
        <tbody>
          {openParties.length === 0 && !(showHistory && settledParties.length > 0) &&
            <tr><td colSpan={canSettle ? 7 : 6} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>
              {settledParties.length > 0
                ? <>Nothing is being held right now. {settledParties.length} settled {settledParties.length === 1 ? "deposit is" : "deposits are"} kept as history above.</>
                : <>No deposits are being held. Record one with <strong>+ New Deposit</strong>.</>}
            </td></tr>}
          {openParties.map(p => partyRow(p, false))}
          {showHistory && settledParties.length > 0 && <tr>
            <td colSpan={canSettle ? 7 : 6} style={{ padding: "8px 14px", background: "#F9FAFB", borderTop: "1px solid #EAECF0", borderBottom: "1px solid #EAECF0", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#98A2B3" }}>
              Settled — history only, nothing still held
            </td>
          </tr>}
          {showHistory && settledParties.map(p => partyRow(p, true))}
        </tbody>
      </table>
    </div>

    {/* Every deposit received, with its receipt */}
    <div style={{ ...C.card, overflowX: "auto" }}>
      <div style={{ padding: "16px 20px 13px", borderBottom: "1px solid #EAECF0", fontWeight: 700, fontSize: 13.5, color: NAVY }}>
        Deposits Received <span style={{ fontWeight: 400, color: "#98A2B3", fontSize: 12 }}>— issue the client's receipt here</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={C.th}>Date</th>
          <th style={C.th}>Ref</th>
          <th style={C.th}>Received From</th>
          <th style={C.th}>Being</th>
          <th style={{ ...C.th, textAlign: "right" }}>Amount</th>
          <th style={C.th}>Receipt</th>
        </tr></thead>
        <tbody>
          {depositTxns.length === 0 && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 40, color: "#9CA3AF" }}>Nothing received yet.</td></tr>}
          {depositTxns.map(t => {
            const cfA = acctByCode.get("2230");
            const amt = (t.lines || []).reduce((s, l) => l.accountId === cfA?.id ? s + (l.credit || 0) : s, 0);
            const rc  = receiptByTxn.get(t.id);
            return <tr key={t.id}>
              <td style={C.td}>{fmtDate(t.date)}</td>
              <td style={C.td}><span style={C.badge("neutral")}>{t.ref}</span></td>
              <td style={{ ...C.td, fontWeight: 600 }}>{t.counterparty || "—"}</td>
              <td style={C.td}>{t.purpose || "Security Deposit"}</td>
              <td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{money(amt)}</td>
              <td style={C.td}>
                {rc
                  ? <button style={{ ...C.btn("secondary", true), fontSize: 11, borderColor: "#059669", color: "#047857" }}
                      onClick={() => setPreview(rc)}>✓ {rc.receiptNumber} — view</button>
                  : (canCreate
                      ? <button style={{ ...C.btn(), fontSize: 11 }} disabled={busy} onClick={() => handleIssueReceipt(t)}>Issue receipt</button>
                      : <span style={{ fontSize: 11, color: "#9CA3AF" }}>Not issued</span>)}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {/* ── New deposit modal ── */}
    {showNew && <div style={C.modal} onClick={() => setShowNew(false)}>
      <div style={C.mbox(600)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>New Client Deposit</span>
          <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            Posts <strong>DR Bank / CR 2230 Client Security Deposits Held</strong> — no revenue and
            <strong> no VAT</strong>. This money stays out of available cash until the deal closes.
          </p>
          <div style={C.fg}>
            <div><label style={C.label}>Received From *</label>
              <Inp value={form.receivedFrom} onChange={e => setForm(p => ({ ...p, receivedFrom: e.target.value }))} placeholder="Client / company name" /></div>
            <div><label style={C.label}>Date</label>
              <Inp type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label style={C.label}>Amount (AED) *</label>
              <Inp type="number" step="any" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 200000" /></div>
            <div><label style={C.label}>Being</label>
              <Sel value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}>
                <option>Security Deposit</option><option>Cheque Held</option><option>Funds in Transit</option><option>Client Funds</option>
              </Sel></div>
            <div><label style={C.label}>Payment Method</label>
              <Sel value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>
                <option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>Card / POS</option>
              </Sel></div>
            <div><label style={C.label}>Reference</label>
              <Inp value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="Transfer ref / cheque no." /></div>
            <div><label style={C.label}>Received Into</label>
              <Sel value={form.bankCode} onChange={e => setForm(p => ({ ...p, bankCode: e.target.value }))}>
                {bankAccts.length > 0 && <optgroup label="Bank Accounts">{bankAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
                {cashAccts.length > 0 && <optgroup label="Cash Accounts">{cashAccts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>}
              </Sel></div>
            <div><label style={C.label}>Customer</label>
              <Sel value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                <option value="">— not a registered customer —</option>
                {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel></div>
            <div><label style={C.label}>Against Deal</label>
              <Sel value={form.deal_id} onChange={e => setForm(p => ({ ...p, deal_id: e.target.value }))}>
                <option value="">— none / not yet known —</option>
                {(deals || []).map(d => <option key={d.id} value={d.id}>{d.property_name}{d.unit_no ? ` · ${d.unit_no}` : ""} ({d.type})</option>)}
              </Sel></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={C.label}>Note (optional)</label>
            <Inp value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="Anything worth recording" /></div>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#FFFBEB", borderLeft: "3px solid #D97706", borderRadius: 4, fontSize: 12, color: "#92400E" }}>
            Link it to a deal if you can — the deposit can only be <strong>closed out against the deal's
            commission</strong> when it is linked. Unlinked deposits can still be refunded in full.
          </div>
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setShowNew(false)}>Cancel</button>
          <button style={C.btn()} disabled={busy || missingAcct} onClick={handleSaveDeposit}>{busy ? "Saving…" : "Record deposit"}</button>
        </div>
      </div>
    </div>}

    {/* ── Close-out modal ── */}
    {closing && plan && <div style={C.modal} onClick={() => setClosing(null)}>
      <div style={C.mbox(560)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Close Deposit — {closing.counterparty || "client"}</span>
          <button onClick={() => setClosing(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
            Deducts the commission from the deposit and refunds the balance.
            <strong> VAT applies to the commission only</strong>, and arises now.
          </p>
          {[
            ["Deposit held", money(plan.held), "#B91C1C", null],
            // Shown only when it bites, so the user can see why the deduction is
            // smaller than the deal's headline commission.
            ...(plan.alreadyCollected > 0
              ? [["Already collected on this deal", "− " + money(plan.alreadyCollected), "#9CA3AF",
                  "Netted off below so the same commission is not recognised twice"]]
              : []),
            ["Commission (incl. VAT)", money(plan.applied), "#0F766E",
              plan.deal ? `${plan.deal.property_name} — ${isVatInclusive(plan.deal) ? "VAT included in commission" : plan.deal.vat_applicable ? "VAT added on top" : "no VAT on this deal"}` : null],
            ["  of which net revenue", money(plan.net), "#374151", null],
            ["  of which VAT (5%)", money(plan.vat), "#374151", null],
            ["Refund to client", money(plan.refundDue), "#2563EB", "No VAT on the refund"],
          ].map(([k, v, colour, hint]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid #F3F4F6", gap: 12 }}>
            <div><div style={{ fontSize: 12.5, color: k.startsWith("  ") ? "#9CA3AF" : "#374151", paddingLeft: k.startsWith("  ") ? 14 : 0 }}>{k.trim()}</div>
              {hint && <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 2 }}>{hint}</div>}</div>
            <div style={{ fontWeight: k.startsWith("  ") ? 600 : 800, fontSize: k.startsWith("  ") ? 12.5 : 14, color: colour, whiteSpace: "nowrap" }}>{v}</div>
          </div>)}

          {plan.shortfall > 0 && <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF2F2", borderLeft: "3px solid #DC2626", borderRadius: 4, fontSize: 12.5, color: "#991B1B" }}>
            The deposit does not cover the commission — <strong>{money(plan.shortfall)}</strong> is still to
            collect elsewhere. Only what is held is applied here; the shortfall is not written off.
          </div>}
          {plan.applied === 0 && <div style={{ marginTop: 14, padding: "10px 14px", background: "#F0F9FF", borderLeft: "3px solid #2563EB", borderRadius: 4, fontSize: 12.5, color: "#1E40AF" }}>
            {plan.alreadyCollected > 0 && plan.fullCommission > 0
              ? "This deal's commission has already been collected in full elsewhere, so nothing is deducted — the whole deposit goes back and no VAT arises here."
              : "This deal has no commission recorded, so the whole deposit is refunded and no VAT arises."}
          </div>}
          <div style={{ marginTop: 14, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5 }}>
            Posts {plan.applied > 0 ? "two entries" : "one entry"}: {plan.applied > 0 ? "DR 2230 / CR Revenue + Output VAT (no cash line — the money is already in the bank), then " : ""}
            DR 2230 / CR Bank for the refund. A separate <strong>tax invoice</strong> still has to be issued
            for the commission.
          </div>
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setClosing(null)}>Cancel</button>
          <button style={C.btn()} disabled={busy} onClick={handleCloseout}>{busy ? "Posting…" : "Confirm close-out"}</button>
        </div>
      </div>
    </div>}

    {/* ── Refund-in-full modal ── */}
    {refunding && <div style={C.modal} onClick={() => setRefunding(null)}>
      <div style={C.mbox(460)} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Refund Deposit in Full</span>
          <button onClick={() => setRefunding(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          <p style={{ fontSize: 13, color: "#374151" }}>
            Return <strong>{money(refunding.held)}</strong> to <strong>{refunding.counterparty || "the client"}</strong>?
          </p>
          <p style={{ fontSize: 12.5, color: "#6B7280", marginTop: 10 }}>
            Posts DR 2230 / CR Bank. No commission is recognised and <strong>no VAT arises</strong> — the
            money was never income.
          </p>
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setRefunding(null)}>Cancel</button>
          <button style={C.btn()} disabled={busy} onClick={handleRefundFull}>{busy ? "Posting…" : "Confirm refund"}</button>
        </div>
      </div>
    </div>}

    {/* ── Receipt preview ── */}
    {preview && <div style={C.modal} onClick={() => setPreview(null)}>
      <div style={{ ...C.mbox(860), maxHeight: "94vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Receipt {preview.receiptNumber}</span>
          <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ ...C.mbdy, overflow: "auto", background: "#F3F4F6", display: "flex", justifyContent: "center", padding: 18 }}>
          <div style={{ boxShadow: "0 2px 18px rgba(0,0,0,0.14)" }}>
            <DepositReceiptDoc receipt={preview} settings={settings} />
          </div>
        </div>
        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={() => setPreview(null)}>Close</button>
          <button style={C.btn()} onClick={handleExportPDF}>Download PDF</button>
        </div>
      </div>
    </div>}
  </div>;
}
