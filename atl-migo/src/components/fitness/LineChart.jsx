import React from "react";

export default function LineChart({ data, valueKey, height = 180 }) {
  const w = 720;
  const h = height;
  const pad = 16;

  const values = data.map((d) => (d?.[valueKey] == null ? 0 : Number(d[valueKey]) || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);

  const toX = (i) => {
    if (data.length <= 1) return pad;
    return pad + (i * (w - pad * 2)) / (data.length - 1);
  };

  const toY = (v) => {
    const range = Math.max(1e-9, max - min);
    const t = (v - min) / range; // 0..1
    return h - pad - t * (h - pad * 2);
  };

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const lastVal = values.length ? values[values.length - 1] : null;

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="chart">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.12" />
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={pts} opacity="0.85" />
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
        <span>{data[0]?.date ?? "—"}</span>
        <span>Latest: {lastVal == null ? "—" : Number.isFinite(lastVal) ? lastVal.toFixed(2) : "—"}</span>
        <span>{data[data.length - 1]?.date ?? "—"}</span>
      </div>
    </div>
  );
}
