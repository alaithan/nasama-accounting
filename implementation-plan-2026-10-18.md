# Implementation Plan — from the 2026-10-18 code review

How to use this file: every item has a **Decision** box. Tick one:
`[x] YES` = implement, `[x] NO` = skip, `[x] LATER` = defer. Leave the Status column to me.
Items are ordered by importance inside each stage, and stages are ordered by importance overall.
Source findings with line numbers: `code-review-2026-10-18.md`.

Effort: S = under an hour, M = half a day, L = one to two days, XL = several days.
Risk = chance of breaking something that works today.

---

## Stage 1 — Security and data protection (do first; everything else sits on this)

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 1.1 | **Close the database.** Replace the open Firestore rule with per-collection rules keyed to `authorized_users` and role; drop anonymous auth and sign every user in with Firebase email/password. | Today anyone on the internet can sign in anonymously and read or delete the whole ledger. | L | M (login flow changes for every user) | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — firestore.rules rewritten (NOT deployed — see worklog-2026-10-19-stage1.md rollout) |
| 1.2 | **Stop storing access codes in plaintext.** Move to Firebase Auth passwords; if codes must stay, hash them and verify server-side. | With 1.1 unfixed, all codes are readable; even after 1.1, a leaked backup exposes them. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Firebase email/password + verified email; invites; legacy codes removable |
| 1.3 | **Gate Settings / Backup / Restore to admin**, strip `authorized_users` from backups, whitelist restorable collections. | A secretary can currently download every access code and overwrite any collection. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 1.4 | **Make `audit_logs` append-only** and log every create / edit / reversal / delete from `persistTxn` / `deleteTxn` with actor and before/after. | Page postings are not logged at all today, and the log can be deleted by any client. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — logged from persistTxn/persistTxnBatch/deleteTxn; audit_logs append-only in rules |
| 1.5 | **Clear the localStorage mirror on sign-out** and do not hydrate from cache before auth resolves. | Next user on a shared PC sees the previous user's ledger. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 1.6 | **Remove the mass-delete diagnostic tools** from Banking ("Delete All BP Today", "reversal entries adding money" panel) or hide behind an admin debug flag. | One click hard-deletes legitimate reversals. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 1.7 | Escape `settings.company` / `trn` in the VAT print iframe. | Stored XSS path. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 1.8 | Scheduled encrypted Firestore export (Cloud Scheduler to GCS) replacing the manual JSON download. | Backups today depend on someone remembering, and contain credentials. | M | L | [x] YES  [ ] NO  [ ] LATER | gcloud commands in worklog-2026-10-19-stage1.md — needs you to run them (not possible from the app) |

---

## Stage 2 — Ledger integrity and controls

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 2.1 | **Period lock.** `settings.lockedThrough` date; refuse edit / delete / post dated on or before it in `persistTxn`, `deleteTxn`, `reviewTxnDraft`; corrections only by dated reversal. | A March receipt can be changed after the Q1 VAT return is filed. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — Settings › Period Lock (admin); enforced at the Firestore helper |
| 2.2 | **Reversal propagation.** Copy `deal_id`, `customer_id`, `invoice_id`, `planned_expense_id` onto the reversal; make `dealCollection`, invoice Paid status, Performance cash-in and Employees subtract reversed receipts; `accrualStatus` returns null for reversal entries. | Reversed receipts still count as collected and keep invoices "Paid"; reversed deposits create a phantom party; accrual reversals show red "Unpaid". | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — reversed pairs skipped in collection/invoice/P&L/employees; links copied |
| 2.3 | **Prevent double-posting.** Busy state on the Posting Preview confirm button; reuse one txn id per preview. | Two clicks = two revenue entries. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — useSubmitGuard on preview, transfer, journal, accrue |
| 2.4 | **Match accrual settlements to the specific accrual** (`accrual_txn_id`), not the reused planned-expense id. | Every recurring accrual after the first reads "Settled" while 2210 still carries it. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — accrual_txn_id; FIFO for legacy data |
| 2.5 | **Sale Receipt and invoice honour `deal.vat_applicable`** (VAT 0 when the deal is not VAT-applicable). | Non-VAT deals currently book output VAT. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — receipt rate from deal; invoice lines carry noVat |
| 2.6 | **Chart of Accounts guards:** unique code, freeze code/type once lines reference the account, delete only when nothing references it. | Duplicate code silently overwrites; engine resolves by code. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 |
| 2.7 | **Permission fixes:** Receipts need `accounting.create`; deal delete admin-only and blocked when txns are linked; `Pay Broker` uses an existing permission; invoice-editor deal fix checks deal permission. | Front-office users can post to the GL and delete deals with receipts; Pay Broker is invisible to non-admins. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — receipts need accounting.create; deal delete admin-only + blocked when linked |
| 2.8 | Broker + manager payment and deal update written as one batch; bank import committed as one batch. | Partial failure leaves half a payment posted; retry double-posts. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — persistTxnBatch |
| 2.9 | Accrual settlement true-up: lock the 2210 debit to the accrual's net, post any difference to expense; block delete/skip of a planned expense while its accrual is live. | 2210 drifts; orphaned liabilities with no way to settle. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — true-up line; delete/skip blocked while accrued |
| 2.10 | Fix recurring due-date drift (31 Jan to 3 Mar; Feb-29). | Rent reminders land on the wrong day. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — dueDay anchor |
| 2.11 | Enforce the existing `approval_policies` for PV/BP above a limit (draft, approved, posted). | Policy data is stored but nothing reads it. | L | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — new Approvals page; inactive until limits are set in User Management |
| 2.12 | Sequential refs for SR/PV/JV from a server counter instead of `Date.now()`. | Non-sequential refs; same-millisecond collisions. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-18 — PV-2026-00042 style, new entries only |

---

## Stage 3 — Invoices and UAE VAT compliance

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 3.1 | **Lock issued invoices.** Edit only for drafts; "Duplicate as new" for issued; refuse draft/void status changes on issued docs; remove the dead Status dropdown; stamp `issuedAt` / `issuedBy`. | An issued or paid invoice can be demoted to draft and disappears from the deal's invoiced total. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Edit only for drafts; Duplicate; status set by buttons; issuedAt/By |
| 3.2 | **Gapless numbering at issue time** inside one Firestore transaction with the invoice write; delete the offline `Date.now()` fallback; remove the non-transactional counter init. | FTA expects a sequential, gap-free tax invoice series. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — number allocated in the issue transaction; no fallback |
| 3.3 | **TRN validation:** require a 15-digit supplier TRN to issue; require customer TRN or an explicit "not registered" checkbox; never print "Not VAT registered" for a blank field. | Current output can be an invalid or false tax document. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 3.4 | **Tax credit notes** (negative lines, references original number) and block void of an invoice with linked receipts. | FTA requires a credit note to cancel an issued tax invoice. | L | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — full credit notes (CN-001 series); blocked while receipts linked |
| 3.5 | **Post AR + Output VAT on issue** (DR Commission Receivable / CR Revenue / CR 2101); receipt then clears AR. | Fixes the tax point (invoice date, not cash date) and gives a real receivable on the Balance Sheet. Biggest accounting-model change in this list. | XL | H | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — OFF by default: Settings › Invoicing basis + start date |
| 3.6 | Exclude client-funds (deposit) receipts from invoice-payment linking. | A refundable deposit can mark a commission invoice Paid. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 3.7 | Fixed-amount and 0%-VAT lines; per-line VAT rate seeded from the deal; no silent 3% default; print "--" instead of 8-decimal percentages. | Flat rental fees and non-VAT deals cannot be invoiced correctly today. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — % or fixed per line; no 3% default; long rates print -- |
| 3.8 | Multi-deal invoice receipts pick the next uncovered deal; show overpayment. | Second receipt always hits deal 1; surplus is invisible. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 3.9 | Freeze a PDF copy at issue; multi-page PDF instead of shrinking to one page. | Historical invoices change appearance when settings change; long invoices are unreadable. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — frozen PDF in invoice_pdfs; multi-page export |
| 3.10 | Proforma / commission-claim document type that does not consume a tax-invoice number. | Many developers require a claim before the tax invoice. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Issue as Claim (CC-001) → Tax invoice |
| 3.11 | Statement of account per developer with open items and aging. | Collection chasing. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — 📄 Statement (PDF / Excel) |
| 3.12 | Deposit receipts: counter and receipt written in one transaction; add "Void receipt". | Gaps in the receipt series; wrong receipts cannot be voided. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |

---

## Stage 4 — Report corrections (each is a small predicate fix)

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 4.1 | Cash Flow Statement: use the real cash predicate (`isBank` / `isCash` / 1001), not code prefix `10`. | Prepaid Expenses 1004 counted as cash. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — core isMoneyAccount |
| 4.2 | Cash Flow Statement: exclude voided txns from movements and render the Opening + flows vs Closing difference line. | Statement does not foot and nobody can see it. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — difference line shown only if non-zero; also fixed 'no start date' opening ledger |
| 4.3 | Equity statement: fix drawings sign in the TOTAL row (screen and print); add opening retained earnings so closing equals the Balance Sheet. | Drawings are added instead of subtracted; equity disagrees with BS. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — core computeEquityStatement (screen + print) |
| 4.4 | Exclude client-funds txns from operating cash flow (Dashboard tile, 6-month series, CF statement); show "client funds held" as its own line; route 2200 loan to financing. | A 500k deposit shows as 500k operating inflow. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — core cashFlowCategory used by Dashboard + CF statement |
| 4.5 | Exclude Cancelled deals from pipeline KPIs and projected runway. | Pipeline and runway inflated. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — core isOpenDeal |
| 4.6 | Deal Profitability and Employees: use revenue credits (net of VAT), not bank debits; date revenue by receipt date. | Margins overstated by 5%; revenue booked in the deal's creation year. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — revenue-account lines per deal |
| 4.7 | Expense Control and Budget actuals: debits minus credits. | Reversed expenses never reduce "Spent". | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 4.8 | Runway: average fixed overhead over complete months, excluding broker payouts. | One big broker payout halves the displayed runway. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — avgMonthlyFixedOverhead |
| 4.9 | VAT print: keep negative (reversal) rows in the tables. | Printed breakdown does not foot to the total. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 4.10 | Comparative column only when both dates are set; clamp Feb-29. | Nonsensical "prior period" with one bound. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — shiftIsoYears |
| 4.11 | Label "YTD" figures correctly ("since 2025-01-01") or make them true year-to-date. | Misleading KPI labels. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — fields renamed …SinceStart (not shown on screen) |
| 4.12 | Memoise VAT settlement detection and Performance scans; index txns by id. | Not visible yet; will be at a few thousand txns. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Performance, VAT, Budget, Banking |

---

## Stage 5 — Bank reconciliation

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 5.1 | **PDF statements: derive sign from the running balance** or ask the user for debit/credit columns; never auto-map an unsigned amount. | Every withdrawal imports as money in. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — sign from running balance / explicit marker; unproven lines held out |
| 5.2 | **Book balance as of statement end date**, with pre-period outstanding items carried forward. | A past month can never reconcile. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — balance as of statement end; carry-forward from first saved session |
| 5.3 | **Persist reconciliation sessions**: statement id, period, closing balance, `reconciled_at` on matched txns; lock reconciled txns from edit/void. | Matches are thrown away; reconciled items drift. | L | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — bank_reconciliations + reconciled_at stamps; locked; Undo last |
| 5.4 | Duplicate finder: require `accounting.void` and refuse to void an already-reversed original. | Recreates the double-count the reversal migration fixed. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 5.5 | Manual pair / unpair / exclude and post bank-charge adjustments from the modal. | Today only "Add" exists. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — pair / unpair / exclude; one-click Bank charge |
| 5.6 | Excel/CSV date format detection (dd/mm vs m/d) and European number formats; dateless lines must not match. | Silent wrong dates on import. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — one date order per file; Excel real dates; 1.234,56 and 100- |

---

## Stage 6 — Accounting completeness

| # | Item | Why it matters | Effort | Risk | Decision | Status |
|---|------|----------------|--------|------|----------|--------|
| 6.1 | Depreciation: accumulated depreciation accounts for 1500/1510 and a monthly schedule. | Policy note already claims it; Balance Sheet overstates assets. | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Chart of Accounts › 🏷 Depreciation |
| 6.2 | Salaries payable, staff advances and recovery tracking. | Employees module is cash-basis only. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Employees › Payroll & EOSB (2240 / 1150) |
| 6.3 | UAE end-of-service gratuity accrual per employee. | Unrecorded liability that grows every month. | M | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Decree-Law 33/2021 formula; 2250 / 5302 |
| 6.4 | Year-end close of net income to 3002 Retained Earnings. | Equity statement and prior-year comparisons depend on it. | S | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Settings › Year-end close; excluded from period P&L |
| 6.5 | Record "broker paid without bank transaction" as an accrual instead of a deal field outside the ledger. | Deal Card margin the P&L does not have. | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — 'Accrue (pay later)'; Pay Broker settles it |
| 6.6 | Multi-currency with FX rate per transaction (AED functional). | Foreign buyers and overseas vendors. | XL | H | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Receipts & Payments: currency + rate; ledger stays AED |
| 6.7 | Attachments on transactions and deals (Firebase Storage). | Tax invoices, MOU, cheque images next to the entry. | L | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — stored in Firestore chunks (≤5 MB); Journal 📎 and Deal Card |

---

## Stage 7 — Decision-maker reports (new)

| # | Item | Question it answers | Effort | Risk | Decision | Status |
|---|------|---------------------|--------|------|----------|--------|
| 7.1 | **13-week cash forecast**: availableCash + installment schedule + earned-not-collected deals − planned expenses − broker payouts due − next VAT settlement. | Will we have enough cash in the next 90 days? | L | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Insights › 13-week cash |
| 7.2 | **Commission receivable aging by developer** (30/60/90) keyed on invoice or earned date. | Who owes us and for how long? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Insights › Receivables |
| 7.3 | **Broker payable schedule**: collected deals where the broker share is still owed. | What do we owe brokers this month? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Insights › Broker payables |
| 7.4 | **Break-even**: fixed overhead divided by average retained commission per deal; months covered by pipeline at a conversion rate. | How many deals a month keep us alive? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 7.5 | **VAT return by FTA tax period** with filing deadline and reconciliation to 2101/1201 balances and settlements. | Is the return right and when is it due? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — tax-period cycle selectable |
| 7.6 | Revenue earned vs cash collected by month and developer (collection lag). | Which developers pay late? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 7.7 | Budget vs actual for revenue and net income with full-year projection. | Are we on plan? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — Budget now takes revenue targets |
| 7.8 | 12-month expense trend by category with run-rate and year-on-year. | Where is cost creeping? | S | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 7.9 | Management alerts panel: runway under 3 months, commission overdue 60+ days, broker payable above collected, deal with no receipt, unpaid accruals past due. | What needs attention today? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |
| 7.10 | Stage-weighted pipeline and runway scenarios (conservative / expected / optimistic). | How much of the pipeline is real? | M | L | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 |

---

## Stage 8 — Tests (recommended alongside Stages 2 to 5)

| # | Item | Effort | Decision | Status |
|---|------|--------|----------|--------|
| 8.1 | Posting engine: `computeVATSplit`, `postSaleReceipt`, `postPayment`, `postAccrual` / settlement, `postBrokerPayment`, `reverseTransaction` propagation. | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — tests/engine.test.js |
| 8.2 | Reports: Balance Sheet ties, Cash Flow foots, Equity closes to BS, VAT report with settlements and reversals. | M | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — tests/reports.test.js (seeded property test) |
| 8.3 | Reconcile parsers: amount sign, dd/mm vs m/d, PDF rows, duplicate detection. | S | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — tests/stage5.test.js |
| 8.4 | Future expenses: due-date advance, accrual lifecycle. | S | [x] YES  [ ] NO  [ ] LATER | Done 2026-10-19 — tests/future-expenses.test.js |

---

## Notes
- Stage 1 and items 2.1 to 2.5 are the ones I would not skip.
- 3.5 (AR on issue) changes the accounting model from cash-settled to accrual for revenue. It is the right long-term move for VAT, but decide it deliberately; everything else in Stage 3 works without it.
- Items marked Effort S can be batched into one commit per stage.
