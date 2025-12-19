function b64(s) {
  return btoa(s);
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code/state. Start at /fitbit/login", { status: 400 });
  }

  const expected = await env.FITBIT_KV.get("oauth_state");
  if (!expected || expected !== state) {
    return new Response("Bad state", { status: 400 });
  }

  const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${b64(`${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.FITBIT_REDIRECT_URI
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Token exchange failed: ${err}`, { status: 500 });
  }

  const tokenJson = await tokenRes.json();

  await env.FITBIT_KV.put("fitbit_tokens", JSON.stringify({
    ...tokenJson,
    obtained_at: Date.now()
  }));

  const home = new URL("/", env.APP_BASE_URL).toString();
  return Response.redirect(home, 302);
}
