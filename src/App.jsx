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
// ZoomSlider — dual-thumb range slider for chart zooming
// ═══════════════════════════════════════════════════════════════
const sliderThumbCss = `
input[type=range].zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 10px; height: 16px; background: #ff9f43; border: none;
  border-radius: 2px; cursor: pointer; margin-top: -6px;
}
input[type=range].zoom-slider::-moz-range-thumb {
  width: 10px; height: 16px; background: #ff9f43; border: none;
  border-radius: 2px; cursor: pointer;
}
input[type=range].zoom-slider::-webkit-slider-runnable-track {
  height: 4px; background: #1c1c24; border-radius: 2px;
}
input[type=range].zoom-slider::-moz-range-track {
  height: 4px; background: #1c1c24; border-radius: 2px;
}
`;

function ZoomSlider({ totalLength, zoomStart, zoomEnd, onChange }) {
  if (totalLength < 10) return null;
  const handleStart = (e) => {
    const v = Number(e.target.value);
    if (v < zoomEnd - 5) onChange(v, zoomEnd);
  };
  const handleEnd = (e) => {
    const v = Number(e.target.value);
    if (v > zoomStart + 5) onChange(zoomStart, v);
  };
  const pctL = (zoomStart / totalLength) * 100;
  const pctR = (zoomEnd / totalLength) * 100;
  return (
    <div style={{ padding: "4px 8px 6px", position: "relative" }}>
      <style>{sliderThumbCss}</style>
      <div style={{ position: "relative", height: 16, marginLeft: 44, marginRight: 0 }}>
        {/* Highlight bar */}
        <div style={{
          position: "absolute", top: 6, height: 4, borderRadius: 2,
          left: `${pctL}%`, right: `${100 - pctR}%`,
          background: `${T.orange}55`,
        }} />
        <input type="range" className="zoom-slider" min={0} max={totalLength} value={zoomStart}
          onChange={handleStart}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 16,
            WebkitAppearance: "none", appearance: "none", background: "transparent",
            pointerEvents: "none", zIndex: 2, margin: 0, padding: 0 }}
        />
        <input type="range" className="zoom-slider" min={0} max={totalLength} value={zoomEnd}
          onChange={handleEnd}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 16,
            WebkitAppearance: "none", appearance: "none", background: "transparent",
            pointerEvents: "none", zIndex: 3, margin: 0, padding: 0 }}
        />
        {/* Make thumbs clickable */}
        <style>{`
          input[type=range].zoom-slider { pointer-events: none; }
          input[type=range].zoom-slider::-webkit-slider-thumb { pointer-events: auto; }
          input[type=range].zoom-slider::-moz-range-thumb { pointer-events: auto; }
        `}</style>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helpers: convert dates array to timestamps for time-based x
// ═══════════════════════════════════════════════════════════════
function datesToTimestamps(dates) {
  return dates.map((d) => new Date(d).getTime());
}

function makeTimeXScale(timestamps, padL, padR, W) {
  const tMin = timestamps[0];
  const tMax = timestamps[timestamps.length - 1];
  const range = tMax - tMin || 1;
  const plotW = W - padL - padR;
  return (ts) => padL + ((ts - tMin) / range) * plotW;
}

// ═══════════════════════════════════════════════════════════════
// Align sparse indicator data to full daily SPX series
// ═══════════════════════════════════════════════════════════════
function alignIndicatorToDaily(dailyDates, dailySpx, indDates, indTrend) {
  if (!dailyDates?.length || !indDates?.length) return null;
  // Build a map: date string -> trend value
  const trendMap = {};
  for (let i = 0; i < indDates.length; i++) {
    trendMap[indDates[i]] = indTrend[i];
  }
  const indStart = indDates[0];
  const indEnd = indDates[indDates.length - 1];

  const alignedDates = [];
  const alignedSpx = [];
  const alignedTrend = [];
  let lastTrend = null;

  for (let i = 0; i < dailyDates.length; i++) {
    const d = dailyDates[i];
    if (d < indStart) continue;
    if (d > indEnd) break;
    if (trendMap[d] !== undefined) lastTrend = trendMap[d];
    if (lastTrend !== null && dailySpx[i] > 0) {
      alignedDates.push(d);
      alignedSpx.push(dailySpx[i]);
      alignedTrend.push(lastTrend);
    }
  }
  return { dates: alignedDates, spx: alignedSpx, trend: alignedTrend };
}

// ═══════════════════════════════════════════════════════════════
// RegimeChart — SPX line (white) with colored background bands
// ═══════════════════════════════════════════════════════════════
function RegimeChart({ dates, spx, trend, indicator, indLabel, height = 420 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(700);
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(dates.length);

  useEffect(() => {
    setZoomStart(0);
    setZoomEnd(dates.length);
  }, [dates.length]);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => { const w = e[0].contentRect.width; if (w > 0) setW(w); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const totalN = dates.length;
  if (totalN < 2) return <div style={{ color: T.dim, padding: 16, fontSize: 10 }}>NO DATA</div>;

  // Apply zoom window
  const zs = Math.max(0, Math.min(zoomStart, totalN - 2));
  const ze = Math.max(zs + 2, Math.min(zoomEnd, totalN));
  const zDates = dates.slice(zs, ze);
  const zSpx = spx.slice(zs, ze);
  const zTrend = trend.slice(zs, ze);
  const zIndicator = indicator ? indicator.slice(zs, ze) : null;
  const n = zDates.length;

  const hasInd = zIndicator != null;
  const pad = { l: 52, r: 8, t: 8, mid: hasInd ? 14 : 0, b: 18 };
  const topH = hasInd ? Math.floor((height - pad.t - pad.mid - pad.b) * 0.6) : height - pad.t - pad.b;
  const botH = hasInd ? height - pad.t - topH - pad.mid - pad.b : 0;

  // Time-based x scale
  const timestamps = datesToTimestamps(zDates);
  const xS = makeTimeXScale(timestamps, pad.l, pad.r, W);

  // SPX log scale
  const spxV = zSpx.filter((v) => v > 0);
  if (spxV.length < 1) return <div style={{ color: T.dim, padding: 16, fontSize: 10 }}>NO DATA</div>;
  const logMin = Math.log(Math.min(...spxV)) - 0.04;
  const logMax = Math.log(Math.max(...spxV)) + 0.04;
  const ySpx = (v) => (!v || v <= 0) ? null : pad.t + topH - ((Math.log(v) - logMin) / (logMax - logMin)) * topH;

  // Build background regime bands
  const buildBands = () => {
    const bands = [];
    let startIdx = 0;
    let curRegime = zTrend[0];
    for (let i = 1; i <= n; i++) {
      if (i === n || zTrend[i] !== curRegime) {
        const x1 = xS(timestamps[startIdx]);
        const x2 = i < n ? xS(timestamps[i]) : xS(timestamps[n - 1]);
        bands.push({
          x: x1, width: Math.max(0, x2 - x1),
          color: curRegime === 1 ? T.green : T.red,
        });
        if (i < n) {
          startIdx = i;
          curRegime = zTrend[i];
        }
      }
    }
    return bands;
  };
  const bands = buildBands();

  // Build single white price line
  let pricePath = "";
  for (let i = 0; i < n; i++) {
    const y = ySpx(zSpx[i]);
    if (y == null) continue;
    pricePath += (pricePath ? "L" : "M") + `${xS(timestamps[i]).toFixed(1)},${y.toFixed(1)}`;
  }

  // Indicator bottom panel
  let indMin = 0, indMax = 100, yInd = () => null;
  if (hasInd) {
    const iv = zIndicator.filter((v) => v != null && isFinite(v));
    indMin = Math.min(...iv); indMax = Math.max(...iv);
    const m = (indMax - indMin) * 0.05 || 1;
    indMin -= m; indMax += m;
    yInd = (v) => v == null ? null : pad.t + topH + pad.mid + botH - ((v - indMin) / (indMax - indMin)) * botH;
  }
  let indPath = "";
  if (hasInd) {
    for (let i = 0; i < n; i++) {
      const y = yInd(zIndicator[i]);
      if (y == null) continue;
      indPath += (indPath ? "L" : "M") + `${xS(timestamps[i]).toFixed(1)},${y.toFixed(1)}`;
    }
  }

  // Labels
  const spxTicks = [logMin, (logMin + logMax) / 2, logMax].map((lv) => ({
    y: pad.t + topH - ((lv - logMin) / (logMax - logMin)) * topH, label: Math.exp(lv).toFixed(0)
  }));
  const dateLbls = [];
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) dateLbls.push({ x: xS(timestamps[i]), label: new Date(zDates[i]).toLocaleDateString("en-US", { year: "2-digit", month: "short" }) });

  const handleMouse = (e) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const mouseX = e.clientX - r.left;
    // Find closest data point by x position
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xS(timestamps[i]) - mouseX);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    setHover(bestIdx);
  };
  const hx = hover != null ? xS(timestamps[hover]) : null;

  return (
    <div>
      <div ref={ref} style={{ position: "relative", width: "100%" }}
        onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={height} style={{ display: "block" }}>
          {/* Background regime bands */}
          {bands.map((b, i) => (
            <rect key={i} x={b.x} y={pad.t} width={b.width} height={topH}
              fill={b.color} opacity={0.08} />
          ))}
          {spxTicks.map((l, i) => <line key={i} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
          {/* White price line */}
          <path d={pricePath} fill="none" stroke={T.white} strokeWidth={1.2} />
          {hasInd && <line x1={pad.l} x2={W - pad.r} y1={pad.t + topH + pad.mid / 2} y2={pad.t + topH + pad.mid / 2} stroke={T.border} strokeWidth={0.5} />}
          {hasInd && <path d={indPath} fill="none" stroke={T.orange} strokeWidth={1} />}
          {hasInd && indLabel && <text x={pad.l + 4} y={pad.t + topH + pad.mid + 12} fill={T.orange} fontSize={8} fontFamily={T.font}>{indLabel}</text>}
          {spxTicks.map((l, i) => <text key={i} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}
          <text x={pad.l + 4} y={pad.t + 12} fill={T.dim} fontSize={8} fontFamily={T.font}>S&P 500 (log)</text>
          {dateLbls.map((l, i) => <text key={i} x={l.x} y={height - 2} fill={T.dim} fontSize={8} textAnchor="middle" fontFamily={T.font}>{l.label}</text>)}
          {hover != null && <>
            <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
            {ySpx(zSpx[hover]) != null && <circle cx={hx} cy={ySpx(zSpx[hover])} r={2.5} fill={T.white} stroke={T.bg} strokeWidth={1} />}
          </>}
        </svg>
        {hover != null && (
          <div style={{ position: "absolute", left: Math.min(hx + 10, W - 180), top: pad.t,
            background: "rgba(10,10,12,0.94)", border: `1px solid ${T.borderBright}`,
            padding: "5px 8px", pointerEvents: "none", zIndex: 10, fontFamily: T.font, fontSize: 9, lineHeight: 1.5 }}>
            <div style={{ color: T.dim }}>{zDates[hover]}</div>
            <div style={{ color: T.bright }}>SPX: {zSpx[hover]?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
            <div style={{ color: zTrend[hover] === 1 ? T.green : T.red }}>{zTrend[hover] === 1 ? "BULL" : "BEAR"}</div>
            {hasInd && zIndicator[hover] != null && <div style={{ color: T.orange }}>{indLabel}: {zIndicator[hover]?.toFixed(1)}</div>}
          </div>
        )}
      </div>
      <ZoomSlider totalLength={totalN} zoomStart={zoomStart} zoomEnd={zoomEnd}
        onChange={(s, e) => { setZoomStart(s); setZoomEnd(e); }} />
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
function IndicatorRow({ ind, index, dailyDates, dailySpx }) {
  const [expanded, setExpanded] = useState(false);
  const [tf, setTf] = useState("2Y");
  const hasDates = ind.dates && ind.dates.length > 1;

  // Align indicator's sparse trend to full daily SPX data
  const aligned = useMemo(() => {
    if (!hasDates || !dailyDates?.length) return null;
    return alignIndicatorToDaily(dailyDates, dailySpx, ind.dates, ind.trend);
  }, [ind, hasDates, dailyDates, dailySpx]);

  const sliced = useMemo(() => {
    if (!aligned) return null;
    return sliceByTf(aligned.dates, [aligned.spx, aligned.trend], tf);
  }, [aligned, tf]);

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
      {expanded && aligned && sliced && (
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
// EquityCurveChart — orange strategy + drawdown subplot
// ═══════════════════════════════════════════════════════════════
function EquityCurveChart({ dates, strategy, buyHold, height = 480 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(600);
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(dates.length);

  useEffect(() => {
    setZoomStart(0);
    setZoomEnd(dates.length);
  }, [dates.length]);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => { const w = e[0].contentRect.width; if (w > 0) setW(w); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const totalN = dates.length;
  if (totalN < 2) return null;

  // Apply zoom
  const zs = Math.max(0, Math.min(zoomStart, totalN - 2));
  const ze = Math.max(zs + 2, Math.min(zoomEnd, totalN));
  const zDates = dates.slice(zs, ze);
  const zStrategy = strategy.slice(zs, ze);
  const zBuyHold = buyHold.slice(zs, ze);
  const n = zDates.length;

  const pad = { l: 52, r: 8, t: 12, mid: 12, b: 20 };
  const eqH = Math.floor((height - pad.t - pad.mid - pad.b) * 0.65);
  const ddH = height - pad.t - eqH - pad.mid - pad.b;

  // Time-based x
  const timestamps = datesToTimestamps(zDates);
  const xS = makeTimeXScale(timestamps, pad.l, pad.r, W);

  // Equity y scale
  const allVals = [...zStrategy, ...zBuyHold].filter((v) => v != null && isFinite(v));
  const mn = Math.min(...allVals) * 0.98, mx = Math.max(...allVals) * 1.02;
  const yS = (v) => (v == null || !isFinite(v)) ? null : pad.t + eqH - ((v - mn) / (mx - mn)) * eqH;

  // Compute drawdown arrays
  const computeDD = (vals) => {
    const dd = [];
    let peak = 0;
    for (const v of vals) {
      if (v != null && v > peak) peak = v;
      dd.push(peak > 0 ? (v - peak) / peak : 0);
    }
    return dd;
  };
  const stratDD = computeDD(zStrategy);
  const bhDD = computeDD(zBuyHold);

  // Drawdown y scale
  const allDD = [...stratDD, ...bhDD].filter((v) => v != null && isFinite(v));
  const ddMin = Math.min(0, Math.min(...allDD)) * 1.05;
  const ddMax = 0;
  const ddTop = pad.t + eqH + pad.mid;
  const yDD = (v) => (v == null || !isFinite(v)) ? null : ddTop + ddH - ((v - ddMin) / (ddMax - ddMin || 1)) * ddH;

  const buildPath = (vals, yFn) => {
    let p = "";
    for (let i = 0; i < n; i++) {
      const y = yFn(vals[i]);
      if (y == null) continue;
      p += (p ? "L" : "M") + `${xS(timestamps[i]).toFixed(1)},${y.toFixed(1)}`;
    }
    return p;
  };

  // Build filled area path for drawdowns
  const buildAreaPath = (vals, yFn) => {
    let points = [];
    for (let i = 0; i < n; i++) {
      const y = yFn(vals[i]);
      if (y == null) continue;
      points.push({ x: xS(timestamps[i]), y });
    }
    if (points.length < 2) return "";
    const baseline = yFn(0);
    let p = `M${points[0].x.toFixed(1)},${baseline.toFixed(1)}`;
    for (const pt of points) p += `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    p += `L${points[points.length - 1].x.toFixed(1)},${baseline.toFixed(1)}Z`;
    return p;
  };

  const eqTicks = [mn, (mn + mx) / 2, mx].map((v) => ({ y: yS(v), label: v.toFixed(0) }));
  const ddTicks = [ddMin, ddMin / 2, 0].map((v) => ({ y: yDD(v), label: `${(v * 100).toFixed(0)}%` }));

  const dateLbls = [];
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) dateLbls.push({ x: xS(timestamps[i]), label: new Date(zDates[i]).toLocaleDateString("en-US", { year: "2-digit", month: "short" }) });

  const handleMouse = (e) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const mouseX = e.clientX - r.left;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xS(timestamps[i]) - mouseX);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    setHover(bestIdx);
  };
  const hx = hover != null ? xS(timestamps[hover]) : null;

  const stratReturn = zStrategy.length >= 2 ? (zStrategy[zStrategy.length - 1] / zStrategy[0] - 1) * 100 : 0;
  const bhReturn = zBuyHold.length >= 2 ? (zBuyHold[zBuyHold.length - 1] / zBuyHold[0] - 1) * 100 : 0;

  return (
    <div>
      <div ref={ref} style={{ position: "relative", width: "100%" }} onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
        <div style={{ padding: "0 8px 2px", display: "flex", gap: 16, fontSize: 9, color: T.dim }}>
          <span>— <span style={{ color: T.orange }}>STRATEGY</span> {stratReturn >= 0 ? "+" : ""}{stratReturn.toFixed(1)}%</span>
          <span>— <span style={{ color: T.dim }}>BUY & HOLD</span> {bhReturn >= 0 ? "+" : ""}{bhReturn.toFixed(1)}%</span>
        </div>
        <svg width={W} height={height} style={{ display: "block" }}>
          {/* Equity curve area */}
          {eqTicks.map((l, i) => <line key={i} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
          {yS(100) != null && <line x1={pad.l} x2={W - pad.r} y1={yS(100)} y2={yS(100)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3,4" />}
          <path d={buildPath(zBuyHold, yS)} fill="none" stroke={T.dim} strokeWidth={1} opacity={0.5} />
          <path d={buildPath(zStrategy, yS)} fill="none" stroke={T.orange} strokeWidth={1.4} />
          {eqTicks.map((l, i) => <text key={i} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}

          {/* Separator */}
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + eqH + pad.mid / 2} y2={pad.t + eqH + pad.mid / 2} stroke={T.border} strokeWidth={0.5} />

          {/* Drawdown subplot */}
          <text x={pad.l + 4} y={ddTop + 10} fill={T.dim} fontSize={8} fontFamily={T.font}>DRAWDOWN</text>
          {ddTicks.map((l, i) => <line key={`dd${i}`} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
          <path d={buildAreaPath(bhDD, yDD)} fill={`${T.dim}15`} stroke="none" />
          <path d={buildPath(bhDD, yDD)} fill="none" stroke={T.dim} strokeWidth={0.7} opacity={0.5} />
          <path d={buildAreaPath(stratDD, yDD)} fill={`${T.orange}15`} stroke="none" />
          <path d={buildPath(stratDD, yDD)} fill="none" stroke={T.orange} strokeWidth={0.9} />
          {ddTicks.map((l, i) => <text key={`ddt${i}`} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}

          {/* Date labels */}
          {dateLbls.map((l, i) => <text key={i} x={l.x} y={height - 4} fill={T.dim} fontSize={8} textAnchor="middle" fontFamily={T.font}>{l.label}</text>)}

          {/* Hover */}
          {hover != null && <>
            <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
            {yS(zStrategy[hover]) != null && <circle cx={hx} cy={yS(zStrategy[hover])} r={2.5} fill={T.orange} stroke={T.bg} strokeWidth={1} />}
            {yDD(stratDD[hover]) != null && <circle cx={hx} cy={yDD(stratDD[hover])} r={2} fill={T.orange} stroke={T.bg} strokeWidth={1} />}
          </>}
        </svg>
        {hover != null && (
          <div style={{ position: "absolute", left: Math.min(hx + 10, W - 200), top: pad.t,
            background: "rgba(10,10,12,0.94)", border: `1px solid ${T.borderBright}`,
            padding: "5px 8px", pointerEvents: "none", zIndex: 10, fontFamily: T.font, fontSize: 9, lineHeight: 1.5 }}>
            <div style={{ color: T.dim }}>{zDates[hover]}</div>
            <div style={{ color: T.orange }}>Strategy: {zStrategy[hover]?.toFixed(1)}</div>
            <div style={{ color: T.text }}>Buy & Hold: {zBuyHold[hover]?.toFixed(1)}</div>
            <div style={{ color: T.orange, borderTop: `1px solid ${T.border}`, marginTop: 2, paddingTop: 2 }}>
              Strat DD: {(stratDD[hover] * 100).toFixed(1)}%
            </div>
            <div style={{ color: T.dim }}>B&H DD: {(bhDD[hover] * 100).toFixed(1)}%</div>
          </div>
        )}
      </div>
      <ZoomSlider totalLength={totalN} zoomStart={zoomStart} zoomEnd={zoomEnd}
        onChange={(s, e) => { setZoomStart(s); setZoomEnd(e); }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SimpleChart — generic time series (line + optional area fill)
// ═══════════════════════════════════════════════════════════════
function SimpleChart({ dates, values, color = T.orange, label = "", yFormat = (v) => v.toFixed(2), height = 220, areaFill = false, areaBase = null }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(600);
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(dates.length);

  useEffect(() => { setZoomStart(0); setZoomEnd(dates.length); }, [dates.length]);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => { const w = e[0].contentRect.width; if (w > 0) setW(w); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const totalN = dates.length;
  if (totalN < 2) return <div style={{ color: T.dim, padding: 16, fontSize: 10 }}>NO DATA</div>;

  const zs = Math.max(0, Math.min(zoomStart, totalN - 2));
  const ze = Math.max(zs + 2, Math.min(zoomEnd, totalN));
  const zDates = dates.slice(zs, ze);
  const zVals = values.slice(zs, ze);
  const n = zDates.length;

  const pad = { l: 52, r: 8, t: 10, b: 20 };
  const plotH = height - pad.t - pad.b;
  const timestamps = datesToTimestamps(zDates);
  const xS = makeTimeXScale(timestamps, pad.l, pad.r, W);

  const valid = zVals.filter(v => v != null && isFinite(v));
  if (valid.length < 1) return <div style={{ color: T.dim, padding: 16, fontSize: 10 }}>NO DATA</div>;
  const mn = areaBase != null ? Math.min(areaBase, Math.min(...valid)) : Math.min(...valid) * 0.98;
  const mx = Math.max(...valid) * 1.02;
  const range = mx - mn || 1;
  const yS = (v) => (v == null || !isFinite(v)) ? null : pad.t + plotH - ((v - mn) / range) * plotH;

  let linePath = "";
  for (let i = 0; i < n; i++) {
    const y = yS(zVals[i]);
    if (y == null) continue;
    linePath += (linePath ? "L" : "M") + `${xS(timestamps[i]).toFixed(1)},${y.toFixed(1)}`;
  }

  let aP = "";
  if (areaFill) {
    const base = yS(areaBase != null ? areaBase : mn);
    if (base != null) {
      let started = false;
      for (let i = 0; i < n; i++) {
        const y = yS(zVals[i]);
        if (y == null) continue;
        if (!started) { aP = `M${xS(timestamps[i]).toFixed(1)},${base.toFixed(1)}`; started = true; }
        aP += `L${xS(timestamps[i]).toFixed(1)},${y.toFixed(1)}`;
      }
      if (started) aP += `L${xS(timestamps[n - 1]).toFixed(1)},${base.toFixed(1)}Z`;
    }
  }

  const yTicks = [mn, (mn + mx) / 2, mx].map(v => ({ y: yS(v), label: yFormat(v) }));
  const dateLbls = [];
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) dateLbls.push({ x: xS(timestamps[i]), label: new Date(zDates[i]).toLocaleDateString("en-US", { year: "2-digit", month: "short" }) });

  const handleMouse = (e) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const mouseX = e.clientX - r.left;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xS(timestamps[i]) - mouseX); if (d < bd) { bd = d; bi = i; } }
    setHover(bi);
  };
  const hx = hover != null ? xS(timestamps[hover]) : null;

  return (
    <div>
      <div ref={ref} style={{ position: "relative", width: "100%" }} onMouseMove={handleMouse} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={height} style={{ display: "block" }}>
          {yTicks.map((l, i) => <line key={i} x1={pad.l} x2={W - pad.r} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.03)" />)}
          {areaFill && aP && <path d={aP} fill={`${color}15`} />}
          <path d={linePath} fill="none" stroke={color} strokeWidth={1.2} />
          {yTicks.map((l, i) => <text key={`t${i}`} x={pad.l - 4} y={l.y + 3} fill={T.dim} fontSize={8} textAnchor="end" fontFamily={T.font}>{l.label}</text>)}
          {dateLbls.map((l, i) => <text key={`d${i}`} x={l.x} y={height - 4} fill={T.dim} fontSize={8} textAnchor="middle" fontFamily={T.font}>{l.label}</text>)}
          {hover != null && <>
            <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
            {yS(zVals[hover]) != null && <circle cx={hx} cy={yS(zVals[hover])} r={2.5} fill={color} stroke={T.bg} strokeWidth={1} />}
          </>}
        </svg>
        {hover != null && zVals[hover] != null && (
          <div style={{ position: "absolute", left: Math.min(hx + 10, W - 160), top: pad.t,
            background: "rgba(10,10,12,0.94)", border: `1px solid ${T.borderBright}`,
            padding: "5px 8px", pointerEvents: "none", zIndex: 10, fontFamily: T.font, fontSize: 9, lineHeight: 1.5 }}>
            <div style={{ color: T.dim }}>{zDates[hover]}</div>
            <div style={{ color }}>{label}: {yFormat(zVals[hover])}</div>
          </div>
        )}
      </div>
      <ZoomSlider totalLength={totalN} zoomStart={zoomStart} zoomEnd={zoomEnd}
        onChange={(s, e) => { setZoomStart(s); setZoomEnd(e); }} />
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
            Above 55% = <span style={{ color: T.green }}>BULL</span> regime (green background). Below = <span style={{ color: T.red }}>BEAR</span> regime (red background).
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
          {ltInds.map((ind, i) => <IndicatorRow key={ind.col} ind={ind} index={i + 1} dailyDates={data?.lt?.dates} dailySpx={data?.lt?.spx} />)}

          {/* THM indicators */}
          <div style={{ padding: "10px 8px 2px", fontSize: 9, color: T.orange, fontWeight: 600, letterSpacing: 0.8 }}>HEALTH MODEL</div>
          {thmInds.map((ind, i) => <IndicatorRow key={ind.col} ind={ind} index={i + 4} dailyDates={data?.thm?.dates} dailySpx={data?.thm?.spx} />)}
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
            The <span style={{ color: T.orange }}>orange line</span> shows the return of being long S&P 500 only during <span style={{ color: T.green }}>BULL</span> regimes and flat during <span style={{ color: T.red }}>BEAR</span> regimes.
            The <span style={{ color: T.dim }}>grey line</span> is a simple buy-and-hold benchmark. Both start at 100. The drawdown subplot shows peak-to-trough declines.
          </InfoBox>
          <div style={{ background: T.bgPanel, flex: 1 }}>
            <EquityCurveChart dates={bt.equity.dates} strategy={bt.equity.strategy} buyHold={bt.equity.buyHold} height={460} />
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
// VIXY Model — Quantpedia tail-hedge strategy
// ═══════════════════════════════════════════════════════════════
const VIXY_STRATS = [
  { key: "Sizing eVRP(5D)+MA30", label: "SZ 5D+MA" },
  { key: "Sizing eVRP(10D)", label: "SZ 10D" },
  { key: "Fixed eVRP(10D)+MA30", label: "FX 10D+MA" },
  { key: "Fixed eVRP(10D)", label: "FX 10D" },
  { key: "Benchmark VIX>VIX3M", label: "VIX>3M" },
];

function VixyModelView({ data, loading, error, onRetry }) {
  const [selStrat, setSelStrat] = useState("Sizing eVRP(5D)+MA30");
  const [tf, setTf] = useState("ALL");

  if (loading) return (
    <div style={{ textAlign: "center", paddingTop: 100 }}>
      <div style={{ fontSize: 12, color: T.orange, letterSpacing: 2, marginBottom: 6 }}>LOADING</div>
      <div style={{ fontSize: 10, color: T.dim }}>Computing VIXY model from Yahoo Finance data…</div>
    </div>
  );
  if (error) return (
    <div style={{ textAlign: "center", paddingTop: 100 }}>
      <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>ERROR: {error}</div>
      <button onClick={onRetry} style={{ padding: "4px 14px", fontSize: 10, fontFamily: T.font,
        border: `1px solid ${T.border}`, background: "transparent", color: T.dim, cursor: "pointer" }}>RETRY</button>
    </div>
  );
  if (!data?.strategies) return null;

  const strat = data.strategies[selStrat];
  const spy = data.strategies["100% SPY"];
  if (!strat || !spy) return null;

  // Apply timeframe filter
  const { dates, arrays } = sliceByTf(
    data.dates,
    [strat.equity, spy.equity, strat.hedge_weight, strat.vixy_sleeve_equity],
    tf
  );
  const [sEq, spyEq, hw, slEq] = arrays;

  // Normalize equity to start at 100 from visible window
  const norm = (arr) => { const b = arr[0] || 1; return arr.map(v => v / b * 100); };
  const nStrat = norm(sEq);
  const nSpy = norm(spyEq);

  const cs = data.current_signals || {};
  const latestWeight = hw.length > 0 ? hw[hw.length - 1] : 0;
  const hedgeOn =
    selStrat.includes("Benchmark") ? cs.benchmark_on :
    selStrat === "Sizing eVRP(5D)+MA30" ? cs.sizing_e5_ma30_on :
    selStrat.includes("MA30") ? cs.evrp10_ma30_on :
    cs.evrp10_on;

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 0", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 8 }}>
        <ButtonStrip label="STRATEGY" options={VIXY_STRATS.map(s => ({ value: s.key, label: s.label }))} value={selStrat} onChange={setSelStrat} />
        <TimeframeBar value={tf} onChange={setTf} />
      </div>

      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* LEFT: Charts */}
        <div style={{ flex: "1 1 55%", minWidth: 0, borderRight: `1px solid ${T.border}`, overflow: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, padding: "8px 8px 0" }}>STRATEGY EQUITY CURVE</div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>How to read: </span>
            <span style={{ color: T.orange }}>Orange</span> = 80% SPY + dynamic VIXY hedge. <span style={{ color: T.dim }}>Grey</span> = 100% SPY buy-and-hold.
            Strategy from <a href="https://quantpedia.com/hedging-tail-risk-with-robust-vixy-models/" target="_blank" rel="noreferrer" style={{ color: T.cyan }}>Quantpedia</a>.
          </InfoBox>
          <div style={{ background: T.bgPanel }}>
            <EquityCurveChart dates={dates} strategy={nStrat} buyHold={nSpy} height={380} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, padding: "12px 8px 0" }}>DAILY VIXY ALLOCATION</div>
          <InfoBox>
            <span style={{ color: T.orange, fontWeight: 600 }}>How to read: </span>
            Recommended portfolio weight in VIXY. Sizing mode: weight = VIX/100 when signal is active.
            Fixed mode: 20% when signal is active. <span style={{ color: T.orange }}>Orange area</span> = hedge on.
          </InfoBox>
          <div style={{ background: T.bgPanel }}>
            <SimpleChart dates={dates} values={hw} color={T.orange} label="VIXY Weight"
              yFormat={v => `${(v * 100).toFixed(1)}%`} height={220} areaFill areaBase={0} />
          </div>
        </div>

        {/* RIGHT: Signals + Stats + Sleeve */}
        <div style={{ flex: "1 1 45%", minWidth: 0, overflow: "auto" }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, marginBottom: 4 }}>CURRENT SIGNALS</div>
            <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              <StatCell label="VIX" value={cs.vix} color={T.bright} />
              <StatCell label="VIX3M" value={cs.vix3m} color={T.bright} />
              <StatCell label="eVRP 5D" value={cs.evrp_5d} color={cs.evrp_5d != null && cs.evrp_5d <= 0 ? T.red : T.green} />
              <StatCell label="eVRP 10D" value={cs.evrp_10d} color={cs.evrp_10d != null && cs.evrp_10d <= 0 ? T.red : T.green} />
            </div>
            <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              <StatCell label="VIX MA30" value={cs.vix_ma30} color={T.bright} />
              <StatCell label="HEDGE ON" value={hedgeOn ? "YES" : "NO"} color={hedgeOn ? T.green : T.dim} />
              <StatCell label="REC. WEIGHT" value={`${(latestWeight * 100).toFixed(1)}%`} color={latestWeight > 0 ? T.orange : T.dim} />
              <StatCell label="AS OF" value={cs.date} color={T.dim} />
            </div>
          </div>

          <div style={{ padding: "8px 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8, marginBottom: 4 }}>STRATEGY COMPARISON</div>
            <InfoBox>
              <span style={{ color: T.orange, fontWeight: 600 }}>Reading the table: </span>
              Click any row to switch charts. eVRP = implied vol − realized vol. Signal fires when eVRP ≤ 0.
              MA filter adds VIX &gt; 30D average. Sizing = VIX/100 weight instead of fixed 20%.
            </InfoBox>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: T.font }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {["STRATEGY", "CAGR", "VOL", "SHARPE", "MAX DD"].map(h => (
                    <th key={h} style={{ padding: "5px 4px", textAlign: h === "STRATEGY" ? "left" : "right",
                      color: T.dim, fontWeight: 600, letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[{ key: "100% SPY", label: "100% SPY" }, ...VIXY_STRATS].map(({ key, label }) => {
                  const st = data.strategies[key]?.stats;
                  if (!st) return null;
                  const active = key === selStrat;
                  return (
                    <tr key={key} onClick={() => key !== "100% SPY" && setSelStrat(key)}
                      style={{ borderBottom: `1px solid ${T.border}`,
                        background: active ? `${T.orange}11` : "transparent",
                        cursor: key !== "100% SPY" ? "pointer" : "default" }}>
                      <td style={{ padding: "4px 4px", color: active ? T.orange : T.text }}>{label}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: st.cagr >= 0 ? T.green : T.red }}>{st.cagr.toFixed(1)}%</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.text }}>{st.vol.toFixed(1)}%</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: st.sharpe >= 0.5 ? T.green : T.text }}>{st.sharpe.toFixed(2)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.red }}>-{st.max_dd.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: "8px 8px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.white, letterSpacing: 0.8 }}>VIXY SLEEVE EQUITY</div>
            <InfoBox>
              <span style={{ color: T.orange, fontWeight: 600 }}>How to read: </span>
              Growth of $1 invested in the VIXY hedge component only. Isolates the tail-hedge contribution from core SPY.
            </InfoBox>
            <div style={{ background: T.bgPanel }}>
              <SimpleChart dates={dates} values={slEq} color={T.cyan} label="Sleeve"
                yFormat={v => `$${v.toFixed(3)}`} height={200} />
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
  const [vixyData, setVixyData] = useState(null);
  const [vixyLoading, setVixyLoading] = useState(false);
  const [vixyError, setVixyError] = useState(null);
  const vixyFetched = useRef(false);

  const loadData = useCallback(async () => {
    try { setLoading(true); setError(null); const d = await fetchData(); setData(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadVixy = useCallback(async () => {
    if (vixyFetched.current) return;
    vixyFetched.current = true;
    try {
      setVixyLoading(true); setVixyError(null);
      const res = await fetch("/api/vixy");
      if (!res.ok) throw new Error(`API ${res.status}`);
      setVixyData(await res.json());
    } catch (e) { setVixyError(e.message); vixyFetched.current = false; }
    finally { setVixyLoading(false); }
  }, []);

  useEffect(() => { if (subTab === "VIXY MODEL") loadVixy(); }, [subTab, loadVixy]);

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
        <SubTabs tabs={["COMPOSITE SIGNAL", "BACKTEST", "VIXY MODEL"]} active={subTab} onChange={setSubTab} />
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
      : subTab === "BACKTEST"
      ? <BacktestView data={data} />
      : <VixyModelView data={vixyData} loading={vixyLoading} error={vixyError}
          onRetry={() => { vixyFetched.current = false; loadVixy(); }} />
  );
}
