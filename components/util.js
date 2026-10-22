"use client";
import { SEGMENTS } from "@/lib/config";

export const r2 = (n) => Math.round(n * 100) / 100;
export const num = (v) => { if (v === null || v === undefined || v === "") return 0; if (typeof v === "number") return v; const n = parseFloat(String(v).replace(/[₹,\s%]/g, "")); return isFinite(n) ? n : 0; };
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const rs = (n) => "₹" + inr0.format(Math.round(n || 0));
export const rsx = (n) => "₹" + inr2.format(r2(n || 0));
export function rsShort(n) {
  const a = Math.abs(n || 0), s = n < 0 ? "−" : "";
  const t = (x, d) => x.toFixed(d).replace(/\.?0+$/, "");
  if (a >= 1e7) return `${s}₹${t(a / 1e7, a >= 1e8 ? 1 : 2)} Cr`;
  if (a >= 1e5) return `${s}₹${t(a / 1e5, a >= 1e6 ? 1 : 2)} L`;
  return s + "₹" + inr0.format(Math.round(a));
}
export const ym = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
export const ymd = (d) => ym(d) + "-" + String(d.getDate()).padStart(2, "0");
export const today = () => ymd(new Date());
export function fmtDate(s, opts) { if (!s) return ""; const d = new Date(s + "T00:00:00"); if (isNaN(d)) return s; return d.toLocaleDateString("en-IN", opts || { day: "numeric", month: "short" }); }
export function monthLabel(m) { const [y, mo] = m.split("-"); return new Date(+y, +mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
export function shiftMonth(m, d) { const [y, mo] = m.split("-").map(Number); return ym(new Date(y, mo - 1 + d, 1)); }
export const segOf = (k) => SEGMENTS.find((s) => s.key === k) || { key: k, short: k || "—", cls: "" };
export function fmtTime(t) { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`; }

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Please sign in."); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
