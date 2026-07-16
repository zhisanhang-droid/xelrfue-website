const DEFAULT_REDIRECT_URI = "https://xelrfue.com/auth/amazon/callback";
const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const STATE_COOKIE = "amazon_ads_oauth_state";

function cookieValue(cookieHeader, name) {
  for (const item of (cookieHeader || "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function htmlResponse(title, message, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} | XELRFUE</title>
<link rel="stylesheet" href="/styles.css"></head><body><main class="auth-page"><section class="auth-card">
<p class="section-label">Amazon Ads authorization</p><h1>${title}</h1><p>${message}</p><a class="button" href="/">Return home</a>
</section></main></body></html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=; Path=/auth/amazon; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.AMAZON_ADS_CLIENT_ID || !env.AMAZON_ADS_CLIENT_SECRET || !env.AMAZON_ADS_TOKENS) {
    return htmlResponse("Configuration required", "The server-side authorization settings are incomplete.", 503);
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return htmlResponse("Authorization cancelled", "Amazon did not grant access to the advertising account.", 400);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request.headers.get("Cookie"), STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return htmlResponse("Authorization failed", "The authorization response could not be verified. Please start again.", 400);
  }

  const redirectUri = env.AMAZON_ADS_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.AMAZON_ADS_CLIENT_ID,
    client_secret: env.AMAZON_ADS_CLIENT_SECRET,
    redirect_uri: redirectUri,
  });

  let tokenResponse;
  try {
    tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
  } catch {
    console.error("Amazon Ads OAuth failed at stage TOKEN_REQUEST");
    return htmlResponse(
      "Authorization failed",
      "The server could not reach Amazon's token service (stage TOKEN_REQUEST). Please start again.",
      502,
    );
  }

  let token;
  try {
    const responseText = await tokenResponse.text();
    token = JSON.parse(responseText);
  } catch {
    console.error("Amazon Ads OAuth failed at stage TOKEN_RESPONSE");
    return htmlResponse(
      "Authorization failed",
      "Amazon returned an unreadable token response (stage TOKEN_RESPONSE). Please start again.",
      502,
    );
  }

  if (!tokenResponse.ok) {
    const errorCode = typeof token.error === "string" ? token.error : "unknown_error";
    console.error(`Amazon Ads OAuth rejected at stage TOKEN_EXCHANGE: ${errorCode}`);
    return htmlResponse(
      "Authorization failed",
      `Amazon rejected the token exchange (stage TOKEN_EXCHANGE: ${errorCode}). Please start again.`,
      400,
    );
  }

  if (!token.refresh_token) {
    console.error("Amazon Ads OAuth failed at stage REFRESH_TOKEN");
    return htmlResponse(
      "Authorization failed",
      "Amazon did not return a long-term authorization token (stage REFRESH_TOKEN). Please start again.",
      502,
    );
  }

  try {
    await env.AMAZON_ADS_TOKENS.put(
      "primary",
      JSON.stringify({
        refreshToken: token.refresh_token,
        scope: token.scope || "advertising::campaign_management",
        connectedAt: new Date().toISOString(),
      }),
    );
  } catch {
    console.error("Amazon Ads OAuth failed at stage TOKEN_STORAGE");
    return htmlResponse(
      "Authorization failed",
      "The long-term token could not be stored (stage TOKEN_STORAGE). Please start again.",
      502,
    );
  }

  return htmlResponse(
    "Account connected",
    "Amazon Ads authorization was completed and the long-term token was stored securely. You may close this page.",
  );
}
