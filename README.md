# XELRFUE website

Static company and brand website for XELRFUE, including the public privacy and
data-retention disclosures used for the company's internal Amazon Ads analytics
application.

## Local preview

Serve this directory with any static HTTP server. No build step is required.

## Deployment

- Platform: Cloudflare Pages
- Build command: none
- Build output directory: `/`
- Production branch: `main`
- Custom domains: `xelrfue.com`, `www.xelrfue.com`

API credentials and account tokens must never be committed to this repository.

## Mahjong preview feedback

The product feedback page is available at `/mahjong-preview/`.

The feedback endpoint is `/api/mahjong-feedback` and requires these Cloudflare
Pages settings before production collection:

- KV binding: `MAHJONG_FEEDBACK`
- Secret: `MAHJONG_FEEDBACK_EXPORT_TOKEN`

Submit feedback with `POST /api/mahjong-feedback`. Export CSV with
`GET /api/mahjong-feedback?token=<MAHJONG_FEEDBACK_EXPORT_TOKEN>`.

## Amazon Ads authorization

The private authorization page is available at `/auth/amazon/`. Cloudflare Pages
Functions handle the OAuth redirect and token exchange.

Configure these encrypted Pages secrets:

- `AMAZON_ADS_CLIENT_ID`
- `AMAZON_ADS_CLIENT_SECRET`

Optionally set `AMAZON_ADS_REDIRECT_URI`; it defaults to
`https://xelrfue.com/auth/amazon/callback`.

Create a Cloudflare KV namespace and bind it to the Pages project as
`AMAZON_ADS_TOKENS`. The refresh token is stored under the key `primary` and is
never returned to the browser or committed to Git.
