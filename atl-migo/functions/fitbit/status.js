async function refreshIfNeeded(env, tokens) {
  const expiresMs = (tokens.expires_in ?? 0) * 1000;
  const age = Date.now() - (tokens.obtained_at ?? 0);
  const shouldRefresh = !tokens.access_token || (expiresMs && age > (expiresMs - 60_000));

  if (!shouldRefresh) return tokens;
  if (!tokens.refresh_token) throw new Error("Missing refresh_token");

  const auth = btoa(`${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`);

  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    })
  });

  if (!res.ok) throw new Error(await res.text());

  const refreshed = await res.json();
  const merged = { ...tokens, ...refreshed, obtained_at: Date.now() };

  await env.FITBIT_KV.put("fitbit_tokens", JSON.stringify(merged));
  return merged;
}

export async function onRequestGet({ env }) {
  const raw = await env.FITBIT_KV.get("fitbit_tokens");
  if (!raw) {
    return Response.json({ connected: false, lastSyncTime: null }, { status: 200 });
  }

  let tokens = JSON.parse(raw);

  try {
    tokens = await refreshIfNeeded(env, tokens);
  } catch (e) {
    // tokens are busted; treat as disconnected
    return Response.json({ connected: false, lastSyncTime: null, error: String(e) }, { status: 200 });
  }

  // Fitbit "last sync" is easiest via devices endpoint
  const devRes = await fetch("https://api.fitbit.com/1/user/-/devices.json", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!devRes.ok) {
    return Response.json(
      { connected: true, lastSyncTime: null, error: await devRes.text() },
      { status: 200 }
    );
  }

  const devices = await devRes.json();
  const lastSyncTime =
    devices?.map(d => d.lastSyncTime).filter(Boolean).sort().at(-1) ?? null;

  // Optional: cache it for quick display later
  if (lastSyncTime) await env.FITBIT_KV.put("fitbit_last_sync", lastSyncTime);

  return Response.json({ connected: true, lastSyncTime }, { status: 200 });
}
