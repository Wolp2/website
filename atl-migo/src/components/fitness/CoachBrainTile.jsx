import styles from "./CoachBrainTile.module.css";
import { fmtHM } from "../../lib/fitness/readiness";

const fmtInt = (n) =>
  n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

// Score buckets for color (simple + readable)
function scoreClass(score) {
  if (score == null || Number.isNaN(score)) return styles.valNeutral;
  if (score >= 80) return styles.valGood;
  if (score >= 60) return styles.valWarn;
  return styles.valBad;
}

function penaltyClass(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n === 0) return styles.valNeutral;
  if (n <= 4) return styles.valWarn;
  return styles.valBad;
}

function deltaClass(delta, { goodWhenLower = false } = {}) {
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return styles.valNeutral;

  // If lower is better (RHR), invert
  if (goodWhenLower) {
    if (n <= -2) return styles.valGood;
    if (n <= 1) return styles.valWarn;
    return styles.valBad;
  }

  // Steps/HRV: positive is generally good
  if (n >= 1500) return styles.valGood;
  if (n >= -1500) return styles.valWarn;
  return styles.valBad;
}

/** -------- Confidence chip (lightweight heuristic) -------- */
function computeConfidence({ today, scores }) {
  // count "key" inputs present
  const keys = [
    today?.sleepMinutes,
    today?.restingHR,
    today?.stepsToday,
    today?.hrvDailyRmssd, // might be missing for some days/devices
  ];

  const present = keys.filter((v) => Number.isFinite(Number(v))).length;

  // also require at least some scoring output
  const scoreKeys = [scores?.sleepScore, scores?.rhrScore, scores?.stepsScore, scores?.hrvScore];
  const scorePresent = scoreKeys.filter((v) => Number.isFinite(Number(v))).length;

  const totalSignals = present + scorePresent;

  if (totalSignals >= 6) return { label: "High confidence", cls: styles.confHigh };
  if (totalSignals >= 4) return { label: "Medium confidence", cls: styles.confMed };
  return { label: "Low confidence", cls: styles.confLow };
}

export default function CoachBrainTile({
  dateLabel,
  model,
  today,
  onPickMetric,

  // ✅ new (optional)
  activeMetric,
  activeRangeDays,
}) {
  if (!model) return null;

  const { readiness, bucket, trend, recommendation, scores } = model;

  const pick = (metricKey) => {
    if (typeof onPickMetric === "function") onPickMetric(metricKey);
  };

  const sleepScore = scores?.sleepScore;
  const rhrScore = scores?.rhrScore;
  const hrvScore = scores?.hrvScore;
  const stepsScore = scores?.stepsScore;
  const loadPenalty = scores?.loadPenalty ?? 0;

  const ySteps = today?.stepsYesterday;
  const yDelta = today?.deltaYesterdaySteps;

  const conf = computeConfidence({ today, scores });

  const metricBtnClass = (key) =>
    cx(styles.metricBtn, activeMetric === key ? styles.metricBtnActive : "");

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>TODAY&apos;S READINESS — {dateLabel}</div>

        <div className={styles.headerRight}>
          <span className={cx(styles.confChip, conf.cls)} title={conf.label}>
            {conf.label}
          </span>

          <div className={styles.subtle}>
            {bucket}
            {activeRangeDays ? <span className={styles.dot}>•</span> : null}
            {activeRangeDays ? <span>{activeRangeDays === "daily" ? "Daily" : `${activeRangeDays}d`}</span> : null}
          </div>
        </div>
      </div>

      <div className={styles.topRow}>
        <div>
          <div className={styles.scoreNum}>{readiness}%</div>
          <div className={styles.trend}>
            {trend === "Improving" ? "▲" : trend === "Strained" ? "▼" : "—"} {trend}
          </div>
        </div>

        <div className={styles.metrics}>
          {/* Sleep */}
          <button
            type="button"
            className={metricBtnClass("sleepQualityScore")}
            onClick={() => pick("sleepQualityScore")}
            title="View sleep trend"
          >
            <div className={styles.metric}>
              <span>Sleep</span>
              <b>{fmtHM(today?.sleepMinutes)}</b>
              {/* optional subline */}
              <small className={styles.metricSub}>
                Score: {today?.sleepQualityScore != null ? fmtInt(today.sleepQualityScore) : "—"}
              </small>
            </div>
          </button>

          {/* Resting HR */}
          <button
            type="button"
            className={metricBtnClass("restingHeartRate")}
            onClick={() => pick("restingHeartRate")}
            title="View resting HR trend"
          >
            <div className={styles.metric}>
              <span>Resting HR</span>
              <b>
                {today?.restingHR ?? "—"} bpm{" "}
                {today?.deltaRhr != null ? (
                  <em className={cx(styles.delta, deltaClass(today.deltaRhr, { goodWhenLower: true }))}>
                    ({today.deltaRhr > 0 ? "+" : ""}
                    {today.deltaRhr} vs avg)
                  </em>
                ) : null}
              </b>
            </div>
          </button>

          {/* Steps */}
          <button
            type="button"
            className={metricBtnClass("steps")}
            onClick={() => pick("steps")}
            title="View steps trend"
          >
            <div className={styles.metric}>
              <span>Steps</span>
              <b>
                {today?.stepsToday?.toLocaleString?.() ?? "—"}{" "}
                {today?.deltaSteps != null ? (
                  <em className={cx(styles.delta, deltaClass(today.deltaSteps))}>
                    ({today.deltaSteps > 0 ? "+" : ""}
                    {today.deltaSteps.toLocaleString()} vs avg)
                  </em>
                ) : null}
              </b>
            </div>
          </button>

          {/* HRV */}
          <button
            type="button"
            className={metricBtnClass("hrvDailyRmssd")}
            onClick={() => pick("hrvDailyRmssd")}
            title="View HRV trend"
          >
            <div className={styles.metric}>
              <span>HRV</span>
              <b>
                {today?.hrvDailyRmssd != null ? Math.round(today.hrvDailyRmssd) : "—"}{" "}
                {today?.deltaHrv != null ? (
                  <em className={cx(styles.delta, deltaClass(today.deltaHrv))}>
                    ({today.deltaHrv > 0 ? "+" : ""}
                    {fmtInt(today.deltaHrv)} vs avg)
                  </em>
                ) : null}
              </b>
            </div>
          </button>
        </div>
      </div>

      {/* WHY */}
      <div className={styles.whyWrap}>
        <div className={styles.whyTitle}>Why this score</div>

        <div className={styles.whyRows}>
          <div className={styles.whyRow}>
            <span>Sleep score</span>
            <b className={scoreClass(sleepScore)}>{sleepScore == null ? "—" : Math.round(sleepScore)}</b>
          </div>

          <div className={styles.whyRow}>
            <span>RHR score</span>
            <b className={scoreClass(rhrScore)}>{rhrScore == null ? "—" : Math.round(rhrScore)}</b>
          </div>

          <div className={styles.whyRow}>
            <span>HRV score</span>
            <b className={scoreClass(hrvScore)}>{hrvScore == null ? "—" : Math.round(hrvScore)}</b>
          </div>

          <div className={styles.whyRow}>
            <span>Steps score</span>
            <b className={scoreClass(stepsScore)}>{stepsScore == null ? "—" : Math.round(stepsScore)}</b>
          </div>

          <div className={styles.whyRow}>
            <span>Load penalty</span>
            <b className={penaltyClass(loadPenalty)}>{loadPenalty ? `-${loadPenalty}` : "0"}</b>
          </div>

          <div className={styles.whyRow}>
            <span>Yesterday steps</span>
            <b className={deltaClass(yDelta)}>
              {fmtInt(ySteps)}{" "}
              {yDelta != null ? (
                <em className={cx(styles.delta, deltaClass(yDelta))}>
                  ({yDelta > 0 ? "+" : ""}
                  {fmtInt(yDelta)} vs avg)
                </em>
              ) : null}
            </b>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div>
        <div className={styles.recTitle}>{recommendation.title}</div>
        <ul className={styles.recList}>
          {(recommendation?.bullets || []).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
