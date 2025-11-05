import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

/* Helpers */

export default function Fitness() {
  // state + effects + memo 
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [visibleSessions, setVisibleSessions] = useState(7);
  const [visibleRuns, setVisibleRuns] = useState(10);

  const shownHistory = historyAll.slice(0, visibleSessions);
  const canShowMoreSessions = visibleSessions < historyAll.length;
  const shownRuns = runsAll.slice(0, visibleRuns);
  const canShowMoreRuns = visibleRuns < runsAll.length;

  return (
    <main className={styles.fitnessWrap}>
      <section className={styles.container}>
        <header className={styles.hero}>
          <h1>My Training Log</h1>
          <p className={styles.sub}>Live from Google Sheets — lifts + runs.</p>
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              Latest Workout — {latestDate ? fmtDate(latestDate) : "—"}
            </h2>
            {latestTag ? <span className={styles.tag}>{latestTag}</span> : null}
          </div>

          {loading && <div className={styles.info}>Loading…</div>}
          {!!err && <div className={`${styles.info} ${styles.error}`}>{err}</div>}

          {!loading && !err && (
            <>
              <div className={styles.workoutLog}>
                {latestLifts.map((w, i) => (
                  <LiftCard key={i} item={w} />
                ))}
                {latestLifts.length === 0 && (
                  <div className={styles.info}>No lifts logged for the latest date.</div>
                )}
              </div>

              <div className={styles.runsLatest}>
                <h3 className={styles.sectionTitle}>Latest Run</h3>
                {latestRuns.length === 0 ? (
                  <div className={styles.info}>No runs logged for the latest date.</div>
                ) : (
                  <>
                    <div className={styles.totals}>
                      {runTotalsLatest.miles > 0 && (
                        <span className={styles.chip}>{runTotalsLatest.miles.toFixed(2)} mi</span>
                      )}
                      {runTotalsLatest.minutes > 0 && (
                        <span className={styles.chip}>{formatDuration(runTotalsLatest.minutes)}</span>
                      )}
                      {runTotalsLatest.pace && (
                        <span className={styles.chip}>{runTotalsLatest.pace}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>

        {!loading && !err && historyAll.length > 0 && (
          <section className={styles.history}>
            <div className={styles.historyBar}>
              <h3 className={styles.historyTitle}>Recent Workouts</h3>
              <div className={styles.historyActions}>
                {canShowMoreSessions ? (
                  <>
                    <button className={styles.btn} onClick={() => setVisibleSessions((n) => n + 7)}>
                      Show 7 more
                    </button>
                    <button className={styles.btn} onClick={() => setVisibleSessions(historyAll.length)}>
                      Show all
                    </button>
                  </>
                ) : historyAll.length > 7 ? (
                  <button className={styles.btn} onClick={() => setVisibleSessions(7)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            {shownHistory.map((h, i) => (
              <details key={i} className={styles.historyDay}>
                <summary>
                  <span>{fmtDate(h.date)}</span>
                  {h.tag ? <em className={styles.smallTag}>{h.tag}</em> : null}
                </summary>
                <div className={styles.historyItems}>
                  {h.items.map((it, j) =>
                    (trim(it.miles) || trim(it.minutes)) ? (
                      <RunCard key={j} item={it} compact />
                    ) : it.exercise ? (
                      <LiftCard key={j} item={it} compact />
                    ) : null
                  )}
                </div>
              </details>
            ))}
          </section>
        )}

        {!loading && !err && runsAll.length > 0 && (
          <section className={styles.runsHistory}>
            <div className={styles.historyBar}>
              <h3 className={styles.historyTitle}>Runs History</h3>
              <div className={styles.historyActions}>
                {canShowMoreRuns ? (
                  <>
                    <button className={styles.btn} onClick={() => setVisibleRuns((n) => n + 10)}>
                      Show 10 more
                    </button>
                    <button className={styles.btn} onClick={() => setVisibleRuns(runsAll.length)}>
                      Show all
                    </button>
                  </>
                ) : runsAll.length > 10 ? (
                  <button className={styles.btn} onClick={() => setVisibleRuns(10)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.runsTable}>
              {shownRuns.map((r, i) => (
                <div key={i} className={styles.runsRow}>
                  <div className={`${styles.col} ${styles.date}`}>{fmtDate(r.date)}</div>
                  <div className={`${styles.col} ${styles.dist}`}>Distance: {r.miles || ""}</div>
                  <div className={`${styles.col} ${styles.time}`}>Time: {r.minutes || ""}</div>
                  <div className={`${styles.col} ${styles.notes}`}>Notes: {r.notes || ""}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}

/* ---------- Cards ---------- */
function LiftCard({ item, compact }) {
  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.head}>
        <h4 className={styles.title}>{item.exercise || "—"}</h4>
        {item.weight ? <span className={styles.pill}>{item.weight}</span> : null}
      </div>
      <div className={styles.kv}><strong>Sets:</strong> {item.sets || "-"}</div>
      <div className={styles.kv}><strong>Reps:</strong> {item.reps || "-"}</div>
    </div>
  );
}

function RunCard({ item, compact }) {
  const dist = item.miles ? parseFloat(item.miles.replace(/[^\d.]/g, "")) : null;
  const mins = item.minutes ? toMinutes(item.minutes) : null;
  const pace = dist && mins ? paceFrom(dist, mins) : null;
  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.kv}>
        <strong>Run:</strong> {dist ? `${dist} mi` : ""}
        {mins ? ` · ${formatDuration(mins)}` : ""}
        {pace ? ` · ${pace}` : ""}
      </div>
      {item.notes && <div className={styles.kv} style={{ color: "#64748b" }}>{item.notes}</div>}
    </div>
  );
}
