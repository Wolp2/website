const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function fmtHM(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function avg(arr) {
  const xs = (arr || []).filter((n) => n != null && !Number.isNaN(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeBaselines({ restingHRSeries, stepsSeries, hrvSeries }) {
  return {
    baselineRestingHR: avg(restingHRSeries?.slice(-7)),
    baselineSteps: avg(stepsSeries?.slice(-7)),
    baselineHrv: avg(hrvSeries?.slice(-7)),
  };
}

export function computeReadinessV1({
  sleepMinutes,
  sleepQualityScore,
  restingHR,
  stepsToday,

  // ✅ HRV (RMSSD)
  hrvDailyRmssd,

  stepsYesterday,

  baselineRestingHR,
  baselineSteps,

  // ✅ HRV baseline
  baselineHrv,

  workoutsThisWeek,
  workoutGoalWeekly,

  workoutsByDay,
  selectedISO,
}) {
  const sleepTargetMin = 8 * 60;

  // --- Sleep score ---
  let sleepScore;
  if (sleepQualityScore != null && !Number.isNaN(sleepQualityScore)) {
    sleepScore = clamp(sleepQualityScore, 0, 100);
  } else if (sleepMinutes != null && !Number.isNaN(sleepMinutes)) {
    sleepScore = clamp((sleepMinutes / sleepTargetMin) * 100, 0, 100);
  } else {
    sleepScore = 50;
  }

  // --- Resting HR score (lower than baseline better) ---
  let rhrScore = 50;
  if (
    restingHR != null &&
    baselineRestingHR != null &&
    baselineRestingHR > 0 &&
    !Number.isNaN(restingHR) &&
    !Number.isNaN(baselineRestingHR)
  ) {
    const ratio = restingHR / baselineRestingHR;
    rhrScore = clamp(75 + (1 - ratio) * 300, 0, 100);
  }

  // --- HRV score (higher than baseline better) ---
  let hrvScore = 50;
  if (
    hrvDailyRmssd != null &&
    baselineHrv != null &&
    baselineHrv > 0 &&
    !Number.isNaN(hrvDailyRmssd) &&
    !Number.isNaN(baselineHrv)
  ) {
    const ratio = hrvDailyRmssd / baselineHrv; // 1.10 = 10% better
    // 0.85 -> ~61, 1.0 -> 70, 1.15 -> 79 (keeps it subtle)
    hrvScore = clamp(10 + ratio * 60, 0, 100);
  }

  // --- Steps score (today vs baseline) ---
  let stepsScore = 50;
  if (
    stepsToday != null &&
    baselineSteps != null &&
    baselineSteps > 0 &&
    !Number.isNaN(stepsToday) &&
    !Number.isNaN(baselineSteps)
  ) {
    const ratio = stepsToday / baselineSteps;
    stepsScore = clamp(40 + ratio * 35, 0, 100);
  }

  // --- Load penalty (yesterday vs baseline steps) ---
  let loadPenalty = 0;
  let loadLabel = "Normal";
  if (
    stepsYesterday != null &&
    baselineSteps != null &&
    baselineSteps > 0 &&
    !Number.isNaN(stepsYesterday) &&
    !Number.isNaN(baselineSteps)
  ) {
    const loadRatio = stepsYesterday / baselineSteps;
    if (loadRatio > 1.3) {
      loadPenalty = 8;
      loadLabel = "High";
    } else if (loadRatio > 1.15) {
      loadPenalty = 4;
      loadLabel = "Moderate";
    } else if (loadRatio < 0.7) {
      loadLabel = "Low";
    }
  }

  // --- Weighted readiness ---
  let readiness =
    sleepScore * 0.40 +
    rhrScore * 0.30 +
    hrvScore * 0.20 +
    stepsScore * 0.10 -
    loadPenalty;

  readiness = clamp(Math.round(readiness), 0, 100);

  // --- Trend label (include HRV hint) ---
  const sleepDeltaH = sleepMinutes != null ? (sleepMinutes - sleepTargetMin) / 60 : 0;
  const rhrDelta = restingHR != null && baselineRestingHR != null ? restingHR - baselineRestingHR : 0;
  const hrvDelta = hrvDailyRmssd != null && baselineHrv != null ? hrvDailyRmssd - baselineHrv : 0;

  let trend = "Stable";
  if (sleepDeltaH > 0.5 && rhrDelta <= 0 && hrvDelta >= 0) trend = "Improving";
  if (sleepDeltaH < -1 || rhrDelta >= 2 || hrvDelta <= -3) trend = "Strained";

  const bucket =
    readiness >= 85 ? "Peak" : readiness >= 70 ? "Good" : readiness >= 55 ? "Caution" : "Recover";

  const rec = makeRecommendation({
    bucket,
    loadLabel,
    workoutsThisWeek,
    workoutGoalWeekly,
    workoutsByDay,
    selectedISO,
  });

  return {
    readiness,
    bucket,
    trend,
    loadLabel,
    scores: { sleepScore, rhrScore, hrvScore, stepsScore, loadPenalty },
    recommendation: rec,
  };
}

/* Keep your existing workout-aware logic if you want.
   This minimal version still works right now. */
function makeRecommendation({ bucket, loadLabel }) {
  if (bucket === "Peak") {
    return {
      title: "Go for a Strong Session",
      bullets: [
        "Hard strength day or intervals",
        loadLabel === "High" ? "Yesterday load was high — warm up extra well" : "You’re primed to perform",
        "Finish with easy cooldown",
      ],
      tone: "good",
    };
  }
  if (bucket === "Good") {
    return {
      title: "Solid Training Day",
      bullets: [
        "Upper body strength or light cardio",
        loadLabel === "High" ? "Keep intensity controlled (high load yesterday)" : "Avoid max-effort if you feel flat",
      ],
      tone: "good",
    };
  }
  if (bucket === "Caution") {
    return {
      title: "Moderate Only",
      bullets: ["Technique work / accessories", "Finish with an easy walk"],
      tone: "warn",
    };
  }
  return {
    title: "Recover",
    bullets: ["Mobility + easy steps", "Early bedtime if possible"],
    tone: "bad",
  };
}
