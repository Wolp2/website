function basicAuth(clientId, clientSecret) {
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code/state (did you start at /fitbit/login?)", { status: 400 });
    }

    const expected = await env.FITBIT_KV.get("oauth_state");
    if (!expected || expected !== state) {
      return new Response("Bad state", { status: 400 });
    }

    const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth(env.FITBIT_CLIENT_ID, env.FITBIT_CLIENT_SECRET)}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.FITBIT_REDIRECT_URI
      })
    });

    const text = await tokenRes.text();
    if (!tokenRes.ok) return new Response(`Token exchange failed:\n${text}`, { status: 500 });

    const tokenJson = JSON.parse(text);

    await env.FITBIT_KV.put("fitbit_tokens", JSON.stringify({
      ...tokenJson,
      obtained_at: Date.now()
    }));

    return Response.redirect("/", 302);
  } catch (err) {
    return new Response(`Callback crashed:\n${err?.stack || err}`, { status: 500 });
  }
}
