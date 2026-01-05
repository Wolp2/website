import styles from "./DailyInsights.module.css";
import {
  mean,
  fmtInt,
  fmtMins,
  getInsightMode,
  clamp,
  toISODateLocal,
} from "../../lib/fitness/utils";

const STEPS_PER_MIN = 100; // simple, consistent

function labelForMode(mode) {
  if (mode === "reflection") return "Looking Back";
  if (mode === "pacing") return "Still Within Reach";
  return "Almost There";
}

/** Parse "YYYY-MM-DD" into a LOCAL Date (avoids UTC date-shift bugs). */
function parseISOToLocalDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function getYesterdayISO(selectedISO) {
  const dt = parseISOToLocalDate(selectedISO);
  dt.setDate(dt.getDate() - 1);
  return toISODateLocal(dt);
}

function findByDate(range, iso) {
  if (!Array.isArray(range)) return null;
  return range.find((d) => d?.date === iso || d?.dateISO === iso) || null;
}

function minutesForSteps(steps) {
  const n = Number(steps);
  if (!Number.isFinite(n)) return null;
  return Math.ceil(n / STEPS_PER_MIN);
}

function trendDirection(vals) {
  const xs = (vals || []).map(Number).filter((n) => Number.isFinite(n));
  if (xs.length < 6) return null; // needs two 3-day windows
  const last = xs.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const prev = xs.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null;
  if (last > prev + 0.5) return "up";
  if (last < prev - 0.5) return "down";
  return "flat";
}

/** --- Sparkline helpers --- */
function pickMetricValue(d, metric) {
  if (!d) return null;
  if (metric === "steps") return d?.steps;
  if (metric === "caloriesOut") return d?.caloriesOut;
  if (metric === "restingHeartRate") return d?.restingHeartRate;
  if (metric === "sleepQualityScore") return d?.sleepQualityScore;
  return null;
}

function buildSparkPoints(values, width = 120, height = 32, pad = 2) {
  const xs = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (xs.length < 2) return null;

  let min = Math.min(...xs);
  let max = Math.max(...xs);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  // avoid divide-by-zero flatlines
  if (max - min < 1e-9) {
    max = min + 1;
  }

  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  const step = xs.length > 1 ? w / (xs.length - 1) : w;

  const pts = xs.map((v, i) => {
    const x = pad + i * step;
    const t = (v - min) / (max - min);
    const y = pad + (1 - t) * h;
    return [x, y];
  });

  return {
    min,
    max,
    d: pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" "),
  };
}

function trendChip(direction) {
  if (direction === "up") return { icon: "↑", label: "Trending up", cls: "chipUp" };
  if (direction === "down") return { icon: "↓", label: "Trending down", cls: "chipDown" };
  if (direction === "flat") return { icon: "→", label: "Stable", cls: "chipFlat" };
  return null;
}

export default function DailyInsights({
  metric, // "steps" | "caloriesOut" | "restingHeartRate" | "sleepQualityScore"
  selectedISO,
  fitbitDay, // day summary for selectedISO
  fitbitRange, // we ensure at least 7 days loaded even in daily mode
  goalSteps = 10000,
  now = new Date(),
}) {
  const mode = getInsightMode(now);
  const title = labelForMode(mode);

  const yesterdayISO = getYesterdayISO(selectedISO);
  const yesterday = findByDate(fitbitRange, yesterdayISO);

  // Build 7-day baselines from range
  const stepsAvg7 = mean(fitbitRange?.map((d) => d?.steps));
  const calAvg7 = mean(fitbitRange?.map((d) => d?.caloriesOut));
  const rhrAvg7 = mean(fitbitRange?.map((d) => d?.restingHeartRate));
  const sleepAvg7 = mean(fitbitRange?.map((d) => d?.sleepQualityScore));
  const sleepMinsAvg7 = mean(fitbitRange?.map((d) => d?.sleepMinutes));

  // Trend direction (optional)
  const rhrTrend = trendDirection(fitbitRange?.map((d) => d?.restingHeartRate));
  const sleepTrend = trendDirection(fitbitRange?.map((d) => d?.sleepQualityScore));

  // For sparkline: last ~14 points of selected metric
  const sparkVals = Array.isArray(fitbitRange)
    ? fitbitRange
        .slice(-14)
        .map((d) => pickMetricValue(d, metric))
        .map(Number)
        .filter((n) => Number.isFinite(n))
    : [];

  const spark = buildSparkPoints(sparkVals, 120, 32, 2);

  // Choose chip direction: for RHR/sleep use their trend, otherwise use metric itself
  const metricTrend = trendDirection(
    Array.isArray(fitbitRange)
      ? fitbitRange.map((d) => pickMetricValue(d, metric)).filter((v) => v != null)
      : []
  );

  const chipInfo = trendChip(
    metric === "restingHeartRate" ? rhrTrend : metric === "sleepQualityScore" ? sleepTrend : metricTrend
  );

  const kicker =
    metric === "steps"
      ? "Steps"
      : metric === "caloriesOut"
      ? "Calories Out"
      : metric === "restingHeartRate"
      ? "Recovery"
      : "Sleep";

  let headline = "";
  let rows = [];
  let note = "";

  if (metric === "steps") {
    const todaySteps = fitbitDay?.steps;
    const ySteps = yesterday?.steps;

    rows.push(["Today", fmtInt(todaySteps)]);
    if (ySteps != null && todaySteps != null) {
      const d = Number(todaySteps) - Number(ySteps);
      rows.push(["vs Yesterday", `${d >= 0 ? "↑" : "↓"} ${fmtInt(Math.abs(d))}`]);
    }
    if (stepsAvg7 != null) rows.push(["7-day avg", fmtInt(stepsAvg7)]);

    const target = stepsAvg7;
    const ref = mode === "reflection" ? ySteps : todaySteps;
    const need = target != null && ref != null ? Math.ceil(target - ref) : null;

    if (need != null && need > 0) {
      const mins = minutesForSteps(need);
      if (mins != null && mins <= 30) {
        headline =
          mode === "reflection"
            ? `A ${mins}-minute walk would have put yesterday above your weekly average.`
            : mode === "pacing"
            ? `A ${mins}-minute walk would put you on pace to beat your weekly average today.`
            : `A ${mins}-minute walk would have put today above your weekly average.`;
      }
    }

    if (!headline) {
      const pct =
        todaySteps != null
          ? clamp(Math.round((Number(todaySteps) / goalSteps) * 100), 0, 999)
          : null;
      headline = pct != null ? `You're at ${pct}% of your step goal.` : "Daily steps update.";
    }
  }

  if (metric === "caloriesOut") {
    const todayCal = fitbitDay?.caloriesOut;
    const yCal = yesterday?.caloriesOut;

    rows.push(["Today", fmtInt(todayCal)]);
    if (yCal != null && todayCal != null) {
      const d = Number(todayCal) - Number(yCal);
      rows.push(["vs Yesterday", `${d >= 0 ? "↑" : "↓"} ${fmtInt(Math.abs(d))}`]);
    }
    if (calAvg7 != null) rows.push(["7-day avg", fmtInt(calAvg7)]);

    if (calAvg7 != null) {
      const ref = mode === "reflection" ? yCal : todayCal;
      const delta = ref != null ? Math.round(Number(calAvg7) - Number(ref)) : null;

      if (delta != null && Math.abs(delta) >= 50) {
        if (delta > 0) {
          headline =
            mode === "reflection"
              ? `Yesterday finished about ${fmtInt(delta)} below your weekly average.`
              : mode === "pacing"
              ? `You’re about ${fmtInt(delta)} behind your usual output pace.`
              : `Today finished about ${fmtInt(delta)} below your weekly average.`;
          note = "A short walk or quick lift can close that gap.";
        } else {
          headline =
            mode === "reflection"
              ? `Yesterday beat your weekly average by about ${fmtInt(Math.abs(delta))}.`
              : mode === "pacing"
              ? `You’re ahead of your usual output pace by about ${fmtInt(Math.abs(delta))}.`
              : `Today beat your weekly average by about ${fmtInt(Math.abs(delta))}.`;
        }
      } else {
        headline =
          mode === "pacing"
            ? "You’re tracking close to your usual output today."
            : "Right around your normal output level.";
      }
    } else {
      headline = "Daily calories out update.";
    }
  }

  if (metric === "restingHeartRate") {
    const rhr = fitbitDay?.restingHeartRate;

    rows.push(["Resting HR", rhr != null ? `${fmtInt(rhr)} bpm` : "—"]);
    if (rhrAvg7 != null) rows.push(["Baseline (7d)", `${fmtInt(rhrAvg7)} bpm`]);

    if (rhr != null && rhrAvg7 != null) {
      const diff = Math.round(Number(rhr) - Number(rhrAvg7));
      if (diff >= 2) {
        headline = `Resting HR is ${fmtInt(diff)} bpm above your baseline.`;
        note = "Recovery may be lagging — consider a lighter day, extra sleep, and hydration.";
      } else if (diff <= -2) {
        headline = `Resting HR is ${fmtInt(Math.abs(diff))} bpm below your baseline.`;
        note = "Good readiness signal today.";
      } else {
        headline = "Resting HR is in your normal range.";
      }
    } else {
      headline = "Resting HR readiness update.";
    }

    if (rhrTrend) {
      rows.push([
        "3-day trend",
        rhrTrend === "up" ? "Rising" : rhrTrend === "down" ? "Falling" : "Stable",
      ]);
    }
  }

  if (metric === "sleepQualityScore") {
    const score = fitbitDay?.sleepQualityScore;
    const mins = fitbitDay?.sleepMinutes;
    const eff = fitbitDay?.sleepEfficiency;
    const stages = fitbitDay?.sleepStages || {};

    rows.push(["Score", fmtInt(score)]);
    if (mins != null) rows.push(["Time asleep", fmtMins(mins)]);
    if (Number.isFinite(Number(eff))) rows.push(["Efficiency", `${fmtInt(eff)}%`]);

    if (sleepAvg7 != null && score != null) {
      const d = Math.round(Number(score) - Number(sleepAvg7));
      rows.push(["vs 7-day", `${d >= 0 ? "↑" : "↓"} ${fmtInt(Math.abs(d))}`]);
    }

    const stageParts = [];
    if (Number.isFinite(stages.rem)) stageParts.push(`REM ${Math.round(stages.rem)}m`);
    if (Number.isFinite(stages.deep)) stageParts.push(`Deep ${Math.round(stages.deep)}m`);
    if (Number.isFinite(stages.light)) stageParts.push(`Light ${Math.round(stages.light)}m`);
    if (Number.isFinite(stages.wake)) stageParts.push(`Awake ${Math.round(stages.wake)}m`);
    if (stageParts.length) rows.push(["Stages", stageParts.join(" • ")]);

    if (sleepMinsAvg7 != null && mins != null) {
      const deltaM = Math.round(Number(sleepMinsAvg7) - Number(mins));
      if (deltaM > 30) {
        headline = `Sleep was about ${fmtMins(deltaM)} below your baseline.`;
        note = "Tonight: aim for an extra 30–60 minutes to reset recovery.";
      } else if (deltaM < -30) {
        headline = `Sleep was about ${fmtMins(Math.abs(deltaM))} above your baseline.`;
        note = "Solid recovery night — training is supported today.";
      } else {
        headline = "Sleep was close to your normal baseline.";
      }
    } else {
      headline = "Sleep recovery update.";
    }

    if (sleepTrend) {
      rows.push([
        "3-day trend",
        sleepTrend === "up" ? "Improving" : sleepTrend === "down" ? "Declining" : "Stable",
      ]);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.kicker}>✨ {kicker} — {title}</div>

        <div className={styles.rightMeta}>
          {chipInfo ? (
            <span className={`${styles.chip} ${styles[chipInfo.cls]}`} title={chipInfo.label}>
              <span className={styles.chipIcon}>{chipInfo.icon}</span>
              <span className={styles.chipText}>{chipInfo.label}</span>
            </span>
          ) : null}

          {spark?.d ? (
            <div className={styles.sparkWrap} aria-hidden="true" title="Recent trend">
              <svg className={styles.sparkSvg} viewBox="0 0 120 32" preserveAspectRatio="none">
                <path className={styles.sparkLine} d={spark.d} />
              </svg>
            </div>
          ) : null}

          <div className={styles.meta}>{selectedISO}</div>
        </div>
      </div>

      <div className={styles.headline}>{headline}</div>

      <div className={styles.grid}>
        {rows.filter(Boolean).map(([k, v]) => (
          <div key={k} className={styles.row}>
            <span className={styles.label}>{k}</span>
            <span className={styles.value}>{v}</span>
          </div>
        ))}
      </div>

      {note ? <div className={styles.note}>{note}</div> : null}
    </div>
  );
}
