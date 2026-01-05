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
  if (!res.ok) {
    throw new Error(`Fitbit API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
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

/** HRV Summary by Date */
async function fetchHrvByDate(accessToken, dateISO) {
  const r = await fetch(
    `https://api.fitbit.com/1/user/-/hrv/date/${dateISO}.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!r.ok) {
    // HRV can be unavailable; treat as optional
    return { hrvDailyRmssd: null, hrvDeepRmssd: null };
  }

  const j = await r.json();
  const first = Array.isArray(j?.hrv) ? j.hrv[0] : null;
  const value = first?.value || null;

  return {
    hrvDailyRmssd: value?.dailyRmssd ?? null,
    hrvDeepRmssd: value?.deepRmssd ?? null,
  };
}

export async function onRequestGet({ env, request }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) {
    return new Response("Not connected. Visit /fitbit/login", { status: 401 });
  }

  let tokens = JSON.parse(raw);
  tokens = await refreshIfNeeded(env, tokens);

  // Allow: /fitbit/today?date=YYYY-MM-DD
  const url = new URL(request.url);
  const qDate = url.searchParams.get("date");
  const day = isISODate(qDate) ? qDate : toISODateLocal(new Date());

  const accessToken = tokens.access_token;

  const activity = await fitbitGet(accessToken, `/1/user/-/activities/date/${day}.json`);
  const hr = await fitbitGet(accessToken, `/1/user/-/activities/heart/date/${day}/1d.json`);
  const sleepList = await fitbitGet(
    accessToken,
    `/1.2/user/-/sleep/list.json?beforeDate=${day}&sort=desc&offset=0&limit=10`
  );

  let sleepScore = null;
  for (const s of sleepList?.sleep ?? []) {
    if (s?.dateOfSleep !== day) continue;

    const rawScore = s?.score?.overall ?? s?.score?.score ?? null;
    const score = Number(rawScore);
    if (!Number.isFinite(score)) continue;

    if (sleepScore == null || score > sleepScore) sleepScore = score;
  }

  // ✅ HRV (optional)
  const hrv = await fetchHrvByDate(accessToken, day);

  return Response.json({
    date: day,
    caloriesOut: activity?.summary?.caloriesOut ?? null,
    steps: activity?.summary?.steps ?? null,
    restingHeartRate:
      hr?.["activities-heart"]?.[0]?.value?.restingHeartRate ?? null,
    heartRateZones:
      hr?.["activities-heart"]?.[0]?.value?.heartRateZones ?? null,

    // keep your existing key name (your frontend expects sleepQualityScore)
    sleepQualityScore: sleepScore,

    // ✅ NEW
    hrvDailyRmssd: hrv.hrvDailyRmssd,
    hrvDeepRmssd: hrv.hrvDeepRmssd,
  });
}
