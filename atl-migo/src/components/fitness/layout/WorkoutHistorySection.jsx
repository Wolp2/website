export default function WorkoutHistorySection({
    styles,
    splitFilter,
    onSplitFilter,
    splitLabel,
    exerciseQuery,
    onExerciseQuery,
    selectedExercise,
    onSelectedExercise,
    exerciseNames,
    ALL_EXERCISES,
    historyTitle,
    history,
    historyLimit,
    onLoadMore,
    onShowAll,
    onViewDay,
  }) {
    return (
      <section className={styles.panel} style={{ marginTop: 14 }}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Workout History</h2>
            <div className={styles.sectionMeta}>Search + filter your complete lifting log</div>
          </div>
  
          <div className={styles.splitTabs}>
            {["all", "push", "pull", "legs", "other"].map((k) => (
              <button
                key={k}
                type="button"
                className={`${styles.tabBtn} ${splitFilter === k ? styles.tabBtnActive : ""}`}
                onClick={() => onSplitFilter(k)}
              >
                {k === "all" ? "All" : splitLabel(k)}
              </button>
            ))}
          </div>
        </div>
  
        <div className={styles.exerciseBar}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Search</span>
            <input
              className={styles.input}
              value={exerciseQuery}
              onChange={(e) => onExerciseQuery(e.target.value)}
              placeholder="bench, incline, squat..."
            />
          </label>
  
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Exercise</span>
            <select className={styles.select} value={selectedExercise} onChange={(e) => onSelectedExercise(e.target.value)}>
              <option value={ALL_EXERCISES}>All exercises</option>
              {exerciseNames
                .filter((n) => n !== ALL_EXERCISES)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
        </div>
  
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <h3 className={styles.chartTitle} style={{ margin: 0 }}>
              {historyTitle}
            </h3>
            <span className={styles.chartMeta}>
              {history.length ? `${Math.min(historyLimit, history.length)} of ${history.length}` : "No entries"}
            </span>
          </div>
  
          {history.length ? (
            <>
              <div className={styles.table}>
                <div className={`${styles.tr} ${styles.th}`}>
                  <div>Date</div>
                  <div>Exercise</div>
                  <div>Weight</div>
                  <div>Sets</div>
                  <div>Reps</div>
                  <div>Notes</div>
                  <div></div>
                </div>
  
                {history.slice(0, historyLimit).map((it, idx) => (
                  <div key={`${it.iso}-${it.exercise}-${idx}`} className={styles.tr}>
                    <div>{it.iso}</div>
                    <div>{it.exercise || "—"}</div>
                    <div>{it.weight || "—"}</div>
                    <div>{it.sets || "—"}</div>
                    <div>{it.reps || "—"}</div>
                    <div className={styles.notesCell}>{it.notes || ""}</div>
                    <div>
                      <button className={styles.linkBtn} onClick={() => onViewDay(it.iso)}>
                        View day
                      </button>
                    </div>
                  </div>
                ))}
              </div>
  
              {historyLimit < history.length ? (
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className={styles.btn} onClick={onLoadMore}>
                    Load 40 more
                  </button>
                  <button className={styles.btn} onClick={onShowAll}>
                    Show all
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.info}>No history yet.</div>
          )}
        </div>
      </section>
    );
  }
  