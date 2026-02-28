import { useState, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/* ─── DESIGN TOKENS — Anthropic palette ──────────────────────────── */
const T = {
  cream: "#F5F0E8",
  parchment: "#EDE7D9",
  warmWhite: "#FAF8F4",
  coral: "#C96442",
  coralLight: "#E8825F",
  coralDim: "#F2D5C8",
  ink: "#1A1612",
  inkMid: "#4A3F35",
  inkLight: "#8C7B6E",
  inkFaint: "#C4B8AD",
  emerald: "#2D6A4F",
  emeraldLight: "#D4EDE3",
  amber: "#B5860D",
  amberLight: "#F5EAC8",
  border: "#DDD5C8",
  purple: "#7B5EA7",
  purpleLight: "#F0EAF8",
};

/* ─── MOCK DATA ──────────────────────────────────────────────────── */
const MOCK_TRANSACTIONS = [
  { date: "2026-10-01", desc: "Zomato Bangalore",      amount: 685,    type: "Debit",  category: "Dining & Local Eats" },
  { date: "2026-10-02", desc: "Salary Payout — Oct",   amount: 100253, type: "Credit", category: "Income" },
  { date: "2026-10-03", desc: "Varalakshi Tiffins",    amount: 180,    type: "Debit",  category: "Dining & Local Eats" },
  { date: "2026-10-04", desc: "Zerodha Buy Order",     amount: 15000,  type: "Debit",  category: "Investments" },
  { date: "2026-10-05", desc: "Ola Cabs",              amount: 340,    type: "Debit",  category: "Commute & Transport" },
  { date: "2026-10-06", desc: "YouTube Premium",       amount: 189,    type: "Debit",  category: "Subscriptions" },
  { date: "2026-10-07", desc: "Rameshwaram Café",      amount: 520,    type: "Debit",  category: "Dining & Local Eats" },
  { date: "2026-10-08", desc: "BESCOM Electric Bill",  amount: 1200,   type: "Debit",  category: "Utilities & Housing" },
  { date: "2026-10-09", desc: "Amazon Order",          amount: 2340,   type: "Debit",  category: "Shopping & Lifestyle" },
  { date: "2026-10-10", desc: "Google One Storage",    amount: 130,    type: "Debit",  category: "Subscriptions" },
  { date: "2026-10-11", desc: "Namma Metro Recharge",  amount: 500,    type: "Debit",  category: "Commute & Transport" },
  { date: "2026-10-12", desc: "Swiggy Order",          amount: 430,    type: "Debit",  category: "Dining & Local Eats" },
  { date: "2026-10-13", desc: "LIC Premium",           amount: 4500,   type: "Debit",  category: "Insurance & Protection" },
  { date: "2026-10-14", desc: "Spotify Premium",       amount: 119,    type: "Debit",  category: "Subscriptions" },
  { date: "2026-10-15", desc: "Rapido Bike",           amount: 95,     type: "Debit",  category: "Commute & Transport" },
  { date: "2026-10-16", desc: "Blinkit Groceries",     amount: 1640,   type: "Debit",  category: "Dining & Local Eats" },
  { date: "2026-10-17", desc: "Groww MF SIP",          amount: 5000,   type: "Debit",  category: "Investments" },
  { date: "2026-10-18", desc: "Netflix Subscription",  amount: 649,    type: "Debit",  category: "Subscriptions" },
  { date: "2026-10-19", desc: "PhonePe UPI — Mom",     amount: 3000,   type: "Debit",  category: "Family & Transfers" },
  { date: "2026-10-20", desc: "BBMP Property Tax",     amount: 6200,   type: "Debit",  category: "Utilities & Housing" },
];

const CAT_COLORS = {
  "Dining & Local Eats":   "#C96442",
  "Investments":           "#2D6A4F",
  "Commute & Transport":   "#B5860D",
  "Subscriptions":         "#7B5EA7",
  "Utilities & Housing":   "#3B82C4",
  "Shopping & Lifestyle":  "#D4696B",
  "Insurance & Protection":"#5B7FA6",
  "Family & Transfers":    "#8A6D3B",
  "Income":                "#2D6A4F",
};

function fmt(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function computeAnalytics(txns) {
  const debits  = txns.filter(t => t.type === "Debit");
  const credits = txns.filter(t => t.type === "Credit");
  const totalBurn   = debits.reduce((s, t) => s + t.amount, 0);
  const totalIncome = credits.reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalBurn;
  const surplus = balance - balance * 0.2;
  const catMap = {};
  debits.forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const categories = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const subs = debits.filter(t => t.category === "Subscriptions");
  const subTotal = subs.reduce((s, t) => s + t.amount, 0);
  return { totalBurn, totalIncome, balance, surplus, categories, subs, subTotal };
}

const STAGE = { UPLOAD: 0, PARSING: 1, CLASSIFYING: 2, DONE: 3 };

/* ─── STYLES ─────────────────────────────────────────────────────── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap');

  html { background: #F5F0E8; }
  body { background: #F5F0E8; margin: 0; padding: 0; }
  #root { background: #F5F0E8; min-height: 100vh; width: 100%; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #root {
    width: 100%;
    min-height: 100vh;
    margin: 0;
    padding: 0;
  }

  .fin-root {
    width: 100%;
    min-height: 100vh;
    background: #F5F0E8;
    font-family: 'DM Sans', sans-serif;
    font-weight: 300;
    color: #1A1612;
    position: relative;
  }

  /* Grain */
  .fin-root::before {
    content: '';
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    opacity: .5;
  }

  /* TOP BAR */
  .topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    width: 100%;
    height: 54px;
    background: rgba(245,240,232,0.92);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid #DDD5C8;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 32px;
  }
  .logo {
    font-family: 'Lora', serif;
    font-size: 17px; font-weight: 500;
    color: #1A1612; letter-spacing: -.3px;
    display: flex; align-items: center; gap: 8px;
  }
  .logo-dot { width: 8px; height: 8px; background: #C96442; border-radius: 50%; }
  .topbar-badge {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #8C7B6E; letter-spacing: .3px;
  }

  /* MAIN */
  .main {
    position: relative; z-index: 1;
    padding-top: 54px;
    min-height: 100vh;
    width: 100%;
    background: #F5F0E8;
  }

  /* ── UPLOAD ── */
  .upload-wrap {
    max-width: 640px;
    margin: 0 auto;
    padding: 88px 32px 80px;
  }
  .upload-headline {
    font-family: 'Lora', serif;
    font-size: clamp(30px, 5vw, 46px);
    font-weight: 400; line-height: 1.2;
    letter-spacing: -1px; margin-bottom: 16px;
  }
  .upload-headline em { font-style: italic; color: #C96442; }
  .upload-sub {
    font-size: 16px; color: #4A3F35; line-height: 1.7;
    font-weight: 300; margin-bottom: 44px; max-width: 500px;
  }

  .dropzone {
    border: 1.5px dashed #DDD5C8;
    border-radius: 16px;
    background: #FAF8F4;
    padding: 60px 40px;
    text-align: center;
    cursor: pointer;
    transition: all .25s ease;
    position: relative; overflow: hidden;
  }
  .dropzone::after {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, rgba(201,100,66,.05) 0%, transparent 70%);
    pointer-events: none;
  }
  .dropzone:hover, .dropzone.over {
    border-color: #C96442;
    background: #FDF9F6;
    transform: translateY(-2px);
    box-shadow: 0 10px 36px rgba(201,100,66,.1);
  }
  .dropzone.err {
    border-color: #D4696B;
    background: #FEF7F7;
    animation: shake .4s ease;
  }
  @keyframes shake {
    0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
  }

  .dz-icon {
    width: 50px; height: 50px;
    background: #F2D5C8; border-radius: 14px;
    margin: 0 auto 18px;
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s;
  }
  .dropzone:hover .dz-icon { transform: scale(1.06); }

  .dz-title { font-family: 'Lora', serif; font-size: 19px; font-weight: 500; margin-bottom: 6px; }
  .dz-sub { font-size: 14px; color: #8C7B6E; line-height: 1.5; }
  .dz-sub strong { color: #C96442; font-weight: 500; }

  .dz-file {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 16px; padding: 9px 16px;
    background: #F2D5C8; border-radius: 8px;
  }
  .dz-file-name { font-family: 'DM Mono', monospace; font-size: 13px; color: #C96442; font-weight: 500; }

  .err-pill {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 14px; padding: 7px 14px;
    background: #FDEDED; border: 1px solid #F5C6C6;
    border-radius: 100px; font-size: 13px; color: #C0392B;
  }

  .privacy-strip {
    margin-top: 22px;
    display: flex; gap: 12px; align-items: flex-start;
    padding: 15px 18px;
    background: #D4EDE3;
    border: 1px solid #B7DDD0;
    border-radius: 10px;
  }
  .privacy-text { font-size: 13px; color: #2D6A4F; line-height: 1.55; }
  .privacy-text strong { font-weight: 500; }

  .analyze-btn {
    margin-top: 28px; width: 100%;
    padding: 15px 32px;
    background: #1A1612; color: #F5F0E8;
    border: none; border-radius: 12px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 400;
    letter-spacing: .2px;
    cursor: pointer;
    transition: all .2s ease;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .analyze-btn:hover:not(:disabled) {
    background: #2D2520;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(26,22,18,.22);
  }
  .analyze-btn:disabled { opacity: .38; cursor: not-allowed; }

  /* ── PROCESSING ── */
  .proc-wrap {
    max-width: 500px; margin: 0 auto;
    padding: 100px 32px; text-align: center;
    width: 100%;
  }
  .proc-spinner-box {
    width: 68px; height: 68px;
    background: #FAF8F4;
    border: 1px solid #DDD5C8;
    border-radius: 20px;
    margin: 0 auto 28px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,.05);
  }
  .spinner {
    width: 26px; height: 26px;
    border: 2.5px solid #DDD5C8;
    border-top-color: #C96442;
    border-radius: 50%;
    animation: spin .85s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .proc-title {
    font-family: 'Lora', serif;
    font-size: 25px; font-weight: 400;
    letter-spacing: -.5px; margin-bottom: 10px;
  }
  .proc-sub { font-size: 14px; color: #8C7B6E; line-height: 1.65; }

  .proc-steps {
    margin-top: 44px;
    border: 1px solid #DDD5C8; border-radius: 12px;
    overflow: hidden; background: #FAF8F4;
    text-align: left;
  }
  .proc-step {
    padding: 14px 18px;
    display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid #DDD5C8;
    transition: background .3s;
  }
  .proc-step:last-child { border-bottom: none; }
  .proc-step.active { background: #FDF9F6; }
  .proc-step.done { opacity: .6; }

  .step-ind {
    width: 22px; height: 22px;
    border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px;
  }
  .step-ind.pending { background: #EDE7D9; color: #C4B8AD; }
  .step-ind.active  { background: #F2D5C8; }
  .step-ind.done    { background: #D4EDE3; color: #2D6A4F; }

  .mini-spin {
    width: 11px; height: 11px;
    border: 1.5px solid #F2D5C8;
    border-top-color: #C96442;
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }

  .step-lbl { font-size: 13px; color: #4A3F35; }
  .step-lbl.active { color: #1A1612; font-weight: 500; }

  /* ── DASHBOARD ── */
  .dash { max-width: 1080px; margin: 0 auto; padding: 40px 32px 80px; width: 100%; }

  .dash-hdr {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 36px; gap: 16px; flex-wrap: wrap;
  }
  .dash-title {
    font-family: 'Lora', serif;
    font-size: 28px; font-weight: 400;
    letter-spacing: -.5px; margin-bottom: 4px;
  }
  .dash-sub { font-size: 13px; color: #8C7B6E; }

  .reset-btn {
    padding: 9px 18px;
    background: transparent; border: 1.5px solid #DDD5C8;
    border-radius: 8px; font-family: 'DM Sans', sans-serif;
    font-size: 13px; color: #4A3F35; cursor: pointer;
    transition: all .2s; white-space: nowrap;
  }
  .reset-btn:hover { border-color: #C96442; color: #C96442; }

  /* KPI row */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px; margin-bottom: 20px;
  }
  .kpi {
    background: #FAF8F4;
    border: 1px solid #DDD5C8; border-radius: 14px;
    padding: 22px 20px; position: relative; overflow: hidden;
  }
  .kpi::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--kc);
  }
  .kpi-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8C7B6E; margin-bottom: 8px; font-weight: 500; }
  .kpi-val { font-family: 'Lora', serif; font-size: 24px; font-weight: 500; letter-spacing: -.5px; margin-bottom: 3px; }
  .kpi-note { font-size: 12px; color: #8C7B6E; }
  .kpi-note.pos { color: #2D6A4F; }
  .kpi-note.warn { color: #C96442; }

  /* surplus */
  .surplus-bar {
    background: #D4EDE3; border: 1px solid #B7DDD0;
    border-radius: 14px; padding: 22px 26px;
    display: flex; gap: 16px; align-items: flex-start;
    margin-bottom: 20px;
  }
  .surplus-icon {
    width: 42px; height: 42px; flex-shrink: 0;
    background: white; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
  }
  .surplus-title { font-family: 'Lora', serif; font-size: 16px; font-weight: 500; color: #2D6A4F; margin-bottom: 5px; }
  .surplus-txt { font-size: 14px; color: #2D6A4F; line-height: 1.65; }
  .surplus-txt strong { font-weight: 600; }

  /* grid */
  .mid-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
  @media (max-width: 680px) { .mid-grid { grid-template-columns: 1fr; } }

  .card {
    background: #FAF8F4;
    border: 1px solid #DDD5C8; border-radius: 14px;
    padding: 26px;
  }
  .card-title {
    font-family: 'Lora', serif;
    font-size: 16px; font-weight: 500;
    letter-spacing: -.2px; margin-bottom: 18px;
  }

  /* custom tooltip */
  .ptip { background: #1A1612; color: #F5F0E8; padding: 9px 13px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
  .ptip-name { font-family: 'Lora', serif; }
  .ptip-val { font-family: 'DM Mono', monospace; font-size: 15px; }

  /* cat list */
  .cat-list { display: flex; flex-direction: column; gap: 10px; }
  .cat-row { display: flex; align-items: center; gap: 10px; }
  .cat-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .cat-name { flex: 1; font-size: 13px; color: #4A3F35; }
  .cat-bar-wrap { width: 70px; height: 4px; background: #EDE7D9; border-radius: 2px; overflow: hidden; }
  .cat-bar { height: 100%; border-radius: 2px; transition: width 1.2s cubic-bezier(.22,1,.36,1); }
  .cat-amt { font-family: 'DM Mono', monospace; font-size: 12px; color: #1A1612; font-weight: 500; min-width: 68px; text-align: right; }

  /* insights */
  .insights-card {
    background: #FAF8F4; border: 1px solid #DDD5C8;
    border-radius: 14px; padding: 26px; margin-bottom: 18px;
  }
  .insight-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .insight-hdr-sub { font-size: 13px; color: #8C7B6E; margin-bottom: 18px; }

  .insight-item {
    display: flex; gap: 14px;
    padding: 16px 0; border-bottom: 1px solid #DDD5C8;
    animation: fadeUp .5s ease both;
  }
  .insight-item:first-child { padding-top: 0; }
  .insight-item:last-child { border-bottom: none; padding-bottom: 0; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .insight-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 17px; }
  .insight-type { font-size: 10px; text-transform: uppercase; letter-spacing: .9px; font-weight: 600; margin-bottom: 3px; }
  .insight-txt { font-size: 14px; color: #4A3F35; line-height: 1.65; }
  .insight-txt strong { color: #1A1612; font-weight: 500; }

  /* tx table */
  .tx-card { background: #FAF8F4; border: 1px solid #DDD5C8; border-radius: 14px; overflow: hidden; }
  .tx-hdr { padding: 20px 26px 18px; border-bottom: 1px solid #DDD5C8; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .tx-scroll { overflow-x: auto; }
  .tx-table { width: 100%; border-collapse: collapse; }
  .tx-table th {
    padding: 9px 26px; text-align: left;
    font-size: 10px; text-transform: uppercase; letter-spacing: .8px;
    color: #C4B8AD; font-weight: 500;
    background: #EDE7D9; border-bottom: 1px solid #DDD5C8;
  }
  .tx-table td {
    padding: 12px 26px; font-size: 13px;
    color: #4A3F35; border-bottom: 1px solid #DDD5C8;
    transition: background .12s;
  }
  .tx-table tr:last-child td { border-bottom: none; }
  .tx-table tbody tr:hover td { background: #F7F3EE; }
  .tx-date { font-family: 'DM Mono', monospace; font-size: 12px; color: #8C7B6E; }
  .tx-desc { color: #1A1612; }
  .tx-amt { font-family: 'DM Mono', monospace; font-weight: 500; text-align: right; }
  .tx-amt.d { color: #C96442; }
  .tx-amt.c { color: #2D6A4F; }
  .cat-pill {
    display: inline-block; padding: 3px 9px;
    border-radius: 100px; font-size: 11px; font-weight: 500;
    background: #EDE7D9; color: #4A3F35;
  }
  .sub-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; background: #F0EAF8;
    border-radius: 100px; font-size: 11px; color: #7B5EA7; font-weight: 500;
  }
  .ai-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; background: #F2D5C8;
    border-radius: 100px; font-size: 11px; color: #C96442; font-weight: 500;
  }
`;

/* ─── CUSTOM PIE TOOLTIP ─────────────────────────────────────────── */
function PieTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="ptip">
      <div className="ptip-name">{d.name}</div>
      <div className="ptip-val">{fmt(d.value)}</div>
    </div>
  );
}

/* ─── UPLOAD STAGE ───────────────────────────────────────────────── */
function UploadStage({ onAnalyze, apiError }) {
  const [file, setFile]   = useState(null);
  const [error, setError] = useState("");
  const [over, setOver]   = useState(false);
  const inputRef = useRef();

  const accept = useCallback((f) => {
    if (!f) return;
    if (!f.name.endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Unsupported File Format — only PDF bank statements accepted.");
      setFile(null);
    } else {
      setError(""); setFile(f);
    }
  }, []);

  return (
    <div className="upload-wrap">
      <h1 className="upload-headline">Your finances,<br /><em>finally legible.</em></h1>
      <p className="upload-sub">
        Drop your bank statement and get an AI-powered breakdown of spending patterns, idle cash opportunities, and subscription fatigue — in seconds.
      </p>

      <div
        className={`dropzone${over ? " over" : ""}${error ? " err" : ""}`}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" style={{display:"none"}}
          onChange={e => accept(e.target.files[0])} />

        <div className="dz-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
              stroke="#C96442" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6M12 12v6M9 15l3-3 3 3"
              stroke="#C96442" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {file ? (
          <>
            <div className="dz-title">Ready to analyse</div>
            <div className="dz-file">
              <span style={{fontSize:14}}>📄</span>
              <span className="dz-file-name">{file.name}</span>
            </div>
          </>
        ) : (
          <>
            <div className="dz-title">Drop your bank statement here</div>
            <div className="dz-sub">or <strong>click to browse</strong> · PDF only</div>
          </>
        )}

        {error && (
          <div className="err-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}
      </div>

      <div className="privacy-strip">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{flexShrink:0,marginTop:1}}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
            stroke="#2D6A4F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className="privacy-text">
          <strong>Zero data retention.</strong> Your PDF is processed entirely in-memory — never written to disk, never stored or logged.
        </p>
      </div>

      {apiError && (
        <div className="err-pill" style={{marginTop:14, display:"flex", width:"100%", borderRadius:10, padding:"12px 16px"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0,marginTop:1}}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{marginLeft:8}}><strong>Backend error:</strong> {apiError}</span>
        </div>
      )}

      <button className="analyze-btn" disabled={!file} onClick={() => file && onAnalyze(file)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {file ? `Analyse ${file.name}` : "Select a PDF to continue"}
      </button>
    </div>
  );
}

/* ─── PROCESSING STAGE ───────────────────────────────────────────── */
function ProcessingStage({ stage }) {
  const steps = [
    { label: "Converting PDF pages to high-res images" },
    { label: "VLM extracting structured transaction data" },
    { label: "AI clustering transactions into lifestyle buckets" },
    { label: "Computing idle cash & subscription signals" },
  ];
  const activeIdx = stage === STAGE.PARSING ? 1 : 3;

  return (
    <div className="proc-wrap">
      <div className="proc-spinner-box"><div className="spinner" /></div>
      <h2 className="proc-title">
        {stage === STAGE.PARSING ? "Reading your statement…" : "Classifying your lifestyle…"}
      </h2>
      <p className="proc-sub">
        {stage === STAGE.PARSING
          ? "The vision model is parsing transaction rows from your PDF, handling complex table layouts OCR can't."
          : "Grouping transactions into meaningful AI-decided categories that reflect how you actually live."}
      </p>

      <div className="proc-steps">
        {steps.map((s, i) => {
          const isDone = i < activeIdx, isActive = i === activeIdx;
          return (
            <div key={i} className={`proc-step${isDone?" done":isActive?" active":""}`}>
              <div className={`step-ind${isDone?" done":isActive?" active":" pending"}`}>
                {isDone
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : isActive ? <div className="mini-spin" />
                  : <span style={{color:"#C4B8AD",fontSize:10}}>{i+1}</span>}
              </div>
              <span className={`step-lbl${isActive?" active":""}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DASHBOARD ──────────────────────────────────────────────────── */
function Dashboard({ data, onReset }) {
  // Use real API data if available, otherwise fall back to mock for preview
  const analysis = data || (() => {
    const mock = MOCK_TRANSACTIONS;
    const debits  = mock.filter(t => t.type === "Debit");
    const credits = mock.filter(t => t.type === "Credit");
    const totalBurn   = debits.reduce((s,t) => s+t.amount, 0);
    const totalIncome = credits.reduce((s,t) => s+t.amount, 0);
    const balance = totalIncome - totalBurn;
    const surplus = balance * 0.8;
    const catMap = {};
    debits.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
    return {
      transactions: mock,
      transaction_count: mock.length,
      period: "October 2026",
      idle_cash: { monthly_burn: totalBurn, total_income: totalIncome, balance, investable_surplus: surplus,
        recommendation: `You have ₹${surplus.toLocaleString("en-IN",{maximumFractionDigits:0})} in investable surplus. Moving to a Liquid Fund could yield 7% annually vs 3% in savings.` },
      categories: Object.entries(catMap).map(([name,total]) => ({ name, total, count:1, pct_of_spend: total/totalBurn*100 })).sort((a,b)=>b.total-a.total),
      subscriptions: mock.filter(t => t.category==="Subscriptions").map(t=>({desc:t.desc,amount:t.amount,date:t.date})),
    };
  })();

  const { transactions, categories, idle_cash, subscriptions, transaction_count, period } = analysis;
  const { monthly_burn: totalBurn, total_income: totalIncome, balance, investable_surplus: surplus } = idle_cash;
  const maxCat = categories[0]?.total || 1;
  const subs = subscriptions;
  const subTotal = subs.reduce((s,t) => s + t.amount, 0);

  // Build pie-chart-compatible data from categories
  const pieData = categories.map(c => ({ name: c.name, value: c.total }));

  const kpis = [
    { label: "Monthly Income",     value: fmt(totalIncome), note: "All credits",           noteClass: "pos", color: "#2D6A4F" },
    { label: "Monthly Burn",       value: fmt(totalBurn),   note: "All debit transactions", noteClass: "warn", color: "#C96442" },
    { label: "Net Balance",        value: fmt(balance),     note: "Income minus burn",      noteClass: "",    color: "#B5860D" },
    { label: "Investable Surplus", value: fmt(surplus),     note: "After 20% safety buffer",noteClass: "pos", color: "#7B5EA7" },
  ];

  const insights = [
    {
      icon: "💡", bg: "#F5EAC8", typeColor: "#B5860D", type: "Idle Cash Opportunity",
      text: idle_cash.recommendation ||
        `You have <strong>${fmt(surplus)}</strong> in investable surplus. Moving to a Liquid Fund could yield <strong>7% annually</strong> vs ~3% in savings.`,
    },
    {
      icon: "🔁", bg: "#F0EAF8", typeColor: "#7B5EA7", type: "Subscription Audit",
      text: `Found <strong>${subs.length} active subscription${subs.length !== 1 ? "s" : ""}</strong> totalling <strong>${fmt(subTotal)}/month</strong>${subs.length ? ` — ${subs.map(s => s.desc).join(", ")}` : ""}. That's <strong>${fmt(subTotal * 12)}/year</strong>.`,
    },
    {
      icon: "🍽️", bg: "#F2D5C8", typeColor: "#C96442", type: "Top Spend Bucket",
      text: categories[0]
        ? `<strong>${categories[0].name}</strong> is your largest category at <strong>${fmt(categories[0].total)}</strong> — <strong>${categories[0].pct_of_spend.toFixed(1)}%</strong> of total outgoings.`
        : "No spending patterns detected yet.",
    },
  ];

  return (
    <div className="dash">
      <div className="dash-hdr">
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <h2 className="dash-title">Financial Snapshot</h2>
            <span className="ai-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              AI-generated
            </span>
          </div>
          <p className="dash-sub">{period} · {transaction_count} transactions · Buckets determined dynamically by AI</p>
        </div>
        <button className="reset-btn" onClick={onReset}>↩ New analysis</button>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        {kpis.map((k, i) => (
          <div className="kpi" key={i} style={{"--kc": k.color}}>
            <div className="kpi-lbl">{k.label}</div>
            <div className="kpi-val">{k.value}</div>
            <div className={`kpi-note ${k.noteClass}`}>{k.note}</div>
          </div>
        ))}
      </div>

      {/* Surplus callout */}
      <div className="surplus-bar">
        <div className="surplus-icon">💰</div>
        <div>
          <div className="surplus-title">Idle Cash — {fmt(surplus)} available to deploy</div>
          <p className="surplus-txt">
            At <strong>7% in a Liquid Fund</strong>, that's <strong>~{fmt(Math.round(surplus*0.07/12))}/month</strong> in passive returns vs. <strong>~{fmt(Math.round(surplus*0.03/12))}/month</strong> in savings. No lock-in period, same-day liquidity.
          </p>
        </div>
      </div>
      <div className="mid-grid">
        <div className="card">
          <div className="card-title">Spend by Bucket</div>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={2} dataKey="value"
                animationBegin={0} animationDuration={900}>
                {pieData.map((c, i) => (
                  <Cell key={i} fill={CAT_COLORS[c.name] || "#A89880"} />
                ))}
              </Pie>
              <Tooltip content={<PieTip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">AI-Assigned Categories</div>
          <div className="cat-list">
            {categories.map((c, i) => (
              <div className="cat-row" key={i}>
                <div className="cat-dot" style={{background: CAT_COLORS[c.name]||"#A89880"}} />
                <span className="cat-name">{c.name}</span>
                <div className="cat-bar-wrap">
                  <div className="cat-bar" style={{width:`${(c.total/maxCat)*100}%`, background: CAT_COLORS[c.name]||"#A89880"}} />
                </div>
                <span className="cat-amt">{fmt(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="insights-card">
        <div className="insight-hdr">
          <div className="card-title" style={{margin:0}}>AI Insights & Recommendations</div>
          <span className="ai-badge">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
            Claude-powered
          </span>
        </div>
        <p className="insight-hdr-sub">Generated from your actual spending patterns — not generic templates.</p>
        {insights.map((ins, i) => (
          <div className="insight-item" key={i} style={{animationDelay:`${i*0.13}s`}}>
            <div className="insight-ico" style={{background: ins.bg}}>{ins.icon}</div>
            <div>
              <div className="insight-type" style={{color: ins.typeColor}}>{ins.type}</div>
              <p className="insight-txt" dangerouslySetInnerHTML={{__html: ins.text}} />
            </div>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div className="tx-card">
        <div className="tx-hdr">
          <div className="card-title" style={{margin:0}}>All Transactions</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span className="sub-badge">🔁 {subs.length} subscriptions flagged</span>
            <span style={{fontSize:12,color:"#8C7B6E"}}>{transaction_count} total</span>
          </div>
        </div>
        <div className="tx-scroll">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Category</th><th style={{textAlign:"right"}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td><span className="tx-date">{t.date}</span></td>
                  <td>
                    <span className="tx-desc">{t.desc}</span>
                    {t.category === "Subscriptions" && <span className="sub-badge" style={{marginLeft:8}}>🔁</span>}
                  </td>
                  <td>
                    <span className="cat-pill" style={{
                      background: (CAT_COLORS[t.category]||"#A89880") + "22",
                      color: CAT_COLORS[t.category]||"#4A3F35",
                    }}>
                      {t.category || "—"}
                    </span>
                  </td>
                  <td>
                    <span className={`tx-amt ${t.type==="Debit"?"d":"c"}`}>
                      {t.type==="Debit"?"−":"+"}{fmt(t.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────────────── */
export default function App() {
  const [stage, setStage] = useState(STAGE.UPLOAD);
  const [analysisData, setAnalysisData] = useState(null);
  const [apiError, setApiError] = useState("");

  const handleAnalyze = useCallback(async (file) => {
    setApiError("");
    setStage(STAGE.PARSING);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Show "parsing" UI for at least 1.5s so it doesn't flash
      const [response] = await Promise.all([
        fetch("http://localhost:8000/api/analyze", {
          method: "POST",
          body: formData,
        }),
        new Promise(r => setTimeout(r, 1500)),
      ]);

      setStage(STAGE.CLASSIFYING);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || `Server error ${response.status}`);
      }

      // Show "classifying" UI for at least 1s
      const [data] = await Promise.all([
        response.json(),
        new Promise(r => setTimeout(r, 1000)),
      ]);

      setAnalysisData(data);
      setStage(STAGE.DONE);

    } catch (err) {
      setApiError(err.message || "Something went wrong. Is the backend running?");
      setStage(STAGE.UPLOAD);
    }
  }, []);

  return (
    <>
      <style>{css}</style>
      <div className="fin-root">
        <header className="topbar">
          <div className="logo">
            <div className="logo-dot" />
            Ledger
          </div>
          <div className="topbar-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            In-memory · Zero retention
          </div>
        </header>

        <main className="main">
          {stage === STAGE.UPLOAD && <UploadStage onAnalyze={handleAnalyze} apiError={apiError} />}
          {(stage === STAGE.PARSING || stage === STAGE.CLASSIFYING) && <ProcessingStage stage={stage} />}
          {stage === STAGE.DONE && <Dashboard data={analysisData} onReset={() => { setStage(STAGE.UPLOAD); setAnalysisData(null); }} />}
        </main>
      </div>
    </>
  );
}
