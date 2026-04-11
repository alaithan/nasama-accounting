/* ════════════════════════════════════════════════════════
   NASAMA PROPERTIES — ADDITIONAL PRINT DOCUMENTS
   Cash Flow · Changes in Equity · Notes to Financial Statements
   Purpose-built A4 print layout — never shown on screen.
   ════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════
   CASH FLOW PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function CFPrintDoc({ accounts, filteredTxns, openingLedger, toDateLedger, dateFilter, settings }) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;

  const periodLine = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : dateFilter.to ? `As of ${fmtDate(dateFilter.to)}` : "All Periods";

  // Account classifications
  const cashAccounts    = (accounts || []).filter(isCashAccount);
  const fixedAssetAccts = (accounts || []).filter(isFixedAssetAccount);
  const equityAccts     = (accounts || []).filter(a => a.type === "Equity");
  const cashIds         = new Set(cashAccounts.map(a => a.id));
  const fixedAssetIds   = new Set(fixedAssetAccts.map(a => a.id));
  const equityIds       = new Set(equityAccts.map(a => a.id));

  // Opening & closing cash
  const openingCash = cashAccounts.reduce((s, a) => s + accountBalance(a, openingLedger || {}), 0);
  const closingCash = cashAccounts.reduce((s, a) => s + accountBalance(a, toDateLedger   || {}), 0);

  // Classify cash flows
  let operating = 0, investing = 0, financing = 0;
  const opLines = [], invLines = [], finLines = [];

  (filteredTxns || []).forEach(txn => {
    const r = classifyTxnCash(txn, cashIds, fixedAssetIds, equityIds);
    if (!r) return;
    operating += r.operating;
    investing += r.investing;
    financing += r.financing;
    const memo = txn.memo || (txn.lines && txn.lines[0] && txn.lines[0].memo) || "";
    if (r.operating !== 0) opLines.push({ ref: txn.ref, memo, amount: r.operating, date: txn.date });
    if (r.investing !== 0) invLines.push({ ref: txn.ref, memo, amount: r.investing, date: txn.date });
    if (r.financing !== 0) finLines.push({ ref: txn.ref, memo, amount: r.financing, date: txn.date });
  });

  const netMovement = operating + investing + financing;

  // Shared col group for activity tables
  function ActivityCols() {
    return (
      <colgroup>
        <col style={{ width: 68 }} />
        <col style={{ width: 70 }} />
        <col />
        <col style={{ width: 110 }} />
      </colgroup>
    );
  }

  function ActivityTableHead() {
    return (
      <thead>
        <tr style={{ background: PD.ruleLt, ...PD.pca }}>
          {["Date", "Ref", "Description", "Amount"].map((h, i) => (
            <th key={h} style={{
              padding: "4px 6px",
              fontSize: PD.fXs,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: PD.inkSub,
              textAlign: i === 3 ? "right" : "left",
              borderBottom: "1px solid " + PD.rule,
              fontFamily: PD.sans,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
    );
  }

  function ActivitySection({ label, lines, subtotal }) {
    const amtColor = subtotal >= 0 ? PD.green : PD.red;
    return (
      <div style={{ marginBottom: 6 }}>
        <PrintSectionHead label={label} />
        {lines.length === 0 ? (
          <div style={{ padding: "6px 0", fontSize: PD.fXs, color: PD.inkSub, fontStyle: "italic", fontFamily: PD.sans }}>
            No {label.toLowerCase()} in this period.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <ActivityCols />
            <ActivityTableHead />
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i} style={{ pageBreakInside: "avoid" }}>
                  <td style={{ padding: "3px 6px 3px 0", fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.mono, whiteSpace: "nowrap", overflow: "hidden" }}>
                    {ln.date ? fmtDate(ln.date) : "—"}
                  </td>
                  <td style={{ padding: "3px 6px", fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.mono, whiteSpace: "nowrap", overflow: "hidden" }}>
                    {ln.ref ? (ln.ref.length > 12 ? ln.ref.slice(0, 10) + "…" : ln.ref) : "—"}
                  </td>
                  <td style={{ padding: "3px 6px", fontSize: PD.fBase, color: PD.inkMd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ln.memo || "Transaction"}
                  </td>
                  <td style={{ padding: "3px 0 3px 6px", textAlign: "right", fontSize: PD.fBase, fontWeight: 500, color: ln.amount >= 0 ? PD.green : PD.red, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {ln.amount >= 0 ? "+" : ""}{pFmt(ln.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Subtotal row */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 2 }}>
          <ActivityCols />
          <tbody>
            <tr>
              <td colSpan={2} style={{ borderTop: "0.75px solid " + PD.rule, padding: "4px 0" }} />
              <td style={{ borderTop: "0.75px solid " + PD.rule, padding: "4px 6px", fontSize: PD.fSm, fontWeight: 700, color: PD.navy, fontFamily: PD.sans }}>
                Net Cash from {label}
              </td>
              <td style={{ borderTop: "0.75px solid " + PD.rule, padding: "4px 0 4px 6px", textAlign: "right", fontSize: PD.fSm, fontWeight: 700, color: amtColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontFamily: PD.sans }}>
                {pFmt(subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: PD.sans, background: "#ffffff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader company={company} title="Cash Flow Statement" periodLine={periodLine} currency={currency} trn={trn} />

      {/* Cash accounts summary */}
      {cashAccounts.length > 0 && (
        <div style={{ marginBottom: 20, fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.sans }}>
          <span style={{ fontWeight: 700, color: PD.inkMd }}>Cash & Bank Accounts: </span>
          {cashAccounts.map((a, i) => (
            <span key={a.id}>
              {a.code} {a.name}{i < cashAccounts.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}

      <ActivitySection label="Operating Activities" lines={opLines} subtotal={operating} />
      <ActivitySection label="Investing Activities" lines={invLines} subtotal={investing} />
      <ActivitySection label="Financing Activities" lines={finLines} subtotal={financing} />

      {/* Reconciliation block */}
      <div style={{ marginTop: 28, pageBreakInside: "avoid", fontFamily: PD.sans }}>
        <div style={{ borderTop: "2.5px solid " + PD.navy }} />
        <div style={{ borderTop: "1px solid " + PD.navy, marginTop: 2, marginBottom: 12 }} />

        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup><col /><col style={{ width: 140 }} /></colgroup>
          <tbody>
            {[
              { label: "Opening Cash & Bank Balance",     value: openingCash, color: PD.inkMd },
              { label: "Net Cash from Operating Activities", value: operating, color: operating  >= 0 ? PD.green : PD.red },
              { label: "Net Cash from Investing Activities", value: investing, color: investing  >= 0 ? PD.green : PD.red },
              { label: "Net Cash from Financing Activities", value: financing, color: financing  >= 0 ? PD.green : PD.red },
              { label: "Net Movement in Cash",              value: netMovement, color: netMovement >= 0 ? PD.green : PD.red, bold: true },
            ].map((row, i) => (
              <tr key={i}>
                <td style={{ padding: "3.5px 0", fontSize: row.bold ? PD.fSm : PD.fBase, fontWeight: row.bold ? 700 : 400, color: PD.inkMd, borderTop: row.bold ? "0.75px solid " + PD.rule : "none" }}>
                  {row.label}
                </td>
                <td style={{ padding: "3.5px 0", textAlign: "right", fontSize: row.bold ? PD.fSm : PD.fBase, fontWeight: row.bold ? 700 : 400, color: row.color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", borderTop: row.bold ? "0.75px solid " + PD.rule : "none" }}>
                  {pFmt(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Closing balance — grand total */}
        <div style={{ borderTop: "1px solid " + PD.navy, marginTop: 4 }} />
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 0 }}>
          <colgroup><col /><col style={{ width: 140 }} /></colgroup>
          <tbody>
            <tr>
              <td style={{ padding: "10px 0 6px", fontSize: PD.fMd, fontWeight: 800, color: PD.navy, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Closing Cash &amp; Bank Balance
              </td>
              <td style={{ padding: "10px 0 6px", textAlign: "right", fontSize: PD.fMd, fontWeight: 800, color: closingCash >= 0 ? PD.green : PD.red, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {pFmt(closingCash)}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ borderTop: "1px solid " + PD.navy }} />
        <div style={{ borderTop: "2.5px solid " + PD.navy, marginTop: 2.5 }} />
      </div>

      <PrintDocNote company={company} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   STATEMENT OF CHANGES IN EQUITY — PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function EquityPrintDoc({ accounts, filteredLedger, openingLedger, toDateLedger, totalRev, totalExp, dateFilter, settings }) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;
  const netIncome = (totalRev || 0) - (totalExp || 0);

  const periodLine = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : dateFilter.to ? `As of ${fmtDate(dateFilter.to)}` : "All Periods";

  const equityAccounts = (accounts || []).filter(a => a.type === "Equity");

  function isCapital(a)  { return /capital/i.test(a.name || ""); }
  function isDrawing(a)  { return /drawing|draw|withdrawal/i.test(a.name || ""); }
  function isRetained(a) { return /retained|reserve|profit/i.test(a.name || ""); }

  const capitalAccts  = equityAccounts.filter(isCapital);
  const drawingAccts  = equityAccounts.filter(a => isDrawing(a) && !isCapital(a));
  const retainedAccts = equityAccounts.filter(a => isRetained(a) && !isCapital(a) && !isDrawing(a));
  const otherEquity   = equityAccounts.filter(a => !isCapital(a) && !isDrawing(a) && !isRetained(a));

  function sumBal(accts, ledger) {
    return accts.reduce((s, a) => s + accountBalance(a, ledger || {}), 0);
  }

  const openCapital  = sumBal(capitalAccts,  openingLedger);
  const openDrawings = sumBal(drawingAccts,  openingLedger);
  const openRetained = sumBal(retainedAccts, openingLedger);
  const openOther    = sumBal(otherEquity,   openingLedger);
  const openTotal    = sumBal(equityAccounts, openingLedger);

  const perCapital  = sumBal(capitalAccts, filteredLedger);
  const perDrawings = sumBal(drawingAccts, filteredLedger);
  const perOther    = sumBal(otherEquity,  filteredLedger);

  const closeCapital  = sumBal(capitalAccts,  toDateLedger);
  const closeDrawings = sumBal(drawingAccts,  toDateLedger);
  const closeRetained = sumBal(retainedAccts, toDateLedger);
  const closeOther    = sumBal(otherEquity,   toDateLedger);
  const closeTotal    = sumBal(equityAccounts, toDateLedger) + netIncome;

  // 5-column table: Label | Opening | Movement | Net Income | Closing
  const colW = [null, 120, 120, 120, 120];
  const hdr = ["Component", "Opening Balance", "Movement", "Net Income", "Closing Balance"];

  function AmtTd({ val, bold, nc }) {
    const c = nc ? (val >= 0 ? PD.green : PD.red) : PD.inkDk;
    return (
      <td style={{
        padding: bold ? "7px 6px 7px 0" : "4px 6px 4px 0",
        textAlign: "right",
        fontSize: bold ? PD.fSm : PD.fBase,
        fontWeight: bold ? 700 : 400,
        color: c,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        fontFamily: PD.sans,
        borderTop: bold ? "1.5px solid " + PD.inkDk : "none",
        borderBottom: bold ? "3px double " + PD.inkDk : "none",
        overflow: "hidden",
      }}>
        {pFmt(val)}
      </td>
    );
  }

  function DataRow({ label, opening, movement, ni, closing, bold }) {
    return (
      <tr style={{ pageBreakInside: "avoid" }}>
        <td style={{
          padding: bold ? "7px 0" : "4px 0",
          fontSize: bold ? PD.fSm : PD.fBase,
          fontWeight: bold ? 700 : 400,
          color: bold ? PD.navy : PD.inkMd,
          textTransform: bold ? "uppercase" : "none",
          letterSpacing: bold ? "0.07em" : "normal",
          borderTop: bold ? "1.5px solid " + PD.inkDk : "none",
          borderBottom: bold ? "3px double " + PD.inkDk : "none",
          fontFamily: PD.sans,
        }}>
          {label}
        </td>
        <AmtTd val={opening}  bold={bold} />
        <AmtTd val={movement} bold={bold} nc />
        <AmtTd val={ni}       bold={bold} nc />
        <AmtTd val={closing}  bold={bold} />
      </tr>
    );
  }

  return (
    <div style={{ fontFamily: PD.sans, background: "#ffffff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader company={company} title="Statement of Changes in Equity" periodLine={periodLine} currency={currency} trn={trn} />

      {/* Table header */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col />
          {colW.slice(1).map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {hdr.map((h, i) => (
              <th key={h} style={{
                padding: "5px 6px 5px " + (i === 0 ? "0" : "6px"),
                fontSize: PD.fXs,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                color: PD.inkSub,
                textAlign: i === 0 ? "left" : "right",
                borderBottom: "1.5px solid " + PD.navy,
                fontFamily: PD.sans,
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {capitalAccts.length > 0 && (
            <DataRow label="Capital / Paid-in Capital" opening={openCapital} movement={perCapital} ni={0} closing={closeCapital} />
          )}
          {drawingAccts.length > 0 && (
            <DataRow label="Drawings" opening={-openDrawings} movement={-perDrawings} ni={0} closing={-closeDrawings} />
          )}
          {retainedAccts.length > 0 && (
            <DataRow label="Retained Earnings" opening={openRetained} movement={0} ni={0} closing={closeRetained} />
          )}
          <DataRow label="Net Income / (Loss) for Period" opening={0} movement={0} ni={netIncome} closing={netIncome} />
          {otherEquity.length > 0 && (
            <DataRow label="Other Equity" opening={openOther} movement={perOther} ni={0} closing={closeOther} />
          )}
          <DataRow
            label="Total Equity"
            opening={openTotal}
            movement={perCapital - perDrawings + perOther}
            ni={netIncome}
            closing={closeTotal}
            bold
          />
        </tbody>
      </table>

      {/* Note */}
      <div style={{ marginTop: 20, padding: "10px 0", borderTop: "0.75px solid " + PD.ruleLt, fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.sans, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: PD.inkMd }}>Note: </span>
        Net income for the period is sourced from the Profit &amp; Loss statement and is reflected as an addition to retained earnings before any distribution.
        Drawings represent direct withdrawals by the owner and reduce total equity.
      </div>

      <PrintDocNote company={company} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   NOTES TO FINANCIAL STATEMENTS — PRINT DOCUMENT
   ════════════════════════════════════════════════════════ */
function NotesPrintDoc({ accounts, filteredLedger, toDateLedger, filteredTxns, totalRev, totalExp, totalAssets, totalLiabilities, totalEquity, dateFilter, settings }) {
  const company  = settings?.company  || "Nasama Properties";
  const currency = settings?.currency || "AED";
  const trn      = settings?.trn;
  const netIncome = (totalRev || 0) - (totalExp || 0);

  const periodLine = dateFilter.from && dateFilter.to
    ? `For the period ${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : dateFilter.to ? `As of ${fmtDate(dateFilter.to)}` : "All Periods";

  const periodLabel = dateFilter.from && dateFilter.to
    ? `${fmtDate(dateFilter.from)} to ${fmtDate(dateFilter.to)}`
    : periodLine;

  const generated = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const revenueAccts   = (accounts || []).filter(a => a.type === "Revenue" && accountBalance(a, filteredLedger) !== 0)
    .sort((a, b) => accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger));
  const expenseAccts   = (accounts || []).filter(a => a.type === "Expense" && accountBalance(a, filteredLedger) !== 0)
    .sort((a, b) => accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger));
  const cashAccts      = (accounts || []).filter(isCashAccount);
  const liabilityAccts = (accounts || []).filter(a => a.type === "Liability" && accountBalance(a, toDateLedger) !== 0);
  const equityAccts    = (accounts || []).filter(a => a.type === "Equity" && accountBalance(a, toDateLedger) !== 0);

  const totalCash = cashAccts.reduce((s, a) => s + accountBalance(a, toDateLedger || {}), 0);

  // ── Shared note heading
  function NoteHead({ number, title }) {
    return (
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        marginTop: 22, marginBottom: 6,
        paddingBottom: 4,
        borderBottom: "1.5px solid " + PD.navy,
        pageBreakAfter: "avoid",
        fontFamily: PD.sans,
      }}>
        <span style={{ fontSize: PD.fXs, fontFamily: PD.mono, color: PD.inkSub, minWidth: 22 }}>
          {number}.
        </span>
        <span style={{ fontSize: PD.fMd, fontWeight: 800, color: PD.navy, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {title}
        </span>
      </div>
    );
  }

  // ── Info key-value grid
  function InfoTable({ rows }) {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: PD.fBase, fontFamily: PD.sans }}>
        <tbody>
          {rows.map(([k, v], i) => v != null && (
            <tr key={i}>
              <td style={{ padding: "3px 0", color: PD.inkSub, width: "45%" }}>{k}</td>
              <td style={{ padding: "3px 0", color: PD.inkDk, fontWeight: 500, textAlign: "right" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Account breakdown table
  function AcctTable({ rows, ledger }) {
    if (!rows || rows.length === 0) {
      return <div style={{ fontSize: PD.fXs, color: PD.inkSub, fontStyle: "italic", padding: "4px 0" }}>No activity in this period.</div>;
    }
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: PD.sans }}>
        <colgroup>
          <col style={{ width: 60 }} />
          <col />
          <col style={{ width: 120 }} />
        </colgroup>
        <tbody>
          {rows.map(a => {
            const bal = accountBalance(a, ledger || {});
            return (
              <tr key={a.id} style={{ pageBreakInside: "avoid" }}>
                <td style={{ padding: "3px 0", fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.mono }}>{a.code}</td>
                <td style={{ padding: "3px 6px", fontSize: PD.fBase, color: PD.inkMd }}>{a.name}</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontSize: PD.fBase, fontWeight: 500, color: PD.inkDk, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {pFmt(bal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Policy bullet
  function Bullet({ text }) {
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 5, fontFamily: PD.sans, fontSize: PD.fBase, lineHeight: 1.6, color: PD.inkMd }}>
        <span style={{ color: PD.gold, fontWeight: 700, flexShrink: 0 }}>•</span>
        <span>{text}</span>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: PD.sans, background: "#ffffff", color: PD.ink, fontSize: PD.fBase, lineHeight: 1.5 }}>
      <PrintDocHeader company={company} title="Notes to Financial Statements" periodLine={periodLine} currency={currency} trn={trn} />

      {/* Note 1 — General Information */}
      <NoteHead number="1" title="General Information" />
      <InfoTable rows={[
        ["Company / Entity",      company],
        ["Reporting Currency",    currency],
        trn ? ["Tax Registration No.", trn] : null,
        ["Reporting Period",      periodLabel],
        ["Report Generated",      generated],
        ["Total Transactions",    String((filteredTxns || []).length)],
      ].filter(Boolean)} />

      {/* Note 2 — Basis of Preparation */}
      <NoteHead number="2" title="Basis of Preparation and Accounting Policies" />
      <div style={{ fontSize: PD.fBase, color: PD.inkMd, lineHeight: 1.65, marginBottom: 8, fontFamily: PD.sans }}>
        These financial statements have been prepared under generally accepted accounting principles (GAAP) using the double-entry bookkeeping method.
        All amounts are stated in {currency} unless otherwise indicated.
      </div>
      <Bullet text="Revenue Recognition: Revenue is recognised when earned and collected per the terms of each transaction." />
      <Bullet text="Expenses: Expenses are recognised in the period in which they are incurred." />
      <Bullet text={`Cash & Bank: Cash balances represent funds held in bank accounts and petty cash as at ${dateFilter.to ? fmtDate(dateFilter.to) : "the reporting date"}.`} />
      <Bullet text="VAT: The entity is registered for UAE VAT and accounts for VAT on each applicable transaction." />
      <Bullet text="Fixed Assets: Fixed assets are recorded at cost less accumulated depreciation where applicable." />

      {/* Note 3 — Cash & Bank */}
      <NoteHead number="3" title="Cash and Bank Balances" />
      {cashAccts.length === 0 ? (
        <div style={{ fontSize: PD.fXs, color: PD.inkSub, fontStyle: "italic" }}>No cash or bank accounts configured.</div>
      ) : (
        <div>
          <AcctTable rows={cashAccts} ledger={toDateLedger} />
          <PrintTotalRow label="Total Cash & Bank" amount={totalCash} color={totalCash >= 0 ? PD.green : PD.red} />
        </div>
      )}

      {/* Note 4 — Revenue */}
      <NoteHead number="4" title="Revenue" />
      <AcctTable rows={revenueAccts} ledger={filteredLedger} />
      {totalRev > 0 && <PrintTotalRow label="Total Revenue" amount={totalRev} color={PD.green} />}

      {/* Note 5 — Expenses */}
      <NoteHead number="5" title="Expenses" />
      <AcctTable rows={expenseAccts} ledger={filteredLedger} />
      {totalExp > 0 && <PrintTotalRow label="Total Expenses" amount={totalExp} />}

      {/* Note 6 — Equity */}
      <NoteHead number="6" title="Equity" />
      <div style={{ fontSize: PD.fBase, color: PD.inkMd, lineHeight: 1.6, marginBottom: 6, fontFamily: PD.sans }}>
        Equity represents the residual interest in assets after deducting liabilities. The entity is structured as a single-owner enterprise.
      </div>
      <AcctTable rows={equityAccts} ledger={toDateLedger} />
      <InfoTable rows={[
        ["Total Equity (Balance Sheet)", pFmt(totalEquity || 0) + " " + currency],
        ["Net Income / (Loss) for Period", pFmt(netIncome) + " " + currency],
      ]} />

      {/* Note 7 — Liabilities (if any) */}
      {liabilityAccts.length > 0 && (
        <div>
          <NoteHead number="7" title="Liabilities" />
          <AcctTable rows={liabilityAccts} ledger={toDateLedger} />
          <PrintTotalRow label="Total Liabilities" amount={totalLiabilities} color={PD.red} />
        </div>
      )}

      {/* Note 8 — Other Disclosures */}
      <NoteHead number={liabilityAccts.length > 0 ? "8" : "7"} title="Other Disclosures" />
      <Bullet text="These financial statements have not been audited and represent management accounts prepared from the company's accounting records." />
      <Bullet text="The company operates under UAE law and is subject to Federal Tax Authority regulations including VAT legislation." />
      <Bullet text="There are no known contingent liabilities or material post-balance sheet events at the time of preparation, unless specifically disclosed above." />

      <div style={{ marginTop: 16, paddingTop: 8, borderTop: "0.75px solid " + PD.ruleLt, fontSize: PD.fXs, color: PD.inkSub, fontFamily: PD.sans }}>
        Prepared by: {company} · Accounting System v2 · {generated}
      </div>

      <PrintDocNote company={company} />
    </div>
  );
}
