/* ════════════════════════════════════════════════════════
   NASAMA PROPERTIES — ADDITIONAL FINANCIAL REPORTS (screen)
   Cash Flow · Changes in Equity · Notes to Financial Statements
   ════════════════════════════════════════════════════════ */

// ── CASH FLOW HELPERS ─────────────────────────────────

function isCashAccount(a) {
  return a.type === "Asset" && (
    /^10/i.test(String(a.code || "")) ||
    /bank|cash/i.test(a.name || "")
  );
}

function isFixedAssetAccount(a) {
  var c = String(a.code || "");
  return a.type === "Asset" && (
    (c >= "1500" && c <= "1599") ||
    /fixed|equipment|furniture|computer|vehicle|machinery/i.test(a.name || "")
  );
}

// Classify a transaction's cash impact into operating / investing / financing
// Returns { operating, investing, financing } in cents
function classifyTxnCash(txn, cashIds, fixedAssetIds, equityIds) {
  var lines = txn.lines || [];
  var cashLines = lines.filter(function(l) { return cashIds.has(l.accountId); });
  if (cashLines.length === 0) return null;

  var netCash = cashLines.reduce(function(s, l) {
    return s + (l.debit || 0) - (l.credit || 0);
  }, 0);
  if (netCash === 0) return null;

  var nonCash = lines.filter(function(l) { return !cashIds.has(l.accountId); });
  var hasInvesting = nonCash.some(function(l) { return fixedAssetIds.has(l.accountId); });
  var hasFinancing = nonCash.some(function(l) { return equityIds.has(l.accountId); });

  if (hasInvesting) return { operating: 0, investing: netCash, financing: 0 };
  if (hasFinancing) return { operating: 0, investing: 0, financing: netCash };
  return { operating: netCash, investing: 0, financing: 0 };
}

/* ════════════════════════════════════════════════════════
   CASH FLOW STATEMENT  (screen)
   ════════════════════════════════════════════════════════ */
function CFReport(props) {
  var accounts       = props.accounts       || [];
  var filteredTxns   = props.filteredTxns   || [];
  var openingLedger  = props.openingLedger  || {};
  var toDateLedger   = props.toDateLedger   || {};
  var dateFilter     = props.dateFilter     || {};
  var settings       = props.settings       || {};

  var company = settings.company || "Nasama Properties";

  // Account sets
  var cashAccounts    = accounts.filter(isCashAccount);
  var fixedAssetAccts = accounts.filter(isFixedAssetAccount);
  var equityAccts     = accounts.filter(function(a) { return a.type === "Equity"; });

  var cashIds       = new Set(cashAccounts.map(function(a) { return a.id; }));
  var fixedAssetIds = new Set(fixedAssetAccts.map(function(a) { return a.id; }));
  var equityIds     = new Set(equityAccts.map(function(a) { return a.id; }));

  // Opening & closing cash
  var openingCash = cashAccounts.reduce(function(s, a) {
    return s + accountBalance(a, openingLedger);
  }, 0);
  var closingCash = cashAccounts.reduce(function(s, a) {
    return s + accountBalance(a, toDateLedger);
  }, 0);

  // Classify all filtered txns
  var operating = 0, investing = 0, financing = 0;
  var opLines = [], invLines = [], finLines = [];

  filteredTxns.forEach(function(txn) {
    var r = classifyTxnCash(txn, cashIds, fixedAssetIds, equityIds);
    if (!r) return;
    operating += r.operating;
    investing += r.investing;
    financing += r.financing;
    if (r.operating !== 0) opLines.push({ ref: txn.ref, memo: txn.memo || txn.lines && txn.lines[0] && txn.lines[0].memo || "", amount: r.operating, date: txn.date });
    if (r.investing !== 0) invLines.push({ ref: txn.ref, memo: txn.memo || txn.lines && txn.lines[0] && txn.lines[0].memo || "", amount: r.investing, date: txn.date });
    if (r.financing !== 0) finLines.push({ ref: txn.ref, memo: txn.memo || txn.lines && txn.lines[0] && txn.lines[0].memo || "", amount: r.financing, date: txn.date });
  });

  var netMovement = operating + investing + financing;
  var reconcile = openingCash + netMovement;

  var hasCashAccounts = cashAccounts.length > 0;
  var hasTxns = filteredTxns.length > 0;

  // KPI cards
  var kpis = [
    { label: "Opening Cash",     value: fmtAED(openingCash),  color: RPT.blue,    big: true },
    { label: "Net Movement",     value: fmtAED(netMovement),  color: netMovement >= 0 ? RPT.green : RPT.red, big: true },
    { label: "Closing Cash",     value: fmtAED(closingCash),  color: RPT.navy,    big: true },
    { label: "Operating Cash",   value: fmtAED(operating),    color: operating  >= 0 ? RPT.green : RPT.amber },
  ];

  var periodLabel = dateFilter.from && dateFilter.to
    ? (dateFilter.from + " → " + dateFilter.to)
    : dateFilter.to || "All periods";

  // Row renderer for activity sections
  function ActivityRows(lines, emptyMsg) {
    if (lines.length === 0) {
      return React.createElement("tr", null,
        React.createElement("td", { colSpan: 4, style: { padding: "14px 16px", textAlign: "center", color: RPT.subtle, fontStyle: "italic", fontSize: 12 } }, emptyMsg)
      );
    }
    return lines.map(function(ln, i) {
      var color = ln.amount >= 0 ? RPT.green : RPT.red;
      var refTxt = ln.ref ? (ln.ref.length > 16 ? ln.ref.slice(0, 14) + "…" : ln.ref) : "—";
      // Full memo for tooltip; display truncated via CSS
      var memo = ln.memo || "Transaction";
      return React.createElement("tr", { key: i },
        React.createElement("td", { style: { padding: "10px 16px", fontSize: 11, color: RPT.subtle, fontFamily: "ui-monospace,monospace", borderBottom: "1px solid " + RPT.rule, whiteSpace: "nowrap" } }, ln.date ? fmtDate(ln.date) : "—"),
        React.createElement("td", { title: ln.ref || "", style: { padding: "10px 16px", fontSize: 11, color: RPT.muted, fontFamily: "ui-monospace,monospace", borderBottom: "1px solid " + RPT.rule, whiteSpace: "nowrap", overflow: "hidden" } }, refTxt),
        React.createElement("td", { title: memo, style: { padding: "10px 16px", fontSize: 13, color: RPT.textHeavy, borderBottom: "1px solid " + RPT.rule, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 } }, memo),
        React.createElement("td", { style: { padding: "10px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: color, borderBottom: "1px solid " + RPT.rule, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" } },
          (ln.amount >= 0 ? "+" : "") + fmtAED(ln.amount)
        )
      );
    });
  }

  function SectionTable(title, color, lines, subtotal, emptyMsg) {
    return React.createElement("div", null,
      React.createElement(RptSectionLabel, { label: title, color: color }),
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
        React.createElement("colgroup", null,
          React.createElement("col", { style: { width: 110 } }),
          React.createElement("col", { style: { width: 120 } }),
          React.createElement("col", null),
          React.createElement("col", { style: { width: 190 } })
        ),
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS() }, "Date"),
            React.createElement("th", { style: thS() }, "Ref"),
            React.createElement("th", { style: thS() }, "Description"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Amount")
          )
        ),
        React.createElement("tbody", null, ActivityRows(lines, emptyMsg)),
        React.createElement("tfoot", null,
          React.createElement(TotalRow, {
            label: "Net Cash — " + title,
            amount: subtotal,
            color: subtotal >= 0 ? RPT.green : RPT.red,
            cols: 3,
          })
        )
      )
    );
  }

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },

    React.createElement(RptHeader, {
      company:  company,
      title:    "Cash Flow Statement",
      subtitle: "Cash generated and used in the period",
      from:     dateFilter.from,
      to:       dateFilter.to,
      currency: settings.currency || "AED",
      trn:      settings.trn,
    }),

    !hasCashAccounts && React.createElement("div", {
      style: { padding: "24px", background: RPT.amberBg, border: "1px solid " + RPT.rule, borderRadius: 8, marginBottom: 18, color: RPT.amber, fontSize: 13 }
    }, "No cash or bank accounts found. Create Asset accounts with codes starting with 10 (e.g. 1001 — Main Bank Account) to generate this report."),

    React.createElement(RptKPIBar, { cards: kpis }),

    React.createElement("div", {
      style: { border: "1px solid " + RPT.rule, borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden", marginBottom: 0 }
    },

      // Cash accounts summary
      cashAccounts.length > 0 && React.createElement("div", { style: { padding: "16px 24px", background: RPT.bgAlt, borderBottom: "1px solid " + RPT.rule } },
        React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.13em", color: RPT.muted, marginBottom: 8 } }, "Cash & Bank Accounts"),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 12 } },
          cashAccounts.map(function(a) {
            var bal = accountBalance(a, toDateLedger);
            return React.createElement("div", {
              key: a.id,
              style: { padding: "8px 14px", background: "#fff", border: "1px solid " + RPT.rule, borderRadius: 8, fontSize: 12 }
            },
              React.createElement("div", { style: { fontSize: 10, color: RPT.muted, marginBottom: 2 } }, a.code + " · " + a.name),
              React.createElement("div", { style: { fontWeight: 700, color: bal >= 0 ? RPT.green : RPT.red, fontVariantNumeric: "tabular-nums" } }, fmtAED(bal))
            );
          })
        )
      ),

      SectionTable("Operating Activities", RPT.green, opLines, operating, "No operating cash flows in this period"),
      SectionTable("Investing Activities", RPT.blue, invLines, investing, "No investing cash flows in this period"),
      SectionTable("Financing Activities", RPT.purple, finLines, financing, "No financing cash flows in this period"),

      // Reconciliation footer
      React.createElement("div", {
        style: Object.assign({}, PC, {
          background: RPT.navy,
          padding: "20px 24px",
          pageBreakInside: "avoid",
        })
      },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
          React.createElement("tbody", null,
            [
              { label: "Opening Cash Balance",          value: openingCash,  color: "rgba(255,255,255,0.75)" },
              { label: "+ Net Cash from Operations",     value: operating,    color: operating  >= 0 ? "#6EE7B7" : "#FCA5A5" },
              { label: "+ Net Cash from Investing",      value: investing,    color: investing  >= 0 ? "#93C5FD" : "#FCA5A5" },
              { label: "+ Net Cash from Financing",      value: financing,    color: financing  >= 0 ? "#C4B5FD" : "#FCA5A5" },
            ].map(function(row, i) {
              return React.createElement("tr", { key: i },
                React.createElement("td", { style: { padding: "5px 0", fontSize: 12, color: "rgba(255,255,255,0.6)" } }, row.label),
                React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 600, color: row.color, whiteSpace: "nowrap" } }, fmtAED(row.value))
              );
            })
          )
        ),
        React.createElement("div", { style: { borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" } }, "Closing Cash Balance"),
          React.createElement("div", { style: { fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 800, color: closingCash >= 0 ? "#6EE7B7" : "#FCA5A5", letterSpacing: "-0.02em" } },
            fmtAED(closingCash)
          )
        )
      )
    )
  );
}

/* ════════════════════════════════════════════════════════
   STATEMENT OF CHANGES IN EQUITY  (screen)
   ════════════════════════════════════════════════════════ */
function EquityReport(props) {
  var accounts       = props.accounts       || [];
  var filteredLedger = props.filteredLedger || {};
  var openingLedger  = props.openingLedger  || {};
  var toDateLedger   = props.toDateLedger   || {};
  var totalRev       = props.totalRev       || 0;
  var totalExp       = props.totalExp       || 0;
  var dateFilter     = props.dateFilter     || {};
  var settings       = props.settings       || {};

  var company   = settings.company   || "Nasama Properties";
  var netIncome = totalRev - totalExp;

  var equityAccounts = accounts.filter(function(a) { return a.type === "Equity"; });

  // Classify equity accounts
  function isCapital(a)  { return /capital/i.test(a.name || ""); }
  function isDrawing(a)  { return /drawing|draw|withdrawal/i.test(a.name || ""); }
  function isRetained(a) { return /retained|reserve|profit/i.test(a.name || ""); }

  var capitalAccts  = equityAccounts.filter(isCapital);
  var drawingAccts  = equityAccounts.filter(function(a) { return isDrawing(a) && !isCapital(a); });
  var retainedAccts = equityAccounts.filter(function(a) { return isRetained(a) && !isCapital(a) && !isDrawing(a); });
  var otherEquity   = equityAccounts.filter(function(a) { return !isCapital(a) && !isDrawing(a) && !isRetained(a); });

  function sumBalances(accts, ledger) {
    return accts.reduce(function(s, a) { return s + accountBalance(a, ledger); }, 0);
  }

  // Opening balances (before period)
  var openCapital  = sumBalances(capitalAccts,  openingLedger);
  var openDrawings = sumBalances(drawingAccts,  openingLedger);
  var openRetained = sumBalances(retainedAccts, openingLedger);
  var openOther    = sumBalances(otherEquity,   openingLedger);
  var openTotal    = sumBalances(equityAccounts, openingLedger);

  // Period movements
  var perCapital  = sumBalances(capitalAccts,  filteredLedger);
  var perDrawings = sumBalances(drawingAccts,  filteredLedger);
  var perOther    = sumBalances(otherEquity,   filteredLedger);

  // Closing balances
  var closeCapital  = sumBalances(capitalAccts,  toDateLedger);
  var closeDrawings = sumBalances(drawingAccts,  toDateLedger);
  var closeRetained = sumBalances(retainedAccts, toDateLedger);
  var closeOther    = sumBalances(otherEquity,   toDateLedger);
  var closeTotal    = sumBalances(equityAccounts, toDateLedger) + netIncome;

  var kpis = [
    { label: "Opening Equity",       value: fmtAED(openTotal),   color: RPT.blue  },
    { label: "Capital Introduced",   value: fmtAED(perCapital),  color: RPT.green },
    { label: "Net Income / (Loss)",  value: fmtAED(netIncome),   color: netIncome >= 0 ? RPT.green : RPT.red },
    { label: "Closing Equity",       value: fmtAED(closeTotal),  color: RPT.navy, big: true },
  ];

  function EqCell(val, highlight) {
    return React.createElement("td", {
      style: {
        textAlign: "right", padding: "11px 16px",
        fontVariantNumeric: "tabular-nums",
        fontSize: 13, fontWeight: highlight ? 700 : 500,
        color: highlight ? RPT.ink : RPT.textHeavy,
        borderBottom: "1px solid " + RPT.rule,
        whiteSpace: "nowrap",
      }
    }, React.createElement("span", null,
      React.createElement("span", { style: { fontSize: 10, color: RPT.subtle, marginRight: 3 } }, "AED"),
      ((val || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ));
  }

  function EqRow(label, openVal, periodVal, netIncVal, closeVal, isBold) {
    var rowStyle = {
      fontWeight: isBold ? 700 : 500,
      background: isBold ? RPT.bgSection : "transparent",
    };
    var nameTd = {
      padding: "11px 16px", fontSize: isBold ? 13 : 13,
      color: isBold ? RPT.ink : RPT.textHeavy,
      fontWeight: isBold ? 700 : 500,
      borderBottom: "1px solid " + RPT.rule,
      borderTop: isBold ? "1.5px solid " + RPT.ruleDk : "none",
    };
    var amtTd = Object.assign({ borderTop: isBold ? "1.5px solid " + RPT.ruleDk : "none" });
    return React.createElement("tr", null,
      React.createElement("td", { style: nameTd }, label),
      EqCell(openVal,   isBold),
      EqCell(periodVal, isBold),
      EqCell(netIncVal, isBold),
      EqCell(closeVal,  isBold)
    );
  }

  var hasEquity = equityAccounts.length > 0;

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },

    React.createElement(RptHeader, {
      company:  company,
      title:    "Statement of Changes in Equity",
      subtitle: "Movement in owners' equity for the period",
      from:     dateFilter.from,
      to:       dateFilter.to,
      currency: settings.currency || "AED",
      trn:      settings.trn,
    }),

    !hasEquity && React.createElement("div", {
      style: { padding: "24px", background: RPT.amberBg, border: "1px solid " + RPT.rule, borderRadius: 8, marginBottom: 18, color: RPT.amber, fontSize: 13 }
    }, "No equity accounts found. Create accounts of type 'Equity' to generate this report."),

    React.createElement(RptKPIBar, { cards: kpis }),

    React.createElement("div", {
      style: { border: "1px solid " + RPT.rule, borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }
    },

      React.createElement(RptSectionLabel, { label: "Equity Movement Schedule", color: RPT.purple }),

      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
        React.createElement("colgroup", null,
          React.createElement("col", null),
          React.createElement("col", { style: { width: 160 } }),
          React.createElement("col", { style: { width: 160 } }),
          React.createElement("col", { style: { width: 160 } }),
          React.createElement("col", { style: { width: 160 } })
        ),
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS() }, "Component"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Opening Balance"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Movement"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Net Income"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Closing Balance")
          )
        ),
        React.createElement("tbody", null,
          capitalAccts.length > 0  && EqRow("Capital / Paid-in Capital", openCapital,  perCapital,  0,          closeCapital),
          drawingAccts.length > 0  && EqRow("Drawings",                  -openDrawings, -perDrawings, 0,         -closeDrawings),
          retainedAccts.length > 0 && EqRow("Retained Earnings",         openRetained, 0,            0,          closeRetained),
          React.createElement("tr", null,
            React.createElement("td", { style: { padding: "11px 16px", fontSize: 13, color: RPT.textHeavy, borderBottom: "1px solid " + RPT.rule } }, "Net Income / (Loss) for Period"),
            EqCell(0),
            EqCell(0),
            EqCell(netIncome),
            EqCell(netIncome)
          ),
          otherEquity.length > 0 && EqRow("Other Equity",               openOther,    perOther,    0,          closeOther)
        ),
        React.createElement("tfoot", null,
          EqRow("TOTAL EQUITY", openTotal, perCapital - perDrawings + perOther, netIncome, closeTotal, true)
        )
      ),

      // Note block
      React.createElement("div", { style: { padding: "14px 24px", background: RPT.bgAlt, borderTop: "1px solid " + RPT.rule } },
        React.createElement("div", { style: { fontSize: 11, color: RPT.muted, lineHeight: 1.6 } },
          React.createElement("span", { style: { fontWeight: 700, color: RPT.text } }, "Note: "),
          "Net income for the period is derived from the Profit & Loss statement and represents the increase in retained earnings before any distribution to owners. Drawings reduce equity directly."
        )
      )
    )
  );
}

/* ════════════════════════════════════════════════════════
   NOTES TO FINANCIAL STATEMENTS  (screen)
   ════════════════════════════════════════════════════════ */
function NotesReport(props) {
  var accounts       = props.accounts       || [];
  var filteredLedger = props.filteredLedger || {};
  var toDateLedger   = props.toDateLedger   || {};
  var filteredTxns   = props.filteredTxns   || [];
  var totalRev       = props.totalRev       || 0;
  var totalExp       = props.totalExp       || 0;
  var totalAssets    = props.totalAssets    || 0;
  var totalLiabilities = props.totalLiabilities || 0;
  var totalEquity    = props.totalEquity    || 0;
  var dateFilter     = props.dateFilter     || {};
  var settings       = props.settings       || {};

  var company  = settings.company  || "Nasama Properties";
  var currency = settings.currency || "AED";
  var trn      = settings.trn      || "";
  var netIncome = totalRev - totalExp;

  var generated = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  var periodLabel = dateFilter.from && dateFilter.to
    ? (fmtDate(dateFilter.from) + " to " + fmtDate(dateFilter.to))
    : dateFilter.to ? ("As of " + fmtDate(dateFilter.to)) : "All periods";

  // Revenue breakdown
  var revenueAccts = accounts.filter(function(a) { return a.type === "Revenue" && accountBalance(a, filteredLedger) !== 0; })
    .sort(function(a, b) { return accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger); });

  // Expense breakdown
  var expenseAccts = accounts.filter(function(a) { return a.type === "Expense" && accountBalance(a, filteredLedger) !== 0; })
    .sort(function(a, b) { return accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger); });

  // Cash accounts
  var cashAccts = accounts.filter(isCashAccount);
  var totalCash = cashAccts.reduce(function(s, a) { return s + accountBalance(a, toDateLedger); }, 0);

  // Liability accounts
  var liabilityAccts = accounts.filter(function(a) { return a.type === "Liability" && accountBalance(a, toDateLedger) !== 0; });

  // Largest expense
  var largestExp = expenseAccts.length > 0 ? expenseAccts[0] : null;

  function NoteCard(number, title, children) {
    return React.createElement("div", {
      style: {
        background: "#fff", border: "1px solid " + RPT.rule, borderRadius: 10,
        marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(16,24,40,.04)",
      }
    },
      React.createElement("div", {
        style: {
          background: RPT.bgSection, borderBottom: "1px solid " + RPT.rule,
          padding: "12px 20px", display: "flex", alignItems: "center", gap: 10,
        }
      },
        React.createElement("div", {
          style: {
            width: 26, height: 26, borderRadius: "50%",
            background: RPT.navy, color: "#fff",
            fontSize: 11, fontWeight: 800, display: "flex",
            alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }
        }, number),
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: RPT.ink } }, title)
      ),
      React.createElement("div", { style: { padding: "16px 20px" } }, children)
    );
  }

  function InfoRow(label, value, bold) {
    return React.createElement("div", {
      style: {
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "6px 0", borderBottom: "1px solid " + RPT.rule,
        fontSize: 13, gap: 12,
      }
    },
      React.createElement("span", { style: { color: RPT.muted, flexShrink: 0 } }, label),
      React.createElement("span", { style: { fontWeight: bold ? 700 : 500, color: RPT.textHeavy, textAlign: "right" } }, value)
    );
  }

  function PolicyItem(text) {
    return React.createElement("div", {
      style: { display: "flex", gap: 10, padding: "5px 0", fontSize: 13, color: RPT.text, lineHeight: 1.55 }
    },
      React.createElement("span", { style: { color: RPT.gold, fontWeight: 700, flexShrink: 0 } }, "•"),
      text
    );
  }

  function AcctBreakdownTable(rows, ledger) {
    if (rows.length === 0) {
      return React.createElement("div", { style: { fontSize: 12, color: RPT.subtle, fontStyle: "italic", padding: "8px 0" } }, "No activity in this period.");
    }
    return React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      React.createElement("thead", null,
        React.createElement("tr", null,
          React.createElement("th", { style: thS({ width: 80 }) }, "Code"),
          React.createElement("th", { style: thS() }, "Account"),
          React.createElement("th", { style: thS({ textAlign: "right" }) }, "Amount (AED)")
        )
      ),
      React.createElement("tbody", null,
        rows.map(function(a) {
          var bal = accountBalance(a, ledger);
          return React.createElement("tr", { key: a.id },
            React.createElement("td", { style: { padding: "8px 16px", fontSize: 11, color: RPT.subtle, fontFamily: "ui-monospace,monospace", borderBottom: "1px solid " + RPT.rule } }, a.code),
            React.createElement("td", { style: { padding: "8px 16px", color: RPT.textHeavy, borderBottom: "1px solid " + RPT.rule } }, a.name),
            React.createElement("td", { style: { padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: RPT.textHeavy, borderBottom: "1px solid " + RPT.rule, whiteSpace: "nowrap" } },
              ((bal || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            )
          );
        })
      )
    );
  }

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },

    React.createElement(RptHeader, {
      company:  company,
      title:    "Notes to Financial Statements",
      subtitle: "Supplementary disclosures and accounting policies",
      from:     dateFilter.from,
      to:       dateFilter.to,
      currency: currency,
      trn:      trn,
    }),

    // Note 1 — General Information
    NoteCard("1", "General Information",
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 } },
        React.createElement("div", null,
          InfoRow("Company Name",     company),
          InfoRow("Reporting Currency", currency),
          trn && InfoRow("Tax Registration No.", trn),
          InfoRow("Reporting Period", periodLabel),
          InfoRow("Report Generated", generated),
          InfoRow("Total Transactions", filteredTxns.length.toString()),
        ),
        React.createElement("div", null,
          InfoRow("Total Accounts",     accounts.length.toString()),
          InfoRow("Asset Accounts",     accounts.filter(function(a) { return a.type === "Asset";     }).length.toString()),
          InfoRow("Liability Accounts", accounts.filter(function(a) { return a.type === "Liability"; }).length.toString()),
          InfoRow("Equity Accounts",    accounts.filter(function(a) { return a.type === "Equity";    }).length.toString()),
          InfoRow("Revenue Accounts",   accounts.filter(function(a) { return a.type === "Revenue";   }).length.toString()),
          InfoRow("Expense Accounts",   accounts.filter(function(a) { return a.type === "Expense";   }).length.toString()),
        )
      )
    ),

    // Note 2 — Basis of Preparation
    NoteCard("2", "Basis of Preparation & Accounting Policies",
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 13, color: RPT.text, lineHeight: 1.65, marginBottom: 14 } },
          "These financial statements have been prepared in accordance with generally accepted accounting principles (GAAP) on a cash/accrual basis using the double-entry bookkeeping method. All amounts are stated in UAE Dirhams (AED) unless otherwise indicated."
        ),
        PolicyItem("Revenue Recognition: Revenue is recognised when earned and collected in accordance with the terms of each transaction."),
        PolicyItem("Expenses: Expenses are recognised in the period in which they are incurred."),
        PolicyItem("Cash & Bank: Cash and bank balances represent actual funds held in bank accounts and petty cash as at the reporting date."),
        PolicyItem("VAT: The entity is registered for UAE Value Added Tax (VAT) and accounts for VAT on each applicable transaction. VAT is reported separately to the Federal Tax Authority."),
        PolicyItem("Fixed Assets: Fixed assets are recorded at cost less accumulated depreciation where applicable."),
      )
    ),

    // Note 3 — Cash & Bank
    NoteCard("3", "Cash and Bank Balances",
      React.createElement("div", null,
        cashAccts.length === 0
          ? React.createElement("div", { style: { fontSize: 12, color: RPT.subtle, fontStyle: "italic" } }, "No cash or bank accounts configured.")
          : React.createElement("div", null,
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 } },
                React.createElement("thead", null,
                  React.createElement("tr", null,
                    React.createElement("th", { style: thS({ width: 80 }) }, "Code"),
                    React.createElement("th", { style: thS() }, "Account"),
                    React.createElement("th", { style: thS({ textAlign: "right" }) }, "Balance (AED)")
                  )
                ),
                React.createElement("tbody", null,
                  cashAccts.map(function(a) {
                    var bal = accountBalance(a, toDateLedger);
                    return React.createElement("tr", { key: a.id },
                      React.createElement("td", { style: { padding: "8px 16px", fontSize: 11, color: RPT.subtle, fontFamily: "ui-monospace,monospace", borderBottom: "1px solid " + RPT.rule } }, a.code),
                      React.createElement("td", { style: { padding: "8px 16px", color: RPT.textHeavy, borderBottom: "1px solid " + RPT.rule } }, a.name),
                      React.createElement("td", { style: { padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: bal >= 0 ? RPT.green : RPT.red, borderBottom: "1px solid " + RPT.rule, whiteSpace: "nowrap" } },
                        ((bal || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      )
                    );
                  })
                ),
                React.createElement("tfoot", null,
                  React.createElement(TotalRow, { label: "Total Cash & Bank", amount: totalCash, color: RPT.green, cols: 2 })
                )
              )
            )
      )
    ),

    // Note 4 — Revenue
    NoteCard("4", "Revenue",
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 12, color: RPT.muted, marginBottom: 10 } }, "Revenue by account for the reporting period:"),
        AcctBreakdownTable(revenueAccts, filteredLedger),
        totalRev > 0 && React.createElement("div", { style: { marginTop: 12, padding: "10px 14px", background: RPT.greenBg, borderRadius: 6, fontSize: 13 } },
          React.createElement("span", { style: { color: RPT.muted } }, "Total Revenue: "),
          React.createElement("span", { style: { fontWeight: 700, color: RPT.green, fontVariantNumeric: "tabular-nums" } }, fmtAED(totalRev))
        )
      )
    ),

    // Note 5 — Major Expenses
    NoteCard("5", "Expenses",
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 12, color: RPT.muted, marginBottom: 10 } }, "Expenses by account for the reporting period:"),
        AcctBreakdownTable(expenseAccts, filteredLedger),
        totalExp > 0 && React.createElement("div", { style: { marginTop: 12, padding: "10px 14px", background: RPT.amberBg, borderRadius: 6, fontSize: 13 } },
          React.createElement("span", { style: { color: RPT.muted } }, "Total Expenses: "),
          React.createElement("span", { style: { fontWeight: 700, color: RPT.amber, fontVariantNumeric: "tabular-nums" } }, fmtAED(totalExp))
        )
      )
    ),

    // Note 6 — Equity
    NoteCard("6", "Equity",
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 13, color: RPT.text, lineHeight: 1.55, marginBottom: 12 } },
          "Equity represents the residual interest in the assets of the entity after deducting all liabilities. The entity is structured as a single-owner enterprise."
        ),
        AcctBreakdownTable(
          accounts.filter(function(a) { return a.type === "Equity" && accountBalance(a, toDateLedger) !== 0; }),
          toDateLedger
        ),
        React.createElement("div", { style: { marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" } },
          [
            { label: "Total Equity (Balance Sheet)", value: fmtAED(totalEquity), color: RPT.navy },
            { label: "Net Income / (Loss)",           value: fmtAED(netIncome),  color: netIncome >= 0 ? RPT.green : RPT.red },
          ].map(function(item, i) {
            return React.createElement("div", { key: i, style: { padding: "10px 16px", background: RPT.bgSection, borderRadius: 8, border: "1px solid " + RPT.rule } },
              React.createElement("div", { style: { fontSize: 11, color: RPT.muted, marginBottom: 4 } }, item.label),
              React.createElement("div", { style: { fontSize: 15, fontWeight: 800, color: item.color, fontVariantNumeric: "tabular-nums" } }, item.value)
            );
          })
        )
      )
    ),

    // Note 7 — Liabilities
    liabilityAccts.length > 0 && NoteCard("7", "Liabilities",
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 12, color: RPT.muted, marginBottom: 10 } }, "Outstanding liabilities as at end of reporting period:"),
        AcctBreakdownTable(liabilityAccts, toDateLedger),
        React.createElement("div", { style: { marginTop: 12, padding: "10px 14px", background: RPT.redBg, borderRadius: 6, fontSize: 13 } },
          React.createElement("span", { style: { color: RPT.muted } }, "Total Liabilities: "),
          React.createElement("span", { style: { fontWeight: 700, color: RPT.red, fontVariantNumeric: "tabular-nums" } }, fmtAED(totalLiabilities))
        )
      )
    ),

    // Note 8 — Other Information
    NoteCard(liabilityAccts.length > 0 ? "8" : "7", "Other Disclosures",
      React.createElement("div", null,
        PolicyItem("These financial statements have not been audited. They represent management accounts prepared from the company's accounting records."),
        PolicyItem("The company operates under UAE law and is subject to UAE Federal Tax Authority regulations including VAT legislation."),
        PolicyItem("There are no contingent liabilities or material post-balance sheet events known to management at the time of preparation, unless specifically disclosed above."),
        PolicyItem("Comparative figures for prior periods are available through the system's date filter and are not presented in these notes."),
        React.createElement("div", { style: { marginTop: 12, padding: "12px 16px", background: RPT.bgAlt, borderRadius: 8, border: "1px solid " + RPT.rule, fontSize: 12, color: RPT.muted, lineHeight: 1.6 } },
          React.createElement("span", { style: { fontWeight: 700, color: RPT.text } }, "Prepared by: "),
          "Nasama Properties Accounting System v2 · " + generated
        )
      )
    )
  );
}
