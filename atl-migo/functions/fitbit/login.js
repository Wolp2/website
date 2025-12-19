export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  const state = crypto.randomUUID();
  await env.FITBIT_KV.put("oauth_state", state, { expirationTtl: 600 });

  const scopes = [
    "activity",
    "heartrate",
    "profile"
  ].join(" ");

  const auth = new URL("https://www.fitbit.com/oauth2/authorize");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", env.FITBIT_CLIENT_ID);
  auth.searchParams.set("redirect_uri", env.FITBIT_REDIRECT_URI);
  auth.searchParams.set("scope", scopes);
  auth.searchParams.set("state", state);

  return Response.redirect(auth.toString(), 302);
}
