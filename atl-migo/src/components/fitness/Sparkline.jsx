import { ResponsiveContainer, LineChart, Line } from "recharts";

export default function Sparkline({ data }) {
  // expects [{ x: "...", y: number }, ...]
  return (
    <div style={{ width: 120, height: 34, opacity: 0.9 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="y"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
