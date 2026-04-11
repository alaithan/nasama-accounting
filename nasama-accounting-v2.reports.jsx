/* ════════════════════════════════════════════════════════
   NASAMA PROPERTIES — PRINTABLE FINANCIAL REPORTS
   Premium Corporate Design · Audit-Ready Layout
   ════════════════════════════════════════════════════════ */

// ── PRINT TRIGGER ────────────────────────────────────────
function rptPrint(landscape) {
  // Remove any stale landscape override first
  var old = document.getElementById('__rpt_landscape__');
  if (old) old.remove();

  var styleEl = null;
  if (landscape) {
    styleEl = document.createElement('style');
    styleEl.id = '__rpt_landscape__';
    styleEl.textContent = '@media print { @page { size: A4 landscape; margin: 12mm 15mm 22mm; } }';
    document.head.appendChild(styleEl);
  }

  // Delay so the injected @page rule is fully parsed before the print dialog opens.
  // 400ms is more reliable than 120ms for Microsoft Print to PDF.
  setTimeout(function () {
    window.print();
    if (styleEl) {
      setTimeout(function () {
        var el = document.getElementById('__rpt_landscape__');
        if (el) el.remove();
      }, 3000);
    }
  }, 400);
}

// ── DESIGN TOKENS ────────────────────────────────────────
var RPT = {
  // Core brand
  navy:       "#0C0F1E",
  navyMid:    "#141829",
  navyAccent: "#1E2540",
  gold:       "#C9A044",
  goldBright: "#DFB455",
  goldD:      "#A8853A",

  // Text
  ink:        "#0F1623",
  textHeavy:  "#1A1F36",
  text:       "#374151",
  muted:      "#6B7280",
  subtle:     "#9CA3AF",
  pale:       "#C4C9D4",

  // Structure
  rule:       "#E5E7EB",
  ruleMd:     "#D1D5DB",
  ruleDk:     "#6B7280",

  // Backgrounds
  bg:         "#FFFFFF",
  bgPage:     "#F8F9FB",
  bgAlt:      "#FAFAFA",
  bgSection:  "#F3F5F8",

  // Semantic
  green:      "#059669",
  greenBg:    "#ECFDF5",
  red:        "#DC2626",
  redBg:      "#FEF2F2",
  blue:       "#1D4ED8",
  blueBg:     "#EFF6FF",
  purple:     "#6D28D9",
  purpleBg:   "#F5F3FF",
  amber:      "#B45309",
  amberBg:    "#FFFBEB",

  // Layout aliases (back-compat)
  fSm:   11,
  fBase: 13,
  fMd:   13,
  fLg:   14,
  fXl:   18,
  fXxl:  24,

  // Cell padding
  cPad:  "11px 16px",
  hPad:  "10px 16px",
};

// ── PRINT COLOUR PRESERVATION ────────────────────────────
var PC = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust:        "exact",
};

// ── TABLE COLUMN WIDTHS ──────────────────────────────────
var COL_CODE   = { width: 80,  minWidth: 70  };
var COL_AMOUNT = { width: 180, minWidth: 160 };

/* ════════════════════════════════════════════════════════
   REPORT HEADER
   ════════════════════════════════════════════════════════ */
function RptHeader(props) {
  var company  = props.company  || "Nasama Properties";
  var title    = props.title    || "Report";
  var subtitle = props.subtitle || "";
  var from     = props.from;
  var to       = props.to;
  var currency = props.currency || "AED";
  var trn      = props.trn;

  var periodLabel = from && to
    ? (fmtDate(from) + "\u2009\u2013\u2009" + fmtDate(to))
    : to
      ? ("As of " + fmtDate(to))
      : "All Periods";

  var generated = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  // Build meta row items
  var meta = [
    { k: "Period",    v: periodLabel },
    { k: "Currency",  v: currency },
  ];
  if (trn) meta.push({ k: "TRN", v: trn });
  meta.push({ k: "Generated", v: generated });

  return React.createElement("div", {
    style: Object.assign({}, PC, {
      background: RPT.navy,
      borderRadius: "10px 10px 0 0",
      overflow: "hidden",
    })
  },

    /* ── Gold accent stripe at top */
    React.createElement("div", {
      style: Object.assign({}, PC, {
        height: 4,
        background: "linear-gradient(90deg, " + RPT.gold + " 0%, " + RPT.goldBright + " 40%, " + RPT.goldD + " 100%)",
      })
    }),

    /* ── Main header body */
    React.createElement("div", {
      style: {
        padding: "24px 32px 22px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 20,
      }
    },

      /* Left: identity + title */
      React.createElement("div", { style: { flex: 1 } },

        /* Company name */
        React.createElement("div", {
          style: {
            fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: RPT.gold,
            marginBottom: 10,
            display: "flex", alignItems: "center", gap: 8,
          }
        },
          React.createElement("span", {
            style: Object.assign({}, PC, {
              display: "inline-block", width: 18, height: 2,
              background: RPT.gold, verticalAlign: "middle",
            })
          }),
          company
        ),

        /* Report title */
        React.createElement("div", {
          style: {
            fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em",
            lineHeight: 1.05, color: "#FFFFFF",
            marginBottom: subtitle ? 8 : 18,
          }
        }, title),

        /* Subtitle */
        subtitle && React.createElement("div", {
          style: {
            fontSize: 12, color: "#7B85AE",
            marginBottom: 18, letterSpacing: "0.01em",
          }
        }, subtitle),

        /* Meta row */
        React.createElement("div", {
          style: {
            display: "flex", flexWrap: "wrap", gap: 0,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
          }
        },
          meta.map(function (m, i) {
            return React.createElement("div", {
              key: i,
              style: {
                display: "flex", alignItems: "baseline", gap: 5,
                paddingRight: 20,
                marginRight: 20,
                borderRight: i < meta.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                marginBottom: 2,
              }
            },
              React.createElement("span", {
                style: {
                  fontSize: 9.5, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  color: RPT.gold, flexShrink: 0,
                }
              }, m.k + ":"),
              React.createElement("span", {
                style: { fontSize: 11.5, color: "#9AA0C8", lineHeight: 1.4 }
              }, m.v)
            );
          })
        )
      ),

      /* Right: Logo badge */
      React.createElement("div", {
        style: {
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8, flexShrink: 0,
        }
      },
        React.createElement("div", {
          style: Object.assign({}, PC, {
            width: 56, height: 56, borderRadius: 10,
            background: "rgba(201,160,68,0.15)",
            border: "1px solid rgba(201,160,68,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          })
        },
          React.createElement(Logo, { size: 34, style: { filter: "brightness(1.1)" } })
        ),
        React.createElement("span", {
          style: {
            fontSize: 8.5, color: "#3B4270",
            letterSpacing: "0.18em", textTransform: "uppercase",
          }
        }, "Accounting v2")
      )
    )
  );
}

/* ════════════════════════════════════════════════════════
   KPI SUMMARY CARDS
   ════════════════════════════════════════════════════════ */
function RptKPIBar(props) {
  var cards = props.cards || [];

  return React.createElement("div", {
    style: Object.assign({}, PC, {
      display: "flex",
      background: RPT.bgPage,
      borderLeft:   "1px solid " + RPT.rule,
      borderRight:  "1px solid " + RPT.rule,
      borderBottom: "1px solid " + RPT.rule,
    })
  },
    cards.map(function (card, i) {
      var accentColor = card.color || RPT.text;

      return React.createElement("div", {
        key: i,
        style: Object.assign({}, PC, {
          flex: "1 1 0",
          padding: "20px 22px 18px",
          borderRight: i < cards.length - 1 ? "1px solid " + RPT.rule : "none",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minWidth: 0,
          position: "relative",
          overflow: "hidden",
        })
      },

        /* Colored top indicator bar */
        React.createElement("div", {
          style: Object.assign({}, PC, {
            position: "absolute", top: 0, left: 0, right: 0,
            height: 3,
            background: accentColor,
          })
        }),

        /* Label */
        React.createElement("div", {
          style: {
            fontSize: 9.5, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.13em",
            color: RPT.muted, marginBottom: 10, marginTop: 2,
          }
        }, card.label),

        /* Value */
        React.createElement("div", {
          style: {
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }
        },
          /* "AED" prefix on its own line if value starts with "AED" */
          card.value && card.value.startsWith && card.value.startsWith("AED ")
            ? React.createElement("div", null,
                React.createElement("div", {
                  style: { fontSize: 10.5, fontWeight: 600, color: RPT.muted, letterSpacing: "0.04em", marginBottom: 2 }
                }, "AED"),
                React.createElement("div", {
                  style: {
                    fontSize: 22, fontWeight: 800,
                    color: accentColor, lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }
                }, card.value.replace("AED ", ""))
              )
            : React.createElement("div", {
                style: {
                  fontSize: card.big ? 22 : 18,
                  fontWeight: 800,
                  color: accentColor,
                  letterSpacing: "-0.02em",
                }
              }, card.value)
        ),

        /* Sub-text */
        card.sub && React.createElement("div", {
          style: {
            fontSize: 10, color: RPT.subtle, marginTop: 6,
            borderTop: "1px solid " + RPT.rule, paddingTop: 5,
          }
        }, card.sub)
      );
    })
  );
}

/* ════════════════════════════════════════════════════════
   REPORT ACTIONS (hidden in print)
   ════════════════════════════════════════════════════════ */
function RptActions(props) {
  return React.createElement("div", {
    className: "no-print",
    style: { display: "flex", gap: 8, alignItems: "center" }
  },
    React.createElement("button", {
      onClick: props.onPrint,
      style: {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: RPT.navy, color: "#fff", border: "none", cursor: "pointer",
      }
    }, "\uD83D\uDDA8\uFE0F Print"),
    React.createElement("button", {
      onClick: props.onPDF,
      style: {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: RPT.gold, color: "#fff", border: "none", cursor: "pointer",
      }
    }, "\uD83D\uDCC4 Export PDF"),
    React.createElement("span", {
      style: { fontSize: 11, color: RPT.muted }
    }, "Select \u201CSave as PDF\u201D in the print dialog")
  );
}

/* ════════════════════════════════════════════════════════
   SECTION LABEL
   ════════════════════════════════════════════════════════ */
function RptSectionLabel(props) {
  var label = props.label;
  var color = props.color || RPT.text;

  return React.createElement("div", {
    style: {
      padding: "28px 24px 0",
      pageBreakAfter: "avoid",
    }
  },
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 10,
        paddingBottom: 10,
        borderBottom: "1.5px solid " + color,
      }
    },
      /* Small dot accent */
      React.createElement("div", {
        style: Object.assign({}, PC, {
          width: 8, height: 8, borderRadius: "50%",
          background: color, flexShrink: 0,
        })
      }),
      /* Label text */
      React.createElement("span", {
        style: {
          fontSize: 10.5, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: RPT.ink,
        }
      }, label)
    )
  );
}

/* ════════════════════════════════════════════════════════
   SHARED TABLE PRIMITIVES
   ════════════════════════════════════════════════════════ */
function thS(extra) {
  return Object.assign({}, PC, {
    padding:         "11px 16px",
    background:      RPT.bgSection,
    fontSize:        10,
    fontWeight:      700,
    textTransform:   "uppercase",
    letterSpacing:   "0.1em",
    color:           RPT.text,
    borderBottom:    "1px solid " + RPT.ruleMd,
    borderTop:       "1px solid " + RPT.rule,
    whiteSpace:      "nowrap",
  }, extra || {});
}

var tdCode = {
  padding:     "11px 16px",
  fontSize:    11,
  fontFamily:  "ui-monospace, 'SF Mono', Consolas, monospace",
  color:       RPT.subtle,
  borderBottom: "1px solid " + RPT.rule,
  whiteSpace:  "nowrap",
  verticalAlign: "middle",
};
var tdName = {
  padding:     "11px 16px",
  fontSize:    13,
  color:       RPT.textHeavy,
  borderBottom: "1px solid " + RPT.rule,
  verticalAlign: "middle",
};

/* ── Amount cell */
function AmtCell(props) {
  var amount = props.amount != null ? props.amount : 0;
  var color  = props.color;
  var bold   = props.bold;
  var size   = props.size;
  var noBorder = props.noBorder;

  // Split "AED" prefix from the number for cleaner presentation
  var full = fmtAED(amount);
  var parts = full.match(/^(AED)\s(.+)$/);

  return React.createElement("td", {
    style: {
      textAlign:          "right",
      padding:            "11px 16px",
      fontVariantNumeric: "tabular-nums",
      fontWeight:         bold ? 700 : 500,
      fontSize:           size  || 13,
      color:              color || RPT.textHeavy,
      whiteSpace:         "nowrap",
      borderBottom:       noBorder ? "none" : "1px solid " + RPT.rule,
      verticalAlign:      "middle",
    }
  },
    parts
      ? React.createElement("span", null,
          React.createElement("span", { style: { fontSize: 10, color: bold ? color : RPT.subtle, marginRight: 3 } }, parts[1]),
          parts[2]
        )
      : full
  );
}

/* ── Total footer row (accounting-convention double-line emphasis) */
function TotalRow(props) {
  var label  = props.label;
  var amount = props.amount;
  var color  = props.color || RPT.text;
  var cols   = props.cols  || 2;
  var isGrand = props.isGrand; // double-rule below

  var cellBase = Object.assign({}, PC, {
    padding:    "12px 16px",
    background: RPT.bgSection,
    borderTop:  "1.5px solid " + RPT.ruleDk,
    borderBottom: isGrand ? "3px double " + RPT.ink : "1.5px solid " + RPT.ruleDk,
    fontWeight: 700,
  });

  return React.createElement("tr", null,
    React.createElement("td", {
      colSpan: cols,
      style: Object.assign({}, cellBase, {
        fontSize: 13,
        color: RPT.ink,
        letterSpacing: "0.01em",
      })
    }, label),
    React.createElement("td", {
      style: Object.assign({}, cellBase, {
        textAlign: "right",
        fontSize: 14,
        color: color,
        fontVariantNumeric: "tabular-nums",
      })
    },
      /* Split AED from amount for cleaner total rendering */
      (function () {
        var full = fmtAED(amount);
        var parts = full.match(/^(AED)\s(.+)$/);
        if (!parts) return full;
        return React.createElement("span", null,
          React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, marginRight: 3, color: RPT.muted } }, parts[1]),
          parts[2]
        );
      })()
    )
  );
}

/* ════════════════════════════════════════════════════════
   PRINT PAGE FOOTER  (fixed position — appears on every page)
   ════════════════════════════════════════════════════════ */
function RptPageFooter(props) {
  var company = props.company || "Nasama Properties";
  var title   = props.title   || "Financial Report";

  return React.createElement("div", {
    className: "rpt-page-footer",
    style: { display: "none" }, // CSS overrides this in @media print
  },
    React.createElement("span", null, company + " \u00B7 " + title),
    React.createElement("span", null, "Nasama Properties Accounting System v2")
  );
}

/* ════════════════════════════════════════════════════════
   PROFIT & LOSS REPORT
   ════════════════════════════════════════════════════════ */
function PLReport(props) {
  var accounts       = props.accounts       || [];
  var filteredLedger = props.filteredLedger || {};
  var totalRev       = props.totalRev       || 0;
  var totalExp       = props.totalExp       || 0;
  var dateFilter     = props.dateFilter     || {};
  var settings       = props.settings       || {};

  var netIncome = totalRev - totalExp;
  var netColor  = netIncome >= 0 ? RPT.green : RPT.red;
  var netBg     = netIncome >= 0 ? RPT.greenBg : RPT.redBg;

  var revenueRows = accounts.filter(function (a) {
    return a.type === "Revenue" && accountBalance(a, filteredLedger) !== 0;
  });
  var expenseRows = accounts.filter(function (a) {
    return a.type === "Expense" && accountBalance(a, filteredLedger) !== 0;
  }).sort(function (a, b) {
    return accountBalance(b, filteredLedger) - accountBalance(a, filteredLedger);
  });

  var kpis = [
    { label: "Total Revenue",  value: fmtAED(totalRev),  color: RPT.green, big: true },
    { label: "Total Expenses", value: fmtAED(totalExp),  color: RPT.amber, big: true },
    { label: "Net Income",     value: fmtAED(netIncome), color: netColor,  big: true },
    {
      label: "Net Margin",
      value: totalRev > 0
        ? ((netIncome / totalRev) * 100).toFixed(1) + "%"
        : "\u2014",
      color: netIncome >= 0 ? RPT.green : RPT.red,
      sub: "Net income \u00F7 Revenue",
    },
  ];

  var company = settings.company || "Nasama Properties";
  var title   = "Profit & Loss Statement";

  /* Shared account row renderer */
  function AccountRows(rowAccts, ledger, emptyMsg) {
    if (rowAccts.length === 0) {
      return React.createElement("tr", null,
        React.createElement("td", {
          colSpan: 3,
          style: { padding: "18px 16px", textAlign: "center", color: RPT.subtle, fontStyle: "italic", fontSize: 12 }
        }, emptyMsg)
      );
    }
    return rowAccts.map(function (a, i) {
      return React.createElement("tr", { key: a.id },
        React.createElement("td", { style: tdCode }, a.code),
        React.createElement("td", { style: tdName }, a.name),
        React.createElement(AmtCell, { amount: accountBalance(a, ledger) })
      );
    });
  }

  return React.createElement("div", {
    style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" }
  },

    /* Header */
    React.createElement(RptHeader, {
      company:  company,
      title:    title,
      subtitle: "Income statement for the selected period",
      from:     dateFilter.from,
      to:       dateFilter.to,
      currency: settings.currency || "AED",
      trn:      settings.trn,
    }),

    /* KPI bar */
    React.createElement(RptKPIBar, { cards: kpis }),

    /* Report body */
    React.createElement("div", {
      style: {
        border:       "1px solid " + RPT.rule,
        borderTop:    "none",
        borderRadius: "0 0 10px 10px",
        overflow:     "hidden",
        marginBottom: 0,
      }
    },

      /* ── REVENUE SECTION */
      React.createElement(RptSectionLabel, { label: "Revenue", color: RPT.green }),

      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
        React.createElement("colgroup", null,
          React.createElement("col", { style: { width: 80 } }),
          React.createElement("col", null),
          React.createElement("col", { style: { width: 180 } })
        ),
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS() }, "Code"),
            React.createElement("th", { style: thS() }, "Account Name"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Amount")
          )
        ),
        React.createElement("tbody", null,
          AccountRows(revenueRows, filteredLedger, "No revenue recorded in this period")
        ),
        React.createElement("tfoot", null,
          React.createElement(TotalRow, { label: "Total Revenue", amount: totalRev, color: RPT.green })
        )
      ),

      /* ── EXPENSES SECTION */
      React.createElement(RptSectionLabel, { label: "Expenses", color: RPT.amber }),

      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
        React.createElement("colgroup", null,
          React.createElement("col", { style: { width: 80 } }),
          React.createElement("col", null),
          React.createElement("col", { style: { width: 180 } })
        ),
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS() }, "Code"),
            React.createElement("th", { style: thS() }, "Account Name"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Amount")
          )
        ),
        React.createElement("tbody", null,
          AccountRows(expenseRows, filteredLedger, "No expenses recorded in this period")
        ),
        React.createElement("tfoot", null,
          React.createElement(TotalRow, { label: "Total Expenses", amount: totalExp, color: RPT.amber, isGrand: true })
        )
      ),

      /* ── NET INCOME CONCLUSION */
      React.createElement("div", {
        style: Object.assign({}, PC, {
          background:        RPT.navy,
          display:           "flex",
          justifyContent:    "space-between",
          alignItems:        "center",
          padding:           "22px 24px",
          pageBreakInside:   "avoid",
        })
      },
        React.createElement("div", null,
          React.createElement("div", {
            style: {
              fontSize: 9.5, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.45)",
              marginBottom: 5,
            }
          }, "Statement Result"),
          React.createElement("div", {
            style: {
              fontSize: 18, fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
            }
          }, "NET INCOME")
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", {
            style: {
              fontSize: 10.5, fontWeight: 600,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }
          }, "AED"),
          React.createElement("div", {
            style: {
              fontSize: 32, fontWeight: 800,
              color: netIncome >= 0 ? RPT.goldBright : "#F87171",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }
          }, fmtAED(netIncome).replace("AED ", ""))
        )
      )
    ),

    /* Print-only page footer */
    React.createElement(RptPageFooter, { company: company, title: title })
  );
}

/* ════════════════════════════════════════════════════════
   BALANCE SHEET REPORT
   ════════════════════════════════════════════════════════ */
function BSReport(props) {
  var accounts         = props.accounts         || [];
  var toDateLedger     = props.toDateLedger     || {};
  var totalAssets      = props.totalAssets      || 0;
  var totalLiabilities = props.totalLiabilities || 0;
  var totalEquity      = props.totalEquity      || 0;
  var netIncome        = props.netIncome        || 0;
  var dateFilter       = props.dateFilter       || {};
  var settings         = props.settings         || {};

  var totalLE    = totalLiabilities + totalEquity + netIncome;
  var isBalanced = Math.abs(totalAssets - totalLE) <= 1;

  var assetRows  = accounts.filter(function (a) { return a.type === "Asset"     && accountBalance(a, toDateLedger) !== 0; });
  var liabRows   = accounts.filter(function (a) { return a.type === "Liability" && accountBalance(a, toDateLedger) !== 0; });
  var equityRows = accounts.filter(function (a) { return a.type === "Equity"    && accountBalance(a, toDateLedger) !== 0; });

  var kpis = [
    { label: "Total Assets",      value: fmtAED(totalAssets),             color: RPT.blue   },
    { label: "Total Liabilities", value: fmtAED(totalLiabilities),        color: RPT.red    },
    { label: "Equity + Retained", value: fmtAED(totalEquity + netIncome), color: RPT.purple },
    {
      label: "Balance Check",
      value: isBalanced ? "\u2713 Balanced" : "\u2717 Imbalance",
      color: isBalanced ? RPT.green : RPT.red,
      sub:   isBalanced ? "Assets = Liabilities + Equity" : "Investigate discrepancy",
    },
  ];

  var company = settings.company || "Nasama Properties";
  var title   = "Balance Sheet";

  function BSSection(sectionAccts, ledger, label, color, total, extras) {
    return React.createElement("div", { className: "rpt-section" },
      React.createElement(RptSectionLabel, { label: label, color: color }),
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
        React.createElement("colgroup", null,
          React.createElement("col", { style: { width: 80 } }),
          React.createElement("col", null),
          React.createElement("col", { style: { width: 180 } })
        ),
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS() }, "Code"),
            React.createElement("th", { style: thS() }, "Account Name"),
            React.createElement("th", { style: thS({ textAlign: "right" }) }, "Balance")
          )
        ),
        React.createElement("tbody", null,
          sectionAccts.length === 0 && (!extras || extras.length === 0) &&
            React.createElement("tr", null,
              React.createElement("td", { colSpan: 3, style: { padding: "18px 16px", textAlign: "center", color: RPT.subtle, fontStyle: "italic", fontSize: 12 } }, "No balances")
            ),
          sectionAccts.map(function (a) {
            return React.createElement("tr", { key: a.id },
              React.createElement("td", { style: tdCode }, a.code),
              React.createElement("td", { style: tdName }, a.name),
              React.createElement(AmtCell, { amount: accountBalance(a, ledger) })
            );
          }),
          (extras || []).map(function (row, i) {
            return React.createElement("tr", { key: "x" + i },
              React.createElement("td", { style: Object.assign({}, tdCode, { fontStyle: "italic" }) }, "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdName, { fontStyle: "italic", color: RPT.muted }) }, row.name),
              React.createElement(AmtCell, { amount: row.amount })
            );
          })
        ),
        React.createElement("tfoot", null,
          React.createElement(TotalRow, { label: "Total " + label, amount: total, color: color })
        )
      )
    );
  }

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },
    React.createElement(RptHeader, {
      company:  company, title: title,
      subtitle: "Cumulative financial position as of the selected date",
      from: null, to: dateFilter.to,
      currency: settings.currency || "AED", trn: settings.trn,
    }),
    React.createElement(RptKPIBar, { cards: kpis }),

    React.createElement("div", {
      style: { border: "1px solid " + RPT.rule, borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }
    },
      BSSection(assetRows,  toDateLedger, "Assets",      RPT.blue,   totalAssets),
      BSSection(liabRows,   toDateLedger, "Liabilities", RPT.red,    totalLiabilities),
      BSSection(equityRows, toDateLedger, "Equity",      RPT.purple, totalEquity + netIncome, [
        { name: "Retained Earnings (Net Income to date)", amount: netIncome }
      ]),

      /* Summary totals */
      React.createElement("div", { style: { padding: "0 24px" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 8 } },
          React.createElement("colgroup", null,
            React.createElement("col", null),
            React.createElement("col", { style: { width: 180 } })
          ),
          React.createElement("tbody", null,
            React.createElement("tr", null,
              React.createElement("td", { style: Object.assign({}, tdName, { fontWeight: 600 }) }, "Total Assets"),
              React.createElement(AmtCell, { amount: totalAssets, color: RPT.blue, bold: true })
            ),
            React.createElement("tr", null,
              React.createElement("td", { style: Object.assign({}, tdName, { fontWeight: 600 }) }, "Total Liabilities + Equity"),
              React.createElement(AmtCell, { amount: totalLE, bold: true })
            )
          )
        )
      ),

      /* Balance indicator */
      React.createElement("div", {
        style: Object.assign({}, PC, {
          margin: "12px 24px 16px",
          padding: "10px 16px",
          borderRadius: 6,
          background: isBalanced ? RPT.greenBg : RPT.redBg,
          border: "1px solid " + (isBalanced ? "#A7F3D0" : "#FECACA"),
          fontSize: 12, fontWeight: 600,
          color: isBalanced ? RPT.green : RPT.red,
          display: "flex", alignItems: "center", gap: 8,
        })
      },
        isBalanced
          ? "\u2705 Balance sheet is balanced \u2014 Assets = Liabilities + Equity"
          : "\u274C Not balanced \u2014 Difference: " + fmtAED(Math.abs(totalAssets - totalLE))
      )
    ),

    React.createElement(RptPageFooter, { company: company, title: title })
  );
}

/* ════════════════════════════════════════════════════════
   TRIAL BALANCE REPORT
   ════════════════════════════════════════════════════════ */
function TBReport(props) {
  var accounts       = props.accounts       || [];
  var filteredLedger = props.filteredLedger || {};
  var dateFilter     = props.dateFilter     || {};
  var settings       = props.settings       || {};

  var typeColors = {
    Asset:     RPT.blue,
    Liability: RPT.red,
    Equity:    RPT.purple,
    Revenue:   RPT.green,
    Expense:   RPT.amber,
  };

  var rows = accounts.slice()
    .sort(function (a, b) { return a.code.localeCompare(b.code); })
    .filter(function (a) {
      var e = filteredLedger[a.id] || { debit: 0, credit: 0 };
      return e.debit > 0 || e.credit > 0;
    })
    .map(function (a) {
      var e  = filteredLedger[a.id] || { debit: 0, credit: 0 };
      var nb = NORMAL_BAL[a.type];
      var bal = nb === "debit" ? e.debit - e.credit : e.credit - e.debit;
      return {
        id:     a.id,
        code:   a.code,
        name:   a.name,
        type:   a.type,
        debit:  nb === "debit"  && bal !== 0 ? bal : 0,
        credit: nb === "credit" && bal !== 0 ? bal : 0,
      };
    });

  var totalDebit  = rows.reduce(function (s, r) { return s + r.debit;  }, 0);
  var totalCredit = rows.reduce(function (s, r) { return s + r.credit; }, 0);
  var isBalanced  = Math.abs(totalDebit - totalCredit) <= 1;

  var kpis = [
    { label: "Total Debit",      value: fmtAED(totalDebit),  color: RPT.blue   },
    { label: "Total Credit",     value: fmtAED(totalCredit), color: RPT.purple },
    { label: "Balance",          value: isBalanced ? "\u2713 Balanced" : "\u2717 Out of balance", color: isBalanced ? RPT.green : RPT.red },
    { label: "Active Accounts",  value: "" + rows.length, color: RPT.text },
  ];

  var company = settings.company || "Nasama Properties";
  var title   = "Trial Balance";

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },
    React.createElement(RptHeader, {
      company: company, title: title,
      subtitle: "Net account balances for the selected period",
      from: dateFilter.from, to: dateFilter.to,
      currency: settings.currency || "AED", trn: settings.trn,
    }),
    React.createElement(RptKPIBar, { cards: kpis }),

    React.createElement("div", {
      style: { border: "1px solid " + RPT.rule, borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }
    },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: thS({ width: 72 }) }, "Code"),
            React.createElement("th", { style: thS() }, "Account Name"),
            React.createElement("th", { style: thS({ width: 100 }) }, "Type"),
            React.createElement("th", { style: thS({ textAlign: "right", width: 160 }) }, "Debit"),
            React.createElement("th", { style: thS({ textAlign: "right", width: 160 }) }, "Credit")
          )
        ),
        React.createElement("tbody", null,
          rows.length === 0 &&
            React.createElement("tr", null,
              React.createElement("td", { colSpan: 5, style: { textAlign: "center", padding: 28, color: RPT.subtle, fontStyle: "italic" } }, "No transactions in this period")
            ),
          rows.map(function (row) {
            var tColor = typeColors[row.type] || RPT.text;
            return React.createElement("tr", { key: row.id },
              React.createElement("td", { style: tdCode }, row.code),
              React.createElement("td", { style: tdName }, row.name),
              React.createElement("td", { style: { padding: "11px 16px", borderBottom: "1px solid " + RPT.rule, verticalAlign: "middle" } },
                React.createElement("span", {
                  style: Object.assign({}, PC, {
                    display: "inline-block", padding: "2px 8px", borderRadius: 20,
                    fontSize: 9.5, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    background: tColor + "18", color: tColor,
                  })
                }, row.type)
              ),
              React.createElement("td", {
                style: {
                  padding: "11px 16px", textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: row.debit ? RPT.blue : RPT.subtle,
                  fontWeight: row.debit ? 600 : 400, fontSize: 13,
                  borderBottom: "1px solid " + RPT.rule,
                }
              }, row.debit ? fmtAED(row.debit) : "\u2014"),
              React.createElement("td", {
                style: {
                  padding: "11px 16px", textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: row.credit ? RPT.purple : RPT.subtle,
                  fontWeight: row.credit ? 600 : 400, fontSize: 13,
                  borderBottom: "1px solid " + RPT.rule,
                }
              }, row.credit ? fmtAED(row.credit) : "\u2014")
            );
          })
        ),
        React.createElement("tfoot", null,
          React.createElement("tr", { style: Object.assign({}, PC, { background: RPT.bgSection }) },
            React.createElement("td", { colSpan: 3, style: { padding: "12px 16px", fontWeight: 700, fontSize: 13, borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "3px double " + RPT.ink } }, "TOTALS"),
            React.createElement("td", { style: { padding: "12px 16px", textAlign: "right", fontWeight: 700, fontSize: 14, color: RPT.blue, fontVariantNumeric: "tabular-nums", borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "3px double " + RPT.ink } }, fmtAED(totalDebit)),
            React.createElement("td", { style: { padding: "12px 16px", textAlign: "right", fontWeight: 700, fontSize: 14, color: RPT.purple, fontVariantNumeric: "tabular-nums", borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "3px double " + RPT.ink } }, fmtAED(totalCredit))
          ),
          !isBalanced && React.createElement("tr", { style: Object.assign({}, PC, { background: RPT.redBg }) },
            React.createElement("td", { colSpan: 5, style: { padding: "9px 16px", color: RPT.red, fontWeight: 600, fontSize: 12 } },
              "\u274C Trial balance is out of balance by " + fmtAED(Math.abs(totalDebit - totalCredit))
            )
          )
        )
      )
    ),

    React.createElement(RptPageFooter, { company: company, title: title })
  );
}

/* ════════════════════════════════════════════════════════
   GENERAL LEDGER REPORT
   ════════════════════════════════════════════════════════ */
function GLReport(props) {
  var accounts     = props.accounts     || [];
  var txns         = props.txns         || [];
  var filteredTxns = props.filteredTxns || [];
  var dateFilter   = props.dateFilter   || {};
  var settings     = props.settings     || {};

  var groups = React.useMemo(function () {
    var acctIds = new Set(
      filteredTxns
        .filter(function (t) { return !t.isVoid; })
        .flatMap(function (t) { return (t.lines || []).map(function (l) { return l.accountId; }); })
    );

    return accounts
      .filter(function (a) { return acctIds.has(a.id); })
      .sort(function (a, b) { return a.code.localeCompare(b.code); })
      .map(function (acct) {
        var nb = NORMAL_BAL[acct.type];
        var priorBalance = 0;

        if (dateFilter.from) {
          txns.filter(function (t) { return !t.isVoid && (t.date || "") < dateFilter.from; })
            .forEach(function (t) {
              (t.lines || []).forEach(function (l) {
                if (l.accountId !== acct.id) return;
                var dr = l.debit || 0, cr = l.credit || 0;
                priorBalance += nb === "debit" ? dr - cr : cr - dr;
              });
            });
        }

        var runningBal = priorBalance;
        var rows = filteredTxns
          .filter(function (t) { return !t.isVoid; })
          .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); })
          .flatMap(function (t) {
            return (t.lines || [])
              .filter(function (l) { return l.accountId === acct.id; })
              .map(function (l) {
                var dr = l.debit || 0, cr = l.credit || 0;
                runningBal += nb === "debit" ? dr - cr : cr - dr;
                return {
                  date:    t.date,
                  ref:     t.ref,
                  desc:    l.memo || t.description || "\u2014",
                  debit:   dr,
                  credit:  cr,
                  balance: runningBal,
                  key:     t.id + "-" + l.id,
                };
              });
          });

        return { acct: acct, nb: nb, openingBal: priorBalance, rows: rows, closing: runningBal };
      });
  }, [accounts, txns, filteredTxns, dateFilter.from]);

  var td = function (extra) {
    return Object.assign({ padding: "9px 14px", fontSize: 12, borderBottom: "1px solid " + RPT.rule, verticalAlign: "middle" }, extra || {});
  };

  var company = settings.company || "Nasama Properties";
  var title   = "General Ledger";

  return React.createElement("div", { style: { background: "#fff", fontFamily: "Inter, Arial, sans-serif" } },
    React.createElement(RptHeader, {
      company: company, title: title,
      subtitle: "All transactions grouped by account with running balance",
      from: dateFilter.from, to: dateFilter.to,
      currency: settings.currency || "AED", trn: settings.trn,
    }),

    groups.length === 0 &&
      React.createElement("div", {
        style: { padding: 40, textAlign: "center", color: RPT.subtle, fontStyle: "italic", border: "1px solid " + RPT.rule, borderTop: "none", borderRadius: "0 0 10px 10px" }
      }, "No transactions found for the selected period."),

    groups.map(function (g, gi) {
      var totalDr = g.rows.reduce(function (s, r) { return s + r.debit;  }, 0);
      var totalCr = g.rows.reduce(function (s, r) { return s + r.credit; }, 0);

      return React.createElement("div", {
        key:       g.acct.id,
        className: "rpt-acct-block",
        style: {
          border:       "1px solid " + RPT.rule,
          borderTop:    gi === 0 ? "none" : "1px solid " + RPT.rule,
          marginTop:    gi > 0 ? 12 : 0,
          borderRadius: gi === 0 ? "0 0 0 0" : 8,
          overflow:     "hidden",
          pageBreakInside: "avoid",
        }
      },

        /* Account heading */
        React.createElement("div", {
          style: Object.assign({}, PC, {
            background: RPT.navyAccent,
            color: "#fff",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          })
        },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("span", {
              style: Object.assign({}, PC, {
                display: "inline-block", width: 3, height: 18, borderRadius: 2,
                background: RPT.gold, flexShrink: 0,
              })
            }),
            React.createElement("span", {
              style: { fontWeight: 700, fontSize: 13, letterSpacing: "0.01em" }
            }, g.acct.code + " \u2014 " + g.acct.name)
          ),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14 } },
            React.createElement("span", {
              style: Object.assign({}, PC, {
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.08)", padding: "3px 8px", borderRadius: 4,
              })
            }, g.acct.type),
            React.createElement("span", { style: { fontSize: 11, color: "rgba(255,255,255,0.5)" } },
              "Closing: ",
              React.createElement("span", { style: { color: RPT.gold, fontWeight: 700 } }, fmtAED(g.closing))
            )
          )
        ),

        /* Transactions table */
        React.createElement("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" } },
        React.createElement("table", { style: { width: "100%", minWidth: 680, borderCollapse: "collapse", fontSize: 12 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              React.createElement("th", { style: thS({ width: 86, whiteSpace: "nowrap" }) },  "Date"),
              React.createElement("th", { style: thS({ width: 96, whiteSpace: "nowrap" }) }, "Reference"),
              React.createElement("th", { style: thS() },               "Description"),
              React.createElement("th", { style: thS({ textAlign: "right", width: 118, whiteSpace: "nowrap" }) }, "Debit"),
              React.createElement("th", { style: thS({ textAlign: "right", width: 118, whiteSpace: "nowrap" }) }, "Credit"),
              React.createElement("th", { style: thS({ textAlign: "right", width: 126, whiteSpace: "nowrap" }) }, "Balance")
            )
          ),
          React.createElement("tbody", null,

            /* Opening balance row */
            React.createElement("tr", {
              style: Object.assign({}, PC, { background: "#F0F4FF" })
            },
              React.createElement("td", { style: td({ color: RPT.subtle, whiteSpace: "nowrap" }) }, dateFilter.from ? fmtDate(dateFilter.from) : "\u2014"),
              React.createElement("td", { style: td({ color: RPT.subtle }) }, "\u2014"),
              React.createElement("td", { style: td({ fontStyle: "italic", color: RPT.subtle }) }, "Opening Balance"),
              React.createElement("td", { style: td({ textAlign: "right" }) }, "\u2014"),
              React.createElement("td", { style: td({ textAlign: "right" }) }, "\u2014"),
              React.createElement("td", { style: td({ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }) }, fmtAED(g.openingBal))
            ),

            g.rows.map(function (row) {
              /* Truncate long refs (e.g. Firestore IDs) to first 10 chars */
              var refDisplay = row.ref
                ? (row.ref.length > 12 ? row.ref.slice(0, 10) + "\u2026" : row.ref)
                : "\u2014";
              return React.createElement("tr", { key: row.key },
                React.createElement("td", { style: td({ color: RPT.subtle, whiteSpace: "nowrap" }) }, fmtDate(row.date)),
                React.createElement("td", {
                  title: row.ref || "",
                  style: td({ fontFamily: "ui-monospace,'SF Mono',Consolas,monospace", fontSize: 10.5, color: RPT.subtle, whiteSpace: "nowrap" })
                }, refDisplay),
                React.createElement("td", {
                  style: td({ color: RPT.textHeavy, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
                  title: row.desc
                }, row.desc),
                React.createElement("td", { style: td({ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: row.debit ? RPT.blue : RPT.subtle, fontWeight: row.debit ? 600 : 400 }) },
                  row.debit ? fmtAED(row.debit) : "\u2014"
                ),
                React.createElement("td", { style: td({ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: row.credit ? RPT.purple : RPT.subtle, fontWeight: row.credit ? 600 : 400 }) },
                  row.credit ? fmtAED(row.credit) : "\u2014"
                ),
                React.createElement("td", { style: td({ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: row.balance >= 0 ? RPT.textHeavy : RPT.red }) },
                  fmtAED(row.balance)
                )
              );
            })
          ),
          React.createElement("tfoot", null,
            React.createElement("tr", { style: Object.assign({}, PC, { background: RPT.bgSection }) },
              React.createElement("td", { colSpan: 3, style: { padding: "9px 16px", fontWeight: 700, fontSize: 12, borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "1.5px solid " + RPT.ruleDk } }, "Closing Balance"),
              React.createElement("td", { style: { padding: "9px 16px", textAlign: "right", color: RPT.blue,   fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "1.5px solid " + RPT.ruleDk } }, fmtAED(totalDr)),
              React.createElement("td", { style: { padding: "9px 16px", textAlign: "right", color: RPT.purple, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "1.5px solid " + RPT.ruleDk } }, fmtAED(totalCr)),
              React.createElement("td", { style: { padding: "9px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: g.closing >= 0 ? RPT.textHeavy : RPT.red, borderTop: "1.5px solid " + RPT.ruleDk, borderBottom: "1.5px solid " + RPT.ruleDk } }, fmtAED(g.closing))
            )
          )
        ))
      );
    }),

    React.createElement(RptPageFooter, { company: company, title: title })
  );
}
