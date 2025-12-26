import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

import FitbitTrendCharts from "../components/fitness/FitbitTrendCharts";
import FitbitStatusBanner from "../components/fitness/FitbitStatusBanner";
import FitnessTile from "../components/fitness/FitnessTile";
import LiftRow from "../components/fitness/LiftRow";

import {
  bestWeightInHistory,
  buildExerciseIndex,
  buildLiftsByISO,
  buildTrendData,
  clamp,
  fmtDatePretty,
  groupExercisesBySplit,
  splitLabel,
  toISODateLocal,
} from "../lib/fitness/utils";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

const FITBIT_API = "https://fitbit.wlopez2014.workers.dev";

const fmtMins = (m) => {
  if (m == null || !Number.isFinite(Number(m))) return "—";
  const n = Math.round(Number(m));
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
};

export default function Fitness() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("fitness-dark") === "true"
  );

  useEffect(() => {
    localStorage.setItem("fitness-dark", String(darkMode));
  }, [darkMode]);

  const [selectedISO, setSelectedISO] = useState(() => toISODateLocal(new Date()));
  const [rangeDays, setRangeDays] = useState("daily"); // "daily" | 7 | 30 | 90
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate | sleepQualityScore

  const [rows, setRows] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetErr, setSheetErr] = useState("");

  const [fitbitDay, setFitbitDay] = useState(null);
  const [fitbitRange, setFitbitRange] = useState([]);
  const [fitbitErr, setFitbitErr] = useState("");
  const [fitbitLoading, setFitbitLoading] = useState(false);

  const [exerciseQuery, setExerciseQuery] = useState("");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [splitFilter, setSplitFilter] = useState("all"); // all | push | pull | legs | other

  const metricLabel =
    metric === "steps"
      ? "Steps"
      : metric === "caloriesOut"
      ? "Calories Out"
      : metric === "restingHeartRate"
      ? "Resting HR"
      : "Sleep Quality";

  // Direction for "Best/Worst day" tiles in FitbitTrendCharts
  const better = metric === "restingHeartRate" ? "lower" : "higher";

  // Goal line (optional)
  const goal = useMemo(() => (metric === "steps" ? 10000 : null), [metric]);

  // Load Google Sheet rows (CSV)
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

  // ===== Derived data =====
  const liftsByISO = useMemo(() => buildLiftsByISO(rows), [rows]);
  const exerciseIndex = useMemo(() => buildExerciseIndex(liftsByISO), [liftsByISO]);

  const exerciseGroups = useMemo(() => {
    return groupExercisesBySplit(exerciseIndex, exerciseQuery);
  }, [exerciseIndex, exerciseQuery]);

  const exerciseNames = useMemo(
    () => [
      ...exerciseGroups.push,
      ...exerciseGroups.pull,
      ...exerciseGroups.legs,
      ...exerciseGroups.other,
    ],
    [exerciseGroups]
  );

  const selectedExerciseHistory = useMemo(() => {
    if (!selectedExercise) return [];
    return exerciseIndex.get(selectedExercise) ?? [];
  }, [exerciseIndex, selectedExercise]);

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length) setSelectedExercise(exerciseNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseNames.length]);

  // Load Fitbit day summary for selected date
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

  // Load Fitbit range only when user selects 7/30/90
  useEffect(() => {
    let alive = true;

    if (rangeDays === "daily") {
      setFitbitRange([]);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const r = await fetch(
          `${FITBIT_API}/fitbit/range?days=${encodeURIComponent(rangeDays)}`,
          { cache: "no-store" }
        );

        const text = await r.text();
        if (!r.ok) throw new Error(text);

        const payload = JSON.parse(text);
        if (!alive) return;

        setFitbitRange(payload.data ?? []);
      } catch (e) {
        console.error(e);
        if (alive) setFitbitRange([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rangeDays]);

  // Build chart series (supports sleepQualityScore now)
  const trendData = useMemo(() => {
    return buildTrendData(fitbitRange, metric);
  }, [fitbitRange, metric]);

  const selectedLifts = liftsByISO.get(selectedISO) ?? [];

  const sleepSub = useMemo(() => {
    const s = fitbitDay;
    if (!s) return fmtDatePretty(selectedISO);

    const stages = s.sleepStages || {};
    const parts = [];

    if (Number.isFinite(stages.rem)) parts.push(`REM ${Math.round(stages.rem)}m`);
    if (Number.isFinite(stages.deep)) parts.push(`Deep ${Math.round(stages.deep)}m`);
    if (Number.isFinite(stages.light)) parts.push(`Light ${Math.round(stages.light)}m`);
    if (Number.isFinite(stages.wake)) parts.push(`Awake ${Math.round(stages.wake)}m`);

    // If we have no stages, fall back to duration
    if (!parts.length && s.sleepMinutes != null) {
      parts.push(`Asleep ${fmtMins(s.sleepMinutes)}`);
    }

    return parts.length ? parts.join(" • ") : fmtDatePretty(selectedISO);
  }, [fitbitDay, selectedISO]);

  return (
    <main className={`${styles.fitnessWrap} ${darkMode ? styles.dark : ""}`}>
      <section className={styles.container}>
        <div className={styles.statusRow}>
          <FitbitStatusBanner apiBase={FITBIT_API} />

          <button
            type="button"
            className={styles.darkToggle}
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle dark mode"
          >
            {darkMode ? "🔆 Light" : "🕶️ Dark"}
          </button>
        </div>

        <header className={styles.hero}>
          <h1>Fitness Dashboard</h1>
          <p className={styles.sub}>Fitbit stats + lift tracking (Google Sheets).</p>
        </header>

        <section className={styles.panel}>
          <div className={styles.controlsRow}>
            <div className={styles.controlsGroup}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Date</span>
                <input
                  className={styles.input}
                  type="date"
                  value={selectedISO}
                  onChange={(e) => setSelectedISO(e.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Chart range</span>
                <select
                  className={styles.select}
                  value={String(rangeDays)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "daily") return setRangeDays("daily");
                    setRangeDays(clamp(parseInt(v, 10), 7, 90));
                  }}
                >
                  <option value="daily">Daily stats (default)</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Metric</span>
                <select
                  className={styles.select}
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                >
                  <option value="steps">Steps</option>
                  <option value="caloriesOut">Calories Out</option>
                  <option value="restingHeartRate">Resting HR</option>
                  <option value="sleepQualityScore">Sleep Quality</option>
                </select>
              </label>
            </div>

            <button
              className={styles.btn}
              onClick={() => setSelectedISO(toISODateLocal(new Date()))}
            >
              Jump to Today
            </button>
          </div>
        </section>

        <section className={styles.tileGrid}>
          <FitnessTile
            title="Steps"
            value={fitbitDay?.steps ?? "—"}
            sub={fmtDatePretty(selectedISO)}
          />
          <FitnessTile
            title="Calories Out"
            value={fitbitDay?.caloriesOut ?? "—"}
            sub={fmtDatePretty(selectedISO)}
          />
          <FitnessTile
            title="Resting HR"
            value={fitbitDay?.restingHeartRate ?? "—"}
            sub={fitbitDay?.restingHeartRate ? "bpm" : fmtDatePretty(selectedISO)}
          />
          <FitnessTile
            title="Sleep Quality"
            value={fitbitDay?.sleepQualityScore ?? "—"}
            sub={sleepSub}
          />
        </section>

        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Fitbit Trend</h2>
            <div className={styles.sectionMeta}>
              {fitbitLoading ? "Loading daily summary…" : fmtDatePretty(selectedISO)}
            </div>
          </div>

          {!!fitbitErr && <div className={`${styles.info} ${styles.error}`}>{fitbitErr}</div>}

          <div className={styles.chartHead}>
            <h3 className={styles.chartTitle}>{metricLabel}</h3>
            <span className={styles.chartMeta}>
              {rangeDays === "daily" ? "Daily stats shown above" : `${rangeDays} days`}
            </span>
          </div>

          <div className={styles.chartBox}>
            {rangeDays === "daily" ? (
              <div className={styles.info}>Select 7 / 30 / 90 days to load a trend chart.</div>
            ) : trendData.length ? (
              <FitbitTrendCharts
                title={metricLabel}
                data={trendData}
                rangeDays={Number(rangeDays)}
                goal={goal}
                trendWindow={14}
                better={better}
              />
            ) : (
              <div className={styles.info}>No chart data yet.</div>
            )}
          </div>
        </section>

        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lifts — {fmtDatePretty(selectedISO)}</h2>
            <div className={styles.sectionMeta}>
              {loadingSheet
                ? "Loading log…"
                : sheetErr
                ? "Sheets error"
                : `${selectedLifts.length} lifts`}
            </div>
          </div>

          {sheetErr ? <div className={`${styles.info} ${styles.error}`}>{sheetErr}</div> : null}

          {!sheetErr && !loadingSheet && selectedLifts.length === 0 ? (
            <div className={styles.info}>No lifts logged for this date.</div>
          ) : null}

          {!sheetErr && selectedLifts.length > 0 ? (
            <div className={styles.liftGrid}>
              {selectedLifts.map((it, i) => (
                <LiftRow key={`${it.iso}-${i}`} item={it} />
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Progress by Exercise</h2>
              <div className={styles.sectionMeta}>Pick an exercise to see your history</div>
            </div>

            <div className={styles.splitTabs}>
              {["all", "push", "pull", "legs", "other"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.tabBtn} ${splitFilter === k ? styles.tabBtnActive : ""}`}
                  onClick={() => setSplitFilter(k)}
                >
                  {k === "all" ? "All" : splitLabel(k)}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const groupsToShow = splitFilter === "all" ? ["push", "pull", "legs", "other"] : [splitFilter];

            return (
              <div className={styles.splitSections}>
                {groupsToShow.map((g) => {
                  const list = exerciseGroups[g] ?? [];
                  if (!list.length) return null;

                  return (
                    <div key={g} className={styles.splitSection}>
                      <div className={styles.splitHeader}>
                        <h3 className={styles.splitTitle}>{splitLabel(g)}</h3>
                        <span className={styles.splitCount}>{list.length} exercises</span>
                      </div>

                      <div className={styles.exerciseGrid}>
                        {list.slice(0, 18).map((name) => {
                          const hist = exerciseIndex.get(name) ?? [];
                          const last = hist[0];
                          const best = bestWeightInHistory(hist);

                          return (
                            <button
                              key={name}
                              type="button"
                              className={`${styles.exerciseCard} ${name === selectedExercise ? styles.exerciseCardActive : ""}`}
                              onClick={() => setSelectedExercise(name)}
                            >
                              <div className={styles.exerciseName}>{name}</div>

                              <div className={styles.exerciseLast}>
                                <span className={styles.muted}>{last?.iso ? fmtDatePretty(last.iso) : "—"}</span>

                                <div className={styles.badgeRow}>
                                  {last?.weight ? <span className={styles.pill}>Last: {last.weight}</span> : null}
                                  {best != null ? <span className={styles.pillAlt}>Best: {best} lb</span> : null}
                                </div>
                              </div>

                              <div className={styles.exerciseMeta}>
                                Sets: {last?.sets || "-"} • Reps: {last?.reps || "-"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className={styles.exerciseBar}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Search</span>
              <input
                className={styles.input}
                value={exerciseQuery}
                onChange={(e) => setExerciseQuery(e.target.value)}
                placeholder="bench, incline, squat..."
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Exercise</span>
              <select
                className={styles.select}
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
              >
                {exerciseNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <button
              className={styles.btn}
              onClick={() => {
                const first = selectedExerciseHistory[0];
                if (first?.iso) setSelectedISO(first.iso);
              }}
              disabled={!selectedExerciseHistory.length}
              title="Jump date picker to most recent entry"
            >
              Jump to Latest
            </button>
          </div>

          <div className={styles.tableWrap}>
            <div className={styles.tableHead}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>
                {selectedExercise || "Select an exercise"}
              </h3>
              <span className={styles.chartMeta}>
                {selectedExerciseHistory.length ? `${selectedExerciseHistory.length} entries` : "No entries"}
              </span>
            </div>

            {selectedExerciseHistory.length ? (
              <div className={styles.table}>
                <div className={`${styles.tr} ${styles.th}`}>
                  <div>Date</div>
                  <div>Weight</div>
                  <div>Sets</div>
                  <div>Reps</div>
                  <div>Notes</div>
                  <div></div>
                </div>

                {selectedExerciseHistory.slice(0, 40).map((it, idx) => (
                  <div key={`${it.iso}-${idx}`} className={styles.tr}>
                    <div>{fmtDatePretty(it.iso)}</div>
                    <div>{it.weight || "—"}</div>
                    <div>{it.sets || "—"}</div>
                    <div>{it.reps || "—"}</div>
                    <div className={styles.notesCell}>{it.notes || ""}</div>
                    <div>
                      <button className={styles.linkBtn} onClick={() => setSelectedISO(it.iso)}>
                        View day
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.info}>No history for this exercise yet.</div>
            )}
          </div>
        </section>

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}
