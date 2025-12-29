async function refreshIfNeeded(env, tokens) {
  const expiresMs = (tokens.expires_in ?? 0) * 1000;
  const age = Date.now() - (tokens.obtained_at ?? 0);
  const shouldRefresh = !tokens.access_token || (expiresMs && age > expiresMs - 60_000);

  if (!shouldRefresh) return tokens;

  const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`)}`,
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

function daysAgoISO(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startISO: toISODateLocal(start), endISO: toISODateLocal(end) };
}

// Convert Fitbit timeseries array to {date,value}[]
function mapSeries(arr, valueKey = "value") {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => ({
    date: p.dateTime,
    value: Number.isFinite(Number(p[valueKey])) ? Number(p[valueKey]) : null,
  }));
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

/**
 * Sleep range strategy:
 * - Fitbit does NOT provide sleep as a timeseries endpoint like steps.
 * - We fetch /1.2/user/-/sleep/date/<ISO>.json for each date in the range.
 * - "Sleep Quality" value uses: sleep score if present, else efficiency, else null.
 */
async function fetchSleepForDate(accessToken, iso) {
  const res = await fitbitGet(accessToken, `/1.2/user/-/sleep/date/${iso}.json`);
  const first = Array.isArray(res?.sleep) ? res.sleep[0] : null;

  // Prefer sleep score if available (some accounts/devices)
  // Different payloads may expose score differently; we try a few common shapes.
  const score =
    first?.levels?.summary?.score ??
    first?.score?.sleepScore ??
    res?.summary?.sleepScore ??
    res?.sleep?.[0]?.score?.sleepScore;

  if (Number.isFinite(Number(score))) return Number(score);

  // Fallback: efficiency (0-100)
  const eff = first?.efficiency ?? res?.summary?.efficiency;
  if (Number.isFinite(Number(eff))) return Number(eff);

  return null;
}

async function fetchSleepRange(accessToken, startISO, endISO) {
  const dates = eachDateISO(startISO, endISO);

  // Fetch in small batches to avoid hammering Fitbit
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

export async function onRequestGet({ env, request }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) return new Response("Not connected. Visit /fitbit/login", { status: 401 });

  let tokens = JSON.parse(raw);
  tokens = await refreshIfNeeded(env, tokens);

  const url = new URL(request.url);
  const days = clampDays(url.searchParams.get("days"));
  const { startISO, endISO } = daysAgoISO(days);

  const [stepsRes, caloriesRes, heartRes, sleepQuality] = await Promise.all([
    fitbitGet(tokens.access_token, `/1/user/-/activities/steps/date/${startISO}/${endISO}.json`),
    fitbitGet(tokens.access_token, `/1/user/-/activities/calories/date/${startISO}/${endISO}.json`),
    fitbitGet(tokens.access_token, `/1/user/-/activities/heart/date/${startISO}/${endISO}.json`),
    fetchSleepRange(tokens.access_token, startISO, endISO),
  ]);

  const steps = mapSeries(stepsRes?.["activities-steps"], "value");
  const caloriesOut = mapSeries(caloriesRes?.["activities-calories"], "value");

  const restingHeartRate = Array.isArray(heartRes?.["activities-heart"])
    ? heartRes["activities-heart"].map((d) => ({
        date: d.dateTime,
        value: Number.isFinite(Number(d?.value?.restingHeartRate))
          ? Number(d.value.restingHeartRate)
          : null,
      }))
    : [];

  return Response.json({
    days,
    start: startISO,
    end: endISO,
    data: {
      steps,
      caloriesOut,
      restingHeartRate,
      // "Sleep Quality" series: score if present, else efficiency
      sleepQuality,
    },
  });
}
