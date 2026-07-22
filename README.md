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
- Secret: `FEISHU_APP_ID`
- Secret: `FEISHU_APP_SECRET`
- Environment variable: `FEISHU_FEEDBACK_SPREADSHEET_TOKEN`
- Environment variable: `FEISHU_FEEDBACK_SHEET_ID`
- Environment variable: `FEISHU_FEEDBACK_SPREADSHEET_URL`
- Secret: `FEISHU_GROUP_BOT_WEBHOOK`
- Secret: `FEISHU_GROUP_BOT_SECRET` (optional, only when the bot has signature verification enabled)

Submit feedback with `POST /api/mahjong-feedback`. Export CSV with
`GET /api/mahjong-feedback?token=<MAHJONG_FEEDBACK_EXPORT_TOKEN>`.

When Feishu settings are configured, each feedback submission is also appended
to the Feishu feedback sheet and sent to the configured Feishu group bot. Feishu
sync failures are logged but do not block the customer-facing submission.
The Feishu sheet columns are: created time, design choice, translucency
feedback, 4-pack preference, idea, email, source, record ID, and user agent.

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
