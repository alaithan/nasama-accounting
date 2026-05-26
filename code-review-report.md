# Nasama Accounting System v2 - Technical Audit

**Review Date:** October 2023
**Status:** Production-Ready (with minor fixes)

## 1. High Priority Fixes

### Dead Style Objects (Invoices)
The `InvoicePreviewDoc` function returns early, leaving a massive block of unreachable code. This block uses a variable `S` for styling which is not defined, meaning if the code was ever reached, it would throw a `ReferenceError`.
*   **Action taken:** Removed unreachable block in `invoices.jsx`.

### Financial KPI Discrepancies
Calculations for KPIs are duplicated between `App.jsx` and `Dashboard.jsx`. 
*   **Risk:** If a developer updates the expense logic in one file but forgets the other, the Dashboard will show different totals than the formal P&L reports.
*   **Recommendation:** Centralize `calculateFinancials(txns, accounts)` into a helper inside `core.jsx`.

## 2. Structural Observations

### Cash-Settled Architecture
The system successfully implements a "cash-basis" double-entry engine. This is excellent for simplicity in a real estate context where AR/AP isn't needed. 

### Print Strategy
The use of hidden `iframes` for printing in `reports.jsx` is a very clever solution to avoid CSS injection issues common in Single Page Applications (SPAs).

## 3. Future Roadmap Suggestions

1.  **React Context:** Currently, the `App` component passes ~30 props. Converting `Accounts`, `Settings`, and `UserAccess` to context would simplify `pages.jsx` significantly.
2.  **Audit Logs:** Expand the `logAudit` function to track *exactly* which fields changed in a deal (Diffing) rather than just the stage.

## 4. Maintenance Checklist
- [ ] Run `invValidate` on every draft save, not just on issuance.
- [ ] Sync `DEAL_STAGES` in `PerformancePage` with the constant in `core.jsx`.
- [ ] Remove seeding logic from production `onSnapshot` listeners to prevent accidental data overwrites.

---
*End of Report*