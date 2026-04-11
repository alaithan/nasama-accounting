/* ════════════════════════════════════════════════════════
   NASAMA PROPERTIES — PRINT DOCUMENT TEMPLATES
   Purpose-built for print/PDF — completely separate from the screen UI.
   These components produce a classic A4 financial statement document.
   They are NEVER shown on screen (hidden via CSS; revealed only in @media print).
   ════════════════════════════════════════════════════════ */

// ── Compact number formatter (no "AED" prefix — column header carries the unit)
const pFmt = c =>
  ((c || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ── Design tokens for the print document
//    Values are px — the browser handles pt conversion for printing.
//    Target: ~10–11pt body, ~18–20pt title when printed at A4.
const PD = {
  // Typefaces
  serif:  "'Georgia', 'Times New Roman', Times, serif",
  sans:   "'Inter', Arial, Helvetica, sans-serif",
  mono:   "'ui-monospace', 'Courier New', Courier, monospace",

  // Ink palette — restrained, almost monochrome
  navy:   "#0C0F1E",
  gold:   "#A8853A",   // subdued gold (print-safe)
  ink:    "#000000",
  inkDk:  "#111111",
  inkMd:  "#2C2C2C",
  inkLt:  "#4A4A4A",
  inkSub: "#6B6B6B",
  rule:   "#BBBBBB",
  ruleLt: "#DEDEDE",

  // Semantic (used only on totals/balance)
  green:  "#065F46",
  amber:  "#78350F",
  red:    "#991B1B",

  // Sizes
  fXs:   9.5,
  fSm:   10.5,
  fBase: 11.5,
  fMd:   12.5,
  fLg:   14,
  fXl:   18,
  fXxl:  24,

  // Print colour preservation
  pca: {
    WebkitPrintColorAdjust: "exact",
    printColorAdjust:        "exact",
  },
};

// ── Shared 3-column layout for financial tables
//    Columns: [Code 60px] [Description flex] [Amount 148px]
function DocCols() {
  return (
    <colgroup>
      <col style={{ width: 60 }} />
      <col />
      <col style={{ width: 148 }} />
    </colgroup>
  );
}

/* ════════════════════════════════════════════════════════
   DOCUMENT HEADER
   ════════════════════════════════════════════════════════ */
function PrintDocHeader({ company, title, periodLine, currency, trn }) {
  const generated = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{ fontFamily: PD.sans, pageBreakAfter: "avoid" }}>

      {/* ── Identity row: logo + company name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Logo size={40} />
        <div>
          <div style={{
            fontSize:      PD.fMd,
            fontWeight:    800,
            color:         PD.navy,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}>
            {company}
          </div>
          {trn && (
            <div style={{ fontSize: PD.fXs, color: PD.inkSub, marginTop: 2 }}>
              Tax Registration No.&nbsp;{trn}
            </div>
          )}
        </div>
      </div>

      {/* ── Double rule — structural signature of the document */}
      <div style={{ borderTop: "2.5px solid " + PD.navy }} />
      <div style={{ borderTop: "1px   solid " + PD.navy, marginTop: 2, marginBottom: 22 }} />

      {/* ── Report title block — centred */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{
          fontFamily:    PD.sans,
          fontSize:      PD.fXxl,
          fontWeight:    800,
          color:         PD.navy,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          marginBottom:  10,
          lineHeight:    1.05,
        }}>
          {title}
        </div>
        <div style={{ fontSize: PD.fBase, fontWeight: 500, color: PD.inkMd }}>
          {periodLine}
        </div>
      </div>

      {/* ── Meta bar */}
      <div style={{
        display:       "flex",
        justifyContent:"space-between",
        fontSize:       PD.fXs,
        color:          PD.inkSub,
        borderTop:    "0.75px solid " + PD.rule,
        borderBottom: "0.75px solid " + PD.rule,
        padding:       "5px 0",
        marginBottom:  28,
        fontFamily:    PD.sans,
      }}>
        <span>Currency:&nbsp;{currency || "AED"}</span>
        {trn && <span>TRN:&nbsp;{trn}</span>}
        <span>Generated:&nbsp;{generated}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SECTION LABEL  (e.g. "REVENUE", "EXPENSES")
   ════════════════════════════════════════════════════════ */
function PrintSectionHead({ label }) {
  return (
    <div style={{
      display:       "flex",
      justifyContent:"space-between",
      alignItems:    "baseline",
      marginTop:     26,
      marginBottom:  5,
      paddingBottom: 4,
      borderBottom:  "1.5px solid " + PD.navy,
      pageBreakAfter:"avoid",
      fontFamily:    PD.sans,
    }}>
      <span style={{
        fontSize:      PD.fMd,
        fontWeight:    800,
        color:         PD.navy,
        textTransform: "uppercase",
        letterSpacing: "0.09em",
      }}>
        {label}
      </span>
      <span style={{
        fontSize:      PD.fXs,
        color:         PD.inkSub,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        AED
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ACCOUNT ROW TABLE
   ════════════════════════════════════════════════════════ */
function PrintAccountRows({ accounts, ledger, emptyMsg }) {
  const rows = (accounts || []).filter(a => accountBalance(a, ledger) !== 0);

  if (rows.length === 0) {
    return (
      <div style={{
        padding:   "7px 0",
        fontSize:   PD.fBase,
        color:      PD.inkSub,
        fontStyle: "italic",
        fontFamily: PD.sans,
        borderBottom: "0.5px solid " + PD.ruleLt,
      }}>
        {emptyMsg || "No activity in this period"}
      </div>
    );
  }

  return (
    <table style={{
      width:           "100%",
      borderCollapse:  "collapse",
      fontFamily:       PD.sans,
      fontSize:         PD.fBase,
      tableLayout:     "fixed",
    }}>
      <DocCols />
      <tbody>
        {rows.map(a => (
          <tr key={a.id} style={{ pageBreakInside: "avoid" }}>
            {/* Account code */}
            <td style={{
              padding:       "3.5px 8px 3.5px 0",
              fontSize:       PD.fXs,
              fontFamily:     PD.mono,
              color:          PD.inkSub,
              verticalAlign: "top",
              whiteSpace:    "nowrap",
            }}>
              {a.code}
            </td>
            {/* Account name */}
            <td style={{
              padding:       "3.5px 0",
              color:          PD.inkMd,
              verticalAlign: "top",
              lineHeight:     1.45,
            }}>
              {a.name}
            </td>
            {/* Amount */}
            <td style={{
              padding:             "3.5px 0",
              textAlign:           "right",
              fontVariantNumeric:  "tabular-nums",
              color:                PD.inkDk,
              fontWeight:           500,
              verticalAlign:       "top",
              whiteSpace:          "nowrap",
              fontFamily:           PD.sans,
            }}>
              {pFmt(accountBalance(a, ledger))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ════════════════════════════════════════════════════════
   TOTAL / SUBTOTAL ROW
   Uses accounting-convention rule lines.
   isGrand = double underline below (grand total)
   ════════════════════════════════════════════════════════ */
function PrintTotalRow({ label, amount, color, isGrand }) {
  const topRule = "0.75px solid " + PD.rule;
  const grandTopRule = "1.5px solid " + PD.inkDk;
  const grandBotRule = "3px double "  + PD.inkDk;

  const cellBase = {
    borderTop:    isGrand ? grandTopRule : topRule,
    borderBottom: isGrand ? grandBotRule : "none",
    padding:      (isGrand ? "8px" : "5px") + " 0",
    fontFamily:    PD.sans,
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <DocCols />
      <tbody>
        <tr>
          <td style={{ ...cellBase }} />
          <td style={{
            ...cellBase,
            fontWeight:    700,
            fontSize:       isGrand ? PD.fMd : PD.fBase,
            color:          PD.navy,
            textTransform: isGrand ? "uppercase" : "none",
            letterSpacing: isGrand ? "0.06em"    : "normal",
          }}>
            {label}
          </td>
          <td style={{
            ...cellBase,
            textAlign:          "right",
            fontWeight:          700,
            fontSize:            isGrand ? PD.fMd : PD.fBase,
            color:               color || PD.inkDk,
            fontVariantNumeric: "tabular-nums",
            whiteSpace:         "nowrap",
          }}>
            {pFmt(amount)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ════════════════════════════════════════════════════════
   NET INCOME CONCLUSION BLOCK
   ════════════════════════════════════════════════════════ */
function PrintNetIncome({ amount }) {
  const positive = amount >= 0;
  const amtColor = positive ? PD.green : PD.red;

  return (
    <div style={{
      marginTop:       32,
      pageBreakInside: "avoid",
      fontFamily:       PD.sans,
      ...PD.pca,
    }}>
      {/* Double opening rule */}
      <div style={{ borderTop: "2.5px solid " + PD.navy }} />
      <div style={{ borderTop: "1px solid "   + PD.navy, marginTop: 2.5 }} />

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <DocCols />
        <tbody>
          <tr>
            <td style={{ padding: "12px 0" }} />
            <td style={{
              padding:       "12px 0",
              fontSize:       PD.fLg,
              fontWeight:     800,
              color:          PD.navy,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              Net Income
            </td>
            <td style={{
              padding:            "12px 0",
              textAlign:          "right",
              fontSize:            PD.fLg,
              fontWeight:          800,
              color:               amtColor,
              fontVariantNumeric: "tabular-nums",
              whiteSpace:         "nowrap",
              ...PD.pca,
            }}>
              {pFmt(amount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Double closing rule */}
      <div style={{ borderTop: "1px solid "   + PD.navy }} />
      <div style={{ borderTop: "2.5px solid " + PD.navy, marginTop: 2.5 }} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   DOCUMENT FOOTER NOTE  (certification line)
   ════════════════════════════════════════════════════════ */
function PrintDocNote({ company }) {
  return (
    <div style={{
      marginTop:   40,
      paddingTop:  10,
      borderTop:   "0.75px solid " + PD.rule,
      fontSize:     PD.fXs,
      color:        PD.inkSub,
      fontFamily:   PD.sans,
      display:     "flex",
      justifyContent:"space-between",
      lineHeight:   1.5,
    }}>
      <span>Prepared by {company} · Accounting System v2</span>
      <span>This statement is computer-generated and has not been audited.</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   P&L PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function PLPrintDoc({ accounts, filteredLedger, totalRev, totalExp, dateFilter, settings }) {
  const netIncome   = totalRev - totalExp;
  const company     = settings?.company  || "Nasama Properties";
  const currency    = settings?.currency || "AED";
  const trn         = settings?.trn;

  const periodLine  = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : dateFilter.to
      ? `As of ${fmtDate(dateFilter.to)}`
      : "All Periods";

  const revenueRows = (accounts || [])
    .filter(a => a.type === "Revenue" && accountBalance(a, filteredLedger) !== 0);

  const expenseRows = (accounts || [])
    .filter(a => a.type === "Expense" && accountBalance(a, filteredLedger) !== 0)
    .sort((a, b) => accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger));

  return (
    <div style={{
      fontFamily: PD.sans,
      background: "#ffffff",
      color:       PD.ink,
      fontSize:    PD.fBase,
      lineHeight:  1.5,
    }}>
      <PrintDocHeader
        company={company}
        title="Profit & Loss Statement"
        periodLine={periodLine}
        currency={currency}
        trn={trn}
      />

      {/* ── REVENUE ── */}
      <PrintSectionHead label="Revenue" />
      <PrintAccountRows
        accounts={revenueRows}
        ledger={filteredLedger}
        emptyMsg="No revenue recorded in this period"
      />
      <PrintTotalRow label="Total Revenue" amount={totalRev} color={PD.green} />

      {/* ── EXPENSES ── */}
      <PrintSectionHead label="Expenses" />
      <PrintAccountRows
        accounts={expenseRows}
        ledger={filteredLedger}
        emptyMsg="No expenses recorded in this period"
      />
      <PrintTotalRow label="Total Expenses" amount={totalExp} color={PD.amber} isGrand />

      {/* ── NET INCOME ── */}
      <PrintNetIncome amount={netIncome} />

      <PrintDocNote company={company} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   BALANCE SHEET PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function BSPrintDoc({
  accounts, toDateLedger,
  totalAssets, totalLiabilities, totalEquity, netIncome,
  dateFilter, settings,
}) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;
  const totalLE  = totalLiabilities + totalEquity + netIncome;
  const balanced = Math.abs(totalAssets - totalLE) <= 1;

  const assetRows  = (accounts || []).filter(a => a.type === "Asset"     && accountBalance(a, toDateLedger) !== 0);
  const liabRows   = (accounts || []).filter(a => a.type === "Liability" && accountBalance(a, toDateLedger) !== 0);
  const equityRows = (accounts || []).filter(a => a.type === "Equity"    && accountBalance(a, toDateLedger) !== 0);

  const periodLine = `As of ${dateFilter.to ? fmtDate(dateFilter.to) : "today"}`;

  return (
    <div style={{ fontFamily: PD.sans, background: "#fff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader
        company={company} title="Balance Sheet"
        periodLine={periodLine} currency={currency} trn={trn}
      />

      <PrintSectionHead label="Assets" />
      <PrintAccountRows accounts={assetRows} ledger={toDateLedger} emptyMsg="No assets" />
      <PrintTotalRow label="Total Assets" amount={totalAssets} color={PD.navy} />

      <PrintSectionHead label="Liabilities" />
      <PrintAccountRows accounts={liabRows} ledger={toDateLedger} emptyMsg="No liabilities" />
      <PrintTotalRow label="Total Liabilities" amount={totalLiabilities} color={PD.amber} />

      <PrintSectionHead label="Equity" />
      <PrintAccountRows accounts={equityRows} ledger={toDateLedger} emptyMsg="No equity accounts" />

      {/* Retained earnings inline row */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <DocCols />
        <tbody>
          <tr>
            <td style={{ padding: "3.5px 0", fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.mono }}>—</td>
            <td style={{ padding: "3.5px 0", color: PD.inkLt, fontStyle: "italic" }}>
              Retained Earnings (Net Income to date)
            </td>
            <td style={{ padding: "3.5px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: PD.inkDk, fontWeight: 500 }}>
              {pFmt(netIncome)}
            </td>
          </tr>
        </tbody>
      </table>
      <PrintTotalRow label="Total Equity" amount={totalEquity + netIncome} color={PD.navy} />

      {/* Summary: Total L + E */}
      <div style={{ marginTop: 20, pageBreakInside: "avoid" }}>
        <PrintTotalRow label="Total Liabilities + Equity" amount={totalLE} color={PD.navy} isGrand />
      </div>

      {/* Balance check */}
      <div style={{
        marginTop: 10, padding: "5px 0",
        fontSize: PD.fXs, fontWeight: 600, fontFamily: PD.sans,
        color: balanced ? PD.green : PD.red,
        ...PD.pca,
      }}>
        {balanced
          ? "✓  Balance sheet is balanced — Assets = Liabilities + Equity"
          : "✗  Balance sheet is NOT balanced — Difference: " + fmtAED(Math.abs(totalAssets - totalLE))}
      </div>

      <PrintDocNote company={company} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TRIAL BALANCE PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function TBPrintDoc({ accounts, filteredLedger, dateFilter, settings }) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;

  const periodLine = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : "All Periods";

  const rows = (accounts || []).slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .filter(a => {
      const e = filteredLedger[a.id] || { debit: 0, credit: 0 };
      return e.debit > 0 || e.credit > 0;
    })
    .map(a => {
      const e   = filteredLedger[a.id] || { debit: 0, credit: 0 };
      const nb  = NORMAL_BAL[a.type];
      const bal = nb === "debit" ? e.debit - e.credit : e.credit - e.debit;
      return {
        id:     a.id,
        code:   a.code,
        name:   a.name,
        type:   a.type,
        debit:  nb === "debit"  && bal !== 0 ? bal : 0,
        credit: nb === "credit" && bal !== 0 ? bal : 0,
      };
    });

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) <= 1;

  const thTB = (extra = {}) => ({
    padding:       "5px 8px 5px 0",
    fontSize:       PD.fXs,
    fontWeight:     700,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    color:          PD.navy,
    borderBottom:  "1.5px solid " + PD.navy,
    whiteSpace:    "nowrap",
    fontFamily:     PD.sans,
    ...extra,
  });

  const tdTB = (extra = {}) => ({
    padding:       "4px 8px 4px 0",
    fontSize:       PD.fBase,
    borderBottom:  "0.5px solid " + PD.ruleLt,
    verticalAlign: "top",
    fontFamily:     PD.sans,
    ...extra,
  });

  return (
    <div style={{ fontFamily: PD.sans, background: "#fff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader
        company={company} title="Trial Balance"
        periodLine={periodLine} currency={currency} trn={trn}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 56 }} />
          <col />
          <col style={{ width: 88 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 138 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thTB()}>Code</th>
            <th style={thTB()}>Account Name</th>
            <th style={thTB()}>Type</th>
            <th style={thTB({ textAlign: "right" })}>Debit (AED)</th>
            <th style={thTB({ textAlign: "right" })}>Credit (AED)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: "14px 0", color: PD.inkSub, fontStyle: "italic" }}>
                No transactions in this period
              </td>
            </tr>
          )}
          {rows.map(row => (
            <tr key={row.id} style={{ pageBreakInside: "avoid" }}>
              <td style={tdTB({ fontFamily: PD.mono, fontSize: PD.fXs, color: PD.inkSub })}>{row.code}</td>
              <td style={tdTB({ color: PD.inkMd })}>{row.name}</td>
              <td style={tdTB({ fontSize: PD.fXs, color: PD.inkSub, textTransform: "uppercase", letterSpacing: "0.05em" })}>{row.type}</td>
              <td style={tdTB({ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.debit ? PD.inkDk : PD.inkSub })}>
                {row.debit ? pFmt(row.debit) : "—"}
              </td>
              <td style={tdTB({ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.credit ? PD.inkDk : PD.inkSub })}>
                {row.credit ? pFmt(row.credit) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{
              padding: "8px 8px 8px 0",
              fontWeight: 800, fontSize: PD.fMd,
              color: PD.navy, textTransform: "uppercase", letterSpacing: "0.06em",
              borderTop: "1.5px solid " + PD.navy,
              borderBottom: "3px double " + PD.navy,
              fontFamily: PD.sans,
            }}>
              Totals
            </td>
            <td style={{
              padding: "8px 0", textAlign: "right",
              fontWeight: 700, fontSize: PD.fMd,
              fontVariantNumeric: "tabular-nums",
              borderTop: "1.5px solid " + PD.navy,
              borderBottom: "3px double " + PD.navy,
            }}>
              {pFmt(totalDebit)}
            </td>
            <td style={{
              padding: "8px 0", textAlign: "right",
              fontWeight: 700, fontSize: PD.fMd,
              fontVariantNumeric: "tabular-nums",
              borderTop: "1.5px solid " + PD.navy,
              borderBottom: "3px double " + PD.navy,
            }}>
              {pFmt(totalCredit)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{
        marginTop: 10, fontSize: PD.fXs, fontWeight: 600,
        color: isBalanced ? PD.green : PD.red, ...PD.pca,
      }}>
        {isBalanced
          ? "✓  Trial balance is balanced"
          : "✗  Out of balance by " + fmtAED(Math.abs(totalDebit - totalCredit))}
      </div>

      <PrintDocNote company={company} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   GENERAL LEDGER PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function GLPrintDoc({ accounts, txns, filteredTxns, dateFilter, settings }) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;

  const periodLine = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : "All Periods";

  const groups = React.useMemo(() => {
    const acctIds = new Set(
      (filteredTxns || [])
        .filter(t => !t.isVoid)
        .flatMap(t => (t.lines || []).map(l => l.accountId))
    );

    return (accounts || [])
      .filter(a => acctIds.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(acct => {
        const nb = NORMAL_BAL[acct.type];
        let priorBalance = 0;

        if (dateFilter.from) {
          (txns || [])
            .filter(t => !t.isVoid && (t.date || "") < dateFilter.from)
            .forEach(t => {
              (t.lines || []).forEach(l => {
                if (l.accountId !== acct.id) return;
                const dr = l.debit || 0, cr = l.credit || 0;
                priorBalance += nb === "debit" ? dr - cr : cr - dr;
              });
            });
        }

        let runningBal = priorBalance;
        const rows = (filteredTxns || [])
          .filter(t => !t.isVoid)
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
          .flatMap(t =>
            (t.lines || [])
              .filter(l => l.accountId === acct.id)
              .map(l => {
                const dr = l.debit || 0, cr = l.credit || 0;
                runningBal += nb === "debit" ? dr - cr : cr - dr;
                return {
                  date:    t.date,
                  ref:     t.ref,
                  desc:    l.memo || t.description || "—",
                  debit:   dr,
                  credit:  cr,
                  balance: runningBal,
                  key:     t.id + "-" + l.id,
                };
              })
          );

        return { acct, nb, openingBal: priorBalance, rows, closing: runningBal };
      });
  }, [accounts, txns, filteredTxns, dateFilter.from]);

  const thGL = (extra = {}) => ({
    padding:       "5px 8px 5px 0",
    fontSize:       PD.fXs,
    fontWeight:     700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color:          PD.navy,
    borderBottom:  "1.5px solid " + PD.navy,
    whiteSpace:    "nowrap",
    fontFamily:     PD.sans,
    ...extra,
  });

  const tdGL = (extra = {}) => ({
    padding:       "3.5px 8px 3.5px 0",
    fontSize:       PD.fBase,
    borderBottom:  "0.5px solid " + PD.ruleLt,
    verticalAlign: "top",
    fontFamily:     PD.sans,
    ...extra,
  });

  return (
    <div style={{ fontFamily: PD.sans, background: "#fff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader
        company={company} title="General Ledger"
        periodLine={periodLine} currency={currency} trn={trn}
      />

      {groups.length === 0 && (
        <div style={{ padding: "20px 0", color: PD.inkSub, fontStyle: "italic" }}>
          No transactions found for the selected period.
        </div>
      )}

      {groups.map((g, gi) => {
        const totalDr = g.rows.reduce((s, r) => s + r.debit,  0);
        const totalCr = g.rows.reduce((s, r) => s + r.credit, 0);

        return (
          <div key={g.acct.id} style={{ marginTop: gi > 0 ? 30 : 0, pageBreakInside: "avoid" }}>

            {/* Account heading */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              paddingBottom: 4,
              borderBottom: "1.5px solid " + PD.navy,
              marginBottom: 4,
              pageBreakAfter: "avoid",
            }}>
              <span style={{ fontSize: PD.fMd, fontWeight: 800, color: PD.navy }}>
                {g.acct.code} — {g.acct.name}
              </span>
              <span style={{ fontSize: PD.fXs, color: PD.inkSub, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {g.acct.type}
              </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 80 }} />
                <col style={{ width: 100 }} />
                <col />
                <col style={{ width: 106 }} />
                <col style={{ width: 106 }} />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thGL()}>Date</th>
                  <th style={thGL()}>Ref</th>
                  <th style={thGL()}>Description</th>
                  <th style={thGL({ textAlign: "right" })}>Debit</th>
                  <th style={thGL({ textAlign: "right" })}>Credit</th>
                  <th style={thGL({ textAlign: "right" })}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance */}
                <tr style={{ pageBreakInside: "avoid" }}>
                  <td style={tdGL({ color: PD.inkSub })}>{dateFilter.from ? fmtDate(dateFilter.from) : "—"}</td>
                  <td style={tdGL({ color: PD.inkSub })}>—</td>
                  <td style={tdGL({ color: PD.inkSub, fontStyle: "italic" })}>Opening Balance</td>
                  <td style={tdGL({ textAlign: "right" })}>—</td>
                  <td style={tdGL({ textAlign: "right" })}>—</td>
                  <td style={tdGL({ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 })}>
                    {pFmt(g.openingBal)}
                  </td>
                </tr>
                {/* Transaction rows */}
                {g.rows.map(row => (
                  <tr key={row.key} style={{ pageBreakInside: "avoid" }}>
                    <td style={tdGL({ color: PD.inkSub, whiteSpace: "nowrap" })}>{fmtDate(row.date)}</td>
                    <td style={tdGL({ fontFamily: PD.mono, fontSize: PD.fXs, color: PD.inkSub, whiteSpace: "nowrap" })}>{row.ref || "—"}</td>
                    <td style={tdGL({ color: PD.inkMd })}>{row.desc}</td>
                    <td style={tdGL({ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.debit ? PD.inkDk : PD.inkSub })}>
                      {row.debit  ? pFmt(row.debit)  : "—"}
                    </td>
                    <td style={tdGL({ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.credit ? PD.inkDk : PD.inkSub })}>
                      {row.credit ? pFmt(row.credit) : "—"}
                    </td>
                    <td style={tdGL({ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: row.balance >= 0 ? PD.inkDk : PD.red, ...PD.pca })}>
                      {pFmt(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{
                    padding: "6px 8px 6px 0", fontWeight: 700, fontSize: PD.fMd, color: PD.navy,
                    borderTop: "1.5px solid " + PD.navy, fontFamily: PD.sans,
                  }}>
                    Closing Balance
                  </td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", borderTop: "1.5px solid " + PD.navy }}>
                    {pFmt(totalDr)}
                  </td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", borderTop: "1.5px solid " + PD.navy }}>
                    {pFmt(totalCr)}
                  </td>
                  <td style={{
                    padding: "6px 0", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                    color: g.closing >= 0 ? PD.navy : PD.red, borderTop: "1.5px solid " + PD.navy, ...PD.pca,
                  }}>
                    {pFmt(g.closing)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      <PrintDocNote company={company} />
    </div>
  );
}
