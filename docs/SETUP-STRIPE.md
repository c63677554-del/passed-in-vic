# Stripe setup (≈20 min) - activate the FoundersCard deal FIRST

## 0. FoundersCard benefit (do this before anything else)
FoundersCard's Stripe deal waives processing fees on your first **US$20,000**
(Standard) or **US$50,000** (Elite) - and applies to new AND existing accounts.
Activate it through the FoundersCard member portal (search "Stripe" in benefits)
and follow its enrolment link so the credit attaches to the account you create.
At Stripe AU's 1.75% + A$0.30, that's roughly your first ~4,000 subscription
charges processed free.

## 1. Create the Stripe account
https://dashboard.stripe.com/register - business details, AUD as default
currency, bank account for payouts. (ABN: sole trader is fine to start.
GST: not required below A$75k turnover.)

## 2. Create the products - ✅ DONE (via Stripe MCP, 10 Jul 2026, live mode)
| Product | Price | Billing | Live ID |
| --- | --- | --- | --- |
| Passd (`prod_UrJ4t2hwMyb1tQ`) | **A$4.99** | Recurring, monthly | `price_1TraS8K5F6xN5RVXszhT1Idp` |
| Passd (`prod_UrJ4t2hwMyb1tQ`) | **A$39.99** | Recurring, yearly | `price_1TraSKK5F6xN5RVXWerKnheQ` |

Both IDs are already filled into `.passd-backend.env`. No trial configuration
needed on the prices - the checkout session sets `trial_period_days: 7` itself.

## 3. Webhook
Developers → Webhooks → **Add endpoint**:
- URL: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_...`).

## 4. Customer portal (for Manage billing)
Settings → Billing → Customer portal → enable; allow plan switching and
cancellation. Save.

## 5. Keys → env file → redeploy
Developers → API keys → copy the **Secret key** (`sk_live_...`), then append to
`C:\Users\Nzcof\passed-in-vic\.passd-backend.env`:
```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_ANNUAL=price_xxx
```
and rerun:
```powershell
cd C:\Users\Nzcof\passed-in-vic
.\scripts\deploy-backend.ps1
```
This disables preview grants - from now on "Start 7-day free trial" goes
through Stripe Checkout (card collected up front, charged on day 8 unless
cancelled; promo codes enabled).

## 6. Test the full loop (use Test mode keys first if you like)
Sign in with a fresh email → Start trial → Stripe Checkout → pay with test card
`4242 4242 4242 4242` → redirected back with "Trial started" → all weeks +
guides visible → Account → Manage billing opens the Stripe portal → cancel →
access ends at period end. Existing preview-trial users are unaffected until
their 7 days lapse, then they'll be prompted to subscribe properly.

## Where money lands
Stripe pays out to your bank on a rolling 2-day schedule (AU). Dashboard →
Balance shows MRR building up. Revenue expectations: PAYWALL_STRATEGY.md in the
passd-mobile repo.
