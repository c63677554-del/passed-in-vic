// portal - opens the Stripe customer billing portal (manage/cancel subscription)
// for the signed-in user. verify_jwt=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "not signed in" }, 401);

  const sk = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const { data: sub } = await admin.from("subscribers").select("stripe_customer_id, dev_grant").eq("user_id", user.id).maybeSingle();
  if (!sk || !sub?.stripe_customer_id) return json({ preview: true, devGrant: !!sub?.dev_grant });

  const { returnUrl } = await req.json().catch(() => ({ returnUrl: "" }));
  const site = (returnUrl || Deno.env.get("SITE_URL") || "https://c63677554-del.github.io/passed-in-vic/").split("#")[0];
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + sk, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer: sub.stripe_customer_id, return_url: site }),
  });
  const body = await res.json();
  if (!res.ok) return json({ error: body?.error?.message || "portal error" }, 502);
  return json({ url: body.url });
});
