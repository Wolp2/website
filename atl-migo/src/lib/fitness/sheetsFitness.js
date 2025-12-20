import { colIndex, trim } from "./csv";

/**
 * Parses MM/DD/YYYY (or M/D/YY) -> Date or null
 */
export function parseMDY(str) {
  const t = trim(str);
  if (!t) return null;

  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!m) return null;

  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;

  const d = new Date(yy, mm - 1, dd);
  return Number.isNaN(+d) ? null : d;
}

export function toISODateLocal(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function fmtDatePretty(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

/**
 * Given parsed CSV rows, aggregates workouts by day into chart-friendly data.
 * Output row shape:
 * {
 *   date: "YYYY-MM-DD",
 *   miles: number,
 *   minutes: number,
 *   liftSets: number,
 *   liftReps: number,
 *   sessions: number
 * }
 */
export function buildDailyFitnessSeries(rows) {
  if (!rows?.length) return [];

  const headers = rows[0];
  const body = rows.slice(1);

  const cDate = colIndex(headers, ["date"]);
  const cEx = colIndex(headers, ["exercise"]);
  const cSets = colIndex(headers, ["sets"]);
  const cReps = colIndex(headers, ["reps"]);
  const cMi = colIndex(headers, ["distance (mi)", "distance mi", "miles"]);
  const cMin = colIndex(headers, ["duration(min)", "duration (min)", "minutes", "duration"]);

  let curDate = null;
  const map = new Map(); // iso -> agg

  const num = (v) => {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // supports "12:34" or "1:02:03" or "45" minutes
  const toMinutes = (v) => {
    if (v == null) return 0;
    const s = String(v).trim().toLowerCase();
    if (!s) return 0;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

    if (s.includes(":")) {
      const parts = s.split(":").map((x) => parseFloat(x) || 0);
      if (parts.length === 3) {
        const [hh, mm, ss] = parts;
        return hh * 60 + mm + ss / 60;
      }
      const [mm, ss] = parts;
      return mm + ss / 60;
    }
    return 0;
  };

  for (const r of body) {
    const dateCell = trim(r[cDate] ?? "");
    if (dateCell) curDate = parseMDY(dateCell) ?? curDate;
    if (!curDate) continue;

    const iso = toISODateLocal(curDate);

    const exercise = trim(r[cEx] ?? "");
    const miles = num(r[cMi]);
    const minutes = toMinutes(r[cMin]);
    const sets = Math.round(num(r[cSets]));
    const reps = Math.round(num(r[cReps]));

    // Decide whether this row is meaningful
    const hasAnything = !!(exercise || miles || minutes || sets || reps);
    if (!hasAnything) continue;

    if (!map.has(iso)) {
      map.set(iso, { date: iso, miles: 0, minutes: 0, liftSets: 0, liftReps: 0, sessions: 0 });
    }
    const agg = map.get(iso);

    // Treat run rows as those with miles/minutes
    if (miles || minutes) {
      agg.miles += miles;
      agg.minutes += minutes;
      agg.sessions += 1;
    } else {
      // lift-ish row
      agg.liftSets += sets;
      agg.liftReps += reps;
      agg.sessions += 1;
    }
  }

  // Sort by date ascending
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function takeLastDays(series, days) {
  if (!days || days === "all") return series;
  const n = Math.max(1, Number(days) || 0);
  return series.slice(Math.max(0, series.length - n));
}
