# Current vs May 25 Backup - Bank Extra Transactions

- Backup: `c:\Users\hp\Documents\Nasama-Accounting\nasama-backup-2026-05-25.json` exported `2026-05-25T10:59:03.684Z`
- Current source: Chrome localStorage cache `_http://127.0.0.1:5500` from `000727.ldb` seq `7566`
- Backup transactions: **735**
- Current cached transactions: **720**
- Extra current transaction IDs: **0**
- Extra current transactions touching bank/cash: **0**
- Extra current BK imports: **0**
- Backup-only transaction IDs: **15**
- Backup-only bank/cash transactions: **15**
- Backup-only non-void bank/cash impact: **-27,149.00 AED**
- Bank-only balance delta: **27,149.00 AED**
- Bank+cash balance delta: **27,149.00 AED**

## Extra Bank/Cash Transactions

None found.

## Backup-Only Bank/Cash Transactions

These records exist in the May 25 backup but not in the current Chrome cached app data. The non-void records explain the AED 27,149.00 balance difference.

### Non-Void Balance-Affecting Records

| ID | Date | Type | Bank/Cash Impact AED | Ref | Description |
|---|---:|---:|---:|---|---|
| `_btgesusor` | 2026-04-08 | JV | 1.00 | REV-PV-MNQF2N7Z | Reversal: Payment: fouad salary |
| `_dwxqphxjf` | 2026-05-02 | SR | 5,000.00 | SR-MPFMDOVC | Sale Receipt: TV Orania V-289 |
| `_i2l3r4a22` | 2026-05-21 | PV | -32,150.00 | PV-MPFFW608 | Payment: Samana Deal for Monaf |

Net impact: **-27,149.00 AED**

### Void Backup-Only Records

These are present in the backup but marked `isVoid: true`, so they should not affect the bank balance if the app respects the void flag.

| ID | Date | Type | Bank/Cash Impact AED | Ref | Description |
|---|---:|---:|---:|---|---|
| `_kzr46zlhs` | 2026-01-01 | BK | -10.00 | 099REFEAED 00002 | Bank Fees |
| `_pifpcuf9r` | 2026-01-01 | BK | -200.00 | Monthly Maintenance Fee 019101303277 | Bank Fees |
| `_y07vwz1ee` | 2026-03-30 | PV | -35,078.50 | PV-MNDCWQ3A | Payment: Alansari |
| `_1230qyomi` | 2026-04-01 | JV | 35,078.50 | REV-PV-MNDCWQ3A | Reversal: Payment: Alansari |
| `_ergne9lds` | 2026-04-04 | PV | -289.79 | PV-MNKHUO6V | Payment: whatsapp campigan |
| `_tpnjnlrim` | 2026-04-04 | PV | -10,000.00 | PV-MNQF2N7Z | Payment: fouad salary |
| `_0uecpwxlk` | 2026-04-06 | PV | -520.00 | PV-MNQF3WHP | Payment: trafic fine |
| `_7ngyqjk2p` | 2026-04-07 | PV | -289.79 | PV-MNQF6RKG | Payment: whatsaap campaign |
| `_umnq5xk2h` | 2026-04-07 | PV | -283.00 | PV-MNQF94K1 | Payment: Whatsap camp |
| `_di4u1vamw` | 2026-04-15 | PV | -196.61 | PV-MO05BGFC | Payment: |
| `_s890mpdro` | 2026-04-18 | BT | 0.00 | BT-MO4T57YP | Bank transfer |
| `_vi1zxwkf8` | 2026-05-03 | JV | -200.00 | JV-MOQ0SS57 | Blue water VAT |

## Extra Transactions by Type


## Potential Duplicate Bank/Cash Groups in Current

None found using date + bank impact + ref + description.
