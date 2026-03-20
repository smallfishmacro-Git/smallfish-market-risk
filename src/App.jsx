import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════
const API = "/api/data";
async function fetchData() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Theme — unified terminal design
// ═══════════════════════════════════════════════════════════════
const T = {
  bg: "#0a0a0c", bgPanel: "#0e0e12", bgCard: "#111116",
  border: "#1c1c24", borderBright: "#2a2a35",
  text: "#8a8f9a", dim: "#4a4e58", bright: "#e8eaef", white: "#ffffff",
  cyan: "#00d4ff", orange: "#ff9f43", green: "#00ff88",
  red: "#ff4757", amber: "#ffbe0b", purple: "#a855f7",
  font: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
};

// ═══════════════════════════════════════════════════════════════
// Timeframe
// ═══════════════════════════════════════════════════════════════
const TF_LIST = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "10Y", "15Y", "20Y", "ALL"];
function tfCutoff(tf) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const map = { "1M": [0,1], "3M": [0,3], "6M": [0,6], "YTD": null, "1Y": [1,0], "2Y": [2,0], "5Y": [5,0], "10Y": [10,0], "15Y": [15,0], "20Y": [20,0] };
  if (tf === "YTD") return new Date(y, 0, 1);
  if (tf === "ALL") return null;
  const [yy, mm] = map[tf] || [0, 0];
  return yy ? new Date(y - yy, m, d) : new Date(y, m - mm, d);
}
function sliceByTf(dates, arrays, tf) {
  const cutoff = tfCutoff(tf);
  if (!cutoff) return { dates, arrays };
  const cutStr = cutoff.toISOString().split("T")[0];
  const si = dates.findIndex((d) => d >= cutStr);
  if (si < 0) return { dates, arrays };
  return { dates: dates.slice(si), arrays: arrays.map((a) => a.slice(si)) };
}

// ═══════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════
function InfoBox({ children }) {
  return (
    <div style={{ padding: "6px 10px", margin: "6px 8px", fontSize: 9, lineHeight: 1.6,
      fontFamily: T.font, color: T.text, background: "rgba(255,159,67,0.04)",
      border: `1px solid ${T.orange}33` }}>{children}</div>
  );
}

function TimeframeBar({ value, onChange, style: s }) {
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "center", ...s }}>
      <span style={{ color: T.dim, fontSize: 9, fontFamily: T.font, letterSpacing: 0.5, marginRight: 6 }}>RANGE:</span>
      {TF_LIST.map((t) => {
        const a = value === t;
        return (<button key={t} onClick={() => onChange(t)} style={{
          padding: "3px 8px", fontSize: 9, fontWeight: a ? 700 : 400, fontFamily: T.font,
          cursor: "pointer", letterSpacing: 0.3, borderRadius: 0,
          background: a ? T.orange : "transparent", color: a ? "#000" : T.dim,
          border: `1px solid ${a ? T.orange : T.border}`, marginLeft: -1,
        }}>{t}</button>);
      })}
    </div>
  );
}

function ButtonStrip({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <span style={{ color: T.dim, fontSize: 9, fontFamily: T.font, letterSpacing: 0.5, marginRight: 6 }}>{label}:</span>
      {options.map((o) => {
        const val = typeof o === "object" ? o.value : o;
        const lbl = typeof o === "object" ? o.label : String(o);
        const a = value === val;
        return (<button key={val} onClick={() => onChange(val)} style={{
          padding: "3px 8px", fontSize: 9, fontWeight: a ? 700 : 400, fontFamily: T.font,
          cursor: "pointer", letterSpacing: 0.3, borderRadius: 0,
          background: a ? T.orange : "transparent", color: a ? "#000" : T.dim,
          border: `1px solid ${a ? T.orange : T.border}`, marginLeft: -1,
        }}>{lbl}</button>);
      })}
    </div>
  );
}

function StatCell({ label, value, color }) {
  return (
    <div style={{ padding: "8px 10px", background: T.bgPanel, border: `1px solid ${T.border}`, flex: "1 1 0" }}>
      <div style={{ fontSize: 8, color: T.dim, letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || T.bright }}>{value}</div>
    </div>
  );
}

function TitleBar({ fetchedAt, onRefresh, refreshing }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 16px", background: T.bg, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.orange, fontFamily: T.font, letterSpacing: 2 }}>SMALLFISHMACRO</span>
        <span style={{ fontSize: 12, color: T.dim, fontFamily: T.font, letterSpacing: 1 }}>TERMINAL</span>
        <span style={{ fontSize: 10, color: T.dim, fontFamily: T.font }}>v1.0</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 9, fontFamily: T.font, color: T.dim }}>
        <span>{fetchedAt ? new Date(fetchedAt).toLocaleString() : ""}</span>
        <button onClick={onRefresh} disabled={refreshing} style={{
          padding: "3px 10px", fontSize: 9, fontFamily: T.font, border: `1px solid ${T.border}`,
          background: "transparent", color: T.dim, cursor: "pointer", letterSpacing: 0.5,
        }}>{refreshing ? "..." : "REFRESH"}</button>
      </div>
    </div>
  );
}

const NAV_TABS = ["DASHBOARD", "BUY THE DIP", "MARKET RISK", "OVERVIEW", "STRATEGY MAP"];
function NavBar({ active }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, background: T.bg, padding: "0 16px" }}>
      {NAV_TABS.map((tab) => {
        const a = tab === active;
        return (<div key={tab} style={{ padding: "8px 16px", fontSize: 11, fontWeight: a ? 700 : 400,
          fontFamily: T.font, color: a ? T.orange : T.dim,
          borderBottom: a ? `2px solid ${T.orange}` : "2px solid transparent",
          cursor: "pointer", letterSpacing: 0.8 }}>{tab}</div>);
      })}
    </div>
  );
}

function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
      {tabs.map((tab) => {
        const a = tab === active;
        return (<div key={tab} onClick={() => onChange(tab)} style={{
          padding: "8px 18px", fontSize: 11, fontWeight: a ? 600 : 400,
          fontFamily: T.font, letterSpacing: 0.8, cursor: "pointer",
          color: a ? T.white : T.dim, borderBottom: a ? `2px solid ${T.white}` : "2px solid transparent",
          marginBottom: -1 }}>{tab}</div>);
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RegimeChart — SPX line colored by bull/bear regime
// ═══════════════════════════════════════════════════════════════
function RegimeChart({ dates, spx, trend, indicator, indLabel, height = 420 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(700);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => { const w = e[0].contentRect.width; if (w > 0) setW(w); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const n = dates.length;
  if (n < 2) return <div style={{ color: T.dim, padding: 16, fontSize: 10 }}>NO DATA</div>;

  const hasInd = indicator != null;
  const pad = { l: 52, r: 8, t: 8, mid: hasInd ? 14 : 0, b: 18 };
  const topH = hasInd ? Math.floor((height - pad.t - pad.mid - pad.b) * 0.6) : height - pad.t - pad.b;
  const botH = hasInd ? height - pad.t - topH - pad.mid - pad.b : 0;
  const xS = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);

  // SPX log scale
  const spxV = spx.filter((v) => v > 0);
  const logMin = Math.log(Math.min(...spxV)) - 0.04;
  const logMax = Math.log(Math.max(...spxV)) + 0.04;
  const ySpx = (v) => (!v || v <= 0) ? null : pad.t + topH - ((Math.log(v) - logMin) / (logMax - logMin)) * topH;

  // Build colored segments
  const buildSegments = () => {
    const segs = [];
    let curColor = trend[0] === 1 ? T.green : T.red;
    let path = "";
    for (let i = 0; i < n; i++) {
      const y = ySpx(spx[i]);
      if (y == null) continue;
      const c = trend[i] === 1 ? T.green : T.red;
      if (c !== curColor) {
        if (path) segs.push({ path, color: curColor });
        path = `M${xS(i).toFixed(1)},${y.toFixed(1)}`;
        curColor = c;
      } else {
        path += (path ? "L" : "M") + `${xS(i).toFixed(1)},${y.toFixed(1)}`;
      }
    }
    if (path) segs.push({ path, color: curColor });
    return segs;
  };
  const segments = buildSegments();

  // Indicator bottom panel
  let indMin = 0, indMax = 100, yInd = () => null;
  if (hasInd) {
    const iv = indicator.filter((v) => v != null && isFinite(v));
    indMin = Math.min(...iv); indMax = Math.max(...iv);
    const m = (indMax - indMin) * 0.05 || 1;
    indMin -= m; indMax += m;
    yInd = (v) => v == null ? null : pad.t + topH + pad.mid + botH - ((v - indMin) / (indMax - indMin)) * botH;
  }
  let indPath = "";
  if (hasInd) {
    for (let i = 0; i < n; i++) {
      const y = yInd(indicator[i]);
      if (y == null) continue;
      indPath += (indPath ? "L" : "M") + `${xS(i).toFixed(1)},${y.toFixed(1)}`;
    }
  }

  // Labels
  const spxTicks = [logMin, (logMin + logMax) / 2, logMax].map((lv) => ({
    y: pad.t + topH - ((lv - logMin) / (logMax - logMin)) * topH, label: Math.exp(lv).toFixed(0)
  }));
  const dateLbls = [];
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) dateLbls.push({ x: xS(i), label: new Date(dates[i]).toLocaleDateString("en-US", { year: "2-digit", month: "short" }) });

  const handleMouse = (e) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const idx = Math.round(((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    if (idx >= 0 && idx < n) setHover(idx);
  };
  const hx = hover != null ? xS(hover) : null;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}
      onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={height} style={{ display: "block" }}>
        {spxTicks.map((l, i) => <line key={i} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
        {segments.map((s, i) => <path key={i} d={s.path} fill="none" stroke={s.color} strokeWidth={1.2} />)}
        {hasInd && <line x1={pad.l} x2={W - pad.r} y1={pad.t + topH + pad.mid / 2} y2={pad.t + topH + pad.mid / 2} stroke={T.border} strokeWidth={0.5} />}
        {hasInd && <path d={indPath} fill="none" stroke={T.orange} strokeWidth={1} />}
        {hasInd && indLabel && <text x={pad.l + 4} y={pad.t + topH + pad.mid + 12} fill={T.orange} fontSize={8} fontFamily={T.font}>{indLabel}</text>}
        {spxTicks.map((l, i) => <text key={i} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}
        <text x={pad.l + 4} y={pad.t + 12} fill={T.dim} fontSize={8} fontFamily={T.font}>S&P 500 (log)</text>
        {dateLbls.map((l, i) => <text key={i} x={l.x} y={height - 2} fill={T.dim} fontSize={8} textAnchor="middle" fontFamily={T.font}>{l.label}</text>)}
        {hover != null && <>
          <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
          {ySpx(spx[hover]) != null && <circle cx={hx} cy={ySpx(spx[hover])} r={2.5} fill={trend[hover] === 1 ? T.green : T.red} stroke={T.bg} strokeWidth={1} />}
        </>}
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", left: Math.min(hx + 10, W - 180), top: pad.t,
          background: "rgba(10,10,12,0.94)", border: `1px solid ${T.borderBright}`,
          padding: "5px 8px", pointerEvents: "none", zIndex: 10, fontFamily: T.font, fontSize: 9, lineHeight: 1.5 }}>
          <div style={{ color: T.dim }}>{dates[hover]}</div>
          <div style={{ color: T.bright }}>SPX: {spx[hover]?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
          <div style={{ color: trend[hover] === 1 ? T.green : T.red }}>{trend[hover] === 1 ? "BULL" : "BEAR"}</div>
          {hasInd && indicator[hover] != null && <div style={{ color: T.orange }}>{indLabel}: {indicator[hover]?.toFixed(1)}</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Signal badge (Long/Short)
// ═══════════════════════════════════════════════════════════════
function SignalBadge({ value }) {
  if (value === 1) return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 48, padding: "2px 0", fontSize: 9, fontWeight: 700, fontFamily: T.font, letterSpacing: 0.5,
    background: `${T.green}18`, color: T.green, border: `1px solid ${T.green}55` }}>LONG</span>;
  if (value === 0) return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 48, padding: "2px 0", fontSize: 9, fontWeight: 700, fontFamily: T.font, letterSpacing: 0.5,
    background: `${T.red}18`, color: T.red, border: `1px solid ${T.red}55` }}>SHORT</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 48, padding: "2px 0", fontSize: 9, fontWeight: 700, fontFamily: T.font, color: T.dim,
    border: `1px solid ${T.border}` }}>—</span>;
}

// ═══════════════════════════════════════════════════════════════
// IndicatorRow — expandable
// ═══════════════════════════════════════════════════════════════
function IndicatorRow({ ind, index }) {
  const [expanded, setExpanded] = useState(false);
  const [tf, setTf] = useState("2Y");
  const hasDates = ind.dates && ind.dates.length > 1;

  const sliced = useMemo(() => {
    if (!hasDates) return null;
    return sliceByTf(ind.dates, [ind.spx, ind.trend], tf);
  }, [ind, tf, hasDates]);

  return (
    <div style={{ background: expanded ? T.bgCard : "transparent", borderBottom: `1px solid ${T.border}` }}>
      <div onClick={() => setExpanded(!expanded)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 8px 7px 0", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 16, borderRadius: 2, background: T.border, color: T.text,
            fontSize: 8, fontWeight: 700, fontFamily: T.font,
            display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{index}</span>
          <span style={{ fontSize: 10, color: expanded ? T.bright : T.text, fontWeight: 500, letterSpacing: 0.2 }}>{ind.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {ind.lastChange && <span style={{ fontSize: 8, color: T.dim }}>{ind.lastChange}</span>}
          <SignalBadge value={ind.status} />
          <span style={{ color: T.dim, fontSize: 10 }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </div>
      {expanded && hasDates && sliced && (
        <div style={{ padding: "4px 8px 10px" }}>
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4 }}>
            <TimeframeBar value={tf} onChange={setTf} />
          </div>
          <RegimeChart dates={sliced.dates} spx={sliced.arrays[0]} trend={sliced.arrays[1]} height={300} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EquityCurveChart
// ═══════════════════════════════════════════════════════════════
function EquityCurveChart({ dates, strategy, buyHold, height = 380 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => { const w = e[0].contentRect.width; if (w > 0) setW(w); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const n = dates.length;
  if (n < 2) return null;
  const pad = { l: 52, r: 8, t: 12, b: 20 };
  const H = height - pad.t - pad.b;
  const xS = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const allVals = [...strategy, ...buyHold].filter((v) => v != null && isFinite(v));
  const mn = Math.min(...allVals) * 0.98, mx = Math.max(...allVals) * 1.02;
  const yS = (v) => (v == null || !isFinite(v)) ? null : pad.t + H - ((v - mn) / (mx - mn)) * H;

  const buildPath = (vals) => { let p = ""; for (let i = 0; i < n; i++) { const y = yS(vals[i]); if (y == null) continue; p += (p ? "L" : "M") + `${xS(i).toFixed(1)},${y.toFixed(1)}`; } return p; };
  const ticks = [mn, (mn + mx) / 2, mx].map((v) => ({ y: yS(v), label: v.toFixed(0) }));
  const dateLbls = []; const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) dateLbls.push({ x: xS(i), label: new Date(dates[i]).toLocaleDateString("en-US", { year: "2-digit", month: "short" }) });

  const handleMouse = (e) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; const idx = Math.round(((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * (n - 1)); if (idx >= 0 && idx < n) setHover(idx); };
  const hx = hover != null ? xS(hover) : null;
  const stratReturn = strategy.length >= 2 ? (strategy[strategy.length - 1] / strategy[0] - 1) * 100 : 0;
  const bhReturn = buyHold.length >= 2 ? (buyHold[buyHold.length - 1] / buyHold[0] - 1) * 100 : 0;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }} onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
      <div style={{ padding: "0 8px 2px", display: "flex", gap: 16, fontSize: 9, color: T.dim }}>
        <span>— <span style={{ color: T.green }}>STRATEGY</span> {stratReturn >= 0 ? "+" : ""}{stratReturn.toFixed(1)}%</span>
        <span>— <span style={{ color: T.dim }}>BUY & HOLD</span> {bhReturn >= 0 ? "+" : ""}{bhReturn.toFixed(1)}%</span>
      </div>
      <svg width={W} height={height} style={{ display: "block" }}>
        {ticks.map((l, i) => <line key={i} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
        {yS(100) != null && <line x1={pad.l} x2={W - pad.r} y1={yS(100)} y2={yS(100)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3,4" />}
        <path d={buildPath(buyHold)} fill="none" stroke={T.dim} strokeWidth={1} opacity={0.5} />
        <path d={buildPath(strategy)} fill="none" stroke={T.green} strokeWidth={1.2} />
        {ticks.map((l, i) => <text key={i} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}
        {dateLbls.map((l, i) => <text key={i} x={l.x} y={height - 4} fill={T.dim} fontSize={8} textAnchor="middle" fontFamily={T.font}>{l.label}</text>)}
        {hover != null && <>
          <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + H} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
          {yS(strategy[hover]) != null && <circle cx={hx} cy={yS(strategy[hover])} r={2.5} fill={T.green} stroke={T.bg} strokeWidth={1} />}
        </>}
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", left: Math.min(hx + 10, W - 180), top: pad.t,
          background: "rgba(10,10,12,0.94)", border: `1px solid ${T.borderBright}`,
          padding: "5px 8px", pointerEvents: "none", zIndex: 10, fontFamily: T.font, fontSize: 9, lineHeight: 1.5 }}>
          <div style={{ color: T.dim }}>{dates[hover]}</div>
          <div style={{ color: T.green }}>Strategy: {strategy[hover]?.toFixed(1)}</div>
          <div style={{ color: T.text }}>Buy & Hold: {buyHold[hover]?.toFixed(1)}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Backtest computation
// ═══════════════════════════════════════════════════════════════
const BT_HORIZONS = [
  { key: "1M", days: 21 }, { key: "3M", days: 63 }, { key: "6M", days: 126 }, { key: "1Y", days: 252 }, { key: "3Y", days: 756 },
];

function computeBacktest(data, model, threshold, dateRange) {
  if (!data) return null;
  const src = model === "THM" ? data.thm : data.lt;
  if (!src?.dates?.length) return null;

  const { dates, spx, trend, composite } = src;
  const n = dates.length;

  // Apply date range
  const cutoff = tfCutoff(dateRange);
  const cutStr = cutoff ? cutoff.toISOString().split("T")[0] : null;
  const si = cutStr ? Math.max(0, dates.findIndex((d) => d >= cutStr)) : 0;

  // Build bull signal based on threshold
  const bull = [];
  for (let i = si; i < n; i++) {
    if (model === "THM") {
      bull.push(composite[i] != null && composite[i] > threshold ? 1 : 0);
    } else {
      bull.push(composite[i] != null && composite[i] >= threshold ? 1 : 0);
    }
  }
  const slDates = dates.slice(si);
  const slSpx = spx.slice(si);
  const m = bull.length;

  // Find regime entries (bear→bull transitions)
  const entries = [];
  for (let i = 1; i < m; i++) {
    if (bull[i] === 1 && bull[i - 1] === 0 && slSpx[i] > 0) entries.push(i);
  }

  // Forward returns from each entry
  const trades = entries.map((idx) => {
    const entry = slSpx[idx];
    const fwd = {};
    for (const h of BT_HORIZONS) {
      const ei = idx + h.days;
      fwd[h.key] = (ei < m && slSpx[ei] > 0) ? (slSpx[ei] - entry) / entry : null;
    }
    return { idx, date: slDates[idx], entry, fwd };
  });

  // Equity curve: long SPX when bull, flat when bear
  let equity = 100;
  const eqDates = [], eqStrategy = [], eqBuyHold = [];
  const firstSpx = slSpx[0] > 0 ? slSpx[0] : 1;
  for (let i = 0; i < m; i++) {
    if (slSpx[i] <= 0) continue;
    eqDates.push(slDates[i]);
    eqBuyHold.push(100 * slSpx[i] / firstSpx);
    if (i > 0 && slSpx[i - 1] > 0 && bull[i - 1] === 1) {
      equity *= slSpx[i] / slSpx[i - 1];
    }
    eqStrategy.push(equity);
  }

  // Stats per horizon
  const horizonStats = BT_HORIZONS.map((h) => {
    const rets = trades.map((t) => t.fwd[h.key]).filter((r) => r != null);
    const avg = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const w = rets.length ? rets.filter((r) => r > 0).length / rets.length : 0;
    // All-days baseline
    let allR = [];
    for (let j = si; j < n - h.days; j++) {
      if (spx[j] > 0 && spx[j + h.days] > 0) allR.push((spx[j + h.days] - spx[j]) / spx[j]);
    }
    const allAvg = allR.length ? allR.reduce((a, b) => a + b, 0) / allR.length : 0;
    const allWin = allR.length ? allR.filter((r) => r > 0).length / allR.length : 0;
    return { key: h.key, avg, winRate: w, count: rets.length, allDayAvg: allAvg, allDayWin: allWin, allDayCount: allR.length };
  });

  // Summary
  const bullDays = bull.filter((b) => b === 1).length;
  const bearDays = bull.filter((b) => b === 0).length;
  let peak = 0, maxDD = 0;
  for (const v of eqStrategy) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }
  const totalReturn = eqStrategy.length >= 2 ? (eqStrategy[eqStrategy.length - 1] / eqStrategy[0] - 1) : 0;
  const bhReturn = eqBuyHold.length >= 2 ? (eqBuyHold[eqBuyHold.length - 1] / eqBuyHold[0] - 1) : 0;

  return {
    trades, equity: { dates: eqDates, strategy: eqStrategy, buyHold: eqBuyHold },
    horizonStats,
    stats: { entries: entries.length, bullDays, bearDays, totalReturn, bhReturn, maxDD },
  };
}

// ═══════════════════════════════════════════════════════════════
// CompositeSignalView
// ═══════════════════════════════════════════════════════════════
function CompositeSignalView({ data }) {
  const [thmTf, setThmTf] = useState("5Y");
  const [ltTf, setLtTf] = useState("ALL");

  const thmSliced = useMemo(() => {
    if (!data?.thm) return null;
    return sliceByTf(data.thm.dates, [data.thm.spx, data.thm.trend, data.thm.composite], thmTf);
  }, [data, thmTf]);

  const ltSliced = useMemo(() => {
    if (!data?.lt) return null;
    return sliceByTf(data.lt.dates, [data.lt.spx, data.lt.trend, data.lt.composite], ltTf);
  }, [data, ltTf]);

  const m = data?.metrics || {};
  const ltInds = data?.indicators?.filter((i) => i.group === "lt") || [];
  const thmInds = data?.indicators?.filter((i) => i.group === "thm") || [];

  return (
    <>
      {/* Main 2-column layout */}
      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* LEFT: Charts */}
        <div style={{ flex: "1 1 55%", minWidth: 0, borderRight: `1px solid ${T.border}`, overflow: "auto" }}>
          {/* THM Chart */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 8px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8 }}>
              TREND HEALTH MODEL
              <span style={{ fontWeight: 400, color: T.dim, fontSize: 9, marginLeft: 8 }}>
                {m.thmScore}% — <span style={{ color: m.thmBull ? T.green : T.red }}>{m.thmBull ? "BULL" : "BEAR"}</span>
              </span>
            </div>
            <TimeframeBar value={thmTf} onChange={setThmTf} />
          </div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>How to read this: </span>
            The Trend Health Model aggregates 18 indicators across macro, breadth, volatility, momentum, and sentiment.
            The composite score (0–100%) reflects the percentage of indicators in a bullish state.
            Above 55% = <span style={{ color: T.green }}>BULL</span> regime (green line). Below = <span style={{ color: T.red }}>BEAR</span> regime (red line).
          </InfoBox>
          <div style={{ background: T.bgPanel }}>
            {thmSliced && <RegimeChart dates={thmSliced.dates} spx={thmSliced.arrays[0]} trend={thmSliced.arrays[1]} indicator={thmSliced.arrays[2]} indLabel="Health Score %" height={380} />}
          </div>

          {/* LT Chart */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8 }}>
              LONG TERM COMPOSITE
              <span style={{ fontWeight: 400, color: T.dim, fontSize: 9, marginLeft: 8 }}>
                {m.ltScore}/{m.ltTotal} — <span style={{ color: m.ltBull ? T.green : T.red }}>{m.ltBull ? "BULL" : "BEAR"}</span>
              </span>
            </div>
            <TimeframeBar value={ltTf} onChange={setLtTf} />
          </div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>How to read this: </span>
            The Long Term Composite tracks 3 slow-moving macro indicators: OECD CLI, Nasdaq 100 Hi-Lo breadth, and credit spreads.
            When ≥2 out of 3 are bullish, the model signals <span style={{ color: T.green }}>BULL</span>.
            This composite captures structural economic regime shifts and rarely changes — ideal for strategic allocation.
          </InfoBox>
          <div style={{ background: T.bgPanel }}>
            {ltSliced && <RegimeChart dates={ltSliced.dates} spx={ltSliced.arrays[0]} trend={ltSliced.arrays[1]} indicator={ltSliced.arrays[2]} indLabel="Composite Score" height={340} />}
          </div>
        </div>

        {/* RIGHT: Indicator tables */}
        <div style={{ flex: "1 1 45%", minWidth: 0, overflow: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, padding: "8px 8px 0",
            display: "flex", justifyContent: "space-between" }}>
            <span>INDICATORS</span>
            <span style={{ fontWeight: 400, color: T.dim, fontSize: 9 }}>
              {m.bullishCount}/{m.totalCount} bullish · Click to expand
            </span>
          </div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>Reading the table: </span>
            Each indicator outputs a binary signal: <span style={{ color: T.green, fontWeight: 600 }}>LONG</span> (bullish — risk on) or <span style={{ color: T.red, fontWeight: 600 }}>SHORT</span> (bearish — risk off).
            The date shows the last regime change. Expand any row to see SPX colored by the indicator's bull/bear periods.
          </InfoBox>

          {/* LT indicators */}
          <div style={{ padding: "6px 8px 2px", fontSize: 9, color: T.orange, fontWeight: 600, letterSpacing: 0.8 }}>LONG TERM</div>
          {ltInds.map((ind, i) => <IndicatorRow key={ind.col} ind={ind} index={i + 1} />)}

          {/* THM indicators */}
          <div style={{ padding: "10px 8px 2px", fontSize: 9, color: T.orange, fontWeight: 600, letterSpacing: 0.8 }}>HEALTH MODEL</div>
          {thmInds.map((ind, i) => <IndicatorRow key={ind.col} ind={ind} index={i + 4} />)}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BacktestView
// ═══════════════════════════════════════════════════════════════
function BacktestView({ data }) {
  const [model, setModel] = useState("THM");
  const [threshold, setThreshold] = useState(55);
  const [dateRange, setDateRange] = useState("ALL");

  const thmOpts = [
    { value: 45, label: ">45%" }, { value: 50, label: ">50%" },
    { value: 55, label: ">55%" }, { value: 60, label: ">60%" }, { value: 70, label: ">70%" },
  ];
  const ltOpts = [
    { value: 1, label: "≥1" }, { value: 2, label: "≥2" }, { value: 3, label: "=3" },
  ];

  // Reset threshold when model changes
  const handleModelChange = (m) => { setModel(m); setThreshold(m === "THM" ? 55 : 2); };

  const bt = useMemo(
    () => computeBacktest(data, model, threshold, dateRange),
    [data, model, threshold, dateRange]
  );

  if (!bt) return null;

  const pct = (v) => v == null ? "—" : `${(v * 100) >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  const pctColor = (v) => v == null ? T.dim : v >= 0 ? T.green : T.red;

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 0", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ButtonStrip label="MODEL" options={[{ value: "THM", label: "HEALTH" }, { value: "LT", label: "LONG TERM" }]} value={model} onChange={handleModelChange} />
          <ButtonStrip label="THRESHOLD" options={model === "THM" ? thmOpts : ltOpts} value={threshold} onChange={setThreshold} />
        </div>
        <TimeframeBar value={dateRange} onChange={setDateRange} />
      </div>

      {/* Layout */}
      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* LEFT: equity curve + trade log */}
        <div style={{ flex: "1 1 55%", minWidth: 0, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, padding: "8px 8px 0" }}>EQUITY CURVE</div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>How to read this: </span>
            The <span style={{ color: T.green }}>green line</span> shows the return of being long S&P 500 only during <span style={{ color: T.green }}>BULL</span> regimes and flat during <span style={{ color: T.red }}>BEAR</span> regimes.
            The <span style={{ color: T.dim }}>grey line</span> is a simple buy-and-hold benchmark. Both start at 100.
          </InfoBox>
          <div style={{ background: T.bgPanel, flex: 1 }}>
            <EquityCurveChart dates={bt.equity.dates} strategy={bt.equity.strategy} buyHold={bt.equity.buyHold} height={360} />
          </div>

          {/* Trade log */}
          <div style={{ padding: "8px 8px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, marginBottom: 4 }}>
              REGIME ENTRIES <span style={{ fontWeight: 400, color: T.dim, fontSize: 9, marginLeft: 8 }}>{bt.trades.length} bull entries</span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px", maxHeight: 200 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: T.font }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {["DATE", "SPX", ...BT_HORIZONS.map((h) => h.key)].map((h) => (
                    <th key={h} style={{ padding: "5px 4px", textAlign: h === "DATE" ? "left" : "right",
                      color: T.dim, fontWeight: 600, letterSpacing: 0.5,
                      position: "sticky", top: 0, background: T.bg, zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bt.trades.slice().reverse().map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "4px 4px", color: T.text }}>{t.date}</td>
                    <td style={{ padding: "4px 4px", textAlign: "right", color: T.bright }}>{t.entry.toFixed(0)}</td>
                    {BT_HORIZONS.map((h) => (
                      <td key={h.key} style={{ padding: "4px 4px", textAlign: "right", color: pctColor(t.fwd[h.key]) }}>{pct(t.fwd[h.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: summary + forward returns */}
        <div style={{ flex: "1 1 45%", minWidth: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, marginBottom: 0 }}>SUMMARY</div>
            <InfoBox>
              <span style={{ color: T.orange, fontWeight: 600 }}>How to read this: </span>
              The strategy is long S&P 500 during bull regimes and flat (cash) during bear regimes. BULL DAYS / BEAR DAYS show the time split. MAX DRAWDOWN is the worst peak-to-trough decline of the strategy.
            </InfoBox>
            <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              <StatCell label="REGIME ENTRIES" value={bt.stats.entries} />
              <StatCell label="STRATEGY RETURN" value={pct(bt.stats.totalReturn)} color={pctColor(bt.stats.totalReturn)} />
              <StatCell label="BUY & HOLD" value={pct(bt.stats.bhReturn)} color={pctColor(bt.stats.bhReturn)} />
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <StatCell label="BULL DAYS" value={bt.stats.bullDays.toLocaleString()} color={T.green} />
              <StatCell label="BEAR DAYS" value={bt.stats.bearDays.toLocaleString()} color={T.red} />
              <StatCell label="MAX DRAWDOWN" value={`-${(bt.stats.maxDD * 100).toFixed(1)}%`} color={T.red} />
            </div>
          </div>

          {/* Forward returns */}
          <div style={{ padding: "8px 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, marginBottom: 0 }}>FORWARD RETURNS AFTER BULL ENTRY</div>
            <InfoBox>
              <span style={{ color: T.orange, fontWeight: 600 }}>Reading the table: </span>
              <span style={{ color: T.green }}>SIGNAL AVG</span> = average S&P 500 return after each bear→bull transition.
              <span style={{ color: T.dim }}> ALL DAYS AVG</span> = average return from any random day — the baseline.
              A signal that consistently beats the all-days average demonstrates the model captures genuine regime shifts.
            </InfoBox>
            <div style={{ display: "flex", gap: 2 }}>
              {bt.horizonStats.map((h) => (
                <div key={h.key} style={{ flex: 1, padding: "6px 6px", background: T.bgPanel, border: `1px solid ${T.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: T.dim, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5 }}>{h.key}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(h.avg) }}>{pct(h.avg)}</div>
                  <div style={{ fontSize: 8, color: T.dim, marginTop: 2 }}>{(h.winRate * 100).toFixed(0)}% win · {h.count} entries</div>
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border}`, fontSize: 8, color: T.dim }}>ALL DAYS</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: pctColor(h.allDayAvg), marginTop: 1 }}>{pct(h.allDayAvg)}</div>
                  <div style={{ fontSize: 8, color: T.dim, marginTop: 1 }}>{(h.allDayWin * 100).toFixed(0)}% win · {h.allDayCount.toLocaleString()}d</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [subTab, setSubTab] = useState("COMPOSITE SIGNAL");

  const loadData = useCallback(async () => {
    try { setLoading(true); setError(null); const d = await fetchData(); setData(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const m = data?.metrics || {};
  const fetchedAt = data?.computedAt;
  const thmColor = m.thmBull ? T.green : T.red;

  const shell = (content) => (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>
      <TitleBar fetchedAt={fetchedAt} onRefresh={() => { setRefreshing(true); loadData(); }} refreshing={refreshing} />
      <NavBar active="MARKET RISK" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 0" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.white, letterSpacing: 1 }}>MARKET RISK</span>
          {data && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <div style={{ padding: "3px 10px", fontSize: 10, fontFamily: T.font,
                background: `${thmColor}18`, border: `1px solid ${thmColor}44`,
                color: thmColor, fontWeight: 700, letterSpacing: 0.5 }}>
                {m.thmBull ? "BULL" : "BEAR"} ({m.thmScore}%)
              </div>
              <div style={{ padding: "3px 10px", fontSize: 9, fontFamily: T.font,
                color: T.dim, background: T.bgPanel, border: `1px solid ${T.border}` }}>
                LT <span style={{ color: m.ltBull ? T.green : T.red }}>{m.ltScore}/{m.ltTotal}</span>
              </div>
              <div style={{ padding: "3px 10px", fontSize: 9, fontFamily: T.font,
                color: T.dim, background: T.bgPanel, border: `1px solid ${T.border}` }}>
                SPX <span style={{ color: T.bright }}>{m.spxPrice?.toLocaleString()}</span>
                <span style={{ color: m.spxChg >= 0 ? T.green : T.red, marginLeft: 4 }}>{m.spxChg >= 0 ? "+" : ""}{m.spxChg}%</span>
              </div>
            </div>
          )}
        </div>
        <SubTabs tabs={["COMPOSITE SIGNAL", "BACKTEST"]} active={subTab} onChange={setSubTab} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{content}</div>
      </div>
      <div style={{ textAlign: "center", padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
        <span style={{ color: T.dim, fontSize: 8, letterSpacing: 1, fontFamily: T.font }}>
          SMALLFISHMACRO · BARCHART · FRED · YFINANCE · GITHUB ACTIONS · VERCEL EDGE
        </span>
      </div>
    </div>
  );

  if (loading) return shell(<div style={{ textAlign: "center", paddingTop: 100 }}>
    <div style={{ fontSize: 12, color: T.orange, letterSpacing: 2, marginBottom: 6 }}>LOADING</div>
    <div style={{ fontSize: 10, color: T.dim }}>Fetching market risk data...</div>
  </div>);

  if (error) return shell(<div style={{ textAlign: "center", paddingTop: 100 }}>
    <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>ERROR: {error}</div>
    <button onClick={loadData} style={{ padding: "4px 14px", fontSize: 10, fontFamily: T.font,
      border: `1px solid ${T.border}`, background: "transparent", color: T.dim, cursor: "pointer" }}>RETRY</button>
  </div>);

  return shell(
    subTab === "COMPOSITE SIGNAL"
      ? <CompositeSignalView data={data} />
      : <BacktestView data={data} />
  );
}
