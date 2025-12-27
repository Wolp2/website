import { colIndex, trim } from "./csv";

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

export function parseISODate(str) {
  const t = trim(str);
  if (!t) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(+dt) ? null : dt;
}

export function parseAnyDate(str) {
  return parseISODate(str) ?? parseMDY(str);
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
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

const num = (v) => {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

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

export function buildDailyFitnessSeries(rows) {
  if (!rows?.length) return [];

  const headers = rows[0];
  const body = rows.slice(1);

  const cDate = colIndex(headers, ["datefilled", "dateiso", "date"]);
  const cEx = colIndex(headers, ["exercise"]);
  const cSets = colIndex(headers, ["sets"]);
  const cReps = colIndex(headers, ["reps"]);
  const cMi = colIndex(headers, ["miles", "milesnum", "distance (mi)", "distance mi", "distance"]);
  const cMin = colIndex(headers, ["minutes", "minutesnum", "duration(min)", "duration (min)", "duration"]);

  let curDate = null;
  const map = new Map();

  for (const r of body) {
    const dateCell = trim(r[cDate] ?? "");
    if (dateCell) curDate = parseAnyDate(dateCell) ?? curDate;
    if (!curDate) continue;

    const iso = toISODateLocal(curDate);

    const exercise = trim(r[cEx] ?? "");
    const miles = num(r[cMi]);
    const minutes = toMinutes(r[cMin]);
    const sets = Math.round(num(r[cSets]));
    const reps = Math.round(num(r[cReps]));

    if (!(exercise || miles || minutes || sets || reps)) continue;

    if (!map.has(iso)) {
      map.set(iso, { date: iso, miles: 0, minutes: 0, liftSets: 0, liftReps: 0, sessions: 0 });
    }

    const agg = map.get(iso);

    if (miles || minutes) {
      agg.miles += miles;
      agg.minutes += minutes;
      agg.sessions += 1;
    } else {
      agg.liftSets += sets;
      agg.liftReps += reps;
      agg.sessions += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function takeLastDays(series, days) {
  if (!days || days === "all") return series;
  const n = Math.max(1, Number(days) || 0);
  return series.slice(Math.max(0, series.length - n));
}
