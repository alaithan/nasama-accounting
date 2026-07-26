# Employee Section — Design & Build Plan

**Status:** **Built 2026-07-26** — module live, admin-only. Phase 0 attribution migration still pending (§3).
**Drafted:** 2026-07-25
**Owner:** alaithan

A new **Employees** module that groups and summarises every financial fact about the
people in the business — brokers, sales managers, admin staff and management. It answers,
per person: *what did they generate, what did they cost, what were they paid, how, when,
from which bank, and what do we still owe them?*

---

## 1. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Data model | **Separate `employees` Firestore collection.** `brokers` stays untouched and keeps working. |
| 2 | Visibility | **Full Admin only** (owner). Accountant, Secretary and Sales are all excluded. |
| 3 | Code location | New file `nasama-accounting-v2.employees.jsx` (pattern: `reconcile.jsx`, `invoices.jsx`). |
| 4 | Dependencies | None. Reuse vendored `xlsx` and the existing print pipeline. No build step, no CDN. |

### Why separate, not an extension of `brokers`
- `brokers` is wired into deals, payments, the journal engine and the Performance page.
  Changing its shape risks all of it.
- Non-broker staff (accountant, admin, office) must be representable — they never belong
  in a "Brokers" list.
- A person can change role (broker → sales manager) without breaking historic `broker_id`
  references on ledger lines.
- `employees.broker_id` holds the link, so both views stay consistent.

---

## 2. What already exists (verified in code)

**The ledger is already person-aware — this is the key enabler.**
`makeLine()` at `nasama-accounting-v2.core.jsx:1225` stamps every journal line with optional
`deal_id`, `broker_id`, `developer_id`, `manager_id`. A per-person subledger can therefore be
derived from existing data **with no migration of transactions**.

| Asset | Location | Notes |
|---|---|---|
| `brokers` collection | 16 seed records + Firestore | `name`, `nationality`, `phone`, `rera_no`, `rera_exp`, `manager_id` |
| Person tags on GL lines | `core.jsx:1225` | `broker_id`, `manager_id` already written |
| Broker payment engine | `postBrokerPayment()` `core.jsx:1420` | 2 bank transfers: broker → 5500, manager → 5040 |
| Payment voucher | `postPayment()` `core.jsx:1311` | already accepts `broker_id` |
| Broker sales leaderboard | `PerformancePage` `pages.jsx:4342` | deals / value / commission — **sales only, no cost side** |
| Excel export helper | `xlsxExport` + `XlsxSignBtn` (pages.jsx) | reuse as-is |

### Relevant chart of accounts
| Code | Account | Used for |
|---|---|---|
| 5000 | Admin Salary | salary — admin/management |
| 5010 | Employee Salaries | salary — staff |
| 5020 | Manager Salary | salary — managers |
| 5030 | Broker Incentive | bonus / incentive |
| 5040 | Sales Manager Override | manager 5% override (tagged `manager_id`) |
| 5500 | Commission Payment to Brokers | broker commission (tagged `broker_id`) |
| 5510 | Secondary Market Agent Payment | agent commission |
| 5420 | Recruitment Fees | cost to hire |
| 5430 | Trakheesi & Licensing | RERA / licensing cost per head |
| 2210 | Accrued Expenses Payable | unpaid commission / salary accrual |

### Gaps this module closes
1. No person master — office staff exist only as free-text `counterparty` on payment vouchers.
2. "Sales Manager" is not a role; it is inferred from `brokers.manager_id` pointing at another broker.
3. No answer to *"is this person on salary, commission, or both — and what was actually paid?"*
4. No **cost per head** vs **revenue per head**. Performance shows what a broker generates, never what he costs.
5. No outstanding-commission liability per person.
6. `rera_exp` is stored but never checked — an expired-RERA broker can still close deals.

---

## 3. Phase 0 diagnostic — RESULTS (run 2026-07-25 against live Firestore)

Read-only diagnostic run against project `nasama-accuntant` via the Firestore REST API.
Data read: **17 brokers · 113 deals · 830 transactions · 56 accounts**.

### ✅ Broker identity is CLEAN — no migration needed
**113 of 113 deals** have `broker_id` and `broker_name` in agreement. Zero mismatches, zero
orphan IDs, zero duplicate roster records. Grouping by ID and grouping by name return
*identical* results — 13 people, same totals.

The mismatch found in the seed data in source (`core.jsx:989` etc.) **never reached live data**,
and the Teryaki duplicate appears to have already been merged: `BR013` is now a blank `"0000"`
record and `BR015 Mohammed Teryaki` carries the 5 deals.

Minor roster tidy-up only (cosmetic, not blocking):
- `BR013` — junk record, name `"0000"`, no phone
- `_ulzryg7jb` — "Yazen", auto-generated Firestore ID instead of `BRxxx`, RERA `00000`
- 4 roster entries have no deals: `BR007`, `BR013`, `BR016`, `_ulzryg7jb`

### ⛔ THE REAL BLOCKER — 95.7% of payroll is not attributed to anyone

| | Amount | Lines |
|---|---:|---:|
| GL movement on payroll/commission accounts | **AED 2,502,854.73** | 196 |
| Tagged to a person (`broker_id` / `manager_id`) | AED 108,153.05 | 8 |
| **Untagged** | **AED 2,394,701.68** | **188** |

By account: 5500 Broker Commission `AED 1,762,233.47` · 5010 Employee Salaries `AED 272,866.75` ·
5020 Manager Salary `AED 249,689.12` · 5510 Secondary Agent `AED 216,092.39` · 5030 Broker Incentive `AED 1,973.00`.

**Cause:** only `postBrokerPayment` (`BP`) writes `broker_id`, and that flow is recent. Everything
else arrived by **bank-statement import** or manual `JV` / `PV` entry, which tag nobody.

**Consequence if built as-is:** the Employee 360 "money out" panel would be ~96% empty and the
Register's control-total row would show a AED 2.39M unattributed line.

### Auto-attribution IS feasible — the payee name is in the bank narration
```
… COMMISSION PAYMENT /AE960260000214488722302 FOAD DADA EBILAEADXXX …   AED 75,320.00
… COMMISSION PAYMENT /AE140240001523325551101 ABDULSALAM ALAITHAN …    AED 50,500.00
```
Matching must be **consonant-skeleton**, not edit-distance — the bank writes `FOAD`/`FOUAD` for
roster *Faoud*, `TARIQ`/`TAREQ` for *Tarek*, `AHMED` for *Ahmad*, `KHAIRI` for *Khiari*.
(Skeleton: drop vowels after the first letter, `Q`/`C`→`K`, collapse doubles. `FOAD`→`FD`←`FAOUD`.)

Narrations identify the payee three ways, in descending reliability: a **name**, a bare
**12-digit internal account number** (`FUND TRANSFER - 019120282831 - AHMAD MOHAMAD IBRAHIM`),
or a full **IBAN**. Final measured result over the 188 untagged lines
(reproduce with `node tools/phase0-attribution.js`):

Figures below are **after** the owner's 2026-07-25 confirmations (aliases + admin staff, §3.1).

| Tier | Rule | Lines | Amount | Share |
|---|---|---:|---:|---:|
| **A — auto-apply** | name / alias / title in narration | 106 | **AED 1,525,708.58** | 63.7% |
| **A2 — auto-apply** | internal account number | 9 | AED 50,712.50 | 2.1% |
| **A3 — auto-apply** | IBAN | 6 | AED −52,200.00 | −2.2% |
| **B — review first** | 1 distinctive name part | 20 | AED 170,144.00 | 7.1% |
| **Own account** | not a person at all | 13 | AED 332,008.00 | 13.9% |
| **Manual** | nothing to go on | 34 | AED 368,328.60 | 15.4% |

> **≈71% (AED 1.69M) recoverable by script. ~29% (AED 700k) needs human input** —
> and AED 332k of that 29% is the own-account ruling, not an attribution problem.

### ✅ The register reconciles to the general ledger
The tool prints the Tab 3 register (person × account) closed off with the control total.
It **ties exactly** — the model is validated before a line of UI is written:

```
  Person                     5010      5020      5030      5500      5510       TOTAL
  ─────────────────────────────────────────────────────────────────────────────────────
  Faoud Dada               37,800         —         —   475,332    74,842     587,974
  Abdulsalam Alaithan     258,732    40,000         —   235,033     8,564     542,329
  Ahmad Ibrahim            -5,580   176,689         —   204,167    15,197     390,473
  Mohammed Teryaki              —         —         —    57,100         —      57,100
  Tarek Momneh            -18,222         —         —    60,410     2,500      44,688
  Marwa Khiari            -50,500         —     1,775    90,867         —      42,142
  Nancy Tfaily            -31,000         —         —    51,761     8,522      29,283
  Nisadi Sandunika F.      22,250         —         —         —         —      22,250
  Nene Belquz Diallo       10,000         —       198         —     1,293      11,491
  Mohammed Shouman (left)       —         —         —         —     7,700       7,700
  Monaf Hamza                   —         —         —         —     4,485       4,485
  Mohamed Kamal             2,500         —         —         —         —       2,500
  Jerine Mathews                —         —         —         —     2,000       2,000
  Alaa Muneer             -50,050         —         —         —         —     -50,050
  ─────────────────────────────────────────────────────────────────────────────────────
  ATTRIBUTED              175,930   216,689     1,973 1,174,671   125,102   1,694,365

  Already tagged in the ledger            AED   108,153.05
  Projected by attribution                AED 1,694,365.08
  Own-account (not a person)              AED   332,008.00   ← ruling pending
  Unattributed remainder                  AED   368,328.60
  ────────────────────────────────────────────────────────
  Sum                                     AED 2,502,854.73
  GL movement 5000–5510                   AED 2,502,854.73
  Difference                              AED         0.00   ✓ ties
```

Note the **negative 5010 column** for six people (Alaa Muneer −50,050, Marwa Khiari −50,500,
Nancy Tfaily −31,000, Tarek Momneh −18,222…). Confirmed as reversible/contra transactions.
Tab 2 must present these as *reversals*, not as negative salary cost, or the contribution
margin for those people reads wrong.

| Person | | Lines | Amount |
|---|---|---:|---:|
| Faoud Dada | Broker | 24 | AED 587,973.50 |
| Abdulsalam Alaithan | Broker | 28 | AED 542,328.73 |
| Ahmad Ibrahim | Broker | 28 | AED 369,473.38 |
| Mohammed Teryaki | Broker | 2 | AED 57,100.00 |
| Tarek Momneh | Broker | 13 | AED 44,688.00 |
| Marwa Khiari | Broker | 13 | AED 42,142.07 |
| Nancy Tfaily | Broker | 8 | AED 29,283.40 |
| **Nisadi Sandunika Fernando** | **Admin** | 5 | AED 22,250.00 |
| Nene Belquz Diallo | Broker | 4 | AED 11,491.00 |
| Monaf Hamza | Broker | 4 | AED 4,485.00 |
| Mohamed Kamal | Broker | 1 | AED 2,500.00 |
| Jerine Mathews | Broker | 1 | AED 2,000.00 |
| Alaa Muneer | Broker | 5 | AED −50,050.00 |

## 3.1 Owner confirmations — 2026-07-25

| # | Question | Answer | Applied |
|---|---|---|---|
| 1 | AED 332k paid to own accounts | **"need to check — some transactions are not related to brokers"** | ⏳ open, review list below |
| 2 | `TAREQ MOMNEA` / `TAREK MOUMNEH` = Tarek Momneh? | **Yes, same person** | ✅ `ALIASES` in the tool |
| 3 | Nisadi Sandunika Fernando | **"she is our admin, not broker"** | ✅ `NON_BROKER_STAFF`, role `Admin` |
| 4 | Mohammed Shouman | **ex-broker, left during 2025** | ✅ role `Broker`, status `Left` |
| 5 | CEO a separate person? | **"CEO is the same as manager"** = **Ahmad Ibrahim (BR002)** | ✅ `TITLE_HINTS` literal rule |
| 6 | Three negative 5010 lines | **reversible transactions** | ✅ `KNOWN_REVERSALS`, excluded from onboarding |

After these, the tool's "paid but not on the roster" list returns **(none found)** — every payee
in the bank data now maps to a person.

**The Shouman case settles open question 1 (§9): a leaver must stay on the roster.** His 2025
payments are real; deleting him would stop the 2025 period reconciling to the GL. Status
`Left` + a badge, never removal.

**Effect of the alias confirmation.** It moved Tarek Momneh from **−6,222.00 to +44,688.00**
(5 more lines) — a swing of ~AED 51k, *not* the AED 181k first estimated. That earlier figure
came from a rough per-segment counter that double-counted lines containing several transfer
segments; the same applies to the first Nisadi estimate (AED 66,750 → actual AED 22,250).
More valuable than the totals: the alias **corrected a misattribution** — a `AED 27,410` line on
2025-11-10 had been assigned to Faoud Dada through the conflicting IBAN
`AE210260001015879319201`, and now sits with Tarek Momneh where it belongs.

**The IBAN pass underperformed** (6 lines, net negative) and the account-number pass beat it.
Reason: the biggest IBANs in the narrations are Nasama's *own* accounts, not people's.

### 🔴 OPEN — AED 332,008 of "commission expense" paid to Nasama's own bank accounts
**13 lines, every one a 2025 bank import (`BK`)**, debiting **5500 / 5510** with counterparty
`FAB MY ACCOUNT` (`AE360351646005642164001`). No broker received this money. Nothing in 2026 —
the problem is confined to the 2025 imported statements.

Owner 2026-07-25: *"I need to check, but some transactions are not related to brokers."*
→ so this is a **mixed bag**, to be ruled on line by line.

| Date | Acct | Amount | Narration |
|---|---|---:|---|
| 2025-02-15 | 5510 | AED 5,937.00 | Secondary Market Commission agent payment |
| 2025-02-22 | 5510 | AED 30,812.00 | Secondary Market Commission agent payment |
| 2025-02-27 | 5500 | AED 48,750.00 | Commission payment |
| 2025-03-16 | 5510 | AED 1,875.00 | Secondary Market Commission agent payment |
| 2025-03-17 | 5500 | AED 55,298.00 | Commission payment |
| 2025-03-24 | 5510 | AED 1,875.00 | Secondary Market Commission agent payment |
| 2025-03-27 | 5500 | AED 97,500.00 | Commission payment |
| 2025-04-07 | 5500 | AED 24,511.00 | Commission payment |
| 2025-05-15 | 5510 | AED 5,000.00 | Secondary Market Commission agent payment |
| 2025-08-18 | 5500 | AED 30,000.00 | Commission payment |
| 2025-08-18 | 5500 | AED 10,000.00 | Commission payment |
| 2025-10-02 | 5510 | AED 8,750.00 | Secondary Market Commission agent payment |
| 2025-11-27 | 5510 | AED 11,700.00 | Secondary Market Commission agent payment |
| | | **AED 332,008.00** | |

Per line, the ruling is one of three:
- **Not broker-related / misclassified** → reclassify off 5500/5510 (own-account moves belong in
  `BT`). Commission expense is currently overstated by that amount and profit understated.
- **Cash drawdown later handed to a broker** → attribute to the broker who received it.
- **Genuine third-party agent payment** → attribute to that agent (see `MOHAMMED SHOUMAN`, 5510).

Regenerate this list any time with `node tools/phase0-attribution.js` (section 8).

### 👥 Payees in the bank data with no record in the system
Resolved 2026-07-25: `TAREQ MOMNEA` / `TAREK MOUMNEH` → **Tarek Momneh (BR008)**;
`NISADI SANDUNIKA FERNANDO` → **Admin employee, not a broker**. Still open:

| Payee | Amount | Acct | Likely |
|---|---:|---|---|
| MOHAMMED SHOUMAN | AED 23,100.00 | 5510 | external secondary-market agent — employee or vendor? |
| ALAADIN ZIBAN | AED −30,000.00 | 5010 | reversal — confirm |
| HAYA TAWFIK ISMAIEL | AED −10,000.00 | 5010 | reversal — confirm |
| MANUEL EDUARDO PINILLA VARGAS | AED −2,200.00 | 5010 | reversal — confirm |
| "CEO salary" (`PV-MPR4LRAS`, 2026-05-28) | AED 7,000.00 | 5020 | owner/CEO — add to roster? |

> Amounts in this table come from a per-segment scan and **over-count** narrations that hold
> several transfer segments — treat them as "where to look", not as totals. The authoritative
> per-person figures are in the attribution table above.

⚠️ Bank spelling variants must be handled with an explicit `aliases[]` list per employee (§6),
**never** by loosening the skeleton matcher — that trades false negatives for false positives
on real money.

### Remaining manual bucket — what it actually contains
1. **Aggregate payments needing a journal SPLIT, not a tag** — `"AlAnsari April Salary"
   AED 45,825.50` and `"May Salary 2026" AED 45,077.50` (Al Ansari is the exchange house, not
   the payee — one transfer covering several staff); three identical `AED 28,370.00` lines on
   2026-01-14. **Biggest scope risk in Phase 0.**
2. **Deal-labelled, person-unlabelled** — `"Emaar TV commission" AED 50,000`,
   `"Samana Deal for Monaf" AED 32,150.60`. Recoverable via the linked deal's broker, not the text.
3. **Negative amounts** — Alaa Muneer `−50,050.00`, Tarek Momneh `−6,222.00`. Consistent with the
   reversal contra-entry model, but **must be confirmed** before being shown as "cost of person".

---

## 4. Module design — 5 tabs

### 👤 Tab 1 — Roster
Headcount cards grouped by role (Broker / Sales Manager / Admin / Management / Owner).

- **Pay-basis badge derived from actual GL activity, not from a settings field:**
  `Commission-only` · `Salary-only` · `Salary + Commission` · `Salary + Override` · `No payments recorded ⚠️`
- **Compliance strip:** RERA expiry countdown — 🔴 expired · 🟠 < 60 days · 🟢 valid.
  Red flag when an expired-RERA broker has deals dated after expiry.
- Active / inactive filter, search, Excel export.

### 💳 Tab 2 — Employee 360 (centrepiece)
Click a person → full financial dossier.

**Money OUT to them** — every bank transaction listed, and summed by nature:

| Nature | Derived from |
|---|---|
| Commission paid | `BP` txns, GL 5500 / 5510, lines where `broker_id = X` |
| Sales-manager override received | `BP` txns, GL 5040, lines where `manager_id = X` |
| Salary | `PV` txns, GL 5000 / 5010 / 5020 |
| Incentive / bonus | GL 5030 |
| Cost to employ (visa, Trakheesi, recruitment) | GL 5430 / 5420 |
| **Total cost of this person** | sum + count of transfers, first & last payment date, paying bank account |

**Money they GENERATED**
- Gross commission collected on their deals (`SR` txns tagged `broker_id = X`)
- Company retained = generated − their commission − their salary
- **Net contribution** and **margin %**
- Salaried people get a **break-even bar** — e.g. *"generated AED 180k against AED 96k cost → 1.9× payback"*.
  Non-revenue staff (accountant, admin) display *"Support cost — no direct revenue"* rather than a false 0% margin.

**Owed to them**
Deals where commission is earned/collected but `broker_paid_amount` is zero or short of expected →
per-deal outstanding list with aging, tying to accrual account 2210.

**Also:** deal history, document & compliance panel.

### 📋 Tab 3 — Payroll & Commission Register (per period)
Matrix — person × [Salary · Commission · Override · Incentive · Other · **Total** · # transfers · Last paid].

Below it, the piece that makes this a subledger rather than a dashboard:

> **Control-total reconciliation row.** Register total for the period **must equal** the GL
> movement on 5000 + 5010 + 5020 + 5030 + 5040 + 5500 + 5510. Any difference is
> **unattributed payroll** — money paid to a human not tagged to a person record. Shown as a
> red "Unattributed" line, clickable through to the offending transactions.

This will immediately surface every free-text salary payment ever posted.

### 📊 Tab 4 — Contribution League
Sorted by **net contribution**, not revenue. Exposes the broker who bills a lot but costs more
than he brings, versus the quiet one running the best margin.

### 🚨 Tab 5 — Exceptions
Auto-run integrity checks, mirroring the existing `auditDeals` pattern:

- [ ] Broker paid **before** commission collected (cash out ahead of cash in)
- [ ] Broker paid ≠ `expected_commission_net` × split (variance, with amount)
- [ ] Manager override posted with no matching broker leg
- [ ] Salary/commission GL movement not attributable to any person → unattributed bucket
- [ ] Deals closed after the broker's RERA expiry
- [ ] Duplicate person records (same phone / fuzzy name) — e.g. the Teryaki pair
- [ ] `broker_id` ↔ `broker_name` mismatch against the roster

---

## 5. Permissions — Full Admin only

**Decision (2026-07-25):** the module is visible to the **full Admin user only**. This is the
simplest possible implementation — it requires **zero permission code**.

### How it works — register the page nowhere
`canAccessPage` (`core.jsx:177`) short-circuits on its first line:

```js
const canAccessPage = (subject, pg) => {
  if (isAdminSubject(subject)) return true;      // admin — always allowed
  const bridged = PAGE_ACCESS_BRIDGE[pg];        // undefined if unregistered
  const access  = resolveAccessSubject(subject);
  if (access?.permissions && bridged) return !!access.permissions[bridged];  // skipped
  const map = { /* legacy role map */ };
  return map[pg]?.includes(role) || false;       // undefined → false
};
```

Therefore:
- **Do NOT** add `employees` to `PAGE_ACCESS_BRIDGE` (`core.jsx:136`).
- **Do NOT** add `employees` to the legacy role map (`core.jsx:182`).
- Admin returns `true` on line 1. Everyone else falls through to `false`.

All three gates already route through this one function, so nothing else is needed:

| Gate | Location |
|---|---|
| Sidebar nav item | `pages.jsx:6726` |
| PEOPLE section header (hides when empty) | `pages.jsx:6717` via `sectionHasVisiblePage` |
| Page body render guard | `pages.jsx:6627` |

### What this decision removes from the build
- ❌ New `accounting.payroll` permission key
- ❌ `SECURITY_MODULES` edit (`core.jsx:47`)
- ❌ Accountant role-template edit (`core.jsx:91-97`)
- ❌ The `payroll_perm_v1` Firestore migration

### Consequences — accepted, and reversible
1. **The accountant posts payroll but cannot see the register.** The control-total
   reconciliation in Tab 3 is an accountant's tool; admin-only means the owner is the one
   checking it. Reversible later — granting the accountant access is exactly the
   `accounting.payroll` work above, deferred rather than lost.
2. **Hiding the nav is not a security boundary.** `firestore.rules:18` grants read/write on
   every collection to any authenticated user, so a signed-in secretary could read
   `employees` directly from the browser console. This is already true of all data in the
   app, but salaries, IBANs and visa data are more sensitive than anything currently stored.
   Genuine protection needs per-collection Firestore rules keyed to role — **separate,
   unscoped piece of work.**
3. `isAdminSubject` also returns `true` for any custom role whose `legacyRole` is `"admin"`.
   Only the built-in Admin template qualifies today — remember this before creating custom roles.

---

## 6. Data model — `employees` collection

```js
{
  id: "EMP001",
  broker_id: "BR003",          // link to existing brokers record; "" for non-brokers
  name: "Faoud Dada",
  role: "Broker",              // Broker | Sales Manager | Admin | Management | Owner
  status: "Active",            // Active | Inactive | Left
  pay_basis: "Commission",     // Salary | Commission | Salary+Commission
  base_salary: 0,              // cents/fils, monthly
  commission_split_pct: 50,
  manager_id: "EMP002",        // reports-to, within employees
  join_date: "2024-03-01",
  leave_date: "",
  nationality: "Lebanon",
  phone: "526920033",
  email: "",
  iban: "",
  bank_accounts: ["019120282831"],   // internal acct numbers seen in bank narrations
  aliases: ["TAREQ MOMNEA", "TAREK MOUMNEH"],  // bank spelling variants — see §3
  rera_no: "78849",
  rera_exp: "2026-06-14",
  visa_expiry: "",
  notes: ""
}
```

**Money is stored in cents/fils**, consistent with the rest of the system.
`base_salary` and `commission_split_pct` are reference/planning fields — **all reported
figures are derived from the general ledger, never from these fields.**

---

## 7. Build plan

### Phase 0 — Payroll attribution (do first; nothing is trustworthy until done)
Identity resolution is **no longer required** — measured clean on 2026-07-25 (§3).
The work is now attributing AED 2.39M of untagged payroll to people.

- [x] Read-only diagnostic against live Firestore — **done 2026-07-25**, results in §3.
      Re-runnable: `node tools/phase0-attribution.js`.
- [x] IBAN + internal-account-number maps built and measured — **done**. 68% auto-recoverable.
- [x] **Aliases confirmed** — `TAREQ MOMNEA` / `TAREK MOUMNEH` = Tarek Momneh (owner, 2026-07-25).
      In the tool's `ALIASES`; must move to `employees.aliases[]` at Phase 1.
- [x] **Nisadi Sandunika Fernando = Admin, not broker** (owner, 2026-07-25). In `NON_BROKER_STAFF`.
- [ ] ⏳ **Owner to rule on the 13 own-account lines** (§3 table) — "some are not related to
      brokers". Per line: reclassify off 5500/5510, attribute to a broker, or attribute to a
      third-party agent. **Until this closes, commission expense may be overstated by up to
      AED 332,008 and 2025 profit understated by the same.**
- [x] **Mohammed Shouman** — ex-broker who left in 2025. On the roster, status `Left`.
- [x] **Negative 5010 lines confirmed as reversible transactions.** Tab 2 must show them as
      reversals, not as negative salary, or contribution margin reads wrong for six people.
- [x] **CEO = Ahmad Ibrahim (BR002)**, the sales manager. No separate CEO record.
- [ ] Attribution review screen: proposed `broker_id` per untagged line, Tier A pre-ticked,
      Tier B needing a click, manual rows searchable against the roster. **Nothing writes
      without human confirmation.**
- [ ] Apply as a guarded one-time migration (`payroll_attribution_v1`, localStorage flag,
      same pattern as `mgr_override_acct_v1` at `pages.jsx:6471`) stamping `broker_id` /
      `manager_id` onto the existing ledger lines. **Tags only — no amount is ever altered,
      so no GL balance can move.**
- [ ] Decide the treatment of aggregate payments needing a split (§3 item 3) — split the
      journal, or attribute to a "Shared / multiple staff" pseudo-person.
- [ ] Confirm the negative payroll lines are genuine reversals (§3 item 4).
- [ ] Cosmetic roster tidy: delete `BR013` ("0000"), re-key `_ulzryg7jb` (Yazen) to a `BRxxx` id.

### ✅ Phases 1–3 — BUILT 2026-07-26
New file **`nasama-accounting-v2.employees.jsx`** (~640 lines), wired in at five points:
`index.html` (before `pages.jsx`), NAV `PEOPLE` section in `core.jsx`, and in `pages.jsx` the
`employees` state + Firestore listener (`total` 10→11), `setEmployeesFS`, the `shared` object,
the `renderPage` case, and a `SidebarIcon` glyph. **No permission code** — see §5.

- Engine `buildEmployeeLedger()` is pure and dependency-free; **37 assertions** in
  `tests/employees.test.js` (`node tests/employees.test.js`). Existing suite still green (170).
- **Provisional roster:** with the `employees` collection empty the page derives a roster in
  memory from `brokers` + the confirmed non-broker staff, so it is useful immediately. A
  "Create employee records" button persists it — nothing is written without that click.
- **Runtime attribution.** Since the Phase 0 migration has not run, the module applies the same
  matcher live and labels every recovered line **`provisional`** in the UI. Verified against live
  data: control total ties at **AED 0.00 difference**, own-account bucket reproduces the tool's
  **AED 332,008 / 13 lines** exactly.
- ⚠️ **Bug found and fixed during verification — keep the resolution order.** The own-account test
  originally ran *before* the name match, which silently swallowed real payments: Nasama's own
  account appears in outgoing narrations as the **sender**
  (`Acct to Acct FUND TRANSFER - 019101846426 - NISADI SANDUNIKA FERNANDO`). It put AED 548k in
  the own-account bucket and cut Nisadi from AED 22,250 to AED 2,250. Order must be
  **tagged → provisional → own-account → unattributed**; pinned by a regression test.
- Module GL scope adds **5420 Recruitment** and **5430 Trakheesi** as cost-to-employ, so its GL
  total (AED 2,605,535.07) is AED 102,680.34 above the tool's payroll-only figure. Intentional.

### Phase 1 — People master
- [ ] `employees` collection; seed from the 16 brokers, preserving `broker_id` links.
- [ ] Firestore listener in the `App` effect (`pages.jsx:6404-6412`).
- [ ] **Bump `const total = 10` → `11`** at `pages.jsx:6384` (loader gate) — easy to miss.
- [ ] `const setEmployeesFS = fsUpdate('employees', setEmployees, 'employees')` (`pages.jsx:6561`).
- [ ] Add `employees` / `setEmployees` to the `shared` object (`pages.jsx:6624`).
- [ ] NAV: new `PEOPLE` section + `{ id: "employees", label: "Employees", icon: "🧑‍💼" }` (`core.jsx:2192`).
- [ ] `case "employees": return <EmployeesPage {...shared} />` in `renderPage` (`pages.jsx:6641`).
- [ ] **No permission wiring.** Deliberately leave `employees` out of `PAGE_ACCESS_BRIDGE` and
      the legacy role map so only Admin passes `canAccessPage` — see §5.
- [ ] Load `nasama-accounting-v2.employees.jsx` in `index.html` **before** `pages.jsx` (line 41).

### Phase 2 — Calculation engine (pure & testable)
- [ ] `buildEmployeeLedger({ employees, deals, txns, accounts, from, to })` — single source of
      truth for every number in the module.
- [ ] Written dependency-free so `tests/` can cover it the same way
      `tests/commission.test.js` covers the commission math (node, 0 deps).
- [ ] Unit tests: cost aggregation by account group, control-total reconciliation,
      outstanding-commission calc, unattributed bucket.

### Phase 3 — UI
- [ ] Tab 1 Roster → Tab 2 Employee 360 → Tab 3 Register → Tab 4 League → Tab 5 Exceptions.
- [ ] Each tab shippable on its own.

### Phase 4 — Outputs
- [ ] Per-tab Excel sign using the existing `XlsxSignBtn` / `xlsxExport`.
- [ ] Printable **Employee Statement of Account** PDF via the existing `print2.jsx` A4 pipeline
      (single-page rule already enforced there).

### Phase 5 — Close the loop
- [ ] Payroll accrual posting into 2210 for unpaid salary/commission.
- [ ] "Pay salary" action posting a correctly tagged `PV`, so **new** payments are attributed at
      source and the unattributed bucket trends to zero.

---

## 8. Verification checklist
- [ ] `employees.jsx` transforms cleanly under the vendored Babel 7.29.7 (Babel 8 must stay unpinned-from — see index.html note).
- [ ] Engine unit tests pass under node with zero dependencies.
- [ ] Control total: Register period total == GL movement on the payroll account group.
- [ ] Logged in as **secretary** → Employees not in nav, PEOPLE header hidden, direct access refused.
- [ ] Logged in as **sales** → same.
- [ ] Logged in as **accountant** → same (excluded by design, 2026-07-25).
- [ ] Logged in as **admin** → visible and fully functional.
- [ ] Existing Brokers page, Deals, Payments, Performance all unchanged in behaviour.
- [ ] App still loads when the `employees` collection is empty (loader `total` count correct).

---

## 9. Open questions
1. Should an **inactive/left** employee still appear in historic period reports? (Recommended: yes,
   with a "Left" badge — otherwise prior-period totals stop reconciling to the GL.)
2. Do we hold **base salary** per employee at all, given every reported figure comes from the GL?
   (Recommended: keep it, but label it clearly as *planning reference*, and use it only for the
   break-even bar and future accrual automation.)
3. Should the Owner's drawings (`OD` txn type) appear as "cost of person", or be kept strictly
   as equity movement? (Accounting-correct answer: **equity, not cost** — show it in a separate
   panel so it is visible but never contaminates margin.)
