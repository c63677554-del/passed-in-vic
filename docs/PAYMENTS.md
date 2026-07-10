# Payments provider decision (researched 10 Jul 2026)

## Decision: Stripe, activated through the FoundersCard benefit

| Option | Fees (AUD subscriptions) | Free-processing deal | Verdict |
| --- | --- | --- | --- |
| **Stripe** | 1.75% + A$0.30 domestic (+GST on the fee); no monthly fee | **FoundersCard: first US$20k (Standard) / US$50k (Elite) processed fee-free**; applies to new & existing accounts | ✅ chosen — best subscription tooling (Checkout, Billing portal, webhooks), and the fee waiver ≈ first ~4,000 A$4.99 charges free |
| Square | ~2.2% online | none comparable | weaker subscription/billing portal story |
| Paddle / Lemon Squeezy (merchant of record) | ~5% + fixed | none | MoR handles global tax — unnecessary below the A$75k GST threshold, at ~3× the fees |
| PayPal subscriptions | 2.6%+ | none | higher fees, clunkier checkout, weaker dev tooling |

## The FoundersCard specifics
- Benefit: waived Stripe processing fees — US$20,000 (Standard membership) or
  US$50,000 (Elite) of volume.
- Works for new and existing Stripe accounts; activate via the FoundersCard
  portal **before** creating the account so the credit attaches cleanly.
- At Passd's blended ~A$4.20/sub/month, US$20k ≈ the first ~7,000 subscriber-months
  of processing — realistically the first 1–2 years fee-free.

## Sources
- FoundersCard startup pack: https://founderscard.com/articles/Startuppack
- Deal listing (waived fees on next $20k): https://www.joinsecret.com/stripe
- Independent FoundersCard review (12-yr member, 2026): https://www.indiehackers.com/post/founders-card-benefits-review-a-12-year-members-honest-take-in-2026-d13cd4a580
- Stripe AU pricing: https://stripe.com/pricing · https://wise.com/au/blog/stripe-fees
- Stripe Startups FAQ: https://support.stripe.com/questions/stripe-startups-program-faqs
