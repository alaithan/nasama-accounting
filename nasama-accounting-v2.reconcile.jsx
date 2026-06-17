// ╔═══════════════════════════════════════════════════════════════════╗
//  nasama-accounting-v2.reconcile.jsx
//  Bank Reconciliation — match a bank statement (CSV / Excel / PDF)
//  against the recorded ledger, surface unrecorded & outstanding items,
//  pinpoint the unexplained gap, and post the missing entries.
//
//  Reuses core.jsx globals: parseDelimitedRows, parseImportDate, toCents,
//  fmtAED, accountBalance, uid, todayStr, toast, C, hasPermission.
//  Excel via global XLSX (loaded in HTML); PDF via global pdfjsLib (loaded in HTML).
// ╚═══════════════════════════════════════════════════════════════════╝

const RECON_PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ── Column detection ───────────────────────────────────────────────
// Map a statement's header names onto the roles we need. Best-effort; the
// user can override every choice in the UI.
function reconDetectColumns(headers) {
  const find = (re) => headers.find(h => re.test(String(h || ""))) || "";
  const date = find(/value\s*date/i) || find(/(txn|trans|transaction|posting|book)\s*date/i) || find(/\bdate\b/i);
  const desc = find(/description|narration|details|particular|remark|transaction(?!\s*date)/i) || find(/\bdetails?\b/i);
  const debit = find(/debit|withdraw|paid\s*out|with\s*draw|\bdr\b|money\s*out/i);
  const credit = find(/credit|deposit|paid\s*in|\bcr\b|money\s*in/i);
  const amount = (!debit && !credit) ? (find(/^amount$/i) || find(/amount|value(?!\s*date)/i)) : "";
  const balance = find(/running\s*balance|closing\s*balance|balance/i);
  return { date, desc, debit, credit, amount, balance };
}

// Parse a money cell → number (handles "1,234.56", "(123.45)", trailing "Dr").
function reconParseAmount(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\b(dr|debit)\b/i.test(s)) neg = true;
  if (/\b(cr|credit)\b/i.test(s)) neg = false;
  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

// Find the header row in a raw matrix (banks often prepend title/address rows).
function reconFindHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const cells = (matrix[i] || []).map(c => String(c || "").toLowerCase());
    const hasDate = cells.some(c => /date/.test(c));
    const hasMoney = cells.some(c => /amount|debit|credit|balance|withdraw|deposit/.test(c));
    if (hasDate && hasMoney) return i;
  }
  return 0;
}

// Raw matrix (array of arrays) → { headers, rows[] } keyed by header.
function reconMatrixToRows(matrix) {
  if (!matrix || !matrix.length) return { headers: [], rows: [] };
  const hi = reconFindHeaderRow(matrix);
  const headers = (matrix[hi] || []).map((h, i) => String(h || "").trim() || ("Column " + (i + 1)));
  const rows = matrix.slice(hi + 1)
    .filter(r => (r || []).some(c => String(c == null ? "" : c).trim() !== ""))
    .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = String((r || [])[i] == null ? "" : (r || [])[i]).trim(); }); return o; });
  return { headers, rows };
}

// PDF text lines → row objects with synthetic Date/Description/Amount/Balance.
function reconPdfLinesToRows(textLines) {
  const dateRe = /(\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}-\d{2}-\d{2})/;
  const numRe = /-?\(?[\d,]+\.\d{2}\)?/g;
  const out = [];
  (textLines || []).forEach(t => {
    const dm = t.match(dateRe);
    if (!dm) return;
    const nums = t.match(numRe);
    if (!nums || !nums.length) return;
    let amount = nums[0], balance = "";
    if (nums.length >= 2) { balance = nums[nums.length - 1]; amount = nums[nums.length - 2]; }
    const desc = t.replace(dateRe, "").replace(numRe, "").replace(/\s+/g, " ").trim();
    out.push({ Date: dm[1], Description: desc, Amount: amount, Balance: balance });
  });
  return out;
}

async function reconReadPdf(arrayBuffer) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error("PDF reader didn't load — use CSV or Excel, or check your connection.");
  try { if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = RECON_PDF_WORKER; } catch (e) {}
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  const textLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map();
    content.items.forEach(it => { const y = Math.round(it.transform[5]); const a = byY.get(y) || []; a.push(it); byY.set(y, a); });
    [...byY.keys()].sort((a, b) => b - a).forEach(y => {
      const line = byY.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) textLines.push(line);
    });
  }
  const rows = reconPdfLinesToRows(textLines);
  if (!rows.length) throw new Error("Couldn't read transactions from this PDF. Try the bank's CSV or Excel export.");
  return { headers: ["Date", "Description", "Amount", "Balance"], rows };
}

// Normalize any parsed date to YYYY-MM-DD so the period window + sorting are
// consistent regardless of source format (parseImportDate handles dd/mm/yyyy and
// "d Mon yyyy"; Date.parse mops up the rest, e.g. Excel's m/d/yyyy).
function reconNormDate(raw) {
  const p = parseImportDate(String(raw || "").trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  const t = Date.parse(p || raw || "");
  if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  return p || "";
}

// Row objects + column map → normalized statement lines.
// amountC is signed cents: + = money in (credit), − = money out (debit).
function reconRowsToLines(rows, map) {
  return (rows || []).map((row, i) => {
    const date = reconNormDate(map.date ? row[map.date] : "");
    let amt = null;
    if (map.amount) {
      amt = reconParseAmount(row[map.amount]);
    } else {
      const d = map.debit ? reconParseAmount(row[map.debit]) : null;
      const c = map.credit ? reconParseAmount(row[map.credit]) : null;
      if (c != null && Math.abs(c) > 0) amt = Math.abs(c);
      else if (d != null && Math.abs(d) > 0) amt = -Math.abs(d);
      else amt = 0;
    }
    const balRaw = map.balance ? reconParseAmount(row[map.balance]) : null;
    return {
      id: "stmt-" + i,
      date,
      desc: map.desc ? String(row[map.desc] || "").trim() : "",
      amountC: amt == null ? 0 : Math.round(amt * 100),
      balanceC: balRaw == null ? null : Math.round(balRaw * 100),
    };
  }).filter(l => l.date || l.amountC);
}

// Recorded bank txns for one account → { id, date, ref, desc, amountC (signed) }.
function reconBookBankTxns(txns, bankAcctId) {
  return (txns || []).filter(t => !t.isVoid).map(t => {
    const amt = (t.lines || []).filter(l => l.accountId === bankAcctId).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
    if (!amt) return null;
    return { id: t.id, date: t.date || "", ref: t.ref || "", desc: t.description || "", amountC: amt };
  }).filter(Boolean);
}

// Bounded subset-sum: the smallest subset (size 2..maxSize) of `cands` whose
// magnitudes add up to |targetC| within tolC. Returns the chosen ids, or null.
// Powers split / combined matching (one entry ↔ several lines that sum to it).
function reconSubsetSum(targetC, cands, tolC, maxSize) {
  const T = Math.abs(targetC);
  const items = cands.map(x => ({ id: x.id, m: Math.abs(x.c) })).filter(x => x.m > 0 && x.m <= T + tolC).sort((a, b) => b.m - a.m);
  const cap = Math.min(items.length, 14);     // bound the search space
  for (let size = 2; size <= Math.min(maxSize, cap); size++) {
    let found = null;
    const idx = [];
    const dfs = (start, sum) => {
      if (found) return;
      if (idx.length === size) { if (Math.abs(sum - T) <= tolC) found = idx.slice(); return; }
      for (let i = start; i < cap && !found; i++) {
        if (sum + items[i].m > T + tolC) continue;   // this part overshoots; smaller ones later may still fit
        idx.push(i); dfs(i + 1, sum + items[i].m); idx.pop();
      }
    };
    dfs(0, 0);
    if (found) return found.map(i => items[i].id);
  }
  return null;
}

// Three-pass match. (1) exact 1:1 — same signed amount, nearest date within window.
// (2) near 1:1 — amounts within amountTolC (rounding/fee/typo). (3) group/split —
// one entry ↔ a combination of lines on the other side that sum to it (e.g. a
// receipt banked as two cheques, or a fee + its VAT).
function reconMatch(lines, bookTxns, toleranceDays, amountTolC) {
  const usedBook = new Set(), usedLine = new Set();
  const dayMs = 86400000;
  const toTime = d => { const t = Date.parse(d); return isNaN(t) ? null : t; };
  const dDiff = (a, b) => { const lt = toTime(a), btt = toTime(b); return (lt != null && btt != null) ? Math.abs(lt - btt) / dayMs : 0; };
  const inWin = (a, b) => dDiff(a, b) <= toleranceDays;
  const matched = [], near = [], groups = [];
  const sorted = [...lines].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Pass 1 — exact 1:1 (nearest date wins)
  sorted.forEach(line => {
    let best = null, bestDiff = Infinity;
    for (const bt of bookTxns) {
      if (usedBook.has(bt.id) || bt.amountC !== line.amountC) continue;
      const diff = dDiff(line.date, bt.date);
      if (diff <= toleranceDays && diff < bestDiff) { best = bt; bestDiff = diff; }
    }
    if (best) { usedBook.add(best.id); usedLine.add(line.id); matched.push({ line, book: best }); }
  });

  // Pass 2 — near 1:1 (amount within tolerance)
  if (amountTolC > 0) sorted.forEach(line => {
    if (usedLine.has(line.id)) return;
    let best = null, bestScore = Infinity;
    for (const bt of bookTxns) {
      if (usedBook.has(bt.id) || Math.sign(bt.amountC) !== Math.sign(line.amountC)) continue;
      const ad = Math.abs(bt.amountC - line.amountC);
      if (ad === 0 || ad > amountTolC) continue;
      const dd = dDiff(line.date, bt.date);
      if (dd > toleranceDays) continue;
      const score = ad * 1000 + dd;          // closest amount first, then closest date
      if (score < bestScore) { best = bt; bestScore = score; }
    }
    if (best) { usedBook.add(best.id); usedLine.add(line.id); near.push({ line, book: best, diffC: line.amountC - best.amountC }); }
  });

  // Pass 3 — group / split: one entry ↔ several lines summing to it (within window, same sign)
  bookTxns.forEach(bt => {     // 3a: one book item ↔ several statement lines
    if (usedBook.has(bt.id)) return;
    const cands = sorted.filter(l => !usedLine.has(l.id) && Math.sign(l.amountC) === Math.sign(bt.amountC) && inWin(l.date, bt.date));
    const pick = reconSubsetSum(bt.amountC, cands.map(l => ({ id: l.id, c: l.amountC })), amountTolC, 4);
    if (pick) {
      const parts = pick.map(id => cands.find(l => l.id === id));
      parts.forEach(p => usedLine.add(p.id)); usedBook.add(bt.id);
      groups.push({ book: [bt], lines: parts, diffC: parts.reduce((s, p) => s + p.amountC, 0) - bt.amountC });
    }
  });
  sorted.forEach(line => {     // 3b: one statement line ↔ several book items
    if (usedLine.has(line.id)) return;
    const cands = bookTxns.filter(b => !usedBook.has(b.id) && Math.sign(b.amountC) === Math.sign(line.amountC) && inWin(b.date, line.date));
    const pick = reconSubsetSum(line.amountC, cands.map(b => ({ id: b.id, c: b.amountC })), amountTolC, 4);
    if (pick) {
      const parts = pick.map(id => cands.find(b => b.id === id));
      parts.forEach(p => usedBook.add(p.id)); usedLine.add(line.id);
      groups.push({ book: parts, lines: [line], diffC: line.amountC - parts.reduce((s, p) => s + p.amountC, 0) });
    }
  });

  const statementOnly = sorted.filter(l => !usedLine.has(l.id));
  const bookOnly = bookTxns.filter(bt => !usedBook.has(bt.id));
  return { matched, near, groups, statementOnly, bookOnly };
}

const reconFmtSigned = (c) => (c > 0 ? "+" : c < 0 ? "−" : "") + fmtAED(Math.abs(c)).replace("AED ", "");

// ═══════════════════════════════════════════════════════════════════
//  BankReconcileModal
// ═══════════════════════════════════════════════════════════════════
function BankReconcileModal({ accounts, txns, ledger, journal, persistTxn, onClose }) {
  const bankAccts = (accounts || []).filter(a => a.isBank || a.isCash || a.code === "1001" || a.code === "1002");
  const [step, setStep] = React.useState("upload");           // upload | review
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [parsed, setParsed] = React.useState(null);           // { headers, rows, kind }
  const [colMap, setColMap] = React.useState({ date: "", desc: "", debit: "", credit: "", amount: "", balance: "" });
  const [bankCode, setBankCode] = React.useState(() => (bankAccts.find(a => a.code === "1002") || bankAccts[0] || {}).code || "1002");
  const [stmtBalStr, setStmtBalStr] = React.useState("");
  const [tolerance, setTolerance] = React.useState(7);        // days — bank value dates routinely lag booking by a few days
  const [amountTol, setAmountTol] = React.useState(1);        // AED — pair near-amounts (rounding/fees/typos)
  const [showMap, setShowMap] = React.useState(false);
  const [showMatched, setShowMatched] = React.useState(false);
  const [addAcct, setAddAcct] = React.useState({});           // lineId -> offset account id (quick pre-pick)
  const [addLine, setAddLine] = React.useState(null);         // statement line being added via the detail window

  const acct = bankAccts.find(a => a.code === bankCode) || bankAccts[0];
  const lines = React.useMemo(() => parsed ? reconRowsToLines(parsed.rows, colMap) : [], [parsed, colMap]);
  const period = React.useMemo(() => {
    const ds = lines.map(l => l.date).filter(Boolean).sort();
    return { from: ds[0] || "", to: ds[ds.length - 1] || "" };
  }, [lines]);

  const bookTxns = React.useMemo(() => acct ? reconBookBankTxns(txns, acct.id) : [], [txns, acct]);
  const amountTolC = Math.round((parseFloat(amountTol) || 0) * 100);
  const result = React.useMemo(() => reconMatch(lines, bookTxns, tolerance, amountTolC), [lines, bookTxns, tolerance, amountTolC]);

  // Outstanding = book txns not on the statement, scoped to the statement's own
  // date window (older items already cleared in prior periods are not "outstanding").
  const outstanding = React.useMemo(() => result.bookOnly.filter(b =>
    (!period.from || b.date >= period.from) && (!period.to || b.date <= period.to)
  ), [result.bookOnly, period]);

  // Auto-fill the statement closing balance from the latest line that carries a balance.
  React.useEffect(() => {
    if (!lines.length) return;
    const withBal = lines.filter(l => l.balanceC != null && l.date);
    if (!withBal.length) return;
    const last = withBal.reduce((a, b) => (String(b.date).localeCompare(String(a.date)) >= 0 ? b : a));
    setStmtBalStr(((last.balanceC || 0) / 100).toFixed(2));
  }, [lines]);

  const bookBalC = acct ? accountBalance(acct, ledger) : 0;
  const sumStmtOnly = result.statementOnly.reduce((s, l) => s + l.amountC, 0);
  const sumOutstanding = outstanding.reduce((s, b) => s + b.amountC, 0);
  const sumNearDiff = result.near.reduce((s, n) => s + n.diffC, 0);   // Σ(statement − book) over near pairs
  const sumGroupDiff = result.groups.reduce((s, g) => s + g.diffC, 0); // Σ(statement − book) over grouped sets
  const expectedC = bookBalC + sumStmtOnly - sumOutstanding + sumNearDiff + sumGroupDiff;
  const breakdown = [
    ["Book balance (per system)", bookBalC, false],
    ["Add: unrecorded on statement", sumStmtOnly, true],
    ["Less: outstanding in books", -sumOutstanding, true],
    ...(result.near.length ? [["Near-match differences (stmt − book)", sumNearDiff, true]] : []),
    ...(result.groups.length ? [["Grouped-match differences (stmt − book)", sumGroupDiff, true]] : []),
    ["Expected statement balance", expectedC, false],
  ];
  // Control totals — the aggregate that matters most: do total money-in and
  // money-out on the statement equal the books over the same period? This is the
  // reliable check; line-matching is only for locating the specific differences.
  const stmtIn = lines.reduce((s, l) => s + (l.amountC > 0 ? l.amountC : 0), 0);
  const stmtOut = lines.reduce((s, l) => s + (l.amountC < 0 ? -l.amountC : 0), 0);
  const bookInPeriod = bookTxns.filter(b => (!period.from || b.date >= period.from) && (!period.to || b.date <= period.to));
  const bookIn = bookInPeriod.reduce((s, b) => s + (b.amountC > 0 ? b.amountC : 0), 0);
  const bookOut = bookInPeriod.reduce((s, b) => s + (b.amountC < 0 ? -b.amountC : 0), 0);
  const inDiff = stmtIn - bookIn, outDiff = stmtOut - bookOut;
  const totalsMatch = Math.abs(inDiff) < 1 && Math.abs(outDiff) < 1;
  // Amounts that already matched — flag a likely duplicate when the same value also sits in Outstanding.
  const matchedAmounts = new Set([...result.matched, ...result.near].map(m => m.book.amountC));

  const hasStmtBal = stmtBalStr.trim() !== "" && isFinite(parseFloat(stmtBalStr));
  const actualC = hasStmtBal ? toCents(stmtBalStr) : null;
  const diffC = actualC == null ? null : actualC - bookBalC;
  const unexplainedC = actualC == null ? null : actualC - expectedC;
  const reconciled = unexplainedC != null && Math.abs(unexplainedC) < 1;

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true); setError(""); setParsed(null);
    setFileName(file.name);
    const name = file.name.toLowerCase();
    try {
      let headers, rows;
      if (name.endsWith(".pdf")) {
        const r = await reconReadPdf(await file.arrayBuffer());
        headers = r.headers; rows = r.rows;
        setColMap({ date: "Date", desc: "Description", amount: "Amount", balance: "Balance", debit: "", credit: "" });
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        if (typeof XLSX === "undefined") throw new Error("Excel reader not loaded — check your connection.");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
        ({ headers, rows } = reconMatrixToRows(matrix));
        setColMap(reconDetectColumns(headers));
      } else {
        const text = await file.text();
        const delim = (text.split(/\r?\n/, 1)[0] || "").includes("\t") ? "\t" : ",";
        const matrix = parseDelimitedRows(text, delim);
        ({ headers, rows } = reconMatrixToRows(matrix));
        setColMap(reconDetectColumns(headers));
      }
      if (!rows.length) throw new Error("No data rows found in this file.");
      setParsed({ headers, rows, kind: name.split(".").pop() });
      setShowMap(false);
      setStep("review");
    } catch (e) { setError(e.message || String(e)); }
    setBusy(false);
  };

  // ── styles ──
  const G = "#1D4ED8";
  const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px" };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#6B7280" };
  const sel = { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
  const th = { ...C.th, fontSize: 10.5, padding: "6px 8px" };
  const td = { ...C.td, fontSize: 12, padding: "6px 8px" };
  const money = (c, color) => <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: color || (c < 0 ? "#DC2626" : "#059669") }}>{reconFmtSigned(c)}</span>;

  const summaryCard = (title, value, sub, accent) => (
    <div style={{ ...card, borderLeft: `4px solid ${accent}` }}>
      <div style={lbl}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={C.modal} onClick={onClose}>
      <div style={{ ...C.mbox(1040), maxHeight: "94vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ ...C.mhdr, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>🔄 Bank Reconciliation</span>
            {fileName && <span style={{ fontSize: 12, color: "#6B7280" }}>· {fileName}</span>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ ...C.mbdy, overflowY: "auto", flex: 1 }}>
          {step === "upload" && (
            <div>
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>Upload a bank statement and we'll match it against your recorded transactions, then show exactly what's unrecorded, outstanding, and any unexplained difference.</p>
              <div style={{ marginBottom: 16, maxWidth: 360 }}>
                <label style={lbl}>Bank account to reconcile</label>
                <select style={{ ...sel, marginTop: 6 }} value={bankCode} onChange={e => setBankCode(e.target.value)}>
                  {bankAccts.map(a => <option key={a.code} value={a.code}>{a.name} · {a.code}</option>)}
                </select>
              </div>
              <label style={{ display: "block", border: "2px dashed #C7D2FE", borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: "#F8FAFF" }}>
                <input type="file" accept=".csv,.txt,.xlsx,.xls,.pdf" style={{ display: "none" }} onChange={e => onFile(e.target.files && e.target.files[0])} />
                <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>{busy ? "Reading file…" : "Choose statement file"}</div>
                <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6 }}>CSV · Excel (.xlsx/.xls) · PDF</div>
              </label>
              {error && <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>{error}</div>}
              <div style={{ marginTop: 16, fontSize: 12, color: "#9CA3AF" }}>
                <strong>Tip:</strong> CSV or Excel exports reconcile most accurately. PDF reading is best-effort — review the parsed rows after upload.
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              {/* Control totals — money in / out, statement vs books (the reliable aggregate check) */}
              <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${totalsMatch ? "#059669" : "#DC2626"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#1A1A2E" }}>Control totals <span style={{ fontWeight: 500, color: "#9CA3AF", fontSize: 12 }}>· {period.from || "—"} → {period.to || "—"}</span></span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: totalsMatch ? "#059669" : "#DC2626" }}>{totalsMatch ? "✓ Totals match" : "Totals differ"}</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#F9FAFB" }}>{["", "Money In", "Money Out", "Net"].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[["Bank statement", stmtIn, stmtOut], ["Your books", bookIn, bookOut]].map(([l, inC, outC]) => (
                      <tr key={l} style={{ borderTop: "1px solid #F2F4F7" }}>
                        <td style={td}>{l}</td>
                        <td style={{ ...td, textAlign: "right", color: "#059669", fontVariantNumeric: "tabular-nums" }}>{fmtAED(inC)}</td>
                        <td style={{ ...td, textAlign: "right", color: "#DC2626", fontVariantNumeric: "tabular-nums" }}>{fmtAED(outC)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtAED(inC - outC)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid #E5E7EB" }}>
                      <td style={{ ...td, fontWeight: 800 }}>Difference</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: Math.abs(inDiff) < 1 ? "#059669" : "#DC2626", fontVariantNumeric: "tabular-nums" }}>{reconFmtSigned(inDiff)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: Math.abs(outDiff) < 1 ? "#059669" : "#DC2626", fontVariantNumeric: "tabular-nums" }}>{reconFmtSigned(outDiff)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{reconFmtSigned(inDiff - outDiff)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 8 }}>Total money in and out over the statement period. If both differences are 0, every dirham is accounted for — regardless of which bucket individual lines land in below.</div>
              </div>

              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
                {summaryCard("Book balance", fmtAED(bookBalC), `${acct ? acct.name : ""} · per system`, "#1D4ED8")}
                <div style={{ ...card, borderLeft: "4px solid #6B7280" }}>
                  <div style={lbl}>Statement closing balance</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: "#9CA3AF" }}>AED</span>
                    <input style={{ ...sel, fontSize: 18, fontWeight: 800, padding: "4px 8px" }} value={stmtBalStr} onChange={e => setStmtBalStr(e.target.value)} placeholder="enter / auto" />
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>from file or type it in</div>
                </div>
                {summaryCard("Difference", actualC == null ? "—" : reconFmtSigned(diffC), "statement − book", Math.abs(diffC || 0) < 1 ? "#059669" : "#D97706")}
                <div style={{ ...card, borderLeft: `4px solid ${reconciled ? "#059669" : actualC == null ? "#9CA3AF" : "#DC2626"}` }}>
                  <div style={lbl}>Unexplained</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: reconciled ? "#059669" : actualC == null ? "#9CA3AF" : "#DC2626", fontVariantNumeric: "tabular-nums" }}>
                    {actualC == null ? "—" : reconciled ? "✓ Reconciled" : reconFmtSigned(unexplainedC)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>after the items below</div>
                </div>
              </div>

              {/* Reconciliation breakdown */}
              <div style={{ ...card, marginBottom: 16, background: "#F9FAFB" }}>
                {breakdown.map(([l, v, signed], i) => {
                  const last = i === breakdown.length - 1;
                  return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, fontWeight: last ? 800 : 500, borderTop: last ? "1px solid #E5E7EB" : "none", marginTop: last ? 4 : 0, paddingTop: last ? 9 : 5 }}>
                    <span style={{ color: last ? "#1A1A2E" : "#6B7280" }}>{l}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: last ? "#1A1A2E" : "#374151" }}>{signed ? reconFmtSigned(v) : fmtAED(v)}</span>
                  </div>
                  );
                })}
                {actualC != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0 2px", fontSize: 13, marginTop: 4, borderTop: "1px dashed #D1D5DB" }}>
                    <span style={{ color: "#6B7280" }}>Actual statement balance</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtAED(actualC)}</span>
                  </div>
                )}
                {actualC != null && !reconciled && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#B91C1C", fontSize: 12.5 }}>
                    <strong>{reconFmtSigned(unexplainedC)}</strong> still unexplained — likely an amount that differs from the books, a date outside the ±{tolerance}-day window, or a missing line. Adjust the column mapping or tolerance, or add the entries below.
                  </div>
                )}
                {reconciled && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, color: "#047857", fontSize: 12.5, fontWeight: 600 }}>
                    ✓ Fully reconciled — every difference is explained by the items below.
                  </div>
                )}
              </div>

              {/* Controls: mapping + tolerance */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <button style={{ ...C.btn("secondary", true) }} onClick={() => setShowMap(s => !s)}>{showMap ? "Hide column mapping" : "Columns ▾"}</button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6B7280" }}>
                  Date tolerance
                  <select style={{ ...sel, width: "auto", padding: "5px 8px" }} value={tolerance} onChange={e => setTolerance(parseInt(e.target.value, 10))}>
                    {[0, 1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(d => <option key={d} value={d}>±{d} day{d === 1 ? "" : "s"}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6B7280" }}>
                  Amount tolerance
                  <select style={{ ...sel, width: "auto", padding: "5px 8px" }} value={amountTol} onChange={e => setAmountTol(parseFloat(e.target.value))}>
                    {[0, 0.5, 1, 2, 5, 10, 25].map(a => <option key={a} value={a}>{a === 0 ? "exact" : "±" + a.toFixed(2) + " AED"}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>{lines.length} statement lines{period.from ? ` · ${period.from} → ${period.to}` : ""}</div>
                <button style={{ ...C.btn("secondary", true), marginLeft: "auto" }} onClick={() => { setStep("upload"); setParsed(null); setError(""); }}>↺ New file</button>
              </div>

              {showMap && (
                <div style={{ ...card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                  {[["date", "Date"], ["desc", "Description"], ["debit", "Debit / Out"], ["credit", "Credit / In"], ["amount", "Amount (signed)"], ["balance", "Balance"]].map(([k, l]) => (
                    <div key={k}>
                      <label style={lbl}>{l}</label>
                      <select style={{ ...sel, marginTop: 4 }} value={colMap[k] || ""} onChange={e => setColMap(m => ({ ...m, [k]: e.target.value }))}>
                        <option value="">— none —</option>
                        {(parsed ? parsed.headers : []).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#9CA3AF" }}>Use <strong>Debit/Credit</strong> for statements with separate columns, or <strong>Amount</strong> for a single signed column.</div>
                </div>
              )}

              {/* Unrecorded on statement */}
              <ReconSection title="Unrecorded — on statement, not in your books" count={result.statementOnly.length} accent="#D97706"
                hint="These are at the bank but missing from your records. Add them to close the gap.">
                {result.statementOnly.length === 0
                  ? <div style={{ fontSize: 12.5, color: "#9CA3AF", padding: "6px 2px" }}>Nothing — every statement line is recorded. 🎉</div>
                  : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr style={{ background: "#F9FAFB" }}>{["Date", "Description", "Amount", "Post against", ""].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {result.statementOnly.map(l => (
                          <tr key={l.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                            <td style={td}>{l.date || "—"}</td>
                            <td style={{ ...td, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.desc}>{l.desc || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }}>{money(l.amountC)}</td>
                            <td style={td}>
                              <select style={{ ...sel, fontSize: 12, padding: "5px 8px", minWidth: 160 }} value={addAcct[l.id] || ""} onChange={e => setAddAcct(m => ({ ...m, [l.id]: e.target.value }))}>
                                <option value="">— choose account —</option>
                                {(accounts || []).filter(a => a.id !== (acct && acct.id)).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                              </select>
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              <button style={{ ...C.btn(), padding: "4px 12px", fontSize: 12 }} onClick={() => setAddLine(l)}>Add…</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>}
              </ReconSection>

              {/* Near matches */}
              {result.near.length > 0 && (
                <ReconSection title="Near matches — same item, amount differs slightly" count={result.near.length} accent="#0891B2"
                  hint="Paired by date, but the amounts differ (rounding, a fee, or a typo). The difference is carried into the reconciliation above — fix the book entry if it shouldn't differ.">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#F9FAFB" }}>{["Date", "Description", "Statement", "Book ref", "Book amount", "Stmt − Book"].map((h, i) => <th key={h} style={{ ...th, textAlign: ["left", "left", "right", "left", "right", "right"][i] }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {result.near.map((n, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #F2F4F7" }}>
                          <td style={td}>{n.line.date || "—"}</td>
                          <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={n.line.desc}>{n.line.desc || "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{money(n.line.amountC)}</td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{n.book.ref || "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{money(n.book.amountC)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(n.diffC, "#B45309")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ReconSection>
              )}

              {/* Grouped (split / combined) matches */}
              {result.groups.length > 0 && (
                <ReconSection title="Grouped — one entry split across several lines" count={result.groups.length} accent="#7C3AED"
                  hint="One side is a single transaction; the other is several lines that add up to it (e.g. a receipt banked as two cheques, or a fee + its VAT). Matched as a set.">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.groups.map((g, i) => {
                      const oneIsBook = g.book.length === 1;
                      const single = oneIsBook ? g.book[0] : g.lines[0];
                      const parts = oneIsBook ? g.lines : g.book;
                      const lbl = (it, isBook) => `${it.date || "—"} · ${isBook && it.ref ? it.ref + " — " : ""}${it.desc || ""}`.trim();
                      return (
                        <div key={i} style={{ border: "1px solid #EDE9FE", borderRadius: 8, padding: "8px 10px", background: "#FBFAFF" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, fontWeight: 700, color: "#1A1A2E" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oneIsBook ? "📒 " : "🏦 "}{lbl(single, oneIsBook)}</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(single.amountC)}</span>
                          </div>
                          <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #DDD6FE" }}>
                            {parts.map((p, j) => (
                              <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "#4B5563", padding: "2px 0" }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {oneIsBook ? "🏦 " : "📒 "}{lbl(p, !oneIsBook)}</span>
                                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(p.amountC)}</span>
                              </div>
                            ))}
                          </div>
                          {Math.abs(g.diffC) >= 1 && <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>Net difference {reconFmtSigned(g.diffC)} — carried into the reconciliation</div>}
                        </div>
                      );
                    })}
                  </div>
                </ReconSection>
              )}

              {/* Outstanding in books */}
              <ReconSection title="Outstanding — in your books, not on the statement" count={outstanding.length} accent="#7C3AED"
                hint="Recorded but not yet on the statement (e.g. uncleared cheques). Usually clears on its own; investigate if it shouldn't be there.">
                {outstanding.length === 0
                  ? <div style={{ fontSize: 12.5, color: "#9CA3AF", padding: "6px 2px" }}>Nothing outstanding in this period.</div>
                  : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr style={{ background: "#F9FAFB" }}>{["Date", "Ref", "Description", "Amount"].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 3 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {outstanding.map(b => (
                          <tr key={b.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                            <td style={td}>{b.date || "—"}</td>
                            <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{b.ref || "—"}</td>
                            <td style={{ ...td, maxWidth: 360 }} title={b.desc}>
                              <span style={{ display: "inline-block", maxWidth: matchedAmounts.has(b.amountC) ? 210 : 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>{b.desc || "—"}</span>
                              {matchedAmounts.has(b.amountC) && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", verticalAlign: "middle" }}>⚠ possible duplicate</span>}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>{money(b.amountC)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>}
              </ReconSection>

              {/* Matched */}
              <div style={{ ...card, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowMatched(s => !s)}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#047857" }}>✓ Matched · {result.matched.length}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>{showMatched ? "Hide" : "Show"}</span>
                </div>
                {showMatched && (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                    <thead><tr style={{ background: "#F9FAFB" }}>{["Date", "Statement", "Book ref", "Amount"].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 3 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {result.matched.map((m, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #F2F4F7" }}>
                          <td style={td}>{m.line.date || "—"}</td>
                          <td style={{ ...td, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.line.desc}>{m.line.desc || "—"}</td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{m.book.ref || "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{money(m.line.amountC)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ ...C.mftr, justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>{step === "review" && acct ? `Reconciling ${acct.name}` : "Statement → Ledger"}</span>
          <button style={C.btn("secondary")} onClick={onClose}>Close</button>
        </div>

        {addLine && (
          <ReconAddTxnModal
            line={addLine}
            bankAcct={acct}
            accounts={accounts}
            defaultOffsetId={addAcct[addLine.id]}
            journal={journal}
            persistTxn={persistTxn}
            onClose={() => setAddLine(null)}
            onPosted={() => setAddLine(null)}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ReconAddTxnModal — full transaction entry for an unrecorded statement
//  line. Pre-filled from the line; lets you set date / description /
//  counterparty / category account and optionally split out VAT.
//  The bank amount (gross) is fixed — it's the real money movement.
//   • Money OUT (payment): DR category (net) / DR Input VAT / CR bank (gross)
//   • Money IN  (receipt): DR bank (gross) / CR category (net) / CR Output VAT
// ═══════════════════════════════════════════════════════════════════
function ReconAddTxnModal({ line, bankAcct, accounts, defaultOffsetId, journal, persistTxn, onClose, onPosted }) {
  const moneyIn = line.amountC > 0;
  const grossC = Math.abs(line.amountC);
  const [date, setDate] = React.useState(line.date || todayStr());
  const [desc, setDesc] = React.useState(line.desc || "");
  const [counterparty, setCounterparty] = React.useState("");
  const [offsetId, setOffsetId] = React.useState(defaultOffsetId || "");
  const [vatOn, setVatOn] = React.useState(false);
  const [vatRate, setVatRate] = React.useState(5);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const rate = vatOn ? (parseFloat(vatRate) || 0) : 0;
  // Bank amount is VAT-inclusive (gross). Net = gross / (1 + rate); VAT = remainder (keeps it balanced to the cent).
  const netC = rate > 0 ? Math.round(grossC / (1 + rate / 100)) : grossC;
  const vatC = grossC - netC;

  const outputVATA = accounts.find(a => a.isOutputVAT);
  const inputVATA = accounts.find(a => a.isInputVAT);
  const vatAcct = moneyIn ? outputVATA : inputVATA;

  // Categories: everything except the bank account itself and the VAT accounts (VAT is auto-handled).
  const categoryAccts = (accounts || []).filter(a => a.id !== (bankAcct && bankAcct.id) && !a.isOutputVAT && !a.isInputVAT);
  const offset = (accounts || []).find(a => a.id === offsetId);

  const fmtC = (c) => "AED " + (c / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const post = async () => {
    setErr("");
    if (!bankAcct) { setErr("No bank account selected."); return; }
    if (!offset) { setErr("Choose a category / account to post against."); return; }
    if (rate > 0 && !vatAcct) { setErr(`Missing ${moneyIn ? "Output" : "Input"} VAT account in the chart of accounts.`); return; }
    const memo = desc || (moneyIn ? "Bank receipt" : "Bank payment");
    const lns = [];
    if (moneyIn) {
      lns.push({ id: uid(), accountId: bankAcct.id, debit: grossC, credit: 0, memo });
      lns.push({ id: uid(), accountId: offset.id, debit: 0, credit: netC, memo });
      if (vatC > 0) lns.push({ id: uid(), accountId: vatAcct.id, debit: 0, credit: vatC, memo: `Output VAT ${rate}%` });
    } else {
      lns.push({ id: uid(), accountId: offset.id, debit: netC, credit: 0, memo });
      if (vatC > 0) lns.push({ id: uid(), accountId: vatAcct.id, debit: vatC, credit: 0, memo: `Input VAT ${rate}%` });
      lns.push({ id: uid(), accountId: bankAcct.id, debit: 0, credit: grossC, memo });
    }
    setBusy(true);
    try {
      const txn = journal.post({
        date: date || todayStr(),
        description: desc || (moneyIn ? "Bank receipt (reconciliation)" : "Bank payment (reconciliation)"),
        ref: "REC-" + Date.now().toString(36).toUpperCase(),
        counterparty,
        tags: "reconcile bank-import",
        txnType: "BK",
        lines: lns,
        commit: false,
      });
      await persistTxn(txn);
      toast("Posted — statement line now recorded", "success");
      onPosted && onPosted(txn);
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };

  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#6B7280" };
  const sel = { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
  const accent = moneyIn ? "#059669" : "#DC2626";

  return (
    <div style={{ ...C.modal, zIndex: 1100 }} onClick={onClose}>
      <div style={{ ...C.mbox(560) }} onClick={e => e.stopPropagation()}>
        <div style={{ ...C.mhdr, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add transaction to books</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={C.mbdy}>
          {/* Direction + amount banner */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: moneyIn ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${moneyIn ? "#A7F3D0" : "#FECACA"}`, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.04em" }}>{moneyIn ? "Money in — receipt" : "Money out — payment"}</div>
              <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{bankAcct ? `into / from ${bankAcct.name}` : ""}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>{fmtC(grossC)}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" style={{ ...sel, marginTop: 5 }} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Counterparty <span style={{ textTransform: "none", fontWeight: 400, color: "#9CA3AF" }}>(optional)</span></label>
              <input style={{ ...sel, marginTop: 5 }} value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="who it's to / from" />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Description</label>
            <input style={{ ...sel, marginTop: 5 }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="what this is for" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{moneyIn ? "Income / account to credit" : "Expense / account to debit"}</label>
            <select style={{ ...sel, marginTop: 5 }} value={offsetId} onChange={e => setOffsetId(e.target.value)}>
              <option value="">— choose account —</option>
              {categoryAccts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>

          {/* VAT */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", marginBottom: 12, background: "#F9FAFB" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>
              <input type="checkbox" checked={vatOn} onChange={e => setVatOn(e.target.checked)} />
              This amount includes VAT
              {vatOn && (
                <select style={{ ...sel, width: "auto", padding: "4px 8px", marginLeft: 4 }} value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))}>
                  {[5, 0].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              )}
            </label>
            {vatOn && (
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                {!vatAcct && <div style={{ color: "#B91C1C", marginBottom: 6 }}>⚠ No {moneyIn ? "Output" : "Input"} VAT account found — VAT can't be posted.</div>}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#6B7280" }}><span>Net ({moneyIn ? "income" : "expense"})</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtC(netC)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#6B7280" }}><span>{moneyIn ? "Output" : "Input"} VAT {rate}%</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtC(vatC)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", marginTop: 4, borderTop: "1px solid #E5E7EB", fontWeight: 700, color: "#1A1A2E" }}><span>Total (bank)</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtC(grossC)}</span></div>
              </div>
            )}
            {!vatOn && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 6 }}>Leave off for VAT-free items (salaries, bank transfers, government fees…).</div>}
          </div>

          {err && <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>{err}</div>}
        </div>

        <div style={C.mftr}>
          <button style={C.btn("secondary")} onClick={onClose} disabled={busy}>Cancel</button>
          <button style={C.btn("success")} onClick={post} disabled={busy || !offsetId}>{busy ? "Posting…" : "Post entry"}</button>
        </div>
      </div>
    </div>
  );
}

function ReconSection({ title, count, accent, hint, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", marginBottom: 16, borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: "#1A1A2E" }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{count}</span>
      </div>
      {hint && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginBottom: 10 }}>{hint}</div>}
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Duplicate finder — scan bank/cash transactions for same-amount,
//  near-date copies (catches import-vs-manual double entries, incl. small
//  typos). Sets that mix an imported bank line with a manual entry are the
//  classic duplicate and are highlighted + listed first.
// ═══════════════════════════════════════════════════════════════════
function reconFindDuplicates(txns, accounts, windowDays, amountTolC) {
  const liquid = new Set((accounts || []).filter(a => a.isBank || a.isCash || a.code === "1001" || a.code === "1002").map(a => a.id));
  const dayMs = 86400000;
  const toTime = d => { const t = Date.parse(d); return isNaN(t) ? null : t; };
  const items = (txns || []).filter(t => !t.isVoid).map(t => {
    const amt = (t.lines || []).filter(l => liquid.has(l.accountId)).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
    if (!amt) return null;
    return { id: t.id, date: t.date || "", ref: t.ref || "", desc: t.description || "", txnType: t.txnType || "", amountC: amt, imported: /bank-import/.test(t.tags || "") || t.txnType === "BK" };
  }).filter(Boolean);
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const order = items.map((_, i) => i).sort((a, b) => Math.abs(items[a].amountC) - Math.abs(items[b].amountC));
  for (let a = 0; a < n; a++) {
    const A = items[order[a]];
    for (let b = a + 1; b < n; b++) {
      const B = items[order[b]];
      if (Math.abs(B.amountC) - Math.abs(A.amountC) > amountTolC) break;        // sorted asc → no further candidates
      if (Math.sign(A.amountC) !== Math.sign(B.amountC) || Math.abs(A.amountC - B.amountC) > amountTolC) continue;
      const x = toTime(A.date), y = toTime(B.date);
      if (x == null || y == null || Math.abs(x - y) / dayMs > windowDays) continue;
      parent[find(order[a])] = find(order[b]);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); });
  const sets = [...groups.values()].filter(g => g.length >= 2).map(g => {
    g.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { items: g, mixed: g.some(x => x.imported) && g.some(x => !x.imported), amountC: g[0].amountC, extraC: (g.length - 1) * Math.abs(g[0].amountC) };
  });
  sets.sort((a, b) => (b.mixed ? 1 : 0) - (a.mixed ? 1 : 0) || Math.abs(b.amountC) - Math.abs(a.amountC));
  return sets;
}

function DuplicatesModal({ txns, accounts, persistTxn, onClose }) {
  const [windowDays, setWindowDays] = React.useState(2);
  const [amountTol, setAmountTol] = React.useState(1);
  const [onlyMixed, setOnlyMixed] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const amountTolC = Math.round((parseFloat(amountTol) || 0) * 100);
  const allSets = React.useMemo(() => reconFindDuplicates(txns, accounts, windowDays, amountTolC), [txns, accounts, windowDays, amountTolC]);
  const sets = onlyMixed ? allSets.filter(s => s.mixed) : allSets;
  const totalExtra = sets.reduce((s, g) => s + g.extraC, 0);

  const voidTxn = async (id) => {
    const t = (txns || []).find(x => x.id === id);
    if (!t) return;
    if (!window.confirm(`Void this transaction?\n\n${t.ref} — ${t.description}\n\nIt stays on record marked Void and no longer affects balances. (Reversible.)`)) return;
    setBusy(id);
    try { await persistTxn({ ...t, isVoid: true }); toast("Transaction voided", "success"); }
    catch (e) { toast("Void failed: " + e.message, "error"); }
    setBusy("");
  };

  const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px" };
  const sel = { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "5px 8px", fontSize: 12.5, background: "#fff", outline: "none" };

  return (
    <div style={C.modal} onClick={onClose}>
      <div style={{ ...C.mbox(880), maxHeight: "94vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ ...C.mhdr, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>⚠ Possible Duplicates</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ ...C.mbdy, overflowY: "auto", flex: 1 }}>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 0 }}>Bank/cash transactions with the <strong>same amount</strong> (within tolerance) and <strong>close dates</strong> — likely the same money entered twice (e.g. imported from the statement <em>and</em> keyed manually).</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <label style={{ fontSize: 12.5, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>Amount tolerance
              <select style={sel} value={amountTol} onChange={e => setAmountTol(parseFloat(e.target.value))}>{[0, 0.5, 1, 2, 5].map(a => <option key={a} value={a}>{a === 0 ? "exact" : "±" + a.toFixed(2)}</option>)}</select>
            </label>
            <label style={{ fontSize: 12.5, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>Date window
              <select style={sel} value={windowDays} onChange={e => setWindowDays(parseInt(e.target.value, 10))}>{[0, 1, 2, 3, 5, 7].map(d => <option key={d} value={d}>±{d} day{d === 1 ? "" : "s"}</option>)}</select>
            </label>
            <label style={{ fontSize: 12.5, color: "#374151", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyMixed} onChange={e => setOnlyMixed(e.target.checked)} /> Only imported + manual mixes
            </label>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#6B7280" }}>{sets.length} set{sets.length !== 1 ? "s" : ""}{totalExtra ? ` · ~${fmtAED(totalExtra)} likely extra` : ""}</span>
          </div>

          {sets.length === 0
            ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No possible duplicates with these settings. 🎉</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sets.map((g, i) => (
                  <div key={i} style={{ ...card, borderLeft: `4px solid ${g.mixed ? "#DC2626" : "#D97706"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>{g.items.length}× {fmtAED(Math.abs(g.amountC))} {g.amountC < 0 ? "out" : "in"}</span>
                      {g.mixed && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, padding: "1px 7px" }}>imported + manual</span>}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        {g.items.map(it => (
                          <tr key={it.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                            <td style={{ padding: "5px 6px", fontSize: 12, whiteSpace: "nowrap" }}>{it.date || "—"}</td>
                            <td style={{ padding: "5px 6px", fontSize: 11, fontFamily: "monospace", color: "#6B7280" }}>{it.ref || "—"}</td>
                            <td style={{ padding: "5px 6px" }}>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: it.imported ? "#1D4ED8" : "#047857", background: it.imported ? "#EFF6FF" : "#ECFDF5", border: `1px solid ${it.imported ? "#BFDBFE" : "#A7F3D0"}`, borderRadius: 4, padding: "1px 5px" }}>{it.imported ? "imported" : "manual"}</span>
                            </td>
                            <td style={{ padding: "5px 6px", fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.desc}>{it.desc || "—"}</td>
                            <td style={{ padding: "5px 6px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", color: it.amountC < 0 ? "#DC2626" : "#059669", whiteSpace: "nowrap" }}>{fmtAED(it.amountC)}</td>
                            <td style={{ padding: "5px 6px", textAlign: "right" }}>
                              <button style={{ ...C.btn("secondary", true), color: "#DC2626", fontSize: 11 }} disabled={busy === it.id} onClick={() => voidTxn(it.id)}>{busy === it.id ? "…" : "Void"}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>}

          <div style={{ marginTop: 14, fontSize: 11.5, color: "#9CA3AF" }}>Keep the date window small (±1–2 days) so genuinely recurring charges on different dates aren't flagged. Void the extra copy — usually the <strong>manual</strong> one (especially if it has a typo), keeping the imported bank line.</div>
        </div>
        <div style={{ ...C.mftr, justifyContent: "flex-end" }}><button style={C.btn("secondary")} onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
