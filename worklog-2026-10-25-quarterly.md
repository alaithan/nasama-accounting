# Worklog 2026-10-25 — Quarterly Comparative Financial Reports (Arabic / RTL)

New page **Quarterly (AR)** under ACCOUNTING: `nasama-accounting-v2.quarterly.jsx`.

## What it does
- Filter: fiscal year · quarter (Q1–Q4) · the comparison quarter is derived automatically (Q1 → Q4 of the prior year).
- Four tabs, each a QoQ table `البند | الربع السابق | الربع الحالي | التغير | % | ▲/▼`:
  قائمة الدخل · المركز المالي · التدفقات النقدية · الذمم والسيولة, with optional per-account detail rows.
- KPI cards: gross margin, net margin, current ratio, cash conversion (operating cash ÷ net profit), each with a one-line Arabic explanation.
- Rule-based narrative under each tab (`qtrInsights`): profitability driver decomposition, book-profit-vs-cash warning,
  current-ratio reading, equity movement, DSO/DPO, aging > 90 days.
- Export: Excel (SheetJS, 5 RTL sheets) and PDF (A4 RTL document in a print iframe → "Save as PDF").

## How the numbers are derived (all from the GL, cents)
- Period movement via `buildLedger(withoutClosing(period))`; positions via ledger to quarter end; cash flow via core `computeCashFlow`.
- Cost of revenue = 5030/5040/5500/5510 (+ names matching commission/override/incentive). Everything else in 5xxx = opex.
- Non-current assets = code ≥ 1500 (incl. 1590 contra). Long-term liabilities = 2200 loan, 2250 EOSB. Rest = current.
- Equity = equity accounts + cumulative unclosed profit (so the quarter balance sheet always balances; `check` must be 0).
- Receivables = 1100 (+ "receivable" names). Payables = 2210, 2240, "payable/accrued" names, excluding VAT 2101 and client deposits 2230.
- Invoice aging buckets (as of quarter end) appear when `insInvoiceMeta` (insights.jsx) is loaded; otherwise GL figure only.
- % change uses |previous| as the base and is blank when previous = 0.

## Wiring
- `core.jsx`: NAV entry, `PAGE_ACCESS_BRIDGE.quarterly = "accounting.read"`, legacy map admin/accountant.
- `pages.jsx`: `case "quarterly"`. `index.html`: script after insights.jsx.

## Tests / preview
- `tests/quarterly.test.js` (5,502 assertions): hand-computed Q1/Q2 2026 book, comparison rows, insight rules, export payloads,
  and seeded random books × 8 quarters (BS balances, cash chains, no NaN in narrative). `node tests/run-all.js` → all 15 files pass.
- `tools/quarterly-mock-data.js` = the two-quarter mock book (also the test fixture).
- `node tools/build-quarterly-preview.js <out.html>` builds the standalone preview published as a Claude Artifact.

## Not done / to verify in the browser
- Visual check in the live app (RTL inside the LTR shell, print dialog on Chrome/Edge, Excel RTL view).
- Not committed / not pushed.

## Follow-up (same day)
- Comparison mode selector: previous quarter (QoQ) or the same quarter last year (YoY) — `qtrCompareTarget`.
- New tab «السنة كاملة (4 أرباع)»: all four statements with Q1–Q4 columns; income/cash flow total across the year, balance sheet/receivables show the year-end column. Year narrative `qtrYearInsights`. Added to the Excel workbook (sheet "السنة كاملة") and appended to the PDF on a new page.
- Receivables/payables tab: with "إظهار تفصيل الحسابات" on, the payables line splits by WHAT was accrued (the expense account each 2210 accrual debited: Office Rent, Manager Salary …), open until a settlement naming it (accrual_txn_id) is posted; untraceable 2210 balance shown as "other" so lines tie to the ledger. Also in Excel/PDF and in the narrative (largest item). `qtrPayablesBreakdown`.
- Every statement tab shows Q1–Q4 of the selected year as columns (selected quarter tinted); Δ/% still vs the comparison quarter.
- Decision (owner asked): office rent and manager fixed salary stay in opex; only commissions/incentives/override are cost of revenue.
- Income statement expense rows carry a red «غير مدفوع» tag with the open accrued amount at the quarter end (summary opex / cost-of-revenue rows: «منها غير مدفوع»). Also in the PDF and as an extra Excel column.
- Cash flow: client money shown gross — «أمانات عملاء مستلمة» / «مردودة أو مصروفة» / «صافي» — so money that came in and went out inside one quarter is visible instead of netting to 0. Mock gains Q3 client-money entries (50,000 refund; 63,000 in and passed on).
- Period selector now offers Q1–Q4, H1, H2 and FY (`QTR_PERIODS`, `qtrCodeOf`); like-period comparison: H1→H2 of prior year, H2→H1, FY→prior FY, or the same period last year. Multi-quarter periods add an «إجمالي» column beside the tinted quarter columns.
