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

function daysAgoISO(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startISO: toISODateLocal(start), endISO: toISODateLocal(end) };
}

function mapSeries(arr, valueKey = "value") {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => ({
    date: p.dateTime,
    value: Number.isFinite(Number(p?.[valueKey])) ? Number(p[valueKey]) : null,
  }));
}

export async function onRequestGet({ env, request }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) return new Response("Not connected. Visit /fitbit/login", { status: 401 });

  let tokens = JSON.parse(raw);
  tokens = await refreshIfNeeded(env, tokens);

  const url = new URL(request.url);
  const days = clampDays(url.searchParams.get("days"));
  const { startISO, endISO } = daysAgoISO(days);

  // Steps & calories out via activity timeseries endpoints
  const stepsRes = await fitbitGet(
    tokens.access_token,
    `/1/user/-/activities/steps/date/${startISO}/${endISO}.json`
  );

  const caloriesRes = await fitbitGet(
    tokens.access_token,
    `/1/user/-/activities/calories/date/${startISO}/${endISO}.json`
  );

  // Resting HR via heart endpoint (daily objects, each may include restingHeartRate)
  const heartRes = await fitbitGet(
    tokens.access_token,
    `/1/user/-/activities/heart/date/${startISO}/${endISO}.json`
  );

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
    },
  });
}
