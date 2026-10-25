// Builds a self-contained preview page for the Arabic Quarterly Reports module:
// the REAL module source (nasama-accounting-v2.quarterly.jsx) + the mock book
// (tools/quarterly-mock-data.js) + tiny shims for the core.jsx globals it calls.
//
//     node tools/build-quarterly-preview.js <out.html>
//
// The output has no <html>/<head>/<body> wrapper on purpose: it is meant to be
// published as a Claude Artifact (which wraps it) — open it from there, not
// from disk. The page is a PREVIEW: Excel download and the print dialog are
// blocked inside the artifact frame, so the PDF button shows the printable
// document inline and the Excel button explains where it works.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const out = process.argv[2];
if (!out) { console.error("usage: node tools/build-quarterly-preview.js <out.html>"); process.exit(1); }
const moduleSrc = fs.readFileSync(path.join(ROOT, "nasama-accounting-v2.quarterly.jsx"), "utf8");
const mockSrc = fs.readFileSync(path.join(ROOT, "tools", "quarterly-mock-data.js"), "utf8");
if (/<\/script/i.test(moduleSrc + mockSrc)) throw new Error("source contains </script>");

// core.jsx primitives the module calls, copied verbatim in behaviour (see core.jsx).
const shims = String.raw`
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const GOLD = "#C9A044", NAVY = "#0C0F1E";
const NORMAL_BAL = { Asset: "debit", Expense: "debit", Liability: "credit", Equity: "credit", Revenue: "credit" };
function buildLedger(transactions, accounts) {
  const ledger = {}; accounts.forEach(a => { ledger[a.id] = { debit: 0, credit: 0 }; });
  transactions.forEach(t => { if (t.isVoid) return; (t.lines || []).forEach(l => { if (!ledger[l.accountId]) ledger[l.accountId] = { debit: 0, credit: 0 }; ledger[l.accountId].debit += (l.debit || 0); ledger[l.accountId].credit += (l.credit || 0); }); });
  return ledger;
}
function accountBalance(acct, ledger) { const nb = NORMAL_BAL[acct.type] || "debit"; const e = ledger[acct.id] || { debit: 0, credit: 0 }; return nb === "debit" ? e.debit - e.credit : e.credit - e.debit; }
const txnTagList = t => String((t && t.tags) || "").split(/[\s,]+/).filter(Boolean);
const isClosingTxn = t => txnTagList(t).includes("year-end-close");
const withoutClosing = txns => (txns || []).filter(t => !isClosingTxn(t));
const isMoneyAccount = a => !!a && (!!a.isBank || !!a.isCash || a.code === "1001");
const isFixedAssetAcct = a => !!a && a.type === "Asset" && ((String(a.code || "") >= "1500" && String(a.code || "") <= "1599") || /fixed|equipment|furniture|computer|vehicle|machinery/i.test(a.name || ""));
const isFinancingLiability = a => !!a && a.type === "Liability" && (a.code === "2200" || /loan|borrow/i.test(a.name || ""));
const isClientFundsTxn = t => !!t && (t.txnType === "CF" || txnTagList(t).includes("client-funds"));
const cashFlowCategory = (t, byId) => {
  if (!t || t.isVoid) return null;
  const acct = l => byId.get(l.accountId); const lines = t.lines || [];
  const money = lines.filter(l => isMoneyAccount(acct(l))); if (!money.length) return null;
  const net = money.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
  const other = lines.filter(l => !isMoneyAccount(acct(l)) && ((l.debit || 0) || (l.credit || 0)));
  if (!other.length) return net === 0 ? "transfer" : "operating";
  if (isClientFundsTxn(t) || other.some(l => (acct(l) || {}).code === "2230")) return "clientFunds";
  if (other.some(l => isFixedAssetAcct(acct(l)))) return "investing";
  if (["CI", "OD"].includes(t.txnType) || txnTagList(t).includes("opening-balance") || other.some(l => { const a = acct(l); return a && (a.type === "Equity" || isFinancingLiability(a)); })) return "financing";
  return "operating";
};
const txnCashNet = (t, byId) => (t.lines || []).reduce((s, l) => isMoneyAccount(byId.get(l.accountId)) ? s + (l.debit || 0) - (l.credit || 0) : s, 0);
const computeCashFlow = ({ accounts, txns, openingLedger, toDateLedger }) => {
  const byId = new Map(accounts.map(a => [a.id, a])); const cashAccounts = accounts.filter(isMoneyAccount);
  const openingCash = cashAccounts.reduce((s, a) => s + accountBalance(a, openingLedger || {}), 0);
  const closingCash = cashAccounts.reduce((s, a) => s + accountBalance(a, toDateLedger || {}), 0);
  const sections = { operating: { total: 0, lines: [] }, investing: { total: 0, lines: [] }, financing: { total: 0, lines: [] }, clientFunds: { total: 0, lines: [] } };
  (txns || []).forEach(t => { const cat = cashFlowCategory(t, byId); if (!cat || cat === "transfer") return; const amount = txnCashNet(t, byId); if (!amount) return; sections[cat].total += amount; sections[cat].lines.push({ ref: t.ref, amount, date: t.date }); });
  const netMovement = sections.operating.total + sections.investing.total + sections.financing.total + sections.clientFunds.total;
  return { cashAccounts, openingCash, closingCash, sections, netMovement, difference: closingCash - (openingCash + netMovement) };
};
const C = {
  card: { background: "#ffffff", border: "1px solid #E4E7EC", borderRadius: 12, boxShadow: "0 1px 2px rgba(16,24,40,.04)" },
  input: { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: NAVY, background: "#fff", outline: "none", width: "100%" },
  select: { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: NAVY, background: "#fff", outline: "none", width: "100%" },
  label: { fontSize: 12, fontWeight: 600, color: "#344054", marginBottom: 4, display: "block" },
  th: { textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#475467", background: "#FCFCFD", borderBottom: "1px solid #E4E7EC", whiteSpace: "nowrap" },
  td: { padding: "11px 14px", borderBottom: "1px solid #F2F4F7", color: "#344054", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" },
  err: { background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 8, padding: "10px 14px", color: "#B42318", fontSize: 13, marginBottom: 12 },
  btn(v = "primary") { const base = { padding: "9px 18px", fontSize: 13, borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }; return v === "primary" ? { ...base, background: GOLD, color: "#fff", border: "none" } : { ...base, background: "#fff", color: NAVY, border: "1px solid #D0D5DD" }; },
};
const todayStr = () => "2026-10-25";
const usePersistedState = (k, fb) => useState(fb);
const ls_get = (k, fb) => fb;
function toast(msg, t) { const el = document.getElementById("toast"); el.textContent = msg; el.dataset.tone = t || "info"; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 3600); }
`;

const overrides = String.raw`
// Preview-only: the artifact frame blocks print dialogs and downloads.
function qtrPrint(html) {
  const host = document.getElementById("print-preview");
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  const styles = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ""])[1];
  root.innerHTML = "<style>" + styles + " :host{display:block} .foot{position:static;margin-top:14pt} .page{background:#fff;color:#0C0F1E;padding:14mm;max-width:210mm;margin:0 auto;box-shadow:0 2px 14px rgba(16,24,40,.12);direction:rtl;font-size:10.5pt;line-height:1.55;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif}</style><div class=\"page\">" + body + "</div>";
  document.getElementById("print-wrap").hidden = false;
  document.getElementById("print-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("هذه معاينة لمستند PDF الرسمي (A4). داخل النظام يفتح زر التصدير نافذة الطباعة/الحفظ بصيغة PDF مباشرة.", "info");
}
function qtrExportExcel() { toast("تصدير Excel (5 أوراق RTL) يعمل داخل النظام عبر مكتبة SheetJS المضمّنة؛ التنزيل معطّل في نافذة المعاينة.", "warning"); }
function PreviewApp() {
  const { accounts, txns } = window.QTR_MOCK;
  return <QuarterlyReportsPage accounts={accounts} txns={txns} settings={{ company: "شركة نسمة للعقارات (بيانات تجريبية)", trn: "100000000000003" }} />;
}
ReactDOM.createRoot(document.getElementById("root")).render(<PreviewApp />);
`;

const page = `<title>التقارير ربع السنوية المقارنة</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>
/* Single-theme by choice: the Nasama accounting app is a light, paper-white ledger UI (gold + navy brand); the preview mirrors it. */
:root { --bg: #F4F5F7; --paper: #FFFFFF; --ink: #0C0F1E; --muted: #667085; --line: #E4E7EC; --accent: #C9A044; --warn-bg: #FFFAEB; --warn-fg: #B54708; color-scheme: light; }
body { background: var(--bg); color: var(--ink); margin: 0; padding-block: 0 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif; }
#root, #root * , #print-preview { font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif !important; }
.wrap { max-width: 1180px; margin: 0 auto; }
.banner { direction: rtl; text-align: right; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; justify-content: space-between; padding: 12px 16px; margin: 14px 0 18px; background: var(--warn-bg); border: 1px solid #FEDF89; border-radius: 10px; color: var(--warn-fg); font-size: 13px; line-height: 1.7; }
.banner b { color: var(--ink); }
.banner code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; direction: ltr; unicode-bidi: embed; }
#print-wrap { margin-top: 28px; direction: rtl; text-align: right; }
#print-wrap h3 { margin: 0 0 10px; font-size: 15px; color: var(--ink); }
#print-wrap .close { float: left; background: none; border: 1px solid var(--line); border-radius: 8px; padding: 5px 12px; cursor: pointer; font: inherit; color: var(--muted); }
#print-preview { overflow-x: auto; }
#toast { position: fixed; bottom: 20px; left: 20px; right: 20px; margin: 0 auto; max-width: 560px; background: var(--paper); border: 1px solid var(--line); border-right: 4px solid var(--accent); border-radius: 12px; padding: 12px 16px; box-shadow: 0 8px 24px rgba(16,24,40,.14); font-size: 13px; direction: rtl; text-align: right; color: var(--ink); z-index: 50; }
#toast[data-tone="warning"] { border-right-color: #D97706; }
select:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
@media (max-width: 640px) { #root h1 { font-size: 18px !important; } #root table { font-size: 12px !important; } }
</style>
<div class="wrap">
  <div class="banner">
    <div><b>معاينة ببيانات تجريبية</b> — الأرقام أدناه ليست أرقام الشركة الفعلية؛ هي دفتر قيود وهمي لربعين متتاليين (الربع الأول والثاني 2026) محسوبٌ بنفس كود الوحدة المدمجة في النظام. داخل النظام تُقرأ القيود من Firestore تلقائياً.</div>
    <div><code>nasama-accounting-v2.quarterly.jsx</code> · <code>tools/quarterly-mock-data.js</code></div>
  </div>
  <div id="root" dir="rtl"></div>
  <div id="print-wrap" hidden>
    <button class="close" type="button" onclick="document.getElementById('print-wrap').hidden=true">إغلاق المعاينة</button>
    <h3>معاينة مستند PDF الرسمي (A4 عمودي، جاهز للطباعة)</h3>
    <div id="print-preview"></div>
  </div>
</div>
<div id="toast" hidden></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js"></script>
<script>${mockSrc}</script>
<script type="text/babel" data-presets="react">
${shims}
/* ═══════ nasama-accounting-v2.quarterly.jsx (verbatim) ═══════ */
${moduleSrc}
</script>
<!-- Separate script on purpose: a later top-level function declaration replaces the module's
     qtrPrint / qtrExportExcel globals, which Babel would reject as duplicates inside one block. -->
<script type="text/babel" data-presets="react">
${overrides}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page, "utf8");
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
