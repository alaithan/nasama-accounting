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
const INV_START_NUMBER = 94;
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

function invNum(v) {
  var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/,/g, ""));
  return isFinite(n) && !isNaN(n) ? n : 0;
}

function invFromCents(v) {
  return parseFloat((invNum(v) / 100).toFixed(2));
}

function invCleanCompanyAddress(address) {
  return String(address || "")
    .replace(/,\s*P\.?\s*O\.?\s*Box\s*:?\s*626-?0\s*$/i, "")
    .replace(/\s*P\.?\s*O\.?\s*Box\s*:?\s*626-?0\s*/i, "")
    .trim();
}

// Returns commission amount in AED: dealValue × (commissionPct / 100)
// e.g. pct = 7 means 7%  →  dealValue × 0.07
function invCommissionAmount(line) {
  if (!line) return 0;
  var dv  = invNum(line.dealValue);
  // Prefer commissionPct; fall back to commission_pct only if commissionPct is absent/blank
  var rawPct = (line.commissionPct !== undefined && line.commissionPct !== null && String(line.commissionPct).trim() !== "")
               ? line.commissionPct
               : line.commission_pct;
  var pct = invNum(rawPct);
  if (dv > 0 && pct > 0) return parseFloat((dv * pct / 100).toFixed(2));
  return 0;
}

function invLineCalc(line) {
  var c = invCommissionAmount(line);
  return { commissionAmount: c, vat: parseFloat((c * INV_VAT_RATE).toFixed(2)), total: parseFloat((c * (1 + INV_VAT_RATE)).toFixed(2)) };
}

function invTotals(items) {
  var excl = 0;
  (items || []).forEach(function(li) { excl += invCommissionAmount(li); });
  excl = parseFloat(excl.toFixed(2));
  var vat  = parseFloat((excl * INV_VAT_RATE).toFixed(2));
  return { excl: excl, vat: vat, incl: parseFloat((excl + vat).toFixed(2)) };
}

function invNormalizeLine(line) {
  var calc = invLineCalc(line);
  var pct  = (line.commissionPct !== undefined && line.commissionPct !== null && String(line.commissionPct).trim() !== "")
             ? line.commissionPct
             : (line.commission_pct || "");
  return Object.assign({}, line, { commissionPct: pct, commissionAmount: calc.commissionAmount });
}

function invWithDerivedTotals(inv) {
  const lineItems = (inv.lineItems || []).map(invNormalizeLine);
  return { ...inv, lineItems, totals: invTotals(lineItems) };
}

function invValidate(inv) {
  var e = [];
  if (!inv.invoicedTo || !(inv.invoicedTo.companyName || "").trim()) e.push("Developer / Client name is required");
  if (!inv.lineItems || inv.lineItems.length === 0)                  e.push("At least one line item is required");
  (inv.lineItems || []).forEach(function(li, i) {
    if (!(li.projectUnit  || "").trim()) e.push("Row " + (i+1) + ": Project | Unit is required");
    if (!(li.specification || "").trim()) e.push("Row " + (i+1) + ": Specification is required");
    if (!(invNum(li.dealValue) > 0))      e.push("Row " + (i+1) + ": Deal Value must be > 0");
    if (!(invNum(li.commissionPct) > 0 || invNum(li.commission_pct) > 0)) e.push("Row " + (i+1) + ": Commission % must be > 0");
    if (!(invCommissionAmount(li) > 0))   e.push("Row " + (i+1) + ": Commission Amount must be > 0");
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
  return { _id, projectUnit: "", specification: "", dealValue: "", commissionPct: "", commissionAmount: "", dealId: "" };
}

function invBlankDoc(settings) {
  return {
    invoiceNumber:    "",
    invoiceNumberRaw: 0,
    invoiceDate:      new Date().toISOString().split("T")[0],
    status:           "draft",
    billFrom: {
      companyName: settings?.company    || "NASAMA PROPERTIES LLC",
      address:     settings?.address    || "Office 218, Binghatti Emerald, JVC, District 15, Dubai, UAE",
      email:       settings?.email      || "info@nasamaproperties.com",
      contactNo:   settings?.contactNo  || "971 502757603",
      trn:         settings?.trn        || "",
    },
    invoicedTo: { companyName: "", address: "", email: "", contactNo: "", trn: "", partyType: "", partyId: "", customerId: "", developerId: "" },
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
  let num = INV_START_NUMBER;
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      num = snap.exists ? Math.max((snap.data().lastNumber || 0) + 1, INV_START_NUMBER) : INV_START_NUMBER;
      tx.set(ref, { lastNumber: num }, { merge: true });
    });
  } catch (err) {
    num = Math.max(parseInt(Date.now().toString().slice(-5)), INV_START_NUMBER);
  }
  return { formatted: invPad(num), raw: num };
}

function invTs() {
  try { return firebase.firestore.FieldValue.serverTimestamp(); }
  catch (err) { return new Date().toISOString(); }
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
    // Only add extra pages when content genuinely overflows (>2 mm tolerance
    // prevents a near-empty trailing page from tiny render rounding)
    if (imgHeightMM > pageH + 2) {
      let yUsed = pageH;
      while (yUsed < imgHeightMM - 2) {
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, -yUsed, pageW, imgHeightMM);
        yUsed += pageH;
      }
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

  const logoSrc = typeof NASAMA_WORDMARK_SRC !== "undefined" ? NASAMA_WORDMARK_SRC : null;

  const G = "#B58A2A";
  const CHAR = "#252833";
  const INK = "#1E2028";
  const MUT = "#6F6A60";
  const LINE = "#DDD4C4";
  const SOFT = "#F8F4EC";
  const SOFT2 = "#FBFAF7";

  const P = {
    root: { width: INV_A4_PX + "px", background: "#FFFFFF", fontFamily: "'Segoe UI','Helvetica Neue',Arial,sans-serif", fontSize: 11.2, color: INK, boxSizing: "border-box", position: "relative", overflow: "hidden" },
    leftChar: { position: "absolute", left: -82, top: 0, width: 164, height: 348, background: CHAR, borderBottomRightRadius: 180, zIndex: 0 },
    leftGold: { position: "absolute", left: -58, top: 132, width: 82, height: 392, background: G, borderTopRightRadius: 90, borderBottomRightRadius: 90, zIndex: 0 },
    rightChar: { position: "absolute", right: -86, bottom: 0, width: 170, height: 364, background: CHAR, borderTopLeftRadius: 190, zIndex: 0 },
    rightGold: { position: "absolute", right: -54, bottom: 132, width: 74, height: 250, background: G, borderTopLeftRadius: 82, borderBottomLeftRadius: 82, zIndex: 0 },
    hairline: { position: "absolute", left: 44, right: 44, top: 144, height: 1, background: LINE, zIndex: 0 },
    watermark: { position: "absolute", left: 118, right: 118, top: 430, textAlign: "center", fontSize: 76, fontWeight: 800, letterSpacing: "0.16em", color: G, opacity: 0.035, zIndex: 0, pointerEvents: "none" },
    content: { position: "relative", zIndex: 1, padding: "42px 44px 28px 58px", boxSizing: "border-box" },
    hdr: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28, paddingBottom: 24 },
    logoWrap: { paddingTop: 4 },
    logo: { width: 244, maxHeight: 82, objectFit: "contain", display: "block" },
    fallbackLogo: { fontWeight: 800, fontSize: 22, color: G, letterSpacing: "0.16em", lineHeight: 1.18 },
    titleBlock: { textAlign: "right", minWidth: 244 },
    title: { fontSize: 34, fontWeight: 800, color: CHAR, lineHeight: 0.95, letterSpacing: "0.08em", marginBottom: 15 },
    metaBox: { display: "grid", gridTemplateColumns: "102px 126px", marginLeft: "auto", borderTop: "3px solid " + G, background: SOFT2, boxShadow: "inset 0 0 0 1px " + LINE },
    mLbl: { padding: "8px 10px", color: MUT, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", borderBottom: "1px solid " + LINE },
    mVal: { padding: "8px 10px", color: INK, fontSize: 11.5, fontWeight: 800, textAlign: "right", borderBottom: "1px solid " + LINE, fontVariantNumeric: "tabular-nums" },
    introRule: { display: "flex", alignItems: "center", gap: 12, margin: "0 0 20px" },
    ruleGold: { width: 96, height: 4, background: G },
    ruleChar: { flex: 1, height: 1, background: LINE },
    parties: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 },
    partyCard: { background: "rgba(255,255,255,0.96)", border: "1px solid " + LINE, borderTop: "4px solid " + G, padding: "15px 17px 13px", minHeight: 156, boxSizing: "border-box" },
    secTitle: { color: CHAR, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 11, display: "flex", alignItems: "center", gap: 9 },
    secTick: { width: 20, height: 2, background: G, display: "inline-block" },
    pRow: { display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, padding: "4px 0", borderBottom: "1px solid #EFE8DA", lineHeight: 1.35 },
    pLbl: { color: MUT, fontSize: 10.3, fontWeight: 700 },
    pVal: { color: INK, fontSize: 10.8, fontWeight: 600, wordBreak: "break-word" },
    tableTitle: { background: "linear-gradient(90deg," + G + " 0%,#8C6518 100%)", color: "#FFFFFF", padding: "9px 13px", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" },
    tbl: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderLeft: "1px solid " + LINE, borderRight: "1px solid " + LINE, borderBottom: "1px solid " + LINE },
    th: { background: SOFT, color: CHAR, padding: "9px 8px", borderBottom: "1px solid " + LINE, borderRight: "1px solid " + LINE, fontSize: 9.4, fontWeight: 800, letterSpacing: "0.025em", verticalAlign: "middle", lineHeight: 1.25 },
    td: { padding: "10px 8px", borderBottom: "1px solid #ECE3D4", borderRight: "1px solid #ECE3D4", fontSize: 10.3, color: INK, verticalAlign: "middle", lineHeight: 1.35, wordBreak: "break-word" },
    tdR: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "normal" },
    totalLabel: { background: "#F1E8D6", color: CHAR, padding: "10px 12px", borderRight: "1px solid " + LINE, fontWeight: 800, fontSize: 10.8, letterSpacing: "0.08em", textTransform: "uppercase" },
    totalCell: { background: "#F1E8D6", padding: "10px 8px", borderRight: "1px solid " + LINE, fontWeight: 800, fontSize: 10.5, textAlign: "right", fontVariantNumeric: "tabular-nums" },
    lower: { display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18, marginTop: 22 },
    bankBox: { border: "1px solid " + LINE, background: "#FFFFFF", padding: "16px 17px" },
    bankTitle: { color: CHAR, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.13em", borderBottom: "1px solid " + LINE, paddingBottom: 9, marginBottom: 10 },
    bankNote: { color: MUT, fontSize: 9.5, fontStyle: "italic", fontWeight: 500, letterSpacing: 0, textTransform: "none" },
    bRow: { display: "grid", gridTemplateColumns: "158px 1fr", gap: 10, padding: "4px 0", lineHeight: 1.35 },
    bLbl: { color: MUT, fontWeight: 700, fontSize: 10.2 },
    bVal: { color: INK, fontWeight: 600, fontSize: 10.4, wordBreak: "break-word" },
    summaryBox: { border: "1px solid " + LINE, background: SOFT2, padding: 0, overflow: "hidden" },
    sumHead: { background: CHAR, color: "#FFFFFF", padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em" },
    sumBody: { padding: "12px 14px 14px" },
    sRow: { display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid " + LINE, fontSize: 11.2 },
    sLbl: { color: MUT, fontWeight: 700 },
    sVal: { color: INK, fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums" },
    sFinal: { display: "flex", justifyContent: "space-between", gap: 14, marginTop: 10, padding: "11px 12px", background: G, color: "#FFFFFF" },
    sFLbl: { fontWeight: 800, fontSize: 11.5 },
    sFVal: { fontWeight: 900, fontSize: 14, textAlign: "right", fontVariantNumeric: "tabular-nums" },
    stampRow: { display: "flex", justifyContent: "flex-end", marginTop: 20 },
    stamp: { width: 238, height: 94, border: "1.5px dashed " + G, background: "rgba(255,255,255,0.74)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 13 },
    stampTxt: { color: CHAR, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" },
    stampLine: { width: 132, height: 1, background: LINE },
    foot: { marginTop: 22, paddingTop: 10, borderTop: "1px solid " + LINE, display: "flex", justifyContent: "space-between", gap: 18, color: MUT, fontSize: 9.6, lineHeight: 1.35 },
  };

  const pFields = [["Company Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];
  const iFields = [["Developer / Client Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];
  const bankRows = [["Account Beneficiary Name","beneficiaryName"],["Bank Name","bankName"],["Bank Branch Address","branchAddress"],["Account Number","accountNumber"],["IBAN","iban"],["Swift Code","swiftCode"]];

  return (
    <div style={P.root}>
      <div style={P.leftChar} />
      <div style={P.leftGold} />
      <div style={P.rightChar} />
      <div style={P.rightGold} />
      <div style={P.hairline} />
      <div style={P.watermark}>NASAMA</div>

      <div style={P.content}>
        <div style={P.hdr}>
          <div style={P.logoWrap}>
            {logoSrc
              ? <img src={logoSrc} alt="Nasama Properties" style={P.logo} crossOrigin="anonymous" />
              : <div style={P.fallbackLogo}>NASAMA<br /><span style={{ fontSize: 11, color: MUT, letterSpacing: "0.28em" }}>PROPERTIES</span></div>
            }
          </div>
          <div style={P.titleBlock}>
            <div style={P.title}>TAX INVOICE</div>
            <div style={P.metaBox}>
              <span style={P.mLbl}>Invoice Date</span><span style={P.mVal}>{invFmtDate(invoiceDate)}</span>
              <span style={{ ...P.mLbl, borderBottom: "none" }}>Invoice No.</span><span style={{ ...P.mVal, borderBottom: "none" }}>{invoiceNumber || "--"}</span>
            </div>
          </div>
        </div>

        <div style={P.introRule}><div style={P.ruleGold} /><div style={P.ruleChar} /></div>

        <div style={P.parties}>
          <div style={P.partyCard}>
            <div style={P.secTitle}><span style={P.secTick} />BILL FROM</div>
            {pFields.map(([l, k]) => (
              <div key={k} style={P.pRow}><span style={P.pLbl}>{l}</span><span style={P.pVal}>{(k === "address" ? invCleanCompanyAddress(billFrom[k]) : billFrom[k]) || "--"}</span></div>
            ))}
          </div>
          <div style={P.partyCard}>
            <div style={P.secTitle}><span style={P.secTick} />INVOICED TO</div>
            {iFields.map(([l, k]) => (
              <div key={k} style={P.pRow}><span style={P.pLbl}>{l}</span><span style={P.pVal}>{invoicedTo[k] || "--"}</span></div>
            ))}
          </div>
        </div>

        <div>
          <div style={P.tableTitle}>DESCRIPTION</div>
          <table style={P.tbl}>
            <thead>
              <tr>
                <th style={{ ...P.th, textAlign: "left", width: "16%" }}>Project | Unit</th>
                <th style={{ ...P.th, textAlign: "left", width: "24%" }}>Specification</th>
                <th style={{ ...P.th, width: "13%", textAlign: "right" }}>Deal Value</th>
                <th style={{ ...P.th, width: "10%", textAlign: "right" }}>Commission %</th>
                <th style={{ ...P.th, width: "13%", textAlign: "right" }}>Commission Amount</th>
                <th style={{ ...P.th, width: "10%", textAlign: "right" }}>Vat 5%</th>
                <th style={{ ...P.th, width: "14%", textAlign: "right", borderRight: "none" }}>Total Amount Incl. Vat</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => {
                const c = invLineCalc(li);
                const pct = li.commissionPct ?? li.commission_pct;
                return (
                  <tr key={li._id || i}>
                    <td style={P.td}>{li.projectUnit || "--"}</td>
                    <td style={P.td}>{li.specification || "--"}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{li.dealValue ? invFmt(li.dealValue) : "--"}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{pct ? `${invNum(pct)}%` : "--"}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{invFmt(c.commissionAmount)}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{invFmt(c.vat)}</td>
                    <td style={{ ...P.td, ...P.tdR, borderRight: "none", fontWeight: 800 }}>{invFmt(c.total)}</td>
                  </tr>
                );
              })}
              {lineItems.length < 2 && <tr><td colSpan={7} style={{ ...P.td, height: 30, background: "#FCFAF6", borderRight: "none" }} /></tr>}
              <tr>
                <td colSpan={2} style={P.totalLabel}>Total Amount</td>
                <td style={{ ...P.totalCell, color: "#AAAAAA", fontSize: 9 }}>—</td>
                <td style={{ ...P.totalCell, color: "#AAAAAA", fontSize: 9 }}>—</td>
                <td style={P.totalCell}>{invFmt(T.excl)}</td>
                <td style={P.totalCell}>{invFmt(T.vat)}</td>
                <td style={{ ...P.totalCell, borderRight: "none", color: G }}>{invFmt(T.incl)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={P.lower}>
          <div>
            <div style={P.bankBox}>
              <div style={P.bankTitle}>BANK DETAILS <span style={P.bankNote}>(for Cheque Preparation)</span></div>
              {bankRows.map(([l,k]) => (
                <div key={k} style={P.bRow}><span style={P.bLbl}>{l}</span><span style={P.bVal}>{bankDetails[k] || "--"}</span></div>
              ))}
            </div>
            <div style={P.stampRow}>
              <div style={P.stamp}>
                <div style={P.stampLine} />
                <div style={P.stampTxt}>Company Stamp &amp; Signature</div>
              </div>
            </div>
          </div>
          <div style={P.summaryBox}>
            <div style={P.sumHead}>Tax Invoice Summary: AED</div>
            <div style={P.sumBody}>
              <div style={P.sRow}><span style={P.sLbl}>Total Amount Excl. Vat</span><span style={P.sVal}>{invFmt(T.excl)}</span></div>
              <div style={P.sRow}><span style={P.sLbl}>Vat (5%)</span><span style={P.sVal}>{invFmt(T.vat)}</span></div>
              <div style={P.sFinal}><span style={P.sFLbl}>Total Amount Incl. Vat</span><span style={P.sFVal}>{invFmt(T.incl)}</span></div>
            </div>
          </div>
        </div>

        <div style={P.foot}>
          <span>NASAMA PROPERTIES LLC - Office 218, Binghatti Emerald, JVC, Dubai, UAE</span>
          <span>TRN: {billFrom.trn || "--"}</span>
        </div>
      </div>
    </div>
  );

  const partyFields = [["Company Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];
  const invToLabels = [["Developer / Client Name", "companyName"], ["Address", "address"], ["Email", "email"], ["Contact No.", "contactNo"], ["TRN", "trn"]];

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
              <th style={{ ...S.th, textAlign: "left", width: "16%" }}>Project | Unit</th>
              <th style={{ ...S.th, textAlign: "left", width: "24%" }}>Specification</th>
              <th style={{ ...S.th, width: "13%" }}>Deal Value</th>
              <th style={{ ...S.th, width: "10%" }}>Commission %</th>
              <th style={{ ...S.th, width: "13%" }}>Commission Amount</th>
              <th style={{ ...S.th, width: "10%" }}>Vat 5%</th>
              <th style={{ ...S.th, width: "14%" }}>Total Amount Incl. Vat</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => {
              const c = invLineCalc(li);
              const pct = li.commissionPct ?? li.commission_pct;
              return (
                <tr key={li._id || i}>
                  <td style={S.td}>{li.projectUnit}</td>
                  <td style={S.td}>{li.specification}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{li.dealValue ? invFmt(li.dealValue) : "—"}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{pct ? `${invNum(pct)}%` : "--"}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(c.commissionAmount)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(c.vat)}</td>
                  <td style={{ ...S.td, ...S.tdR }}>{invFmt(c.total)}</td>
                </tr>
              );
            })}
            {lineItems.length < 2 && <tr><td colSpan={7} style={{ ...S.td, height: 32, background: "#FAFAFA" }} /></tr>}
            <tr style={S.totRow}>
              <td colSpan={2} style={S.totLbl}>Total Amount</td>
              <td style={{ ...S.totCell, color: "#AAAAAA" }} />
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
function InvoiceEditor({ invoice, customers, developers, deals, settings, onSave, onPreview, onCancel, saving }) {
  const [inv, setInv] = React.useState(() => JSON.parse(JSON.stringify(invoice)));
  const T = invTotals(inv.lineItems || []);
  const buildInvoice = () => invWithDerivedTotals(inv);

  // Deep-set helper for dotted paths (e.g. "billFrom.trn")
  const setPath = (dotPath, val) => setInv(prev => {
    const copy = JSON.parse(JSON.stringify(prev));
    const keys = dotPath.split(".");
    let obj = copy;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = val;
    return copy;
  });

  const selectedPartyValue = inv.invoicedTo?.developerId
    ? `developer:${inv.invoicedTo.developerId}`
    : inv.invoicedTo?.customerId
      ? `client:${inv.invoicedTo.customerId}`
      : "";

  // Auto-fill Invoiced To from a developer or client record.
  const fillInvoiceParty = (value) => {
    const [type, id] = String(value || "").split(":");
    if (!id) {
      setInv(p => ({ ...p, invoicedTo: { ...(p.invoicedTo || {}), partyType: "", partyId: "", customerId: "", developerId: "" } }));
      return;
    }

    const source = type === "developer" ? (developers || []) : (customers || []);
    const party = source.find(x => x.id === id);
    if (!party) return;

    setInv(p => ({
      ...p,
      invoicedTo: {
        companyName: party.name || "",
        address: party.address || "",
        email: party.email || "",
        contactNo: party.phone || party.contactNo || "",
        trn: party.trn || "",
        partyType: type,
        partyId: id,
        customerId: type === "client" ? id : "",
        developerId: type === "developer" ? id : "",
      }
    }));
  };

  // Auto-fill line item from deal record
  const fillDeal = (idx, dealId) => {
    const d = (deals || []).find(x => x.id === dealId);
    if (!d) return;
    const projectUnit = [d.property_name, d.unit_no ? `Unit ${d.unit_no}` : ""].filter(Boolean).join(" — ");
    const pct         = d.commission_pct || 3;
    setInv(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const line = { ...copy.lineItems[idx], projectUnit, specification: `${pct}% of Agency Commission Claim`, dealValue: d.transaction_value ? invFromCents(d.transaction_value) : "", commissionPct: pct, dealId };
      Object.assign(copy.lineItems[idx], invNormalizeLine(line));
      return copy;
    });
  };

  const addLine    = ()      => setInv(p => ({ ...p, lineItems: [...p.lineItems, invBlankLine()] }));
  const removeLine = (i)     => setInv(p => ({ ...p, lineItems: p.lineItems.filter((_, j) => j !== i) }));
  const setLine    = (i, f, v) => setInv(prev => {
    const copy = JSON.parse(JSON.stringify(prev));
    copy.lineItems[i][f] = v;
    if (f === "dealValue" || f === "commissionPct") copy.lineItems[i] = invNormalizeLine(copy.lineItems[i]);
    return copy;
  });

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
          <button style={C.btn("secondary")} onClick={() => onPreview(buildInvoice())}>Preview</button>
          <button style={C.btn()} onClick={() => onSave(buildInvoice(), "draft")} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
          <button style={{ background: G, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => onSave(buildInvoice(), "issued")} disabled={saving}>{saving ? "Issuing…" : "Issue Invoice"}</button>
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
            <label style={lbl}>Select Developer or Client (auto-fill)</label>
            <select style={sel} value={selectedPartyValue} onChange={e => fillInvoiceParty(e.target.value)}>
              <option value="">-- Choose developer or client --</option>
              {(developers || []).length > 0 && (
                <optgroup label="Developers">
                  {(developers || []).map(d => <option key={`developer:${d.id}`} value={`developer:${d.id}`}>{d.name}</option>)}
                </optgroup>
              )}
              {(customers || []).length > 0 && (
                <optgroup label="Clients">
                  {(customers || []).map(c => <option key={`client:${c.id}`} value={`client:${c.id}`}>{c.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          {[["companyName","Developer / Client Name"],["address","Address"],["email","Email"],["contactNo","Contact No."],["trn","TRN"]].map(([f,l]) => (
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
                {[["Project | Unit","left","18%"],["Specification","left","22%"],["Deal Value (AED)","right","12%"],["Commission %","right","10%"],["Commission (AED)","right","13%"],["Vat 5%","right","9%"],["Total Incl. Vat","right","12%"],["","center","4%"]].map(([h,a,w]) => (
                  <th key={h} style={{ padding: "9px 10px", fontSize: 10.5, fontWeight: 700, color: "#1A1A2E", border: "1px solid #E8DCC8", textAlign: a, width: w, letterSpacing: "0.02em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li, idx) => {
                const c = invLineCalc(li);
                const pct = li.commissionPct ?? li.commission_pct;
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
                      <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #D0D5DD", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                        <input type="number" min="0" max="100" step="0.01" style={{ ...inp, border: "none", borderRadius: 0, fontSize: 12, textAlign: "right", flex: 1, width: "100%", minWidth: 0 }} placeholder="0.00" value={pct || ""} onChange={e => setLine(idx, "commissionPct", e.target.value)} />
                        <span style={{ padding: "0 7px", color: "#C9A044", fontSize: 13, fontWeight: 700, background: "#FBF6EC", borderLeft: "1px solid #E8DCC8", whiteSpace: "nowrap", userSelect: "none" }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", textAlign: "right", color: "#111827", fontWeight: 600, fontSize: 12, verticalAlign: "middle" }}>{invFmt(c.commissionAmount)}</td>
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
        <button style={C.btn("secondary")} onClick={() => onPreview(buildInvoice())}>Preview Invoice</button>
        <button style={C.btn()} onClick={() => onSave(buildInvoice(), "draft")} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
        <button style={{ background: G, color: "#fff", border: "none", padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => onSave(buildInvoice(), "issued")} disabled={saving}>{saving ? "Issuing…" : "Issue Invoice"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  H. InvoicePage — list + orchestration
// ═══════════════════════════════════════════════════════════════════
function InvoicePage({ customers, developers, deals, settings, userEmail }) {
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
    const finalInv = invWithDerivedTotals(inv);
    if (status === "issued") {
      const errs = invValidate(finalInv);
      if (errs.length) { errs.forEach(e => toast(e, "error")); return; }
    }
    setSaving(true);
    try {
      const payload = { ...finalInv, status, updatedAt: invTs(), createdBy: userEmail };
      if (finalInv.id) {
        await db.collection("invoices").doc(finalInv.id).set(payload, { merge: true });
      } else {
        const ref = await db.collection("invoices").add({ ...payload, createdAt: invTs() });
        finalInv.id = ref.id;
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
        developers={developers || []}
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
                {[["Invoice No.",""],["Date",""],["Developer / Client",""],["Excl. VAT","right"],["VAT","right"],["Total Incl. VAT","right"],["Status",""],["Actions",""]].map(([h,a]) => (
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
