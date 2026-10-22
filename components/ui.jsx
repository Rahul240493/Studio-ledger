"use client";
import { useEffect, useRef, useState, createContext, useContext, useCallback } from "react";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }) {
  const [msg, setMsg] = useState("");
  const t = useRef();
  const show = useCallback((m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(""), 3400); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg ? <div className="toast" role="status">{msg}</div> : null}</ToastCtx.Provider>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row spread"><h2>{title}</h2><button className="btn ghost" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, need, wide, children }) {
  return <label className={`f${need ? " need" : ""}${wide ? " wide" : ""}`}>{label}{children}</label>;
}
export function Select({ value, options, onChange, blank, ...rest }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {blank !== undefined || !options.includes(value) ? <option value="">{blank || ""}</option> : null}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
export const Thinking = ({ children }) => <div className="thinking"><i />{children}</div>;
export function Confirm({ text, action, onYes, onNo }) {
  return <div className="banner">{text}<div className="row" style={{ marginTop: 10 }}><button className="btn danger" onClick={onYes}>{action}</button><button className="btn ghost" onClick={onNo}>Keep it</button></div></div>;
}

// Live dictation through the browser's speech recognition. Falls back to the keyboard mic.
export function useSpeech(onText) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef(null);
  const base = useRef("");
  useEffect(() => { setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const stop = useCallback(() => { try { rec.current?.stop(); } catch {} setListening(false); }, []);
  const start = useCallback((current) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-IN"; r.continuous = true; r.interimResults = true;
    base.current = current ? current.replace(/\s*$/, " ") : "";
    r.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      onText((base.current + txt).replace(/\s+/g, " ").trimStart());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  }, [onText]);
  useEffect(() => () => { try { rec.current?.abort(); } catch {} }, []);
  return { supported, listening, start, stop };
}
