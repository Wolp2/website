import { useEffect, useRef, useState } from "react";

export default function FitnessControlBar({
  styles,
  selectedISO,
  onSelectedISO,
  rangeDays,
  onRangeDays,
  metric,
  onMetric,
  onJumpToToday,
  onToolbarHeight,
}) {
  const surfaceRef = useRef(null);
  const [elevated, setElevated] = useState(false);

  // Measure actual height so exerciseBar can sit flush under it
  useEffect(() => {
    if (!surfaceRef.current) return;

    const el = surfaceRef.current;

    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      onToolbarHeight?.(h);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onToolbarHeight]);

  // Scroll shadow
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const setRangeSafe = (v) => {
    // keep rangeDays consistent as strings: "daily" | "7" | "30" | "90"
    if (v === "daily") return onRangeDays?.("daily");
    const n = Math.max(7, Math.min(90, parseInt(String(v), 10)));
    onRangeDays?.(String(n));
  };

  const quickMetrics = [
    ["steps", "Steps"],
    ["caloriesOut", "Calories"],
    ["restingHeartRate", "Resting HR"],
    ["sleepQualityScore", "Sleep"],
    ["hrvDailyRmssd", "HRV"],
  ];

  return (
    <div className={styles.stickyBar}>
      <div
        ref={surfaceRef}
        className={[
          styles.stickySurface,
          styles.elevHigh, // ✅ use elevation tier
          elevated ? styles.stickyShadow : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.controlsRow}>
          <div className={styles.controlsGroup}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input
                className={styles.input}
                type="date"
                value={selectedISO}
                onChange={(e) => onSelectedISO?.(e.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Range</span>
              <select
                className={styles.select}
                value={String(rangeDays)}
                onChange={(e) => setRangeSafe(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Metric</span>
              <select
                className={styles.select}
                value={metric}
                onChange={(e) => onMetric?.(e.target.value)}
              >
                <option value="steps">Steps</option>
                <option value="caloriesOut">Calories Out</option>
                <option value="restingHeartRate">Resting HR</option>
                <option value="sleepQualityScore">Sleep Quality</option>
                <option value="hrvDailyRmssd">HRV (RMSSD)</option>
              </select>
            </label>
          </div>

          <button className={styles.btn} onClick={onJumpToToday}>
            Jump to Today
          </button>
        </div>

        {/* ✅ Quick metric pills row */}
        <div className={styles.quickRow}>
          {quickMetrics.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={[
                styles.pillBtn,
                metric === key ? styles.activePill : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onMetric?.(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
