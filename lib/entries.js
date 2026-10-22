import { SEGMENTS, EXPENSE_CATS, INCOME_CATS } from "./config";
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[₹,\s%]/g, "")); return isFinite(n) ? n : 0; };

// Validates and normalises a ledger entry coming from the browser.
export function cleanEntry(x) {
  const type = x.type === "Income" ? "Income" : "Expense";
  const e = {
    type,
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "",
    segment: SEGMENTS.some((s) => s.key === x.segment) ? x.segment : "",
    project: String(x.project || "General").slice(0, 120),
    category: (type === "Income" ? INCOME_CATS : EXPENSE_CATS).includes(x.category) ? x.category : "",
    description: String(x.description || "").slice(0, 300),
    party: String(x.party || "").slice(0, 160),
    amount: r2(num(x.amount)),
    gstRate: num(x.gstRate),
    gst: r2(num(x.gst)),
    mode: String(x.mode || ""),
    status: ["Paid", "Payable", "Received", "Pending"].includes(x.status) ? x.status : type === "Income" ? "Received" : "Paid",
    invoiceNo: String(x.invoiceNo || "").slice(0, 80),
    gstin: String(x.gstin || "").toUpperCase().slice(0, 20),
    file: String(x.file || "").slice(0, 500),
    note: String(x.note || "").slice(0, 1000),
  };
  e.total = r2(e.amount + e.gst);
  const missing = [];
  if (!e.date) missing.push("date"); if (!e.segment) missing.push("segment"); if (!e.category) missing.push("category");
  if (!(e.amount > 0)) missing.push("amount");
  if (missing.length) { const err = new Error("Missing or invalid: " + missing.join(", ")); err.status = 400; throw err; }
  return e;
}
