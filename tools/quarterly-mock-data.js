// ─────────────────────────────────────────────────────────────────────────────
//  Mock book for the Quarterly Comparative Reports (Arabic) module.
//
//  Two consecutive quarters — Q1 2026 and Q2 2026 — of realistic brokerage
//  activity, written as the same journal entries the live app stores in
//  Firestore (`txns` with balanced `lines`, amounts in integer CENTS). The
//  module never reads a "mock report": it computes both quarters from this
//  ledger exactly as it would from the real one, so the preview exercises the
//  real arithmetic.
//
//  Storyline (deliberately chosen to trigger every insight rule):
//    • Q1: healthy quarter, everything invoiced was collected.
//    • Q2: revenue +73 % and net profit +94 %, BUT 377,500 of it is still
//      sitting in receivables, so operating cash flow is NEGATIVE → the
//      "book profit vs real cash" warning fires. Opex grows slower than
//      revenue, a client deposit arrives (not company money), the owner
//      draws, a loan instalment is repaid, Q1 VAT is settled.
//
//  `expected` holds the hand-computed figures tests/quarterly.test.js asserts.
//
//  Usage:  browser  → <script src="tools/quarterly-mock-data.js"> then window.QTR_MOCK
//          node     → const { accounts, txns, expected } = require("./tools/quarterly-mock-data.js")
// ─────────────────────────────────────────────────────────────────────────────
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.QTR_MOCK = m;
})(typeof self !== "undefined" ? self : this, function () {
  const AED = v => Math.round(v * 100);   // → cents
  const acc = (code, name, type, extra) => ({ id: "a" + code, code, name, type, isBank: false, isCash: false, isOutputVAT: false, isInputVAT: false, ...(extra || {}) });

  // ── Chart of accounts (subset of the live chart, same codes) ──
  const accounts = [
    acc("1001", "Cash — الصندوق", "Asset", { isCash: true }),
    acc("1002", "Bank — Mashreq Bank — البنك", "Asset", { isBank: true }),
    acc("1004", "Prepaid Expenses — مصروفات مدفوعة مقدماً", "Asset"),
    acc("1100", "Commission Receivable — عمولات مستحقة القبض", "Asset"),
    acc("1201", "Input VAT Recoverable — ضريبة مدخلات", "Asset", { isInputVAT: true }),
    acc("1510", "Computers & Laptops — أجهزة حاسوب", "Asset"),
    acc("2101", "Output VAT Payable — ضريبة مخرجات", "Liability", { isOutputVAT: true }),
    acc("2200", "Loan Payable — قرض بنكي", "Liability"),
    acc("2210", "Accrued Expenses Payable — مصروفات مستحقة", "Liability"),
    acc("2230", "Client Security Deposits Held — أمانات العملاء", "Liability"),
    acc("3000", "Capital Injection — رأس المال", "Equity"),
    acc("3002", "Retained Earnings — أرباح محتجزة", "Equity"),
    acc("3100", "Owner Drawings — مسحوبات المالك", "Equity"),
    acc("4000", "Developer Commission — عمولات المطورين", "Revenue"),
    acc("4010", "Seller Commission — عمولات البائعين", "Revenue"),
    acc("4020", "Rental Commission — عمولات الإيجار", "Revenue"),
    acc("5010", "Employee Salaries — رواتب الموظفين", "Expense"),
    acc("5040", "Sales Manager Override — حافز مدير المبيعات", "Expense"),
    acc("5100", "Office Rent — إيجار المكتب", "Expense"),
    acc("5110", "DEWA — Electricity & Water — كهرباء ومياه", "Expense"),
    acc("5200", "Property Finder — إعلانات بروبرتي فايندر", "Expense"),
    acc("5220", "Marketing — تسويق", "Expense"),
    acc("5500", "Broker Commission — عمولات الوسطاء", "Expense"),
  ];
  const id = code => "a" + code;

  // ── Journal entries ──
  let n = 0;
  const L = (code, debit, credit, memo) => ({ id: "l" + (++n), accountId: id(code), debit: debit ? AED(debit) : 0, credit: credit ? AED(credit) : 0, memo: memo || "" });
  const T = (date, ref, description, txnType, lines, extra) => ({ id: "t" + (++n), date, ref, description, counterparty: "", txnType, isVoid: false, tags: "", createdAt: date + "T09:00:00.000Z", lines, ...(extra || {}) });

  const txns = [
    // ── Opening (before Q1 2026)
    T("2025-12-15", "CI-2025-00001", "ضخ رأس المال الافتتاحي — Capital injection", "CI", [L("1002", 500000, 0, "رأس المال"), L("3000", 0, 500000, "رأس المال")]),

    // ── Q1 2026 ──────────────────────────────────────────────
    T("2026-01-05", "PV-2026-00001", "إيجار المكتب — يناير إلى مارس", "PV", [L("5100", 30000), L("1201", 1500, 0, "ضريبة 5%"), L("1002", 0, 31500)]),
    T("2026-01-10", "INV-1001", "فاتورة ضريبية #1001 — إعمار العقارية — عمولة تسويق مشروع", "IN", [L("1100", 315000, 0, "فاتورة 1001"), L("4000", 0, 300000, "عمولة مطور"), L("2101", 0, 15000, "ضريبة مخرجات")], { invoice_no: "1001", tags: "invoice receivable" }),
    T("2026-01-25", "SR-2026-00001", "تحصيل فاتورة #1001 — إعمار", "SR", [L("1002", 315000, 0, "تحصيل"), L("1100", 0, 315000, "إقفال الذمة")], { invoice_no: "1001" }),
    T("2026-01-31", "PV-2026-00002", "رواتب يناير", "PV", [L("5010", 30000), L("1002", 0, 30000)]),
    T("2026-02-05", "SR-2026-00002", "عمولة إيجار — فيلا دبي هيلز", "SR", [L("1002", 31500), L("4020", 0, 30000), L("2101", 0, 1500)]),
    T("2026-02-10", "BP-2026-00001", "دفع عمولة الوسيط — صفقة إعمار", "BP", [L("5500", 100000, 0, "حصة الوسيط"), L("1002", 0, 100000)]),
    T("2026-02-15", "PV-2026-00003", "اشتراك بروبرتي فايندر", "PV", [L("5200", 12000), L("1201", 600), L("1002", 0, 12600)]),
    T("2026-02-28", "PV-2026-00004", "رواتب فبراير", "PV", [L("5010", 30000), L("1002", 0, 30000)]),
    T("2026-03-01", "JV-2026-00001", "قرض بنكي قصير/طويل الأجل — Mashreq", "JV", [L("1002", 100000), L("2200", 0, 100000)]),
    T("2026-03-20", "PV-2026-00005", "شراء أجهزة حاسوب محمولة للفريق", "PV", [L("1510", 15000), L("1201", 750), L("1002", 0, 15750)]),
    T("2026-03-30", "AC-2026-00001", "استحقاق فاتورة ديوا — مارس (غير مدفوعة)", "AC", [L("5110", 4000), L("2210", 0, 4000)], { id: "acc-dewa-mar", tags: "accrual" }),
    T("2026-03-31", "PV-2026-00006", "رواتب مارس", "PV", [L("5010", 30000), L("1002", 0, 30000)]),

    // ── Q2 2026 ──────────────────────────────────────────────
    T("2026-04-05", "PV-2026-00007", "إيجار المكتب — أبريل إلى يونيو", "PV", [L("5100", 30000), L("1201", 1500), L("1002", 0, 31500)]),
    T("2026-04-08", "INV-1002", "فاتورة ضريبية #1002 — داماك — عمولة مبيعات برج", "IN", [L("1100", 420000, 0, "فاتورة 1002"), L("4000", 0, 400000), L("2101", 0, 20000)], { invoice_no: "1002", tags: "invoice receivable" }),
    T("2026-04-15", "PV-2026-00008", "سداد فاتورة ديوا المستحقة عن مارس", "PV", [L("2210", 4000), L("1002", 0, 4000)], { accrual_txn_id: "acc-dewa-mar" }),   // settlement names the accrual it clears, as postAccrualSettlement does
    T("2026-04-28", "JV-2026-00002", "تسوية الإقرار الضريبي للربع الأول 2026", "JV", [L("2101", 16500), L("1201", 0, 2850), L("1002", 0, 13650)]),
    T("2026-04-30", "PV-2026-00009", "رواتب أبريل", "PV", [L("5010", 30000), L("1002", 0, 30000)]),
    T("2026-05-12", "INV-1003", "فاتورة ضريبية #1003 — شوبا — عمولة بائع", "IN", [L("1100", 157500, 0, "فاتورة 1003"), L("4010", 0, 150000), L("2101", 0, 7500)], { invoice_no: "1003", tags: "invoice receivable" }),
    T("2026-05-20", "SR-2026-00003", "تحصيل جزئي من داماك — فاتورة #1002", "SR", [L("1002", 200000), L("1100", 0, 200000)], { invoice_no: "1002" }),
    T("2026-05-25", "BP-2026-00002", "دفع عمولات الوسطاء — صفقتا داماك وشوبا", "BP", [L("5500", 220000), L("1002", 0, 220000)]),
    T("2026-05-31", "PV-2026-00010", "رواتب مايو", "PV", [L("5010", 30000), L("1002", 0, 30000)]),
    T("2026-06-01", "CF-2026-00001", "استلام أمانة عميل — شيك ضمان إيجار", "CF", [L("1002", 50000), L("2230", 0, 50000)], { tags: "client-funds" }),
    T("2026-06-10", "PV-2026-00011", "حافز مدير المبيعات عن الربع", "PV", [L("5040", 25000), L("1002", 0, 25000)]),
    T("2026-06-15", "PV-2026-00012", "حملة تسويق رقمية", "PV", [L("5220", 18000), L("1201", 900), L("1002", 0, 18900)]),
    T("2026-06-20", "OD-2026-00001", "مسحوبات شخصية للمالك", "OD", [L("3100", 20000), L("1002", 0, 20000)]),
    T("2026-06-28", "SR-2026-00004", "عمولة إيجار — شقة مرسى دبي", "SR", [L("1002", 21000), L("4020", 0, 20000), L("2101", 0, 1000)]),
    T("2026-06-30", "AC-2026-00002", "استحقاق فاتورة ديوا — يونيو (غير مدفوعة)", "AC", [L("5110", 4500), L("2210", 0, 4500)], { tags: "accrual" }),
    T("2026-06-30", "JV-2026-00003", "سداد قسط القرض البنكي", "JV", [L("2200", 10000), L("1002", 0, 10000)]),
    T("2026-06-30", "PV-2026-00013", "رواتب يونيو", "PV", [L("5010", 30000), L("1002", 0, 30000)]),

    // ── Q3 2026 — client money only (shows gross in/out vs net) ──
    T("2026-07-06", "CF-2026-00002", "رد أمانة العميل — شيك ضمان الإيجار", "CF", [L("2230", 50000), L("1002", 0, 50000)], { tags: "client-funds" }),
    T("2026-08-02", "CF-2026-00003", "استلام أمانة عميل — عربون شراء وحدة", "CF", [L("1002", 63000), L("2230", 0, 63000)], { tags: "client-funds" }),
    T("2026-08-20", "CF-2026-00004", "تحويل العربون إلى المطور نيابة عن العميل", "CF", [L("2230", 63000), L("1002", 0, 63000)], { tags: "client-funds" }),

    // A voided entry: must be ignored everywhere.
    T("2026-06-11", "PV-2026-00099", "قيد ملغى — خطأ إدخال", "PV", [L("5220", 99999), L("1002", 0, 99999)], { isVoid: true }),
  ];

  // ── Hand-computed expectations (cents) ──
  const expected = {
    q1: { revenue: AED(330000), costOfRevenue: AED(100000), grossProfit: AED(230000), opex: AED(136000), netProfit: AED(94000),
          operating: AED(112400), investing: AED(-15750), financing: AED(100000), clientFunds: 0, netChange: AED(196650), openingCash: AED(500000), closingCash: AED(696650),
          currentAssets: AED(699500), nonCurrentAssets: AED(15000), currentLiabilities: AED(20500), longTermLiabilities: AED(100000), equity: AED(594000),
          receivables: 0, payables: AED(4000) },
    q2: { revenue: AED(570000), costOfRevenue: AED(245000), grossProfit: AED(325000), opex: AED(142500), netProfit: AED(182500),
          operating: AED(-182050), investing: 0, financing: AED(-30000), clientFunds: AED(50000), netChange: AED(-162050), openingCash: AED(696650), closingCash: AED(534600),
          currentAssets: AED(914500), nonCurrentAssets: AED(15000), currentLiabilities: AED(83000), longTermLiabilities: AED(90000), equity: AED(756500),
          receivables: AED(377500), payables: AED(4500), dso: 60 },
  };
  return { accounts, txns, expected };
});
