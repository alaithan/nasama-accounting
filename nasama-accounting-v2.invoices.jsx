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

// Add days to an ISO date (yyyy-mm-dd) → ISO date. Blank in → blank out.
function invAddDays(iso, days) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Whole number → English words (up to billions). e.g. 8085 → "Eight Thousand Eighty-Five".
function invIntToWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const below1000 = n => {
    let s = "";
    if (n >= 100) { s += ones[Math.floor(n / 100)] + " Hundred"; n %= 100; if (n) s += " "; }
    if (n >= 20) { s += tens[Math.floor(n / 10)]; n %= 10; if (n) s += "-" + ones[n]; }
    else if (n > 0) { s += ones[n]; }
    return s;
  };
  const scales = [["Billion", 1e9], ["Million", 1e6], ["Thousand", 1e3]];
  let s = "";
  for (const [name, val] of scales) {
    if (num >= val) { s += below1000(Math.floor(num / val)) + " " + name + " "; num %= val; }
  }
  if (num > 0) s += below1000(num);
  return s.trim();
}

// AED amount → legal words. e.g. 8085.00 → "UAE Dirham Eight Thousand Eighty-Five Only".
function invAmountInWords(amount) {
  const totalFils = Math.round((Number(amount) || 0) * 100);
  const dirhams = Math.floor(totalFils / 100);
  const fils = totalFils % 100;
  let s = "UAE Dirham " + invIntToWords(dirhams);
  if (fils > 0) s += " and " + invIntToWords(fils) + " Fils";
  return s + " Only";
}

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
  // Fixed-amount line (flat rental fee, balance of a commission, …): the stated
  // amount is typed directly — no deal value × % behind it.
  if (line.amountMode === "fixed") return parseFloat(invNum(line.fixedAmount).toFixed(2));
  var dv  = invNum(line.dealValue);
  // Prefer commissionPct; fall back to commission_pct only if commissionPct is absent/blank
  var rawPct = (line.commissionPct !== undefined && line.commissionPct !== null && String(line.commissionPct).trim() !== "")
               ? line.commissionPct
               : line.commission_pct;
  var pct = invNum(rawPct);
  if (dv > 0 && pct > 0) return parseFloat((dv * pct / 100).toFixed(2));
  return 0;
}

// Split a line's stated amount into net / VAT / total, honouring the deal's VAT
// mode. ON TOP: the stated amount is the fee and 5% is added. INCLUSIVE: the
// stated amount is the ALL-IN figure, so VAT is the REMAINDER after backing out
// the net — that way net + VAT lands on the agreed total to the fils instead of
// a cent either side (115,238.10 + 5,761.90 = exactly 121,000.00).
//
// noVat: the line's deal is not VAT-applicable (deal.vat_applicable false), so
// the stated amount is the whole fee and no VAT is charged on it.
function invSplitVat(stated, vatInclusive, noVat) {
  const amt = parseFloat((invNum(stated)).toFixed(2));
  if (noVat) return { net: amt, vat: 0, total: amt };
  if (!vatInclusive) {
    const vat = parseFloat((amt * INV_VAT_RATE).toFixed(2));
    return { net: amt, vat: vat, total: parseFloat((amt + vat).toFixed(2)) };
  }
  const net = parseFloat((amt / (1 + INV_VAT_RATE)).toFixed(2));
  return { net: net, vat: parseFloat((amt - net).toFixed(2)), total: amt };
}

// The NET commission a line bills, in cents — deals store net targets, so this
// is what compares like-for-like against them.
function invLineCents(line) {
  return Math.round(invSplitVat(invCommissionAmount(line), line && line.vatInclusive, line && line.noVat).net * 100);
}

// The commission % that bills exactly `cents` on a deal worth `tvCents`.
// Prefers the deal's own rate when that already lands on the target. Otherwise
// derives one, widening precision until dealValue × pct rounds to the exact
// fils: a flat 2-dp rate silently under-bills (4.761905% → 4.76% loses AED 46
// on a 2.42M deal, and far more on a 200M one).
function invPctForAmount(tvCents, cents, naturalPct, vatInclusive, noVat) {
  if (!(tvCents > 0) || !(cents > 0)) return naturalPct || "";
  const billed = pct => invLineCents({ dealValue: tvCents / 100, commissionPct: pct, vatInclusive: vatInclusive, noVat: noVat });
  const nat = parseFloat(naturalPct);
  if (isFinite(nat) && nat > 0 && billed(nat) === cents) return naturalPct;
  const exact = (cents / tvCents) * 100 * (vatInclusive && !noVat ? (1 + INV_VAT_RATE) : 1);
  for (let dp = 2; dp <= 8; dp++) {
    const cand = parseFloat(exact.toFixed(dp));
    if (billed(cand) === cents) return cand;
  }
  return parseFloat(exact.toFixed(8));
}

// "Vat (5%)" on a normal invoice, "Vat (0%)" when no line carries VAT, and a
// plain "Vat" when the lines are mixed — the label must not claim a rate the
// figures beside it do not use.
function invVatLabel(items, word) {
  const lis = items || [];
  if (lis.length && lis.every(li => li && li.noVat)) return word + " (0%)";
  if (lis.some(li => li && li.noVat)) return word;
  return word + " (5%)";
}

// The % column. Fixed-amount lines have no rate, and a rate that needs more than
// 4 decimals to land on the fils is an artefact of billing a balance — printing
// "2.38095238%" on a tax document reads as an error, so both print "--".
function invPctDisplay(line) {
  if (!line || line.amountMode === "fixed") return "--";
  const raw = line.commissionPct ?? line.commission_pct;
  const n = invNum(raw);
  if (!(n > 0)) return "--";
  const dp = (String(raw).split(".")[1] || "").length;
  return dp > 4 ? "--" : `${n}%`;
}

// A line that bills exactly `targetCents` NET on a deal: keeps the deal's own
// rate when value × rate lands on the target, otherwise switches to a fixed
// amount (never a derived 8-decimal rate). Returns line fields to merge in.
function invLineForTarget(tvCents, targetCents, naturalPct, vatInclusive, noVat) {
  const nat = parseFloat(naturalPct);
  const pctLine = { amountMode: "pct", fixedAmount: "", dealValue: tvCents > 0 ? tvCents / 100 : "", commissionPct: naturalPct, vatInclusive, noVat };
  if (tvCents > 0 && isFinite(nat) && nat > 0 && invLineCents(pctLine) === targetCents) return pctLine;
  // Fixed: the stated amount is the fee (on top) or the all-in figure (inclusive).
  const base = vatInclusive && !noVat ? Math.round(targetCents * (1 + INV_VAT_RATE)) : targetCents;
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const line = { amountMode: "fixed", fixedAmount: (base + d) / 100, dealValue: tvCents > 0 ? tvCents / 100 : "", commissionPct: "", vatInclusive, noVat };
    if (invLineCents(line) === targetCents) return line;
  }
  return { amountMode: "fixed", fixedAmount: base / 100, dealValue: tvCents > 0 ? tvCents / 100 : "", commissionPct: "", vatInclusive, noVat };
}

// UAE TRN: 15 digits (spaces / dashes tolerated when typed).
function invTrnDigits(v) { return String(v || "").replace(/[\s-]/g, ""); }
function invTrnValid(v) { return /^\d{15}$/.test(invTrnDigits(v)); }
// What the TRN box of the invoiced party prints: the TRN, the explicit
// statement that the party is not registered (only when ticked), or "--".
function invCustomerTrnLabel(invoicedTo) {
  const t = invoicedTo || {};
  if ((t.trn || "").trim()) return t.trn;
  return t.notRegistered ? "Not VAT registered" : "--";
}

function invLineCalc(line) {
  var s = invSplitVat(invCommissionAmount(line), line && line.vatInclusive, line && line.noVat);
  return { commissionAmount: s.net, vat: s.vat, total: s.total };
}

// VAT is summed per line, not taken as 5% of the grand total — each line is its
// own supply, and under VAT-inclusive terms only the per-line remainder makes the
// total land on the agreed all-in figure.
function invTotals(items) {
  var excl = 0, vat = 0;
  (items || []).forEach(function(li) { var s = invLineCalc(li); excl += s.commissionAmount; vat += s.vat; });
  excl = parseFloat(excl.toFixed(2));
  vat  = parseFloat(vat.toFixed(2));
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

// `forIssue` adds the checks a TAX document must pass (FTA Art. 59): the
// supplier's TRN, and the recipient's TRN or an explicit "not registered".
function invValidate(inv, forIssue) {
  var e = [];
  if (!inv.invoicedTo || !(inv.invoicedTo.companyName || "").trim()) e.push("Developer / Client name is required");
  if (!inv.lineItems || inv.lineItems.length === 0)                  e.push("At least one line item is required");
  (inv.lineItems || []).forEach(function(li, i) {
    if (!(li.projectUnit  || "").trim()) e.push("Row " + (i+1) + ": Project | Unit is required");
    if (!(li.specification || "").trim()) e.push("Row " + (i+1) + ": Specification is required");
    if (li.amountMode === "fixed") {
      if (!(invNum(li.fixedAmount) > 0)) e.push("Row " + (i+1) + ": Amount must be > 0");
    } else {
      if (!(invNum(li.dealValue) > 0))      e.push("Row " + (i+1) + ": Deal Value must be > 0");
      if (!(invNum(li.commissionPct) > 0 || invNum(li.commission_pct) > 0)) e.push("Row " + (i+1) + ": Commission % must be > 0");
    }
    if (!(invCommissionAmount(li) > 0))   e.push("Row " + (i+1) + ": Commission Amount must be > 0");
  });
  if (forIssue) {
    if (!invTrnValid(inv.billFrom && inv.billFrom.trn)) e.push("Bill From TRN must be the company's 15-digit TRN (set it in Settings)");
    const to = inv.invoicedTo || {};
    if ((to.trn || "").trim() && !invTrnValid(to.trn)) e.push("Invoiced To TRN must be 15 digits");
    if (!(to.trn || "").trim() && !to.notRegistered) e.push("Enter the recipient's TRN, or tick “Recipient is not VAT registered”");
  }
  return e;
}

// ═══════════════════════════════════════════════════════════════════
//  A2. LEDGER POSTINGS (accrual invoicing) — pure, so they are testable
// ═══════════════════════════════════════════════════════════════════
const INV_REVENUE_CODE = { "Off-Plan": "4000", Secondary: "4010", Rental: "4020", Renewal: "4020" };

// Issue-time entry for an accrual invoice, per line:
//   DR 1100 Commission Receivable (gross) / CR Revenue (net) / CR Output VAT (vat)
// Revenue goes to the line's deal type (4000 when a line has no deal). Amounts
// come from invLineCalc, so the entry foots to the printed invoice to the fils.
// `arAccount` may be the seed when 1100 does not exist yet (created alongside).
function invBuildArTxn(inv, { deals, accounts, arAccount }) {
  const byCode = code => (accounts || []).find(a => a.code === code);
  const outVat = (accounts || []).find(a => a.isOutputVAT);
  const ar = arAccount || byCode(AR_ACCOUNT_CODE);
  if (!ar) throw new Error("Commission Receivable account (1100) not found");
  const mk = (accountId, debit, credit, memo, dealId) => ({ id: uid(), accountId, debit, credit, memo, ...(dealId ? { deal_id: dealId } : {}) });
  const lines = [];
  (inv.lineItems || []).forEach(li => {
    const c = invLineCalc(li);
    const net = Math.round(c.commissionAmount * 100), vat = Math.round(c.vat * 100);
    if (net + vat <= 0) return;
    const deal = li.dealId ? (deals || []).find(d => d.id === li.dealId) : null;
    const rev = byCode(INV_REVENUE_CODE[deal && deal.type] || "4000");
    if (!rev) throw new Error(`Revenue account ${INV_REVENUE_CODE[deal && deal.type] || "4000"} not found`);
    const memo = `Inv #${inv.invoiceNumber} — ${li.projectUnit || li.specification || ""}`.trim();
    lines.push(mk(ar.id, net + vat, 0, memo, li.dealId));
    lines.push(mk(rev.id, 0, net, memo, li.dealId));
    if (vat > 0) {
      if (!outVat) throw new Error("Output VAT account not found");
      lines.push(mk(outVat.id, 0, vat, `Output VAT — Inv #${inv.invoiceNumber}`, li.dealId));
    }
  });
  if (!lines.length) throw new Error("The invoice has no amount to post");
  const dealIds = [...new Set((inv.lineItems || []).map(li => li.dealId).filter(Boolean))];
  return { id: uid(), date: inv.invoiceDate, description: `Tax Invoice #${inv.invoiceNumber} — ${(inv.invoicedTo && inv.invoicedTo.companyName) || ""}`.trim(),
    ref: `INV-${inv.invoiceNumber}`, counterparty: (inv.invoicedTo && inv.invoicedTo.companyName) || "", tags: "invoice receivable", txnType: "IN",
    isVoid: false, lines, createdAt: new Date().toISOString(), invoice_id: inv.id || "", invoice_no: inv.invoiceNumber || "",
    ...(dealIds.length === 1 ? { deal_id: dealIds[0] } : {}) };
}

// Credit-note entry: the exact mirror of the invoice's entry, dated on the credit
// note, so revenue and VAT come back out in the credit note's own VAT period.
function invBuildCreditNoteTxn(arTxn, cn) {
  return { id: uid(), date: cn.date, description: `Tax Credit Note ${cn.number} — cancels Inv #${arTxn.invoice_no}`,
    ref: `CN-${cn.number}`, counterparty: arTxn.counterparty || "", tags: "credit-note receivable", txnType: "CN",
    isVoid: false, createdAt: new Date().toISOString(), reversesTxnId: arTxn.id,
    invoice_id: arTxn.invoice_id || "", invoice_no: arTxn.invoice_no || "", credit_note_id: cn.id || "",
    ...(arTxn.deal_id ? { deal_id: arTxn.deal_id } : {}),
    lines: (arTxn.lines || []).map(l => ({ id: uid(), accountId: l.accountId, debit: l.credit || 0, credit: l.debit || 0,
      memo: `Credit note ${cn.number} — ${l.memo || ""}`.trim(), ...(l.deal_id ? { deal_id: l.deal_id } : {}) })) };
}

// Which deal the next receipt should cover, and how much (AED incl. VAT): the
// first deal on the invoice whose share is not yet covered by receipts linked to
// it. Receipts with no deal_id count against the invoice as a whole.
function invReceiptPlan(inv, receipts, accounts) {
  const lis = (inv && inv.lineItems) || [];
  const shares = new Map();
  lis.forEach(li => { const k = li.dealId || ""; shares.set(k, (shares.get(k) || 0) + Math.round(invLineCalc(li).total * 100)); });
  const got = new Map(); let unassigned = 0;
  (receipts || []).forEach(t => {
    const c = Math.round(srReceivedAED(t, accounts) * 100);
    if (t.deal_id && shares.has(t.deal_id)) got.set(t.deal_id, (got.get(t.deal_id) || 0) + c); else unassigned += c;
  });
  for (const [dealId, share] of shares) {
    let due = share - (got.get(dealId) || 0);
    const take = Math.min(Math.max(due, 0), unassigned); due -= take; unassigned -= take;
    if (due > 50) return { dealId, dueCents: due, dealCount: [...shares.keys()].filter(Boolean).length };
  }
  return { dealId: "", dueCents: 0, dealCount: [...shares.keys()].filter(Boolean).length };
}

// Statement of account: open items and 0–30 / 31–60 / 61–90 / 90+ aging by
// days past DUE date (not yet due counts as "current"). Amounts in AED.
// Invoices issued before due dates existed fall back to invoice date + 30,
// exactly as the printed document does.
function invDueDateOf(inv) { return (inv && inv.dueDate) || invAddDays(inv && inv.invoiceDate, 30); }
function invAgingBucket(daysOverdue) {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90p";
}
function invStatement(invoices, metaOf, partyKey, today) {
  const rows = (invoices || [])
    .filter(inv => (inv.status === "issued") && invPartyKey(inv) === partyKey)
    .map(inv => {
      const m = metaOf(inv) || {};
      const due = invDueDateOf(inv);
      const daysOverdue = due && due < today ? Math.round((new Date(today + "T12:00:00") - new Date(due + "T12:00:00")) / 86400000) : 0;
      return { inv, total: m.total || 0, paid: m.paid || 0, due: Math.max(0, (m.total || 0) - (m.paid || 0)), daysOverdue, bucket: invAgingBucket(daysOverdue) };
    })
    .sort((a, b) => String(a.inv.invoiceDate || "").localeCompare(String(b.inv.invoiceDate || "")));
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  rows.forEach(r => { if (r.due > 0.5) aging[r.bucket] += r.due; });
  const totals = rows.reduce((t, r) => ({ total: t.total + r.total, paid: t.paid + r.paid, due: t.due + (r.due > 0.5 ? r.due : 0) }), { total: 0, paid: 0, due: 0 });
  return { rows, aging, totals };
}
// One key per billed party: the developer/client record when linked, else the name.
function invPartyKey(inv) {
  const t = (inv && inv.invoicedTo) || {};
  return t.developerId ? `developer:${t.developerId}` : t.customerId ? `client:${t.customerId}` : `name:${String(t.companyName || "").trim().toLowerCase()}`;
}

// ═══════════════════════════════════════════════════════════════════
//  B. DATA FACTORIES
// ═══════════════════════════════════════════════════════════════════
function invBlankLine() {
  const _id = (typeof uid === "function")
    ? uid()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { _id, projectUnit: "", specification: "", dealValue: "", commissionPct: "", commissionAmount: "", dealId: "", commissionId: "" };
}

function invBlankDoc(settings) {
  return {
    invoiceNumber:    "",
    invoiceNumberRaw: 0,
    invoiceDate:      todayStr(),
    supplyDate:       todayStr(),
    dueDate:          invAddDays(todayStr(), 30),
    paymentTerms:     "Payment due within 30 days of the invoice date.",
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
/* Document numbers come from Firestore counters and are allocated ONLY when a
   document is issued, inside the same transaction that writes it:
     meta/invoiceCounter.lastNumber     tax invoices      094, 095, …
     meta/creditNoteCounter.lastNumber  tax credit notes  CN-001, …
     meta/claimCounter.lastNumber       commission claims CC-001, …
   So drafts never consume a number, a failed issue consumes nothing, and two
   people issuing at once cannot get the same number. There is deliberately no
   offline fallback: a tax invoice number that is not from the series is worse
   than an issue that waits for the connection.                           */
const INV_COUNTERS = {
  invoice:     { doc: "invoiceCounter",    start: INV_START_NUMBER, fmt: n => invPad(n) },
  credit_note: { doc: "creditNoteCounter", start: 1,                fmt: n => `CN-${invPad(n)}` },
  claim:       { doc: "claimCounter",      start: 1,                fmt: n => `CC-${invPad(n)}` },
};
const invNextNumber = (snap, start) => snap && snap.exists ? Math.max((snap.data().lastNumber || 0) + 1, start) : start;

// Drop `undefined` (Firestore rejects it) but keep Timestamps and other
// non-plain objects intact — a JSON round-trip would flatten a Timestamp.
function invClean(v) {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(invClean).filter(x => x !== undefined);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    Object.keys(v).forEach(k => { const x = invClean(v[k]); if (x !== undefined) o[k] = x; });
    return o;
  }
  return v;
}

// Issue a draft as a tax invoice (kind "invoice") or a commission claim
// (kind "claim"), atomically: re-read the stored doc (must still be a draft),
// allocate the number, write the issued doc, and — for an accrual invoice —
// post its receivable entry (plus the 1100 account when it does not exist yet).
// A converted claim is marked "converted" in the same transaction.
async function invIssueInTransaction({ inv, kind = "invoice", userEmail, makeArTxn = null, arAccountToCreate = null }) {
  const cfg = INV_COUNTERS[kind];
  const counterRef = db.collection("meta").doc(cfg.doc);
  const invRef = inv.id ? db.collection("invoices").doc(inv.id) : db.collection("invoices").doc();
  const claimRef = kind === "invoice" && inv.claimId ? db.collection("invoices").doc(inv.claimId) : null;
  let issued = null;
  await db.runTransaction(async tx => {
    // Firestore transactions: every read before any write.
    const cSnap = await tx.get(counterRef);
    const iSnap = inv.id ? await tx.get(invRef) : null;
    const clSnap = claimRef ? await tx.get(claimRef) : null;
    if (iSnap && iSnap.exists && (iSnap.data().status || "draft") !== "draft") throw new Error("This document was already issued — reload, and duplicate it if you need a new one");
    if (clSnap && (!clSnap.exists || clSnap.data().status !== "claim")) throw new Error("That commission claim was already converted or withdrawn");
    const now = new Date().toISOString();
    // A legacy draft numbered at its first save (before numbers moved to issue
    // time) already consumed that number from the series — keep it.
    const legacyNumber = kind === "invoice" && inv.invoiceNumber && inv.invoiceNumberRaw;
    let raw = legacyNumber ? inv.invoiceNumberRaw : invNextNumber(cSnap, cfg.start);
    const number = legacyNumber ? inv.invoiceNumber : cfg.fmt(raw);
    if (!legacyNumber) tx.set(counterRef, { lastNumber: raw }, { merge: true });
    const doc = { ...inv, id: invRef.id, updatedAt: invTs(), updatedBy: userEmail || "", issuedAt: now, issuedBy: userEmail || "" };
    if (!inv.id) { doc.createdAt = invTs(); doc.createdBy = userEmail || ""; }
    if (kind === "claim") Object.assign(doc, { status: "claim", claimNumber: number, claimNumberRaw: raw, invoiceNumber: "", invoiceNumberRaw: 0 });
    else Object.assign(doc, { status: "issued", invoiceNumber: number, invoiceNumberRaw: raw, accountingBasis: makeArTxn ? "accrual" : "cash" });
    if (kind === "invoice" && makeArTxn) {
      const arTxn = makeArTxn(doc);
      doc.arTxnId = arTxn.id;
      if (arAccountToCreate) tx.set(db.collection("accounts").doc(arAccountToCreate.id), invClean(arAccountToCreate));
      tx.set(db.collection("transactions").doc(arTxn.id), invClean(arTxn));
    }
    tx.set(invRef, invClean(doc));
    if (claimRef) tx.set(claimRef, { status: "converted", convertedInvoiceId: invRef.id, convertedInvoiceNumber: number, updatedAt: invTs() }, { merge: true });
    issued = doc;
  });
  return issued;
}

// Cancel an issued tax invoice with a tax credit note, atomically: the credit
// note doc (its own series), the invoice → "credited", and — for an accrual
// invoice — the mirror entry that takes the receivable, revenue and VAT back out.
async function invCreditInTransaction({ inv, date, reason, userEmail, makeCnTxn = null }) {
  const cfg = INV_COUNTERS.credit_note;
  const counterRef = db.collection("meta").doc(cfg.doc);
  const invRef = db.collection("invoices").doc(inv.id);
  const cnRef = db.collection("credit_notes").doc();
  let cn = null;
  await db.runTransaction(async tx => {
    const cSnap = await tx.get(counterRef);
    const iSnap = await tx.get(invRef);
    if (!iSnap.exists || iSnap.data().status !== "issued") throw new Error("Only an issued invoice can be credited");
    const raw = invNextNumber(cSnap, cfg.start);
    const now = new Date().toISOString();
    cn = invClean({
      id: cnRef.id, number: cfg.fmt(raw), numberRaw: raw, date, reason: reason || "",
      invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate,
      billFrom: inv.billFrom, invoicedTo: inv.invoicedTo, lineItems: inv.lineItems, totals: inv.totals, bankDetails: inv.bankDetails,
      createdAt: now, createdBy: userEmail || "",
    });
    if (inv.arTxnId && makeCnTxn) {
      const t = makeCnTxn(cn);
      cn.txnId = t.id;
      tx.set(db.collection("transactions").doc(t.id), invClean(t));
    }
    tx.set(counterRef, { lastNumber: raw }, { merge: true });
    tx.set(cnRef, cn);
    tx.set(invRef, { status: "credited", creditNoteId: cnRef.id, creditNoteNumber: cn.number, creditedAt: now, creditedBy: userEmail || "", updatedAt: invTs() }, { merge: true });
  });
  return cn;
}

function invTs() {
  try { return firebase.firestore.FieldValue.serverTimestamp(); }
  catch (err) { return new Date().toISOString(); }
}

// ═══════════════════════════════════════════════════════════════════
//  D. PDF EXPORT  — html2canvas captures the live DOM node;
//     jsPDF fits it onto a SINGLE A4 page (scales down if tall).
//
//  WHY html2canvas + jsPDF (not pdf-lib):
//  ∙ html2canvas renders the full styled HTML (tables, logo, borders)
//    into a canvas with no manual layout code required.
//  ∙ jsPDF consumes that canvas and outputs a proper PDF.
//  ∙ Both available as CDN UMD bundles, zero build step.
// ═══════════════════════════════════════════════════════════════════
// `filename` is optional — omitted, it keeps the original invoice naming, so the
// single-A4-page logic below can be reused for other documents (deposit receipts)
// without duplicating it.
async function invCaptureCanvas(el) {
  return window.html2canvas(el, {
    scale:           2,           // 2× for sharp text/borders
    useCORS:         true,
    allowTaint:      true,
    backgroundColor: "#ffffff",
    logging:         false,
    scrollX:         0,
    scrollY:         -window.scrollY,
    windowWidth:     INV_A4_PX,
  });
}

// Canvas → jsPDF. `pages`: slice a tall document across as many A4 pages as it
// needs (invoices with many lines stay readable). Without it the document is
// scaled to fit ONE page — the deposit receipt relies on that.
function invCanvasToPdf(canvas, { pages = false, jpeg = false } = {}) {
  const { jsPDF } = window.jspdf;
  const pdf   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight();  // 297 mm
  const type  = jpeg ? "JPEG" : "PNG";
  const enc   = c => jpeg ? c.toDataURL("image/jpeg", 0.85) : c.toDataURL("image/png");
  const fullHeightMM = (canvas.height / canvas.width) * pageW;
  if (!pages || fullHeightMM <= pageH + 0.5) {
    let drawW = pageW, drawH = fullHeightMM;
    if (fullHeightMM > pageH) { const k = pageH / fullHeightMM; drawW = pageW * k; drawH = pageH; }
    pdf.addImage(enc(canvas), type, (pageW - drawW) / 2, 0, drawW, drawH);
    return pdf;
  }
  const slicePx = Math.floor(canvas.width * pageH / pageW);
  for (let y = 0, i = 0; y < canvas.height; y += slicePx, i++) {
    const h = Math.min(slicePx, canvas.height - y);
    const part = document.createElement("canvas");
    part.width = canvas.width; part.height = h;
    const ctx = part.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, part.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (i > 0) pdf.addPage();
    pdf.addImage(enc(part), type, 0, 0, pageW, (h / canvas.width) * pageW);
  }
  return pdf;
}

// `filename` is optional — omitted, it keeps the original invoice naming.
// `opts.pages` → multi-page (invoices); default single-page fit (deposit receipt).
async function invExportPDF(elementId, invoiceNumber, filename, opts = {}) {
  if (!window.html2canvas || !window.jspdf) {
    toast("PDF libraries not loaded (vendor/html2canvas, vendor/jspdf).", "error");
    return false;
  }
  const el = document.getElementById(elementId);
  if (!el) { toast("Preview element not found.", "error"); return false; }
  try {
    const canvas = await invCaptureCanvas(el);
    invCanvasToPdf(canvas, { pages: !!opts.pages }).save(filename || `Nasama_Invoice_${invoiceNumber || "draft"}.pdf`);
    return true;
  } catch (err) {
    console.error(err);
    toast("PDF export failed: " + err.message, "error");
    return false;
  }
}

// ── Frozen copy ──────────────────────────────────────────────────────
// At issue the document is rendered once, off-screen, and the PDF is stored in
// Firestore (invoice_pdfs, split into ≤700 KB parts under the 1 MiB doc cap).
// "Download issued copy" then serves exactly what was issued, even after the
// logo, stamp, address or bank details change in Settings.
const INV_PDF_PART = 700000;
async function invRenderOffscreenPdf(element) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${INV_A4_PX}px;background:#fff;z-index:-1`;
  document.body.appendChild(host);
  const root = ReactDOM.createRoot(host);
  try {
    root.render(element);
    for (let i = 0; i < 40 && !host.firstChild; i++) await new Promise(r => setTimeout(r, 25));
    await Promise.all([...host.querySelectorAll("img")].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    await new Promise(r => setTimeout(r, 150));
    const canvas = await invCaptureCanvas(host.firstChild);
    return invCanvasToPdf(canvas, { pages: true, jpeg: true }).output("datauristring");
  } finally {
    root.unmount();
    host.remove();
  }
}
async function invFreezePdf(docId, element) {
  if (!window.html2canvas || !window.jspdf || !window.ReactDOM || !ReactDOM.createRoot) return false;
  const data = await invRenderOffscreenPdf(element);
  const parts = [];
  for (let i = 0; i < data.length; i += INV_PDF_PART) parts.push(data.slice(i, i + INV_PDF_PART));
  const batch = db.batch();
  parts.forEach((chunk, i) => batch.set(db.collection("invoice_pdfs").doc(`${docId}_p${i}`), { docId, part: i, data: chunk }));
  batch.set(db.collection("invoice_pdfs").doc(docId), { docId, parts: parts.length, createdAt: new Date().toISOString(), bytes: data.length });
  await batch.commit();
  return true;
}
async function invDownloadFrozenPdf(docId, filename) {
  const head = await db.collection("invoice_pdfs").doc(docId).get();
  if (!head.exists) return false;
  const n = head.data().parts || 0;
  const snaps = await Promise.all(Array.from({ length: n }, (_, i) => db.collection("invoice_pdfs").doc(`${docId}_p${i}`).get()));
  const data = snaps.map(x => (x.exists ? x.data().data : "")).join("");
  if (!data) return false;
  const bin = atob(data.slice(data.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  E. InvoicePreviewDoc — A4 printable invoice layout
//     Used in preview modal AND captured by html2canvas for PDF.
// ═══════════════════════════════════════════════════════════════════
// kind: "invoice" (issued tax invoice) | "draft" | "claim" (commission claim,
// not a tax document) | "credit_note" (pass the credit-note doc as `invoice`).
function invDocKind(inv) {
  const st = (inv && inv.status) || "draft";
  return st === "claim" || st === "converted" ? "claim" : st === "draft" ? "draft" : "invoice";
}
const INV_DOC_LABELS = {
  invoice:     { title: "TAX INVOICE",     no: "Invoice No.",     summary: "Tax Invoice Summary: AED" },
  draft:       { title: "TAX INVOICE",     no: "Invoice No.",     summary: "Tax Invoice Summary: AED" },
  claim:       { title: "COMMISSION CLAIM", no: "Claim No.",      summary: "Claim Summary: AED" },
  credit_note: { title: "TAX CREDIT NOTE", no: "Credit Note No.", summary: "Amounts Credited: AED" },
};

function InvoicePreviewDoc({ invoice, kind: kindProp }) {
  const kind = kindProp || invDocKind(invoice);
  const L = INV_DOC_LABELS[kind] || INV_DOC_LABELS.invoice;
  const { billFrom = {}, invoicedTo = {}, lineItems = [], bankDetails = {}, invoiceDate } = invoice;
  const docNumber = kind === "credit_note" ? invoice.number : kind === "claim" ? invoice.claimNumber : kind === "draft" ? "DRAFT" : invoice.invoiceNumber;
  const docDate = kind === "credit_note" ? invoice.date : invoiceDate;
  const T  = invTotals(lineItems);
  // Derived, with fallbacks so invoices created before these fields still render.
  const supplyDate   = invoice.supplyDate || invoiceDate;
  const dueDate      = invoice.dueDate || invAddDays(invoiceDate, 30);
  const paymentTerms = invoice.paymentTerms || "Payment due within 30 days of the invoice date.";

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
    stamp: { width: 188, height: 188, display: "flex", alignItems: "center", justifyContent: "center" },
    stampTxt: { color: CHAR, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" },
    stampLine: { width: 132, height: 1, background: LINE },
    foot: { marginTop: 22, paddingTop: 10, borderTop: "1px solid " + LINE, display: "flex", justifyContent: "space-between", gap: 18, color: MUT, fontSize: 9.6, lineHeight: 1.35 },
    termsBar: { marginTop: 18, border: "1px solid " + LINE, borderLeft: "4px solid " + G, background: SOFT2, padding: "11px 16px", fontSize: 10.6, color: INK, lineHeight: 1.6 },
    termsLbl: { color: CHAR, fontWeight: 800, letterSpacing: "0.02em" },
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
            <div style={{ ...P.title, ...(L.title.length > 12 ? { fontSize: 27 } : {}) }}>{L.title}</div>
            <div style={P.metaBox}>
              {kind === "credit_note" ? <>
                <span style={P.mLbl}>Credit Note Date</span><span style={P.mVal}>{invFmtDate(docDate)}</span>
                <span style={P.mLbl}>Original Invoice No.</span><span style={P.mVal}>{invoice.invoiceNumber || "--"}</span>
                <span style={P.mLbl}>Original Invoice Date</span><span style={P.mVal}>{invFmtDate(invoice.invoiceDate)}</span>
              </> : <>
                <span style={P.mLbl}>{kind === "claim" ? "Claim Date" : "Invoice Date"}</span><span style={P.mVal}>{invFmtDate(invoiceDate)}</span>
                <span style={P.mLbl}>Date of Supply</span><span style={P.mVal}>{invFmtDate(supplyDate)}</span>
                <span style={P.mLbl}>Due Date</span><span style={P.mVal}>{invFmtDate(dueDate)}</span>
              </>}
              <span style={{ ...P.mLbl, borderBottom: "none" }}>{L.no}</span><span style={{ ...P.mVal, borderBottom: "none" }}>{docNumber || "--"}</span>
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
              <div key={k} style={P.pRow}><span style={P.pLbl}>{l}</span><span style={P.pVal}>{k === "trn" ? invCustomerTrnLabel(invoicedTo) : (invoicedTo[k] || "--")}</span></div>
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
                <th style={{ ...P.th, width: "13%", textAlign: "right" }}>Deal Value (AED)</th>
                <th style={{ ...P.th, width: "10%", textAlign: "right" }}>Commission %</th>
                <th style={{ ...P.th, width: "13%", textAlign: "right" }}>Commission Amt (AED)</th>
                <th style={{ ...P.th, width: "10%", textAlign: "right" }}>VAT 5% (AED)</th>
                <th style={{ ...P.th, width: "14%", textAlign: "right", borderRight: "none" }}>Total Incl. VAT (AED)</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => {
                const c = invLineCalc(li);
                return (
                  <tr key={li._id || i}>
                    <td style={P.td}>{li.projectUnit || "--"}</td>
                    <td style={P.td}>{li.specification || "--"}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{invNum(li.dealValue) > 0 ? invFmt(li.dealValue) : "--"}</td>
                    <td style={{ ...P.td, ...P.tdR }}>{invPctDisplay(li)}</td>
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={P.stamp}>
                  <img
                    src={typeof NASAMA_STAMP_SRC !== "undefined" ? NASAMA_STAMP_SRC : "./nasama-stamp.png"}
                    alt="Company Stamp"
                    style={{ width: 188, height: 188, objectFit: "contain", display: "block" }}
                  />
                </div>
                <div style={P.stampLine} />
                <div style={{ ...P.stampTxt, marginTop: 6 }}>Authorized Signatory</div>
              </div>
            </div>
          </div>
          <div style={P.summaryBox}>
            <div style={P.sumHead}>{L.summary}</div>
            <div style={P.sumBody}>
              <div style={P.sRow}><span style={P.sLbl}>Total Amount Excl. Vat</span><span style={P.sVal}>{invFmt(T.excl)}</span></div>
              <div style={P.sRow}><span style={P.sLbl}>{invVatLabel(lineItems, "Vat")}</span><span style={P.sVal}>{invFmt(T.vat)}</span></div>
              <div style={P.sFinal}><span style={P.sFLbl}>Total Amount Incl. Vat</span><span style={P.sFVal}>{invFmt(T.incl)}</span></div>
              {/* Under VAT-inclusive terms the % column applies to the all-in total,
                  not to the net — say so, or the document reads as inconsistent. */}
              {(lineItems || []).some(li => li.vatInclusive && !li.noVat) && (
                <div style={{ ...P.sRow, fontSize: 8, color: "#6B7280", fontStyle: "italic" }}>
                  <span>Commission is inclusive of 5% VAT.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={P.termsBar}>
          <div><span style={P.termsLbl}>Amount in Words:</span> {invAmountInWords(T.incl)}</div>
          {kind === "credit_note" ? <div style={{ marginTop: 5 }}>
            <span style={P.termsLbl}>Reason:</span> {invoice.reason || "Cancellation of the original tax invoice"}
            &nbsp;&nbsp;This credit note cancels Tax Invoice No. {invoice.invoiceNumber} in full, including its VAT.
          </div> : <div style={{ marginTop: 5 }}>
            <span style={P.termsLbl}>Payment Terms:</span> {paymentTerms}
            &nbsp;&nbsp;<span style={P.termsLbl}>Due Date:</span> {invFmtDate(dueDate)}
          </div>}
          {kind === "claim" && <div style={{ marginTop: 5, fontWeight: 700 }}>This is a commission claim, not a tax invoice. A tax invoice will be issued once the claim is approved.</div>}
          {kind === "draft" && <div style={{ marginTop: 5, fontWeight: 700, color: "#B42318" }}>DRAFT — not issued. This document is not a tax invoice.</div>}
        </div>

        <div style={P.foot}>
          <span>{[billFrom.companyName || "NASAMA PROPERTIES LLC", invCleanCompanyAddress(billFrom.address)].filter(Boolean).join(" - ")}</span>
          <span>TRN: {billFrom.trn || "--"}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  F. InvoicePreviewModal
// ═══════════════════════════════════════════════════════════════════
const INV_PDF_EL = "inv-pdf-capture";

function invPdfFilename(invoice, kind) {
  const safe = v => String(v || "draft").replace(/[^A-Za-z0-9-]+/g, "_");
  if (kind === "credit_note") return `Nasama_CreditNote_${safe(invoice.number)}.pdf`;
  if (kind === "claim") return `Nasama_CommissionClaim_${safe(invoice.claimNumber)}.pdf`;
  return `Nasama_Invoice_${safe(kind === "draft" ? "draft" : invoice.invoiceNumber)}.pdf`;
}

function InvoicePreviewModal({ invoice, kind: kindProp, onClose, onCreateReceipt, alreadyReceipted, receiptRef }) {
  const [exporting, setExporting] = React.useState(false);
  const kind = kindProp || invDocKind(invoice);
  const L = INV_DOC_LABELS[kind] || INV_DOC_LABELS.invoice;
  const number = kind === "credit_note" ? invoice.number : kind === "claim" ? invoice.claimNumber : invoice.invoiceNumber;

  // An issued document downloads its frozen copy — exactly what was issued.
  // Only documents issued before frozen copies existed (and drafts) are
  // rendered from the live data.
  const handlePDF = async () => {
    setExporting(true);
    try {
      const name = invPdfFilename(invoice, kind);
      if (kind !== "draft" && invoice.id && await invDownloadFrozenPdf(invoice.id, name).catch(() => false)) return;
      await invExportPDF(INV_PDF_EL, number, name, { pages: true });
    } finally { setExporting(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1200, display: "flex", flexDirection: "column", backdropFilter: "blur(5px)" }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, background: "#07090F", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px" }}>
        <div style={{ color: "#EDE6D4", fontWeight: 700, fontSize: 15 }}>
          {L.title.charAt(0) + L.title.slice(1).toLowerCase()} Preview
          {number && kind !== "draft" && <span style={{ marginLeft: 10, fontSize: 13, color: "#C9A044", fontFamily: "monospace" }}>#{number}</span>}
          {kind === "draft" && <span style={{ marginLeft: 8, fontSize: 11, background: "#92400E22", color: "#D97706", border: "1px solid #D9770640", borderRadius: 4, padding: "2px 7px" }}>DRAFT</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {onCreateReceipt && (alreadyReceipted
            ? <button disabled title={`Already receipted${receiptRef ? " · " + receiptRef : ""}`} style={{ background: "#0F1A14", color: "#6EE7B7", border: "1px solid #065F46", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "not-allowed", opacity: 0.75 }}>✓ Receipted</button>
            : <button title="Record commission collected against this invoice" style={{ background: "#059669", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={onCreateReceipt}>+ Receipt</button>)}
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
            <InvoicePreviewDoc invoice={invoice} kind={kind} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  G. InvoiceEditor — create / edit form
// ═══════════════════════════════════════════════════════════════════
function InvoiceEditor({ invoice, customers, developers, deals, invoices, settings, onSave, onPreview, onCancel, onFixDeal, saving, accrualNote }) {
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

  // Auto-fill line item from a deal record + which commission (buyer/seller/single)
  const fillDeal = (idx, dealId, commissionId) => {
    if (!dealId) {
      setInv(prev => { const copy = JSON.parse(JSON.stringify(prev)); copy.lineItems[idx] = { ...copy.lineItems[idx], dealId: "", commissionId: "" }; return copy; });
      return;
    }
    const d = (deals || []).find(x => x.id === dealId);
    if (!d) return;
    const comms = (typeof dealCommissions === "function" ? dealCommissions(d).commissions : []);
    const cid = commissionId || (comms[0] ? comms[0].id : "single");
    // The deal's own rate for that side — never a silent default. Without one
    // the line bills the side's commission as a FIXED amount instead.
    const pct = cid === "seller" ? (parseFloat(d.seller_commission_pct) || "") : (parseFloat(d.commission_pct) || "");
    const side = comms.find(c => c.id === cid);
    const sideLabel = cid === "buyer" ? "Buyer-side " : cid === "seller" ? "Seller-side " : "";
    const projectUnit = [d.property_name, d.unit_no ? `Unit ${d.unit_no}` : ""].filter(Boolean).join(" — ");
    const incl = isVatInclusive(d), noVat = !d.vat_applicable;
    setInv(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const amountPart = pct
        ? { amountMode: "pct", fixedAmount: "", dealValue: d.transaction_value ? invFromCents(d.transaction_value) : "", commissionPct: pct }
        : invLineForTarget(d.transaction_value || 0, side ? side.target : (d.expected_commission_net || 0), null, incl, noVat);
      const line = { ...copy.lineItems[idx], projectUnit, specification: pct ? `${sideLabel}${pct}% of Agency Commission Claim` : `${sideLabel}Agency Commission`,
        ...amountPart, dealId, commissionId: cid, vatInclusive: incl, noVat };
      Object.assign(copy.lineItems[idx], invNormalizeLine(line));
      return copy;
    });
  };

  // What a deal-linked line SHOULD bill: that commission side's outstanding
  // amount, ignoring invoice `selfId` (so re-opening a saved invoice doesn't
  // read its own lines as already billed). Null when there is nothing to check
  // against — no deal link, no target, or the linking helpers aren't loaded.
  // `dealOverride` lets a caller ask "what would this line bill if the deal read
  // X?" before the corrected deal has come back down the Firestore snapshot.
  const outstandingFor = (li, selfId, dealOverride) => {
    if (!li || !li.dealId || typeof commissionInvoicing !== "function") return null;
    const d = dealOverride || (deals || []).find(x => x.id === li.dealId);
    if (!d) return null;
    const others = (invoices || []).filter(x => x.id !== selfId);
    const side = commissionInvoicing(d, others).commissions.find(c => c.id === (li.commissionId || "single"));
    if (!side || !(side.target > 0)) return null;
    return { deal: d, side, expectedCents: side.remainingCents, billedCents: invLineCents(li) };
  };

  // The same line repriced onto that outstanding amount, at the deal's real
  // transaction value. Null when it already matches or there is nothing to
  // match against — so callers can use it as "does this need fixing?".
  const matchedLine = (li, selfId, dealOverride) => {
    const o = outstandingFor(li, selfId, dealOverride);
    if (!o || o.billedCents === o.expectedCents) return null;
    const incl = typeof isVatInclusive === "function" ? isVatInclusive(o.deal) : false;
    const noVat = !o.deal.vat_applicable;
    // The deal's own rate when it lands on the outstanding amount, else a fixed
    // amount for exactly that balance — never a derived 8-decimal rate.
    return invNormalizeLine({ ...li,
      ...invLineForTarget(o.deal.transaction_value || 0, o.expectedCents,
        o.side.id === "seller" ? o.deal.seller_commission_pct : o.deal.commission_pct, incl, noVat) });
  };

  // The linked DEAL's own stored commission contradicting its value × % — the
  // deal is wrong, not the line. Conforming the invoice to it would only bill
  // the wrong amount with a tidier audit trail, so this is reported and the
  // auto-match below stands down until the deal is corrected.
  const dealMismatchFor = (li) => {
    if (!li || !li.dealId || typeof commissionMismatch !== "function") return null;
    const d = (deals || []).find(x => x.id === li.dealId);
    const mm = d ? commissionMismatch(d) : null;
    return mm ? { deal: d, ...mm } : null;
  };

  const lineOutstanding = (li) => outstandingFor(li, inv.id);
  const billOutstanding = (idx) => setInv(prev => {
    const m = matchedLine(prev.lineItems[idx], prev.id);
    return m ? { ...prev, lineItems: prev.lineItems.map((li, i) => i === idx ? m : li) } : prev;
  });

  // One click has to leave the invoice correct: write the corrected commission to
  // the deal, then reprice the line immediately off that corrected figure rather
  // than waiting for the Firestore snapshot to come back round.
  const fixDealAndBill = async (idx) => {
    const dm = dealMismatchFor(inv.lineItems[idx]);
    if (!dm || !onFixDeal) return;
    if (!await onFixDeal(dm.deal, dm.implied)) return;
    const fixedDeal = { ...dm.deal, expected_commission_net: dm.implied };
    setInv(prev => {
      const m = matchedLine(prev.lineItems[idx], prev.id, fixedDeal);
      return m ? { ...prev, lineItems: prev.lineItems.map((li, i) => i === idx ? m : li) } : prev;
    });
  };

  // Issuing is the point of no return — an issued invoice is a tax record and is
  // voided, never edited. So confirm rather than silently issue a line whose deal
  // contradicts its own value × %.
  const issueInvoice = () => {
    const bad = (inv.lineItems || []).map(dealMismatchFor).filter(Boolean);
    if (bad.length && !window.confirm(
      `${bad.map(m => `• ${m.deal.property_name || "Deal"}: stored AED ${invFmt(m.stored / 100)}, but value × ${m.deal.commission_pct}% = AED ${invFmt(m.implied / 100)}`).join("\n")}\n\n` +
      `Issue anyway? An issued invoice cannot be edited — only cancelled with a credit note.`
    )) return;
    onSave(buildInvoice(), "issued");
  };

  // A draft is a working document, so bring every deal-linked line onto its
  // deal's outstanding commission the moment the draft is opened — the deal is
  // the source of truth for what to bill. Runs once, and only after `deals` has
  // loaded, so a later Firestore snapshot can never overwrite a hand edit.
  // Issued invoices are NEVER repriced: they are legal documents, so a mismatch
  // there is reported only.
  const autoMatched = React.useRef(false);
  const [autoMatchCount, setAutoMatchCount] = React.useState(0);
  React.useEffect(() => {
    if (autoMatched.current || !(deals && deals.length)) return;
    autoMatched.current = true;
    if ((invoice.status || "draft") !== "draft") return;
    const next = (invoice.lineItems || []).map(li => dealMismatchFor(li) ? null : matchedLine(li, invoice.id));
    const n = next.filter(Boolean).length;
    if (!n) return;
    setInv(prev => ({ ...prev, lineItems: prev.lineItems.map((li, i) => next[i] || li) }));
    setAutoMatchCount(n);
  }, [deals, invoices, invoice]);

  const addLine    = ()      => setInv(p => ({ ...p, lineItems: [...p.lineItems, invBlankLine()] }));
  const removeLine = (i)     => setInv(p => ({ ...p, lineItems: p.lineItems.filter((_, j) => j !== i) }));
  const setLine    = (i, f, v) => setInv(prev => {
    const copy = JSON.parse(JSON.stringify(prev));
    copy.lineItems[i][f] = v;
    if (["dealValue", "commissionPct", "fixedAmount", "amountMode"].includes(f)) copy.lineItems[i] = invNormalizeLine(copy.lineItems[i]);
    return copy;
  });
  const isDraft = (inv.status || "draft") === "draft";

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
              {inv.id ? "Draft invoice" : "New invoice"}{inv.claimNumber ? ` — from claim ${inv.claimNumber}` : ""}
            </h2>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              {isDraft ? "Draft — the tax invoice number is assigned when you issue it" : "Issued documents cannot be edited"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={C.btn("secondary")} onClick={() => onPreview(buildInvoice())}>Preview</button>
          <button style={C.btn()} onClick={() => onSave(buildInvoice(), "draft")} disabled={saving || !isDraft}>{saving ? "Saving…" : "Save Draft"}</button>
          {!inv.claimId && <button style={C.btn("secondary")} title="Send the developer a commission claim first — it does not use a tax-invoice number" onClick={() => onSave(buildInvoice(), "claim")} disabled={saving || !isDraft}>Issue as Claim</button>}
          <button style={{ background: G, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={issueInvoice} disabled={saving || !isDraft}>{saving ? "Issuing…" : "Issue Tax Invoice"}</button>
        </div>
      </div>

      {accrualNote && <div style={{ marginBottom: 16, fontSize: 12.5, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "10px 14px" }}>
        <strong>Accrual invoicing:</strong> issuing this tax invoice posts the receivable, the commission revenue and the output VAT on the invoice date. Receipts against it then only clear the receivable.
      </div>}

      {/* ── Invoice Details ── */}
      <div style={card}>
        <div style={sec}>Invoice Details</div>
        <div style={g3}>
          <div><label style={lbl}>Invoice No.</label><input style={ro} value={inv.invoiceNumber || ""} placeholder="Assigned when issued" readOnly /></div>
          <div><label style={lbl}>Invoice Date</label><input type="date" style={inp} value={inv.invoiceDate} onChange={e => setPath("invoiceDate", e.target.value)} /></div>
          <div>
            <label style={lbl}>Status</label>
            {/* Status is set by the action buttons, never typed — an issued tax
                invoice can only move on by a credit note. */}
            <input style={ro} readOnly value={isDraft ? "Draft" : (inv.status || "")} />
          </div>
        </div>
        <div style={{ ...g3, marginTop: 16 }}>
          <div><label style={lbl}>Date of Supply</label><input type="date" style={inp} value={inv.supplyDate || ""} onChange={e => setPath("supplyDate", e.target.value)} /></div>
          <div><label style={lbl}>Due Date</label><input type="date" style={inp} value={inv.dueDate || ""} onChange={e => setPath("dueDate", e.target.value)} /></div>
          <div><label style={lbl}>Payment Terms</label><input style={inp} value={inv.paymentTerms || ""} onChange={e => setPath("paymentTerms", e.target.value)} placeholder="e.g. Payment due within 30 days" /></div>
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
              {f === "trn" && !invTrnValid(inv.billFrom?.trn) && <div style={{ fontSize: 11, color: "#B45309", marginTop: 3 }}>A tax invoice needs the company's 15-digit TRN.</div>}
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
              <input style={inp} disabled={f === "trn" && !!inv.invoicedTo?.notRegistered} value={inv.invoicedTo?.[f] || ""} onChange={e => setPath(`invoicedTo.${f}`, e.target.value)} />
              {f === "trn" && <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "#475467", cursor: "pointer" }}>
                <input type="checkbox" checked={!!inv.invoicedTo?.notRegistered} onChange={e => setInv(p => ({ ...p, invoicedTo: { ...(p.invoicedTo || {}), notRegistered: e.target.checked, ...(e.target.checked ? { trn: "" } : {}) } }))} />
                Recipient is not VAT registered (prints “Not VAT registered”)
              </label>}
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
        {autoMatchCount > 0 && (
          <div style={{ marginBottom: 14, fontSize: 11.5, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "7px 11px", textTransform: "none", letterSpacing: 0 }}>
            ✓ {autoMatchCount === 1 ? "One line was" : `${autoMatchCount} lines were`} adjusted to match the linked deal's outstanding commission. Nothing is saved until you click Save.
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FBF6EC" }}>
                {[["Project | Unit","left","17%"],["Specification","left","19%"],["Deal Value (AED)","right","12%"],["Commission % / Amount","right","13%"],["Commission (AED)","right","13%"],["Vat 5%","right","10%"],["Total Incl. Vat","right","12%"],["","center","4%"]].map(([h,a,w]) => (
                  <th key={h} style={{ padding: "9px 10px", fontSize: 10.5, fontWeight: 700, color: "#1A1A2E", border: "1px solid #E8DCC8", textAlign: a, width: w, letterSpacing: "0.02em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li, idx) => {
                const c = invLineCalc(li);
                const pct = li.commissionPct ?? li.commission_pct;
                // Guard: linked to a deal but billing something other than that
                // deal's outstanding commission (excl. VAT — the 5% is added in
                // the VAT column). Only ever shows on an issued invoice or after
                // a hand edit; opening a draft lines it up automatically.
                const dm = dealMismatchFor(li);
                const o = dm ? null : lineOutstanding(li);
                const off = o && o.billedCents !== o.expectedCents ? o.expectedCents - o.billedCents : 0;
                return (
                  <React.Fragment key={li._id}>
                  <tr>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      {(deals && deals.length > 0) && (
                        <select style={{ ...sel, fontSize: 11, marginBottom: 6, padding: "5px 8px" }} value={li.dealId || ""} onChange={e => fillDeal(idx, e.target.value)}>
                          <option value="">— Pick deal to auto-fill —</option>
                          {deals.map(d => <option key={d.id} value={d.id}>{d.property_name}{d.unit_no ? ` · ${d.unit_no}` : ""}</option>)}
                        </select>
                      )}
                      {li.dealId && (() => {
                        const d = (deals || []).find(x => x.id === li.dealId);
                        const comms = d && typeof dealCommissions === "function" ? dealCommissions(d).commissions : [];
                        if (comms.length < 2) return null;
                        return (
                          <select style={{ ...sel, fontSize: 11, marginBottom: 6, padding: "5px 8px" }} value={li.commissionId || ""} onChange={e => fillDeal(idx, li.dealId, e.target.value)}>
                            <option value="">— Which commission? —</option>
                            {comms.map(c => <option key={c.id} value={c.id}>{c.label} · {invFmt(c.target / 100)}</option>)}
                          </select>
                        );
                      })()}
                      <input style={{ ...inp, fontSize: 12 }} placeholder="Project name / unit no." value={li.projectUnit} onChange={e => setLine(idx, "projectUnit", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <input style={{ ...inp, fontSize: 12 }} placeholder="e.g. 3% Agency Commission Claim" value={li.specification} onChange={e => setLine(idx, "specification", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <input type="number" min="0" style={{ ...inp, fontSize: 12, textAlign: "right" }} placeholder="0.00" value={li.dealValue} onChange={e => setLine(idx, "dealValue", e.target.value)} />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #E8DCC8", verticalAlign: "top" }}>
                      <select style={{ ...sel, fontSize: 11, marginBottom: 6, padding: "4px 6px" }} value={li.amountMode === "fixed" ? "fixed" : "pct"} onChange={e => setLine(idx, "amountMode", e.target.value)}>
                        <option value="pct">% of deal value</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                      {li.amountMode === "fixed"
                        ? <input type="number" min="0" step="0.01" style={{ ...inp, fontSize: 12, textAlign: "right" }} placeholder={li.vatInclusive && !li.noVat ? "Amount incl. VAT" : "Amount excl. VAT"} value={li.fixedAmount || ""} onChange={e => setLine(idx, "fixedAmount", e.target.value)} />
                        : <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #D0D5DD", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                        {/* step="any": a partial bill needs a rate finer than 2 dp to
                            land on the exact fils, and step="0.01" marks those invalid. */}
                        <input type="number" min="0" max="100" step="any" style={{ ...inp, border: "none", borderRadius: 0, fontSize: 12, textAlign: "right", flex: 1, width: "100%", minWidth: 0, padding: "8px 6px" }} placeholder="0.00" value={pct || ""} onChange={e => setLine(idx, "commissionPct", e.target.value)} />
                        <span style={{ padding: "0 7px", color: "#C9A044", fontSize: 13, fontWeight: 700, background: "#FBF6EC", borderLeft: "1px solid #E8DCC8", whiteSpace: "nowrap", userSelect: "none" }}>%</span>
                      </div>}
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
                  {dm && (
                    <tr>
                      <td colSpan={8} style={{ border: "1px solid #FECACA", borderTop: "none", background: "#FEF2F2", padding: "7px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 11.5, color: "#991B1B" }}>
                          <span>⛔</span>
                          <span>
                            <strong>Fix the deal first.</strong> {dm.deal.property_name || "This deal"} stores AED {invFmt(dm.stored / 100)},
                            but {invFmt((dm.deal.transaction_value || 0) / 100)} × {dm.deal.commission_pct}% = <strong>AED {invFmt(dm.implied / 100)}</strong> excl. VAT.
                            Billing it as it stands invoices the wrong amount.
                          </span>
                          <button type="button" style={{ ...C.btn("secondary"), fontSize: 11, padding: "3px 10px", textTransform: "none", letterSpacing: 0 }}
                            onClick={() => fixDealAndBill(idx)}>Set deal to AED {invFmt(dm.implied / 100)} and bill it</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {off !== 0 && (
                    <tr>
                      <td colSpan={8} style={{ border: "1px solid #E8DCC8", borderTop: "none", background: "#FFFBEB", padding: "7px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 11.5, color: "#92400E" }}>
                          <span>⚠</span>
                          <span>
                            {o.deal.property_name || "Deal"} outstanding <strong>AED {invFmt(o.expectedCents / 100)}</strong> excl. VAT —
                            this line bills AED {invFmt(o.billedCents / 100)}, {off > 0 ? "under" : "over"} by AED {invFmt(Math.abs(off) / 100)}.
                          </span>
                          <button type="button" style={{ ...C.btn("secondary"), fontSize: 11, padding: "3px 10px", textTransform: "none", letterSpacing: 0 }} onClick={() => billOutstanding(idx)}>Match deal</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <div style={{ width: 340, border: "1px solid #E8DCC8", borderRadius: 10, overflow: "hidden" }}>
            {[["Total Amount Excl. Vat", invFmt(T.excl)], [invVatLabel(inv.lineItems, "VAT"), invFmt(T.vat)]].map(([l, v]) => (
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
        <button style={C.btn()} onClick={() => onSave(buildInvoice(), "draft")} disabled={saving || !isDraft}>{saving ? "Saving…" : "Save Draft"}</button>
        <button style={{ background: G, color: "#fff", border: "none", padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={issueInvoice} disabled={saving || !isDraft}>{saving ? "Issuing…" : "Issue Tax Invoice"}</button>
      </div>
    </div>
  );
}

// "Received" = cash actually banked = debits on cash/bank accounts only (matches
// core's dealCollection). Summing every debit would double-count non-bank lines.
// Txn line amounts are in CENTS; invoice totals are in AED — so convert to AED.
function srReceivedAED(t, accounts) {
  const isCashAcct = id => { const a = (accounts || []).find(x => x.id === id); return !!(a && (a.isBank || a.isCash || a.code === "1001" || a.code === "1002")); };
  return (t.lines || []).reduce((s, l) => s + (isCashAcct(l.accountId) ? (l.debit || 0) : 0), 0) / 100;
}

// ═══════════════════════════════════════════════════════════════════
//  H0. LinkReceiptModal — manage the Sale Receipt(s) linked to an invoice
//  An invoice can be collected in several receipts (partial / installments).
//  Linking stamps invoice_id/invoice_no onto an SR txn — no new entry posted.
// ═══════════════════════════════════════════════════════════════════
function LinkReceiptModal({ invoice, txns, deals, accounts, linked, accrual, onLink, onUnlink, onCreateNew, onClose }) {
  // An accrual invoice already booked its revenue and VAT, so only entries that
  // CLEAR the receivable (credit 1100) may pay it; a cash-basis invoice is paid
  // by receipts that book revenue, never by a receivable-clearing entry. Either
  // mix-up would double or lose revenue. Client deposits (2230) are never a
  // payment of commission.
  const arId = ((accounts || []).find(a => a.code === AR_ACCOUNT_CODE) || {}).id;
  const creditsAr = t => !!arId && (t.lines || []).some(l => l.accountId === arId && (l.credit || 0) > 0);
  const invDealIds = new Set((invoice.lineItems || []).map(li => li.dealId).filter(Boolean));
  const invIncl = invoice.totals?.incl || 0;
  const dealName = id => (deals || []).find(d => d.id === id)?.property_name || "";
  const srGross = t => srReceivedAED(t, accounts);

  const linkedTotal = (linked || []).reduce((s, t) => s + srGross(t), 0);
  const remaining = invIncl - linkedTotal;

  // What a bank-imported line is actually *about* lives in its description /
  // narration / line memos — deal_id and counterparty are usually blank on it.
  // Everything below (label, search, name match) reads from this one blob so a
  // collection can never be present-but-invisible.
  const txnLabel = t => dealName(t.deal_id) || t.counterparty || t.description || t.import_narration || "";
  const txnText  = t => [t.description, t.import_narration, t.ref, t.counterparty, dealName(t.deal_id),
                         ...(t.lines || []).map(l => l.memo)].filter(Boolean).join(" ");

  // Words from this invoice worth matching against a bank narration: the party
  // name and each line's project / unit, minus boilerplate that matches everything.
  const LINK_NOISE = new Set(["properties", "property", "development", "developments", "developer", "estate", "real",
    "llc", "l.l.c", "company", "group", "unit", "invoice", "commission", "buyer", "seller", "from", "with", "trading"]);
  const invTokens = React.useMemo(() => {
    const raw = [invoice.invoicedTo?.companyName || "",
      ...(invoice.lineItems || []).map(li => `${li.projectUnit || ""} ${li.specification || ""}`),
      ...[...invDealIds].map(dealName)].join(" ");
    return [...new Set(raw.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
      .filter(w => w.length >= 4 && !LINK_NOISE.has(w)))];
  }, [invoice, deals]);

  // A receipt already stamped with another invoice's id is hidden by default —
  // but it is still shown on request, because "the collection I want has quietly
  // vanished from this list" is otherwise undiagnosable from the UI.
  const [showLinkedElsewhere, setShowLinkedElsewhere] = React.useState(false);

  // Candidate = any non-void transaction that received cash into a bank/cash
  // account and isn't an internal bank transfer. This includes Sale Receipts (SR),
  // manual Journal Vouchers (JV) and imported bank lines (BK) where the commission
  // was banked. Ranked: same deal, then client / project name, then amount, then recency.
  const reversedIds = React.useMemo(() => reversedTxnIds(txns), [txns]);
  const allCandidates = React.useMemo(() => (txns || [])
    .filter(t => !t.isVoid && t.txnType !== "BT" && !isClientFundsTxn(t) && !isInReversedPair(t, reversedIds) && !(t.invoice_id && t.invoice_id === invoice.id) && srGross(t) > 0 && (accrual ? creditsAr(t) : !creditsAr(t)))
    .map(t => {
      const g = srGross(t);
      const dealMatch = !!(t.deal_id && invDealIds.has(t.deal_id));
      const blob = txnText(t).toLowerCase();
      const nameMatch = !dealMatch && invTokens.some(w => blob.includes(w));
      const amtDiff = Math.abs(g - (remaining > 0.01 ? remaining : invIncl));
      const amtMatch = invIncl > 0 && amtDiff <= Math.max(1, invIncl * 0.01);
      const otherInv = t.invoice_id ? (t.invoice_no || "?") : "";
      return { t, g, dealMatch, nameMatch, amtMatch, amtDiff, otherInv,
               score: (dealMatch ? 4 : 0) + (nameMatch ? 2 : 0) + (amtMatch ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.amtDiff - b.amtDiff || (b.t.date || "").localeCompare(a.t.date || "")),
    [txns, invoice, linkedTotal, invTokens]);

  const linkedElsewhereCount = allCandidates.filter(c => c.otherInv).length;
  const candidates = showLinkedElsewhere ? allCandidates : allCandidates.filter(c => !c.otherInv);

  const money = n => <span style={{ fontVariantNumeric: "tabular-nums" }}>AED {invFmt(n)}</span>;

  // Free-text filter over everything the row knows — including the bank narration
  // and line memos, which are where a client or project name actually appears.
  const [receiptQuery, setReceiptQuery] = React.useState("");
  const shownCandidates = React.useMemo(() => {
    const needle = receiptQuery.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(({ t, g }) => {
      const hay = [txnText(t), t.date ? fmtDate(t.date) : "", t.date || "", invFmt(g), String(g)]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [candidates, receiptQuery]);

  return (
    <div style={C.modal} onClick={onClose}>
      <div style={{ ...C.mbox(1140), maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Receipts for Invoice #{invoice.invoiceNumber}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          {/* Collection summary */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { label: "Invoice total", val: invIncl, color: "#C9A044" },
              { label: `Collected (${(linked || []).length})`, val: linkedTotal, color: "#059669" },
              { label: remaining > 0.01 ? "Remaining" : "Fully collected", val: Math.abs(remaining) < 0.005 ? 0 : remaining, color: remaining > 0.01 ? "#DC2626" : "#059669" },
            ].map((c, i) => (
              <div key={i} style={{ flex: "1 1 150px", padding: "10px 14px", background: "#F9FAFB", border: "1px solid #EAECF0", borderRadius: 8 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", fontWeight: 700, marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{money(c.val)}</div>
              </div>
            ))}
          </div>

          {/* Already-linked receipts */}
          {(linked || []).length > 0 && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Linked receipts</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 108 }} />
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 84 }} />
              </colgroup>
              <tbody>
                {(linked || []).map(t => (
                  <tr key={t.id}>
                    <td style={{ ...C.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.date ? fmtDate(t.date) : "—"}</td>
                    <td style={{ ...C.td, fontFamily: "monospace", color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.ref || ""}>{t.ref || "—"}</td>
                    <td style={{ ...C.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={dealName(t.deal_id) || t.counterparty || ""}>{dealName(t.deal_id) || t.counterparty || <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                    <td style={{ ...C.td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{invFmt(srGross(t))}</td>
                    <td style={{ ...C.td, textAlign: "right" }}>
                      <button style={{ ...C.btn("secondary"), padding: "4px 8px", fontSize: 12, color: "#DC2626" }} onClick={() => onUnlink(t)}>Unlink</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {/* Add another existing receipt */}
          <div style={{ padding: "10px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: 12, fontSize: 13, color: "#1D4ED8" }}>
            {accrual
              ? <>This invoice booked its revenue and VAT when it was issued, so only collections that <strong>clear Commission Receivable (1100)</strong> are listed — receipts that booked revenue again would double it.</>
              : <>Link an existing collection already in your books — a Sale Receipt (<code>SR-</code>) or a manual Journal Voucher (<code>JV-</code>) where the commission was banked.</>}
            {" "}<strong>No new entry is posted.</strong> You can link several to one invoice (partial / instalments). Client deposits are never listed. Best matches first.
          </div>
          {allCandidates.length === 0
            ? <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No bank collections available to link. {onCreateNew && "Use “+ New receipt” below to record a new collection."}</div>
            : <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input value={receiptQuery} onChange={e => setReceiptQuery(e.target.value)} placeholder="Search date, reference, bank narration, client / project or amount…" style={{ flex: 1, border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                {receiptQuery && <button onClick={() => setReceiptQuery("")} style={{ ...C.btn("secondary"), padding: "6px 12px", fontSize: 12 }}>Clear</button>}
                <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>{shownCandidates.length} of {candidates.length}</span>
              </div>
              {linkedElsewhereCount > 0 && <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, fontSize: 12.5, color: "#6B7280", cursor: "pointer" }}>
                <input type="checkbox" checked={showLinkedElsewhere} onChange={e => setShowLinkedElsewhere(e.target.checked)} style={{ cursor: "pointer" }} />
                Also show {linkedElsewhereCount} collection{linkedElsewhereCount === 1 ? "" : "s"} already linked to another invoice — tick this if the receipt you are looking for is missing from the list.
              </label>}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 108 }} />
                  <col style={{ width: 160 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 84 }} />
                  <col style={{ width: 72 }} />
                </colgroup>
                <thead><tr>
                  {["Date", "Receipt", "Deal / Property", "Received", "Match", ""].map((h, i) => <th key={i} style={{ ...C.th, textAlign: i === 3 ? "right" : "left" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownCandidates.length === 0 && <tr><td colSpan={6} style={{ ...C.td, textAlign: "center", padding: 24, color: "#9CA3AF" }}>No receipts match this filter.</td></tr>}
                  {shownCandidates.map(({ t, g, dealMatch, nameMatch, amtMatch, otherInv }) => (
                    <tr key={t.id} style={otherInv ? { background: "#FFFBEB" } : undefined}>
                      <td style={{ ...C.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.date ? fmtDate(t.date) : "—"}</td>
                      <td style={{ ...C.td, fontFamily: "monospace", color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.ref || ""}>{t.ref || "—"}</td>
                      <td style={{ ...C.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={txnText(t)}>{txnLabel(t) || <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                      <td style={{ ...C.td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{invFmt(g)}</td>
                      <td style={{ ...C.td, whiteSpace: "nowrap" }}>
                        {dealMatch && <span style={{ ...C.badge("success") }}>deal ✓</span>}
                        {nameMatch && <span style={{ ...C.badge("success") }}>name ✓</span>}
                        {amtMatch && <span style={{ ...C.badge("info"), marginLeft: (dealMatch || nameMatch) ? 4 : 0 }}>amt ✓</span>}
                        {otherInv && <span style={{ ...C.badge("warning"), marginLeft: (dealMatch || nameMatch || amtMatch) ? 4 : 0 }}>Inv #{otherInv}</span>}
                        {!dealMatch && !nameMatch && !amtMatch && !otherInv && <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ ...C.td, textAlign: "right" }}>
                        <button
                          style={{ ...C.btn("secondary"), padding: "4px 8px", fontSize: 12, ...(otherInv
                            ? { color: "#B45309", borderColor: "#FDE68A", background: "#FFFBEB" }
                            : { color: "#047857", borderColor: "#A7F3D0", background: "#ECFDF5" }) }}
                          title={otherInv ? `Currently collected against invoice #${otherInv}` : ""}
                          onClick={() => {
                            // Moving a receipt off another invoice un-collects that
                            // invoice, so never do it silently.
                            if (otherInv && !confirm(`This collection is currently linked to invoice #${otherInv}.

Move it to invoice #${invoice.invoiceNumber}? Invoice #${otherInv} will show as uncollected again.`)) return;
                            onLink(t);
                          }}>{otherInv ? "Move" : "Link"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>}
        </div>
        <div style={C.mftr}>
          {onCreateNew && <button style={{ ...C.btn("secondary"), color: "#047857", borderColor: "#A7F3D0", background: "#ECFDF5" }} onClick={onCreateNew}>+ New receipt</button>}
          <button style={C.btn("secondary")} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  H. InvoicePage — list + orchestration
// ═══════════════════════════════════════════════════════════════════
function InvoicePage({ accounts, customers, developers, deals, txns, settings, userEmail, userRole, preselectedDeal, onClearPreselected, onCreateReceipt, onLinkReceipt }) {
  const [invoices,   setInvoices]   = React.useState(() => ls_get("invoices", []));
  const [editing,    setEditing]    = React.useState(null);
  const [previewInv, setPreviewInv] = React.useState(null);
  // Start "loaded" if we have a cached copy — paint instantly, refresh in the
  // background. Only the very first visit (empty cache) shows the spinner.
  const [loading,    setLoading]    = React.useState(() => ls_get("invoices", []).length === 0);
  const [saving,     setSaving]     = React.useState(false);
  const [sortKey,    setSortKey]    = React.useState("date");
  const [sortDir,    setSortDir]    = React.useState("desc");
  // The list is organised by what an invoice still needs from you rather than by
  // its raw status: Open (money still to collect) → Paid → Drafts → Void. A new
  // storage key, so a stale "issued"/"all" from the old status filter can't stick.
  const [bucketFilter, setBucketFilter] = usePersistedState("inv_bucket_filter", "open");
  const [query, setQuery] = React.useState("");
  const INV_STATUSES = ["issued", "void", "credited", "claim", "converted"];
  const invStatusKey = inv => INV_STATUSES.includes(inv.status) ? inv.status : "draft";
  const [creditNotes, setCreditNotes] = React.useState([]);
  const [previewKind, setPreviewKind] = React.useState(null);
  const [stmtParty, setStmtParty] = React.useState(null);
  React.useEffect(() => {
    const unsub = db.collection("credit_notes").onSnapshot(
      snap => setCreditNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error("credit_notes", err));
    return () => unsub();
  }, []);
  const creditNoteById = React.useMemo(() => new Map(creditNotes.map(cn => [cn.id, cn])), [creditNotes]);
  const openPreview = (doc, kind) => { setPreviewKind(kind || null); setPreviewInv(doc); };

  // Real-time Firestore listener
  React.useEffect(() => {
    // No server-side orderBy: the list re-sorts client-side anyway, so ordering
    // here only added a separate (uncached) query target and silently dropped any
    // invoice missing a createdAt field. Cache each snapshot to localStorage so
    // the next visit hydrates instantly instead of waiting on a network round-trip.
    const unsub = db.collection("invoices").onSnapshot(
      snap => { const data = snap.docs.map(d => ({ id: d.id, ...d.data() })); setInvoices(data); ls_set("invoices", data); setLoading(false); },
      err  => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // (The counter is created by the first issue transaction — invNextNumber
  // starts the series at INV_START_NUMBER when meta/invoiceCounter is absent.
  // The old get-then-set initialiser here could rewind a live counter.)

  // Open a pre-filled new invoice when navigated from the Deals table. Bills
  // EVERY commission side that still has an outstanding balance (so a Secondary
  // deal gets both buyer-side and seller-side lines), not just the first one.
  React.useEffect(() => {
    if (!preselectedDeal) return;
    const blank = invBlankDoc(settings);
    blank.invoicedTo = {
      ...blank.invoicedTo,
      companyName: preselectedDeal.developer || preselectedDeal.client_name || "",
      partyType: "developer",
    };
    const valueAED = preselectedDeal.transaction_value ? invFromCents(preselectedDeal.transaction_value) : "";
    const tvCents = preselectedDeal.transaction_value || 0;
    const ci = typeof commissionInvoicing === "function" ? commissionInvoicing(preselectedDeal, invoices) : null;
    let sides = ci ? ci.commissions.filter(c => c.remainingCents > 0) : [];
    if (preselectedDeal._commissionId) sides = sides.filter(c => c.id === preselectedDeal._commissionId);
    if (!sides.length && ci) sides = ci.commissions.filter(c => c.target > 0);
    const projectUnit = [preselectedDeal.property_name, preselectedDeal.unit_no].filter(Boolean).join(" – ");
    const dealIncl = typeof isVatInclusive === "function" ? isVatInclusive(preselectedDeal) : false;
    const dealNoVat = !preselectedDeal.vat_applicable;
    const mkLine = (c) => {
      const sideLabel = c.id === "buyer" ? "Buyer-side " : c.id === "seller" ? "Seller-side " : "";
      const naturalPct = c.id === "seller" ? preselectedDeal.seller_commission_pct : preselectedDeal.commission_pct;
      // Bill exactly this side's outstanding amount: the deal's own rate when it
      // lands on that, otherwise a fixed amount for the balance.
      return invNormalizeLine({
        ...invBlankLine(),
        projectUnit,
        specification: `${sideLabel || `${preselectedDeal.type || ""} `}commission — ${preselectedDeal.client_name || ""}`.trim(),
        ...invLineForTarget(tvCents, c.remainingCents, naturalPct, dealIncl, dealNoVat),
        dealId: preselectedDeal.id || "",
        commissionId: c.id,
      });
    };
    blank.lineItems = sides.length ? sides.map(mkLine) : [{
      ...invBlankLine(),
      projectUnit,
      specification: `${preselectedDeal.type || ""} commission — ${preselectedDeal.client_name || ""}`.trim(),
      dealValue: valueAED,
      ...(parseFloat(preselectedDeal.commission_pct) > 0
        ? { amountMode: "pct", commissionPct: preselectedDeal.commission_pct }
        : { amountMode: "fixed", fixedAmount: invFromCents(preselectedDeal.expected_commission_net || 0) }),
      dealId: preselectedDeal.id || "",
      commissionId: "single",
      vatInclusive: dealIncl,
      noVat: dealNoVat,
    }];
    setEditing(blank);
    if (onClearPreselected) onClearPreselected();
  }, [preselectedDeal]);

  // Number is NOT assigned on New — it is assigned at first Save to avoid gaps
  const handleNew = () => {
    setEditing(invBlankDoc(settings));
  };

  // Correct a deal's stored commission from the invoice screen. The deal is the
  // source of truth for what to bill, so a stored net that contradicts its own
  // value × % has to be fixed there — patching the invoice instead just hides it.
  // Resolves true only once the deal is actually written, so the caller knows it
  // is safe to reprice the line off the corrected figure.
  const handleFixDeal = async (deal, cents) => {
    if (!deal || !deal.id) return false;
    // Rewriting a deal's commission is a deal edit — same right as the Deals page.
    if (!hasPermission(userRole, 'sales.edit')) { toast("Changing a deal's commission needs Sales · Edit permission", "error"); return false; }
    const label = deal.property_name || "this deal";
    // The stored figure is the NET under either VAT mode, but how it relates to
    // value × % differs — say which basis is in play rather than assuming "on top".
    const incl = typeof isVatInclusive === "function" ? isVatInclusive(deal) : false;
    const basis = !deal.vat_applicable
      ? `That is ${invFmt((deal.transaction_value || 0) / 100)} × ${deal.commission_pct}%. No VAT applies.`
      : incl
        ? `That is ${invFmt((deal.transaction_value || 0) / 100)} × ${deal.commission_pct}% with the 5% VAT taken out of it, ` +
          `so the invoice still totals AED ${invFmt(((deal.transaction_value || 0) * (parseFloat(deal.commission_pct) || 0) / 100) / 100)} including VAT.`
        : `That is ${invFmt((deal.transaction_value || 0) / 100)} × ${deal.commission_pct}%, excluding VAT. ` +
          `The 5% VAT is added on top on the invoice.`;
    if (!window.confirm(
      `Set ${label}'s expected commission to AED ${invFmt(cents / 100)}?\n\n${basis}`
    )) return false;
    try {
      await db.collection("deals").doc(deal.id).set({ expected_commission_net: cents }, { merge: true });
      if (typeof logAudit === "function") logAudit("deal_commission_fix_from_invoice", { dealId: deal.id, from: deal.expected_commission_net || 0, to: cents }, userRole, userEmail);
      toast(`Deal set to AED ${invFmt(cents / 100)} — invoice updated to match`, "success");
      return true;
    } catch (err) {
      toast("Could not update the deal: " + err.message, "error");
      return false;
    }
  };

  // action: "draft" (save, no number), "issued" (tax invoice), "claim"
  // (commission claim — own CC- series, not a tax document).
  const handleSave = async (inv, action) => {
    // Only a draft is editable. An issued document is a tax record: it is
    // duplicated into a new draft, or cancelled with a credit note.
    const stored = inv.id ? (invoices || []).find(x => x.id === inv.id) : null;
    if (stored && (stored.status || "draft") !== "draft") {
      toast("This document is already issued and cannot be edited. Use Duplicate to start a new draft.", "error");
      return;
    }
    const finalInv = invWithDerivedTotals(inv);
    const issuing = action === "issued" || action === "claim";
    const errs = invValidate(finalInv, action === "issued");
    if (issuing && errs.length) { errs.forEach(e => toast(e, "error")); return; }
    if (!issuing) errs.forEach(e => toast(e, "warning"));
    if (action === "issued") {
      try { assertPeriodOpen({ next: { date: finalInv.invoiceDate }, settings }); }
      catch (e) { toast(`Cannot issue: ${e.message}`, "error"); return; }
    }
    setSaving(true);
    try {
      if (!issuing) {
        const payload = invClean({ ...finalInv, status: "draft", updatedAt: invTs(), updatedBy: userEmail || "" });
        if (finalInv.id) await db.collection("invoices").doc(finalInv.id).set(payload, { merge: true });
        else await db.collection("invoices").add({ ...payload, createdAt: invTs(), createdBy: userEmail || "" });
        toast("Draft saved", "success");
        setEditing(null);
        return;
      }
      // Accrual invoicing (Settings › Invoicing): book receivable, revenue and
      // output VAT now, at the tax point. Built once up front so a missing
      // account fails before anything is written.
      let makeArTxn = null, arAccountToCreate = null;
      if (action === "issued" && invoiceUsesAccrual(settings, finalInv.invoiceDate)) {
        if (!hasPermission(userRole, 'accounting.create')) { toast("Issuing an accrual invoice posts to the ledger — it needs Accounting · Create permission", "error"); return; }
        const existingAr = (accounts || []).find(a => a.code === AR_ACCOUNT_CODE);
        arAccountToCreate = existingAr ? null : AR_ACCOUNT_SEED;
        const acctList = existingAr ? accounts : [...(accounts || []), AR_ACCOUNT_SEED];
        // "Developer paid first, then asked for the tax invoice": that cash was
        // already booked as revenue + VAT by a cash-basis Sale Receipt. Booking
        // it again here would double both. Issue such an invoice on the cash
        // basis instead (date it before the accrual start, or receipt-link it).
        const clash = [...new Set((finalInv.lineItems || []).map(li => li.dealId).filter(Boolean))]
          .map(id => (deals || []).find(d => d.id === id)).filter(Boolean)
          .filter(d => dealHasCashBasisRevenue(d, txns, accounts));
        if (clash.length) {
          toast(`${clash.map(d => d.property_name || d.id).join(", ")}: commission was already received and booked as revenue on the cash basis. An accrual invoice would book the revenue and VAT a second time — issue it dated before the accrual start, or link the existing receipt instead.`, "error");
          return;
        }
        invBuildArTxn({ ...finalInv, invoiceNumber: "check" }, { deals, accounts: acctList });
        makeArTxn = doc => invBuildArTxn(doc, { deals, accounts: acctList });
      }
      const kind = action === "claim" ? "claim" : "invoice";
      const issued = await invIssueInTransaction({ inv: finalInv, kind, userEmail, makeArTxn, arAccountToCreate });
      toast(kind === "claim" ? `Commission claim ${issued.claimNumber} issued`
        : `Tax invoice #${issued.invoiceNumber} issued${issued.arTxnId ? " — receivable, revenue and VAT posted" : ""}`, "success");
      if (typeof logAudit === "function") logAudit(kind === "claim" ? "claim_issued" : "invoice_issued", { invoiceId: issued.id, number: issued.invoiceNumber || issued.claimNumber, total: issued.totals?.incl, accrual: !!issued.arTxnId }, userRole, userEmail);
      setEditing(null);
      // Freeze what was issued (background — the issue itself is already done).
      invFreezePdf(issued.id, <InvoicePreviewDoc invoice={issued} kind={kind} />)
        .catch(err => toast("Issued — but the frozen PDF copy could not be saved: " + err.message, "warning"));
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // A fresh draft from any document: same party, lines and bank details, no
  // number, today's dates. `fromClaim` links the draft to the claim it converts.
  const STRIP_ON_COPY = ["id", "status", "invoiceNumber", "invoiceNumberRaw", "issuedAt", "issuedBy", "createdAt", "createdBy", "updatedAt", "updatedBy",
    "arTxnId", "accountingBasis", "creditNoteId", "creditNoteNumber", "creditedAt", "creditedBy", "claimNumber", "claimNumberRaw",
    "convertedInvoiceId", "convertedInvoiceNumber", "claimId"];
  const handleDuplicate = (inv, fromClaim = false) => {
    const copy = JSON.parse(JSON.stringify(inv));
    STRIP_ON_COPY.forEach(k => delete copy[k]);
    const today = todayStr();
    const draft = { ...copy, status: "draft", invoiceDate: today, supplyDate: today, dueDate: invAddDays(today, 30),
      lineItems: (copy.lineItems || []).map(li => ({ ...li, _id: invBlankLine()._id })),
      ...(fromClaim ? { claimId: inv.id, claimNumber: inv.claimNumber } : {}) };
    setEditing(draft);
  };

  // Cancel an issued tax invoice with a tax credit note (FTA: an issued tax
  // invoice is never edited or voided — it is credited).
  const handleCreditNote = async (inv) => {
    const rcs = receiptsByInvoiceId.get(inv.id) || [];
    if (rcs.length) {
      toast(`Invoice #${inv.invoiceNumber} has ${rcs.length} receipt(s) linked. Unlink or reverse them first — then credit the invoice.`, "warning");
      return;
    }
    if (inv.arTxnId && !hasPermission(userRole, 'accounting.create')) { toast("This invoice's credit note posts to the ledger — it needs Accounting · Create permission", "error"); return; }
    let makeCnTxn = null;
    if (inv.arTxnId) {
      const ar = (txns || []).find(t => t.id === inv.arTxnId);
      if (!ar) { toast("The invoice's receivable entry is not in the ledger — cannot post the credit note", "error"); return; }
      if (reversedTxnIds(txns).has(ar.id)) { toast("The invoice's receivable entry was already reversed in the Journal — it cannot be credited again", "error"); return; }
      makeCnTxn = cn => invBuildCreditNoteTxn(ar, cn);
    }
    const date = todayStr();
    try { assertPeriodOpen({ next: { date }, settings }); } catch (e) { toast(e.message, "error"); return; }
    const reason = window.prompt(
      `Issue a tax credit note cancelling invoice #${inv.invoiceNumber} (AED ${invFmt(inv.totals?.incl)}) in full?\n\n` +
      (inv.arTxnId ? "Its receivable, revenue and VAT will be reversed today.\n\n" : "") +
      "Reason (printed on the credit note):", "");
    if (reason === null) return;
    try {
      const cn = await invCreditInTransaction({ inv, date, reason: reason.trim(), userEmail, makeCnTxn });
      toast(`Credit note ${cn.number} issued — invoice #${inv.invoiceNumber} cancelled`, "success");
      if (typeof logAudit === "function") logAudit("credit_note_issued", { invoiceId: inv.id, creditNoteId: cn.id, number: cn.number, total: inv.totals?.incl }, userRole, userEmail);
      invFreezePdf(cn.id, <InvoicePreviewDoc invoice={cn} kind="credit_note" />)
        .catch(err => toast("Credit note issued — but its frozen PDF could not be saved: " + err.message, "warning"));
    } catch (err) { toast("Credit note failed: " + err.message, "error"); }
  };

  // Drafts are deleted; a claim is withdrawn (kept on record). Issued tax
  // invoices are not deleted or voided at all — see handleCreditNote.
  const handleDelete = async (inv) => {
    const status = (inv && inv.status) || "draft";
    if (status === "claim") {
      if (!window.confirm(`Withdraw commission claim ${inv.claimNumber}? It stays on record marked "Void".`)) return;
      try { await db.collection("invoices").doc(inv.id).set({ status: "void", updatedAt: invTs(), updatedBy: userEmail || "" }, { merge: true }); toast("Claim withdrawn", "success"); }
      catch (err) { toast("Withdraw failed: " + err.message, "error"); }
      return;
    }
    if (status !== "draft") { toast("Issued documents cannot be deleted — issue a credit note instead", "error"); return; }
    if (!window.confirm("Delete this draft permanently?")) return;
    try {
      await db.collection("invoices").doc(inv.id).delete();
      toast("Draft deleted", "success");
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  };

  // Every (non-void) transaction linked to each invoice by invoice_id, as an
  // array — an invoice can be collected across several receipts (partial /
  // instalments), and the collection may be booked as a Sale Receipt (SR) OR a
  // manual Journal Voucher (JV). Live via the txns listener; self-heals on void.
  const receiptsByInvoiceId = React.useMemo(() => {
    const m = new Map();
    // A reversed receipt (bounced cheque) and its reversal net to zero — neither
    // pays the invoice. Without this the invoice stayed "Paid" after a reversal.
    const reversed = reversedTxnIds(txns);
    (txns || []).forEach(t => {
      // An accrual invoice's own issue entry (IN) and credit note (CN) carry
      // invoice_id too — they are the invoice, not money received against it.
      if (!t.isVoid && t.invoice_id && !isInvoiceOwnedTxn(t) && !isInReversedPair(t, reversed)) {
        if (!m.has(t.invoice_id)) m.set(t.invoice_id, []);
        m.get(t.invoice_id).push(t);
      }
    });
    return m;
  }, [txns]);

  // Brokers behind an invoice, via the deals its lines bill. Shared by the Broker
  // column and the search index so the two can never disagree.
  const brokerNamesOf = React.useCallback(inv => {
    const ids = [...new Set((inv.lineItems || []).map(li => li.dealId).filter(Boolean))];
    return [...new Set(ids.map(id => (deals || []).find(d => d.id === id)?.broker_name).filter(Boolean))];
  }, [deals]);

  // Per-invoice collection state. `paid` counts only cash actually banked, so an
  // invoice collected in instalments sits in "partial" until the last dirham
  // lands. Sub-AED remainders are rounding, not a debt — hence the 0.5 tolerance.
  const invMeta = React.useMemo(() => {
    const m = new Map();
    const today = todayStr();
    (invoices || []).forEach(inv => {
      const rcs    = receiptsByInvoiceId.get(inv.id) || [];
      const paid   = rcs.reduce((s, t) => s + srReceivedAED(t, accounts), 0);
      const total  = inv.totals?.incl || 0;
      const due    = Math.max(0, total - paid);
      const overpaid = paid - total > 0.5 ? paid - total : 0;
      const status = invStatusKey(inv);
      const bucket = status !== "issued"  ? status       // draft / claim / credited / void / converted
                   : rcs.length === 0     ? "unpaid"
                   : due > 0.5            ? "partial"
                   : "paid";
      const dueOn = invDueDateOf(inv);
      const overdueDays = (bucket === "unpaid" || bucket === "partial") && dueOn && dueOn < today
        ? Math.round((new Date(today + "T12:00:00") - new Date(dueOn + "T12:00:00")) / 86400000) : 0;
      m.set(inv.id, { rcs, paid, total, due, overpaid, bucket, overdueDays, open: bucket === "unpaid" || bucket === "partial" });
    });
    return m;
  }, [invoices, receiptsByInvoiceId, accounts]);

  // One lower-cased haystack per invoice: number, both date spellings, client,
  // broker, what was billed, and the total — so a single box answers "find the
  // one for Tarek in Aug" without the user picking a field first.
  const searchIndex = React.useMemo(() => {
    const m = new Map();
    (invoices || []).forEach(inv => m.set(inv.id, [
      inv.invoiceNumber, inv.invoiceNumberRaw, inv.invoiceDate, invFmtDate(inv.invoiceDate),
      inv.invoicedTo?.companyName, brokerNamesOf(inv).join(" "),
      (inv.lineItems || []).map(li => `${li.projectUnit || ""} ${li.specification || ""}`).join(" "),
      invFmt(inv.totals?.incl),
    ].filter(Boolean).join(" ").toLowerCase()));
    return m;
  }, [invoices, brokerNamesOf]);

  // Hand off to the Sale Receipts page with a receipt pre-filled from this invoice
  // (deal, amount incl VAT, today's date) so the collection lands on the deal card
  // with no re-entry. Mirrors the deals→invoice navigation pattern.
  const handleCreateReceipt = (inv) => {
    if (!onCreateReceipt) { toast("Receipt hand-off isn't available here", "error"); return; }
    const lis = inv.lineItems || [];
    // The next receipt covers the first deal whose share is still unpaid, for
    // exactly what is left of it — so on a multi-deal invoice each "+ Receipt"
    // moves on to the next deal instead of receipting deal 1 again.
    const plan = invReceiptPlan(inv, receiptsByInvoiceId.get(inv.id) || [], accounts);
    if (plan.dueCents <= 0) { toast(`Invoice #${inv.invoiceNumber} is fully collected`, "info"); return; }
    const dealId = plan.dealId;
    const gross = plan.dueCents / 100;
    if (plan.dealCount > 1) toast(`Invoice #${inv.invoiceNumber} covers ${plan.dealCount} deals — this receipt is for ${(deals || []).find(d => d.id === dealId)?.property_name || "the next unpaid deal"}.`, "info");
    // The receipt must split VAT the way the invoice charged it: 0% when the
    // receipted lines carry no VAT (non-VAT-applicable deal), 5% otherwise.
    const receiptLines = dealId ? lis.filter(li => li.dealId === dealId) : lis;
    const receiptVat = receiptLines.length && receiptLines.every(li => invLineCalc(li).vat === 0) ? 0 : 5;
    onCreateReceipt({
      deal_id:     dealId,
      grossAmount: gross ? parseFloat(gross.toFixed(2)) : "",
      vatRate:     receiptVat,
      bankCode:    "1002",
      date:        todayStr(),
      invoice_id:  inv.id || "",
      invoice_no:  inv.invoiceNumber || "",
      // Accrual invoice: the receipt only clears the receivable (no revenue/VAT).
      ar:          invoiceIsAccrual(inv),
    });
  };

  // Attach an already-recorded Sale Receipt to an invoice (stamps invoice_id on
  // the SR txn) — for collections booked before the "+ Receipt" flow existed.
  const [linkInv, setLinkInv] = React.useState(null);
  const handleLink = async (srTxn) => {
    if (!onLinkReceipt || !linkInv) return;
    // Keep the modal open so several receipts can be linked in a row; the linked
    // list / candidates refresh live as txns update.
    try {
      await onLinkReceipt(srTxn, linkInv);
      toast(`Linked ${srTxn.ref || "receipt"} to Invoice #${linkInv.invoiceNumber}`, "success");
    } catch (e) { toast("Link failed: " + e.message, "error"); }
  };
  const handleUnlink = async (srTxn) => {
    if (!onLinkReceipt || !srTxn) return;
    if (!window.confirm(`Unlink ${srTxn.ref || "this receipt"} from the invoice?\n\nThe Sale Receipt stays in your books — only the link is removed.`)) return;
    try {
      await onLinkReceipt(srTxn, null);
      toast("Receipt unlinked", "success");
    } catch (e) { toast("Unlink failed: " + e.message, "error"); }
  };

  // Editor view
  if (editing) return (
    <>
      <InvoiceEditor
        invoice={editing}
        customers={customers || []}
        developers={developers || []}
        deals={deals || []}
        invoices={invoices || []}
        settings={settings || {}}
        onSave={handleSave}
        onPreview={inv => openPreview(inv)}
        onCancel={() => setEditing(null)}
        onFixDeal={handleFixDeal}
        saving={saving}
        accrualNote={invoiceUsesAccrual(settings, editing.invoiceDate)}
      />
      {previewInv && <InvoicePreviewModal invoice={previewInv} kind={previewKind} onClose={() => setPreviewInv(null)} />}
    </>
  );

  // List view
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Tax Invoices</h2>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#6B7280" }}>Create, manage, and export professional UAE tax invoices
            {invoiceAccrualSettings(settings).enabled && invoiceAccrualSettings(settings).from && <> · <strong style={{ color: "#047857" }}>accrual invoicing from {invFmtDate(invoiceAccrualSettings(settings).from)}</strong></>}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {invoices.length > 0 && <button style={C.btn("secondary")} title="Statement of account and aging for one developer or client" onClick={() => setStmtParty("")}>📄 Statement</button>}
          {hasPermission(userRole, 'sales.create') && <button style={C.btn()} onClick={handleNew}>+ New Invoice</button>}
        </div>
      </div>

      {!loading && invoices.length > 0 && (() => {
        const counts = { open: 0, paid: 0, draft: 0, claim: 0, credited: 0, void: 0, converted: 0, all: invoices.length };
        let openDue = 0, overdueCount = 0, overdueDue = 0;
        invoices.forEach(inv => {
          const b = invMeta.get(inv.id) || {};
          const k = b.open ? "open" : b.bucket;
          counts[k] = (counts[k] || 0) + 1;
          if (b.open) { openDue += b.due; if (b.overdueDays > 0) { overdueCount++; overdueDue += b.due; } }
        });
        const chips = [
          ["open",  "Open",   "#B54708", "Issued and still owed to you"],
          ["paid",  "Paid",   "#027A48", "Fully collected — parked out of the way"],
          ["draft", "Drafts", "#475467", "Not issued yet"],
        ];
        if (counts.claim > 0) chips.push(["claim", "Claims", "#6941C6", "Commission claims awaiting a tax invoice"]);
        if (counts.credited > 0) chips.push(["credited", "Credited", "#667085", "Cancelled by a tax credit note"]);
        if (counts.void > 0) chips.push(["void", "Void", "#667085", "Voided (legacy) or withdrawn claims"]);
        chips.push(["all", "All", "#344054", "Every invoice"]);
        return <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {chips.map(([k, label, accent, tip]) => {
              const active = bucketFilter === k;
              return <button key={k} title={tip} onClick={() => setBucketFilter(k)} style={{
                padding: "6px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${active ? accent : "#E5E7EB"}`, background: active ? accent : "#fff",
                color: active ? "#fff" : "#475569", transition: "all .12s",
                opacity: query ? 0.55 : 1,
              }}>{label} <span style={{ opacity: active ? 0.8 : 0.6, fontWeight: 700, color: active ? "#fff" : accent }}>{counts[k] || 0}</span></button>;
            })}
            <div style={{ marginLeft: "auto", position: "relative", minWidth: 250 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#98A2B3", pointerEvents: "none" }}>🔍</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setQuery(""); }}
                placeholder="Search number, date, client, broker…"
                style={{ ...C.input, padding: "8px 30px 8px 32px", borderRadius: 999 }}
              />
              {query && <button onClick={() => setQuery("")} title="Clear (Esc)" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "#98A2B3", fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>}
            </div>
          </div>
          {!query && bucketFilter === "open" && counts.open > 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "#475467", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span><strong style={{ color: "#B54708", fontSize: 13.5 }}>AED {invFmt(openDue)}</strong> still to collect from {counts.open} invoice{counts.open === 1 ? "" : "s"}</span>
              {overdueCount > 0 && <span style={{ ...C.badge("danger") }}>{overdueCount} overdue · AED {invFmt(overdueDue)}</span>}
            </div>
          )}
        </div>;
      })()}

      {loading ? (
        <div style={{ textAlign: "center", padding: 64, color: "#9CA3AF" }}>Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 22 }}>Create your first invoice to get started</div>
          {hasPermission(userRole, 'sales.create') && <button style={C.btn()} onClick={handleNew}>+ New Invoice</button>}
        </div>
      ) : (() => {
        const toggleSort = (key) => {
          if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
          else { setSortKey(key); setSortDir("asc"); }
        };
        const arrow = (key) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";
        const sortBtnStyle = (key) => ({ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: sortKey === key ? "#C9A044" : "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" });
        // A search looks across every bucket on purpose: an invoice must never be
        // able to hide behind the filter that happens to be selected.
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filtered = invoices.filter(inv => {
          if (terms.length) return terms.every(t => (searchIndex.get(inv.id) || "").includes(t));
          if (bucketFilter === "all") return true;
          const b = invMeta.get(inv.id) || {};
          return bucketFilter === "open" ? !!b.open : b.bucket === bucketFilter;
        });
        const sorted = [...filtered].sort((a, b) => {
          let av, bv;
          if (sortKey === "number") {
            av = a.invoiceNumberRaw ?? 0;
            bv = b.invoiceNumberRaw ?? 0;
            return sortDir === "asc" ? av - bv : bv - av;
          }
          av = a.invoiceDate || "";
          bv = b.invoiceDate || "";
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        return (
        <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
          {terms.length > 0 && (
            <div style={{ padding: "9px 16px", background: "#F9FAFB", borderBottom: "1px solid #EAECF0", fontSize: 12.5, color: "#475467", display: "flex", alignItems: "center", gap: 10 }}>
              <span><strong>{sorted.length}</strong> match{sorted.length === 1 ? "" : "es"} for “{query.trim()}” — searching all {invoices.length} invoices, any status</span>
              <button onClick={() => setQuery("")} style={{ ...C.btn("ghost", true), marginLeft: "auto", color: "#C9A044" }}>Clear search</button>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #EAECF0" }}>
                <th style={{ ...C.th, borderLeft: "3px solid transparent" }}><button style={sortBtnStyle("number")} onClick={() => toggleSort("number")}>Invoice No.{arrow("number")}</button></th>
                <th style={C.th}><button style={sortBtnStyle("date")} onClick={() => toggleSort("date")}>Date{arrow("date")}</button></th>
                {[["Developer / Client",""],["Broker",""],["Excl. VAT","right"],["VAT","right"],["Total Incl. VAT","right"],["Status",""],["Actions",""]].map(([h,a]) => (
                  <th key={h} style={{ ...C.th, textAlign: a || "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && <tr><td colSpan={9} style={{ ...C.td, textAlign: "center", padding: 32, color: "#9CA3AF" }}>
                {terms.length ? <>Nothing matches “{query.trim()}”. Try an invoice number, a broker, or a month like “Aug”.</>
                  : bucketFilter === "open" ? "Nothing outstanding — every issued invoice has been collected. 🎉"
                  : `No ${bucketFilter} invoices.`}
              </td></tr>}
              {sorted.map(inv => {
                // Settled work recedes, live work leads. Paid/void rows go quiet
                // (grey text, no gold) while anything still owed keeps full contrast
                // and carries a coloured left edge — gold when open, red once overdue.
                const meta = invMeta.get(inv.id) || {};
                const dim  = ["paid", "void", "credited", "converted"].includes(meta.bucket);
                const accent = meta.bucket === "unpaid" ? (meta.overdueDays > 0 ? "#D92D20" : "#C9A044")
                             : meta.bucket === "partial" ? "#F79009"
                             : meta.bucket === "draft" ? "#D0D5DD"
                             : meta.bucket === "claim" ? "#9E77ED"
                             : "transparent";
                const rowTitle = meta.bucket === "paid" ? `Paid in full — AED ${invFmt(meta.paid)} received. Best not to edit.`
                               : meta.bucket === "partial" ? `AED ${invFmt(meta.paid)} received of AED ${invFmt(meta.total)} — AED ${invFmt(meta.due)} still due.`
                               : meta.overdueDays > 0 ? `Due ${invFmtDate(inv.dueDate)} — ${meta.overdueDays} day${meta.overdueDays === 1 ? "" : "s"} overdue.`
                               : undefined;
                return (
                <tr key={inv.id} title={rowTitle} style={{ borderTop: "1px solid #F2F4F7", background: dim ? "#FCFCFD" : undefined, color: dim ? "#98A2B3" : undefined }}>
                  <td style={{ ...C.td, borderLeft: `3px solid ${accent}` }}><strong style={{ color: dim ? "#98A2B3" : "#C9A044", fontFamily: "monospace", fontSize: 13, textDecoration: meta.bucket === "void" || meta.bucket === "credited" ? "line-through" : undefined }}>
                    {meta.bucket === "draft" ? <span style={{ color: "#98A2B3", fontStyle: "italic", fontFamily: "inherit" }}>{inv.invoiceNumber ? `${inv.invoiceNumber} (draft)` : "Draft"}</span>
                      : (meta.bucket === "claim" || meta.bucket === "converted" || (meta.bucket === "void" && inv.claimNumber)) ? inv.claimNumber : inv.invoiceNumber}</strong></td>
                  <td style={C.td}>{invFmtDate(inv.invoiceDate)}</td>
                  <td style={{ ...C.td, color: dim ? "#98A2B3" : undefined, fontWeight: dim ? 400 : 500 }}>{inv.invoicedTo?.companyName || "—"}</td>
                  <td style={{ ...C.td, color: dim ? "#98A2B3" : undefined }}>{(() => {
                    const names = brokerNamesOf(inv);
                    return names.length > 0 ? names.join(", ") : <span style={{ color: "#9CA3AF" }}>—</span>;
                  })()}</td>
                  <td style={{ ...C.td, textAlign: "right", color: dim ? "#98A2B3" : undefined }}>{invFmt(inv.totals?.excl)}</td>
                  <td style={{ ...C.td, textAlign: "right", color: dim ? "#B0B7C3" : "#6B7280" }}>{invFmt(inv.totals?.vat)}</td>
                  <td style={{ ...C.td, textAlign: "right", fontWeight: 700, color: dim ? "#98A2B3" : "#C9A044" }}>{invFmt(inv.totals?.incl)}</td>
                  <td style={C.td}>
                    {meta.bucket === "void"    && <span style={C.badge("neutral")}>{inv.claimNumber ? "Withdrawn" : "Void"}</span>}
                    {meta.bucket === "draft"   && <span style={C.badge("warning")}>Draft</span>}
                    {meta.bucket === "claim"   && <span style={C.badge("purple")}>Claim</span>}
                    {meta.bucket === "converted" && <span style={C.badge("neutral")} title={`Invoiced as #${inv.convertedInvoiceNumber || "?"}`}>→ Inv #{inv.convertedInvoiceNumber || "?"}</span>}
                    {meta.bucket === "credited" && <span style={C.badge("neutral")}>Credited · {inv.creditNoteNumber || "CN"}</span>}
                    {meta.bucket === "paid"    && <span style={C.badge("success")}>✓ Paid</span>}
                    {meta.overpaid > 0 && <div style={{ fontSize: 10.5, color: "#B42318", marginTop: 3, fontWeight: 700 }} title="Receipts exceed the invoice total — refund or allocate the surplus">Overpaid AED {invFmt(meta.overpaid)}</div>}
                    {inv.arTxnId && <div style={{ fontSize: 9.5, color: "#047857", marginTop: 3, fontWeight: 700, letterSpacing: "0.04em" }} title="Receivable, revenue and VAT were booked when this invoice was issued">ACCRUAL</div>}
                    {meta.bucket === "unpaid"  && <span style={C.badge(meta.overdueDays > 0 ? "danger" : "gold")}>{meta.overdueDays > 0 ? `Overdue ${meta.overdueDays}d` : "Unpaid"}</span>}
                    {meta.bucket === "partial" && <>
                      <span style={C.badge("info")}>Part-paid</span>
                      <div style={{ fontSize: 10.5, color: meta.overdueDays > 0 ? "#B42318" : "#B54708", marginTop: 3, fontWeight: 600 }}>AED {invFmt(meta.due)} due</div>
                    </>}
                  </td>
                  <td style={{ ...C.td, opacity: dim ? 0.65 : 1 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {meta.bucket === "draft" && hasPermission(userRole, 'sales.edit') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing({ ...inv })}>Edit</button>}
                      <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => openPreview(inv)}>Preview</button>
                      {meta.bucket === "credited" && inv.creditNoteId && creditNoteById.get(inv.creditNoteId) && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} onClick={() => openPreview(creditNoteById.get(inv.creditNoteId), "credit_note")}>Credit note</button>}
                      {meta.bucket === "claim" && hasPermission(userRole, 'sales.create') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#6941C6", borderColor: "#D6BBFB" }} title="Start the tax invoice for this approved claim" onClick={() => handleDuplicate(inv, true)}>→ Tax invoice</button>}
                      {meta.bucket !== "draft" && meta.bucket !== "claim" && hasPermission(userRole, 'sales.create') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} title="Start a new draft from this document" onClick={() => handleDuplicate(inv)}>Duplicate</button>}
                      {inv.status === "issued" && hasPermission(userRole, 'accounting.create') && (() => {
                        const rcs = receiptsByInvoiceId.get(inv.id) || [];
                        if (rcs.length > 0) {
                          const total = rcs.reduce((s, t) => s + srReceivedAED(t, accounts), 0);
                          const title = `${rcs.length} receipt${rcs.length > 1 ? "s" : ""} · AED ${invFmt(total)}\n${rcs.map(t => t.ref).filter(Boolean).join(", ")}\nClick to view / add / unlink`;
                          return <button title={title} onClick={() => setLinkInv(inv)} style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#059669", borderColor: "#A7F3D0", background: "#F0FDF4" }}>✓ {rcs.length} Receipt{rcs.length > 1 ? "s" : ""}</button>;
                        }
                        return <>
                          <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#047857", borderColor: "#A7F3D0", background: "#ECFDF5" }} title="Record commission collected against this invoice" onClick={() => handleCreateReceipt(inv)}>+ Receipt</button>
                          {onLinkReceipt && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12 }} title="Link an existing Sale Receipt already in your books to this invoice" onClick={() => setLinkInv(inv)}>⇄ Link</button>}
                        </>;
                      })()}
                      {meta.bucket === "draft" && hasPermission(userRole, 'sales.edit') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#DC2626" }} onClick={() => handleDelete(inv)}>Delete</button>}
                      {meta.bucket === "claim" && hasPermission(userRole, 'sales.edit') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#DC2626" }} onClick={() => handleDelete(inv)}>Withdraw</button>}
                      {inv.status === "issued" && hasPermission(userRole, 'sales.edit') && <button style={{ ...C.btn("secondary"), padding: "4px 10px", fontSize: 12, color: "#DC2626" }} title="Cancel this tax invoice with a tax credit note" onClick={() => handleCreditNote(inv)}>Credit note</button>}
                    </div>
                  </td>
                </tr>
                ); })}
            </tbody>
          </table>
        </div>
        );
      })()}

      {previewInv && <InvoicePreviewModal
        invoice={previewInv}
        kind={previewKind}
        onClose={() => setPreviewInv(null)}
        onCreateReceipt={previewKind !== "credit_note" && previewInv.status === "issued" && hasPermission(userRole, 'accounting.create')
          ? () => { const inv = previewInv; setPreviewInv(null); handleCreateReceipt(inv); }
          : null}
        alreadyReceipted={receiptsByInvoiceId.has(previewInv.id)}
        receiptRef={(receiptsByInvoiceId.get(previewInv.id) || [])[0]?.ref}
      />}

      {linkInv && <LinkReceiptModal
        invoice={linkInv}
        txns={txns}
        deals={deals}
        accounts={accounts}
        linked={receiptsByInvoiceId.get(linkInv.id) || []}
        accrual={invoiceIsAccrual(linkInv)}
        onLink={handleLink}
        onUnlink={handleUnlink}
        onCreateNew={onCreateReceipt ? () => { const inv = linkInv; setLinkInv(null); handleCreateReceipt(inv); } : null}
        onClose={() => setLinkInv(null)}
      />}

      {stmtParty !== null && <InvStatementModal
        invoices={invoices}
        metaOf={inv => invMeta.get(inv.id)}
        initialParty={stmtParty}
        onClose={() => setStmtParty(null)}
      />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  I. Statement of account — one developer / client, open items + aging
// ═══════════════════════════════════════════════════════════════════
const INV_STMT_EL = "inv-statement-capture";
function InvStatementModal({ invoices, metaOf, initialParty, onClose }) {
  const parties = React.useMemo(() => {
    const m = new Map();
    (invoices || []).filter(inv => inv.status === "issued").forEach(inv => {
      const k = invPartyKey(inv);
      if (!m.has(k)) m.set(k, { key: k, name: (inv.invoicedTo && inv.invoicedTo.companyName) || "(no name)", invoicedTo: inv.invoicedTo || {} });
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);
  const [party, setParty] = React.useState(initialParty || (parties[0] && parties[0].key) || "");
  const [exporting, setExporting] = React.useState(false);
  const today = todayStr();
  const st = React.useMemo(() => party ? invStatement(invoices, metaOf, party, today) : null, [party, invoices, metaOf, today]);
  const p = parties.find(x => x.key === party);
  const th = { padding: "7px 8px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#475467", borderBottom: "2px solid #B58A2A", textAlign: "left" };
  const td = { padding: "6px 8px", fontSize: 11.5, borderBottom: "1px solid #EEE7DA" };
  const r = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const AGE = [["current", "Not yet due"], ["d30", "1–30 days"], ["d60", "31–60 days"], ["d90", "61–90 days"], ["d90p", "Over 90 days"]];
  const exportXlsx = () => {
    if (!st || typeof xlsxExport !== "function") return;
    const aoa = [["Statement of account", p ? p.name : ""], ["As of", today], [],
      ["Invoice No.", "Invoice date", "Due date", "Total (AED)", "Received (AED)", "Balance (AED)", "Days overdue"],
      ...st.rows.map(x => [x.inv.invoiceNumber, x.inv.invoiceDate, x.inv.dueDate || "", Math.round(x.total * 100), Math.round(x.paid * 100), Math.round(x.due * 100), x.daysOverdue]),
      [], ["Aging"], ...AGE.map(([k, l]) => [l, "", "", "", "", Math.round(st.aging[k] * 100)])];
    xlsxExport("Statement", `Statement_${(p ? p.name : "party").replace(/[^A-Za-z0-9]+/g, "_")}_${today}.xlsx`, aoa, [3, 4, 5]);
  };
  return (
    <div style={C.modal} onClick={onClose}>
      <div style={{ ...C.mbox(960), maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div style={C.mhdr}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Statement of account</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={C.mbdy}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <select style={{ ...C.select, minWidth: 320 }} value={party} onChange={e => setParty(e.target.value)}>
              {parties.length === 0 && <option value="">No issued invoices</option>}
              {parties.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
            <button style={C.btn("secondary")} disabled={!st || exporting} onClick={async () => { setExporting(true); await invExportPDF(INV_STMT_EL, "", `Nasama_Statement_${(p ? p.name : "party").replace(/[^A-Za-z0-9]+/g, "_")}_${today}.pdf`, { pages: true }); setExporting(false); }}>{exporting ? "Generating…" : "⬇ PDF"}</button>
            <button style={C.btn("secondary")} disabled={!st} onClick={exportXlsx}>⬇ Excel</button>
          </div>
          {st && <div id={INV_STMT_EL} style={{ background: "#fff", padding: 28, width: INV_A4_PX, boxSizing: "border-box", fontFamily: "'Segoe UI','Helvetica Neue',Arial,sans-serif", color: "#1E2028" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.06em", color: "#252833" }}>STATEMENT OF ACCOUNT</div>
                <div style={{ fontSize: 12, color: "#6F6A60", marginTop: 4 }}>As of {invFmtDate(today)}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }}>
                <div style={{ fontWeight: 800 }}>{p ? p.name : ""}</div>
                {p && p.invoicedTo.address && <div style={{ color: "#6F6A60" }}>{p.invoicedTo.address}</div>}
                {p && p.invoicedTo.trn && <div style={{ color: "#6F6A60" }}>TRN {p.invoicedTo.trn}</div>}
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Invoice No.</th><th style={th}>Date</th><th style={th}>Due</th>
                <th style={{ ...th, ...r }}>Total</th><th style={{ ...th, ...r }}>Received</th><th style={{ ...th, ...r }}>Balance</th><th style={{ ...th, ...r }}>Overdue</th>
              </tr></thead>
              <tbody>
                {st.rows.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#9CA3AF", padding: 20 }}>No issued invoices for this party.</td></tr>}
                {st.rows.map(x => <tr key={x.inv.id}>
                  <td style={{ ...td, fontFamily: "monospace", fontWeight: 700 }}>{x.inv.invoiceNumber}</td>
                  <td style={td}>{invFmtDate(x.inv.invoiceDate)}</td>
                  <td style={td}>{x.inv.dueDate ? invFmtDate(x.inv.dueDate) : "—"}</td>
                  <td style={{ ...td, ...r }}>{invFmt(x.total)}</td>
                  <td style={{ ...td, ...r }}>{invFmt(x.paid)}</td>
                  <td style={{ ...td, ...r, fontWeight: 700, color: x.due > 0.5 ? "#B42318" : "#027A48" }}>{x.due > 0.5 ? invFmt(x.due) : "Paid"}</td>
                  <td style={{ ...td, ...r, color: x.daysOverdue > 0 && x.due > 0.5 ? "#B42318" : "#9CA3AF" }}>{x.daysOverdue > 0 && x.due > 0.5 ? `${x.daysOverdue} d` : "—"}</td>
                </tr>)}
                <tr>
                  <td colSpan={3} style={{ ...td, fontWeight: 800, borderTop: "2px solid #B58A2A" }}>Total</td>
                  <td style={{ ...td, ...r, fontWeight: 800, borderTop: "2px solid #B58A2A" }}>{invFmt(st.totals.total)}</td>
                  <td style={{ ...td, ...r, fontWeight: 800, borderTop: "2px solid #B58A2A" }}>{invFmt(st.totals.paid)}</td>
                  <td style={{ ...td, ...r, fontWeight: 800, borderTop: "2px solid #B58A2A", color: "#B42318" }}>{invFmt(st.totals.due)}</td>
                  <td style={{ ...td, borderTop: "2px solid #B58A2A" }} />
                </tr>
              </tbody>
            </table>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 20 }}>
              {AGE.map(([k, l]) => <div key={k} style={{ border: "1px solid #DDD4C4", borderTop: `3px solid ${k === "current" ? "#027A48" : k === "d90p" ? "#B42318" : "#B58A2A"}`, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6F6A60", fontWeight: 700 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>AED {invFmt(st.aging[k])}</div>
              </div>)}
            </div>
            <div style={{ marginTop: 18, fontSize: 10.5, color: "#6F6A60" }}>Balance due: <strong style={{ color: "#1E2028" }}>AED {invFmt(st.totals.due)}</strong>. Aging is by days past each invoice's due date.</div>
          </div>}
        </div>
        <div style={C.mftr}><button style={C.btn("secondary")} onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
