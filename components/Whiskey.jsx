"use client";
// Whiskey: the partners' studio voice assistant. Talk or type; it answers out loud.
// Money entries and deletions come back as cards to confirm.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "./util";
import { useToast } from "./ui";

const STORE = "whiskey.chat.v1", PREFS = "whiskey.prefs.v1";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const SR = () => (typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition);
const STOP_WORDS = /^(stop|that'?s all|thanks whiskey|thank you whiskey|bye whiskey|go to sleep)\.?$/i;

// ---- speech out ----
function speakable(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ").replace(/\|[^\n]*\|/g, " ") // tables are for the screen
    .replace(/[*_#>`]/g, "").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/https?:\/\/\S+/g, "the link")
    .replace(/^\s*[-•]\s+/gm, "").replace(/\n{2,}/g, ". ").replace(/\n/g, ", ").replace(/\s+/g, " ").trim();
}
function pickVoice(pref) {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  return vs.find((v) => v.name === pref) || vs.find((v) => /en-IN/i.test(v.lang)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}

// ---- tiny markdown for the screen (bold, lists, tables, links) ----
function inline(t, key) {
  const out = []; let rest = t; let i = 0;
  const re = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+))/;
  while (rest) {
    const m = rest.match(re);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    if (m[2]) out.push(<b key={key + "b" + i}>{m[2]}</b>);
    else if (m[3]) out.push(<a key={key + "a" + i} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>);
    else out.push(<a key={key + "u" + i} href={m[5]} target="_blank" rel="noreferrer">link</a>);
    rest = rest.slice(m.index + m[0].length); i++;
  }
  return out;
}
function Md({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim())); i++; }
      blocks.push(<div className="wtable" key={"t" + i}><table><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => (ri === 0 ? <th key={ci}>{inline(c, `${i}${ri}${ci}`)}</th> : <td key={ci}>{inline(c, `${i}${ri}${ci}`)}</td>))}</tr>)}</tbody></table></div>);
    } else if (/^\s*([-•*]|\d+\.)\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*([-•*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-•*]|\d+\.)\s+/, "")); i++; }
      blocks.push(<ul key={"l" + i}>{items.map((x, k) => <li key={k}>{inline(x, `${i}l${k}`)}</li>)}</ul>);
    } else if (l.trim()) {
      blocks.push(<p key={"p" + i}>{inline(l.replace(/^#+\s*/, ""), "p" + i)}</p>); i++;
    } else i++;
  }
  return <>{blocks}</>;
}

function ActionCard({ a, onDone }) {
  const toast = useToast();
  const [state, setState] = useState(a.state || "open");
  async function confirm() {
    setState("busy");
    try { const r = await api("/api/whiskey/act", { method: "POST", body: { ticket: a.ticket } }); setState("done"); onDone(a, "done", r.message); }
    catch (e) { setState("open"); toast(e.message); }
  }
  return (
    <div className={`wcard ${a.danger ? "danger" : ""} ${state}`}>
      <div className="wcard-h">{a.title}</div>
      {a.lines?.map((l, i) => <div key={i} className="wcard-l">{l}</div>)}
      {a.body && <pre className="wcard-body">{a.body}</pre>}
      {state === "done" ? <div className="wcard-s ok">Done</div> : state === "cancelled" ? <div className="wcard-s">Cancelled</div> : (
        <div className="row">
          <button className={`btn ${a.danger ? "danger" : "primary"}`} disabled={state === "busy"} onClick={confirm}>{state === "busy" ? "Working…" : a.kind === "delete" ? "Delete" : "Confirm"}</button>
          <button className="btn ghost" disabled={state === "busy"} onClick={() => { setState("cancelled"); onDone(a, "cancelled"); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function Settings({ prefs, setPrefs, onClose }) {
  const toast = useToast();
  const [voices, setVoices] = useState([]);
  useEffect(() => { const f = () => setVoices((window.speechSynthesis?.getVoices?.() || []).filter((v) => /^en|^hi|^te/i.test(v.lang))); f(); window.speechSynthesis?.addEventListener?.("voiceschanged", f); return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", f); }, []);
  return (
    <div className="wsettings">
      <div className="row spread"><b>Whiskey settings</b><button className="btn ghost" onClick={onClose}>Done</button></div>
      <div className="wset-block">
        <label className="check"><input type="checkbox" checked={prefs.speak} onChange={(e) => setPrefs({ ...prefs, speak: e.target.checked })} /> Speak replies out loud</label>
        <label className="check"><input type="checkbox" checked={prefs.handsFree} onChange={(e) => setPrefs({ ...prefs, handsFree: e.target.checked })} /> Hands-free: keep listening after each reply (say "stop" to end)</label>
        <label className="check"><input type="checkbox" checked={prefs.wake} onChange={(e) => setPrefs({ ...prefs, wake: e.target.checked })} /> Listen for "Whiskey" while this tab is open (Chrome / Edge)</label>
      </div>
      <div className="wset-block grid2">
        <label className="field"><span className="flabel">Voice</span><select value={prefs.voice || ""} onChange={(e) => setPrefs({ ...prefs, voice: e.target.value })}><option value="">Automatic (Indian English)</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>
        <label className="field"><span className="flabel">Speed</span><select value={prefs.rate} onChange={(e) => setPrefs({ ...prefs, rate: Number(e.target.value) })}>{[0.9, 1, 1.1, 1.2, 1.3].map((r) => <option key={r} value={r}>{r}×</option>)}</select></label>
      </div>
    </div>
  );
}

export function Whiskey() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showSet, setShowSet] = useState(false);
  const [prefs, setPrefsState] = useState({ speak: true, handsFree: false, wake: false, voice: "", rate: 1.05 });
  const recRef = useRef(null), wakeRef = useRef(null), endRef = useRef(null), inputRef = useRef(null);
  const msgsRef = useRef(msgs); msgsRef.current = msgs;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const openRef = useRef(open); openRef.current = open;
  const busyRef = useRef(false), listeningRef = useRef(false);

  useEffect(() => { setMsgs(load(STORE, [])); setPrefsState((p) => ({ ...p, ...load(PREFS, {}) })); }, []);
  useEffect(() => { save(STORE, msgs.slice(-60)); }, [msgs]);
  const setPrefs = (p) => { setPrefsState(p); save(PREFS, p); };
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);

  const stopSpeaking = () => { try { window.speechSynthesis?.cancel(); } catch {} setSpeaking(false); };
  const say = useCallback((md, after) => {
    const p = prefsRef.current;
    if (!p.speak || !window.speechSynthesis) { after?.(); return; }
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(speakable(md).slice(0, 1200));
    const v = pickVoice(p.voice); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
    u.rate = p.rate || 1;
    u.onend = () => { setSpeaking(false); after?.(); };
    u.onerror = () => { setSpeaking(false); after?.(); };
    setSpeaking(true); window.speechSynthesis.speak(u);
  }, []);

  busyRef.current = busy; listeningRef.current = listening;
  const listenRef = useRef(null);
  const send = useCallback(async (raw) => {
    const q = String(raw || "").trim();
    if (!q) return;
    if (STOP_WORDS.test(q)) { setText(""); say("Okay."); return; } // ends a hands-free run
    stopSpeaking();
    const next = [...msgsRef.current, { role: "user", text: q, at: Date.now() }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const r = await api("/api/whiskey", { method: "POST", body: { messages: next.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, text: m.text })) } });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, actions: r.actions || [], at: Date.now() }]);
      say(r.reply, () => { if (prefsRef.current.handsFree && openRef.current && !(r.actions || []).length) listenRef.current?.(); });
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, " + e.message, error: true, at: Date.now() }]);
    }
    setBusy(false);
  }, [say]);

  // Push-to-talk: one phrase, sent when you pause.
  const listen = useCallback(() => {
    const R = SR();
    if (!R) { toast("Voice input needs Chrome, Edge or Safari. You can type instead."); inputRef.current?.focus(); return; }
    stopSpeaking();
    try { recRef.current?.abort(); } catch {}
    const r = new R(); r.lang = "en-IN"; r.interimResults = true; r.continuous = false;
    let finalText = "";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; setText(t); };
    r.onend = () => { setListening(false); if (finalText.trim()) send(finalText); };
    r.onerror = (e) => { setListening(false); if (e.error === "not-allowed") toast("Allow microphone access for this site to talk to Whiskey."); };
    recRef.current = r; setListening(true); r.start();
  }, [send, toast]);
  listenRef.current = listen;
  const stopListening = () => { try { recRef.current?.stop(); } catch {} setListening(false); };

  // Wake word: listens in the background for "Whiskey ..." while the tab is open.
  useEffect(() => {
    const R = SR();
    if (!prefs.wake || !R) return;
    let alive = true, r;
    const start = () => {
      if (!alive) return;
      r = new R(); r.lang = "en-IN"; r.continuous = true; r.interimResults = false;
      r.onresult = (e) => {
        const t = e.results[e.results.length - 1][0].transcript.trim();
        const m = t.match(/\b(?:hey\s+|ok\s+|okay\s+)?wh?isk(?:e?y|i)\b[,.!]?\s*(.*)$/i);
        if (!m || listeningRef.current || busyRef.current) return;
        setOpen(true);
        if (m[1] && m[1].length > 2) send(m[1]);
        else { try { r.stop(); } catch {} say("Yes?", () => listenRef.current?.()); }
      };
      r.onend = () => { if (alive) setTimeout(start, 600); };
      r.onerror = () => {};
      wakeRef.current = r;
      try { r.start(); } catch { /* already started */ }
    };
    start();
    return () => { alive = false; try { r?.abort(); } catch {} };
  }, [prefs.wake, send, say]);

  const onCardDone = (a, state, message) => {
    setMsgs((m) => m.map((x) => (x.actions ? { ...x, actions: x.actions.map((y) => (y.id === a.id ? { ...y, state } : y)) } : x)).concat(message ? [{ role: "assistant", text: message, at: Date.now() }] : []));
    if (message) say(message);
  };

  const brief = () => send("Good morning Whiskey, brief me on today.");
  const SUGGEST = ["Brief me on today", "How much did we spend this month?", "Which client posts are overdue?", "Who hasn't checked in today?", "What's still to receive from clients?"];

  return (
    <>
      <button className={`whiskey-fab${listening ? " live" : ""}${prefs.wake ? " wake" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="Whiskey, studio voice assistant" title="Whiskey">
        <WhiskeyIcon />
      </button>
      {open && (
        <section className="whiskey" role="dialog" aria-label="Whiskey">
          <header className="wh">
            <div className="wh-t"><WhiskeyIcon /><div><b>Whiskey</b><small>{busy ? "Thinking…" : listening ? "Listening…" : speaking ? "Speaking…" : "Studio assistant · partners only"}</small></div></div>
            <div className="row tight">
              {speaking && <button className="iconbtn" onClick={stopSpeaking} aria-label="Stop speaking" title="Stop speaking">■</button>}
              <button className="iconbtn" onClick={() => setPrefs({ ...prefs, speak: !prefs.speak })} aria-label={prefs.speak ? "Mute" : "Unmute"} title={prefs.speak ? "Mute replies" : "Speak replies"}>{prefs.speak ? "🔊" : "🔇"}</button>
              <button className="iconbtn" onClick={() => setShowSet((s) => !s)} aria-label="Whiskey settings" title="Settings">⚙</button>
              <button className="iconbtn" onClick={() => { stopSpeaking(); stopListening(); setOpen(false); }} aria-label="Close">×</button>
            </div>
          </header>
          {showSet ? <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setShowSet(false)} /> : (
            <div className="wbody">
              {!msgs.length && (
                <div className="wempty">
                  <p>Hi, I'm Whiskey. Ask me about money, tickets, content, the schedule, or the company inbox. Tap the mic and talk.</p>
                  <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
                </div>
              )}
              {msgs.map((m, i) => (
                <Fragment key={i}>
                  <div className={`wmsg ${m.role}${m.error ? " err" : ""}`}>{m.role === "assistant" ? <Md text={m.text} /> : m.text}</div>
                  {m.actions?.map((a) => <ActionCard key={a.id} a={a} onDone={onCardDone} />)}
                </Fragment>
              ))}
              {busy && <div className="wmsg assistant typing"><i /><i /><i /></div>}
              <div ref={endRef} />
            </div>
          )}
          {!showSet && (
            <footer className="wf">
              <div className="row tight">
                <button className="btn ghost wbrief" onClick={brief} disabled={busy}>Brief me</button>
                {msgs.length > 0 && <button className="btn ghost" onClick={() => { stopSpeaking(); setMsgs([]); }} disabled={busy}>New chat</button>}
              </div>
              <form className="wform" onSubmit={(e) => { e.preventDefault(); send(text); }}>
                <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : "Ask Whiskey…"} aria-label="Message Whiskey" disabled={busy} />
                <button type="button" className={`wmic${listening ? " on" : ""}`} onClick={() => (listening ? stopListening() : listen())} aria-label={listening ? "Stop listening" : "Talk"} disabled={busy}><MicIcon /></button>
                <button type="submit" className="btn primary" disabled={busy || !text.trim()}>Send</button>
              </form>
            </footer>
          )}
        </section>
      )}
    </>
  );
}

const WhiskeyIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M5 4h14l-1.6 14.2A2 2 0 0 1 15.4 20H8.6a2 2 0 0 1-2-1.8L5 4Z" /><path d="M6 10h12" /><rect x="9" y="11.5" width="4.5" height="4.5" rx=".6" transform="rotate(12 11.2 13.7)" />
  </svg>
);
const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
