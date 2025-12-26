import { useMemo } from "react";
import styles from "./FitbitTrendCharts.module.css";
import { getExtremes } from "../../lib/fitness/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";

/* ---------- helpers ---------- */
const fmtInt = (n) =>
  n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();

const parseISODate = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatTickDate = (iso) =>
  parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function movingAverage(points, windowSize) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i < windowSize - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - windowSize + 1; j <= i; j++) {
      const v = points[j]?.value;
      if (v == null) continue;
      sum += v;
      count += 1;
    }
    out.push(count ? sum / count : null);
  }
  return out;
}

function slopeLinearRegression(values) {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (!denom) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function trendFromSlope(slope, avg) {
  const rel = avg ? slope / avg : 0;
  if (rel > 0.01) return { key: "up", label: "Increasing", symbol: "▲" };
  if (rel < -0.01) return { key: "down", label: "Decreasing", symbol: "▼" };
  return { key: "flat", label: "Stable", symbol: "■" };
}

const dayNameShort = (dt) => dt.toLocaleDateString(undefined, { weekday: "short" });

function computeDayOfWeekAverages(points) {
  const buckets = new Map();
  for (const p of points) {
    if (!p?.date || p.value == null) continue;
    const dt = parseISODate(p.date);
    const key = dayNameShort(dt);
    const prev = buckets.get(key) || { sum: 0, count: 0 };
    prev.sum += p.value;
    prev.count += 1;
    buckets.set(key, prev);
  }
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return order.map((k) => {
    const b = buckets.get(k);
    return { day: k, avg: b ? b.sum / b.count : 0, count: b?.count ?? 0 };
  });
}

/* ---------- small UI pieces ---------- */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload.find((p) => p.dataKey === "value")?.payload;
  const value = point?.value ?? null;
  const prev = point?.prevValue ?? null;

  let deltaPct = null;
  if (prev != null && prev !== 0 && value != null) deltaPct = ((value - prev) / prev) * 100;

  const arrow = deltaPct == null ? "" : deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "■";
  const deltaText = deltaPct == null ? "—" : `${arrow} ${Math.abs(deltaPct).toFixed(0)}% vs prev`;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      <div className={styles.tooltipRow}>
        <span>Value:</span>
        <b>{fmtInt(value)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>Change:</span>
        <b>{deltaText}</b>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub ? <div className={styles.statSub}>{sub}</div> : null}
    </div>
  );
}

function TrendBadge({ trend }) {
  return (
    <div className={`${styles.trendBadge} ${styles["trend_" + trend.key]}`}>
      <span className={styles.trendSymbol}>{trend.symbol}</span>
      <span>{trend.label}</span>
    </div>
  );
}

/**
 * Props:
 *  - title: string
 *  - data: [{date:"YYYY-MM-DD", value:number|null}]
 *  - rangeDays: number (7/30/90)
 *  - goal: number|null
 *  - trendWindow: number
 *  - better: "higher" | "lower" (determines best/worst)
 */
export default function FitbitTrendCharts({
  title = "Steps",
  data = [],
  rangeDays = 30,
  goal = null,
  trendWindow = 14,
  better = "higher",
}) {
  const computed = useMemo(() => {
    const points = [...data]
      .filter((d) => d?.date)
      .sort((a, b) => parseISODate(a.date) - parseISODate(b.date))
      .map((d) => {
        const num = Number(d.value);
        return { date: d.date, value: Number.isFinite(num) ? num : null };
      });

    // prevValue should refer to the previous valid (non-null) value
    let lastValid = null;
    const withPrev = points.map((p) => {
      const prevValue = lastValid;
      if (p.value != null) lastValid = p.value;
      return { ...p, prevValue };
    });

    const values = withPrev.map((p) => p.value).filter((v) => v != null);

    // latest = most recent non-null value
    const latest = [...withPrev].reverse().find((p) => p.value != null)?.value ?? null;

    const extremes = getExtremes(withPrev, better);

    const avgN = (n) => {
      const slice = values.slice(-n);
      if (!slice.length) return null;
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    };

    const avg7 = avgN(7);
    const avg30 = rangeDays >= 30 ? avgN(30) : null;

    const ma7 = movingAverage(withPrev, 7);
    const ma30 =
      rangeDays >= 30 ? movingAverage(withPrev, 30) : withPrev.map(() => null);

    const pointsWithMA = withPrev.map((p, i) => ({
      ...p,
      ma7: ma7[i],
      ma30: ma30[i],
    }));

    const lastVals = values.slice(-trendWindow);
    const avgTrend = lastVals.length
      ? lastVals.reduce((a, b) => a + b, 0) / lastVals.length
      : 0;

    const slope = slopeLinearRegression(lastVals);
    const trend = trendFromSlope(slope, avgTrend);

    const dow = computeDayOfWeekAverages(withPrev);

    return { points: pointsWithMA, latest, avg7, avg30, extremes, trend, dow };
  }, [data, trendWindow, better, rangeDays]);

  const xTickInterval = useMemo(() => {
    if (rangeDays <= 7) return 0;
    if (rangeDays <= 30) return 4;
    return 6;
  }, [rangeDays]);

  const dateFormatter = (iso) =>
    parseISODate(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.h2}>Fitbit Trend</h2>
          <div className={styles.subTitle}>{title}</div>
        </div>
        <TrendBadge trend={computed.trend} />
      </div>

      <div className={styles.statsGrid}>
        <Stat label="Latest" value={fmtInt(computed.latest)} />
        <Stat label="7-day avg" value={fmtInt(computed.avg7)} />
        {rangeDays >= 30 ? <Stat label="30-day avg" value={fmtInt(computed.avg30)} /> : null}
        <Stat
          label="Best day"
          value={fmtInt(computed.extremes?.best?.value)}
          sub={computed.extremes?.best?.date ? dateFormatter(computed.extremes.best.date) : ""}
        />
        <Stat
          label="Worst day"
          value={fmtInt(computed.extremes?.worst?.value)}
          sub={computed.extremes?.worst?.date ? dateFormatter(computed.extremes.worst.date) : ""}
        />
      </div>

      <div className={styles.chartBlock}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={computed.points} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatTickDate}
              interval={xTickInterval}
              minTickGap={12}
            />
            <YAxis tickFormatter={fmtInt} width={60} />
            <Tooltip labelFormatter={dateFormatter} content={<CustomTooltip />} />
            {goal != null ? <ReferenceLine y={goal} strokeDasharray="6 6" /> : null}

            <Line type="monotone" dataKey="value" dot={false} strokeWidth={2.5} isAnimationActive={false} />
            <Line type="monotone" dataKey="ma7" dot={false} strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false} />
            {rangeDays >= 30 ? (
              <Line
                type="monotone"
                dataKey="ma30"
                dot={false}
                strokeWidth={2}
                strokeDasharray="2 6"
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>

        <div className={styles.legendRow}>
          <span className={styles.legendItem}>
            <span className={styles.swatchSolid} /> Daily
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchDash7} /> 7-day avg
          </span>
          {rangeDays >= 30 ? (
            <span className={styles.legendItem}>
              <span className={styles.swatchDash30} /> 30-day avg
            </span>
          ) : null}
          {goal != null ? (
            <span className={styles.legendItem}>
              <span className={styles.swatchGoal} /> Goal ({fmtInt(goal)})
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.chartBlock}>
        <h3 className={styles.h3}>Average by day of week</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={computed.dow} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis tickFormatter={fmtInt} width={60} />
            <Tooltip formatter={(val) => [fmtInt(val), "Avg"]} />
            <Bar dataKey="avg" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
