// Fitness.jsx
import { useEffect, useMemo, useState } from "react";

/** ======= Published CSV URL here (yours) ======= */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

/* ========= Helpers ========= */
const trim = (s) => (s ?? "").toString().trim();

function parseMDY(str) {
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(trim(str));
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  return new Date(yy, mm - 1, dd);
}

function formatDate(d) {
  try {
    return d.toLocaleDateString(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// tiny CSV parser that handles quoted commas/newlines
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
        // normalize \r\n
        i++;
      } else {
        cur += ch;
        i++;
      }
    }
  }
  // last cell
  row.push(cur);
  rows.push(row);
  // drop empty trailing row
  if (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) {
    rows.pop();
  }
  return rows;
}

function indexByName(headers, nameCandidates) {
  const target = headers.map((h) => trim(h).toLowerCase());
  for (const name of nameCandidates) {
    const i = target.indexOf(name.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

/* ========= Component ========= */
export default function Fitness() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const csv = await res.text();
        const parsed = parseCSV(csv);
        if (!alive) return;
        setRows(parsed);
      } catch (e) {
        if (!alive) return;
        setErr("Could not load training log.");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(() => {
    if (!rows.length) return { latestDate: null, tag: "", items: [] };
    const headers = rows[0];
    const body = rows.slice(1);

    // Map columns by common header names (case-insensitive, flexible)
    const colDate = indexByName(headers, ["date", "workout date", "day"]);
    const colTag = indexByName(headers, ["tag", "focus", "split", "bodypart", "type"]);
    const colExercise = indexByName(headers, ["exercise", "movement"]);
    const colSets = indexByName(headers, ["sets"]);
    const colReps = indexByName(headers, ["reps"]);
    const colWeight = indexByName(headers, ["weight", "load", "lbs"]);

    // Normalize rows
    const normalized = body
      .map((r) => ({
        dateStr: trim(r[colDate] ?? ""),
        date: parseMDY(r[colDate]),
        tag: trim(r[colTag] ?? ""),
        exercise: trim(r[colExercise] ?? ""),
        sets: trim(r[colSets] ?? ""),
        reps: trim(r[colReps] ?? ""),
        weight: trim(r[colWeight] ?? ""),
      }))
      .filter((r) => r.exercise || r.reps || r.weight);

    // Find latest date
    const withDates = normalized.filter((r) => r.date instanceof Date && !isNaN(r.date));
    if (!withDates.length) return { latestDate: null, tag: "", items: [] };
    const latestDate = withDates.reduce((a, b) => (a.date > b.date ? a : b)).date;

    // Use the first tag on that date (if any)
    const dateKey = latestDate.toDateString();
    const todays = withDates.filter((r) => r.date.toDateString() === dateKey);
    const tag = todays.find((r) => r.tag)?.tag ?? "";

    // Group by exercise (some sheets put blank rows for headings)
    const items = todays
      .filter((r) => r.exercise)
      .map((r) => ({
        exercise: r.exercise,
        sets: r.sets || "-",
        reps: r.reps || "-",
        weight: r.weight ? `${r.weight}` : "-",
      }));

    return { latestDate, tag, items };
  }, [rows]);

  const dateLabel = data.latestDate ? formatDate(data.latestDate) : "";

  return (
    <main className="fitness-wrap">
      <section className="container">
        <header className="page-head">
          <h1>My Training Log</h1>
          <p className="sub">Live from Google Sheets — lifts + runs.</p>
        </header>

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Latest Workout — {dateLabel || "—"}</h2>
            {data.tag ? <span className="tag">{data.tag}</span> : null}
          </div>

          {loading && (
            <div className="loading">Loading latest session…</div>
          )}
          {!!err && <div className="error">{err}</div>}

          {!loading && !err && data.items.length === 0 && (
            <div className="empty">No entries for the latest date.</div>
          )}

          <div className="workout-log">
            {data.items.map((w, i) => (
              <div key={i} className="exercise-card">
                <div className="exercise-header">
                  <h3>{w.exercise}</h3>
                  <span className="weight">{w.weight}</span>
                </div>
                <div className="sets-reps">
                  <p>
                    <strong>Sets:</strong> {w.sets}
                  </p>
                  <p>
                    <strong>Reps:</strong> {w.reps}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="site-foot">© {new Date().getFullYear()} William Lopez</footer>
      </section>

      {/* ---- Minimal, mobile-first CSS (scoped globally). 
         If you prefer, move this to fitness.css and import it. ---- */}
      <style>{`
        :root {
          --bg: #f7f7fb;
          --text: #111827;
          --muted: #6b7280;
          --card: #ffffff;
          --line: #e5e7eb;
          --accent: #16a34a;
          --accent-2: #22c55e;
        }

        .fitness-wrap {
          background: var(--bg);
          min-height: 100dvh;
          color: var(--text);
        }
        .container {
          max-width: 860px;
          margin: 0 auto;
          padding: 1rem clamp(1rem, 3vw, 1.25rem) 2.5rem;
        }

        .page-head h1 {
          font-size: clamp(1.6rem, 3.5vw, 2.25rem);
          margin: 0 0 .25rem 0;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .sub {
          margin: 0 0 1rem 0;
          color: var(--muted);
        }

        .panel {
          background: var(--card);
          border: 1px solid #d1fae5;
          border-radius: 16px;
          padding: 0.9rem;
          box-shadow: 0 2px 6px rgba(0,0,0,.04);
        }
        @media (min-width: 640px) {
          .panel { padding: 1.2rem; }
        }

        .panel-head {
          display: flex;
          align-items: center;
          gap: .6rem;
          margin-bottom: .75rem;
        }
        .panel-title {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0;
        }

        .tag {
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          color: #fff;
          font-size: .8rem;
          padding: .2rem .6rem;
          border-radius: 999px;
        }

        .loading, .error, .empty {
          padding: .8rem 1rem;
          border-radius: 12px;
          font-size: .95rem;
          background: #f9fafb;
          border: 1px solid var(--line);
          margin-bottom: .75rem;
        }
        .error { border-color: #fecaca; background: #fff1f2; }

        .workout-log {
          display: flex;
          flex-direction: column;
          gap: .8rem;
        }

        .exercise-card {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: .9rem;
        }
        @media (min-width: 600px) {
          .exercise-card { padding: 1.1rem 1.2rem; }
        }

        .exercise-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          border-bottom: 1px solid #eee;
          padding-bottom: .35rem;
          margin-bottom: .45rem;
          gap: .5rem;
        }
        .exercise-header h3 {
          font-size: 1.05rem;
          font-weight: 700;
          margin: 0;
        }
        .weight {
          background: #e6f6ee;
          color: #256d40;
          padding: .2rem .55rem;
          border-radius: 8px;
          font-size: .9rem;
          white-space: nowrap;
        }
        .sets-reps p {
          margin: .25rem 0;
          font-size: .95rem;
          line-height: 1.45;
        }

        .site-foot {
          text-align: center;
          color: var(--muted);
          margin-top: 1.25rem;
          font-size: .9rem;
        }
      `}</style>
    </main>
  );
}
