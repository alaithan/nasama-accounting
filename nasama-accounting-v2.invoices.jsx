// ╔═══════════════════════════════════════════════════════════════════╗
//  nasama-accounting-v2.invoices.jsx
//  Tax Invoice module — Nasama Properties Accounting v2
//  PDF:     html2canvas + jsPDF loaded via CDN <script> in HTML
//  Globals: db, firebase, uid, toast, GOLD, C, NAVY, NASAMA_WORDMARK_SRC
// ╚═══════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════════
//  A. CONSTANTS & PURE HELPERS
// ═══════════════════════════════════════════════════════════════════
const INV_VAT_RATE = 0.05;
const INV_A4_PX    = 794;   // A4 width at 96 DPI (≡ 210 mm)

function invFmt(n) {
  return Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invFmtDate(iso) {
  if (!iso) return "—";
  const d  = new Date(iso);
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  return `${d.getDate()}/${mo}/${d.getFullYear()}`;
}

function invPad(n) { return String(n || 0).padStart(3, "0"); }

function invLineCalc(commAmount) {
  const c = parseFloat(commAmount) || 0;
  return { vat: +(c * INV_VAT_RATE).toFixed(2), total: +(c * (1 + INV_VAT_RATE)).toFixed(2) };
}

function invTotals(items) {
  const excl = (items || []).reduce((s, li) => s + (parseFloat(li.commissionAmount) || 0), 0);
  const vat  = +(excl * INV_VAT_RATE).toFixed(2);
  return { excl: +excl.toFixed(2), vat, incl: +(excl + vat).toFixed(2) };
}

function invValidate(inv) {
  const e = [];
  if (!inv.invoicedTo?.companyName?.trim())    e.push("Client / Company Name is required");
  if (!(inv.lineItems?.length > 0))            e.push("At least one line item is required");
  (inv.lineItems || []).forEach((li, i) => {
    if (!li.projectUnit?.trim())                e.push(`Row ${i+1}: Project | Unit is required`);
    if (!li.specification?.trim())              e.push(`Row ${i+1}: Specification is required`);
    if (!(parseFloat(li.commissionAmount) > 0)) e.push(`Row ${i+1}: Commission Amount must be > 0`);
  });
  return e;
}

// ═══════════════════════════════════════════════════════════════════
//  B. DATA FACTORIES
// ═══════════════════════════════════════════════════════════════════
function invBlankLine() {
  const _id = (typeof uid === "function")
    ? uid()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { _id, projectUnit: "", specification: "", dealValue: "", commissionAmount: "", dealId: "" };
}

function invBlankDoc(settings) {
  return {
    invoiceNumber:    "",
    invoiceNumberRaw: 0,
    invoiceDate:      new Date().toISOString().split("T")[0],
    status:           "draft",
    billFrom: {
      companyName: settings?.company    || "NASAMA PROPERTIES LLC",
      address:     settings?.address    || "Office 218, Binghatti Emerald, JVC, District 15, Dubai, UAE, P.O. Box: 626-0",
      email:       settings?.email      || "info@nasamaproperties.com",
      contactNo:   settings?.contactNo  || "971 502757603",
      trn:         settings?.trn        || "",
    },
    invoicedTo: { companyName: "", address: "", email: "", contactNo: "", trn: "", customerId: "" },
    lineItems:   [invBlankLine()],
    bankDetails: {
      beneficiaryName: settings?.bankBeneficiary || "NASAMA PROPERTIES L.L.C",
      bankName:        settings?.bankName        || "MASHREQ BANK PSC",
      branchAddress:   settings?.bankBranch      || "DUBAI INTERNET CITY BRANCH",
      accountNumber:   settings?.accountNumber   || "19101303277",
      iban:            settings?.iban            || "AE930330000019101303277",
      swiftCode:       settings?.swiftCode       || "BOMLAEAD",
    },
    totals: { excl: 0, vat: 0, incl: 0 },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  C. FIRESTORE HELPERS
// ═══════════════════════════════════════════════════════════════════
/* Invoice numbers use an atomic Firestore transaction counter at
   meta/invoiceCounter.lastNumber so two simultaneous creates never
   collide. Fallback: timestamp-based 5-digit suffix.            */
async function invGenNumber() {
  const ref = db.collection("meta").doc("invoiceCounter");
  let num = 1;
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      num = snap.exists ? (snap.data().lastNumber || 0) + 1 : 1;
      tx.set(ref, { lastNumber: num }, { merge: true });
    });
  } catch {
    num = parseInt(Date.now().toString().slice(-5));
  }
  return { formatted: invPad(num), raw: num };
}

function invTs() {
  try { return firebase.firestore.FieldValue.serverTimestamp(); }
  catch { return new Date().toISOString(); }
}

// ═══════════════════════════════════════════════════════════════════
//  D. PDF EXPORT  — html2canvas captures the live DOM node;
//     jsPDF splits it into A4 pages if the invoice is tall.
//
//  WHY html2canvas + jsPDF (not pdf-lib):
//  ∙ html2canvas renders the full styled HTML (tables, logo, borders)
//    into a canvas with no manual layout code required.
//  ∙ jsPDF consumes that canvas and outputs a proper PDF.
//  ∙ Both available as CDN UMD bundles, zero build step.
// ═══════════════════════════════════════════════════════════════════
async function invExportPDF(elementId, invoiceNumber) {
  if (!window.html2canvas || !window.jspdf) {
    toast("PDF libraries not loaded. Add the jsPDF + html2canvas CDN scripts to nasama-accounting-v2.html.", "error");
    return false;
  }
  const el = document.getElementById(elementId);
  if (!el) { toast("Preview element not found.", "error"); return false; }

  try {
    const canvas = await window.html2canvas(el, {
      scale:           2,           // 2× for sharp text/borders
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: "#ffffff",
      logging:         false,
      scrollX:         0,
      scrollY:         -window.scrollY,
      windowWidth:     INV_A4_PX,
    });

    const img           = canvas.toDataURL("image/png");
    const { jsPDF }     = window.jspdf;
    const pdf           = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW         = pdf.internal.pageSize.getWidth();  // 210 mm
    const pageH         = pdf.internal.pageSize.getHeight(); // 297 mm
    const imgHeightMM   = (canvas.height / canvas.width) * pageW;

    // Add first page then append additional pages if content overflows
    pdf.addImage(img, "PNG", 0, 0, pageW, imgHeightMM);
    let yUsed = pageH;
    while (yUsed < imgHeightMM) {
      pdf.addPage();
      pdf.addImage(img, "PNG", 0, -yUsed, pageW, imgHeightMM);
      yUsed += pageH;
    }

    pdf.save(`Nasama_Invoice_${invoiceNumber || "draft"}.pdf`);
    return true;
  } catch (err) {
    console.error(err);
    toast("PDF export failed: " + err.message, "error");
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  E. InvoicePreviewDoc — A4 printable invoice layout
//     Used in preview modal AND captured by html2canvas for PDF.
// ═══════════════════════════════════════════════════════════════════
function InvoicePreviewDoc({ invoice }) {
  const { billFrom = {}, invoicedTo = {}, lineItems = [], bankDetails = {}, invoiceNumber, invoiceDate } = invoice;
  const T  = invTotals(lineItems);

  // Design tokens
  const G  = "#C9A044";           // gold
  const GB = "#FBF6EC";           // gold tint bg
  const BD = "#E8DCC8";           // warm border
  const TX = "#1A1A2E";           // primary text
  const SL = "#777";              // secondary text

  const logoSrc = typeof NASAMA_WORDMARK_SRC !== "undefined" ? NASAMA_WORDMARK_SRC : null;

  const S = {
    root:    { width: INV_A4_PX + "px", background: "#fff", fontFamily: "'Segoe UI','Helvetica Neue',Arial,sans-serif", fontSize: 12, color: TX, boxSizing: "border-box" },
    goldBar: { height: 7, background: `linear-gradient(90deg,${G} 0%,#A07830 60%,#5C3F10 100%)` },
    hdr:     { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 38px 18px", borderBottom: `2.5px solid ${G}` },
    rBlock:  { textAlign: "right" },
    title:   { fontSize: 27, fontWeight: 800, letterSpacing: "0.07em", color: TX, lineHeight: 1 },
    mGrid:   { marginTop: 11, display: "grid", gridTemplateColumns: "auto auto", columnGap: 18, rowGap: 3, justifyContent: "end" },
    mLbl:    { fontSize: 11, color: SL, fontWeight: 500 },
    mVal:    { fontSize: 11, color: TX, fontWeight: 700 },
    parties: { display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${BD}`, margin: "20px 38px 0" },
    pL:      { padding: "15px 20px", borderRight: `1px solid ${BD}` },
    pR:      { padding: "15px 20px" },
    pSec:    { fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: G, paddingBottom: 8, borderBottom: `1px solid ${BD}`, marginBottom: 12 },
    pRow:    { display: "flex", gap: 8, marginBottom: 5, fontSize: 11, lineHeight: 1.45 },
    pLbl:    { color: SL, fontWeight: 600, minWidth: 108, flexShrink: 0 },
    pVal:    { color: TX, flex: 1, wordBreak: "break-word" },
    tWrap:   { margin: "20px 38px 0" },
    tTitle:  { fontSize: 9.5, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: G, background: GB, padding: "8px 13px", border: `1px solid ${BD}`, borderBottom: "none" },
    tbl:     { width: "100%", borderCollapse: "collapse", border: `1px solid ${BD}` },
    th:      { background: "#F5EDD8", padding: "9px 10px", fontSize: 10, fontWeight: 700, color: TX, border: `1px solid ${BD}`, letterSpacing: "0.03em", verticalAlign: "middle" },
    td:      { padding: "10px 10px", border: `1px solid ${BD}`, fontSize: 11, color: TX, verticalAlign: "top" },
    tdR:     { textAlign: "right" },
    totRow:  { background: GB },
    totCell: { padding: "10px 10px", border: `1px solid ${BD}`, fontWeight: 700, fontSize: 11, textAlign: "right" },
    totLbl:  { padding: "10px 12px", border: `1px solid ${BD}`, fontWeight: 700, fontSize: 11, color: G, textAlign: "center", letterSpacing: "0.04em" },
    bottom:  { display: "grid", gridTemplateColumns: "1.15fr 0.85fr", border: `1px solid ${BD}`, margin: "20px 38px 0" },
    bBox:    { padding: "15px 20px", borderRight: `1px solid ${BD}` },
    sBox:    { padding: "15px 20px" },
    bRow:    { display: "flex", gap: 6, marginBottom: 6, fontSize: 11 },
    bLbl:    { color: SL, fontWeight: 600, minWidth: 165, flexShrink: 0 },
    bVal:    { color: TX, fontWeight: 500, flex: 1 },
    sRow:    { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${BD}`, fontSize: 12 },
    sLbl:    { color: SL },
    sVal:    { fontWeight: 600, color: TX },
    sFinal:  { display: "flex", justifyContent: "space-between", background: `rgba(201,160,68,.12)`, padding: "10px", marginTop: 8, borderRadius: 5 },
    sFLbl:   { fontWeight: 700, color: TX, fontSize: 12.5 },
    sFVal:   { fontWeight: 800, color: G, fontSize: 15 },
    stamp:   { width: 190, height: 88, border: `1.5px dashed ${G}`, borderRadius: 7, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20 },
    sTxt:    { fontSize: 9.5, color: G, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" },
    foot:    { borderTop: `1px solid ${BD}`, margin: "14px 38px 22px", paddingTop: 9, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#AAAAAA" },
  };

  const partyFields = [["Company Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];
  const invToLabels = [["Client / Company Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];

  return (
    <div style={S.root}>
      {/* Gold bar */}
      <div style={S.goldBar} />

      {/* Header */}
      <div style={S.hdr}>
        <div>
          {logoSrc
            ? <img src={logoSrc} alt="Nasama Properties" style={{ height: 58, maxWidth: 210, display: "block" }} crossOrigin="anonymous" />
            : <div style={{ fontWeight: 800, fontSize: 19, color: G, letterSpacing: "0.08em", lineHeight: 1.3 }}>NASAMA<br /><span style={{ fontSize: 11, fontWeight: 400, color: SL, letterSpacing: "0.2em" }}>PROPERTIES</span></div>
          }
        </div>
        <div style={S.rBlock}>
          <div style={S.title}>TAX INVOICE</div>
          <div style={S.mGrid}>
            <span style={S.mLbl}>Invoice Date</span><span style={S.mVal}>{invFmtDate(invoiceDate)}</span>
            <span style={S.mLbl}>Invoice No.</span><span style={S.mVal}>{invoiceNumber || "—"}</span>
          </div>
        </div>
      </div>

      {/* Parties */}
      <div style={S.parties}>
        <div style={S.pL}>
          <div style={S.pSec}>Bill From</div>
          {partyFields.map(([l, k]) => <div key={k} style={S.pRow}><span style={S.pLbl}>{l}</span><span style={S.pVal}>{billFrom[k] || "—"}</span></div>)}
        </div>
        <div style={S.pR}>
          <div style={S.pSec}>Invoiced To</div>
          {invToLabels.map(([l, k]) => <div key={k} style={S.pRow}><span style={S.pLbl}>{l}</span><span style={S.pVal}>{invoicedTo[k] || "—"}</span></div>)}
        </div>
      </div>

      {/* Description table */}
      <div style={S.tWrap}>
        <div style={S.tTitle}>Description</div>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left", width: "17%" }}>Project | Unit</th>
              <th style={{ ...S.th, textAlign: "left", width: "27%" }}>Specification</th>
              <th style={{ ...S.th, width: "14%" }}>Deal Value</th>
              <th style={{ ...S.th, width: "16%" }}>Commission Amount</th>
              <th style={{ ...S.th, width: "10%" }}>Vat 5%</th>
              <th style={{ ...S.th, width: "16%" }}>Total Amount Incl. Vat</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => {
              const c = invLineCalc(li.commissionAmount);
              return (
                <tr key={li._id || i}>
                  <td style={S.td}>{li.projectUnit}</td>
                  <td style={S.td}>{li.specification}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{li.dealValue ? invFmt(li.dealValue) : "—"}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(li.commissionAmount)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(c.vat)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(c.total)}</td>
                </tr>
              );
            })}
            {lineItems.length < 2 && <tr><td colSpan={6} style={{ ...S.td, height: 32, background: "#FAFAFA" }} /></tr>}
            <tr style={S.totRow}>
              <td colSpan={2} style={S.totLbl}>Total Amount</td>
              <td style={{ ...S.totCell, color: "#AAAAAA" }} />
              <td style={S.totCell}>{invFmt(T.excl)}</td>
              <td style={S.totCell}>{invFmt(T.vat)}</td>
              <td style={S.totCell}>{invFmt(T.incl)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bank Details + Summary */}
      <div style={S.bottom}>
        <div style={S.bBox}>
          <div style={S.pSec}>Bank Details <span style={{ fontStyle: "italic", textTransform: "none", fontSize: 9, fontWeight: 400, color: "#999", letterSpacing: 0 }}>(for Cheque Preparation)</span></div>
          {[["Account Beneficiary Name","beneficiaryName"],["Bank Name","bankName"],["Bank Branch Address","branchAddress"],["Account Number","accountNumber"],["IBAN","iban"],["Swift Code","swiftCode"]].map(([l,k]) => (
            <div key={k} style={S.bRow}><span style={S.bLbl}>{l}</span><span style={S.bVal}>{bankDetails[k] || "—"}</span></div>
          ))}
        </div>
        <div style={S.sBox}>
          <div style={S.pSec}>Tax Invoice Summary: AED</div>
          <div style={S.sRow}><span style={S.sLbl}>Total Amount Excl. Vat</span><span style={S.sVal}>{invFmt(T.excl)}</span></div>
          <div style={{ ...S.sRow, borderBottom: "none" }}><span style={S.sLbl}>Vat (5%)</span><span style={S.sVal}>{invFmt(T.vat)}</span></div>
          <div style={S.sFinal}><span style={S.sFLbl}>Total Amount Incl. Vat</span><span style={S.sFVal}>{invFmt(T.incl)}</span></div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={S.stamp}>
              <div style={S.sTxt}>Company Stamp &amp; Signature</div>
              <div style={{ width: 100, height: 1, background: "#E8DCC8" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={S.foot}>
        <span>NASAMA PROPERTIES LLC · Office 218, Binghatti Emerald, JVC, Dubai, UAE</span>
        <span>TRN: {billFrom.trn || "—"}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  F. InvoicePreviewModal
// ═══════════════════════════════════════════════════════════════════
const INV_PDF_EL = "inv-pdf-capture";

function InvoicePreviewModal({ invoice, onClose }) {
  const [exporting, setExporting] = React.useState(false);

  const handlePDF = async () => {
    setExporting(true);
    await invExportPDF(INV_PDF_EL, invoice.invoiceNumber);
    setExporting(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1200, display: "flex", flexDirection: "column", backdropFilter: "blur(5px)" }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, background: "#07090F", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px" }}>
        <div style={{ color: "#EDE6D4", fontWeight: 700, fontSize: 15 }}>
          Tax Invoice Preview
          {invoice.invoiceNumber && <span style={{ marginLeft: 10, fontSize: 13, color: "#C9A044", fontFamily: "monospace" }}>#{invoice.invoiceNumber}</span>}
          {invoice.status === "draft" && <span style={{ marginLeft: 8, fontSize: 11, background: "#92400E22", color: "#D97706", border: "1px solid #D9770640", borderRadius: 4, padding: "2px 7px" }}>DRAFT</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={{ background: exporting ? "#7A6020" : "#C9A044", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exporting ? "not-allowed" : "pointer" }}
            onClick={handlePDF}
            disabled={exporting}
          >
            {exporting ? "Generating PDF…" : "⬇ Export PDF"}
          </button>
          <button style={C.btn("secondary")} onClick={onClose}>Close</button>
        </div>
      </div>
      {/* Scrollable preview */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "28px 24px", background: "#0D1022" }}>
        <div style={{ display: "inline-block", boxShadow: "0 16px 56px rgba(0,0,0,.7)", borderRadius: 3, minWidth: INV_A4_PX + "px" }}>
          <div id={INV_PDF_EL}>
            <InvoicePreviewDoc invoice={invoice} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  G. InvoiceEditor — create / edit form
// ═══════════════════════════════════════════════════════════════════
function InvoiceEditor({ invoice, customers, deals, settings, onSave, onPreview, onCancel, saving }) {
  const [inv, setInv] = React.useState(() => JSON.parse(JSON.stringify(invoice)));
  const T = invTotals(inv.lineItems || []);

  // Deep-set helper for dotted paths (e.g. "billFrom.trn")
  const setPath = (dotPath, val) => setInv(prev => {
    const copy = JSON.parse(JSON.stringify(prev));
    const keys = dotPath.split(".");
    let obj = copy;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = val;
    return copy;
  });

  // Auto-fill Invoiced To from customer record
  const fillCustomer = (id) => {
    const c = (customers || []).find(x => x.id === id);
    if (!c) { setPath("invoicedTo.customerId", ""); return; }
    setInv(p => ({ ...p, invoicedTo: { companyName: c.name || "", address: c.address || "", email: c.email || "", contactNo: c.phone || c.contactNo || "", trn: c.trn || "", customerId: c.id } }));
  };

  // Auto-fill line item from deal record
  const fillDeal = (idx, dealId) => {
    const d = (deals || []).find(x => x.id === dealId);
    if (!d) return;
    const projectUnit = [d.property_name, d.unit_no ? `Unit ${d.unit_no}` : ""].filter(Boolean).join(" — ");
    const pct         = d.commission_pct ? `${d.commission_pct}%` : "3%";
    setInv(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      Object.assign(copy.lineItems[idx], { projectUnit, specification: `${pct} of Agency Commission Claim`, dealValue: d.transaction_value || "", commissionAmount: d.expected_commission_net || "", dealId });
      return copy;
    });
  };

  const addLine    = ()      => setInv(p => ({ ...p, lineItems: [...p.lineItems, invBlankLine()] }));
  const removeLine = (i)     => setInv(p => ({ ...p, lineItems: p.lineItems.filter((_, j) => j !== i) }));
  const setLine    = (i, f, v) => setInv(prev => { const copy = JSON.parse(JSON.stringify(prev)); copy.lineItems[i][f] = v; return copy; });

  // Style tokens
  const G    = "#C9A044";
  const card = { background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, padding: "22px 26px", marginBottom: 20, boxShadow: "0 1px 3px rgba(16,24,40,.06)" };
  const sec  = { fontSize: 11, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: G, paddingBottom: 11, borderBottom: "1px solid #F0E8D8", marginBottom: 18 };
  const lbl  = { fontSize: 11.5, fontWeight: 600, color: "#344054", marginBottom: 5, display: "block" };
  const inp  = { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1A1A2E", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color .15s" };
  const ro   = { ...inp, background: "#F9FAFB", color: "#6B7280" };
  const sel  = { ...inp, cursor: "pointer" };
  const g2   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" };
  const g3   = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" };

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", paddingBottom: 52 }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button style={{ ...C.btn("secondary"), padding: "6px 14px" }} onClick={onCancel}>← Back</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1A1A2E" }}>
              {inv.invoiceNumber ? `Invoice #${inv.invoiceNumber}` : "New Invoice"}
            </h2>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              {inv.status === "issued" ? "Issued" : "Draft — fill in the details below"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={C.btn("secondary")} onClick={() => onPreview({ ...inv, totals: T })}>Preview</button>
          <button style={C.btn()} onClick={() => onSave({ ...inv, totals: T }, "draft")} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
          <button style={{ background: G, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => onSave({ ...inv, totals: T }, "issued")} disabled={saving}>{saving ? "Issuing…" : "Issue Invoice"}</button>
        </div>
      </div>

      {/* ── Invoice Details ── */}
      <div style={card}>
        <div style={sec}>Invoice Details</div>
        <div style={g3}>
          <div><label style={lbl}>Invoice No.</label><input style={ro} value={inv.invoiceNumber} readOnly /></div>
          <div><label style={lbl}>Invoice Date</label><input type="date" style={inp} value={inv.invoiceDate} onChange={e => setPath("invoiceDate", e.target.value)} /></div>
          <div>
            <label style={lbl}>Status</label>
            <select style={sel} value={inv.status} onChange={e => setPath("status", e.target.value)}>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Bill From / Invoiced To ── */}
      <div style={{ ...g2, marginBottom: 20 }}>
        {/* Bill From */}
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={sec}>Bill From</div>
          {[["companyName","Company Name"],["address","Address"],["email","Email"],["contactNo","Contact No."],["trn","TRN"]].map(([f,l]) => (
            <div key={f} style={{ marginBottom: 13 }}>
              <label style={lbl}>{l}</label>
              <input style={inp} value={inv.billFrom?.[f] || ""} onChange={e => setPath(`billFrom.${f}`, e.target.value)} />
            </div>
          ))}
        </div>

        {/* Invoiced To */}
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={sec}>Invoiced To</div>
          <div style={{ marginBottom: 13 }}>
            <label style={lbl}>Select Existing Client (auto-fill)</label>
            <select style={sel} value={inv.invoicedTo?.customerId || ""} onChange={e => fillCustomer(e.target.value)}>
              <option value="">— Choose a client —</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {[["companyName","Client / Company Name"],["address","Address"],["email","Email"],["contactNo","Contact No."],["trn","TRN"]].map(([f,l]) => (
            <div key={f} style={{ marginBottom: 13 }}>
              <label style={lbl}>{l}</label>
              <input style={inp} value={inv.invoicedTo?.[f] || ""} onChange={e => setPath(`invoicedTo.${f}`, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Line Items ── */}
      <div style={card}>
        <div style={{ ...sec, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Description</span>
          <button style={{ ...C.btn("secondary"), fontSize: 11, padding: "4px 14px", textTransform: "none", letterSpacing: 0 }} onClick={addLine}>+ Add Row</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FBF6EC" }}>
                {[["Project | Unit","left","22%"],["Specification","left","25%"],["Deal Value (AED)","right","11%"],["Commission (AED)","right","13%"],["Vat 5%","right","9%"],["Total Incl. Vat","right","13%"],["","center","4%"]].map(([h,a,w]) => (
                  <th key={h} style={{ padding: "9px 10px", fontSize: 10.5, fontWeight: 700, color: "#1A1A2E", border: "1px solid #E8DCC8", textAlign: a, width: w, letterSpacing: "0.02em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li, idx) => {
                const c = invLineCalc(li.commissionAmount);
                return (
                  <tr key={li._id}>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      {(deals && deals.length > 0) && (
                        <select style={{ ...sel, fontSize: 11, marginBottom: 6, padding: "5px 8px" }} value={li.dealId || ""} onChange={e => fillDeal(idx, e.target.value)}>
                          <option value="">— Pick deal to auto-fill —</option>
                          {deals.map(d => <option key={d.id} value={d.id}>{d.property_name}{d.unit_no ? ` · ${d.unit_no}` : ""}</option>)}
                        </select>
                      )}
                      <input style={{ ...inp, fontSize: 12 }} placeholder="Project name / unit no." value={li.projectUnit} onChange={e => setLine(idx, "projectUnit", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <input style={{ ...inp, fontSize: 12 }} placeholder="e.g. 3% Agency Commission Claim" value={li.specification} onChange={e => setLine(idx, "specification", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <input type="number" min="0" style={{ ...inp, fontSize: 12, textAlign: "right" }} placeholder="0.00" value={li.dealValue} onChange={e => setLine(idx, "dealValue", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <input type="number" min="0" style={{ ...inp, fontSize: 12, textAlign: "right" }} placeholder="0.00" value={li.commissionAmount} onChange={e => setLine(idx, "commissionAmount", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", textAlign: "right", color: "#6B7280", fontSize: 12, verticalAlign: "middle" }}>{invFmt(c.vat)}</td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", textAlign: "right", fontWeight: 700, fontSize: 12, verticalAlign: "middle" }}>{invFmt(c.total)}</td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", textAlign: "center", verticalAlign: "middle" }}>
                      {inv.lineItems.length > 1 && (
                        <button onClick={() => removeLine(idx)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 19, lineHeight: 1, padding: 2 }}>×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <div style={{ width: 340, border: "1px solid #E8DCC8", borderRadius: 10, overflow: "hidden" }}>
            {[["Total Amount Excl. Vat", invFmt(T.excl)], ["VAT (5%)", invFmt(T.vat)]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "9px 16px", borderBottom: "1px solid #E8DCC8", fontSize: 13 }}>
                <span style={{ color: "#6B7280" }}>{l}</span>
                <span style={{ fontWeight: 600 }}>AED {v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#FBF6EC", fontSize: 14 }}>
              <span style={{ fontWeight: 700 }}>Total Incl. Vat</span>
              <span style={{ fontWeight: 800, color: G }}>AED {invFmt(T.incl)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bank Details ── */}
      <div style={card}>
        <div style={sec}>Bank Details <span style={{ fontStyle: "italic", textTransform: "none", fontSize: 10, fontWeight: 400, color: "#9CA3AF", letterSpacing: 0 }}>(for Cheque Preparation)</span></div>
        <div style={g3}>
          {[["beneficiaryName","Account Beneficiary Name"],["bankName","Bank Name"],["branchAddress","Bank Branch Address"],["accountNumber","Account Number"],["iban","IBAN"],["swiftCode","Swift Code"]].map(([f,l]) => (
            <div key={f}><label style={lbl}>{l}</label><input style={inp} value={inv.bankDetails?.[f] || ""} onChange={e => setPath(`bankDetails.${f}`, e.target.value)} /></div>
          ))}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button style={C.btn("secondary")} onClick={onCancel}>Cancel</button>
        <button style={C.btn("secondary")} onClick={() => onPreview({ ...inv, totals: T })}>Preview Invoice</button>
        <button style={C.btn()} onClick={() => onSave({ ...inv, totals: T }, "draft")} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
        <button style={{ background: G, color: "#fff", border: "none", padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => onSave({ ...inv, totals: T }, "issued")} disabled={saving}>{saving ? "Issuing…" : "Issue Invoice"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  H. InvoicePage — list + orchestration
// ═══════════════════════════════════════════════════════════════════
function InvoicePage({ customers, deals, settings, userEmail }) {
  const [invoices,   setInvoices]   = React.useState([]);
  const [editing,    setEditing]    = React.useState(null);
  const [previewInv, setPreviewInv] = React.useState(null);
  const [loading,    setLoading]    = React.useState(true);
  const [saving,     setSaving]     = React.useState(false);

  // Real-time Firestore listener
  React.useEffect(() => {
    const unsub = db.collection("invoices")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        snap => { setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
        err  => { console.error(err); setLoading(false); }
      );
    return () => unsub();
  }, []);

  const handleNew = async () => {
    const { formatted, raw } = await invGenNumber();
    const doc = invBlankDoc(settings);
    doc.invoiceNumber    = formatted;
    doc.invoiceNumberRaw = raw;
    setEditing(doc);
  };

  const handleSave = async (inv, status) => {
    if (status === "issued") {
      const errs = invValidate(inv);
      if (errs.length) { errs.forEach(e => toast(e, "error")); return; }
    }
    setSaving(true);
    try {
      const payload = { ...inv, status, updatedAt: invTs(), createdBy: userEmail };
      if (inv.id) {
        await db.collection("invoices").doc(inv.id).set(payload, { merge: true });
      } else {
        const ref = await db.collection("invoices").add({ ...payload, createdAt: invTs() });
        inv.id = ref.id;
      }
      toast(status === "issued" ? "Invoice issued" : "Draft saved", "success");
      setEditing(null);
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this invoice permanently?")) return;
    await db.collection("invoices").doc(id).delete();
    toast("Invoice deleted", "success");
  };

  // Editor view
  if (editing) return (
    <>
      <InvoiceEditor
        invoice={editing}
        customers={customers || []}
        deals={deals || []}
        settings={settings || {}}
        onSave={handleSave}
        onPreview={inv => setPreviewInv(inv)}
        onCancel={() => setEditing(null)}
        saving={saving}
      />
      {previewInv && <InvoicePreviewModal invoice={previewInv} onClose={() => setPreviewInv(null)} />}
    </>
  );

  // List view
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Tax Invoices</h2>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#6B7280" }}>Create, manage, and export professional UAE tax invoices</p>
        </div>
        <button style={C.btn()} onClick={handleNew}>+ New Invoice</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 64, color: "#9CA3AF" }}>Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 22 }}>Create your first invoice to get started</div>
          <button style={C.btn()} onClick={handleNew}>+ New Invoice</button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #EAECF0" }}>
                {[["Invoice No.",""],["Date",""],["Client / Company",""],["Excl. VAT","right"],["VAT","right"],["Total Incl. VAT","right"],["Status",""],["Actions",""]].map(([h,a]) => (
                  <th key={h} style={{ ...C.th, textAlign: a || "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                  <td style={C.td}><strong style={{ color: "#C9A044", fontFamily: "monospace", fontSize: 13 }}>{inv.invoiceNumber}</strong></td>
                  <td style={C.td}>{invFmtDate(inv.invoiceDate)}</td>
                  <td style={C.td}>{inv.invoicedTo?.companyName || "—"}</td>
                  <td style={{ ...C.td, textAlign: "right" }}>{invFmt(inv.totals?.excl)}</td>
                  <td style={{ ...C.td, textAlign: "right", color: "#6B7280" }}>{invFmt(inv.totals?.vat)}</td>
                  <td style={{ ...C.td, textAlign: "right", fontWeight: 700, color: "#C9A044" }}>{invFmt(inv.totals?.incl)}</td>
                  <td style={C.td}><span style={C.badge(inv.status === "issued" ? "success" : "warning")}>{inv.status === "issued" ? "Issued" : "Draft"}</span></td>
                  <td style={C.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing({ ...inv })}>Edit</button>
                      <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => setPreviewInv(inv)}>Preview</button>
                      <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#DC2626" }} onClick={() => handleDelete(inv.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewInv && <InvoicePreviewModal invoice={previewInv} onClose={() => setPreviewInv(null)} />}
    </div>
  );
}
