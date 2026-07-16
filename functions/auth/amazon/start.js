const DEFAULT_REDIRECT_URI = "https://xelrfue.com/auth/amazon/callback";
const AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
const STATE_COOKIE = "amazon_ads_oauth_state";

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ env }) {
  if (!env.AMAZON_ADS_CLIENT_ID || !env.AMAZON_ADS_CLIENT_SECRET || !env.AMAZON_ADS_TOKENS) {
    return new Response("Amazon Ads authorization is not configured.", { status: 503 });
  }

  const redirectUri = env.AMAZON_ADS_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const state = randomState();
  const authorizationUrl = new URL(AUTHORIZE_URL);

  authorizationUrl.searchParams.set("client_id", env.AMAZON_ADS_CLIENT_ID);
  authorizationUrl.searchParams.set("scope", "advertising::campaign_management");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/auth/amazon; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
