async function refreshIfNeeded(env, tokens) {
  const expiresMs = (tokens.expires_in ?? 0) * 1000;
  const age = Date.now() - (tokens.obtained_at ?? 0);
  const shouldRefresh =
    !tokens.access_token || (expiresMs && age > expiresMs - 60_000);

  if (!shouldRefresh) return tokens;

  const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(
        `${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`
      )}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Refresh failed: ${err}`);
  }

  const next = await tokenRes.json();
  const merged = { ...tokens, ...next, obtained_at: Date.now() };
  await env.FITBIT_KV.put("fitbit_tokens", JSON.stringify(merged));
  return merged;
}

async function fitbitGet(accessToken, path) {
  const res = await fetch(`https://api.fitbit.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Fitbit API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function clampDays(d) {
  const n = Number(d);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

function toISODateLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseISODate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDaysISO(iso, deltaDays) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return toISODateLocal(dt);
}

function rangeFromEndISO(days, endISO) {
  const end = parseISODate(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startISO: toISODateLocal(start), endISO: toISODateLocal(end) };
}

function eachDateISO(startISO, endISO) {
  const out = [];
  const cur = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  while (cur <= end) {
    out.push(toISODateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** --- Sleep range strategy (score if present, else efficiency) --- */
async function fetchSleepForDate(accessToken, iso) {
  const res = await fitbitGet(accessToken, `/1.2/user/-/sleep/date/${iso}.json`);
  const first = Array.isArray(res?.sleep) ? res.sleep[0] : null;

  const score =
    first?.levels?.summary?.score ??
    first?.score?.sleepScore ??
    res?.summary?.sleepScore ??
    res?.sleep?.[0]?.score?.sleepScore;

  if (Number.isFinite(Number(score))) return Number(score);

  const eff = first?.efficiency ?? res?.summary?.efficiency;
  if (Number.isFinite(Number(eff))) return Number(eff);

  return null;
}

async function fetchSleepRange(accessToken, startISO, endISO) {
  const dates = eachDateISO(startISO, endISO);
  const out = [];
  const BATCH = 6;

  for (let i = 0; i < dates.length; i += BATCH) {
    const chunk = dates.slice(i, i + BATCH);

    const results = await Promise.all(
      chunk.map(async (iso) => {
        try {
          const value = await fetchSleepForDate(accessToken, iso);
          return { date: iso, value };
        } catch {
          return { date: iso, value: null };
        }
      })
    );

    out.push(...results);
  }

  return out;
}

/** --- HRV Summary by Date --- */
async function fetchHrvByDate(accessToken, dateISO) {
  const r = await fetch(`https://api.fitbit.com/1/user/-/hrv/date/${dateISO}.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) return { date: dateISO, hrvDailyRmssd: null, hrvDeepRmssd: null };

  const j = await r.json();
  const first = Array.isArray(j?.hrv) ? j.hrv[0] : null;
  const value = first?.value || null;

  return {
    date: dateISO,
    hrvDailyRmssd: value?.dailyRmssd ?? null,
    hrvDeepRmssd: value?.deepRmssd ?? null,
  };
}

async function fetchHrvRange(accessToken, startISO, endISO) {
  const dates = eachDateISO(startISO, endISO);
  const out = [];
  const BATCH = 6;

  for (let i = 0; i < dates.length; i += BATCH) {
    const chunk = dates.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (iso) => {
        try {
          return await fetchHrvByDate(accessToken, iso);
        } catch {
          return { date: iso, hrvDailyRmssd: null, hrvDeepRmssd: null };
        }
      })
    );
    out.push(...results);
  }

  return out;
}

function seriesToMap(arr, valueKey = "value") {
  const m = new Map();
  if (!Array.isArray(arr)) return m;
  for (const p of arr) {
    const date = p?.dateTime ?? p?.date;
    const raw = p?.[valueKey];
    const n = Number(raw);
    m.set(date, Number.isFinite(n) ? n : null);
  }
  return m;
}

export async function onRequestGet({ env, request }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) return new Response("Not connected. Visit /fitbit/login", { status: 401 });

  let tokens = JSON.parse(raw);
  tokens = await refreshIfNeeded(env, tokens);

  const url = new URL(request.url);
  const days = clampDays(url.searchParams.get("days"));
  const endParam = url.searchParams.get("end");
  const endISO = isISODate(endParam) ? endParam : toISODateLocal(new Date());

  const { startISO, endISO: resolvedEndISO } = rangeFromEndISO(days, endISO);
  const accessToken = tokens.access_token;

  // Fetch core timeseries
  const [stepsRes, caloriesRes, heartRes, sleepQualityArr, hrvArr] = await Promise.all([
    fitbitGet(accessToken, `/1/user/-/activities/steps/date/${startISO}/${resolvedEndISO}.json`),
    fitbitGet(accessToken, `/1/user/-/activities/calories/date/${startISO}/${resolvedEndISO}.json`),
    fitbitGet(accessToken, `/1/user/-/activities/heart/date/${startISO}/${resolvedEndISO}.json`),
    fetchSleepRange(accessToken, startISO, resolvedEndISO),
    fetchHrvRange(accessToken, startISO, resolvedEndISO),
  ]);

  const stepsMap = seriesToMap(stepsRes?.["activities-steps"], "value");
  const caloriesMap = seriesToMap(caloriesRes?.["activities-calories"], "value");

  // Heart response isn’t a simple {value}; it’s { value: { restingHeartRate } }
  const rhrMap = new Map();
  if (Array.isArray(heartRes?.["activities-heart"])) {
    for (const d of heartRes["activities-heart"]) {
      const date = d?.dateTime;
      const n = Number(d?.value?.restingHeartRate);
      rhrMap.set(date, Number.isFinite(n) ? n : null);
    }
  }

  const sleepMap = new Map();
  for (const s of sleepQualityArr || []) sleepMap.set(s.date, s.value);

  const hrvMap = new Map();
  for (const h of hrvArr || []) hrvMap.set(h.date, h);

  // ✅ Build day objects (this matches what your frontend expects)
  const dates = eachDateISO(startISO, resolvedEndISO);
  const data = dates.map((date) => {
    const h = hrvMap.get(date);
    return {
      date,
      steps: stepsMap.get(date) ?? null,
      caloriesOut: caloriesMap.get(date) ?? null,
      restingHeartRate: rhrMap.get(date) ?? null,

      // metric key your UI uses
      sleepQualityScore: sleepMap.get(date) ?? null,

      // ✅ HRV fields
      hrvDailyRmssd: h?.hrvDailyRmssd ?? null,
      hrvDeepRmssd: h?.hrvDeepRmssd ?? null,
    };
  });

  return Response.json({
    days,
    start: startISO,
    end: resolvedEndISO,
    data,
  });
}
