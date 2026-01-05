import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

import FitbitTrendCharts from "../components/fitness/FitbitTrendCharts";
import FitbitStatusBanner from "../components/fitness/FitbitStatusBanner";
import FitnessTile from "../components/fitness/FitnessTile";

import FitnessDashboardTiles from "../components/fitness/layout/FitnessDashboardTiles";
import FitnessHeader from "../components/fitness/layout/FitnessHeader";
import FitnessControlBar from "../components/fitness/layout/FitnessControlBar";

import DailyInsights from "../components/fitness/DailyInsights";

import { computeBaselines, computeReadinessV1 } from "../lib/fitness/readiness";

import {
  buildLiftsByISO,
  fmtDatePretty,
  toISODateLocal,
  fmtMins,
  normalizePPLLabel,
} from "../lib/fitness/utils";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=1971811896&single=true&output=csv";

const FITBIT_API = "https://fitbit.wlopez2014.workers.dev";

/** --- helpers for workoutsByDay --- */
function pickSplit(lifts = []) {
  const counts = new Map();

  for (const it of lifts) {
    const raw = String(it?.category || it?.split || "").trim();
    if (!raw) continue;

    const norm = normalizePPLLabel(raw);
    if (!norm || norm === "Other") continue;

    counts.set(norm, (counts.get(norm) || 0) + 1);
  }

  if (!counts.size) {
    const first = String(lifts?.[0]?.category || lifts?.[0]?.split || "").trim();
    return normalizePPLLabel(first || "Other");
  }

  let best = "Other";
  let bestN = -1;
  for (const [k, n] of counts.entries()) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

function sumSets(lifts = []) {
  let total = 0;
  for (const it of lifts) {
    const s = Number(it?.sets);
    total += Number.isFinite(s) && s > 0 ? s : 1;
  }
  return total;
}

function clampInt(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toTileDots({ totalSets, exercisesCount }) {
  const raw = Math.round((totalSets || 0) / 3 + (exercisesCount || 0) / 6);
  return clampInt(raw, 0, 7);
}

function uniqPreserve(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x || "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** --- date helpers (ISO yyyy-mm-dd) --- */
function parseISODate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDaysISO(iso, deltaDays) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return toISODateLocal(dt);
}

export default function Fitness() {
  const realTodayISO = useMemo(() => toISODateLocal(new Date()), []);

  /** ================= Dark mode ================= */
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("fitness-dark") === "true"
  );

  useEffect(() => {
    localStorage.setItem("fitness-dark", String(darkMode));
  }, [darkMode]);

  /** ================= Sticky layout ================= */
  const [toolbarH, setToolbarH] = useState(104);

  /** ================= Global controls ================= */
  const [selectedISO, setSelectedISO] = useState(() => toISODateLocal(new Date()));
  const [rangeDays, setRangeDays] = useState("daily"); // "daily" | "7" | "30" | "90"
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate | sleepQualityScore | hrvDailyRmssd

  // ✅ If user picks HRV while in daily mode, force to 7-day so it doesn't fall into DailyInsights
  useEffect(() => {
    if (metric === "hrvDailyRmssd" && rangeDays === "daily") {
      setRangeDays("7");
    }
  }, [metric, rangeDays]);

  const metricLabel =
    metric === "steps"
      ? "Steps"
      : metric === "caloriesOut"
      ? "Calories Out"
      : metric === "restingHeartRate"
      ? "Resting HR"
      : metric === "sleepQualityScore"
      ? "Sleep Quality"
      : metric === "hrvDailyRmssd"
      ? "HRV (RMSSD)"
      : "Metric";

  const goal = useMemo(() => (metric === "steps" ? 10000 : null), [metric]);

  const setMetricFromTile = (nextMetric) => {
    setMetric(nextMetric);
    setRangeDays((r) => (r === "daily" ? "7" : r));
  };

  /** ================= Sheet ================= */
  const [rows, setRows] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetErr, setSheetErr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingSheet(true);
      setSheetErr("");

      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (alive) setRows(txt);
      } catch (e) {
        console.error(e);
        if (alive) setSheetErr("Could not load training log (Google Sheets).");
      } finally {
        if (alive) setLoadingSheet(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const liftsByISO = useMemo(() => buildLiftsByISO(rows), [rows]);

  /** ================= Fitbit ================= */
  const [fitbitDay, setFitbitDay] = useState(null);
  const [fitbitRange, setFitbitRange] = useState([]);
  const [fitbitErr, setFitbitErr] = useState("");
  const [fitbitLoading, setFitbitLoading] = useState(false);

  const [fitbitStatus, setFitbitStatus] = useState({
    connected: false,
    lastSyncTime: null,
    hasKV: false,
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      setFitbitLoading(true);
      setFitbitErr("");

      try {
        const r = await fetch(
          `${FITBIT_API}/fitbit/today?date=${encodeURIComponent(selectedISO)}&nocache=1`,
          { cache: "no-store" }
        );

        const text = await r.text();
        if (!r.ok) throw new Error(text);

        const data = JSON.parse(text);
        if (alive) setFitbitDay(data);
      } catch (e) {
        console.error(e);
        if (alive) {
          setFitbitDay(null);
          setFitbitErr("Could not load Fitbit day summary.");
        }
      } finally {
        if (alive) setFitbitLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedISO]);

  useEffect(() => {
    let alive = true;
    const daysToFetch = rangeDays === "daily" ? "7" : rangeDays;

    (async () => {
      try {
        const r = await fetch(
          `${FITBIT_API}/fitbit/range?days=${encodeURIComponent(daysToFetch)}&end=${encodeURIComponent(
            selectedISO
          )}`,
          { cache: "no-store" }
        );

        const text = await r.text();
        if (!r.ok) throw new Error(text);

        const payload = JSON.parse(text);
        if (!alive) return;

        setFitbitRange(Array.isArray(payload?.data) ? payload.data : []);
      } catch (e) {
        console.error(e);
        if (alive) setFitbitRange([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rangeDays, selectedISO]);

  const sleepSub = useMemo(() => {
    const s = fitbitDay;
    if (!s) return fmtDatePretty(selectedISO);

    const stages = s.sleepStages || {};
    const parts = [];

    if (Number.isFinite(stages.rem)) parts.push(`REM ${Math.round(stages.rem)}m`);
    if (Number.isFinite(stages.deep)) parts.push(`Deep ${Math.round(stages.deep)}m`);
    if (Number.isFinite(stages.light)) parts.push(`Light ${Math.round(stages.light)}m`);
    if (Number.isFinite(stages.wake)) parts.push(`Awake ${Math.round(stages.wake)}m`);

    if (!parts.length && s.sleepMinutes != null) parts.push(`Asleep ${fmtMins(s.sleepMinutes)}`);

    return parts.length ? parts.join(" • ") : fmtDatePretty(selectedISO);
  }, [fitbitDay, selectedISO]);

  const workoutsByDay = useMemo(() => {
    const out = [];
    for (const [dateISO, lifts] of liftsByISO.entries()) {
      if (!Array.isArray(lifts) || lifts.length === 0) continue;

      const namesRaw = lifts
        .map((x) => String(x?.exercise || x?.name || "").trim())
        .filter(Boolean);

      const uniqueNames = uniqPreserve(namesRaw);

      const exercisesCount = uniqueNames.length;
      const totalSets = sumSets(lifts);
      const split = pickSplit(lifts);
      const dots = toTileDots({ totalSets, exercisesCount });

      out.push({
        dateISO,
        prettyDate: fmtDatePretty(dateISO),
        split,
        exercisesCount,
        totalSets,
        dots,
        preview: uniqueNames.slice(0, 6),
        lifts,
      });
    }

    out.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
    return out;
  }, [liftsByISO]);

  const fitbitCaloriesByDay = useMemo(() => {
    if (!Array.isArray(fitbitRange)) return [];
    return fitbitRange
      .map((d) => {
        const dateISO = d?.date;
        const caloriesOut =
          Number(d?.caloriesOut) ||
          Number(d?.calories) ||
          Number(d?.caloriesBurned) ||
          null;

        return dateISO ? { dateISO, caloriesOut } : null;
      })
      .filter(Boolean);
  }, [fitbitRange]);

  /** ================= Coach Brain (Readiness v1 + HRV) ================= */
  const coachData = useMemo(() => {
    const stepsToday = Number(fitbitDay?.steps);
    const restingHR = Number(fitbitDay?.restingHeartRate);
    const sleepMinutes = Number(fitbitDay?.sleepMinutes);

    const sleepQualityScore =
      fitbitDay?.sleepQualityScore != null ? Number(fitbitDay.sleepQualityScore) : null;

    const selectedObj = Array.isArray(fitbitRange)
      ? fitbitRange.find((d) => d?.date === selectedISO)
      : null;

    const stepsSeries = Array.isArray(fitbitRange)
      ? fitbitRange.map((d) => Number(d?.steps)).filter((n) => Number.isFinite(n))
      : [];

    const restingHRSeries = Array.isArray(fitbitRange)
      ? fitbitRange.map((d) => Number(d?.restingHeartRate)).filter((n) => Number.isFinite(n))
      : [];

    const hrvSeries = Array.isArray(fitbitRange)
      ? fitbitRange.map((d) => Number(d?.hrvDailyRmssd)).filter((n) => Number.isFinite(n))
      : [];

    const { baselineRestingHR, baselineSteps, baselineHrv } = computeBaselines({
      restingHRSeries,
      stepsSeries,
      hrvSeries,
    });

    const yesterdayISO = addDaysISO(selectedISO, -1);
    const yObj = Array.isArray(fitbitRange)
      ? fitbitRange.find((d) => d?.date === yesterdayISO)
      : null;

    const stepsYesterday = Number(yObj?.steps);
    const deltaYesterdaySteps =
      Number.isFinite(stepsYesterday) && Number.isFinite(baselineSteps)
        ? Math.round(stepsYesterday - baselineSteps)
        : null;

    const deltaRhr =
      Number.isFinite(restingHR) && Number.isFinite(baselineRestingHR)
        ? Math.round(restingHR - baselineRestingHR)
        : null;

    const deltaSteps =
      Number.isFinite(stepsToday) && Number.isFinite(baselineSteps)
        ? Math.round(stepsToday - baselineSteps)
        : null;

    const hrvDailyRmssd = Number(selectedObj?.hrvDailyRmssd);
    const deltaHrv =
      Number.isFinite(hrvDailyRmssd) && Number.isFinite(baselineHrv)
        ? Math.round(hrvDailyRmssd - baselineHrv)
        : null;

    const last7ISO = [];
    for (let i = 0; i < 7; i++) last7ISO.push(addDaysISO(selectedISO, -i));
    const workoutsThisWeek = workoutsByDay.filter((w) => last7ISO.includes(w.dateISO)).length;

    const model = computeReadinessV1({
      sleepMinutes: Number.isFinite(sleepMinutes) ? sleepMinutes : null,
      sleepQualityScore: Number.isFinite(sleepQualityScore) ? sleepQualityScore : null,
      restingHR: Number.isFinite(restingHR) ? restingHR : null,
      stepsToday: Number.isFinite(stepsToday) ? stepsToday : null,

      hrvDailyRmssd: Number.isFinite(hrvDailyRmssd) ? hrvDailyRmssd : null,

      stepsYesterday: Number.isFinite(stepsYesterday) ? stepsYesterday : null,

      baselineRestingHR: Number.isFinite(baselineRestingHR) ? baselineRestingHR : null,
      baselineSteps: Number.isFinite(baselineSteps) ? baselineSteps : null,
      baselineHrv: Number.isFinite(baselineHrv) ? baselineHrv : null,

      workoutsThisWeek,
      workoutGoalWeekly: 4,

      workoutsByDay,
      selectedISO,
    });

    return {
      today: {
        sleepMinutes: Number.isFinite(sleepMinutes) ? sleepMinutes : null,
        restingHR: Number.isFinite(restingHR) ? restingHR : null,
        stepsToday: Number.isFinite(stepsToday) ? stepsToday : null,

        deltaRhr,
        deltaSteps,

        stepsYesterday: Number.isFinite(stepsYesterday) ? stepsYesterday : null,
        deltaYesterdaySteps,

        hrvDailyRmssd: Number.isFinite(hrvDailyRmssd) ? hrvDailyRmssd : null,
        deltaHrv,
      },
      model,
      baseline: { baselineRestingHR, baselineSteps, baselineHrv },
      yesterdayISO,
    };
  }, [fitbitDay, fitbitRange, selectedISO, workoutsByDay]);

  // --- Goal progress helpers (Steps) ---
  const stepsGoal = 10000;
  const stepsTodayNum = Number(fitbitDay?.steps);
  const stepsPct = Number.isFinite(stepsTodayNum)
    ? Math.round((stepsTodayNum / stepsGoal) * 100)
    : null;
  const stepsFrac = Number.isFinite(stepsTodayNum)
    ? Math.min(1, Math.max(0, stepsTodayNum / stepsGoal))
    : 0;

  // ✅ DailyInsights doesn’t support HRV yet, so never show it for HRV
  const showDailyInsights = rangeDays === "daily" && metric !== "hrvDailyRmssd";

  return (
    <main
      className={`${styles.fitnessWrap} ${darkMode ? styles.dark : ""}`}
      style={{ "--stickyToolbarH": `${toolbarH}px` }}
    >
      <section className={styles.container}>
        <FitnessHeader
          styles={styles}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          connected={fitbitStatus.connected}
          lastSyncTime={fitbitStatus.lastSyncTime}
        />

        <FitbitStatusBanner apiBase={FITBIT_API} onStatus={setFitbitStatus} />

        <FitnessControlBar
          styles={styles}
          selectedISO={selectedISO}
          onSelectedISO={setSelectedISO}
          rangeDays={rangeDays}
          onRangeDays={setRangeDays}
          metric={metric}
          onMetric={setMetric}
          onJumpToToday={() => setSelectedISO(realTodayISO)}
          onToolbarHeight={setToolbarH}
        />

        <div className={styles.stack}>
          {/* ✅ Fade/slide transition when date/metric/range changes */}
          <div key={`${selectedISO}-${metric}-${rangeDays}`} className={styles.fadeSwap}>
            <section className={styles.topGrid} aria-label="Overview">
              <div className={styles.tilesStack}>
                <section className={styles.tileGrid} aria-label="Today at a glance">
                  <FitnessTile
                    className={`${styles.tileSteps} ${metric === "steps" ? styles.tileActive : ""}`}
                    icon="steps"
                    title="Steps"
                    value={fitbitDay?.steps ?? "—"}
                    sub={fmtDatePretty(selectedISO)}
                    active={metric === "steps"}
                    onClick={() => setMetricFromTile("steps")}
                  />

                  <FitnessTile
                    className={`${styles.tileCalories} ${
                      metric === "caloriesOut" ? styles.tileActive : ""
                    }`}
                    icon="calories"
                    title="Calories Out"
                    value={fitbitDay?.caloriesOut ?? "—"}
                    sub={fmtDatePretty(selectedISO)}
                    active={metric === "caloriesOut"}
                    onClick={() => setMetricFromTile("caloriesOut")}
                  />

                  <FitnessTile
                    className={`${styles.tileRhr} ${
                      metric === "restingHeartRate" ? styles.tileActive : ""
                    }`}
                    icon="rhr"
                    title="Resting HR"
                    value={fitbitDay?.restingHeartRate ?? "—"}
                    sub={fitbitDay?.restingHeartRate ? "bpm" : fmtDatePretty(selectedISO)}
                    active={metric === "restingHeartRate"}
                    onClick={() => setMetricFromTile("restingHeartRate")}
                  />

                  <FitnessTile
                    className={`${styles.tileSleep} ${
                      metric === "sleepQualityScore" ? styles.tileActive : ""
                    }`}
                    icon="sleep"
                    title="Sleep Quality"
                    value={fitbitDay?.sleepQualityScore ?? "—"}
                    sub={sleepSub}
                    active={metric === "sleepQualityScore"}
                    onClick={() => setMetricFromTile("sleepQualityScore")}
                  />
                </section>
              </div>

              {/* ✅ Hero card for Trends */}
              <section className={`${styles.panel} ${styles.heroCard}`}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Trends</h2>
                  <div className={styles.sectionMeta}>
                    {fitbitLoading ? "Loading daily summary…" : fmtDatePretty(selectedISO)}
                  </div>
                </div>

                {!!fitbitErr && <div className={`${styles.info} ${styles.error}`}>{fitbitErr}</div>}

                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle}>{metricLabel}</h3>
                  <span className={styles.chartMeta}>
                    {rangeDays === "daily" ? "Daily stats shown above" : `Last ${rangeDays} days`}
                  </span>
                </div>

                {/* ✅ Steps goal progress bar (only when viewing Steps) */}
                {metric === "steps" && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.progressTrack} aria-hidden="true">
                      <div
                        className={styles.progressFill}
                        style={{ transform: `scaleX(${stepsFrac})` }}
                      />
                    </div>
                    <div className={styles.mutedText} style={{ fontSize: 12, marginTop: 6 }}>
                      {stepsPct != null
                        ? `${stepsPct}% of ${stepsGoal.toLocaleString()} step goal`
                        : "—"}
                    </div>
                  </div>
                )}

                <div className={styles.chartBox}>
                  {showDailyInsights ? (
                    <DailyInsights
                      metric={metric}
                      selectedISO={selectedISO}
                      fitbitDay={fitbitDay}
                      fitbitRange={fitbitRange}
                      goalSteps={10000}
                    />
                  ) : (
                    <FitbitTrendCharts
                      key={`${metric}-${rangeDays}-${selectedISO}`}
                      data={fitbitRange}
                      rangeDays={Number(rangeDays === "daily" ? 7 : rangeDays)}
                      goal={goal}
                      dataKey={metric}
                    />
                  )}
                </div>
              </section>
            </section>
          </div>

          <FitnessDashboardTiles
            selectedISO={selectedISO}
            todayISO={realTodayISO}
            workoutsByDay={workoutsByDay}
            fitbitCaloriesByDay={fitbitCaloriesByDay}
            fitbitDay={fitbitDay}
            onViewDay={(iso) => setSelectedISO(iso)}
            onSelectDate={setSelectedISO}
            onSelectRangeDays={setRangeDays}
            onSelectMetric={setMetric}
            currentMetric={metric}
            currentRangeDays={rangeDays}
            coachDateLabel={fmtDatePretty(selectedISO)}
            coachToday={coachData?.today}
            coachModel={coachData?.model}
          />

          {!!sheetErr && (
            <div className={`${styles.info} ${styles.error}`} style={{ marginTop: 8 }}>
              {sheetErr}
            </div>
          )}

          {loadingSheet && (
            <div className={styles.info} style={{ marginTop: 8 }}>
              Loading workouts…
            </div>
          )}
        </div>

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}
