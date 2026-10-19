# Nasama Accounting v2 — Full Code Review (2026-10-18)

Scope: all 14 app modules (~19k lines), firestore.rules, tests. Four parallel module reviews
(invoices, reports, transactional pages/auth, auxiliary modules) plus a direct read of the
posting engine in core.jsx. Every finding below was verified against the source line cited.

Test suite: 5 files, 755 assertions, all pass (`node tests/<file>`). The posting engine,
VAT split, reversal, reports and reconcile parsers have **no** tests.

Legend: P = pages.jsx, K = core.jsx, I = invoices.jsx, R = reports.jsx, R2 = reports2.jsx,
FE = future-expenses.jsx, RC = reconcile.jsx, D = deposits.jsx, E = employees.jsx.

---

## 1. CRITICAL — fix before anything else

| # | Finding | Where |
|---|---------|-------|
| C1 | **Database is world-writable.** Rules allow any `request.auth != null`; the app enables anonymous auth. Anyone can call `signInAnonymously()` and read/delete every collection. | firestore.rules:18-20, P:6198-6200 |
| C2 | **Access codes stored in plaintext in Firestore and compared in the browser.** With C1 anyone can harvest all codes or set `role:'admin'` on their own doc. | P:5912, P:6343, P:6241 |
| C3 | **Backup/Restore/Settings not permission-gated; backup contains `authorized_users` with codes.** Secretary/accountant templates have `system.read`, which is enough to reach the page. Restore does non-merge `set` on whatever collections the JSON contains. | P:5585-5588, 5637-5645, 5693, 5783 |
| C4 | **Issued (even paid) invoices can be demoted to draft or resurrected from void.** Edit button shows for every status; "Save Draft" overwrites `status`. Invoice drops out of `commissionInvoicing`, deal shows "not invoiced". The Status dropdown is dead code. | I:1681, I:1360, I:804 |
| C5 | **PDF bank statements import every withdrawal as money-in.** Amount is taken unsigned from the second-to-last number on the line; bank PDFs print debits unsigned. | RC:65-82, RC:29-44 |

## 2. HIGH — wrong numbers or missing controls

**Ledger / reversal model**
- H1 **Reversed Sale Receipt still counts as collected** on the deal and still shows the invoice as Paid. `dealCollection` sums cash *debits* only; the reversal JV has cash on the credit side and carries no `invoice_id`. Deal collection, invoice Paid status, Performance "cash in", broker payable and Employee "Generated" are all overstated after any reversal. (K:613-646, I:1401-1409, P:4625-4629, E:244-251)
- H2 **Reversal copies the original's tags** (`"accrual reversal"`, `"client-funds-received reversal"`) but not `deal_id`/`customer_id`/`planned_expense_id`. Effects: accrual reversals display as red "Unpaid" accruals (K:52-67); reversing a deal-linked deposit creates a phantom negative party while the original party still shows "held" with live Refund/Close buttons (K:2009, K:208). Fix: in `reverseTransaction` copy the txn-level ids, and make `accrualStatus` return null when `reversesTxnId` is set.
- H3 **No period lock.** Any posted transaction of any date can be edited or hard-deleted (Journal, Banking). A March receipt can be changed after the Q1 VAT return is filed. (P:3726-3732, 3849, 3353, 6861)
- H4 **No audit trail for page postings, edits, reversals or deletes.** Engine logs only when `commit:true`; every page calls `commit:false` then `persistTxn`. `audit_logs` is client-writable and deletable. (K:1700, P:2704, 3265, 3767, 3791)
- H5 **Double-click posts duplicate receipts/payments/transfers/JVs.** Confirm button has no busy state; each click mints a new id/ref. (K:2568, P:2700, 2894, 3192, 3755)
- H6 **Recurring accrual reads "Settled" from the second cycle on.** Settlement is matched by `planned_expense_id` alone, which is reused each cycle. 2210 keeps the liability while the badge says paid. (K:60-69, FE:311-349)

**Reports**
- H7 **Cash Flow Statement counts 1004 Prepaid Expenses as cash** (regex `^10`). Opening/closing cash and Note 3 differ from Banking/Dashboard. (R2:8-13)
- H8 **Cash Flow Statement includes voided txns in movements but not in balances**, so Opening + Op + Inv + Fin ≠ Closing; the computed `reconcile` figure is never rendered. (P:3951, R2:78-90, 229)
- H9 **Statement of Changes in Equity: drawings sign flipped in the TOTAL row** (`perCapital - perDrawings`, but `perDrawings` is already negative), and closing equity omits prior-year earnings never closed to 3002, so it disagrees with the Balance Sheet. Same bug in print2.jsx:348. (R2:275-287, 391)
- H10 **Client-funds deposits counted as operating cash flow** on the Dashboard tile, 6-month series and CF statement. A 500k deposit shows as +500k operating inflow. Loan 2200 also lands in operating. (K:2658-2670, P:165-172, R2:35-41)
- H11 **Sale Receipt always books 5% output VAT** regardless of `deal.vat_applicable`; the invoice editor likewise ignores it. (P:2667, 2765; I:104-112, 167-178)

**VAT / tax compliance (UAE FTA)**
- H12 **Tax point is cash receipt, not invoice date.** Issuing a tax invoice posts nothing; an invoice issued 25 Mar paid 10 Apr is reported in the wrong quarter, and year-end P&L omits issued-but-unpaid commissions. (K:1657, I: no posting on issue)
- H13 **Supplier TRN not required at issue**; blank customer TRN prints "Not VAT registered" (a false statement on a tax document for VAT-registered developers). (I:167-178, 435, 532)
- H14 **Invoice numbering is not gapless.** Number consumed on first draft save, drafts hard-deletable, offline fallback assigns `Date.now()` digits, counter init does a non-transactional get→set that can rewind. No credit-note document; a paid invoice can be voided in one click with receipts still linked. (I:227-240, 1250-1256, 1356, 1375-1393)
- H15 **Deposit (client-funds) receipts can be linked as invoice payment.** Link modal only excludes BT. (I:1061-1063)

**Reconciliation**
- H16 **Book balance is all-time, not as-of statement end**, so a past month can never reconcile to ✓. (RC:290-295)
- H17 **Nothing is ever marked reconciled or locked**; matches are discarded on close; the duplicate finder can void a reversed original (the exact double-count the `reversal_fix_v1` migration repaired) and is reachable with `accounting.read` only. (RC:888-896, P:3380)

**Permissions**
- H18 Receipts posting needs only `sales.create`; deal delete needs `sales.edit` and only warns when txns are linked. `Pay Broker` checks `finance.create`, a permission that does not exist, so only admins see it. `handleFixDeal` in the invoice editor rewrites `expected_commission_net` with no deal permission. (P:2735, 1575, 1286-1308; K:293-304; I:1318-1340)

## 3. MEDIUM

- M1 Chart of Accounts: no code-uniqueness check (second account with same code silently overwrites, id = "a"+code); code/type editable after posting while the engine resolves by code; delete allowed on zero balance even when lines reference it. (P:3626, 3660, 3673)
- M2 Cancelled deals inflate pipeline KPIs and projected runway (`stage !== "Commission Collected"`). (K:2691-2699, P:4525, 256)
- M3 Deal Profitability and Employees compare VAT-inclusive bank debits with net broker cost; margins overstated by the VAT. (P:4625-4629, E:244-263)
- M4 Expense Control and Budget actuals sum debits only, so reversals never reduce "Spent". (P:4692, 5175)
- M5 Runway denominator includes variable broker payouts and the partial current month. (K:2623-2626)
- M6 VAT print drops negative rows from the tables but keeps them in totals; `settings.company`/`trn` are injected unescaped into the print iframe (stored XSS with C1). (P:4223, 4298, 4302)
- M7 Multi-deal invoices always receipt the first deal; overpayment is invisible (`max(0, total − paid)`); derived percentages print with 8 decimals ("2.38095238%"); missing rate silently defaults to 3%. (I:1460-1479, 1428, 125-137, 650)
- M8 Recurring due dates drift via `setMonth` (31 Jan → 3 Mar → 3 Apr; Feb-29 yearly → 1 Mar). (FE:134-144)
- M9 Settlement can over/under-clear 2210 (user may change gross/VAT rate at payment); deleting/skipping a planned expense orphans a live accrual. (FE:288-307, 729-780)
- M10 Broker + manager payment is two separate writes plus a deal update, not a batch; retry after partial failure double-posts. `fsUpdate` fires writes and toasts inside a React state updater; offline banner promises sync that never happens. (P:6793-6820, 6929)
- M11 Bank import collapses identical same-day rows in one file as duplicates; commit is N parallel writes, not a batch. (K:950-952, P:3237)
- M12 "Delete All BP Today" and the "reversal entries adding money to bank" panel are production-visible mass hard-delete tools driven by heuristics. (P:3281-3303, 3400-3440)
- M13 localStorage mirror of all collections survives sign-out; next user on the same machine sees the previous user's ledger until snapshots arrive. (P:6246, 6602-6613)
- M14 "Record without bank transaction" sets `broker_paid_amount` outside the ledger; Deal Card shows margin the P&L does not have. 
- M15 Deposit receipt counter bumped in a separate write from the receipt doc; no void path for receipts. Per-party close-out is only UI-guarded (engine checks global 2230). (D:343-356, 383-392)
- M16 Comparative column activates with one bound only; `shiftYear` on Feb-29 yields an invalid date string. (P:3974)
- M17 Excel date ambiguity dd/mm vs m/d in reconcile; dateless lines match any same-amount txn. (RC:107-113, 183, 321)

## 4. LOW
- Date parsing without the noon anchor in invoices (`new Date("YYYY-MM-DD")`), unlike core's `fmtDate`. (I:19-35)
- Half-cent rounding via `toFixed` on invoice lines (8.575 → 8.57). Invoice totals stored as AED floats while everything else is cents. (I:87-112, 146-152)
- Refs built from `Date.now().toString(36)` are non-sequential and can collide in the same millisecond (13 sites).
- Manual JV allows a line with both debit and credit; `vatRate` setting uses `parseInt`.
- Login error enumerates users; access code from `Math.random`; first login on an empty `authorized_users` becomes admin.
- KPI `rev`/`exp` labelled YTD are actually "since reporting start date (2025-01-01)".
- Print iframes still fetch Inter from Google Fonts despite the self-hosted rule.
- No Accumulated Depreciation / Depreciation Expense accounts although 1500/1510 fixed assets exist; policy note claims "cost less accumulated depreciation".
- Perf: `isVATSettlementTxn` does `accounts.find` per line per render; PerformancePage scans txns per account per month (~225 passes); `shared` object recreated every App render; Banking memo deps use a fresh array each render.

## 5. What is solid (verified)
- Every engine entry is `validateBalanced`; Balance Sheet ties to the cent; TB debits = credits.
- VAT-inclusive split (`round(gross/1.05)`, VAT = remainder) is exact; invoice totals foot; amount-in-words handles fils.
- Accrual basis for AC, VAT on settlement, client-funds model (2230) and `availableCash` for runway are correctly designed.
- `toCents` handles "1,000.50", NaN, rounding; negatives are rejected by the engine.
- Contra-entry reversal model is the right choice; the issues above are about derived views, not the ledger.

## 6. Feature recommendations for decision-makers

**Controls (do first, they protect everything else)**
1. Period close / lock date (`settings.lockedThrough`), enforced in `persistTxn`/`deleteTxn`; corrections only by dated reversal.
2. Server-side security: drop anonymous auth, Firebase Auth per user, rules keyed on `authorized_users` + role; `audit_logs` append-only; audit every write in `persistTxn`.
3. Enforced approval workflow for PV/BP above a limit (the `approval_policies` data already exists but nothing reads it).
4. Persisted bank reconciliation with per-txn `reconciled_at` lock and carry-forward of outstanding items.
5. Scheduled encrypted Firestore exports instead of a manual JSON download that includes credentials.

**Accounting completeness**
6. Post AR + Output VAT on invoice issue (DR 1100 / CR 4xxx / CR 2101); receipt then clears AR. This fixes the VAT tax point and gives a real receivable.
7. Tax credit notes; gapless issue-time numbering inside one transaction; fixed-amount and 0%-VAT lines; stored `issuedAt`; frozen PDF copy at issue.
8. Depreciation schedule for 1500/1510; salaries payable, staff advances and UAE end-of-service gratuity accrual.
9. Accrual true-up on settlement (difference to expense, not left in 2210).

**Reports that change decisions**
10. Commission receivable aging by developer (30/60/90) keyed on invoice/earned date.
11. Broker payable schedule (collected deals where broker share is still owed).
12. 13-week cash forecast: availableCash + installment schedule + earned-not-collected − planned expenses − broker payouts − next VAT settlement.
13. Break-even: fixed monthly overhead ÷ average retained commission per deal → deals needed per month.
14. VAT return by FTA tax period with filing deadline and reconciliation to 2101/1201 balances.
15. Revenue earned vs cash collected by month and by developer (collection lag).
16. Budget vs actual for revenue and net income, with full-year projection.
17. Statement of account per developer; proforma/commission-claim document that does not consume a tax-invoice number.

## 7. Suggested order of work
1. C1–C3 (security) and H3/H4 (lock + audit) — one sprint, mostly rules + App-level guards.
2. H1/H2 reversal propagation, H6 accrual matching, H11 VAT flag — small engine fixes with tests.
3. C4, H13–H15 invoice lifecycle and FTA compliance.
4. H7–H10 report corrections (each is a one-line predicate fix) plus rendering the CF reconcile line.
5. C5, H16, H17 reconcile.
6. Tests for `computeVATSplit`, `postAccrual*`, `reverseTransaction`, reconcile parsers, `feAdvanceNextDueDate`.
