import { useMemo } from "react";
import styles from "./FitbitTrendCharts.module.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

function parseISODate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function formatTickDate(iso) {
  const dt = parseISODate(iso);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function unitForKey(k) {
  if (k === "restingHeartRate") return " bpm";
  if (k === "hrvDailyRmssd") return " ms";
  if (k === "sleepMinutes") return " min";
  if (k === "sleepQualityScore") return ""; // score is unitless
  if (k === "caloriesOut") return ""; // kcal optional, keep clean
  return ""; // steps etc.
}

function formatValue(v, dataKey) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);

  // HRV/RHR usually look best as integers
  if (dataKey === "restingHeartRate" || dataKey === "hrvDailyRmssd") {
    return `${Math.round(n).toLocaleString()}${unitForKey(dataKey)}`;
  }

  // sleep score often integer
  if (dataKey === "sleepQualityScore") {
    return `${Math.round(n).toLocaleString()}`;
  }

  return `${Math.round(n).toLocaleString()}${unitForKey(dataKey)}`;
}

function CustomTooltip({ active, payload, label, labelFormatter, dataKey }) {
  if (!active || !payload?.length) return null;

  const v = payload?.[0]?.value;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      <div className={styles.tooltipValue}>{formatValue(v, dataKey)}</div>
    </div>
  );
}

export default function FitbitTrendCharts({
  data = [],
  rangeDays = 30,
  goal = null,
  dataKey = "steps",
}) {
  const points = useMemo(() => {
    const arr = Array.isArray(data) ? data.filter(Boolean) : [];

    // accept already-normalized points: [{ date: "YYYY-MM-DD", value: number|null }]
    const first = arr[0];
    const looksLikePoints =
      first &&
      typeof first.date === "string" &&
      "value" in first &&
      (first.value == null || Number.isFinite(Number(first.value)));

    const base = looksLikePoints
      ? arr.map((p) => ({
          date: String(p.date).slice(0, 10),
          value: p.value == null ? null : Number(p.value),
        }))
      : arr
          .filter((d) => d?.date)
          .map((d) => {
            const raw = d?.[dataKey];
            const num = Number(raw);
            return {
              date: String(d.date).slice(0, 10),
              value: Number.isFinite(num) ? num : null,
            };
          });

    return base
      .filter((p) => p?.date)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // keep nulls to show gaps
  }, [data, dataKey]);

  // tick density
  const interval = rangeDays <= 7 ? 0 : rangeDays <= 30 ? 3 : 6;

  // Give the Y axis some breathing room (especially helpful for HRV/RHR)
  const yDomain = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v));
    if (!vals.length) return ["auto", "auto"];

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) {
      // flat line: pad by a little so it doesn't collapse
      const pad = Math.max(2, Math.round(min * 0.05));
      return [min - pad, max + pad];
    }

    const span = max - min;
    const pad = Math.max(1, span * 0.08);
    return [min - pad, max + pad];
  }, [points]);

  const yTickFormatter = (v) => {
    if (v == null || Number.isNaN(Number(v))) return "";
    const n = Number(v);
    // integers for HRV/RHR/sleep score
    if (dataKey === "restingHeartRate" || dataKey === "hrvDailyRmssd" || dataKey === "sleepQualityScore") {
      return `${Math.round(n).toLocaleString()}`;
    }
    return `${Math.round(n).toLocaleString()}`;
  };

  return (
    <div className={styles.fitbitBlock}>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="date" tickFormatter={formatTickDate} interval={interval} tickMargin={8} />
            <YAxis tickMargin={8} domain={yDomain} tickFormatter={yTickFormatter} />
            <Tooltip content={<CustomTooltip labelFormatter={formatTickDate} dataKey={dataKey} />} />
            {goal != null ? <ReferenceLine y={goal} strokeDasharray="6 6" /> : null}
            <Line
              type="monotone"
              dataKey="value"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
