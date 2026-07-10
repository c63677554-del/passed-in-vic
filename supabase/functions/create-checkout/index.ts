// create-checkout — starts a Stripe Checkout session (7-day trial) for the
// signed-in user. If Stripe secrets aren't configured yet, falls back to a
// clearly-flagged preview grant (7-day dev trial) when ALLOW_PREVIEW_GRANTS=true.
// Deployed with verify_jwt=true: only authenticated users reach this.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function stripe(path: string, params: Record<string, string>, key: string) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || "Stripe error");
  return body;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "not signed in" }, 401);

  const { plan, returnUrl } = await req.json().catch(() => ({ plan: "annual", returnUrl: "" }));
  const site = (returnUrl || Deno.env.get("SITE_URL") || "https://c63677554-del.github.io/passed-in-vic/").split("#")[0];

  const sk = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const priceMonthly = Deno.env.get("STRIPE_PRICE_MONTHLY") || "";
  const priceAnnual = Deno.env.get("STRIPE_PRICE_ANNUAL") || "";

  if (!sk || !priceMonthly || !priceAnnual) {
    // ---- preview mode (Stripe not wired yet) ----
    if ((Deno.env.get("ALLOW_PREVIEW_GRANTS") || "").toLowerCase() !== "true")
      return json({ error: "payments not configured" }, 503);
    const end = new Date(Date.now() + 7 * 864e5).toISOString();
    await admin.from("subscribers").upsert(
      { user_id: user.id, email: user.email, status: "trialing", plan, current_period_end: end, dev_grant: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return json({ preview: true, trialEnd: end });
  }

  // Reuse or create the Stripe customer for this user.
  const { data: existing } = await admin.from("subscribers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  let customer = existing?.stripe_customer_id;
  if (!customer) {
    const c = await stripe("customers", { email: user.email || "", "metadata[user_id]": user.id }, sk);
    customer = c.id;
    await admin.from("subscribers").upsert(
      { user_id: user.id, email: user.email, stripe_customer_id: customer, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  }

  const session = await stripe("checkout/sessions", {
    mode: "subscription",
    customer: customer!,
    client_reference_id: user.id,
    "line_items[0][price]": plan === "monthly" ? priceMonthly : priceAnnual,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "7",
    allow_promotion_codes: "true",
    success_url: site + "#sub=success",
    cancel_url: site + "#sub=cancelled",
  }, sk);

  return json({ url: session.url });
});
