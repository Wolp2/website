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
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatTickDate(iso) {
  const dt = parseISODate(iso);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;

  const v = payload[0]?.payload?.value;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>
        {labelFormatter ? labelFormatter(label) : label}
      </div>

      <div className={styles.tooltipValue}>
        {v == null ? "—" : Math.round(v).toLocaleString()}
      </div>
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
    return (Array.isArray(data) ? data : [])
      .filter((d) => d?.date)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((d) => {
        const num = Number(d?.[dataKey]);
        return {
          date: d.date,
          value: Number.isFinite(num) ? num : null,
        };
      })
      .filter((p) => p.value != null);
  }, [data, dataKey]);

  const tickEvery = rangeDays <= 7 ? 0 : rangeDays <= 30 ? 3 : 6;
  const labelFmt = (iso) => formatTickDate(iso);

  return (
    <div className={styles.fitbitBlock}>
      <div className={styles.chartWrap} style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={labelFmt}
              interval={tickEvery}
              tickMargin={8}
            />
            <YAxis tickMargin={8} />
            <Tooltip content={<CustomTooltip labelFormatter={labelFmt} />} />
            {goal != null ? <ReferenceLine y={goal} strokeDasharray="6 6" /> : null}
            <Line type="monotone" dataKey="value" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
