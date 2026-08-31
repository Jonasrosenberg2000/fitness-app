# All In One Fitness AI app

This project contains a fitness app frontend and an AI backend that supports:

- local Ollama usage for private testing
- OpenAI-compatible online cloud AI for public/global use
- automatic fallback when no AI provider is available

## Local development

1. Open a terminal in the project folder.
2. Start the server:

   python server.py

3. Open the app in a browser:

   http://localhost:8000

4. The app will call the local AI endpoint at:

   http://127.0.0.1:11434/api/chat

## Public/global deployment

Set environment variables before starting the app:

- PORT
- OPENAI_API_KEY
- OPENAI_BASE_URL
- OPENAI_MODEL

Example:

```bash
export PORT=8000
export OPENAI_API_KEY=your_key_here
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
python server.py
```

When OPENAI_API_KEY is present, the backend prefers the public OpenAI-compatible provider and falls back to the local Ollama model if needed.

Before deploying publicly, set all secrets in the hosting provider's environment settings. Never upload `.env` or `.withings_tokens.json`. Set `REDIRECT_URI` to the public HTTPS callback URL, for example `https://your-domain.example/api/provider/callback`, and register exactly that URL in the Withings Developer Portal.

## API endpoints

- GET /api/health
- GET /api/auth/session
- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/exchange
- POST /api/auth/logout
- GET /api/billing/status
- POST /api/billing/checkout
- POST /api/billing/confirm
- POST /api/billing/portal
- POST /api/billing/webhook
- POST /api/coach

The local AI is shared by users who open the app through the same running server. Each browser sends its own app context with the question; the backend does not keep a shared conversation history.

To allow another device on the same Wi-Fi to use the local AI, keep `server.py` running on the computer and open the computer's LAN address, for example `http://192.168.8.109:8001`. Ollama must be running on the server computer for full AI answers; otherwise the app returns a local fallback response.

The /api/coach endpoint expects a JSON body like:

```json
{
  "question": "Hvordan kan jeg forbedre min søvn og restitution?",
  "context": {
    "profile": { "name": "Maja" }
  }
}
```

## Deployment tips

This app is ready to be deployed to platforms such as Render, Railway, Fly.io, or a VPS.

The simplest public setup is:

- host the app on a public server
- set the OpenAI API key in the environment
- keep the app behind HTTPS
- let users connect to the deployed URL

This gives every user access to the same AI backend from anywhere in the world.

### Railway

Create a Railway service from this repository. Railway can use `railway.json` and start the app with `python server.py`. Add the variables from `.env.example` in Railway's Variables panel. Set `PORT` to Railway's provided port, set `REDIRECT_URI` to the generated public HTTPS URL plus `/api/provider/callback`, and register that exact callback in the Withings Developer Portal. Add a persistent volume or database before using the service for real users, so user tokens and data survive deployments.

For this deployment, configure these Railway variables directly in the Railway dashboard:

```text
OPENAI_API_KEY=<secret>
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://zrkhdtyoaukwjyaaokzq.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
WITHINGS_CLIENT_ID=<secret>
WITHINGS_CLIENT_SECRET=<secret>
OAUTH_STATE_SECRET=<long-random-secret>
REDIRECT_URI=https://web-production-2385a.up.railway.app/api/provider/callback
TOKEN_STORE_PATH=/data/withings_tokens.json
```

Use an OpenAI-compatible model with image input for the three-angle physique analysis. Mount a Railway volume at `/data`; the backend stores Withings refresh tokens there and renews expired access tokens automatically. In the Withings Developer Portal, register the callback URL exactly as shown above. Never paste secret values into source files, commits, issue descriptions, or chat messages.

## Pro subscription

Pro access is protected by server-side checks. Users can choose 20 DKK per week, 39 DKK per month, or 468 DKK per year. The annual offer is 40 percent off the first year, so the first payment is 280.80 DKK; after 12 months it renews automatically at the full 468 DKK yearly price. All plans include 60 app-focused coach messages and 4 three-angle physique analyses per month, linear workout progression, and connected health data such as Withings. Workout logging, food/kcal tracking, manual body weight, and personal progress photos remain available without Pro; AI photo assessment requires Pro.

Set `OWNER_USER_ID` to the owner's verified Supabase user UUID to grant that single account permanent Pro access without a Stripe subscription. Never implement owner access with a browser flag or an email stored in frontend code.

### Supabase login

Pro access belongs to a verified Supabase user UUID, so the same account can restore its subscription on another device. The browser sends email and password only to this backend; access and refresh tokens are stored in `HttpOnly`, `SameSite=Lax` cookies. After email confirmation, the app immediately exchanges Supabase's redirect token for the same cookies and removes it from the URL. Never configure `SUPABASE_PUBLISHABLE_KEY` with a Supabase secret or `service_role` key.

Use the project's existing default publishable key and configure Supabase Authentication with:

```text
Site URL: https://web-production-2385a.up.railway.app
Redirect URL: https://web-production-2385a.up.railway.app
Local redirect URL: http://localhost:8010
```

Keep email confirmation enabled for production. The account currently restores Pro access and quotas across devices; workout, food, weight, and photo records remain local to each browser unless the user exports/imports a backup.

Create these recurring Stripe Prices under the same Pro product:

- weekly: 20 DKK every week
- monthly: 39 DKK every month
- annual: 468 DKK every year

Create a Stripe Coupon with `percent_off=40` and `duration=once`. The backend verifies the annual interval, 468 DKK amount, 40 percent discount, and `once` duration before it creates Checkout or an annual plan switch. This makes the first annual invoice 280.80 DKK while later annual invoices use the full 468 DKK price.

Enable subscription updates in the Stripe Customer Portal and make all three Prices available as switch targets. The app uses Stripe's `subscription_update_confirm` flow so Stripe shows prorations, handles payment failures and 3D Secure, and applies the 40 percent Coupon when an existing subscriber switches to annual. Add these Railway variables:

```text
STRIPE_SECRET_KEY=<secret>
STRIPE_PRICE_ID=<price_...>
STRIPE_WEEKLY_PRICE_ID=<price_...>
STRIPE_ANNUAL_PRICE_ID=<price_...>
STRIPE_ANNUAL_DISCOUNT_COUPON_ID=<coupon-id>
STRIPE_WEBHOOK_SECRET=<whsec_...>
STRIPE_PORTAL_CONFIGURATION_ID=<bpc_...>
PUBLIC_APP_URL=https://web-production-2385a.up.railway.app
BILLING_STORE_PATH=/data/billing.json
PRO_COACH_MONTHLY_LIMIT=60
PRO_VISION_MONTHLY_LIMIT=4
OPENAI_MAX_OUTPUT_TOKENS=900
MAX_COACH_REQUEST_BYTES=12582912
OWNER_USER_ID=<owner-supabase-user-uuid>
RATE_LIMIT_WINDOW_SECONDS=60
AUTH_BURST_LIMIT=10
BILLING_BURST_LIMIT=20
COACH_BURST_LIMIT=10
RATE_LIMIT_MAX_BUCKETS=4096
```

Register `https://web-production-2385a.up.railway.app/api/billing/webhook` as a Stripe webhook for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Keep Stripe test keys and live keys separate; use test mode until checkout, renewal, cancellation, and quota enforcement have all been verified.

### Side-by-side Stripe test environment

Run payment tests in a separate Railway service or environment with its own domain and volume. Do not share production's billing volume. Set these variables on the test service:

```text
BILLING_ENVIRONMENT=test
PUBLIC_APP_URL=https://<test-service>.up.railway.app
BILLING_STORE_PATH=/data/billing-test.json
OWNER_USER_ID=
STRIPE_SECRET_KEY=<sk_test_...>
STRIPE_PRICE_ID=<test monthly price_...>
STRIPE_WEEKLY_PRICE_ID=<test weekly price_...>
STRIPE_ANNUAL_PRICE_ID=<test annual price_...>
STRIPE_ANNUAL_DISCOUNT_COUPON_ID=<test coupon id>
STRIPE_WEBHOOK_SECRET=<test whsec_...>
STRIPE_PORTAL_CONFIGURATION_ID=<optional test bpc_...>
```

Create the product, three recurring prices, first-year coupon, portal configuration, and webhook while the Stripe Dashboard is in test mode. Register `https://<test-service>.up.railway.app/api/billing/webhook` for the same three events as production. Add the test service URL to Supabase Authentication's allowed redirect URLs, or use a separate Supabase test project for full isolation.

The server refuses to start when `BILLING_ENVIRONMENT=test` is combined with a live Stripe key or the production `PUBLIC_APP_URL`. The UI also shows `STRIPE TEST · INGEN RIGTIGE BETALINGER`. Use Stripe's standard test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Verify Free access before checkout, Pro access after checkout, continued access while cancellation is pending, and removal after the test subscription is deleted.

For a local sidecar, copy `.env.test.example` to the ignored `.env.test`, fill it with test-only values, then run:

```powershell
$env:ENV_FILE='.env.test'
py -3 server.py
```

Run the isolated billing regression suite with `py -3 -m unittest discover -s tests -v`.

Cookie-authenticated mutation routes enforce same-origin requests and per-client burst limits. Stripe webhooks are exempt from browser-origin checks and instead require Stripe signature verification.

### Monthly Pro updates

The Pro page includes a monthly release feed. Active Pro members receive a one-time in-app notice when the latest release ID changes, while Free users can see the same update as a preview. Add each real monthly release to the end of `proMonthlyDrops` in `app.js` with a unique ID such as `2026-09-feature-name`, its month, title, and a short description.
