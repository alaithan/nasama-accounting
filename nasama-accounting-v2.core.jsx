const { useState, useEffect, useMemo, useCallback, useRef } = React;

    /* ══════════════════════════════════════════════════
       NASAMA PROPERTIES — ACCOUNTING SYSTEM v2.0
       Clean Backend · Cash-Settled · No AR/AP
       Double-Entry · UAE VAT 5% · Firebase Backend
       ══════════════════════════════════════════════════ */

    // ── BRAND ─────────────────────────────────────────
    const GOLD = "#C9A044", GOLD_D = "#A8853A", NAVY = "#0C0F1E", NAVY2 = "#161B35";
    const NASAMA_WORDMARK_SRC = "./nasama-wordmark.png";
    const NASAMA_ICON_SRC = "./nasama-icon.png";
    const NASAMA_STAMP_SRC = "./nasama-stamp.png";
    const DEFAULT_REPORTING_START_DATE = "2025-01-01";

    // ── CONSTANTS ─────────────────────────────────────
    const DEAL_STAGES = ["Lead", "EOI", "Booking Form Signed", "First Payment Paid", "MOU Signed", "SPA Signed", "Handover", "Commission Earned", "Commission Collected", "Cancelled"];
    const DEAL_TYPES = ["Off-Plan", "Secondary", "Rental"];
    const ACCT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
    const NORMAL_BAL = { Asset: "debit", Expense: "debit", Liability: "credit", Equity: "credit", Revenue: "credit" };

    // Transaction types for the new cash-settled system
    const TXN_TYPES = {
      SR: { label: "Sale Receipt", desc: "Commission collected (cash settled)" },
      PV: { label: "Payment Voucher", desc: "Expense paid immediately" },
      BP: { label: "Broker Payment", desc: "Broker commission paid" },
      BT: { label: "Bank Transfer", desc: "Transfer between accounts" },
      BK: { label: "Bank Import", desc: "Imported bank statement transaction" },
      JV: { label: "Journal Voucher", desc: "Manual adjustment entry" },
      CI: { label: "Capital Injection", desc: "Owner capital contribution" },
      OD: { label: "Owner Drawing", desc: "Profit release / owner withdrawal" },
    };

    // ── RBAC ──────────────────────────────────────────
    const USER_ROLES = { ADMIN: 'admin', ACCOUNTANT: 'accountant', SECRETARY: 'secretary' };
    const AUTH_SESSION_KEY = "auth_session";
    const PERMISSIONS = {
      admin: { canCreateTxns: true, canEditTxns: true, canVoidTxns: true, canManageUsers: true, canViewReports: true, canAccessBanking: true, canEditSettings: true, canExportData: true, canManageAccounts: true, canAccessVAT: true },
      accountant: { canCreateTxns: true, canEditTxns: true, canVoidTxns: true, canManageUsers: false, canViewReports: true, canAccessBanking: true, canEditSettings: false, canExportData: true, canManageAccounts: true, canAccessVAT: true },
      secretary: { canCreateTxns: false, canEditTxns: false, canVoidTxns: false, canManageUsers: false, canViewReports: false, canAccessBanking: false, canEditSettings: false, canExportData: false, canManageAccounts: false, canAccessVAT: false }
    };
    const SECURITY_MODULES = [
      { id: "overview",   label: "OVERVIEW",   pages: ["Dashboard", "Performance"],                                                                 actions: ["read"] },
      { id: "sales",      label: "SALES",      pages: ["Deals / Pipeline", "Sale Receipts", "Invoices", "Customers", "Brokers", "Developers"],      actions: ["read", "create", "edit"] },
      { id: "expenses",   label: "EXPENSES",   pages: ["Payments", "Vendors", "Future Expenses"],                                                    actions: ["read", "create", "edit"] },
      { id: "accounting", label: "ACCOUNTING", pages: ["Banking", "Journal Entries", "Chart of Accounts", "Reports", "VAT / Taxes"],                actions: ["read", "create", "edit", "import", "reconcile", "void", "export"] },
      { id: "system",     label: "SYSTEM",     pages: ["User Management", "Settings", "User Manual"],                                               actions: ["read", "create", "edit", "approve"] },
    ];
    const SECURITY_PERMISSION_KEYS = SECURITY_MODULES.flatMap(module => module.actions.map(action => `${module.id}.${action}`));
    const sanitizeRolePermissions = (permissions = {}) => SECURITY_PERMISSION_KEYS.reduce((acc, key) => {
      if (permissions?.[key]) acc[key] = true;
      return acc;
    }, {});
    const countRolePermissions = permissions => Object.keys(sanitizeRolePermissions(permissions)).length;
    const APPROVAL_POLICY_MODULES = [
      { id: "sales",      label: "SALES" },
      { id: "expenses",   label: "EXPENSES" },
      { id: "accounting", label: "ACCOUNTING" },
    ];
    const APPROVAL_POLICY_MODULE_LABELS = {
      sales: "SALES",
      payments: "EXPENSES",
      purchases: "EXPENSES",
      expenses: "EXPENSES",
      bank: "ACCOUNTING",
      banking: "ACCOUNTING",
      reconciliation: "ACCOUNTING",
      journalEntries: "ACCOUNTING",
      accounting: "ACCOUNTING",
      tax: "ACCOUNTING",
      vat: "ACCOUNTING",
      reports: "ACCOUNTING"
    };
    const DEFAULT_SECURITY_ROLE_TEMPLATES = [
      {
        id: "admin",
        name: "Admin",
        description: "Full system access across users, settings, approvals, and accounting modules.",
        legacyRole: "admin",
        permissions: SECURITY_MODULES.reduce((acc, module) => {
          module.actions.forEach(action => { acc[`${module.id}.${action}`] = true; });
          return acc;
        }, {})
      },
      {
        id: "accountant",
        name: "Accountant",
        description: "Operational accounting access without user administration.",
        legacyRole: "accountant",
        permissions: {
          "overview.read": true,
          "sales.read": true, "sales.create": true, "sales.edit": true,
          "expenses.read": true, "expenses.create": true, "expenses.edit": true,
          "accounting.read": true, "accounting.create": true, "accounting.edit": true, "accounting.import": true, "accounting.reconcile": true, "accounting.void": true, "accounting.export": true,
          "system.read": true,
        }
      },
      {
        id: "secretary",
        name: "Secretary",
        description: "Front office and master-data access with no posting or approval authority.",
        legacyRole: "secretary",
        permissions: {
          "overview.read": true,
          "sales.read": true, "sales.create": true, "sales.edit": true,
          "expenses.read": true,
          "accounting.read": true,
          "system.read": true,
        }
      }
    ];
    let ACTIVE_USER_ACCESS = null;
    const ACCESS_BRIDGE = {
      canCreateTxns: ["sales.create", "expenses.create", "accounting.create"],
      canEditTxns: ["sales.edit", "expenses.edit", "accounting.edit"],
      canVoidTxns: ["accounting.void"],
      canManageUsers: ["system.create", "system.edit", "system.approve"],
      canViewReports: ["accounting.read"],
      canAccessBanking: ["accounting.read"],
      canEditSettings: ["system.edit"],
      canExportData: ["accounting.export"],
      canManageAccounts: ["accounting.create", "accounting.edit"],
      canAccessVAT: ["accounting.read"]
    };
    const PAGE_ACCESS_BRIDGE = {
      dashboard:      "overview.read",
      banana2:        "overview.read",
      deals:          "sales.read",
      receipts:       "sales.read",
      invoices:       "sales.read",
      customers:      "sales.read",
      brokers:        "sales.read",
      developers:     "sales.read",
      payments:       "expenses.read",
      vendors:        "expenses.read",
      futureExpenses: "expenses.read",
      banking:        "accounting.read",
      journal:        "accounting.read",
      coa:            "accounting.read",
      reports:        "accounting.read",
      vat:            "accounting.read",
      users:          "system.read",
      settings:       "system.read",
      manual:         "system.read",
    };
    const getDefaultSecurityTemplate = (roleId) => DEFAULT_SECURITY_ROLE_TEMPLATES.find(role => role.id === roleId) || null;
    const resolveLegacyRole = (subject) => typeof subject === "string" ? subject : subject?.legacyRole || subject?.role || "secretary";
    const isAdminSubject = (subject) => {
      const roleId = typeof subject === "string" ? subject : subject?.roleId;
      return roleId === "admin" || resolveLegacyRole(subject) === "admin";
    };
    const resolveAccessSubject = (subject) => subject && typeof subject === "object" && subject.permissions ? subject : ACTIVE_USER_ACCESS;
    const hasPermission = (subject, perm) => {
      if (isAdminSubject(subject)) return true;
      const access = resolveAccessSubject(subject);
      if (access?.permissions) {
        if (perm.includes(".")) return !!access.permissions[perm];
        const bridged = ACCESS_BRIDGE[perm];
        if (bridged) return bridged.some(key => !!access.permissions[key]);
      }
      const role = resolveLegacyRole(subject);
      return PERMISSIONS[role]?.[perm] || false;
    };
    const canAccessPage = (subject, pg) => {
      if (isAdminSubject(subject)) return true;
      const bridged = PAGE_ACCESS_BRIDGE[pg];
      const access = resolveAccessSubject(subject);
      if (access?.permissions && bridged) return !!access.permissions[bridged];
      const map = {
        dashboard: ['admin', 'accountant'], journal: ['admin', 'accountant'], coa: ['admin', 'accountant'],
        deals: ['admin', 'accountant', 'secretary'], receipts: ['admin', 'accountant'],
        customers: ['admin', 'accountant', 'secretary'], brokers: ['admin', 'accountant', 'secretary'],
        developers: ['admin', 'accountant', 'secretary'], payments: ['admin', 'accountant'],
        vendors: ['admin', 'accountant'], banking: ['admin', 'accountant'],
        reports: ['admin', 'accountant'], vat: ['admin', 'accountant'],
        manual: ['admin', 'accountant', 'secretary'],
        settings: ['admin', 'accountant'], users: ['admin'],
        banana2: ['admin', 'accountant', 'secretary']
      };
      const role = resolveLegacyRole(subject);
      return map[pg]?.includes(role) || false;
    };

    // ── UTILS ─────────────────────────────────────────
    const fmtAED = c => "AED " + ((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const toCents = v => {
      if (typeof v === 'string') v = v.replace(/,/g, '');
      const num = parseFloat(v);
      if (isNaN(num)) return 0;
      return Math.round(num * 100);
    };
    const fromCents = c => ((c || 0) / 100).toFixed(2);
    const uid = () => "_" + Math.random().toString(36).substr(2, 9);
    const todayStr = () => new Date().toISOString().split("T")[0];
    const fmtDate = d => { if (!d) return "—"; try { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
    const ls_get = (k, fb) => { try { const v = localStorage.getItem("na2_" + k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
    const ls_set = (k, v) => { try { localStorage.setItem("na2_" + k, JSON.stringify(v)); } catch { } };
    const ls_remove = (k) => { try { localStorage.removeItem("na2_" + k); } catch { } };
    const normalizeReportingStartDate = value => value && value >= DEFAULT_REPORTING_START_DATE ? value : DEFAULT_REPORTING_START_DATE;
    const normalizeSettings = value => ({ ...(value || {}), openingBalanceDate: normalizeReportingStartDate(value?.openingBalanceDate) });
    const normalizeUserEmail = value => (value || "").toLowerCase().trim();
    const normalizeAccessCode = value => (value || "").trim();
    const generateAccessCode = () => String(Math.floor(100000 + Math.random() * 900000));
    const normDealText = v => (v || "").toString().toLowerCase().replace(/[—–-]/g, "-").replace(/\s+/g, " ").trim();
    const dealImportKey = d => [normDealText(d.created_at), normDealText(d.type), normDealText(d.property_name), normDealText(d.unit_no)].join("|");
    const findMissingPipelineDeals = (existingDeals, candidateDeals) => {
      const existingKeys = new Set((existingDeals || []).map(dealImportKey));
      return (candidateDeals || []).filter(d => !existingKeys.has(dealImportKey(d)));
    };
    const DEAL_RESEED_ENABLED = false;
    const TARGET_DEAL_COUNTS = { "Off-Plan": 17, "Secondary": 8, "Rental": 8 };
    const isLegacySeedDealId = id => /^d\d+$/i.test((id || "").toString());
    const countDealsByType = deals => ({
      "Off-Plan": (deals || []).filter(d => d.type === "Off-Plan").length,
      "Secondary": (deals || []).filter(d => d.type === "Secondary").length,
      "Rental": (deals || []).filter(d => d.type === "Rental").length,
    });
    const formatDealCounts = counts => `Off-Plan ${counts["Off-Plan"] || 0}, Secondary ${counts["Secondary"] || 0}, Rental ${counts["Rental"] || 0}`;
    const keepPreferredDeal = (group, txns) => {
      const linkedCount = deal => (txns || []).filter(t => !t.isVoid && t.deal_id === deal.id).length;
      return [...group].sort((a, b) => {
        const linkedDiff = linkedCount(b) - linkedCount(a);
        if (linkedDiff !== 0) return linkedDiff;

        const aLegacy = isLegacySeedDealId(a.id) ? 1 : 0;
        const bLegacy = isLegacySeedDealId(b.id) ? 1 : 0;
        if (aLegacy !== bLegacy) return aLegacy - bLegacy;

        const dateDiff = (b.created_at || "").localeCompare(a.created_at || "");
        if (dateDiff !== 0) return dateDiff;

        return (a.id || "").localeCompare(b.id || "");
      })[0];
    };
    const dedupeDealsByImportKey = (deals, txns) => {
      const groups = new Map();
      (deals || []).forEach(deal => {
        const key = dealImportKey(deal);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(deal);
      });

      const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
      const keepIds = new Set([...groups.values()].map(group => keepPreferredDeal(group, txns).id));
      const deduped = (deals || []).filter(deal => keepIds.has(deal.id));

      return {
        deduped,
        duplicateGroups,
        removed: (deals || []).filter(deal => !keepIds.has(deal.id)),
        counts: countDealsByType(deduped),
      };
    };
    const BANK_IMPORT_REQUIRED_ACCOUNTS = [
      { id: "a2201", code: "2201", name: "Bank Adjustment Clearing", type: "Liability", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5230", code: "5230", name: "CRM & Software", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5420", code: "5420", name: "Recruitment Fees", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5430", code: "5430", name: "Trakheesi & Licensing", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
    ];
    const BANK_IMPORT_DEFAULT_MAP = {
      "Bank Fees": "5600",
      "Bayut Advertising": "5210",
      "Employee Salaries": "5010",
      "Admin Salary": "5000",
      "Manager Salary": "5020",
      "Broker Incentive": "5030",
      "Office Rent": "5100",
      "Bank Adjustment Clearing": "2201",
      "Recruitment Fees": "5420",
      "Accountant Registration": "5400",
      "Accountant Services": "5410",
      "Office Supplies": "5160",
      "Seller Commission": "4010",
      "Communication": "5140",
      "Developer Commission": "4000",
      "Transportation": "5300",
      "CRM & Software": "5230",
      "Commission Payment to Brokers": "5500",
      "Internet": "5130",
      "DEWA — Electricity & Water": "5110",
      "Empower — Cooling": "5120",
      "Property Finder": "5200",
      "Marketing": "5220",
      "Output VAT Payable": "2101",
      "Trakheesi & Licensing": "5430",
      "Cleaning Fees": "5150",
      "Secondary Market Agent Payment": "5510",
      "Legal Services": "6000",
    };
    const parseDelimitedRows = (text, delimiter) => {
      const cleaned = (text || "").replace(/^\uFEFF/, "");
      if (!cleaned.trim()) return [];
      const rows = [];
      let row = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '"') {
          if (inQuotes && cleaned[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
          row.push(cur);
          cur = "";
        } else if (ch === "\n" && !inQuotes) {
          row.push(cur);
          if (row.some(cell => String(cell || "").trim() !== "")) rows.push(row);
          row = [];
          cur = "";
        } else if (ch !== "\r") {
          cur += ch;
        }
      }
      row.push(cur);
      if (row.some(cell => String(cell || "").trim() !== "")) rows.push(row);
      return rows;
    };
    const parseImportRows = (text) => {
      const cleaned = (text || "").replace(/^\uFEFF/, "").trim();
      if (!cleaned) return [];
      const sampleHeader = cleaned.split(/\r?\n/, 1)[0] || "";
      const delimiter = sampleHeader.includes("\t") ? "\t" : ",";
      const rows = parseDelimitedRows(cleaned, delimiter);
      if (rows.length < 2) return [];
      const headers = rows[0].map(h => String(h || "").trim());
      return rows.slice(1).map(vals => headers.reduce((obj, h, i) => ({ ...obj, [h]: String(vals[i] || "").trim() }), {}));
    };
    const normalizeImportRows = (text) => {
      const rows = parseImportRows(text);
      if (!rows.length) return [];
      const headers = Object.keys(rows[0]);
      const isBankStatementTxt = headers.includes("Value Date") && headers.includes("Reference Number") && headers.includes("Transaction");
      if (!isBankStatementTxt) return rows;
      return rows.map(row => {
        const creditC = toCents(row["Credit"] || "");
        const debitC = toCents(row["Debit"] || "");
        const signedAmountC = creditC > 0 ? creditC : -debitC;
        const date = (row["Value Date"] || "").trim();
        const reference = (row["Reference Number"] || "").trim();
        return {
          txn_date: date,
          reference,
          narration: (row["Transaction"] || "").trim(),
          amount_fils: String(signedAmountC),
          bank_account_code: "1002",
          external_id: `${reference || "ROW"}__${date}__${signedAmountC}`,
          source: "march2026_txt_import",
          party: (row["Party"] || "").trim(),
          balance: (row["Balance"] || "").trim(),
        };
      });
    };
    const parseImportDate = (value) => {
      const m = (value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      const mText = (value || "").match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
      if (mText) {
        const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
        const month = monthMap[mText[2]];
        if (month) return `${mText[3]}-${month}-${mText[1].padStart(2, "0")}`;
      }
      return value || "";
    };
    const bankAccountCodeFromImport = (raw) => {
      const match = (raw || "").match(/\d{4}/);
      if (!match) return "";
      return match[0] === "1102" ? "1002" : match[0];
    };
    const mergeImportAccounts = (accounts) => {
      const byCode = new Map((accounts || []).map(a => [a.code, a]));
      BANK_IMPORT_REQUIRED_ACCOUNTS.forEach(a => { if (!byCode.has(a.code)) byCode.set(a.code, a); });
      return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
    };
    const analyzeBankImport = ({ csvText, accounts, txns, narrationMap }) => {
      const mergedAccounts = mergeImportAccounts(accounts || []);
      const byCode = code => mergedAccounts.find(a => a.code === code);
      const bankAccountIds = new Set(mergedAccounts.filter(a => a.isBank || a.code === "1001").map(a => a.id));
      const existingKeys = new Set((txns || []).map(t => t.external_id).filter(Boolean));
      const existingBankTxnKeys = new Set((txns || []).map(t => {
        const signedAmount = (t.lines || [])
          .filter(l => bankAccountIds.has(l.accountId))
          .reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0);
        if (!t.ref || !t.date || !signedAmount) return "";
        return `${t.ref}__${t.date}__${signedAmount}`;
      }).filter(Boolean));
      const seenImportKeys = new Set();
      const rows = normalizeImportRows(csvText).map((row, idx) => {
        const date = parseImportDate(row.txn_date);
        const amountC = parseInt(row.amount_fils || "0", 10) || 0;
        const bankCode = bankAccountCodeFromImport(row.bank_account_code);
        const bankAccount = byCode(bankCode) || mergedAccounts.find(a => a.isBank) || byCode("1001");
        const offsetCode = narrationMap[row.narration] || "";
        const offsetAccount = byCode(offsetCode);
        const externalId = row.external_id || `${row.reference || "ROW"}__${date}__${amountC}`;
        const bankTxnKey = `${row.reference || "ROW"}__${date}__${amountC}`;
        const duplicate = seenImportKeys.has(externalId) || existingKeys.has(externalId) || existingBankTxnKeys.has(bankTxnKey);
        seenImportKeys.add(externalId);
        let issue = "";
        if (!date) issue = "Missing date";
        else if (!row.reference) issue = "Missing reference";
        else if (!bankAccount) issue = "Bank account not found";
        else if (!offsetAccount) issue = "Map this narration to an account";
        else if (!amountC) issue = "Zero amount";

        const absC = Math.abs(amountC);
        const lineMemo = `${row.narration || "Bank transaction"}${row.reference ? ` | ${row.reference}` : ""}${row.party ? ` | ${row.party}` : ""}`;
        const lines = issue ? [] : (amountC > 0 ? [
          { id: uid(), accountId: bankAccount.id, debit: absC, credit: 0, memo: lineMemo },
          { id: uid(), accountId: offsetAccount.id, debit: 0, credit: absC, memo: lineMemo },
        ] : [
          { id: uid(), accountId: offsetAccount.id, debit: absC, credit: 0, memo: lineMemo },
          { id: uid(), accountId: bankAccount.id, debit: 0, credit: absC, memo: lineMemo },
        ]);

        const txn = issue ? null : {
          id: uid(),
          date,
          description: row.narration || "Bank Import",
          ref: row.reference,
          counterparty: row.party || "",
          tags: `bank-import ${row.source || "csv_import"}`.trim(),
          txnType: "BK",
          isVoid: false,
          lines,
          createdAt: new Date().toISOString(),
          external_id: externalId,
          source: row.source || "csv_import",
          bank_account_code: bankCode,
          import_narration: row.narration || "",
          import_amount: amountC
        };

        return { idx, row, date, amountC, bankAccount, offsetAccount, externalId, duplicate, issue, txn };
      });

      const categories = Object.values(rows.reduce((acc, item) => {
        const key = item.row.narration || "Unknown";
        if (!acc[key]) acc[key] = { narration: key, count: 0, accountCode: narrationMap[key] || "" };
        acc[key].count += 1;
        acc[key].accountCode = narrationMap[key] || "";
        return acc;
      }, {})).sort((a, b) => a.narration.localeCompare(b.narration));

      return {
        rows,
        categories,
        unresolved: rows.filter(r => r.issue),
        duplicates: rows.filter(r => !r.issue && r.duplicate),
        ready: rows.filter(r => !r.issue && !r.duplicate),
        accounts: mergedAccounts
      };
    };

    // Audit logging
    const logAudit = async (action, details, userRole, userEmail) => {
      try {
        await db.collection('audit_logs').add({
          timestamp: new Date().toISOString(),
          userId: auth.currentUser?.uid,
          userEmail: userEmail || auth.currentUser?.email,
          userRole, action, details, success: true
        });
      } catch (err) { console.error('Audit log error:', err); }
    };
    const archiveDeletedDeals = async (deals, reason, userRole, userEmail, extra = {}) => {
      if (!deals || !deals.length) return;
      const batch = db.batch();
      const archivedAt = new Date().toISOString();
      deals.forEach(deal => {
        const ref = db.collection('deleted_deals_archive').doc();
        batch.set(ref, {
          id: ref.id,
          archived_at: archivedAt,
          archived_by_uid: auth.currentUser?.uid || "",
          archived_by_email: userEmail || auth.currentUser?.email || "",
          archived_by_role: userRole || "",
          reason,
          deal_id: deal.id || "",
          deal_snapshot: deal,
          ...extra
        });
      });
      await batch.commit();
    };

    // ── CLEAN CHART OF ACCOUNTS ───────────────────────
    // NO Accounts Receivable, NO Accounts Payable — cash-settled only
    const SEED_ACCOUNTS = [
      { id: "a1001", code: "1001", name: "Cash", type: "Asset", isBank: false, isCash: true, isOutputVAT: false, isInputVAT: false },
      { id: "a1002", code: "1002", name: "Bank — Mashreq Bank", type: "Asset", isBank: true, isOutputVAT: false, isInputVAT: false },
      { id: "a1004", code: "1004", name: "Prepaid Expenses", type: "Asset", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a1201", code: "1201", name: "Input VAT Recoverable", type: "Asset", isBank: false, isOutputVAT: false, isInputVAT: true },
      { id: "a1500", code: "1500", name: "Furniture & Fixtures", type: "Asset", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a1510", code: "1510", name: "Computers & Laptops", type: "Asset", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a2101", code: "2101", name: "Output VAT Payable", type: "Liability", isBank: false, isOutputVAT: true, isInputVAT: false },
      { id: "a2105", code: "2105", name: "VAT Rounding Adjustment", type: "Liability", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a2200", code: "2200", name: "Loan Payable", type: "Liability", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a3000", code: "3000", name: "Capital Injection", type: "Equity", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a3002", code: "3002", name: "Retained Earnings", type: "Equity", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a3100", code: "3100", name: "Owner Drawings", type: "Equity", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a4010", code: "4010", name: "Seller Commission", type: "Revenue", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a4020", code: "4020", name: "Rental Commission", type: "Revenue", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5000", code: "5000", name: "Admin Salary", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5010", code: "5010", name: "Employee Salaries", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5020", code: "5020", name: "Manager Salary", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5030", code: "5030", name: "Broker Incentive", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5100", code: "5100", name: "Office Rent", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5110", code: "5110", name: "DEWA — Electricity & Water", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5120", code: "5120", name: "Empower — Cooling", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5130", code: "5130", name: "Internet", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5140", code: "5140", name: "Communication", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5150", code: "5150", name: "Cleaning Fees", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5160", code: "5160", name: "Office Supplies", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5200", code: "5200", name: "Property Finder", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5210", code: "5210", name: "Bayut Advertising", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5220", code: "5220", name: "Marketing", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5230", code: "5230", name: "CRM & Software", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5300", code: "5300", name: "Transportation", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5400", code: "5400", name: "Accountant Registration", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5410", code: "5410", name: "Accountant Services", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5420", code: "5420", name: "Recruitment Fees", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5430", code: "5430", name: "Trakheesi & Licensing", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5500", code: "5500", name: "Commission Payment to Brokers", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5510", code: "5510", name: "Secondary Market Agent Payment", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a5600", code: "5600", name: "Bank Fees", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a2201", code: "2201", name: "Bank Adjustment Clearing", type: "Liability", isBank: false, isOutputVAT: false, isInputVAT: false },
      { id: "a6000", code: "6000", name: "Legal Services", type: "Expense", isBank: false, isOutputVAT: false, isInputVAT: false },
    ];

    // Empty seeds — clean start
    const SEED_TXNS = [];
    const SEED_DEALS = [
      {
        id: "d001", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Verden1a 4 — Unit 1402", developer: "Object 1", developer_id: "dev005",
        broker_id: "BR014", broker_name: "Tarek Salhani",
        customer_id: "c011", client_name: "Ghassan Mahmoud Badran",
        transaction_value: 69382600, commission_pct: "6", expected_commission_net: 4162956,
        vat_applicable: true, invoice_no: "061", unit_no: "1402",
        notes: "AML: 1000057 | KYC sent: YES | KYC received: NO",
        created_at: "2026-01-07"
      },
      {
        id: "d002", type: "Off-Plan", stage: "Booking Form Signed",
        property_name: "Reywan Hay Al Badee — Unit R1-6561", developer: "Al Marwan Real Estate", developer_id: "dev001",
        broker_id: "BR001", broker_name: "Faoud Dada",
        customer_id: "c001", client_name: "Humam Atik",
        transaction_value: 86607700, commission_pct: "5", expected_commission_net: 4330385,
        vat_applicable: true, invoice_no: "", unit_no: "R1-6561",
        notes: "",
        created_at: "2026-01-12"
      },
      {
        id: "d003", type: "Off-Plan", stage: "Booking Form Signed",
        property_name: "Reywan Hay Al Badee — Unit R1-6560", developer: "Al Marwan Real Estate", developer_id: "dev001",
        broker_id: "BR001", broker_name: "Faoud Dada",
        customer_id: "c001", client_name: "Humam Atik",
        transaction_value: 86608800, commission_pct: "5", expected_commission_net: 4330440,
        vat_applicable: true, invoice_no: "", unit_no: "R1-6560",
        notes: "",
        created_at: "2026-01-12"
      },
      {
        id: "d004", type: "Off-Plan", stage: "Booking Form Signed",
        property_name: "Ali Marwan Real Estate — Unit 6215", developer: "Al Marwan Real Estate", developer_id: "dev001",
        broker_id: "BR001", broker_name: "Faoud Dada",
        customer_id: "c031", client_name: "Mohammed Juma Salem Juma Alkaabi",
        transaction_value: 103460000, commission_pct: "5", expected_commission_net: 5173000,
        vat_applicable: true, invoice_no: "", unit_no: "6215",
        notes: "",
        created_at: "2026-01-15"
      },
      {
        id: "d005", type: "Off-Plan", stage: "First Payment Paid",
        property_name: "Maybach Ultimate Luxury — Unit MBUL-B710", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR013", broker_name: "Rajab Zahrawy",
        customer_id: "c009", client_name: "Habiba Juma Abdulrahmana Alashram Alfalasi",
        transaction_value: 135000000, commission_pct: "5", expected_commission_net: 6750000,
        vat_applicable: true, invoice_no: "", unit_no: "MBUL-B710",
        notes: "",
        created_at: "2026-01-16"
      },
      {
        id: "d006", type: "Off-Plan", stage: "Commission Collected",
        property_name: "South Hills 3 — Unit 515", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR002", broker_name: "Ahmad Ibrahim",
        customer_id: "c031", client_name: "Baraa Eskef",
        transaction_value: 104040000, commission_pct: "5", expected_commission_net: 5202000,
        vat_applicable: true, invoice_no: "", unit_no: "515",
        notes: "",
        created_at: "2026-02-03"
      },
      {
        id: "d007", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Samana Developers — 512", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR011", broker_name: "Tarek Momenh",
        customer_id: "c022", client_name: "Sharmeen Danish Navodia",
        transaction_value: 96750000, commission_pct: "5", expected_commission_net: 4837500,
        vat_applicable: true, invoice_no: "", unit_no: "512",
        notes: "",
        created_at: "2026-02-03"
      },
      {
        id: "d008", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Celesto 3 — Unit 1006", developer: "Tarrad Developers", developer_id: "dev006",
        broker_id: "BR006", broker_name: "Tarek Momenh",
        customer_id: "c008", client_name: "Muhammadkhon Numonjonov",
        transaction_value: 34875000, commission_pct: "5", expected_commission_net: 1743750,
        vat_applicable: true, invoice_no: "", unit_no: "1006",
        notes: "",
        created_at: "2026-02-03"
      },
      {
        id: "d009", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Seempm Properties — 302", developer: "Seempm Properties", developer_id: "dev007",
        broker_id: "BR007", broker_name: "Tarek Momenh",
        customer_id: "c023", client_name: "Elias Silva Costa",
        transaction_value: 95200000, commission_pct: "5", expected_commission_net: 4760000,
        vat_applicable: true, invoice_no: "", unit_no: "302",
        notes: "",
        created_at: "2026-02-03"
      },
      {
        id: "d010", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Samana Boulevard Heights — Unit 612", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR003", broker_name: "Mohamad Teryaki",
        customer_id: "c025", client_name: "Elisa Silva Costa",
        transaction_value: 95400000, commission_pct: "5", expected_commission_net: 4770000,
        vat_applicable: true, invoice_no: "", unit_no: "612",
        notes: "",
        created_at: "2026-02-12"
      },
      {
        id: "d011", type: "Off-Plan", stage: "Commission Collected",
        property_name: "Samana Boulevard Heights — Unit 1411", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR003", broker_name: "Mohamad Teryaki",
        customer_id: "c015", client_name: "Kshitiz Arun Solomon",
        transaction_value: 96100000, commission_pct: "5", expected_commission_net: 4805000,
        vat_applicable: true, invoice_no: "", unit_no: "1411",
        notes: "",
        created_at: "2026-02-13"
      },
      {
        id: "d012", type: "Secondary", stage: "Pending",
        property_name: "Viridis B — Unit 1301", developer: "Viridis", developer_id: "dev008",
        broker_id: "BR012", broker_name: "Faoud Dada",
        customer_id: "c004", client_name: "Saeed Mir Manzoor Ul Haq",
        transaction_value: 40000000, commission_pct: "2", expected_commission_net: 800000,
        vat_applicable: true, invoice_no: "", unit_no: "1301",
        notes: "Seller: Heir To Fahad S Askar (Zeyad)",
        created_at: "2026-01-16"
      },
      {
        id: "d013", type: "Secondary", stage: "Pending",
        property_name: "Skycourts Tower A — Unit P304", developer: "Dubai Properties", developer_id: "dev009",
        broker_id: "BR005", broker_name: "Tarek Mohmneh",
        customer_id: "c008", client_name: "Muhammadkhon Numonjonov",
        transaction_value: 23335000, commission_pct: "2", expected_commission_net: 466700,
        vat_applicable: true, invoice_no: "", unit_no: "P304",
        notes: "",
        created_at: "2026-01-17"
      },
      {
        id: "d014", type: "Secondary", stage: "Pending",
        property_name: "Skycourts Tower A — Unit 1308", developer: "Dubai Properties", developer_id: "dev009",
        broker_id: "BR005", broker_name: "Tarek Mohmneh",
        customer_id: "c013", client_name: "Tarek Mohammed Ragab",
        transaction_value: 25128000, commission_pct: "2", expected_commission_net: 502560,
        vat_applicable: true, invoice_no: "", unit_no: "1308",
        notes: "",
        created_at: "2026-01-23"
      },
      {
        id: "d015", type: "Secondary", stage: "Pending",
        property_name: "Skycourts Tower C — Unit 1116", developer: "Dubai Properties", developer_id: "dev009",
        broker_id: "BR005", broker_name: "Tarek Mohmneh",
        customer_id: "c015", client_name: "Kshitiz Arun Solomon",
        transaction_value: 21950000, commission_pct: "2", expected_commission_net: 439000,
        vat_applicable: true, invoice_no: "", unit_no: "1116",
        notes: "",
        created_at: "2026-01-31"
      },
      {
        id: "d016", type: "Rental", stage: "Pending",
        property_name: "Binghatti Tower — Unit 1002", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR010", broker_name: "Abdulsalam Alaihan",
        customer_id: "c006", client_name: "Joshua Ethan Taylor",
        transaction_value: 1485000, commission_pct: "5", expected_commission_net: 74250,
        vat_applicable: false, invoice_no: "", unit_no: "1002",
        notes: "",
        created_at: "2026-01-31"
      },
      {
        id: "d017", type: "Off-Plan", stage: "Booked",
        property_name: "Hayat Avenue — Unit 116", developer: "Hayat Avenue", developer_id: "dev010",
        broker_id: "BR009", broker_name: "Shuaib Thallichan",
        customer_id: "c017", client_name: "Saira Bano Noman Ahmed Lakhani",
        transaction_value: 11900000, commission_pct: "2.5", expected_commission_net: 297500,
        vat_applicable: true, invoice_no: "", unit_no: "116",
        notes: "",
        created_at: "2026-02-17"
      },
      {
        id: "d018", type: "Off-Plan", stage: "Booked",
        property_name: "Aurora Real Estate Development — 116", developer: "Aurora Real Estate", developer_id: "dev011",
        broker_id: "BR009", broker_name: "Shuaib Thallichan",
        customer_id: "c018", client_name: "Abdoul Ibrahim El Bazi",
        transaction_value: 10000000, commission_pct: "2.5", expected_commission_net: 250000,
        vat_applicable: true, invoice_no: "", unit_no: "116",
        notes: "",
        created_at: "2026-02-17"
      },
      {
        id: "d019", type: "Off-Plan", stage: "Booked",
        property_name: "Skycourts Tower B — Unit 06", developer: "Skycourts", developer_id: "dev009",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c019", client_name: "Daleel Singh",
        transaction_value: 2000000, commission_pct: "5", expected_commission_net: 100000,
        vat_applicable: true, invoice_no: "", unit_no: "06",
        notes: "",
        created_at: "2026-02-17"
      },
      {
        id: "d020", type: "Rental", stage: "Booked",
        property_name: "Binghatti Phoenix — Unit 419", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c020", client_name: "Ola Alaa Hussein Hussein",
        transaction_value: 700000, commission_pct: "5", expected_commission_net: 35000,
        vat_applicable: false, invoice_no: "", unit_no: "419",
        notes: "",
        created_at: "2026-02-19"
      },
      {
        id: "d021", type: "Rental", stage: "Booked",
        property_name: "Binghatti Onyx — Unit 1909", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c006", client_name: "Joshua Ethan Taylor",
        transaction_value: 1200000, commission_pct: "5", expected_commission_net: 60000,
        vat_applicable: false, invoice_no: "", unit_no: "1909",
        notes: "",
        created_at: "2026-02-18"
      },
      {
        id: "d022", type: "Off-Plan", stage: "Booked",
        property_name: "Azizi Riviera 15 — Unit 728", developer: "Azizi Developments", developer_id: "dev012",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c010", client_name: "Sadaf Eftekhar Ahmad Kokar",
        transaction_value: 5000000, commission_pct: "5", expected_commission_net: 250000,
        vat_applicable: true, invoice_no: "", unit_no: "728",
        notes: "",
        created_at: "2026-02-21"
      },
      {
        id: "d023", type: "Off-Plan", stage: "Booked",
        property_name: "Azizi Mirage 7 Tower 2 — Unit 332", developer: "Azizi Developments", developer_id: "dev012",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c019", client_name: "Roshan Mallepati Shrestha",
        transaction_value: 2338000, commission_pct: "5", expected_commission_net: 116900,
        vat_applicable: true, invoice_no: "", unit_no: "332",
        notes: "",
        created_at: "2026-02-22"
      },
      {
        id: "d024", type: "Off-Plan", stage: "Booked",
        property_name: "Binghatti Lavender — Unit 1005", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c020", client_name: "Holly Frances Godwin",
        transaction_value: 1200000, commission_pct: "5", expected_commission_net: 60000,
        vat_applicable: false, invoice_no: "", unit_no: "1005",
        notes: "",
        created_at: "2026-02-04"
      },
      {
        id: "d025", type: "Off-Plan", stage: "Booked",
        property_name: "Binghatti Onyx — Unit 510", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c010", client_name: "Sadaf Eftekhar Ahmad Kokar",
        transaction_value: 5000000, commission_pct: "5", expected_commission_net: 250000,
        vat_applicable: true, invoice_no: "", unit_no: "510",
        notes: "",
        created_at: "2026-02-02"
      },
      {
        id: "d026", type: "Off-Plan", stage: "Booked",
        property_name: "Binghatti Onyx — Unit 304", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR012", broker_name: "Monaf Hamza",
        customer_id: "c020", client_name: "Face Off Vacation Homes Rental LLC",
        transaction_value: 5000000, commission_pct: "5", expected_commission_net: 250000,
        vat_applicable: true, invoice_no: "", unit_no: "304",
        notes: "",
        created_at: "2026-02-19"
      },
      {
        id: "d027", type: "Off-Plan", stage: "Booked",
        property_name: "Binghatti Emerald — Unit 208", developer: "Binghatti Developers", developer_id: "dev002",
        broker_id: "BR010", broker_name: "Faoud Dada",
        customer_id: "c024", client_name: "BMF Fashion Trading LLC",
        transaction_value: 1000000, commission_pct: "5", expected_commission_net: 50000,
        vat_applicable: false, invoice_no: "", unit_no: "208",
        notes: "",
        created_at: "2026-11-30"
      },
      {
        id: "d028", type: "Off-Plan", stage: "Booked",
        property_name: "Royal Park — Unit F-217", developer: "Royal Park", developer_id: "dev013",
        broker_id: "BR014", broker_name: "Faoud Relative",
        customer_id: "c025", client_name: "Hoda Al-Asrawi",
        transaction_value: 67079520, commission_pct: "5", expected_commission_net: 3353976,
        vat_applicable: true, invoice_no: "", unit_no: "F-217",
        notes: "",
        created_at: "2025-06-31"
      },
      {
        id: "d029", type: "Off-Plan", stage: "Booked",
        property_name: "Samana Resorts — Unit A906", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR011", broker_name: "Monaf Hamza",
        customer_id: "c034", client_name: "Hoda Al-Asrawi",
        transaction_value: 53358427, commission_pct: "5", expected_commission_net: 2667921,
        vat_applicable: true, invoice_no: "", unit_no: "A906",
        notes: "",
        created_at: "2025-07-31"
      },
      {
        id: "d030", type: "Off-Plan", stage: "Booked",
        property_name: "Samana Portofino — Unit A908", developer: "Samana Developers", developer_id: "dev004",
        broker_id: "BR011", broker_name: "Monaf Hamza",
        customer_id: "c035", client_name: "Monaf Hamza",
        transaction_value: 30318427, commission_pct: "5", expected_commission_net: 1515921,
        vat_applicable: true, invoice_no: "", unit_no: "A908",
        notes: "",
        created_at: "2025-07-31"
      },
      {
        id: "d031", type: "Off-Plan", stage: "Booked",
        property_name: "Vivanti Residences — Unit A901", developer: "Vivanti", developer_id: "dev014",
        broker_id: "BR011", broker_name: "Aldel Momham",
        customer_id: "c036", client_name: "Aldel Momham",
        transaction_value: 30000000, commission_pct: "5", expected_commission_net: 1500000,
        vat_applicable: true, invoice_no: "", unit_no: "A901",
        notes: "",
        created_at: "2025-07-24"
      },
      {
        id: "d032", type: "Off-Plan", stage: "Booked",
        property_name: "Palace Residences Hillside A — Unit 16-1617", developer: "Palace Residences", developer_id: "dev015",
        broker_id: "BR012", broker_name: "Khalid Jamil M Alsadi",
        customer_id: "c037", client_name: "Khalid Jamil M Alsadi",
        transaction_value: 70995232, commission_pct: "5", expected_commission_net: 3549766,
        vat_applicable: true, invoice_no: "", unit_no: "16-1617",
        notes: "",
        created_at: "2025-10-24"
      },
      {
        id: "d033", type: "Off-Plan", stage: "Booked",
        property_name: "The Valley Business Park — Unit TH-316", developer: "The Valley", developer_id: "dev016",
        broker_id: "BR012", broker_name: "Khalid Jamil M Alsadi",
        customer_id: "c037", client_name: "Khalid Jamil M Alsadi",
        transaction_value: 16883552, commission_pct: "5", expected_commission_net: 844177,
        vat_applicable: true, invoice_no: "", unit_no: "TH-316",
        notes: "",
        created_at: "2025-10-24"
      },
      {
        id: "d034", type: "Off-Plan", stage: "Booked",
        property_name: "Emaar Properties (TV Vinder) — Unit TH-316", developer: "Emaar", developer_id: "dev017",
        broker_id: "BR012", broker_name: "Faoud Dada",
        customer_id: "c037", client_name: "Faoud Dada",
        transaction_value: 16883552, commission_pct: "5", expected_commission_net: 844177,
        vat_applicable: true, invoice_no: "", unit_no: "TH-316",
        notes: "",
        created_at: "2025-10-24"
      },
      {
        id: "d035", type: "Off-Plan", stage: "Booked",
        property_name: "Vista by Vision — Unit 203", developer: "Vision", developer_id: "dev018",
        broker_id: "BR013", broker_name: "Marwa",
        customer_id: "c038", client_name: "Mansha Siddique",
        transaction_value: 3461400, commission_pct: "5", expected_commission_net: 173070,
        vat_applicable: true, invoice_no: "", unit_no: "203",
        notes: "",
        created_at: "2025-10-01"
      }
    ];

    const SEED_VENDORS = [
      { id: "v001", name: "Vendor One", category: "Supplies", phone: "0500000001", email: "vendor1@example.com", trn: "" },
      { id: "v002", name: "Vendor Two", category: "Services", phone: "0500000002", email: "vendor2@example.com", trn: "" }
    ];

    const SEED_CUSTOMERS = [
      { id: "c001", name: "Humam Atik", nationality: "Dominica", phone: "558708435", email: "humam@alateeqmarble.com", trn: "", address: "" },
      { id: "c002", name: "Mohammed Juma Salem Juma Alkaabi", nationality: "UAE", phone: "507431000", email: "", trn: "", address: "" },
      { id: "c003", name: "Heir To Fahad S Askar (Seller) - Zeyad", nationality: "Saudi Arabia", phone: "553222113", email: "zeh.fab@gmail.com", trn: "", address: "" },
      { id: "c004", name: "Saeed Mir Manzoor Ul Haq (Buyer)", nationality: "Pakistan", phone: "504162367", email: "saeedmir@gmail.com", trn: "", address: "" },
      { id: "c005", name: "VS Home Living Vacation Homes Rental LLC", nationality: "China", phone: "554592967", email: "vshomedubai@gmail.com", trn: "", address: "" },
      { id: "c006", name: "Joshua Ethan Taylor", nationality: "UK", phone: "585331996", email: "josh.taylor96@outlook.com", trn: "", address: "" },
      { id: "c007", name: "KARL SALBI (Seller)", nationality: "Lebanon", phone: "554971175", email: "salibikarl@gmail.com", trn: "", address: "" },
      { id: "c008", name: "MUHAMMADKHON NUMONJONOV (Buyer)", nationality: "Tajikistan", phone: "585170054", email: "Numonjonov.mm@gmail.com", trn: "", address: "" },
      { id: "c009", name: "Habiba Juma Abdulrahmana Alashram Alfalasi", nationality: "UAE", phone: "501011100", email: "habiba.alfalasi@hotmail.com", trn: "", address: "" },
      { id: "c010", name: "Sadaf Eftekhar Ahmad Kokar", nationality: "Iran", phone: "522752154", email: "sadafkokar404@gmail.com", trn: "", address: "" },
      { id: "c011", name: "Ghassan Mahmoud Badran", nationality: "Lebanon", phone: "9613732563", email: "ghassan.m.badran@hotmail.com", trn: "", address: "" },
      { id: "c012", name: "Salwa Humaid Saeed Humaid Asban (Seller)", nationality: "UAE", phone: "505167377", email: "uae_4e@hotmail.com", trn: "", address: "" },
      { id: "c013", name: "TAREK MOHAMMED RAGAB MOHAMMED ELREMILY (Buyer)", nationality: "Egypt", phone: "54521575", email: "Tarekelremily@gmail.com", trn: "", address: "" },
      { id: "c014", name: "MAHMOUD ABDELMEGUID ALI HAGAG (Seller)", nationality: "Egypt", phone: "505638461", email: "mhaggag@uaeu.ac.ae", trn: "", address: "" },
      { id: "c015", name: "KSHITIZ ARUN SOLOMON (Buyer)", nationality: "India", phone: "56992728", email: "Kshitiz.solomon@gmail.com", trn: "", address: "" },
      { id: "c016", name: "MALF Holiday Homes LLC", nationality: "", phone: "555888794", email: "malfhpropertymanagement@gmail.com", trn: "", address: "" },
      { id: "c017", name: "BANDER AHMED H ALAITHAN (Seller)", nationality: "Saudi Arabia", phone: "966540070071", email: "alaithanbander@hotmail.com", trn: "", address: "" },
      { id: "c018", name: "Ahmad Saad Ansari & Amina Ahmed (Buyer)", nationality: "UK", phone: "41792713906", email: "ansarisaad773@gmail.com", trn: "", address: "" },
      { id: "c019", name: "Roshan Mallepati Shrestha", nationality: "Nepal", phone: "565224547", email: "rmallepati@gmail.com", trn: "", address: "" },
      { id: "c020", name: "Holly Frances Godwin", nationality: "UK", phone: "509215394", email: "holly_godwin@live.co.uk", trn: "", address: "" },
      { id: "c021", name: "Yazan Montaser Mohamed Izzaldin Hamdan", nationality: "Jordan", phone: "502580762", email: "h3hamdan@outlook.com", trn: "", address: "" },
      { id: "c022", name: "Sharmeen Danish Navodia", nationality: "Pakistan", phone: "551457135", email: "sharmeenavodia@gmail.com", trn: "", address: "" },
      { id: "c023", name: "MANEA ABDULLA HASAN ALMAJED ALALI", nationality: "UAE", phone: "971555555742", email: "manea_9@yahoo.com", trn: "", address: "" },
      { id: "c024", name: "MIHIR NITINKUMAR SONI NITINKUMAR BALKRISHNA SONI", nationality: "India", phone: "508946353", email: "mihirsoni8547@gmail.com", trn: "", address: "" },
      { id: "c025", name: "Elias Silva Costa", nationality: "Brazil", phone: "522798530", email: "Ecosta183@gmail.com", trn: "", address: "" },
      { id: "c026", name: "Abdou Ibrahim El Bazi (Seller)", nationality: "Lebanon", phone: "506171800", email: "b6171800@gmail.com", trn: "", address: "" },
      { id: "c027", name: "Saira Bano Noman Ahmed Lakhani", nationality: "Pakistan", phone: "556679459", email: "Zohairlakhani@hotmail.com", trn: "", address: "" },
      { id: "c028", name: "Mustapha Kanbar", nationality: "Lebanon", phone: "447867508912", email: "", trn: "", address: "" },
      { id: "c029", name: "Face Off Vacation Homes Rental LLC", nationality: "", phone: "588630262", email: "sacario@live.nl", trn: "", address: "" },
      { id: "c030", name: "BMF Fashion Trading LLC", nationality: "UK", phone: "564297471", email: "katie.illingworth@fashion-uk.com", trn: "", address: "" },
      { id: "c031", name: "Baraa Eskef", nationality: "Turkey", phone: "5518821500", email: "dr.baraaaluosef@gmail.com", trn: "", address: "" },
      { id: "c032", name: "Daljeet Singh", nationality: "India", phone: "501799017", email: "Singdaj@gmail.com", trn: "", address: "" },
      { id: "c033", name: "Ola Alaa Hussein Hussein", nationality: "Iraq", phone: "551927495", email: "aulaali1@hotmail.com", trn: "", address: "" },
      { id: "c034", name: "Farah Amhaz", nationality: "Lebanon", phone: "506580018", email: "farahamhaz2@gmail.com", trn: "", address: "" },
      { id: "c035", name: "Khalid Jamil M Alsaadi", nationality: "Saudi Arabia", phone: "", email: "", trn: "", address: "" },
      { id: "c036", name: "Hoda Al-Asrawi", nationality: "", phone: "", email: "", trn: "", address: "" },
      { id: "c037", name: "Adel Momnah", nationality: "", phone: "", email: "", trn: "", address: "" },
      { id: "c038", name: "Mansha Siddique", nationality: "", phone: "", email: "", trn: "", address: "" },
    ];

    const SEED_BROKERS = [
      { id: "BR001", name: "Abdulsalam Alaithan", nationality: "Saudi Arabia", phone: "502757603", rera_no: "64897", rera_exp: "14.06.2026" },
      { id: "BR002", name: "Ahmad Ibrahim", nationality: "Lebanon", phone: "506076506", rera_no: "83093", rera_exp: "14.06.2026" },
      { id: "BR003", name: "Faoud Dada", nationality: "Lebanon", phone: "526920033", rera_no: "78849", rera_exp: "14.06.2026" },
      { id: "BR004", name: "Marwa Khiari", nationality: "Tunisia", phone: "552129369", rera_no: "", rera_exp: "" },
      { id: "BR005", name: "Monaf Hamza", nationality: "Syria", phone: "503038894", rera_no: "84529", rera_exp: "12.06.2026" },
      { id: "BR006", name: "Nancy Tfaily", nationality: "Lebanon", phone: "554192910", rera_no: "", rera_exp: "" },
      { id: "BR007", name: "Mohamed Kamal", nationality: "Egypt", phone: "552755399", rera_no: "", rera_exp: "" },
      { id: "BR008", name: "Tarek Momneh", nationality: "Canada", phone: "501422789", rera_no: "91804", rera_exp: "10.12.2026" },
      { id: "BR009", name: "Nene Belquz Diallo", nationality: "Liberia", phone: "522559448", rera_no: "94313", rera_exp: "10.02.2027" },
      { id: "BR010", name: "Shuhaib Thalichalam", nationality: "India", phone: "522290234", rera_no: "", rera_exp: "" },
      { id: "BR011", name: "Jerine Mathews", nationality: "India", phone: "585987400", rera_no: "", rera_exp: "" },
      { id: "BR012", name: "Rajab Zahrawy", nationality: "Syria", phone: "585880024", rera_no: "", rera_exp: "" },
      { id: "BR013", name: "Mohamad Teryaki", nationality: "Lebanon", phone: "558388197", rera_no: "", rera_exp: "" },
      { id: "BR014", name: "Tarek Salhani", nationality: "Saudi Arabia", phone: "557310587", rera_no: "", rera_exp: "" },
      { id: "BR015", name: "Mohammed Teryaki", nationality: "Lebanon", phone: "558388197", rera_no: "", rera_exp: "" },
      { id: "BR016", name: "Alaa Muneer", nationality: "Jordan", phone: "501901890", rera_no: "", rera_exp: "" }
    ];

    const SEED_DEVELOPERS = [
      { id: "dev001", name: "Emaar Properties", signed_agreement: true, expiry_date: "2026-06-14", contact_person: "", email: "", phone: "" },
      { id: "dev002", name: "Binghatti Developers", signed_agreement: true, expiry_date: "2027-01-16", contact_person: "", email: "", phone: "" },
      { id: "dev003", name: "Ellington Properties", signed_agreement: true, expiry_date: "2026-01-24", contact_person: "", email: "", phone: "" },
      { id: "dev004", name: "Samana Developers", signed_agreement: true, expiry_date: "2026-11-12", contact_person: "", email: "", phone: "" },
      { id: "dev005", name: "Object 1", signed_agreement: true, expiry_date: "2026-07-24", contact_person: "", email: "", phone: "" },
      { id: "dev006", name: "Tarrad Developers", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev007", name: "Seenium Properties", signed_agreement: true, expiry_date: "2027-01-13", contact_person: "", email: "", phone: "" },
      { id: "dev008", name: "Ajmal Makan - Sharjah", signed_agreement: true, expiry_date: "2026-08-28", contact_person: "", email: "", phone: "" },
      { id: "dev009", name: "Al Rasikhoon Real Estate", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev010", name: "AYS Developers", signed_agreement: true, expiry_date: "2026-08-26", contact_person: "", email: "", phone: "" },
      { id: "dev011", name: "Casa Vista", signed_agreement: true, expiry_date: "2026-09-23", contact_person: "", email: "", phone: "" },
      { id: "dev012", name: "DAMAC Properties", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev013", name: "Dubai Properties", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev014", name: "Azizi Developments", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev015", name: "Aurora Real Estate Development", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev016", name: "Vision", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev017", name: "Reportage", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev018", name: "Synergy Properties", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev019", name: "Al Marwan Real Estate", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" },
      { id: "dev020", name: "Trillionaire Residence", signed_agreement: true, expiry_date: "2026-12-25", contact_person: "", email: "", phone: "" }
    ];

    // ── LEDGER ENGINE ─────────────────────────────────
    function buildLedger(transactions, accounts) {
      const ledger = {};
      for (let i = 0; i < accounts.length; i++) {
        ledger[accounts[i].id] = { debit: 0, credit: 0 };
      }
      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (t.isVoid) continue;
        const lines = t.lines || [];
        for (let j = 0; j < lines.length; j++) {
          const l = lines[j];
          if (!ledger[l.accountId]) ledger[l.accountId] = { debit: 0, credit: 0 };
          ledger[l.accountId].debit += (l.debit || 0);
          ledger[l.accountId].credit += (l.credit || 0);
        }
      }
      return ledger;
    }
    function accountBalance(acct, ledger) {
      const nb = NORMAL_BAL[acct.type] || "debit";
      const e = ledger[acct.id] || { debit: 0, credit: 0 };
      return nb === "debit" ? (e.debit - e.credit) : (e.credit - e.debit);
    }
    function isVATSettlementTxn(txn, accounts) {
      const byId = id => accounts.find(a => a.id === id);
      const lines = (txn?.lines || []).filter(l => (l.debit || 0) !== 0 || (l.credit || 0) !== 0);
      if (!lines.length) return false;

      const hasVatLine = lines.some(l => {
        const acc = byId(l.accountId);
        return acc && (acc.isOutputVAT || acc.isInputVAT);
      });
      if (!hasVatLine) return false;

      const hasSettlementCounterLine = lines.some(l => {
        const acc = byId(l.accountId);
        return acc && (acc.isBank || acc.code === "1001" || acc.isOutputVAT || acc.isInputVAT || acc.code === "2105");
      });
      if (!hasSettlementCounterLine) return false;

      const hasOperationalLine = lines.some(l => {
        const acc = byId(l.accountId);
        if (!acc) return false;
        if (acc.isBank || acc.code === "1001") return false;
        if (acc.isOutputVAT || acc.isInputVAT) return false;
        if (acc.code === "2105") return false;
        return true;
      });

      return !hasOperationalLine;
    }

    // ── CASH-SETTLED JOURNAL ENGINE ───────────────────
    function createJournalEngine({ accounts, txns, saveTxn }) {
      const byCode = code => accounts.find(a => a.code === code);
      const outputVAT = accounts.find(a => a.isOutputVAT);
      const inputVAT = accounts.find(a => a.isInputVAT);

      const makeLine = ({ accountId, debit = 0, credit = 0, memo = "", deal_id, broker_id, developer_id }) => ({
        id: uid(),
        accountId,
        debit,
        credit,
        memo,
        ...(deal_id !== undefined ? { deal_id } : {}),
        ...(broker_id !== undefined ? { broker_id } : {}),
        ...(developer_id !== undefined ? { developer_id } : {})
      });

      const computeVATSplit = (grossC, vatRate = 0) => {
        if (typeof grossC !== "number" || Number.isNaN(grossC) || !Number.isFinite(grossC)) throw new Error("Invalid gross amount");
        if (grossC < 0) throw new Error("Gross amount must be non-negative");
        if (vatRate < 0) throw new Error("VAT rate cannot be negative");

        const netC = vatRate > 0 ? Math.round(grossC / (1 + vatRate / 100)) : grossC;
        const vatC = Math.round(grossC - netC);
        const roundingAdjustment = grossC - (netC + vatC);
        if (Math.abs(roundingAdjustment) > 1) throw new Error(`VAT rounding loss exceeds 1 cent: adjustment=${roundingAdjustment}`);
        return { netC, vatC, roundingAdjustment };
      };

      const validateBalanced = (lines) => {
        const dr = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const cr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (dr !== cr) throw new Error(`Unbalanced: DR=${dr} CR=${cr}`);
      };

      // Post generic journal entry
      const post = ({ date, description, ref, counterparty = "", tags = "", txnType = "JV", lines, isVoid = false, commit = true }) => {
        validateBalanced(lines);
        const txn = { id: uid(), date, description, ref, counterparty, tags, txnType, isVoid, lines, createdAt: new Date().toISOString() };
        if (commit) saveTxn(txn);
        return txn;
      };

      // SALE RECEIPT — Commission collected immediately (no AR step)
      // DR Bank (gross) / CR Revenue (net) / CR Output VAT
      const postSaleReceipt = ({ date, deal, gross, vatRate = 5, bankCode = "1002", memo = "", commit = true }) => {
        if (!deal || !deal.id) throw new Error("deal_id is required for commission revenue tracking");
        if (!bankCode) throw new Error("bankCode is mandatory for a sale receipt");
        if (!deal.type || !["Off-Plan", "Secondary", "Rental"].includes(deal.type)) throw new Error(`Invalid deal type: ${deal.type}. Must be Off-Plan, Secondary, or Rental`);

        const bankA = byCode(bankCode) || accounts.find(a => a.isBank) || byCode("1001");
        const revenueCodeMap = { "Off-Plan": "4000", Secondary: "4010", Rental: "4020" };
        const revA = byCode(revenueCodeMap[deal.type]);
        const roundingA = byCode("2105") || byCode("5605");
        if (!bankA) throw new Error(`Bank account not found for code: ${bankCode}`);
        if (!revA) throw new Error(`Revenue account not found for deal type: ${deal.type}`);

        const grossC = toCents(gross);
        if (grossC <= 0) throw new Error("Gross amount must be positive");
        const { netC, vatC, roundingAdjustment } = computeVATSplit(grossC, vatRate);

        const lines = [
          makeLine({ accountId: bankA.id, debit: grossC, memo: `Receipt — ${deal?.property_name || memo}`, deal_id: deal?.id, broker_id: deal?.broker_id, developer_id: deal?.developer }),
          makeLine({ accountId: revA.id, credit: netC, memo: `Revenue — ${deal?.property_name || memo}`, deal_id: deal?.id, broker_id: deal?.broker_id, developer_id: deal?.developer }),
        ];
        if (vatC > 0) {
          if (!outputVAT) throw new Error("Missing Output VAT account");
          lines.push(makeLine({ accountId: outputVAT.id, credit: vatC, memo: `Output VAT ${vatRate}%`, deal_id: deal?.id }));
        }

        if (roundingAdjustment !== 0) {
          if (!roundingA) throw new Error("Missing VAT Rounding Adjustment account");
          if (roundingAdjustment > 0) {
            lines.push(makeLine({ accountId: roundingA.id, credit: roundingAdjustment, memo: "VAT rounding adjustment", deal_id: deal?.id }));
          } else {
            lines.push(makeLine({ accountId: roundingA.id, debit: -roundingAdjustment, memo: "VAT rounding adjustment", deal_id: deal?.id }));
          }
        }

        const ref = `SR-${Date.now().toString(36).toUpperCase()}`;
        const txn = { id: uid(), date, description: `Sale Receipt: ${deal?.property_name || memo}`, ref, counterparty: deal?.client_name || "", tags: "sale-receipt", txnType: "SR", isVoid: false, lines, createdAt: new Date().toISOString(), deal_id: deal?.id };
        validateBalanced(lines);
        if (commit) {
          saveTxn(txn);
          if (typeof logAudit === "function") logAudit("postSaleReceipt", { deal_id: deal?.id, txId: txn.id, gross: grossC, net: netC, vat: vatC, roundingAdjustment }, "system", "system").catch(() => {});
        }
        return txn;
      };

      // PAYMENT VOUCHER — Expense paid immediately (no AP step)
      // DR Expense (net) / DR Input VAT / CR Bank (gross)
      const postPayment = ({ date, memo, gross, vatRate = 0, expenseCode, paidFromCode = "1002", counterparty = "", commit = true }) => {
        if (!expenseCode) throw new Error("expenseCode is mandatory for a payment voucher");

        const expenseA = byCode(expenseCode);
        const bankA = byCode(paidFromCode) || accounts.find(a => a.isBank) || byCode("1001");
        const roundingA = byCode("2105") || byCode("5605");
        if (!expenseA) throw new Error(`Expense account not found for code: ${expenseCode}`);
        if (!bankA) throw new Error(`Bank account not found for code: ${paidFromCode}`);

        const grossC = toCents(gross);
        if (grossC <= 0) throw new Error("Gross amount must be positive");
        const { netC, vatC, roundingAdjustment } = computeVATSplit(grossC, vatRate);

        const lines = [makeLine({ accountId: expenseA.id, debit: netC, memo })];
        if (vatC > 0) {
          if (!inputVAT) throw new Error("Missing Input VAT account");
          lines.push(makeLine({ accountId: inputVAT.id, debit: vatC, memo: `VAT — ${memo}` }));
        }
        if (roundingAdjustment !== 0) {
          if (!roundingA) throw new Error("Missing VAT Rounding Adjustment account");
          if (roundingAdjustment > 0) {
            lines.push(makeLine({ accountId: roundingA.id, debit: roundingAdjustment, memo: "VAT rounding adjustment" }));
          } else {
            lines.push(makeLine({ accountId: roundingA.id, credit: -roundingAdjustment, memo: "VAT rounding adjustment" }));
          }
        }
        lines.push(makeLine({ accountId: bankA.id, credit: grossC, memo }));

        const ref = `PV-${Date.now().toString(36).toUpperCase()}`;
        const txn = { id: uid(), date, description: `Payment: ${memo}`, ref, counterparty, tags: "payment", txnType: "PV", isVoid: false, lines, createdAt: new Date().toISOString() };
        validateBalanced(lines);
        if (commit) {
          saveTxn(txn);
          if (typeof logAudit === "function") logAudit("postPayment", { expenseCode, txId: txn.id, gross: grossC, net: netC, vat: vatC, roundingAdjustment }, "system", "system").catch(() => {});
        }
        return txn;
      };

      // BROKER PAYMENT — Paid directly from bank (no AP step)
      const postBrokerPayment = ({ date, deal, brokerAmount, paidFromCode = "1002", memo = "", commit = true }) => {
        if (!deal || !deal.id) throw new Error("deal_id is required for broker payment tracking");
        const expenseA = byCode("5500") || byCode("5000");
        const bankA = byCode(paidFromCode) || accounts.find(a => a.isBank);
        if (!expenseA || !bankA) throw new Error("Missing broker expense or bank account");

        const amtC = toCents(brokerAmount);
        if (amtC <= 0) throw new Error("Broker amount must be positive");
        const lines = [
          makeLine({ accountId: expenseA.id, debit: amtC, memo: memo || "Broker commission", deal_id: deal?.id, broker_id: deal?.broker_id, developer_id: deal?.developer }),
          makeLine({ accountId: bankA.id, credit: amtC, memo: memo || "Broker commission", deal_id: deal?.id, broker_id: deal?.broker_id, developer_id: deal?.developer }),
        ];
        const ref = `BP-${Date.now().toString(36).toUpperCase()}`;
        const txn = { id: uid(), date, description: `Broker Payment: ${deal?.broker_name || memo}`, ref, counterparty: deal?.broker_name || "", tags: "broker-payment", txnType: "BP", isVoid: false, lines, createdAt: new Date().toISOString(), deal_id: deal?.id };
        validateBalanced(lines);
        if (commit) saveTxn(txn);
        return txn;
      };

      // BANK TRANSFER
      const postBankTransfer = ({ date, fromCode, toCode, amount, memo = "Bank transfer", commit = true }) => {
        const fromA = byCode(fromCode);
        const toA = byCode(toCode);
        if (!fromA || !toA) throw new Error("Missing bank accounts");
        const amtC = toCents(amount);
        if (amtC <= 0) throw new Error("Amount must be positive");
        const lines = [
          makeLine({ accountId: toA.id, debit: amtC, memo }),
          makeLine({ accountId: fromA.id, credit: amtC, memo }),
        ];
        const ref = `BT-${Date.now().toString(36).toUpperCase()}`;
        const txn = { id: uid(), date, description: memo, ref, counterparty: "", tags: "bank-transfer", txnType: "BT", isVoid: false, lines, createdAt: new Date().toISOString() };
        validateBalanced(lines);
        if (commit) saveTxn(txn);
        return txn;
      };

      // REVERSAL — creates opposite entry, marks original as void
      const reverseTransaction = (txnId, reverseDate = todayStr(), reason = "Reversal", commit = true) => {
        const original = txns.find(t => t.id === txnId);
        if (!original) throw new Error("Transaction not found");
        if (original.isVoid) throw new Error("Already voided");
        const lines = (original.lines || []).map(l => ({
          id: uid(), accountId: l.accountId, debit: l.credit || 0, credit: l.debit || 0,
          memo: `Reversal: ${original.ref || txnId}`, deal_id: l.deal_id, broker_id: l.broker_id, developer_id: l.developer_id
        }));
        const txn = { id: uid(), date: reverseDate, description: `${reason}: ${original.description}`, ref: `REV-${original.ref || txnId}`, counterparty: original.counterparty || "", tags: `${original.tags || ""} reversal`.trim(), txnType: "JV", isVoid: false, lines, createdAt: new Date().toISOString() };
        validateBalanced(lines);
        if (commit) saveTxn(txn);
        return txn;
      };

      const getVATReport = ({ fromDate = null, toDate = null } = {}) => {
        const outAcc = outputVAT;
        const inAcc = inputVAT;
        if (!outAcc || !inAcc) throw new Error("Output VAT or Input VAT account is undeclared");

        const filteredTxns = txns.filter(t => !t.isVoid && (!fromDate || t.date >= fromDate) && (!toDate || t.date <= toDate));
        const settlementTxns = filteredTxns.filter(t => isVATSettlementTxn(t, accounts));
        const reportTxns = filteredTxns.filter(t => !isVATSettlementTxn(t, accounts));
        const outputVat = reportTxns.reduce((sum, t) => {
          return sum + (t.lines || []).reduce((s, l) => (l.accountId === outAcc.id ? (l.credit || 0) - (l.debit || 0) : 0) + s, 0);
        }, 0);
        const inputVat = reportTxns.reduce((sum, t) => {
          return sum + (t.lines || []).reduce((s, l) => (l.accountId === inAcc.id ? (l.debit || 0) - (l.credit || 0) : 0) + s, 0);
        }, 0);

        const netVat = outputVat - inputVat;
        const status = netVat > 0 ? "Payable" : netVat < 0 ? "Refundable" : "Settled";

        return { fromDate, toDate, outputVat, inputVat, netVat, status, transactions: reportTxns, settlements: settlementTxns };
      };

      const validateDealRevenueReceipt = ({ deals, minCommissionPct = 1, maxCommissionPct = 10 } = {}) => {
        if (!Array.isArray(deals)) throw new Error("deals array is required for revenue/commission validation");

        const issues = [];

        deals.forEach(deal => {
          if (!deal.id) {
            issues.push({ dealId: null, issue: "Missing deal id" });
            return;
          }

          const receipts = txns.filter(t => !t.isVoid && t.deal_id === deal.id && t.txnType === "SR");
          const bankGross = receipts.reduce((sum, t) => {
            return sum + (t.lines || []).reduce((s, l) => s + (accounts.find(a => a.id === l.accountId && a.isBank) ? (l.debit || 0) - (l.credit || 0) : 0), 0);
          }, 0);
          const revenueNet = receipts.reduce((sum, t) => {
            return sum + (t.lines || []).reduce((s, l) => { const acc = accounts.find(a => a.id === l.accountId); return acc && acc.type === "Revenue" ? s + ((l.credit || 0) - (l.debit || 0)) : s; }, 0);
          }, 0);
          const vatAmount = receipts.reduce((sum, t) => {
            return sum + (t.lines || []).reduce((s, l) => { const acc = accounts.find(a => a.id === l.accountId); return acc && acc.isOutputVAT ? s + ((l.credit || 0) - (l.debit || 0)) : s; }, 0);
          }, 0);
          const roundingAmount = receipts.reduce((sum, t) => {
            return sum + (t.lines || []).reduce((s, l) => { const acc = accounts.find(a => a.id === l.accountId); return acc && (acc.code === "2105" || acc.code === "5605") ? s + ((l.credit || 0) - (l.debit || 0)) : s; }, 0);
          }, 0);

          if (revenueNet <= 0) {
            issues.push({ dealId: deal.id, issue: "No revenue recorded for deal" });
          }

          if (bankGross <= 0) {
            issues.push({ dealId: deal.id, issue: "No linked bank receipts for deal" });
          }

          if (bankGross && revenueNet && Math.abs(bankGross - (revenueNet + vatAmount + roundingAmount)) > 0) {
            issues.push({ dealId: deal.id, issue: `Sum(revenue + VAT + rounding) (${revenueNet+vatAmount+roundingAmount}) does not equal bank receipts (${bankGross})` });
          }

          const commissionPct = deal.commission_pct ? Number(deal.commission_pct) : (deal.transaction_value ? (deal.expected_commission_net || 0) / deal.transaction_value * 100 : null);
          if (commissionPct !== null) {
            if (commissionPct < minCommissionPct || commissionPct > maxCommissionPct) {
              issues.push({ dealId: deal.id, issue: `Broker commission ${commissionPct.toFixed(2)}% out of threshold ${minCommissionPct}-${maxCommissionPct}%` });
            }
          } else {
            issues.push({ dealId: deal.id, issue: "Cannot compute broker commission % for deal" });
          }

          const brokerPayments = txns.filter(t => !t.isVoid && t.deal_id === deal.id && t.txnType === "BP");
          const brokerPaidCents = brokerPayments.reduce((sum, t) => {
            return sum + (t.lines || []).reduce((s, l) => {
              const acc = accounts.find(a => a.id === l.accountId);
              return acc && (acc.code === "5500" || acc.code === "5510") ? s + ((l.debit || 0) - (l.credit || 0)) : s;
            }, 0);
          }, 0);
          if (brokerPaidCents <= 0) {
            issues.push({ dealId: deal.id, issue: "No broker payment recorded for deal" });
          }
          if (deal.expected_commission_net && Math.abs(brokerPaidCents - toCents(deal.expected_commission_net)) > 0) {
            issues.push({ dealId: deal.id, issue: `Broker payment (${fromCents(brokerPaidCents)}) does not match expected commission (${deal.expected_commission_net})` });
          }
        });

        return { passed: issues.length === 0, issues };
      };

      return { post, postSaleReceipt, postPayment, postBrokerPayment, postBankTransfer, reverseTransaction, getVATReport, validateDealRevenueReceipt };
    }

    // ── STYLE HELPERS ─────────────────────────────────
    const C = {
      card: { background: "#ffffff", border: "1px solid #EAECF0", borderRadius: 14, boxShadow: "0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)" },
      input: { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: NAVY, background: "#fff", outline: "none", width: "100%", transition: "border-color .15s, box-shadow .15s" },
      select: { border: "1.5px solid #D0D5DD", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: NAVY, background: "#fff", outline: "none", width: "100%" },
      label: { fontSize: 12, fontWeight: 600, color: "#344054", marginBottom: 4, display: "block" },
      th: { textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#667085", background: "#F9FAFB", borderBottom: "1px solid #EAECF0", whiteSpace: "nowrap" },
      td: { padding: "11px 14px", borderBottom: "1px solid #F2F4F7", color: "#344054", verticalAlign: "middle" },
      badge(c) { const m = { success: { bg: "#ECFDF3", cl: "#027A48" }, danger: { bg: "#FEF3F2", cl: "#B42318" }, warning: { bg: "#FFFAEB", cl: "#B54708" }, info: { bg: "#EFF8FF", cl: "#175CD3" }, gold: { bg: "#FBF4E0", cl: GOLD_D }, neutral: { bg: "#F2F4F7", cl: "#344054" } }; const b = m[c] || m.neutral; return { display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: b.bg, color: b.cl, whiteSpace: "nowrap" }; },
      btn(v = "primary", sm = false) { const p = sm ? "5px 12px" : "9px 18px"; const fs = sm ? 12 : 13; const map = { primary: { background: GOLD, color: "#fff", border: "none", boxShadow: "0 1px 2px rgba(0,0,0,.10)" }, secondary: { background: "#fff", color: "#344054", border: "1.5px solid #D0D5DD", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }, danger: { background: "#D92D20", color: "#fff", border: "none" }, success: { background: "#039855", color: "#fff", border: "none" }, ghost: { background: "transparent", color: "#667085", border: "none" } }; return { ...map[v] || map.primary, padding: p, borderRadius: 8, fontSize: fs, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", transition: "opacity .15s, transform .1s" }; },
      modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" },
      mbox(w = 620) { return { background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(16,24,40,.22), 0 0 0 1px rgba(16,24,40,.04)", width: "100%", maxWidth: w, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }; },
      mhdr: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #EAECF0", flexShrink: 0 },
      mbdy: { padding: 24, overflowY: "auto", flex: 1 },
      mftr: { padding: "16px 24px", borderTop: "1px solid #EAECF0", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 },
      fg: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 16 },
      err: { background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 8, padding: "10px 14px", color: "#B42318", fontSize: 13, marginBottom: 12 },
    };

    // ── TOAST ──────────────────────────────────────────
    let _addToast = null;
    function ToastHost() {
      const [toasts, setToasts] = useState([]);
      useEffect(() => { _addToast = (msg, t = "info") => { const id = uid(); setToasts(p => [...p, { id, msg, t }]); setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 3600); }; }, []);
      const brd = { success: "#059669", error: "#DC2626", warning: "#D97706", info: GOLD };
      return <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(x => <div key={x.id} style={{ background: "#fff", border: "1px solid #EAECF0", borderLeft: `3px solid ${brd[x.t] || GOLD}`, borderRadius: 12, padding: "12px 16px", boxShadow: "0 8px 24px rgba(16,24,40,.14), 0 0 0 1px rgba(16,24,40,.04)", fontSize: 13, display: "flex", alignItems: "center", gap: 10, minWidth: 280, maxWidth: 380, pointerEvents: "all" }}>
          <span>{x.t === "success" ? "✅" : x.t === "error" ? "❌" : x.t === "warning" ? "⚠️" : "ℹ️"}</span>
          <span style={{ color: NAVY, flex: 1 }}>{x.msg}</span>
        </div>)}
      </div>;
    }
    const toast = (msg, t = "info") => _addToast && _addToast(msg, t);

    // ── SHARED COMPONENTS ──────────────────────────────
    function Inp({ value, onChange, type = "text", placeholder = "", disabled = false, step, style = {} }) { return <input style={{ ...C.input, ...style, opacity: disabled ? .6 : 1 }} type={type} value={value || ""} onChange={onChange} placeholder={placeholder} disabled={disabled} step={step} />; }
    function Sel({ value, onChange, children }) { return <select style={C.select} value={value || ""} onChange={onChange}>{children}</select>; }
    function PageHeader({ title, sub, children }) { return <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}><div><div style={{ fontSize: 21, fontWeight: 700, color: NAVY, letterSpacing: "-0.02em" }}>{title}</div>{sub && <div style={{ fontSize: 13, color: "#667085", marginTop: 3 }}>{sub}</div>}</div>{children && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>}</div>; }
    function SortTh({ label, sortKey, activeKey, sortDir, onToggle, align = "left" }) {
      const active = sortKey === activeKey;
      const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
      return <th style={{ ...C.th, textAlign: align }}>
        <button onClick={() => onToggle(activeKey)} style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", width: "100%", textAlign: align }}>
          {label}{arrow}
        </button>
      </th>;
    }
    const isBankAccount = account => !!account && (account.isBank || account.code === "1001");
    const getTxnEditSeed = txn => ({
      id: txn?.id || "",
      date: txn?.date || todayStr(),
      ref: txn?.ref || "",
      description: txn?.description || "",
      counterparty: txn?.counterparty || "",
      lines: (txn?.lines?.length ? txn.lines : [
        { id: uid(), accountId: "", debit: 0, credit: 0, memo: "" },
        { id: uid(), accountId: "", debit: 0, credit: 0, memo: "" }
      ]).map(l => ({
        id: l.id || uid(),
        accountId: l.accountId || "",
        debit: l.debit ? fromCents(l.debit) : "",
        credit: l.credit ? fromCents(l.credit) : "",
        memo: l.memo || "",
        deal_id: l.deal_id || "",
        broker_id: l.broker_id || "",
        developer_id: l.developer_id || ""
      }))
    });
    const reviewTxnDraft = ({ draft, originalTxn, accounts, requireBankLine = false }) => {
      const byId = id => accounts.find(a => a.id === id);
      const rows = (draft.lines || [])
        .map((line, idx) => ({
          idx,
          accountId: line.accountId || "",
          account: byId(line.accountId),
          debitText: String(line.debit || "").trim(),
          creditText: String(line.credit || "").trim(),
          debitC: toCents(line.debit || 0),
          creditC: toCents(line.credit || 0),
          memo: (line.memo || "").trim(),
          raw: line
        }))
        .filter(line => line.accountId || line.debitText || line.creditText || line.memo);

      const errors = [];
      const warnings = [];

      if (!draft.date) errors.push("Date is required.");
      if (!String(draft.ref || "").trim()) errors.push("Reference is required.");
      if (rows.length < 2) errors.push("At least 2 populated lines are required.");

      rows.forEach(line => {
        const lineNo = line.idx + 1;
        if (!line.accountId) errors.push(`Line ${lineNo}: choose an account.`);
        if (line.debitC < 0 || line.creditC < 0) errors.push(`Line ${lineNo}: debit and credit cannot be negative.`);
        if (line.debitC > 0 && line.creditC > 0) errors.push(`Line ${lineNo}: use either debit or credit, not both.`);
        if (line.accountId && line.debitC === 0 && line.creditC === 0) errors.push(`Line ${lineNo}: enter a debit or credit amount.`);
      });

      const validRows = rows.filter(line => line.accountId && (line.debitC > 0 || line.creditC > 0) && !(line.debitC > 0 && line.creditC > 0));
      const totalDr = validRows.reduce((sum, line) => sum + line.debitC, 0);
      const totalCr = validRows.reduce((sum, line) => sum + line.creditC, 0);
      const originalTotalDr = (originalTxn?.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);

      if (validRows.length >= 2 && totalDr !== totalCr) errors.push("Journal must stay balanced: total debit must equal total credit.");
      if (validRows.length >= 2 && totalDr <= 0) errors.push("Total transaction amount must be greater than zero.");
      if (requireBankLine && !validRows.some(line => isBankAccount(line.account))) errors.push("This transaction must keep at least one bank account line.");

      if (!String(draft.description || "").trim()) warnings.push("Description is blank. Accounting entries should clearly explain the transaction.");
      if (originalTxn?.txnType && originalTxn.txnType !== "JV") warnings.push(`You are editing a posted ${TXN_TYPES[originalTxn.txnType]?.label || originalTxn.txnType} transaction. Make sure the source documents still match.`);
      if (originalTxn?.external_id) warnings.push("This transaction came from a bank import. Changing it can affect duplicate checks and reconciliation.");
      if (originalTotalDr && totalDr && originalTotalDr !== totalDr) warnings.push(`The total amount changed from ${fmtAED(originalTotalDr)} to ${fmtAED(totalDr)}. Confirm this matches the source document.`);

      return { rows: validRows, errors, warnings, totalDr, totalCr };
    };
    const buildEditedTxn = ({ draft, originalTxn, accounts }) => {
      const byId = id => accounts.find(a => a.id === id);
      const lines = (draft.lines || [])
        .map(line => ({
          ...line,
          debitC: toCents(line.debit || 0),
          creditC: toCents(line.credit || 0)
        }))
        .filter(line => line.accountId && (line.debitC > 0 || line.creditC > 0))
        .map(line => ({
          id: line.id || uid(),
          accountId: line.accountId,
          debit: line.debitC,
          credit: line.creditC,
          memo: (line.memo || "").trim(),
          ...(line.deal_id ? { deal_id: line.deal_id } : {}),
          ...(line.broker_id ? { broker_id: line.broker_id } : {}),
          ...(line.developer_id ? { developer_id: line.developer_id } : {})
        }));

      const edited = {
        ...originalTxn,
        date: draft.date,
        ref: String(draft.ref || "").trim(),
        description: String(draft.description || "").trim(),
        counterparty: String(draft.counterparty || "").trim(),
        lines,
        updatedAt: new Date().toISOString()
      };

      const bankLines = lines.filter(line => isBankAccount(byId(line.accountId)));
      if (typeof originalTxn.import_amount !== "undefined") {
        edited.import_amount = bankLines.reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0);
      }
      if (typeof originalTxn.bank_account_code !== "undefined" && bankLines.length) {
        const bankAccount = byId(bankLines[0].accountId);
        edited.bank_account_code = bankAccount?.code || originalTxn.bank_account_code;
      }
      if (typeof originalTxn.import_narration !== "undefined") {
        edited.import_narration = edited.description || originalTxn.import_narration;
      }

      return edited;
    };
    const applyVatFromDepositDraft = ({ draft, accounts, vatRate = 5 }) => {
      const outputVAT = accounts.find(a => a.isOutputVAT);
      if (!outputVAT) return { error: "Missing Output VAT account." };

      const lines = (draft.lines || []).map((line, idx) => ({
        ...line,
        idx,
        debitC: toCents(line.debit || 0),
        creditC: toCents(line.credit || 0),
        account: accounts.find(a => a.id === line.accountId)
      }));
      if (lines.some(line => line.accountId === outputVAT.id && (line.debitC > 0 || line.creditC > 0))) {
        return { error: "This transaction already has an Output VAT line." };
      }

      const bankDebitLines = lines.filter(line => isBankAccount(line.account) && line.debitC > 0);
      if (!bankDebitLines.length) return { error: "VAT extraction works only for incoming bank deposits." };

      const grossC = bankDebitLines.reduce((sum, line) => sum + line.debitC, 0);
      const taxableCreditLines = lines.filter(line => !isBankAccount(line.account) && line.accountId !== outputVAT.id && line.creditC > 0);
      const taxableCreditTotal = taxableCreditLines.reduce((sum, line) => sum + line.creditC, 0);

      if (!taxableCreditLines.length) return { error: "No credit line was found to reduce for VAT." };
      if (grossC !== taxableCreditTotal) return { error: "Automatic VAT split only works when the deposit equals the credit lines." };

      const vatC = grossC - Math.round(grossC / (1 + vatRate / 100));
      const netC = grossC - vatC;
      if (vatC <= 0) return { error: "This deposit does not produce a VAT amount." };

      let remainingNet = netC;
      const nextLines = draft.lines.map(line => ({ ...line }));
      taxableCreditLines.forEach((line, index) => {
        const nextCredit = index === taxableCreditLines.length - 1 ? remainingNet : Math.round(line.creditC * netC / taxableCreditTotal);
        remainingNet -= nextCredit;
        nextLines[line.idx] = { ...nextLines[line.idx], credit: fromCents(nextCredit) };
      });
      nextLines.push({ id: uid(), accountId: outputVAT.id, debit: "", credit: fromCents(vatC), memo: `Output VAT ${vatRate}%` });

      return { draft: { ...draft, lines: nextLines }, vatC, netC };
    };
    const applyInputVatFromPaymentDraft = ({ draft, accounts, vatRate = 5 }) => {
      const inputVAT = accounts.find(a => a.isInputVAT);
      if (!inputVAT) return { error: "Missing Input VAT account." };

      const lines = (draft.lines || []).map((line, idx) => ({
        ...line,
        idx,
        debitC: toCents(line.debit || 0),
        creditC: toCents(line.credit || 0),
        account: accounts.find(a => a.id === line.accountId)
      }));
      if (lines.some(line => line.accountId === inputVAT.id && (line.debitC > 0 || line.creditC > 0))) {
        return { error: "This transaction already has an Input VAT line." };
      }

      const bankCreditLines = lines.filter(line => isBankAccount(line.account) && line.creditC > 0);
      if (!bankCreditLines.length) return { error: "Input VAT extraction works only for outgoing bank payments." };

      const grossC = bankCreditLines.reduce((sum, line) => sum + line.creditC, 0);
      const taxableDebitLines = lines.filter(line => !isBankAccount(line.account) && line.accountId !== inputVAT.id && line.debitC > 0);
      const taxableDebitTotal = taxableDebitLines.reduce((sum, line) => sum + line.debitC, 0);

      if (!taxableDebitLines.length) return { error: "No debit line was found to reduce for Input VAT." };
      if (grossC !== taxableDebitTotal) return { error: "Automatic Input VAT split only works when the bank payment equals the debit lines." };

      const vatC = grossC - Math.round(grossC / (1 + vatRate / 100));
      const netC = grossC - vatC;
      if (vatC <= 0) return { error: "This payment does not produce a VAT amount." };

      let remainingNet = netC;
      const nextLines = draft.lines.map(line => ({ ...line }));
      taxableDebitLines.forEach((line, index) => {
        const nextDebit = index === taxableDebitLines.length - 1 ? remainingNet : Math.round(line.debitC * netC / taxableDebitTotal);
        remainingNet -= nextDebit;
        nextLines[line.idx] = { ...nextLines[line.idx], debit: fromCents(nextDebit) };
      });
      nextLines.push({ id: uid(), accountId: inputVAT.id, debit: fromCents(vatC), credit: "", memo: `Input VAT ${vatRate}%` });

      return { draft: { ...draft, lines: nextLines }, vatC, netC };
    };
    function TxnEditModal({ open, txn, accounts, onClose, onSave, requireBankLine = false }) {
      const [draft, setDraft] = useState(() => getTxnEditSeed(txn));
      const [outputVatAutoChecked, setOutputVatAutoChecked] = useState(false);
      const [inputVatAutoChecked, setInputVatAutoChecked] = useState(false);
      const [vatSnapshot, setVatSnapshot] = useState(null);
      const outputVAT = accounts.find(a => a.isOutputVAT);
      const inputVAT = accounts.find(a => a.isInputVAT);

      useEffect(() => {
        if (open && txn) {
          setDraft(getTxnEditSeed(txn));
          setOutputVatAutoChecked(false);
          setInputVatAutoChecked(false);
          setVatSnapshot(null);
        }
      }, [open, txn]);

      const review = useMemo(() => reviewTxnDraft({ draft, originalTxn: txn, accounts, requireBankLine }), [draft, txn, accounts, requireBankLine]);
      const totalDebit = draft.lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
      const totalCredit = draft.lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
      const hasOutputVatLine = !!outputVAT && draft.lines.some(line => line.accountId === outputVAT.id && (toCents(line.debit || 0) > 0 || toCents(line.credit || 0) > 0));
      const hasInputVatLine = !!inputVAT && draft.lines.some(line => line.accountId === inputVAT.id && (toCents(line.debit || 0) > 0 || toCents(line.credit || 0) > 0));
      const hasIncomingBankDeposit = draft.lines.some(line => {
        const account = accounts.find(a => a.id === line.accountId);
        return isBankAccount(account) && toCents(line.debit || 0) > 0;
      });
      const hasOutgoingBankPayment = draft.lines.some(line => {
        const account = accounts.find(a => a.id === line.accountId);
        return isBankAccount(account) && toCents(line.credit || 0) > 0;
      });
      const canAutoApplyOutputVat = requireBankLine && outputVAT && hasIncomingBankDeposit && (!hasOutputVatLine || outputVatAutoChecked);
      const canAutoApplyInputVat = requireBankLine && inputVAT && hasOutgoingBankPayment && (!hasInputVatLine || inputVatAutoChecked);

      if (!open || !txn) return null;

      const updateLine = (index, patch) => {
        setDraft(prev => ({
          ...prev,
          lines: prev.lines.map((line, i) => i === index ? { ...line, ...patch } : line)
        }));
      };

      const addLine = () => {
        setDraft(prev => ({
          ...prev,
          lines: [...prev.lines, { id: uid(), accountId: "", debit: "", credit: "", memo: "" }]
        }));
      };

      const removeLine = index => {
        setDraft(prev => ({
          ...prev,
          lines: prev.lines.filter((_, i) => i !== index)
        }));
      };
      const handleOutputVatToggle = (checked) => {
        if (!checked) {
          if (vatSnapshot) setDraft(JSON.parse(JSON.stringify(vatSnapshot)));
          setVatSnapshot(null);
          setOutputVatAutoChecked(false);
          return;
        }
        const result = applyVatFromDepositDraft({ draft, accounts, vatRate: 5 });
        if (result.error) {
          toast(result.error, "warning");
          return;
        }
        setVatSnapshot(JSON.parse(JSON.stringify(draft)));
        setDraft(result.draft);
        setOutputVatAutoChecked(true);
        setInputVatAutoChecked(false);
        toast(`VAT extracted: ${fmtAED(result.vatC)} added to Output VAT`, "success");
      };
      const handleInputVatToggle = (checked) => {
        if (!checked) {
          if (vatSnapshot) setDraft(JSON.parse(JSON.stringify(vatSnapshot)));
          setVatSnapshot(null);
          setInputVatAutoChecked(false);
          return;
        }
        const result = applyInputVatFromPaymentDraft({ draft, accounts, vatRate: 5 });
        if (result.error) {
          toast(result.error, "warning");
          return;
        }
        setVatSnapshot(JSON.parse(JSON.stringify(draft)));
        setDraft(result.draft);
        setInputVatAutoChecked(true);
        setOutputVatAutoChecked(false);
        toast(`Input VAT extracted: ${fmtAED(result.vatC)} added to Input VAT`, "success");
      };

      const handleSave = () => {
        if (review.errors.length) {
          toast(review.errors[0], "warning");
          return;
        }
        if (review.warnings.length) {
          const ok = confirm(`Accounting warning:\n\n- ${review.warnings.join("\n- ")}\n\nSave these changes to the backend database anyway?`);
          if (!ok) return;
        }
        onSave(buildEditedTxn({ draft, originalTxn: txn, accounts }));
      };

      return <div style={C.modal} onClick={onClose}>
        <div style={C.mbox(860)} onClick={e => e.stopPropagation()}>
          <div style={C.mhdr}><span style={{ fontWeight: 700, fontSize: 16 }}>Edit Transaction</span><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button></div>
          <div style={C.mbdy}>
            <div style={{ ...C.card, padding: 14, marginBottom: 16, background: "#F9FAFB" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{TXN_TYPES[txn.txnType]?.label || txn.txnType || "Transaction"}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Changes save directly to the backend database and affect reports immediately.</div>
            </div>

            {canAutoApplyOutputVat && <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", gap: 10 }}>
              <input id={`output-vat-auto-${txn.id}`} type="checkbox" checked={outputVatAutoChecked} onChange={e => handleOutputVatToggle(e.target.checked)} />
              <label htmlFor={`output-vat-auto-${txn.id}`} style={{ fontSize: 13, color: "#1E3A8A", cursor: "pointer" }}>
                Extract VAT 5% from this deposit automatically and add an Output VAT line
              </label>
            </div>}
            {canAutoApplyInputVat && <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: "#ECFDF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", gap: 10 }}>
              <input id={`input-vat-auto-${txn.id}`} type="checkbox" checked={inputVatAutoChecked} onChange={e => handleInputVatToggle(e.target.checked)} />
              <label htmlFor={`input-vat-auto-${txn.id}`} style={{ fontSize: 13, color: "#065F46", cursor: "pointer" }}>
                Extract recoverable VAT 5% from this payment automatically and add an Input VAT line
              </label>
            </div>}
            {requireBankLine && hasOutputVatLine && !outputVatAutoChecked && <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 13, color: "#6B7280" }}>
              This transaction already includes an Output VAT line.
            </div>}
            {requireBankLine && hasInputVatLine && !inputVatAutoChecked && <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 13, color: "#6B7280" }}>
              This transaction already includes an Input VAT line.
            </div>}

            {review.errors.length > 0 && <div style={{ ...C.err, marginBottom: 14 }}>
              {review.errors.map((msg, idx) => <div key={idx}>{msg}</div>)}
            </div>}

            {review.warnings.length > 0 && <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 13 }}>
              {review.warnings.map((msg, idx) => <div key={idx}>{msg}</div>)}
            </div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label style={C.label}>Date</label><Inp type="date" value={draft.date} onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))} /></div>
              <div><label style={C.label}>Reference</label><Inp value={draft.ref} onChange={e => setDraft(prev => ({ ...prev, ref: e.target.value }))} /></div>
              <div><label style={C.label}>Description</label><Inp value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} /></div>
              <div><label style={C.label}>Counterparty</label><Inp value={draft.counterparty} onChange={e => setDraft(prev => ({ ...prev, counterparty: e.target.value }))} /></div>
            </div>

            <div style={{ overflowX: "auto", overflowY: "visible" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr><th style={C.th}>Account</th><th style={{ ...C.th, width: 130 }}>Debit (AED)</th><th style={{ ...C.th, width: 130 }}>Credit (AED)</th><th style={C.th}>Memo</th><th style={{ ...C.th, width: 48 }}></th></tr></thead>
                <tbody>
                  {draft.lines.map((line, i) => <tr key={line.id || i}>
                    <td style={C.td}><Sel value={line.accountId} onChange={e => updateLine(i, { accountId: e.target.value })}>
                      <option value="">— Select —</option>
                      {accounts.slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </Sel></td>
                    <td style={C.td}><Inp type="number" step="0.01" value={line.debit} onChange={e => updateLine(i, { debit: e.target.value })} /></td>
                    <td style={C.td}><Inp type="number" step="0.01" value={line.credit} onChange={e => updateLine(i, { credit: e.target.value })} /></td>
                    <td style={C.td}><Inp value={line.memo || ""} onChange={e => updateLine(i, { memo: e.target.value })} /></td>
                    <td style={C.td}>{draft.lines.length > 2 && <button style={C.btn("ghost", true)} onClick={() => removeLine(i)}>×</button>}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>

            <button style={{ ...C.btn("secondary", true), marginTop: 8 }} onClick={addLine}>+ Add Line</button>
            <div style={{ marginTop: 12, padding: 10, background: "#F9FAFB", borderRadius: 7, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
              <span>Total Debit: {totalDebit.toFixed(2)}</span>
              <span>Total Credit: {totalCredit.toFixed(2)}</span>
              <span style={{ color: Math.abs(totalDebit - totalCredit) < 0.0001 ? "#059669" : "#DC2626" }}>
                {Math.abs(totalDebit - totalCredit) < 0.0001 ? "Balanced" : "Unbalanced"}
              </span>
            </div>
          </div>
          <div style={C.mftr}><button style={C.btn("secondary")} onClick={onClose}>Cancel</button><button style={C.btn()} onClick={handleSave}>Save Changes</button></div>
        </div>
      </div>;
    }
    function Logo({ size = 32, style = {} }) {
      return <img src={NASAMA_ICON_SRC} alt="Nasama logo" style={{ width: size, height: size, objectFit: "contain", display: "block", ...style }} />;
    }
    function BrandIcon({ size = 32, style = {} }) {
      return <Logo size={size} style={style} />;
    }
    function BrandWordmark({ width = 180, style = {} }) {
      return <img src={NASAMA_WORDMARK_SRC} alt="Nasama Properties" style={{ width, maxWidth: "100%", height: "auto", display: "block", ...style }} />;
    }

    // ── POSTING PREVIEW ────────────────────────────────
    function PostingPreview({ open, onClose, lines, accounts, onConfirm, header = {} }) {
      if (!open) return null;
      const tDr = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const tCr = lines.reduce((s, l) => s + (l.credit || 0), 0);
      const ok = Math.abs(tDr - tCr) <= 1 && tDr > 0;
      const ga = id => accounts.find(a => a.id === id) || { name: id, code: "?", type: "?" };
      return <div style={C.modal} onClick={onClose}>
        <div style={C.mbox(700)} onClick={e => e.stopPropagation()}>
          <div style={C.mhdr}><div style={{ fontWeight: 700, fontSize: 16 }}>📋 Posting Preview</div><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button></div>
          <div style={C.mbdy}>
            {header.date && <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>Date: {fmtDate(header.date)} {header.ref && `| Ref: ${header.ref}`} {header.counterparty && `| ${header.counterparty}`}</div>}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={C.th}>Account</th><th style={C.th}>Type</th><th style={{ ...C.th, textAlign: "right" }}>Debit</th><th style={{ ...C.th, textAlign: "right" }}>Credit</th></tr></thead>
              <tbody>
                {lines.map((l, i) => { const a = ga(l.accountId); return <tr key={i}><td style={C.td}>{a.code} — {a.name}</td><td style={C.td}><span style={C.badge(a.type === "Revenue" ? "success" : a.type === "Expense" ? "warning" : "info")}>{a.type}</span></td><td style={{ ...C.td, textAlign: "right", fontWeight: l.debit ? 600 : 400 }}>{l.debit ? fmtAED(l.debit) : "—"}</td><td style={{ ...C.td, textAlign: "right", fontWeight: l.credit ? 600 : 400 }}>{l.credit ? fmtAED(l.credit) : "—"}</td></tr>; })}
              </tbody>
              <tfoot><tr style={{ background: "#F9FAFB" }}><td colSpan={2} style={{ ...C.td, fontWeight: 700 }}>TOTAL</td><td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(tDr)}</td><td style={{ ...C.td, textAlign: "right", fontWeight: 700 }}>{fmtAED(tCr)}</td></tr></tfoot>
            </table>
            {!ok && <div style={C.err}>Journal entry is not balanced!</div>}
          </div>
          <div style={C.mftr}><button style={C.btn("secondary")} onClick={onClose}>Cancel</button><button style={C.btn("success")} disabled={!ok} onClick={onConfirm}>✅ Confirm & Post</button></div>
        </div>
      </div>;
    }

    // ── NAV ────────────────────────────────────────────
    const NAV = [
      { s: "OVERVIEW" }, { id: "dashboard", label: "Dashboard", icon: "🏠" }, { id: "banana2", label: "Performance", icon: "📊" },
      { s: "SALES" }, { id: "deals", label: "Deals / Pipeline", icon: "🤝" }, { id: "receipts", label: "Sale Receipts", icon: "💰" }, { id: "invoices", label: "Invoices", icon: "🧾" }, { id: "customers", label: "Customers", icon: "👥" }, { id: "brokers", label: "Brokers", icon: "👔" }, { id: "developers", label: "Developers", icon: "🏗️" },
      { s: "EXPENSES" }, { id: "payments", label: "Payments", icon: "💳" }, { id: "vendors", label: "Vendors", icon: "🏭" }, { id: "futureExpenses", label: "Future Expenses", icon: "📅" },
      { s: "ACCOUNTING" }, { id: "banking", label: "Banking", icon: "🏦" }, { id: "journal", label: "Journal Entries", icon: "📒" }, { id: "coa", label: "Chart of Accounts", icon: "🗂" }, { id: "reports", label: "Reports", icon: "📊" }, { id: "vat", label: "VAT / Taxes", icon: "🧾" },
      { s: "SYSTEM" }, { id: "users", label: "User Management", icon: "👥" }, { id: "settings", label: "Settings", icon: "⚙️" }, { id: "manual", label: "User Manual", icon: "📖" },
    ];
