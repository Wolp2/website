// Fitness.jsx
import { useEffect, useMemo, useState } from "react";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pubhtml?gid=0&single=true";

const trim = (s) => (s ?? "").toString().trim();

function parseMDY(str) {
  const t = trim(str);
  if (!t) return null;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  const d = new Date(yy, mm - 1, dd);
  return isNaN(+d) ? null : d;
}
const fmtDate = (d) =>
  d
    ? d.toLocaleDateString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    : "";

function parseCSV(text) {
  const rows = [];
  let i = 0,
    cur = "",
    row = [],
    inQ = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQ = false;
          i++;
        }
      } else {
        cur += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQ = true;
        i++;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
        i++;
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        i++;
      } else if (ch === "\r") {
        i++;
      } else {
        cur += ch;
        i++;
      }
    }
  }
  row.push(cur);
  rows.push(row);
  if (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) rows.pop();
  return rows;
}
const col = (headers, names) => {
  const h = headers.map((x) => trim(x).toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
};

function paceFrom(distanceMiles, durationMin) {
  if (!distanceMiles || !durationMin) return null;
  const pace = durationMin / distanceMiles; // min/mi
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

const isRunLike = (item) =>
  /run|jog|treadmill|mile|miles|cardio/i.test(item.exercise || "") ||
  item.distance ||
  item.duration ||
  /run|cardio/i.test(item.tag || "");

export default function Fitness() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [visibleSessions, setVisibleSessions] = useState(7); // how many history days shown

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (!alive) return;
        setRows(parseCSV(txt));
      } catch (e) {
        console.error(e);
        if (alive) setErr("Could not load training log.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => void (alive = false);
  }, []);

  const {
    latestDate,
    latestItems,
    latestTag,
    latestTotals,
    historyAll, // all sessions, newest→oldest
  } = useMemo(() => {
    if (!rows.length)
      return {
        latestDate: null,
        latestItems: [],
        latestTag: "",
        latestTotals: { miles: 0, minutes: 0, pace: null },
        historyAll: [],
      };

    const headers = rows[0];
    const body = rows.slice(1);

    // Flexible mapping (add more aliases if needed)
    const cDate = col(headers, ["date", "workout date", "day"]);
    const cTag = col(headers, ["tag", "focus", "split", "type", "bodypart"]);
    const cEx = col(headers, ["exercise", "movement"]);
    const cSets = col(headers, ["sets"]);
    const cReps = col(headers, ["reps"]);
    const cWt = col(headers, ["weight", "load", "lbs"]);
    const cDist = col(headers, ["distance", "miles", "mi", "mileage"]);
    const cTime = col(headers, ["time", "duration", "mins", "minutes"]);

    // Forward-fill date & tag
    let curDate = null;
    let curTag = "";
    const entries = [];
    for (const r of body) {
      const dateCell = trim(r[cDate] ?? "");
      const tagCell = trim(r[cTag] ?? "");
      if (dateCell) curDate = parseMDY(dateCell) ?? curDate;
      if (tagCell) curTag = tagCell;
      if (!curDate) continue;

      const e = {
        date: curDate,
        tag: curTag,
        exercise: trim(r[cEx] ?? ""),
        sets: trim(r[cSets] ?? ""),
        reps: trim(r[cReps] ?? ""),
        weight: trim(r[cWt] ?? ""),
        distance: trim(r[cDist] ?? ""),
        duration: trim(r[cTime] ?? ""),
      };
      if (e.exercise || e.reps || e.weight || e.distance || e.duration) entries.push(e);
    }
    if (!entries.length)
      return {
        latestDate: null,
        latestItems: [],
        latestTag: "",
        latestTotals: { miles: 0, minutes: 0, pace: null },
        historyAll: [],
      };

    // Group by date
    const byDate = new Map();
    for (const e of entries) {
      const k = e.date.toDateString();
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(e);
    }

    // Sort dates newest→oldest
    const dates = [...byDate.values()].map((v) => v[0].date).sort((a, b) => b - a);

    const latestDate = dates[0];
    const latestItems = byDate.get(latestDate.toDateString()) ?? [];
    const latestTag = latestItems.find((x) => x.tag)?.tag ?? "";

    // Totals for the latest day
    let miles = 0;
    let minutes = 0;
    for (const it of latestItems) {
      if (!isRunLike(it)) continue;
      const d = parseFloat((it.distance || "").replace(/[^\d.]/g, ""));
      const m = parseFloat((it.duration || "").replace(/[^\d.]/g, ""));
      if (!isNaN(d)) miles += d;
      if (!isNaN(m)) minutes += m;
    }
    const latestTotals = {
      miles: miles || 0,
      minutes: minutes || 0,
      pace: miles > 0 && minutes > 0 ? paceFrom(miles, minutes) : null,
    };

    // Full history (all sessions)
    const historyAll = dates.slice(1).map((d) => ({
      date: d,
      tag: (byDate.get(d.toDateString()).find((x) => x.tag) || {}).tag || "",
      items: byDate.get(d.toDateString()),
      // per-day totals (handy in summary)
      totals: (() => {
        let mi = 0,
          min = 0;
        for (const it of byDate.get(d.toDateString())) {
          if (!isRunLike(it)) continue;
          const dd = parseFloat((it.distance || "").replace(/[^\d.]/g, ""));
          const mm = parseFloat((it.duration || "").replace(/[^\d.]/g, ""));
          if (!isNaN(dd)) mi += dd;
          if (!isNaN(mm)) min += mm;
        }
        return { miles: mi, minutes: min, pace: mi > 0 && min > 0 ? paceFrom(mi, min) : null };
      })(),
    }));

    return { latestDate, latestItems, latestTag, latestTotals, historyAll };
  }, [rows]);

  const shownHistory = historyAll.slice(0, visibleSessions);
  const canShowMore = visibleSessions < historyAll.length;

  return (
    <main className="fitness-wrap">
      <section className="container">
        <header className="hero">
          <h1>My Training Log</h1>
          <p className="sub">Live from Google Sheets — lifts + runs.</p>
        </header>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              Latest Workout — {latestDate ? fmtDate(latestDate) : "—"}
            </h2>
            {latestTag ? <span className="tag">{latestTag}</span> : null}
          </div>

          {/* Run totals bar */}
          {latestTotals.miles > 0 || latestTotals.minutes > 0 ? (
            <div className="totals">
              {latestTotals.miles > 0 && (
                <span className="chip">{latestTotals.miles.toFixed(2)} mi</span>
              )}
              {latestTotals.minutes > 0 && (
                <span className="chip">{Math.round(latestTotals.minutes)} min</span>
              )}
              {latestTotals.pace && <span className="chip">{latestTotals.pace}</span>}
            </div>
          ) : null}

          {loading && <div className="info">Loading latest session…</div>}
          {!!err && <div className="info error">{err}</div>}

          {!loading && !err && (
            <div className="workout-log">
              {latestItems.map((w, i) => (
                <ExerciseOrRun key={i} item={w} />
              ))}
              {latestItems.length === 0 && (
                <div className="info">No entries for the latest date.</div>
              )}
            </div>
          )}
        </section>

        {/* ---- Full history with "show more/all" ---- */}
        {!loading && !err && historyAll.length > 0 && (
          <section className="history">
            <div className="history-bar">
              <h3 className="history-title">Recent Workouts</h3>
              <div className="history-actions">
                {canShowMore && (
                  <>
                    <button className="btn" onClick={() => setVisibleSessions((n) => n + 7)}>
                      Show 7 more
                    </button>
                    <button className="btn" onClick={() => setVisibleSessions(historyAll.length)}>
                      Show all
                    </button>
                  </>
                )}
                {!canShowMore && historyAll.length > 7 && (
                  <button className="btn" onClick={() => setVisibleSessions(7)}>
                    Collapse
                  </button>
                )}
              </div>
            </div>

            {shownHistory.map((h, i) => (
              <details key={i} className="history-day">
                <summary>
                  <span>{fmtDate(h.date)}</span>
                  {h.tag ? <em className="small-tag">{h.tag}</em> : null}
                  {(h.totals.miles > 0 || h.totals.minutes > 0) && (
                    <span className="right">
                      {h.totals.miles > 0 && `${h.totals.miles.toFixed(2)} mi`}
                      {h.totals.minutes > 0 &&
                        ` · ${Math.round(h.totals.minutes)} min`}
                      {h.totals.pace && ` · ${h.totals.pace}`}
                    </span>
                  )}
                </summary>
                <div className="history-items">
                  {h.items.map((it, j) => (
                    <ExerciseOrRun key={j} item={it} compact />
                  ))}
                </div>
              </details>
            ))}
          </section>
        )}

        <footer className="site-foot">© {new Date().getFullYear()} William Lopez</footer>
      </section>

      <style>{`
        :root {
          --bg: #f6f7fb; --text: #0f172a; --muted: #64748b;
          --card: #ffffff; --line: #e5e7eb;
          --accent: #16a34a; --accent2: #22c55e;
        }
        .fitness-wrap { background: var(--bg); min-height: 100dvh; color: var(--text); }
        .container { max-width: 860px; margin: 0 auto; padding: 1rem clamp(1rem,3vw,1.25rem) 2rem; }

        .hero h1 { font-size: clamp(1.7rem,4vw,2.4rem); margin:0; font-weight:800; letter-spacing:-.02em; }
        .sub { margin:.2rem 0 1rem; color: var(--muted); }

        .panel { background: var(--card); border: 1px solid #d1fae5; border-radius:16px; padding:1rem; box-shadow: 0 2px 6px rgba(0,0,0,.04); }
        .panel-head { display:flex; align-items:center; gap:.6rem; margin-bottom:.6rem; }
        .panel-title { margin:0; font-size:1.1rem; font-weight:700; }
        .tag { background: linear-gradient(135deg,var(--accent2),var(--accent)); color:#fff; padding:.2rem .6rem; border-radius:999px; font-size:.8rem; }

        .totals { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:.6rem; }
        .chip { background:#eef2ff; border:1px solid var(--line); padding:.2rem .55rem; border-radius:999px; font-size:.9rem; }

        .workout-log { display:flex; flex-direction:column; gap:.8rem; }

        .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:.85rem; }
        .card.compact { padding:.7rem; }
        .head { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; padding-bottom:.35rem; margin-bottom:.45rem; border-bottom:1px solid #eee; }
        .title { font-size:1.05rem; font-weight:700; margin:0; }
        .pill { background:#e6f6ee; color:#256d40; padding:.2rem .55rem; border-radius:8px; font-size:.9rem; white-space:nowrap; }

        .kv { margin:.22rem 0; font-size:.95rem; }
        .muted { color: var(--muted); }
        .run-line { display:flex; flex-wrap:wrap; gap:.5rem 1rem; font-size:.95rem; }
        .run-chip { background:#eef2ff; border:1px solid var(--line); padding:.15rem .5rem; border-radius:8px; }

        .info { background:#f9fafb; border:1px solid var(--line); border-radius:12px; padding:.8rem 1rem; }
        .info.error { border-color:#fecaca; background:#fff1f2; }

        .history { margin-top:1rem; }
        .history-bar { display:flex; justify-content:space-between; align-items:center; gap:.6rem; margin-bottom:.5rem; }
        .history-title { margin:0; font-size:1.05rem; font-weight:700; }
        .history-actions { display:flex; gap:.4rem; }
        .btn { appearance:none; border:1px solid var(--line); background:#fff; border-radius:8px; padding:.35rem .6rem; font-size:.9rem; }
        .btn:active { transform: translateY(1px); }

        .history-day { background:#fff; border:1px solid var(--line); border-radius:12px; margin-bottom:.6rem; padding:.2rem .6rem; }
        .history-day summary { cursor:pointer; display:flex; align-items:center; gap:.5rem; padding:.5rem 0; list-style:none; }
        .history-day summary::-webkit-details-marker { display:none; }
        .small-tag { color: var(--muted); font-style:normal; font-size:.9rem; }
        .right { margin-left:auto; color:#334155; font-size:.9rem; }

        .history-items { padding:.2rem 0 .6rem; display:flex; flex-direction:column; gap:.5rem; }

        .site-foot { text-align:center; color:var(--muted); margin-top:1.25rem; font-size:.9rem; }
      `}</style>
    </main>
  );
}

/* ---------- Renderer: lift or run ---------- */
function ExerciseOrRun({ item, compact }) {
  const isRun = isRunLike(item);
  if (isRun) {
    const dist = parseFloat((item.distance || "").replace(/[^\d.]/g, "")) || null;
    const mins = parseFloat((item.duration || "").replace(/[^\d.]/g, "")) || null;
    const pace = paceFrom(dist || 0, mins || 0);

    return (
      <div className={`card ${compact ? "compact" : ""}`}>
        <div className="head">
          <h4 className="title">{item.exercise || "Run"}</h4>
        </div>
        <div className="run-line">
          {dist != null && <span className="run-chip">{dist} mi</span>}
          {mins != null && <span className="run-chip">{Math.round(mins)} min</span>}
          {pace && dist && mins && <span className="run-chip">{pace}</span>}
          {!dist && !mins && item.reps && <span className="muted">{item.reps}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${compact ? "compact" : ""}`}>
      <div className="head">
        <h4 className="title">{item.exercise || "—"}</h4>
        {item.weight ? <span className="pill">{item.weight}</span> : null}
      </div>
      <div className="kv"><strong>Sets:</strong> {item.sets || "-"}</div>
      <div className="kv"><strong>Reps:</strong> {item.reps || "-"}</div>
    </div>
  );
}
