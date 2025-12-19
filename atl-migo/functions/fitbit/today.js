async function refreshIfNeeded(env, tokens) {
  const expiresMs = (tokens.expires_in ?? 0) * 1000;
  const age = Date.now() - (tokens.obtained_at ?? 0);
  const shouldRefresh = !tokens.access_token || (expiresMs && age > (expiresMs - 60_000));

  if (!shouldRefresh) return tokens;

  const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    })
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
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Fitbit API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function onRequestGet({ env }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) return new Response("Not connected. Visit /fitbit/login", { status: 401 });

  let tokens = JSON.parse(raw);
  tokens = await refreshIfNeeded(env, tokens);

  // Example endpoints (we’ll refine):
  // - Calories out often comes from activity summary/time series (see Fitbit API explorer). :contentReference[oaicite:2]{index=2}
  // - Heart rate intraday exists (if you want intraday charts). :contentReference[oaicite:3]{index=3}
  const today = new Date().toISOString().slice(0, 10);

  const activity = await fitbitGet(tokens.access_token, `/1/user/-/activities/date/${today}.json`);
  const hr = await fitbitGet(tokens.access_token, `/1/user/-/activities/heart/date/${today}/1d.json`);

  return Response.json({
    date: today,
    caloriesOut: activity?.summary?.caloriesOut,
    steps: activity?.summary?.steps,
    restingHeartRate: hr?.["activities-heart"]?.[0]?.value?.restingHeartRate,
    heartRateZones: hr?.["activities-heart"]?.[0]?.value?.heartRateZones
  });
}
